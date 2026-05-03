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

**6. Deploy**

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
