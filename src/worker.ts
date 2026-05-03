interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

export interface Env {
  ASSETS: Fetcher;
  GITHUB_TOKEN?: string;
}

const GH_API = 'https://api.github.com';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

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
