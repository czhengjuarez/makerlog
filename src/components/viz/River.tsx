import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../../data/store';
import { accentForType, TYPE_LABEL } from '../../data/mock';
import { bucketsByDay } from '../../lib/stats';
import { getVisibleProjects } from '../../lib/visibility';
import { repoUrl } from '../../lib/format';
import { smoothPath } from './path';
import type { Project, ProjectType } from '../../data/types';

interface RiverProps {
  filteredTypes: ProjectType[];
}

const VB_W = 1000;
const VB_H = 480;
const PAD_X = 24;
const PAD_TOP = 40;
const PAD_BOT = 40;

const WINDOW_DAYS = 90;

interface HoverInfo {
  x: number;
  y: number;
  date: string;
  rows: Array<{ project: Project; count: number }>;
}

export function River({ filteredTypes }: RiverProps) {
  const { state } = useStore();
  const [hover, setHover] = useState<HoverInfo | null>(null);

  const visibleProjects = useMemo(
    () => getVisibleProjects(state.projects, state.commits, filteredTypes, state.preferences),
    [state.projects, state.commits, filteredTypes, state.preferences],
  );

  const buckets = useMemo(() => bucketsByDay(state.commits, WINDOW_DAYS), [state.commits]);

  // Per-project per-day filtered counts
  const series = useMemo(() => {
    const projectIds = new Set(visibleProjects.map((p) => p.id));
    return visibleProjects.map((project) => ({
      project,
      values: buckets.map((b) => (projectIds.has(project.id) ? (b.byProject[project.id] ?? 0) : 0)),
    }));
  }, [visibleProjects, buckets]);

  // Per-day total to compute centered baseline (stream graph offset='wiggle' approx with simple centering)
  const totals = useMemo(() => buckets.map((_, i) => series.reduce((s, sr) => s + sr.values[i], 0)), [buckets, series]);
  const maxTotal = Math.max(1, ...totals);

  const usableW = VB_W - PAD_X * 2;
  const usableH = VB_H - PAD_TOP - PAD_BOT;
  const baselineY = PAD_TOP + usableH / 2;
  const stepX = usableW / Math.max(1, buckets.length - 1);
  const yScale = (v: number) => (v / maxTotal) * (usableH * 0.85);

  // Build layered area paths from bottom-up around baseline
  const layers = useMemo(() => {
    return series.map((sr, layerIdx) => {
      // Stack: previous lower edge becomes new upper edge anchor.
      // We center by setting initial offset = -total/2 (in units, mapped to y).
      const upper: { x: number; y: number }[] = [];
      const lower: { x: number; y: number }[] = [];
      for (let i = 0; i < buckets.length; i++) {
        const total = totals[i];
        // accumulate offset for layers below this one:
        let offsetBelow = 0;
        for (let j = 0; j < layerIdx; j++) offsetBelow += series[j].values[i];
        const start = -total / 2 + offsetBelow;
        const end = start + sr.values[i];
        const x = PAD_X + i * stepX;
        const yLow = baselineY + yScale(start);
        const yHigh = baselineY + yScale(end);
        lower.push({ x, y: yLow });
        upper.push({ x, y: yHigh });
      }
      const topD = smoothPath(upper);
      const botD = smoothPath([...lower].reverse());
      const d = `${topD} L${lower[lower.length - 1].x},${lower[lower.length - 1].y} ${botD.replace(/^M/, 'L')} Z`;
      return { project: sr.project, d, upper, values: sr.values };
    });
  }, [series, buckets, totals, baselineY, stepX]);

  if (visibleProjects.length === 0) {
    return <EmptyState message="No projects matching the current filter." />;
  }

  // Hover interaction: track nearest x-bucket
  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const xInVB = ratio * VB_W;
    const idx = Math.round((xInVB - PAD_X) / stepX);
    const clamped = Math.max(0, Math.min(buckets.length - 1, idx));
    const day = buckets[clamped].day;
    const rows = series
      .map((sr) => ({ project: sr.project, count: sr.values[clamped] }))
      .filter((r) => r.count > 0)
      .sort((a, b) => b.count - a.count);
    setHover({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      date: day,
      rows,
    });
  }

  // Week tick labels
  const ticks = useMemo(() => {
    const result: Array<{ x: number; label: string }> = [];
    for (let i = 0; i < buckets.length; i += 14) {
      const date = new Date(buckets[i].day);
      result.push({
        x: PAD_X + i * stepX,
        label: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      });
    }
    return result;
  }, [buckets, stepX]);

  return (
    <div className="ml-canvas__body ml-river-bg" style={{ position: 'relative' }}>
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        width="100%"
        height="100%"
        preserveAspectRatio="none"
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label="A river of projects, each band thickens with daily commits."
      >
        <defs>
          {layers.map(({ project }) => {
            const color = project.accent ?? accentForType(project.type);
            return (
              <linearGradient key={project.id} id={`river-${project.id}`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={color} stopOpacity={0.55} />
                <stop offset="100%" stopColor={color} stopOpacity={0.85} />
              </linearGradient>
            );
          })}
          <filter id="river-soft" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="0.6" />
          </filter>
        </defs>

        {/* baseline shadow */}
        <line x1={PAD_X} x2={VB_W - PAD_X} y1={baselineY} y2={baselineY} stroke="var(--of-border-subtle)" strokeWidth={1} strokeDasharray="2 6" />

        {/* layered streams */}
        {layers.map(({ project, d }, i) => (
          <motion.path
            key={project.id}
            d={d}
            fill={`url(#river-${project.id})`}
            stroke={project.accent ?? accentForType(project.type)}
            strokeOpacity={0.45}
            strokeWidth={0.6}
            initial={{ opacity: 0, scaleY: 0 }}
            animate={{ opacity: 1, scaleY: 1 }}
            style={{ transformBox: 'fill-box', transformOrigin: `center ${baselineY}px` }}
            transition={{ duration: 0.7, delay: 0.04 * i, ease: [0.22, 1, 0.36, 1] }}
            filter="url(#river-soft)"
          />
        ))}

        {/* light shimmer overlay */}
        <ShimmerOverlay y={baselineY} stepX={stepX} count={buckets.length} />

        {/* x-axis ticks */}
        {ticks.map(({ x, label }) => (
          <g key={x}>
            <line x1={x} x2={x} y1={VB_H - PAD_BOT + 4} y2={VB_H - PAD_BOT + 8} stroke="var(--of-border-line)" />
            <text
              x={x}
              y={VB_H - PAD_BOT + 22}
              fill="var(--of-fg-subtle)"
              fontSize="10"
              textAnchor="middle"
              fontFamily="var(--of-font-mono)"
            >
              {label}
            </text>
          </g>
        ))}

        {/* legend */}
        <g transform={`translate(${PAD_X}, 12)`}>
          {layers.map(({ project }, i) => {
            const color = project.accent ?? accentForType(project.type);
            const cols = 4;
            const col = i % cols;
            const row = Math.floor(i / cols);
            return (
              <g key={project.id} transform={`translate(${col * 200}, ${row * 18})`}>
                <rect width={10} height={10} y={-1} rx={2} fill={color} />
                <a href={repoUrl(project) ?? undefined} target="_blank" rel="noopener noreferrer">
                  <text x={16} y={8} fontSize="11" fill="var(--of-fg-muted)" fontFamily="var(--of-font-sans)"
                    style={{ cursor: repoUrl(project) ? 'pointer' : 'default', textDecoration: repoUrl(project) ? 'underline' : 'none' }}
                  >
                    {project.name}
                  </text>
                </a>
              </g>
            );
          })}
        </g>
      </svg>

      {hover && hover.rows.length > 0 && (
        <div
          className="ml-tooltip"
          style={{ left: Math.min(hover.x + 12, VB_W - 240), top: Math.min(hover.y + 12, VB_H - 200) }}
        >
          <div className="ml-tooltip__title">
            {new Date(hover.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
          </div>
          {hover.rows.slice(0, 6).map((r) => (
            <div key={r.project.id} className="ml-tooltip__row">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    width: 8, height: 8, borderRadius: 2,
                    background: r.project.accent ?? accentForType(r.project.type),
                    display: 'inline-block',
                  }}
                />
                {repoUrl(r.project) ? (
                  <a href={repoUrl(r.project)!} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>
                    {r.project.name}
                  </a>
                ) : r.project.name}
              </span>
              <span>{r.count}</span>
            </div>
          ))}
          {hover.rows.length === 0 && <div className="ml-tooltip__row">A quiet day.</div>}
          <div className="ml-tooltip__row" style={{ marginTop: 6, color: 'var(--of-fg-subtle)' }}>
            <span>Total</span>
            <span>{hover.rows.reduce((s, r) => s + r.count, 0)} commits</span>
          </div>
          <div className="ml-tooltip__row" style={{ color: 'var(--of-fg-subtle)' }}>
            <span>Types</span>
            <span>{[...new Set(hover.rows.map((r) => TYPE_LABEL[r.project.type]))].join(' · ') || '—'}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function ShimmerOverlay({ y, stepX, count }: { y: number; stepX: number; count: number }) {
  // Subtle sin wave shimmer band along the baseline
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i <= count; i++) {
    points.push({
      x: PAD_X + i * stepX,
      y: y + Math.sin(i / 4) * 3,
    });
  }
  return (
    <motion.path
      d={smoothPath(points)}
      fill="none"
      stroke="rgba(255, 255, 255, 0.35)"
      strokeWidth={1}
      initial={{ pathLength: 0, opacity: 0 }}
      animate={{ pathLength: 1, opacity: 0.35 }}
      transition={{ duration: 1.6, ease: 'easeOut', delay: 0.4 }}
    />
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="ml-canvas__body" style={{ display: 'grid', placeItems: 'center', color: 'var(--of-fg-subtle)' }}>
      {message}
    </div>
  );
}
