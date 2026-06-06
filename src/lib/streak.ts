import type { Commit } from '../data/types';

const DAY_MS = 86_400_000;

/**
 * Local calendar day key (YYYY-MM-DD) in the viewer's timezone.
 *
 * A streak is a wall-clock concept, so we key by local days. Using the raw
 * ISO slice would mis-bucket commits whose timestamp carries a non-UTC
 * offset (e.g. a late-night commit that GitHub returns in UTC rolls into
 * the next day), which previously broke streak chaining.
 */
function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toDayKey(iso: string): string {
  return localDayKey(new Date(iso));
}

/** Set of all day keys (YYYY-MM-DD) that contain at least one commit. */
export function commitDaySet(commits: Commit[]): Set<string> {
  const s = new Set<string>();
  for (const c of commits) s.add(toDayKey(c.timestamp));
  return s;
}

export interface StreakInfo {
  current: number;
  longest: number;
  /** ISO of earliest day in the active streak, or null if no active streak. */
  currentStart: string | null;
}

/**
 * Compute current and longest commit streaks from a commit array.
 *
 * "Current" is anchored to today (local day) and walks back: it ends as soon
 * as a day has zero commits. We allow yesterday's day to start the streak
 * if today is empty (so the streak doesn't break mid-morning).
 */
export function computeStreaks(commits: Commit[], now: Date = new Date()): StreakInfo {
  if (commits.length === 0) return { current: 0, longest: 0, currentStart: null };
  const days = commitDaySet(commits);

  // Current streak from today (or yesterday if today empty).
  let current = 0;
  const cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);
  if (!days.has(localDayKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!days.has(localDayKey(cursor))) {
      return { current: 0, longest: computeLongest(days), currentStart: null };
    }
  }
  let currentStart = localDayKey(cursor);
  while (days.has(localDayKey(cursor))) {
    current += 1;
    currentStart = localDayKey(cursor);
    cursor.setDate(cursor.getDate() - 1);
  }

  return { current, longest: computeLongest(days), currentStart };
}

function computeLongest(days: Set<string>): number {
  if (days.size === 0) return 0;
  const sorted = [...days].sort();
  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    // Parse as local midnight (no Z) and compare calendar-day distance.
    // Math.round absorbs DST transitions where a day is 23 or 25 hours.
    const prev = new Date(sorted[i - 1] + 'T00:00:00').getTime();
    const cur = new Date(sorted[i] + 'T00:00:00').getTime();
    const diffDays = Math.round((cur - prev) / DAY_MS);
    if (diffDays === 1) {
      run += 1;
      if (run > longest) longest = run;
    } else {
      run = 1;
    }
  }
  return longest;
}
