# makerlog

Your builder journal. Log what you ship, track your ideas, and see your maker velocity come alive — with three signature views instead of the same old GitHub contribution grid.

**Live demo:** [makerlog.coscient.workers.dev](https://makerlog.coscient.workers.dev)

Built with React + Vite + TypeScript, deployed on Cloudflare Workers.

---

## Are you here to contribute, or to make your own?

Two very different paths — pick the right one before you start.

### "I want my own makerlog that shows my GitHub data"
→ **[Fork it](#fork-it--make-it-yours)** — you'll have your own deployed instance at your own URL, showing your commits, in about 10 minutes.

### "I want to improve makerlog itself and share that back"
→ **[Clone and contribute](#clone--contribute)** — you'll run it locally, make your changes, and open a pull request against this repo.

---

## What it does

**makerlog** turns your commit history into a living record of how you build.

- **Projects** — five types: `work`, `personal`, `tool`, `experiment`, `production`. Filter and compare side by side.
- **Ideas** — move ideas through `idea → building → shipped → parked`. Ship rate updates in real time.
- **Build streaks** — current streak and personal best, from your actual commit dates.
- **Three views:**
  - **Garden** — each project is a plant. Stems grow with commits. Shipped ideas bloom.
  - **River** — 90-day stream graph. Bands swell on busy days, thin on quiet ones.
  - **Blueprint** — a skyline of what you've built. Height = commits, foundation = streak.

---

## Fork it — make it yours

Use this path if you want **your own deployed instance** showing your GitHub data. You won't be contributing code back — you're spinning up your own copy.

### What you need
- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier is fine)
- A GitHub Personal Access Token (PAT)
- Node.js 18+

### Steps

**1. Fork the repo**

Click **Fork** on GitHub. This gives you your own copy at `github.com/your-username/makerlog` that you fully own and can modify freely.

**2. Clone your fork**

```bash
git clone https://github.com/your-username/makerlog
cd makerlog
npm install
```

**3. Set up Cloudflare**

```bash
npx wrangler login        # opens browser — log in to your Cloudflare account
```

Edit `wrangler.toml` — replace the `account_id` with your own (shown after login, or run `wrangler whoami`):

```toml
account_id = "your-cloudflare-account-id"
```

**4. Create your GitHub PAT**

Go to [github.com/settings/tokens/new](https://github.com/settings/tokens/new):
- Name it `makerlog`
- Select scopes: `repo` + `read:user`
- Click **Generate token** and copy it

**5. Store the token as a Worker secret**

```bash
npx wrangler secret put GITHUB_TOKEN
# paste your PAT when prompted — it's stored encrypted in Cloudflare, never in your code
```

**6. Set your timezone**

The Worker computes streak day boundaries in a specific timezone. The live demo uses **Pacific time**; for your own instance, open `src/worker.ts` and change the `timeZone` value in `dayKeyPT` to your local timezone (any [IANA zone name](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones)):

```typescript
// src/worker.ts — find dayKeyPT() and change the timeZone string
new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', // ← replace with your zone, e.g. Europe/London
  ...
})
```

If you skip this step the streak will still work, but day boundaries may not align with your local midnight.

**7. Deploy**

```bash
npm run deploy
```

Your instance will be live at `https://makerlog.<your-worker-name>.workers.dev`.

On first visit it auto-loads your GitHub commit history. Future visits are instant (cached in localStorage). Use the **Demo data** button in the header to preview synthetic data without losing your real data.

### Bringing in data from GitLab or local repos

If you also use GitLab or have repos that aren't on GitHub, click **Connect repo** in the header and enter a GitLab PAT, or run the local importer:

```bash
npm run import:git -- ~/path/to/your/code
```

Then click **Import** in the app and select the generated file. Works with any git host — GitHub, GitLab, Bitbucket, self-hosted, enterprise SSO.

### Making it permanent (your changes won't be overwritten)

Because you forked — not cloned — your changes live in your own repo. Deploying again just runs `npm run deploy`. The `GITHUB_TOKEN` secret persists in Cloudflare across deploys; you only set it once.

If you ever lose your local copy:
```bash
git clone https://github.com/your-username/makerlog
npm install
npm run deploy   # the secret is already in Cloudflare
```

---

## Clone & contribute

Use this path if you want to **improve makerlog itself** — fix a bug, add a viz, improve the import script — and open a pull request.

### Steps

**1. Clone this repo (not a fork)**

```bash
git clone https://github.com/czhengjuarez/makerlog
cd makerlog
npm install
npm run dev
```

Open `http://localhost:5174`. The app seeds with ~13 months of demo data so every view is populated immediately.

**2. Make your changes**

The codebase is small and typed end-to-end. Key entry points:

| What you want to change | Where |
|---|---|
| A new visualisation | `src/components/viz/` |
| Data shape / state | `src/data/types.ts` + `src/data/store.tsx` |
| GitHub / GitLab fetching | `src/lib/github.ts` / `src/lib/gitlab.ts` |
| The Worker proxy | `src/worker.ts` |
| Local git importer | `scripts/import-from-git.mjs` |
| Styles / design tokens | `src/styles/` |

**3. Test your build**

```bash
npm run build      # type-check + production build
npm run preview    # serve the production build locally
```

**4. Open a pull request**

Push your branch to your fork (or a branch on this repo if you have access) and open a PR. Describe what changed and why.

### Why not just fork for contributing?

You can fork and PR — that's the standard GitHub flow. The distinction above is about intent: if you're building *your own thing* on top of this, fork. If you're improving *this thing*, clone or fork and PR back.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server on `:5174` |
| `npm run build` | Type-check + production build |
| `npm run preview` | Serve the production build locally |
| `npm run deploy` | Build + deploy to Cloudflare Workers |
| `npm run typecheck` | Strict TS check, no emit |
| `npm run import:git -- <path>` | Scan local repos and export a JSON snapshot |

---

## Architecture

```
src/
├── worker.ts         Cloudflare Worker — proxies /api/gh/* to GitHub with secret token
├── data/
│   ├── types.ts      Project / Commit / Idea / Connection / state
│   ├── source.ts     DataSource interface + LocalDataSource
│   ├── mock.ts       Deterministic 13-month demo generator
│   └── store.tsx     React context + reducer, auto-boots from Worker proxy on first visit
├── lib/
│   ├── github.ts     GitHub REST API client (supports direct token or Worker proxy)
│   ├── gitlab.ts     GitLab REST API client
│   ├── streak.ts     Current / longest streak math
│   ├── stats.ts      Daily buckets, velocity index, ship ratio
│   └── format.ts     Date / number helpers
└── components/
    ├── Header.tsx        Brand, theme toggle, demo toggle, connect
    ├── ConnectModal.tsx  GitHub / GitLab PAT modal
    └── viz/
        ├── Garden.tsx    Botanical project visualisation
        ├── River.tsx     Stream graph
        └── Blueprint.tsx Skyline blueprint

scripts/
└── import-from-git.mjs  Local git-log → makerlog JSON (zero deps)
```

### How the GitHub token works

The `GITHUB_TOKEN` secret lives in Cloudflare Workers — it never touches the browser. When the app first loads with no cached data, it calls `/api/gh/*` on your Worker, which proxies the request to `api.github.com` and injects the token server-side. The browser gets GitHub data back, but never sees the token.

If the secret isn't configured (e.g. local dev), the proxy returns `503` and the app falls back to demo data silently.

### How data refresh works (and how to add a real cron)

By default, makerlog refreshes data **client-side on every page load**:

1. Load cached data from `localStorage` immediately (no flash)
2. Make a single cheap call to `/user/repos?per_page=1&sort=pushed` to check if any repo was pushed since the last sync
3. If a new push is detected **or** the cache is older than 24 h, fetch a fresh snapshot in the background

This means data stays current as long as someone opens the site — good enough for a personal tool.

**If you want a true background cron** (data refreshes even when the site isn't open, and is instantly fresh for every visitor), you need to add server-side storage:

1. **Create a KV namespace** (or D1 database) in your Cloudflare account:
   ```bash
   npx wrangler kv:namespace create makerlog_cache
   ```

2. **Bind it in `wrangler.toml`:**
   ```toml
   [[kv_namespaces]]
   binding = "CACHE"
   id = "your-namespace-id"

   [triggers]
   crons = ["0 4 * * *"]   # 4 AM UTC daily
   ```

3. **Add a `scheduled` handler to `src/worker.ts`:**
   ```typescript
   export interface Env {
     ASSETS: Fetcher;
     CACHE: KVNamespace;
     GITHUB_TOKEN?: string;
   }

   export default {
     async fetch(request, env) { /* existing proxy code */ },

     async scheduled(_event, env, ctx) {
       if (!env.GITHUB_TOKEN) return;
       const snap = await fetchGitHubSnapshot({
         token: env.GITHUB_TOKEN,
         windowDays: 365,
       });
       ctx.waitUntil(
         env.CACHE.put('snapshot', JSON.stringify(snap), { expirationTtl: 90000 })
       );
     },
   };
   ```

4. **Serve the cached snapshot** from the `/api/gh/*` handler instead of proxying live, or add a `/api/snapshot` endpoint the client reads on boot.

The client-side `LocalDataSource` in `src/data/source.ts` would be replaced (or extended) with a `WorkerDataSource` — the interface is already stubbed out and ready to drop in.

### `/api/stats` — public stats endpoint

`GET https://makerlog.coscient.workers.dev/api/stats`

Returns a JSON snapshot of the current GitHub activity summary — the same numbers shown in the top card of the app:

```json
{
  "streak": 12,
  "commits12Weeks": 87,
  "activeProjects": 6,
  "velocityDelta": 34,
  "updatedAt": "2026-06-28T10:00:00.000Z"
}
```

| Field | Description |
|---|---|
| `streak` | Current commit streak in calendar days |
| `commits12Weeks` | Total commits across all repos in the last 84 days |
| `activeProjects` | Number of distinct repos with at least one commit in the last 84 days |
| `velocityDelta` | Percentage change in commits: last 42 days vs the prior 42 days |
| `updatedAt` | ISO timestamp of when this snapshot was computed |

**CORS:** `Access-Control-Allow-Origin: *` — any external site can fetch this directly from the browser.

**Caching:** Results are stored in a Cloudflare KV namespace (`CACHE`, key `gh:stats:v2`) with a 1-hour TTL, so the GitHub API is only hit at most once per hour regardless of how many callers hit the endpoint.

**Implementation:** The endpoint lives in `src/worker.ts`. It fetches the authenticated user, pulls up to 40 non-archived repos, collects commits from the last 84 days, then computes streak, velocity, and project counts server-side. The `GITHUB_TOKEN` secret never leaves the Worker.

**Timezone:** The live site at makerlog.coscient.workers.dev computes day boundaries in **Pacific time (America/Los_Angeles)**. Streak counts shown here and on changyingart.com both use Pacific midnight as the day boundary — so if you're in a different timezone, a commit you make just after local midnight may not count toward your streak until it crosses Pacific midnight. If you fork the repo you can change the timezone to your own (see [Set your timezone](#6-set-your-timezone) in the fork guide). The KV cache key is versioned (`v2`) so any timezone or logic change takes effect immediately on the next request without waiting for the old cache to expire.

#### Who uses this — changyingart.com

**[changyingart.com](https://changyingart.com)** is an art portfolio site that displays a live maker status card alongside the creative work. The card shows the current build streak, total commits over the past 12 weeks, and velocity trend — pulled directly from this endpoint on every page load.

**Why this matters:** The two sites represent two sides of the same maker — the art and the code. Surfacing the commit streak and velocity on the art portfolio makes the builder identity visible in context: a visitor to changyingart.com can see not just finished work, but the ongoing cadence of building. It closes the loop between shipping code and showing up creatively.

**How the sync works:**

```
changyingart.com (browser)
  │
  └─ fetch("https://makerlog.coscient.workers.dev/api/stats")
        │
        ├─ KV hit (within 1h) → return cached JSON immediately
        │
        └─ KV miss → call GitHub API → compute stats → store in KV → return JSON
```

1. The changyingart.com page makes a plain `fetch()` call to `/api/stats` on load — no backend required on that side, no API keys needed, no GitHub credentials exposed.
2. The makerlog Worker handles all the GitHub authentication and computation server-side.
3. The KV cache means the response is near-instant for all callers after the first hit each hour — both sites effectively share the same cached result.
4. Because both sites derive streak from the same Pacific-time logic, the number shown on changyingart.com always matches what makerlog shows.

**No duplication of logic:** changyingart.com consumes data only — it never fetches GitHub directly, never computes streaks, and never needs its own token. All the calculation lives in one place (`src/worker.ts`), so any improvement to streak logic or velocity math automatically reflects on both sites after the next cache refresh.

If you fork makerlog for your own instance, your equivalent endpoint will be at `https://makerlog.<your-worker-name>.workers.dev/api/stats` and any external site you own can consume it the same way.

---

## Roadmap

- [ ] Webhook ingestion for real-time commit updates
- [ ] AI weekly recap ("you shipped 3 things, river dipped Wednesday")
- [ ] More viz: constellation view, per-type river
- [ ] PWA + offline-first

---

## Credits

- Icons: [Lucide](https://lucide.dev)
- Animation: [framer-motion](https://www.framer.com/motion/)
