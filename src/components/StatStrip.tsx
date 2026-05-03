import { useMemo } from 'react';
import { Flame, GitCommit, Rocket, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useStore } from '../data/store';
import { computeStreaks } from '../lib/streak';
import { bucketsByDay, computeShipRatio, computeVelocity } from '../lib/stats';
import { compactNumber, pct, withSign } from '../lib/format';

export function StatStrip() {
  const { state } = useStore();

  const streak = useMemo(() => computeStreaks(state.commits), [state.commits]);
  const ship = useMemo(() => computeShipRatio(state.ideas), [state.ideas]);
  const velocity = useMemo(() => computeVelocity(state.commits, state.projects), [state.commits, state.projects]);
  const sparkData = useMemo(
    () => bucketsByDay(state.commits, 28).map((b) => b.count),
    [state.commits],
  );

  return (
    <div className="ml-stats">
      <div className="of-card ml-stat ml-stat--hero">
        <div className="ml-stat__label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Flame size={13} strokeWidth={1.75} />
          Current streak
        </div>
        <div className="ml-stat__value">{streak.current}<span style={{ fontSize: '0.5em', marginLeft: 6, opacity: 0.78 }}>days</span></div>
        <div className="ml-stat__sub">
          {streak.longest > 0 ? `Personal best: ${streak.longest} days` : 'Start a streak today'}
        </div>
        <Sparkline values={sparkData} className="ml-stat__sparkline" stroke="rgba(255,255,255,0.85)" fill="rgba(255,255,255,0.20)" />
      </div>

      <div className="of-card ml-stat">
        <div className="ml-stat__label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <GitCommit size={13} strokeWidth={1.75} />
          Commits, last 12 wks
        </div>
        <div className="ml-stat__value">{compactNumber(velocity.totalCommits)}</div>
        <div className="ml-stat__sub">
          {velocity.activeProjects} active project{velocity.activeProjects === 1 ? '' : 's'}
        </div>
      </div>

      <div className="of-card ml-stat">
        <div className="ml-stat__label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Rocket size={13} strokeWidth={1.75} />
          Idea → ship rate
        </div>
        <div className="ml-stat__value">{pct(ship.ratio)}</div>
        <div className="ml-stat__sub">
          {ship.shipped} of {ship.total} ideas shipped
        </div>
      </div>

      <div className="of-card ml-stat">
        <div className="ml-stat__label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <DeltaIcon delta={velocity.recentDelta} />
          Velocity trend
        </div>
        <div className="ml-stat__value" style={{ color: velocity.recentDelta > 5 ? 'var(--of-fg-success)' : velocity.recentDelta < -5 ? 'var(--of-fg-danger)' : undefined }}>
          {withSign(velocity.recentDelta)}<span style={{ fontSize: '0.5em', marginLeft: 4, opacity: 0.7 }}>%</span>
        </div>
        <div className="ml-stat__sub">vs prior 6 weeks</div>
      </div>
    </div>
  );
}

function DeltaIcon({ delta }: { delta: number }) {
  if (delta > 5) return <TrendingUp size={13} strokeWidth={1.75} />;
  if (delta < -5) return <TrendingDown size={13} strokeWidth={1.75} />;
  return <Minus size={13} strokeWidth={1.75} />;
}

function Sparkline({
  values,
  stroke,
  fill,
  className,
}: {
  values: number[];
  stroke: string;
  fill: string;
  className?: string;
}) {
  if (values.length < 2) return null;
  const w = 110;
  const h = 36;
  const max = Math.max(1, ...values);
  const step = w / (values.length - 1);
  const pts = values.map((v, i) => [i * step, h - (v / max) * (h - 4) - 2] as const);
  const linePath = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${w},${h} L0,${h} Z`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={className} aria-hidden>
      <path d={areaPath} fill={fill} />
      <path d={linePath} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
