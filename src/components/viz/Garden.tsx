import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../../data/store';
import { accentForType, TYPE_LABEL } from '../../data/mock';
import { commitsByProject } from '../../lib/stats';
import { computeStreaks } from '../../lib/streak';
import { getVisibleProjects } from '../../lib/visibility';
import { repoUrl } from '../../lib/format';
import type { Project, ProjectType } from '../../data/types';

interface GardenProps {
  filteredTypes: ProjectType[];
}

interface HoverInfo {
  x: number;
  y: number;
  project: Project;
  commits: number;
  blooms: number;
}

const VB_W = 1000;
const VB_H = 480;
const GROUND_Y = 410;

export function Garden({ filteredTypes }: GardenProps) {
  const { state } = useStore();
  const [hover, setHover] = useState<HoverInfo | null>(null);

  const visible = useMemo(
    () => getVisibleProjects(state.projects, state.commits, filteredTypes, state.preferences),
    [state.projects, state.commits, filteredTypes, state.preferences],
  );

  const counts = useMemo(() => commitsByProject(state.commits, 90), [state.commits]);
  const streak = useMemo(() => computeStreaks(state.commits), [state.commits]);

  const maxCount = Math.max(1, ...visible.map((p) => counts.get(p.id) ?? 0));
  const minStem = 80;
  const maxStem = 320;

  // Distribute projects across the width with gentle jitter.
  const positions = useMemo(() => {
    if (visible.length === 0) return [] as Array<{ project: Project; x: number; height: number; sway: number }>;
    const margin = 90;
    const usable = VB_W - margin * 2;
    const step = visible.length > 1 ? usable / (visible.length - 1) : 0;
    return visible.map((project, i) => {
      const baseX = margin + step * i;
      const seedJ = ((i * 17) % 11) - 5;
      const c = counts.get(project.id) ?? 0;
      const heightPct = c / maxCount;
      const height = minStem + heightPct * (maxStem - minStem);
      const sway = ((i * 31) % 13) - 6;
      return { project, x: baseX + seedJ * 2, height, sway };
    });
  }, [visible, counts, maxCount]);

  // shipped ideas per project
  const bloomsByProject = useMemo(() => {
    const m = new Map<string, number>();
    for (const idea of state.ideas) {
      if (idea.status !== 'shipped' || !idea.projectId) continue;
      m.set(idea.projectId, (m.get(idea.projectId) ?? 0) + 1);
    }
    return m;
  }, [state.ideas]);

  if (visible.length === 0) {
    return <EmptyState message="No projects matching the current filter." />;
  }

  return (
    <div className="ml-canvas__body ml-garden-bg" style={{ position: 'relative' }}>
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="A garden of projects, each plant grown from your commits."
      >
        <defs>
          <radialGradient id="garden-sun" cx="0.85" cy="0.1" r="0.6">
            <stop offset="0%" stopColor="rgba(255, 212, 233, 0.8)" />
            <stop offset="60%" stopColor="rgba(251, 65, 170, 0.18)" />
            <stop offset="100%" stopColor="rgba(251, 65, 170, 0)" />
          </radialGradient>
          <linearGradient id="garden-ground" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(80, 7, 48, 0.10)" />
            <stop offset="100%" stopColor="rgba(80, 7, 48, 0.32)" />
          </linearGradient>
          <filter id="soft-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>

        {/* Sun / streak rays */}
        <circle cx={VB_W * 0.85} cy={60} r={180} fill="url(#garden-sun)" />
        {streak.current > 0 && (
          <SunRays cx={VB_W * 0.85} cy={70} count={Math.min(12, 4 + streak.current)} />
        )}

        {/* Ground */}
        <rect x={0} y={GROUND_Y} width={VB_W} height={VB_H - GROUND_Y} fill="url(#garden-ground)" />
        <line x1={0} x2={VB_W} y1={GROUND_Y} y2={GROUND_Y} stroke="rgba(80, 7, 48, 0.35)" strokeWidth={1} strokeDasharray="2 4" />

        {/* Background grass tufts */}
        {Array.from({ length: 60 }).map((_, i) => {
          const x = (i / 60) * VB_W + ((i * 13) % 17);
          return (
            <path
              key={i}
              d={`M${x},${GROUND_Y} q1,-${4 + (i % 5)} 3,-${6 + (i % 7)}`}
              stroke="rgba(80, 7, 48, 0.3)"
              strokeWidth={1}
              fill="none"
            />
          );
        })}

        {/* Plants */}
        {positions.map(({ project, x, height, sway }, i) => {
          const accent = project.accent ?? accentForType(project.type);
          const blooms = bloomsByProject.get(project.id) ?? 0;
          const commits = counts.get(project.id) ?? 0;
          const tipX = x + sway;
          const tipY = GROUND_Y - height;
          const ctrlX = x + sway / 2 + 8;
          const ctrlY = GROUND_Y - height * 0.55;
          const stemPath = `M${x},${GROUND_Y} Q${ctrlX},${ctrlY} ${tipX},${tipY}`;

          // leaves: based on commit count, place along stem
          const leafCount = Math.min(6, Math.max(2, Math.round(commits / 12)));
          const leaves = Array.from({ length: leafCount }, (_, k) => {
            const t = (k + 1) / (leafCount + 1);
            const lx = x + (tipX - x) * t + (k % 2 === 0 ? -8 : 8);
            const ly = GROUND_Y - height * t;
            const dir = k % 2 === 0 ? -1 : 1;
            return { lx, ly, dir };
          });

          return (
            <motion.g
              key={project.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.05 * i, ease: [0.22, 1, 0.36, 1] }}
              style={{ cursor: 'pointer' }}
              onMouseMove={(e) =>
                setHover({
                  x: e.nativeEvent.offsetX,
                  y: e.nativeEvent.offsetY,
                  project,
                  commits,
                  blooms,
                })
              }
              onMouseLeave={() => setHover(null)}
            >
              {/* Stem shadow */}
              <path d={stemPath} stroke="rgba(20,8,16,0.25)" strokeWidth={4} fill="none" filter="url(#soft-glow)" strokeLinecap="round" />
              {/* Stem */}
              <path
                d={stemPath}
                stroke={accent}
                strokeOpacity={0.85}
                strokeWidth={2.6}
                fill="none"
                strokeLinecap="round"
              />
              {/* Leaves */}
              {leaves.map(({ lx, ly, dir }, k) => (
                <ellipse
                  key={k}
                  cx={lx + dir * 8}
                  cy={ly}
                  rx={10}
                  ry={4}
                  fill={accent}
                  fillOpacity={0.65}
                  transform={`rotate(${dir * 25} ${lx + dir * 8} ${ly})`}
                />
              ))}
              {/* Blooms (shipped ideas) */}
              {Array.from({ length: blooms }).map((_, k) => {
                const angle = (k / Math.max(1, blooms)) * Math.PI * 2;
                const r = 14 + (k % 2) * 4;
                const bx = tipX + Math.cos(angle) * r;
                const by = tipY + Math.sin(angle) * r;
                return <Bloom key={k} cx={bx} cy={by} accent={accent} delay={0.4 + i * 0.05 + k * 0.08} />;
              })}
              {/* Tip bud */}
              <circle cx={tipX} cy={tipY} r={5} fill={accent} stroke="#fff" strokeOpacity={0.9} strokeWidth={1.2} />
              {/* Project label */}
              <a href={repoUrl(project) ?? undefined} target="_blank" rel="noopener noreferrer">
                <text
                  x={x}
                  y={GROUND_Y + 18}
                  fill="var(--of-fg-muted)"
                  fontSize="11"
                  fontWeight={600}
                  textAnchor="middle"
                  fontFamily="var(--of-font-mono)"
                  style={{ cursor: repoUrl(project) ? 'pointer' : 'default', textDecoration: repoUrl(project) ? 'underline' : 'none' }}
                >
                  {project.name}
                </text>
              </a>
            </motion.g>
          );
        })}
      </svg>

      {hover && (
        <div
          className="ml-tooltip"
          style={{ left: Math.min(hover.x + 12, VB_W - 240), top: hover.y + 12 }}
        >
          {repoUrl(hover.project) ? (
            <a className="ml-tooltip__title" href={repoUrl(hover.project)!} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>
              {hover.project.name}
            </a>
          ) : (
            <div className="ml-tooltip__title">{hover.project.name}</div>
          )}
          <div className="ml-tooltip__row">
            <span>Type</span>
            <span>{TYPE_LABEL[hover.project.type]}</span>
          </div>
          <div className="ml-tooltip__row">
            <span>Commits, 90d</span>
            <span>{hover.commits}</span>
          </div>
          <div className="ml-tooltip__row">
            <span>Shipped ideas</span>
            <span>{hover.blooms}</span>
          </div>
          {hover.project.description && (
            <div className="ml-tooltip__row" style={{ display: 'block', marginTop: 6, color: 'var(--of-fg-subtle)' }}>
              {hover.project.description}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Bloom({ cx, cy, accent, delay }: { cx: number; cy: number; accent: string; delay: number }) {
  return (
    <motion.g
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay, duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
      style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
    >
      {Array.from({ length: 5 }).map((_, i) => {
        const a = (i / 5) * Math.PI * 2;
        const px = cx + Math.cos(a) * 4;
        const py = cy + Math.sin(a) * 4;
        return <circle key={i} cx={px} cy={py} r={4} fill={accent} fillOpacity={0.85} />;
      })}
      <circle cx={cx} cy={cy} r={2.2} fill="#fff" />
    </motion.g>
  );
}

function SunRays({ cx, cy, count }: { cx: number; cy: number; count: number }) {
  return (
    <motion.g
      initial={{ opacity: 0, rotate: -10 }}
      animate={{ opacity: 0.6, rotate: 0 }}
      transition={{ duration: 1, ease: 'easeOut' }}
      style={{ transformBox: 'fill-box', transformOrigin: `${cx}px ${cy}px` }}
    >
      {Array.from({ length: count }).map((_, i) => {
        const angle = (i / count) * Math.PI * 2;
        const x2 = cx + Math.cos(angle) * 200;
        const y2 = cy + Math.sin(angle) * 200;
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={x2}
            y2={y2}
            stroke="rgba(251, 65, 170, 0.18)"
            strokeWidth={1.2}
            strokeLinecap="round"
          />
        );
      })}
    </motion.g>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="ml-canvas__body" style={{ display: 'grid', placeItems: 'center', color: 'var(--of-fg-subtle)' }}>
      {message}
    </div>
  );
}
