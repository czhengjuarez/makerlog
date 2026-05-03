/**
 * GitHub REST v3 client — read-only.
 *
 * Browser-side. Uses a Personal Access Token (classic or fine-grained) sent
 * via the `Authorization: Bearer` header. Pagination follows the standard
 * `Link: ...; rel="next"` convention.
 *
 * Notes for SSO-enforced orgs:
 *   When a PAT hasn't been authorized for an SSO org, GitHub responds with
 *   403 + `X-GitHub-SSO: required; url=<authorize-url>`. We surface that
 *   URL so the user can one-click fix it.
 */
import type { Commit, Project, ProjectType } from '../data/types';

export interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url?: string;
  html_url?: string;
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string; // owner/repo
  private: boolean;
  fork: boolean;
  archived: boolean;
  description: string | null;
  created_at: string;
  pushed_at: string;
  default_branch: string | null;
  html_url: string;
  owner: {
    login: string;
    type: 'User' | 'Organization';
  };
}

export interface GitHubCommit {
  sha: string;
  html_url: string;
  commit: {
    author: { name: string; email: string; date: string };
    committer: { name: string; email: string; date: string };
    message: string;
  };
  author: { login?: string; id?: number } | null;
}

export class GitHubError extends Error {
  status: number;
  body: string;
  ssoUrl?: string;
  constructor(message: string, status: number, body = '', ssoUrl?: string) {
    super(message);
    this.name = 'GitHubError';
    this.status = status;
    this.body = body;
    this.ssoUrl = ssoUrl;
  }
}

interface GHResponse<T> {
  data: T;
  link: string;
  ssoUrl?: string;
}

const API_BASE = 'https://api.github.com';

async function gh<T>(
  token: string,
  path: string,
  params?: Record<string, string | number>,
  signal?: AbortSignal,
  apiBase = API_BASE,
): Promise<GHResponse<T>> {
  const raw = path.startsWith('http') ? path : `${apiBase}${path}`;
  const url = raw.startsWith('http') ? new URL(raw) : new URL(raw, location.origin);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v));
    }
  }
  let res: Response;
  try {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    res = await fetch(url.toString(), { headers, signal });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new GitHubError(`Couldn't reach api.github.com. Check your network. (${msg})`, 0);
  }

  // SSO-required orgs respond 403 with a special header pointing to the
  // authorize URL. We surface that to the UI as a clickable fix.
  const ssoHeader = res.headers.get('X-GitHub-SSO');
  let ssoUrl: string | undefined;
  if (ssoHeader && ssoHeader.includes('required')) {
    const m = ssoHeader.match(/url=([^,;\s]+)/);
    if (m) ssoUrl = m[1];
  }

  if (!res.ok) {
    let body = '';
    try {
      body = await res.text();
    } catch {
      /* ignore */
    }
    let nice = `GitHub returned ${res.status}.`;
    if (res.status === 401) nice = 'Token rejected (401). Check your Personal Access Token.';
    else if (res.status === 403 && ssoUrl) {
      nice = `Your token isn't authorized for at least one SSO-enforced organization. Authorize it at the link below, then retry.`;
    } else if (res.status === 403) {
      nice = 'Forbidden (403). The token may be missing the `repo` scope, or you hit the rate limit.';
    } else if (res.status === 404) {
      nice = 'Not found (404). The user, repo, or path may not exist.';
    } else if (res.status === 422) {
      nice = 'Unprocessable (422). The request was well-formed but rejected — often "Git repository is empty".';
    }
    throw new GitHubError(nice, res.status, body, ssoUrl);
  }
  return {
    data: (await res.json()) as T,
    link: res.headers.get('Link') ?? '',
    ssoUrl,
  };
}

async function paginate<T>(
  token: string,
  path: string,
  params: Record<string, string | number>,
  maxPages: number,
  signal?: AbortSignal,
  apiBase = API_BASE,
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const { data, link } = await gh<T[]>(token, path, { ...params, per_page: 100, page }, signal, apiBase);
    if (!Array.isArray(data)) break;
    out.push(...data);
    if (data.length < 100) break;
    if (link && !link.includes('rel="next"')) break;
  }
  return out;
}

export async function getCurrentUser(token: string, signal?: AbortSignal, apiBase = API_BASE) {
  const { data } = await gh<GitHubUser>(token, '/user', undefined, signal, apiBase);
  return data;
}

interface GitHubEmailEntry {
  email: string;
  primary: boolean;
  verified: boolean;
  visibility: string | null;
}

/**
 * List the authenticated user's emails (verified ones).
 *
 * Requires the `user:email` (or `read:user`) scope. If the PAT doesn't have
 * it, we soft-fail and return an empty array — caller falls back to login +
 * `user.email` matching only.
 */
export async function listUserEmails(token: string, signal?: AbortSignal, apiBase = API_BASE): Promise<string[]> {
  try {
    const { data } = await gh<GitHubEmailEntry[]>(token, '/user/emails', undefined, signal, apiBase);
    return data.filter((e) => e.verified).map((e) => e.email.toLowerCase());
  } catch {
    return [];
  }
}

/**
 * List the authenticated user's repositories.
 *
 * `affiliation` defaults to all three roles so we capture forks-you-pushed-to,
 * org repos you contribute to, plus your own. The user can narrow this in a
 * later UI cut if needed.
 */
export async function listUserRepos(
  token: string,
  options: {
    affiliation?: 'owner' | 'owner,collaborator,organization_member';
    visibility?: 'all' | 'public' | 'private';
  } = {},
  signal?: AbortSignal,
  apiBase = API_BASE,
) {
  return paginate<GitHubRepo>(
    token,
    '/user/repos',
    {
      affiliation: options.affiliation ?? 'owner,collaborator,organization_member',
      visibility: options.visibility ?? 'all',
      sort: 'pushed',
      direction: 'desc',
    },
    10,
    signal,
    apiBase,
  );
}

/**
 * List commits in a repo since a date.
 *
 * We deliberately don't pass GitHub's `author` query param — that filter
 * matches by GitHub-account-linked email only, which silently drops commits
 * authored under emails that aren't on the user's GitHub account (very common
 * for work emails or older personal addresses). Instead the caller filters
 * client-side against the user's full email set + login.
 *
 * Empty repos return 409 — caller swallows that.
 */
export async function listRepoCommits(
  token: string,
  fullName: string, // "owner/repo"
  sinceISO: string,
  signal?: AbortSignal,
  apiBase = API_BASE,
) {
  return paginate<GitHubCommit>(
    token,
    `/repos/${fullName}/commits`,
    { since: sinceISO },
    10,
    signal,
    apiBase,
  );
}

export interface FetchProgress {
  phase: 'auth' | 'projects' | 'commits' | 'done';
  message: string;
  projectsTotal?: number;
  projectsDone?: number;
  commitsTotal?: number;
}

export interface GitHubSnapshot {
  user: GitHubUser;
  emails: string[];
  repos: Array<{ repo: GitHubRepo; commits: GitHubCommit[] }>;
  totalCommits: number;
  /** Repos we listed but excluded — for diagnostics in the success UI. */
  skipped: Array<{ repo: GitHubRepo; reason: 'archived' | 'stale' | 'empty' | 'no-mine' | 'error' }>;
}

export interface FetchOptions {
  token: string;
  windowDays?: number;
  concurrency?: number;
  /**
   * If true, post-filter commits to those authored by the authenticated user
   * (matched against verified emails + GitHub login + committer field).
   *
   * Default: false. GitHub only knows the emails attached to your account,
   * so any commits you made under unlinked emails (work addresses, older
   * personal addresses, etc.) would be silently dropped. For a maker journal,
   * "all commits in repos I have access to" is the more honest view — the
   * vast majority will be yours, and ones from co-contributors still
   * represent activity in your builder graph.
   */
  onlyMine?: boolean;
  onProgress?: (p: FetchProgress) => void;
  signal?: AbortSignal;
  /**
   * Override the GitHub API base URL. Set to '/api/gh' to route requests
   * through the Cloudflare Worker proxy (which injects the secret token).
   * Leave unset to call api.github.com directly with `token`.
   */
  apiBase?: string;
}

export async function fetchGitHubSnapshot(opts: FetchOptions): Promise<GitHubSnapshot> {
  const days = opts.windowDays ?? 365;
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const onP = opts.onProgress ?? (() => {});
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 4, 8));
  const onlyMine = opts.onlyMine ?? false;
  const apiBase = opts.apiBase ?? API_BASE;

  onP({ phase: 'auth', message: 'Verifying token…' });
  const user = await getCurrentUser(opts.token, opts.signal, apiBase);

  // Pull the user's verified emails so we can match commits authored under
  // emails that aren't linked to their GitHub account.
  const emails = await listUserEmails(opts.token, opts.signal, apiBase);
  const identitySet = new Set<string>();
  if (user.email) identitySet.add(user.email.toLowerCase());
  for (const e of emails) identitySet.add(e);
  const userLogin = user.login.toLowerCase();

  onP({ phase: 'projects', message: `Listing repositories for @${user.login}…` });
  const repos = await listUserRepos(opts.token, {}, opts.signal, apiBase);

  // Sort repos into buckets up front so the progress UI is honest about
  // how many we'll actually probe.
  const skipped: GitHubSnapshot['skipped'] = [];
  const candidates: GitHubRepo[] = [];
  for (const r of repos) {
    if (r.archived) {
      skipped.push({ repo: r, reason: 'archived' });
      continue;
    }
    // pushed_at is updated on any push. If the repo's last push predates
    // our window, no commits in window — skip without an API call. This
    // also eliminates the 409 noise from never-pushed empty repos
    // (their pushed_at equals created_at and is usually old).
    if (r.pushed_at && r.pushed_at < since) {
      skipped.push({ repo: r, reason: 'stale' });
      continue;
    }
    candidates.push(r);
  }

  if (!candidates.length) {
    onP({
      phase: 'done',
      message: 'No repos with activity in window.',
      projectsTotal: 0,
      projectsDone: 0,
    });
    return { user, emails, repos: [], totalCommits: 0, skipped };
  }

  onP({
    phase: 'commits',
    message: `Probing ${candidates.length} repo${candidates.length === 1 ? '' : 's'}…`,
    projectsTotal: candidates.length,
    projectsDone: 0,
  });

  const result: Array<{ repo: GitHubRepo; commits: GitHubCommit[] }> = [];
  let done = 0;
  let totalCommits = 0;
  const queue = [...candidates];

  function isMine(c: GitHubCommit): boolean {
    const authorEmail = c.commit.author?.email?.toLowerCase();
    const committerEmail = c.commit.committer?.email?.toLowerCase();
    const authorLogin = c.author?.login?.toLowerCase();
    if (authorLogin && authorLogin === userLogin) return true;
    if (authorEmail && identitySet.has(authorEmail)) return true;
    if (committerEmail && identitySet.has(committerEmail)) return true;
    return false;
  }

  async function worker() {
    while (queue.length) {
      const r = queue.shift();
      if (!r) break;
      let raw: GitHubCommit[] = [];
      let errored = false;
      try {
        raw = await listRepoCommits(opts.token, r.full_name, since, opts.signal, apiBase);
      } catch (err) {
        if (err instanceof GitHubError && err.status === 401) throw err;
        // 409 = empty repo, 404 = inaccessible, 403 = SSO/scope. All non-fatal.
        errored = err instanceof GitHubError && err.status !== 409;
        raw = [];
      }
      const commits = onlyMine ? raw.filter(isMine) : raw;
      if (commits.length) {
        result.push({ repo: r, commits });
        totalCommits += commits.length;
      } else if (errored) {
        skipped.push({ repo: r, reason: 'error' });
      } else if (raw.length === 0) {
        skipped.push({ repo: r, reason: 'empty' });
      } else {
        skipped.push({ repo: r, reason: 'no-mine' });
      }
      done++;
      onP({
        phase: 'commits',
        message: `Probing repos… ${done}/${candidates.length}`,
        projectsTotal: candidates.length,
        projectsDone: done,
        commitsTotal: totalCommits,
      });
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));

  onP({
    phase: 'done',
    message: `Done — ${totalCommits} commit${totalCommits === 1 ? '' : 's'} across ${result.length} repo${result.length === 1 ? '' : 's'}.`,
    projectsTotal: candidates.length,
    projectsDone: done,
    commitsTotal: totalCommits,
  });

  return { user, emails, repos: result, totalCommits, skipped };
}

/**
 * Map a GitHub snapshot into makerlog's domain types.
 *
 * Type heuristic:
 *   - org-owned       → 'work'
 *   - user-owned fork → 'experiment'
 *   - user-owned      → 'personal'
 * The user can re-tag later by editing the JSON or in a future UI cut.
 */
export function snapshotToProjectsAndCommits(snap: GitHubSnapshot): {
  projects: Project[];
  commits: Commit[];
} {
  const projects: Project[] = [];
  const commits: Commit[] = [];
  for (const { repo, commits: rCommits } of snap.repos) {
    if (!rCommits.length) continue;
    const type: ProjectType =
      repo.owner.type === 'Organization' ? 'work' : repo.fork ? 'experiment' : 'personal';
    const id = `gh-${repo.id}`;
    projects.push({
      id,
      name: repo.name,
      type,
      provider: 'github',
      slug: repo.full_name,
      createdAt: repo.created_at,
      description: repo.description ?? undefined,
    });
    for (const c of rCommits) {
      commits.push({
        id: `gh-${repo.id}-${c.sha}`,
        projectId: id,
        timestamp: c.commit.author.date,
        message: c.commit.message.split('\n')[0], // subject only
        sha: c.sha.slice(0, 7),
      });
    }
  }
  commits.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return { projects, commits };
}
