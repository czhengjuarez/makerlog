interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

export interface Env {
  ASSETS: Fetcher;
  GITHUB_TOKEN?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  CACHE?: any;
}

const GH_API = 'https://api.github.com';
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
  'Cache-Control': 'public, max-age=3600',
};
const DAY = 86_400_000;

function ghFetch(path: string, token: string, search = '') {
  const url = new URL(`${GH_API}${path}`);
  if (search) url.search = search;
  return fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'makerlog-worker/1.0',
    },
  });
}

async function computeStats(token: string) {
  // 1. Authenticated user
  const userRes = await ghFetch('/user', token);
  const user = await userRes.json() as { login: string };

  // 2. All repos with pagination — same approach as the makerlog frontend.
  //    No hard cap: instead we skip repos whose pushed_at predates the window
  //    (they can't have recent commits). This avoids the old slice(0,40) bug
  //    that silently dropped repos beyond the 40th position.
  const since = new Date(Date.now() - 84 * DAY).toISOString();
  type Repo = { name: string; owner: { login: string }; archived: boolean; pushed_at: string };
  const allRepos: Repo[] = [];
  for (let page = 1; page <= 5; page++) {
    const res = await ghFetch('/user/repos', token,
      `affiliation=owner,collaborator,organization_member&per_page=100&sort=pushed&page=${page}`);
    if (!res.ok) break;
    const batch = await res.json() as Repo[];
    if (!Array.isArray(batch) || batch.length === 0) break;
    allRepos.push(...batch);
    if (batch.length < 100) break;
  }

  // Only probe repos that had a push within the window
  const activeRepos = allRepos.filter(r => !r.archived && r.pushed_at >= since);

  // 3. Commits — no `author` filter in the GitHub API call.
  //    GitHub's author param only matches emails linked to the account, so it
  //    silently drops commits made under a work email, breaking streak chains.
  //    This mirrors the makerlog frontend's explicit choice to omit the filter.
  const allCommits: Array<{ timestamp: string; projectId: string }> = [];

  await Promise.all(activeRepos.map(async (repo) => {
    try {
      const res = await ghFetch(
        `/repos/${repo.owner.login}/${repo.name}/commits`,
        token,
        `since=${since}&per_page=100`
      );
      if (!res.ok) return;
      const commits = await res.json() as Array<{ commit: { author: { date: string } } }>;
      for (const c of commits) {
        allCommits.push({ timestamp: c.commit.author.date, projectId: repo.name });
      }
    } catch { /* skip */ }
  }));

  // 4. Streak — keyed by calendar day in Pacific time so it matches the
  //    makerlog frontend, which uses the browser's local clock. Without this,
  //    commits made in the evening PDT are attributed to the next UTC day and
  //    the streak count diverges from what the makerlog site shows.
  function dayKeyPT(date: Date): string {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(date);
    const m = Object.fromEntries(parts.map(p => [p.type, p.value]));
    return `${m.year}-${m.month}-${m.day}`;
  }

  function prevDayKey(key: string): string {
    const [y, mo, d] = key.split('-').map(Number);
    const dt = new Date(y, mo - 1, d, 12); // local noon avoids DST edge cases
    dt.setDate(dt.getDate() - 1);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  }

  const daySet = new Set(allCommits.map(c => dayKeyPT(new Date(c.timestamp))));
  const todayKey = dayKeyPT(new Date());
  const yestKey  = prevDayKey(todayKey);

  const startKey = daySet.has(todayKey) ? todayKey
                 : daySet.has(yestKey)  ? yestKey
                 : null;
  let streak = 0;
  if (startKey) {
    let key = startKey;
    while (daySet.has(key)) {
      streak++;
      key = prevDayKey(key);
    }
  }

  // 5. Velocity: recent 42d vs prior 42d
  const cutoff84 = Date.now() - 84 * DAY;
  const cutoff42 = Date.now() - 42 * DAY;
  const recent = allCommits.filter(c => new Date(c.timestamp).getTime() >= cutoff42).length;
  const prior = allCommits.filter(c => {
    const t = new Date(c.timestamp).getTime();
    return t >= cutoff84 && t < cutoff42;
  }).length;
  const velocityDelta = prior === 0 ? 0 : Math.round(((recent - prior) / prior) * 100);
  const activeProjects = new Set(
    allCommits
      .filter(c => new Date(c.timestamp).getTime() >= cutoff84)
      .map(c => c.projectId)
  ).size;

  return {
    streak,
    commits12Weeks: allCommits.length,
    activeProjects,
    velocityDelta,
    updatedAt: new Date().toISOString(),
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // ── /api/stats — cached GitHub streak + commit stats ─────────────────
    if (url.pathname === '/api/stats') {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET',
            'Access-Control-Max-Age': '86400',
          },
        });
      }

      // Try KV cache (1h TTL) — key versioned so timezone fix takes effect immediately
      const cached = env.CACHE ? await env.CACHE.get('gh:stats:v3') : null;
      if (cached) return new Response(cached, { headers: CORS_HEADERS });

      if (!env.GITHUB_TOKEN) {
        return new Response(
          JSON.stringify({ error: 'GITHUB_TOKEN not set' }),
          { status: 503, headers: CORS_HEADERS }
        );
      }

      try {
        const stats = await computeStats(env.GITHUB_TOKEN);
        const json = JSON.stringify(stats);
        if (env.CACHE) await env.CACHE.put('gh:stats:v3', json, { expirationTtl: 3600 });
        return new Response(json, { headers: CORS_HEADERS });
      } catch (e) {
        return new Response(
          JSON.stringify({ error: String(e) }),
          { status: 500, headers: CORS_HEADERS }
        );
      }
    }

    // ── /api/gh/* — proxy to GitHub with token ────────────────────────────
    if (url.pathname.startsWith('/api/gh/')) {
      if (!env.GITHUB_TOKEN) {
        return new Response(JSON.stringify({ error: 'GITHUB_TOKEN secret not configured' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const ghPath = url.pathname.slice('/api/gh'.length);
      const ghUrl = new URL(`${GH_API}${ghPath}`);
      ghUrl.search = url.search;

      const ghRes = await fetch(ghUrl.toString(), {
        headers: {
          Authorization: `Bearer ${env.GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'makerlog-worker/1.0',
        },
      });

      const respHeaders = new Headers();
      respHeaders.set('Content-Type', ghRes.headers.get('Content-Type') ?? 'application/json');
      const link = ghRes.headers.get('Link');
      if (link) respHeaders.set('Link', link);
      const sso = ghRes.headers.get('X-GitHub-SSO');
      if (sso) respHeaders.set('X-GitHub-SSO', sso);

      return new Response(ghRes.body, { status: ghRes.status, headers: respHeaders });
    }

    return env.ASSETS.fetch(request);
  },
};
