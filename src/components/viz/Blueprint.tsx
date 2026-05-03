import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../../data/store';
import { accentForType, TYPE_LABEL } from '../../data/mock';
import { commitsByProject } from '../../lib/stats';
import { computeStreaks } from '../../lib/streak';
import { getVisibleProjects } from '../../lib/visibility';
import type { Project, ProjectType } from '../../data/types';

interface BlueprintProps {
  filteredTypes: ProjectType[];
}

const VB_W = 1000;
const VB_H = 480;
const GROUND_Y = 410;

interface HoverInfo {
  x: number;
  y: number;
  project: Project;
  commits90: number;
  commitsTotal: number;
}

export function Blueprint({ filteredTypes }: BlueprintProps) {
  const { state } = useStore();
  const [hover, setHover] = useState<HoverInfo | null>(null);

  const visible = useMemo(
    () => getVisibleProjects(state.projects, state.commits, filteredTypes, state.preferences),
    [state.projects, state.commits, filteredTypes, state.preferences],
  );

  const counts90 = useMemo(() => commitsByProject(state.commits, 90), [state.commits]);
  const countsTotal = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of state.commits) m.set(c.projectId, (m.get(c.projectId) ?? 0) + 1);
    return m;
  }, [state.commits]);
  const streak = useMemo(() => computeStreaks(state.commits), [state.commits]);

  // Order by total commits desc so tallest on the right? Or by name? Tallest in middle for skyline drama.
  const ordered = useMemo(() => {
    const sorted = [...visible].sort((a, b) => (countsTotal.get(b.id) ?? 0) - (countsTotal.get(a.id) ?? 0));
    // Interleave so big buildings end up centered
    const interleaved: Project[] = [];
    for (let i = 0; i < sorted.length; i++) {
      if (i % 2 === 0) interleaved.push(sorted[i]);
      else interleaved.unshift(sorted[i]);
    }
    return interleaved;
  }, [visible, countsTotal]);

  const maxTotal = Math.max(1, ...visible.map((p) => countsTotal.get(p.id) ?? 0));
  const minH = 90;
  const maxH = 320;

  const margin = 60;
  const usable = VB_W - margin * 2;
  const buildingW = visible.length > 0 ? Math.min(110, usable / visible.length - 12) : 80;
  const stride = visible.length > 0 ? usable / visible.length : 0;

  if (visible.length === 0) {
    return <EmptyState message="No projects matching the current filter." />;
  }

  return (
    <div className="ml-canvas__body ml-blueprint-bg" style={{ position: 'relative' }}>
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="A skyline of projects, each building grows with commits."
      >
        <defs>
          <linearGradient id="bp-foundation" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(80, 7, 48, 0.22)" />
            <stop offset="100%" stopColor="rgba(80, 7, 48, 0)" />
          </linearGradient>
          <pattern id="bp-windows" x="0" y="0" width="14" height="14" patternUnits="userSpaceOnUse">
            <rect width="14" height="14" fill="transparent" />
            <rect x="3" y="3" width="6" height="6" fill="rgba(255,255,255,0.85)" />
          </pattern>
        </defs>

        {/* horizon line + foundation gradient */}
        <rect x={0} y={GROUND_Y} width={VB_W} height={VB_H - GROUND_Y} fill="url(#bp-foundation)" />
        <line x1={0} x2={VB_W} y1={GROUND_Y} y2={GROUND_Y} stroke="var(--of-border-strong)" strokeDasharray="6 4" strokeWidth={1.2} />
        <text x={VB_W - 24} y={GROUND_Y + 18} textAnchor="end" fontSize="10" fontFamily="var(--of-font-mono)" fill="var(--of-fg-subtle)">
          ground 0:00
        </text>

        {/* buildings */}
        {ordered.map((project, i) => {
          const total = countsTotal.get(project.id) ?? 0;
          const recent = counts90.get(project.id) ?? 0;
          const heightPct = total / maxTotal;
          const h = minH + Math.pow(heightPct, 0.85) * (maxH - minH);
          const x = margin + stride * i + (stride - buildingW) / 2;
          const y = GROUND_Y - h;
          const accent = project.accent ?? accentForType(project.type);

          // window grid: rows of small "windows" representing weeks of activity
          const windowCols = 3;
          const windowRows = Math.max(2, Math.round(recent / 4));
          const windows: Array<{ wx: number; wy: number; lit: boolean }> = [];
          for (let r = 0; r < windowRows; r++) {
            for (let c = 0; c < windowCols; c++) {
              const wx = x + 14 + c * 18;
              const wy = y + 28 + r * 18;
              if (wy > GROUND_Y - 16) continue;
              const lit = (r + c) % 3 !== 0; // simple decorative pattern
              windows.push({ wx, wy, lit });
            }
          }

          return (
            <motion.g
              key={project.id}
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.6, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
              onMouseMove={(e) => {
                setHover({
                  x: e.nativeEvent.offsetX,
                  y: e.nativeEvent.offsetY,
                  project,
                  commits90: recent,
                  commitsTotal: total,
                });
              }}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: 'pointer' }}
            >
              {/* dimension annotation */}
              <line x1={x - 8} x2={x - 8} y1={y} y2={GROUND_Y} stroke="var(--of-fg-subtle)" strokeOpacity={0.5} strokeWidth={0.8} />
              <line x1={x - 12} x2={x - 4} y1={y} y2={y} stroke="var(--of-fg-subtle)" strokeOpacity={0.5} />
              <line x1={x - 12} x2={x - 4} y1={GROUND_Y} y2={GROUND_Y} stroke="var(--of-fg-subtle)" strokeOpacity={0.5} />
              <text
                x={x - 14}
                y={(y + GROUND_Y) / 2}
                textAnchor="end"
                fontSize="9"
                fontFamily="var(--of-font-mono)"
                fill="var(--of-fg-subtle)"
                transform={`rotate(-90 ${x - 14} ${(y + GROUND_Y) / 2})`}
              >
                {total} commits
              </text>

              {/* foundation depth (streak proxy) */}
              <rect
                x={x + 6}
                y={GROUND_Y}
                width={buildingW - 12}
                height={Math.min(28, 6 + streak.current)}
                fill={accent}
                fillOpacity={0.18}
              />

              {/* main building */}
              <rect x={x} y={y} width={buildingW} height={h} fill={accent} fillOpacity={0.92} rx={2} />
              <rect
                x={x}
                y={y}
                width={buildingW}
                height={h}
                fill="url(#bp-windows)"
                fillOpacity={0.18}
              />
              {/* highlight strip on left side */}
              <rect x={x} y={y} width={3} height={h} fill="rgba(255,255,255,0.35)" />
              {/* roof bar */}
              <rect x={x - 4} y={y - 4} width={buildingW + 8} height={4} fill={accent} />

              {/* windows */}
              {windows.map(({ wx, wy, lit }, k) => (
                <rect
                  key={k}
                  x={wx}
                  y={wy}
                  width={10}
                  height={10}
                  rx={1.5}
                  fill={lit ? 'rgba(255, 244, 220, 0.92)' : 'rgba(255, 255, 255, 0.18)'}
                />
              ))}

              {/* type tag at top */}
              <text
                x={x + buildingW / 2}
                y={y - 10}
                textAnchor="middle"
                fontSize="10"
                fontFamily="var(--of-font-mono)"
                fill="var(--of-fg-muted)"
                style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}
              >
                {project.type}
              </text>

              {/* project name below ground */}
              <text
                x={x + buildingW / 2}
                y={GROUND_Y + 38}
                textAnchor="middle"
                fontSize="11"
                fontFamily="var(--of-font-mono)"
                fontWeight="600"
                fill="var(--of-fg-default)"
              >
                {project.name}
              </text>
            </motion.g>
          );
        })}

        {/* sky annotation: streak label */}
        <g transform={`translate(${VB_W - 220}, 30)`}>
          <rect x={0} y={0} width={200} height={48} rx={8} fill="var(--of-bg-elevated)" stroke="var(--of-border-line)" strokeDasharray="4 3" />
          <text x={12} y={18} fontSize="10" fontFamily="var(--of-font-mono)" fill="var(--of-fg-subtle)" style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            current streak
          </text>
          <text x={12} y={38} fontSize="16" fontFamily="var(--of-font-display)" fontWeight="600" fill="var(--of-fg-default)">
            {streak.current} days <tspan fill="var(--of-fg-subtle)" fontSize="11" fontWeight="400">/ best {streak.longest}</tspan>
          </text>
        </g>
      </svg>

      {hover && (
        <div
          className="ml-tooltip"
          style={{ left: Math.min(hover.x + 12, VB_W - 240), top: hover.y + 12 }}
        >
          <div className="ml-tooltip__title">{hover.project.name}</div>
          <div className="ml-tooltip__row">
            <span>Type</span>
            <span>{TYPE_LABEL[hover.project.type]}</span>
          </div>
          <div className="ml-tooltip__row">
            <span>All-time commits</span>
            <span>{hover.commitsTotal}</span>
          </div>
          <div className="ml-tooltip__row">
            <span>Last 90d</span>
            <span>{hover.commits90}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="ml-canvas__body" style={{ display: 'grid', placeItems: 'center', color: 'var(--of-fg-subtle)' }}>
      {message}
    </div>
  );
}
