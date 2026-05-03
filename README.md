# makerlog

Your builder journal. Log what you ship, track your ideas, and see your maker velocity come alive — with three signature views instead of the same old GitHub contribution grid.

**Live demo:** [makerlog.coscient.workers.dev](https://makerlog.coscient.workers.dev)

Built with React + Vite + TypeScript. Local-first, no backend required, forkable.

---

## What it does

**makerlog** turns your commit history and project list into a living record of how you build.

- **Projects** — log work across five types: `work`, `personal`, `tool`, `experiment`, `production`. Filter and compare them side by side.
- **Ideas** — move ideas through `idea → building → shipped → parked`. Your ship rate updates in real time.
- **Build streaks** — current streak and personal best, computed from your actual commit dates.
- **Three visualisations:**
  - **Garden** — each project is a plant. Stems grow thicker with commits. Shipped ideas bloom into flowers.
  - **River** — a 90-day stream graph. Bands swell on your busiest days; troughs show where you rested.
  - **Blueprint** — a skyline of everything you've built. Height = total commits, foundation depth = current streak.

---

## Quick start

```bash
git clone <this-repo>
cd makerlog
npm install
npm run dev
```

Open `http://localhost:5174`.

The app seeds itself with ~13 months of demo data on first run so every view looks alive immediately. Hit **Demo data** in the header any time to reseed. Use **Export** / **Import** to save or restore your data as a JSON file.

---

## Connect your real data

There are two ways to bring in your own commits. **Option A is recommended for most people** — it's faster, works offline, and doesn't require any tokens.

### Option A — local git repos (recommended)

Works for GitHub, GitLab, Bitbucket, self-hosted, enterprise SSO, and repos that have never been pushed anywhere.

Run the importer against any folder that contains your repos:

```bash
npm run import:git -- ~/path/to/your/code
```

This walks the folder recursively, finds every `.git` repo, reads commit history with `git log`, and writes a `makerlog-import.json` file. Then in the app click **Import** (top-right) and select the file.

By default it filters commits to your `git config user.email`. You can override this:

```bash
# all authors (good for solo repos)
npm run import:git -- ~/code --author=*

# a specific email
npm run import:git -- ~/code --author=you@example.com

# pull in more history
npm run import:git -- ~/code --since=2.years

# custom output path
npm run import:git -- ~/code --out=~/Desktop/my-data.json
```

Project type is inferred automatically (`work` for private/enterprise hosts, `personal` otherwise). You can re-tag anything in the UI after import.

---

### Option B — live API (GitHub or GitLab)

Pulls one year of your commits directly from the provider's API, entirely in your browser. Your token is held in memory only — never written to disk or sent anywhere else.

#### GitHub

1. Go to [github.com/settings/tokens/new](https://github.com/settings/tokens/new)
2. Give the token a name (e.g. `makerlog`)
3. Select scopes:
   - `repo` — for private repos
   - `public_repo` — for public repos only
   - `read:user` — to identify your account
4. Click **Generate token** and copy it
5. In makerlog, click **Connect repo** → **GitHub** → paste the token → **Connect**

> **SSO orgs:** if you're in a GitHub org with SAML SSO, authorize the token for that org after generating it. If the app sees an SSO error, it will show a clickable authorization button — click it once per org and reconnect.

#### GitLab

1. Go to [gitlab.com/-/user_settings/personal_access_tokens](https://gitlab.com/-/user_settings/personal_access_tokens)
2. Give the token a name and select scopes:
   - `read_api`
   - `read_user`
   - `read_repository`
3. Click **Create personal access token** and copy it
4. In makerlog, click **Connect repo** → **GitLab** → paste the token → **Connect**

> **Enterprise SSO (GitLab):** if your company uses SAML SSO (Okta, Google, Azure AD) to log in to GitLab, the workspace policy likely blocks PATs — you'll get `401 Unauthorized` even on a fresh token. This is a server-side restriction. Use **Option A** instead; `git log` bypasses web auth entirely.

#### Connecting both providers

You can connect GitHub and GitLab at the same time. They merge independently — adding one doesn't overwrite the other. Reconnecting a provider replaces only that provider's data slice.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server on `:5174` |
| `npm run build` | Type-check + production build |
| `npm run preview` | Serve the production build locally |
| `npm run deploy` | Build + deploy to Cloudflare Workers |
| `npm run typecheck` | Strict TS check, no emit |

---

## Architecture

```
src/
├── data/
│   ├── types.ts      Project / Commit / Idea / Connection / state
│   ├── source.ts     DataSource interface + LocalDataSource + WorkerDataSource stub
│   ├── mock.ts       Deterministic 13-month demo generator
│   └── store.tsx     React context + reducer, persists on every change
├── lib/
│   ├── streak.ts     Current / longest streak math
│   ├── stats.ts      Daily buckets, per-project counts, velocity index, ship ratio
│   └── format.ts     Date / number / percentage helpers
└── components/
    ├── Header.tsx        Brand, theme toggle, connect, demo reset
    ├── ViewSwitcher.tsx  Garden / River / Blueprint switcher
    ├── StatStrip.tsx     Streak card + commits / ship rate / velocity trend
    ├── IdeaPane.tsx      Idea backlog with status cycling
    ├── ConnectModal.tsx  GitHub / GitLab PAT modal
    └── viz/
        ├── Garden.tsx    Botanical project visualisation
        ├── River.tsx     Stream graph
        └── Blueprint.tsx Skyline blueprint

scripts/
└── import-from-git.mjs  Local git-log → makerlog JSON (zero deps)
```

### Data layer

`src/data/source.ts` exports a `DataSource` interface with two implementations:

- **`LocalDataSource`** — reads/writes a single JSON blob in `localStorage`. Default.
- **`WorkerDataSource`** — same interface, talks to a Cloudflare Worker over `fetch`.

To switch to a backend, change one line in `source.ts`:

```ts
// local (default)
export const dataSource: DataSource = new LocalDataSource();

// backend
export const dataSource: DataSource = new WorkerDataSource(
  'https://makerlog-api.example.workers.dev',
  bearerToken,
);
```

No components change.

---

## Fork it

1. Fork or copy the folder.
2. Update the brand mark in `index.html` and `src/components/Header.tsx`.
3. (Optional) Re-skin design tokens in `src/styles/tokens.css`.
4. Connect your GitHub / GitLab, or run `npm run import:git`.
5. Deploy: `npm run deploy`.

---

## Roadmap

- [ ] Paginated live commit fetch (GitHub + GitLab)
- [ ] Webhook ingestion via Cloudflare Worker for real-time updates
- [ ] AI weekly recap ("you shipped 3 things, river dipped Wednesday")
- [ ] More viz: constellation, per-type river, reimagined heatmap
- [ ] PWA + offline-first

---

## Credits

- Icons: [Lucide](https://lucide.dev)
- Animation: [framer-motion](https://www.framer.com/motion/)
