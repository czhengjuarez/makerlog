import type {
  Commit,
  Idea,
  IdeaStatus,
  MakerLogState,
  Project,
  ProjectType,
} from './types';

/**
 * Deterministic-ish mock generator.
 *
 * Produces ~13 months of commit history across a handful of projects,
 * with realistic streak patterns: clustered burst weeks, the occasional
 * dry spell, and a current "live" streak of ~12 days. Plus an ideas
 * backlog of varying status.
 */

// Tiny seeded RNG (mulberry32). Keeps the demo stable across reloads.
function rng(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const TYPE_ACCENTS: Record<ProjectType, string> = {
  work: '#4A6CF7',
  personal: '#FB41AA',
  tool: '#2FA775',
  experiment: '#D88A2B',
  production: '#80074D',
};

export const TYPE_LABEL: Record<ProjectType, string> = {
  work: 'Work',
  personal: 'Personal',
  tool: 'Tool',
  experiment: 'Experiment',
  production: 'Production',
};

export function accentForType(t: ProjectType): string {
  return TYPE_ACCENTS[t];
}

const SAMPLE_PROJECTS: Array<Omit<Project, 'id' | 'createdAt' | 'accent'>> = [
  {
    name: 'glowboard',
    type: 'production',
    provider: 'github',
    slug: 'changying/glowboard',
    description: 'Real-time ops dashboard with bloom-style charts.',
  },
  {
    name: 'tideline',
    type: 'tool',
    provider: 'github',
    slug: 'changying/tideline',
    description: 'CLI for tracking small wins across the week.',
  },
  {
    name: 'orchard-cms',
    type: 'work',
    provider: 'gitlab',
    slug: 'team/orchard-cms',
    description: 'Internal CMS — content workflows and approvals.',
  },
  {
    name: 'lumen',
    type: 'experiment',
    provider: 'github',
    slug: 'changying/lumen',
    description: 'Toy LLM router — does it really need to be a graph?',
  },
  {
    name: 'fern',
    type: 'personal',
    provider: 'github',
    slug: 'changying/fern',
    description: 'Personal site rebuilt with the Keel design system.',
  },
  {
    name: 'pulse-meter',
    type: 'tool',
    provider: 'gitlab',
    slug: 'team/pulse-meter',
    description: 'Scrappy pager-fatigue analyser for on-call rotations.',
  },
];

const COMMIT_MESSAGES = [
  'tighten layout for narrow viewports',
  'lift token contrast on dark mode',
  'add streak calculator + tests',
  'refactor data layer behind interface',
  'wire up provider connect modal',
  'fix off-by-one in week boundary',
  'inline keel tokens for portability',
  'first stab at garden viz',
  'replace dots with bloom particles',
  'cache derived stats with useMemo',
  'add JSON export to settings',
  'split mock generator by domain',
  'tag projects by type',
  'simplify reducer surface area',
  'accessibility pass on viz tooltips',
  'animate streak ribbon entry',
  'persist ideas atomically on edit',
  'normalize timestamps to ISO',
];

function pick<T>(arr: T[], r: () => number): T {
  return arr[Math.floor(r() * arr.length)];
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function dayOffset(base: Date, daysAgo: number): Date {
  const x = new Date(base);
  x.setDate(x.getDate() - daysAgo);
  return x;
}

/**
 * Generate the demo state. `today` overridable for stability in tests.
 */
export function generateMockState(today = new Date()): MakerLogState {
  const r = rng(42);
  const now = startOfDay(today);
  const projects: Project[] = SAMPLE_PROJECTS.map((p, i) => ({
    ...p,
    id: `prj_${i + 1}`,
    accent: accentForType(p.type),
    createdAt: dayOffset(now, 380 - i * 22).toISOString(),
  }));

  const commits: Commit[] = [];
  let cid = 0;

  // Build a 400-day commit cadence for each project with realistic clusters.
  for (const project of projects) {
    // Each project has its own active days and intensity profile.
    const baseDensity = 0.35 + r() * 0.4;
    const burstWeeks = new Set<number>();
    for (let i = 0; i < 8; i++) burstWeeks.add(Math.floor(r() * 56));

    for (let dayIdx = 0; dayIdx < 400; dayIdx++) {
      const date = dayOffset(now, 400 - dayIdx);
      // weekend dampener for work projects
      const weekendDamp = (project.type === 'work' && (date.getDay() === 0 || date.getDay() === 6)) ? 0.25 : 1;
      const week = Math.floor(dayIdx / 7);
      const burst = burstWeeks.has(week) ? 2.4 : 1;
      // Long ago: less likely
      const recencyBoost = 0.6 + (dayIdx / 400) * 0.6;
      const probability = Math.min(0.85, baseDensity * burst * weekendDamp * recencyBoost - 0.4);
      if (r() > probability) continue;

      const commitsToday = 1 + Math.floor(r() * (burst > 2 ? 4 : 2));
      for (let k = 0; k < commitsToday; k++) {
        const ts = new Date(date);
        ts.setHours(8 + Math.floor(r() * 12), Math.floor(r() * 60), Math.floor(r() * 60));
        commits.push({
          id: `c_${++cid}`,
          projectId: project.id,
          timestamp: ts.toISOString(),
          message: pick(COMMIT_MESSAGES, r),
          additions: Math.floor(r() * 220) + 5,
          deletions: Math.floor(r() * 80),
          sha: Math.floor(r() * 0xfffffff).toString(16).padStart(7, '0'),
        });
      }
    }
  }

  // Force a clean current streak: ensure last 12 days each have at least one commit.
  for (let dAgo = 0; dAgo < 12; dAgo++) {
    const date = dayOffset(now, dAgo);
    const day = isoDay(date);
    const hasCommit = commits.some((c) => c.timestamp.startsWith(day));
    if (!hasCommit) {
      const project = projects[Math.floor(r() * projects.length)];
      const ts = new Date(date);
      ts.setHours(20, 14, 0);
      commits.push({
        id: `c_${++cid}`,
        projectId: project.id,
        timestamp: ts.toISOString(),
        message: pick(COMMIT_MESSAGES, r),
        additions: Math.floor(r() * 80) + 5,
        deletions: Math.floor(r() * 30),
      });
    }
  }

  // Sort commits chronologically
  commits.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  // Ideas: ~14 ideas across statuses, some shipped (linked to projects), some still drifting.
  const seedIdeas: Array<{ title: string; notes?: string; status: IdeaStatus; type?: ProjectType; projectName?: string; daysAgo: number; shippedDaysAgo?: number }> = [
    { title: 'Streak ribbon that thickens with intensity', status: 'shipped', type: 'production', projectName: 'glowboard', daysAgo: 60, shippedDaysAgo: 14 },
    { title: 'Week-in-review email digest', status: 'building', type: 'personal', projectName: 'fern', daysAgo: 22 },
    { title: 'Pager fatigue heatmap for on-call', status: 'shipped', type: 'tool', projectName: 'pulse-meter', daysAgo: 110, shippedDaysAgo: 38 },
    { title: 'Tiny CLI: log a win in one command', status: 'shipped', type: 'tool', projectName: 'tideline', daysAgo: 200, shippedDaysAgo: 165 },
    { title: 'Fork-friendly auth without a backend', status: 'building', type: 'experiment', daysAgo: 9 },
    { title: 'Replace heatmap dots with bloom field', status: 'idea', type: 'production', daysAgo: 5 },
    { title: 'Quarterly retro generator', status: 'idea', type: 'personal', daysAgo: 30 },
    { title: 'Investigate Hono for the worker', status: 'parked', type: 'experiment', daysAgo: 80 },
    { title: 'A page that explains my stack honestly', status: 'idea', type: 'personal', daysAgo: 2 },
    { title: 'Approvals workflow for orchard-cms', status: 'shipped', type: 'work', projectName: 'orchard-cms', daysAgo: 140, shippedDaysAgo: 88 },
    { title: 'LLM router experiment writeup', status: 'building', type: 'experiment', projectName: 'lumen', daysAgo: 18 },
    { title: 'Side-project velocity scorecard', status: 'idea', type: 'personal', daysAgo: 1 },
    { title: 'Migrate fern to view transitions API', status: 'idea', type: 'personal', daysAgo: 12 },
    { title: 'Glowboard dark theme polish', status: 'shipped', type: 'production', projectName: 'glowboard', daysAgo: 50, shippedDaysAgo: 7 },
  ];

  const ideas: Idea[] = seedIdeas.map((s, i) => {
    const projectId = s.projectName
      ? projects.find((p) => p.name === s.projectName)?.id
      : undefined;
    return {
      id: `idea_${i + 1}`,
      title: s.title,
      notes: s.notes,
      status: s.status,
      projectId,
      type: s.type,
      createdAt: dayOffset(now, s.daysAgo).toISOString(),
      shippedAt: s.shippedDaysAgo != null ? dayOffset(now, s.shippedDaysAgo).toISOString() : undefined,
    };
  });

  return {
    projects,
    commits,
    ideas,
    connections: [],
    version: 1,
    updatedAt: now.toISOString(),
  };
}
