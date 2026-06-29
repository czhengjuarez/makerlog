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

  // 2. All repos (owner + collaborator + org member)
  const reposRes = await ghFetch('/user/repos', token,
    'affiliation=owner,collaborator,organization_member&per_page=100&sort=pushed');
  const repos = await reposRes.json() as Array<{
    name: string; owner: { login: string }; archived: boolean; fork: boolean;
  }>;

  // 3. Commits last 84 days from non-archived, non-fork repos (cap at 40)
  const since = new Date(Date.now() - 84 * DAY).toISOString();
  const activeRepos = repos.filter(r => !r.archived).slice(0, 40);

  const allCommits: Array<{ timestamp: string; projectId: string }> = [];

  await Promise.all(activeRepos.map(async (repo) => {
    try {
      const res = await ghFetch(
        `/repos/${repo.owner.login}/${repo.name}/commits`,
        token,
        `author=${user.login}&since=${since}&per_page=100`
      );
      if (!res.ok) return;
      const commits = await res.json() as Array<{ commit: { author: { date: string } } }>;
      for (const c of commits) {
        allCommits.push({ timestamp: c.commit.author.date, projectId: repo.name });
      }
    } catch { /* skip */ }
  }));

  // 4. Streak — local calendar days
  function localKey(iso: string) {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  const daySet = new Set(allCommits.map(c => localKey(c.timestamp)));

  const now = new Date();
  const cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);
  if (!daySet.has(localKey(cursor.toISOString()))) {
    cursor.setTime(cursor.getTime() - DAY);
  }
  let streak = 0;
  while (daySet.has(localKey(cursor.toISOString()))) {
    streak++;
    cursor.setTime(cursor.getTime() - DAY);
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

      // Try KV cache (1h TTL)
      const cached = env.CACHE ? await env.CACHE.get('gh:stats') : null;
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
        if (env.CACHE) await env.CACHE.put('gh:stats', json, { expirationTtl: 3600 });
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
