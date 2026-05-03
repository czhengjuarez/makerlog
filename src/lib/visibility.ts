/**
 * Project visibility logic.
 *
 * The visualizations break down visually past ~12 projects (stems crowd in
 * Garden, buildings squish in Blueprint, river bands blur). With 30-50
 * imported repos this is the norm, not the edge case. So:
 *
 *   - "auto" mode (default): show top N by commits in the 90-day window.
 *     Auto follows your activity — once-dormant projects re-surface when
 *     you push to them.
 *
 *   - "explicit" mode: a saved list of project IDs the user picked in
 *     the Manage Projects modal. Stays exactly as set, even if a project
 *     goes quiet.
 *
 * `getVisibleProjects` is the single source of truth used by every viz.
 */
import type { Commit, Preferences, Project, ProjectType } from '../data/types';
import { commitsByProject } from './stats';

export const DEFAULT_AUTO_TOP_N = 10;
export const VISIBILITY_WINDOW_DAYS = 90;

/**
 * Apply both the type filter and the visibility selection to the project
 * list. Returns the projects that should be drawn in a visualization.
 */
export function getVisibleProjects(
  projects: Project[],
  commits: Commit[],
  filteredTypes: ProjectType[],
  preferences?: Preferences,
): Project[] {
  // Step 1: apply type chips
  const byType =
    filteredTypes.length === 0
      ? projects
      : projects.filter((p) => filteredTypes.includes(p.type));

  // Step 2: explicit list wins over auto
  const ids = preferences?.visibleProjectIds;
  if (Array.isArray(ids)) {
    const set = new Set(ids);
    return byType.filter((p) => set.has(p.id));
  }

  // Step 3: auto mode — top N by recent commits, plus a tail anchor so
  // single-commit projects don't crowd the canvas.
  const topN = preferences?.autoTopN ?? DEFAULT_AUTO_TOP_N;
  if (byType.length <= topN) return byType;

  const counts = commitsByProject(commits, VISIBILITY_WINDOW_DAYS);
  const sorted = [...byType].sort((a, b) => {
    const aC = counts.get(a.id) ?? 0;
    const bC = counts.get(b.id) ?? 0;
    if (bC !== aC) return bC - aC;
    // Tie-breaker: newer projects first so a fresh start surfaces over
    // an old experiment with the same low count.
    return b.createdAt.localeCompare(a.createdAt);
  });
  return sorted.slice(0, topN);
}

/**
 * Activity ranking with metadata, used by the Manage Projects modal.
 * Sorted by commits-in-window desc, then by name asc.
 */
export interface ProjectActivity {
  project: Project;
  commitsInWindow: number;
  totalCommits: number;
  lastCommitAt: string | null;
}

export function rankProjectsByActivity(
  projects: Project[],
  commits: Commit[],
  windowDays = VISIBILITY_WINDOW_DAYS,
): ProjectActivity[] {
  const cutoff = Date.now() - windowDays * 86400_000;
  const counts = new Map<string, { recent: number; total: number; last: string | null }>();
  for (const c of commits) {
    const t = Date.parse(c.timestamp);
    const e = counts.get(c.projectId) ?? { recent: 0, total: 0, last: null };
    e.total += 1;
    if (t >= cutoff) e.recent += 1;
    if (!e.last || c.timestamp > e.last) e.last = c.timestamp;
    counts.set(c.projectId, e);
  }
  const out = projects.map<ProjectActivity>((p) => {
    const e = counts.get(p.id) ?? { recent: 0, total: 0, last: null };
    return {
      project: p,
      commitsInWindow: e.recent,
      totalCommits: e.total,
      lastCommitAt: e.last,
    };
  });
  out.sort((a, b) => {
    if (b.commitsInWindow !== a.commitsInWindow) return b.commitsInWindow - a.commitsInWindow;
    if (b.totalCommits !== a.totalCommits) return b.totalCommits - a.totalCommits;
    return a.project.name.localeCompare(b.project.name);
  });
  return out;
}
