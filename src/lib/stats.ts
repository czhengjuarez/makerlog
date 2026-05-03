import type { Commit, Idea, Project, ProjectType } from '../data/types';

export interface DailyBucket {
  /** ISO day key */
  day: string;
  /** Total commit count this day */
  count: number;
  /** Counts broken down by projectId */
  byProject: Record<string, number>;
}

const DAY_MS = 86_400_000;

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Build a contiguous array of `windowDays` daily buckets ending today.
 * Always emits a slot per day, even empty ones — so renderers can iterate cleanly.
 */
export function bucketsByDay(
  commits: Commit[],
  windowDays: number,
  now: Date = new Date(),
): DailyBucket[] {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  start.setTime(start.getTime() - (windowDays - 1) * DAY_MS);

  const map = new Map<string, DailyBucket>();
  for (let i = 0; i < windowDays; i++) {
    const d = new Date(start.getTime() + i * DAY_MS);
    const key = dayKey(d);
    map.set(key, { day: key, count: 0, byProject: {} });
  }
  for (const c of commits) {
    const key = c.timestamp.slice(0, 10);
    const b = map.get(key);
    if (!b) continue;
    b.count += 1;
    b.byProject[c.projectId] = (b.byProject[c.projectId] ?? 0) + 1;
  }
  return [...map.values()];
}

/** Count commits per project within window. */
export function commitsByProject(commits: Commit[], windowDays: number, now = new Date()) {
  const cutoff = now.getTime() - windowDays * DAY_MS;
  const out = new Map<string, number>();
  for (const c of commits) {
    if (new Date(c.timestamp).getTime() < cutoff) continue;
    out.set(c.projectId, (out.get(c.projectId) ?? 0) + 1);
  }
  return out;
}

export interface VelocityIndex {
  /** Avg commits per active week, last 12 weeks vs prior 12 — pct change */
  recentDelta: number;
  /** Average commits per day across window */
  avgPerDay: number;
  /** Total commits in window */
  totalCommits: number;
  /** Projects touched in window */
  activeProjects: number;
}

export function computeVelocity(commits: Commit[], projects: Project[], windowDays = 84): VelocityIndex {
  const buckets = bucketsByDay(commits, windowDays);
  const total = buckets.reduce((s, b) => s + b.count, 0);
  const projectsTouched = new Set<string>();
  buckets.forEach((b) => Object.keys(b.byProject).forEach((p) => projectsTouched.add(p)));

  // Recent vs prior half of window
  const half = Math.floor(buckets.length / 2);
  const prior = buckets.slice(0, half).reduce((s, b) => s + b.count, 0) / Math.max(1, half);
  const recent = buckets.slice(half).reduce((s, b) => s + b.count, 0) / Math.max(1, buckets.length - half);
  const delta = prior === 0 ? (recent === 0 ? 0 : 100) : ((recent - prior) / prior) * 100;

  return {
    recentDelta: Math.round(delta),
    avgPerDay: total / Math.max(1, buckets.length),
    totalCommits: total,
    activeProjects: projectsTouched.size,
  };
}

export interface ShipRatio {
  shipped: number;
  total: number;
  ratio: number; // 0..1
}

export function computeShipRatio(ideas: Idea[]): ShipRatio {
  if (ideas.length === 0) return { shipped: 0, total: 0, ratio: 0 };
  const shipped = ideas.filter((i) => i.status === 'shipped').length;
  return { shipped, total: ideas.length, ratio: shipped / ideas.length };
}

export function projectsByType(projects: Project[]): Record<ProjectType, Project[]> {
  const out: Record<ProjectType, Project[]> = {
    work: [], personal: [], tool: [], experiment: [], production: [],
  };
  for (const p of projects) out[p.type].push(p);
  return out;
}
