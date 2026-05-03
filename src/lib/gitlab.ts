/**
 * GitLab REST v4 client — read-only.
 *
 * Designed for browser use with a Personal Access Token. The token is sent
 * via the `PRIVATE-TOKEN` header. Nothing is proxied through a server in
 * this build; it lives in the user's browser.
 *
 * Pagination: GitLab returns `Link` headers with `rel="next"`, but we also
 * stop early when a page comes back smaller than `per_page` (max 100).
 */
import type { Commit, Project, ProjectType } from '../data/types';

export interface GitLabUser {
  id: number;
  username: string;
  name: string;
  avatar_url?: string;
  web_url?: string;
}

export interface GitLabProject {
  id: number;
  name: string;
  path: string;
  path_with_namespace: string;
  description: string | null;
  created_at: string;
  default_branch: string | null;
  namespace: { kind: 'user' | 'group'; path: string; full_path?: string };
  web_url: string;
  visibility: 'private' | 'internal' | 'public';
  last_activity_at: string;
  topics?: string[];
  archived?: boolean;
}

export interface GitLabCommit {
  id: string;
  short_id: string;
  created_at: string;
  title: string;
  message: string;
  author_name: string;
  author_email: string;
  /** Only present when fetching a single commit; not in list endpoint */
  stats?: { additions: number; deletions: number; total: number };
}

export class GitLabError extends Error {
  status: number;
  body: string;
  constructor(message: string, status: number, body = '') {
    super(message);
    this.name = 'GitLabError';
    this.status = status;
    this.body = body;
  }
}

interface GLResponse<T> {
  data: T;
  link: string;
}

async function gl<T>(
  host: string,
  token: string,
  path: string,
  params?: Record<string, string | number>,
  signal?: AbortSignal,
): Promise<GLResponse<T>> {
  const base = host.replace(/\/$/, '');
  const url = new URL(`${base}/api/v4${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v));
    }
  }
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      headers: { 'PRIVATE-TOKEN': token, Accept: 'application/json' },
      signal,
    });
  } catch (err) {
    // Network error — most often CORS or DNS / offline.
    const msg = err instanceof Error ? err.message : String(err);
    throw new GitLabError(
      `Couldn't reach ${base}. Check the host URL and your network. (${msg})`,
      0,
    );
  }
  if (!res.ok) {
    let body = '';
    try {
      body = await res.text();
    } catch {
      /* ignore */
    }
    let nice = `GitLab returned ${res.status}.`;
    if (res.status === 401) nice = 'Token rejected (401). Check your Personal Access Token.';
    else if (res.status === 403) nice = 'Forbidden (403). The token is missing required scopes (read_api, read_user, read_repository).';
    else if (res.status === 404) nice = 'Not found (404). The user or path may not exist on this host.';
    else if (res.status === 429) nice = 'Rate limited (429). Wait a minute and try again.';
    throw new GitLabError(nice, res.status, body);
  }
  return { data: (await res.json()) as T, link: res.headers.get('Link') ?? '' };
}

async function paginate<T>(
  host: string,
  token: string,
  path: string,
  params: Record<string, string | number>,
  maxPages: number,
  signal?: AbortSignal,
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const { data, link } = await gl<T[]>(host, token, path, { ...params, per_page: 100, page }, signal);
    if (!Array.isArray(data)) break;
    out.push(...data);
    if (data.length < 100) break;
    if (link && !link.includes('rel="next"')) break;
  }
  return out;
}

export async function getCurrentUser(host: string, token: string, signal?: AbortSignal) {
  const { data } = await gl<GitLabUser>(host, token, '/user', undefined, signal);
  return data;
}

export async function listUserProjects(
  host: string,
  token: string,
  userId: number,
  signal?: AbortSignal,
) {
  return paginate<GitLabProject>(
    host,
    token,
    `/users/${userId}/projects`,
    { order_by: 'last_activity_at', sort: 'desc' },
    5,
    signal,
  );
}

export async function listProjectCommits(
  host: string,
  token: string,
  projectId: number,
  sinceISO: string,
  signal?: AbortSignal,
) {
  return paginate<GitLabCommit>(
    host,
    token,
    `/projects/${projectId}/repository/commits`,
    { since: sinceISO, all: 'true' },
    10,
    signal,
  );
}

export interface FetchProgress {
  phase: 'auth' | 'projects' | 'commits' | 'done';
  message: string;
  projectsTotal?: number;
  projectsDone?: number;
  commitsTotal?: number;
}

export interface GitLabSnapshot {
  user: GitLabUser;
  host: string;
  projects: Array<{ project: GitLabProject; commits: GitLabCommit[] }>;
  totalCommits: number;
}

export interface FetchOptions {
  host: string;
  token: string;
  windowDays?: number;
  concurrency?: number;
  onProgress?: (p: FetchProgress) => void;
  signal?: AbortSignal;
}

export async function fetchGitLabSnapshot(opts: FetchOptions): Promise<GitLabSnapshot> {
  const host = (opts.host || 'https://gitlab.com').trim();
  const days = opts.windowDays ?? 365;
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const onP = opts.onProgress ?? (() => {});
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 4, 8));

  onP({ phase: 'auth', message: 'Verifying token…' });
  const user = await getCurrentUser(host, opts.token, opts.signal);

  onP({ phase: 'projects', message: `Listing projects for @${user.username}…` });
  const projects = await listUserProjects(host, opts.token, user.id, opts.signal);
  // Skip archived projects — they pollute the timeline.
  const active = projects.filter((p) => !p.archived);

  if (!active.length) {
    onP({ phase: 'done', message: 'No projects found.', projectsTotal: 0, projectsDone: 0 });
    return { user, host, projects: [], totalCommits: 0 };
  }

  onP({
    phase: 'commits',
    message: `Found ${active.length} active project${active.length === 1 ? '' : 's'}, fetching commits…`,
    projectsTotal: active.length,
    projectsDone: 0,
  });

  const result: Array<{ project: GitLabProject; commits: GitLabCommit[] }> = [];
  let done = 0;
  let totalCommits = 0;
  const queue = [...active];

  async function worker() {
    while (queue.length) {
      const p = queue.shift();
      if (!p) break;
      let commits: GitLabCommit[] = [];
      try {
        commits = await listProjectCommits(host, opts.token, p.id, since, opts.signal);
      } catch (err) {
        // Common: 403 on private repos w/ wrong scope, 404 if no default branch yet.
        // Don't blow up the whole snapshot for a single bad project.
        if (err instanceof GitLabError && err.status === 401) throw err;
        commits = [];
      }
      result.push({ project: p, commits });
      done++;
      totalCommits += commits.length;
      onP({
        phase: 'commits',
        message: `Fetching commits… ${done}/${active.length}`,
        projectsTotal: active.length,
        projectsDone: done,
        commitsTotal: totalCommits,
      });
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));

  onP({
    phase: 'done',
    message: `Done — ${totalCommits} commit${totalCommits === 1 ? '' : 's'} across ${active.length} project${active.length === 1 ? '' : 's'}.`,
    projectsTotal: active.length,
    projectsDone: done,
    commitsTotal: totalCommits,
  });

  return { user, host, projects: result, totalCommits };
}

/**
 * Map a GitLab snapshot into makerlog's domain types.
 *
 * Heuristic: group-namespaced projects → 'work', user-namespaced → 'personal'.
 * Users can re-tag in the UI later — type is stored on the project record.
 */
export function snapshotToProjectsAndCommits(snap: GitLabSnapshot): {
  projects: Project[];
  commits: Commit[];
} {
  const projects: Project[] = [];
  const commits: Commit[] = [];
  for (const { project, commits: pCommits } of snap.projects) {
    if (!pCommits.length) continue;
    const type: ProjectType = project.namespace.kind === 'group' ? 'work' : 'personal';
    const id = `gl-${project.id}`;
    projects.push({
      id,
      name: project.name,
      type,
      provider: 'gitlab',
      slug: project.path_with_namespace,
      createdAt: project.created_at,
      description: project.description ?? undefined,
    });
    for (const c of pCommits) {
      commits.push({
        id: `gl-${project.id}-${c.id}`,
        projectId: id,
        timestamp: c.created_at,
        message: c.title || c.message,
        sha: c.short_id,
      });
    }
  }
  // Sort commits oldest → newest for stable rendering
  commits.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return { projects, commits };
}
