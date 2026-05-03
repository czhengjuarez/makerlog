import type { Commit } from '../data/types';

const DAY_MS = 86_400_000;

function toDayKey(iso: string): string {
  return iso.slice(0, 10);
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
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
 * "Current" is anchored to today (UTC day) and walks back: it ends as soon
 * as a day has zero commits. We allow yesterday's day to start the streak
 * if today is empty (so the streak doesn't break mid-morning).
 */
export function computeStreaks(commits: Commit[], now: Date = new Date()): StreakInfo {
  if (commits.length === 0) return { current: 0, longest: 0, currentStart: null };
  const days = commitDaySet(commits);

  // Current streak from today (or yesterday if today empty).
  let current = 0;
  let cursor = new Date(now);
  cursor.setUTCHours(0, 0, 0, 0);
  if (!days.has(dayKey(cursor))) {
    cursor = new Date(cursor.getTime() - DAY_MS);
    if (!days.has(dayKey(cursor))) {
      return { current: 0, longest: computeLongest(days), currentStart: null };
    }
  }
  let currentStart = dayKey(cursor);
  while (days.has(dayKey(cursor))) {
    current += 1;
    currentStart = dayKey(cursor);
    cursor = new Date(cursor.getTime() - DAY_MS);
  }

  return { current, longest: computeLongest(days), currentStart };
}

function computeLongest(days: Set<string>): number {
  if (days.size === 0) return 0;
  const sorted = [...days].sort();
  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1] + 'T00:00:00Z').getTime();
    const cur = new Date(sorted[i] + 'T00:00:00Z').getTime();
    if (cur - prev === DAY_MS) {
      run += 1;
      if (run > longest) longest = run;
    } else {
      run = 1;
    }
  }
  return longest;
}
