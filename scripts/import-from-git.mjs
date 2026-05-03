#!/usr/bin/env node
/**
 * import-from-git.mjs
 *
 * Scan a folder for git repos and emit a makerlog-compatible JSON file.
 * Pure Node, zero deps. Works with any provider (GitHub, GitLab, Bitbucket,
 * self-hosted, anything with a `.git` directory).
 *
 * Usage:
 *   node scripts/import-from-git.mjs [folder] [options]
 *
 * Options:
 *   --author=<email>   filter to commits by this email
 *                      (default: include all authors — every commit in the
 *                      repos you scan counts as activity in your builder
 *                      graph, even ones from co-contributors. The repos
 *                      *belong* to your builder journey.)
 *   --author=mine      use `git config --get user.email`
 *   --since=<spec>     git log --since spec (default: 365.days)
 *   --depth=<n>        recursion depth when scanning (default: 3)
 *   --out=<path>       output file (default: makerlog-import.json)
 *
 * Examples:
 *   node scripts/import-from-git.mjs ~/OpsForward
 *   node scripts/import-from-git.mjs ~/code --author=me@example.com --since=2.years
 *   node scripts/import-from-git.mjs . --author=mine
 *
 * After it runs, open makerlog and click Import (top-right of the canvas
 * card), then pick the generated JSON file. Your real builder data appears.
 */

import { execSync } from 'node:child_process';
import { readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, basename, resolve } from 'node:path';
import { homedir } from 'node:os';

// ─── args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith('-'));
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');

let folder = positional[0] || join(homedir(), 'OpsForward');
folder = resolve(folder);

const authorArg = flag('author');
const sinceArg = flag('since') || '365.days';
const outArg = flag('out') || 'makerlog-import.json';
const maxDepth = parseInt(flag('depth') || '3', 10);

// Default: NO author filter — include all commits in scanned repos.
// The maker's builder journey is defined by which repos they work in,
// not by which commits are credited to a specific email. Many makers
// commit under multiple emails (work, personal, older addresses) and
// filtering by one of them silently drops real work.
//
// `--author=mine` opts back into the strict view via git config user.email.
// `--author=<email>` lets you target a specific identity.
let author = '';
if (authorArg === 'mine') {
  try {
    author = execSync('git config --get user.email', { encoding: 'utf8' }).trim();
  } catch {
    author = '';
  }
} else if (authorArg && authorArg !== '*') {
  author = authorArg;
}
const filterByAuthor = !!author;

// ─── banner ────────────────────────────────────────────────────────────────

const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const magenta = (s) => `\x1b[35m${s}\x1b[0m`;

console.log();
console.log(`  ${magenta('makerlog')} ${dim('importer')}`);
console.log(`  ${dim('────────')}`);
console.log(`  folder  ${folder}`);
console.log(`  author  ${filterByAuthor ? author : dim('all (every contributor)')}`);
console.log(`  since   ${sinceArg}`);
console.log(`  output  ${outArg}`);
console.log();

if (!existsSync(folder)) {
  console.error(`  ✗ folder does not exist: ${folder}`);
  process.exit(1);
}

// ─── scan for repos ────────────────────────────────────────────────────────

const SKIP = new Set(['node_modules', 'dist', 'build', '.next', 'vendor', 'target', '__pycache__']);

function findGitRepos(root, depth = 0, results = []) {
  if (depth > maxDepth) return results;
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith('.')) continue;
    if (SKIP.has(e.name)) continue;
    const full = join(root, e.name);
    if (existsSync(join(full, '.git'))) {
      results.push(full);
      // do not recurse into a git repo (avoid submodules / nested dotfiles)
    } else {
      findGitRepos(full, depth + 1, results);
    }
  }
  return results;
}

const repos = findGitRepos(folder);
console.log(`  scanning... found ${bold(repos.length)} git ${repos.length === 1 ? 'repo' : 'repos'}`);
console.log();

if (!repos.length) {
  console.log(`  ${dim('nothing to import. did you point at the right folder?')}`);
  process.exit(0);
}

// ─── helpers ───────────────────────────────────────────────────────────────

function gitIn(repo, cmd) {
  try {
    return execSync(`git -C "${repo}" ${cmd}`, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim();
  } catch {
    return '';
  }
}

function parseRemote(url) {
  if (!url) return { provider: 'manual', slug: '', host: '' };
  // git@host:owner/repo.git
  // https://host/owner/repo.git
  // ssh://git@host:port/owner/repo.git
  const ssh = url.match(/^(?:ssh:\/\/)?(?:git@)?([\w.-]+)[:/]+([\w./-]+?)(?:\.git)?\/?$/i);
  const https = url.match(/^https?:\/\/(?:[^@]+@)?([\w.-]+)\/([\w./-]+?)(?:\.git)?\/?$/i);
  const m = https || ssh;
  if (!m) return { provider: 'manual', slug: url, host: '' };
  const host = m[1].toLowerCase();
  const slug = m[2];
  let provider = 'manual';
  if (host.includes('github')) provider = 'github';
  else if (host.includes('gitlab')) provider = 'gitlab';
  else if (host.includes('bitbucket')) provider = 'manual'; // store as manual; UI labels it
  return { provider, slug, host };
}

function inferType(slug, host) {
  // Best-effort default. Users will re-tag in the UI.
  // Heuristic: enterprise/work hosts and known company slugs land as 'work',
  // anything else as 'personal'.
  const s = (slug || '').toLowerCase();
  const h = (host || '').toLowerCase();
  if (h && !['github.com', 'gitlab.com', 'bitbucket.org'].includes(h)) return 'work';
  if (s.startsWith('cloudflare/') || s.includes('-internal/')) return 'work';
  return 'personal';
}

function shaShort(sha) {
  return sha ? sha.slice(0, 7) : '';
}

// ─── extract commits per repo ──────────────────────────────────────────────

const projects = [];
const commits = [];
let totalCommits = 0;
let skippedRepos = 0;

const SEP = '\x1f'; // unit separator — safe inside commit subjects

for (const repo of repos) {
  const name = basename(repo);
  const remote = gitIn(repo, 'config --get remote.origin.url');
  const { provider, slug, host } = parseRemote(remote);

  const createdRaw = gitIn(repo, 'log --reverse --max-count=1 --format=%aI');
  const createdAt = createdRaw || new Date().toISOString();

  const authorFilter = filterByAuthor ? `--author="${author.replace(/"/g, '\\"')}"` : '';
  const log = gitIn(
    repo,
    `log --since="${sinceArg}" ${authorFilter} --no-merges --format=%H${SEP}%aI${SEP}%s`,
  );

  const lines = log ? log.split('\n').filter(Boolean) : [];
  if (!lines.length) {
    skippedRepos++;
    console.log(`  ${dim('·')} ${name.padEnd(28)} ${dim(provider.padEnd(8))} ${dim('no commits in window')}`);
    continue;
  }

  const projectId = `local-${name}-${(slug || repo).replace(/[^\w]/g, '_')}`;
  const type = inferType(slug, host);

  projects.push({
    id: projectId,
    name,
    type,
    provider,
    slug: slug || repo.replace(homedir(), '~'),
    createdAt,
    description: host ? `${host}/${slug}` : `Local repo at ${repo.replace(homedir(), '~')}`,
  });

  for (const line of lines) {
    const i1 = line.indexOf(SEP);
    const i2 = line.indexOf(SEP, i1 + 1);
    if (i1 < 0 || i2 < 0) continue;
    const sha = line.slice(0, i1);
    const ts = line.slice(i1 + 1, i2);
    const subject = line.slice(i2 + 1);
    if (!sha || !ts) continue;
    commits.push({
      id: `local-${projectId}-${sha}`,
      projectId,
      timestamp: ts,
      message: subject,
      sha: shaShort(sha),
    });
    totalCommits++;
  }

  console.log(
    `  ${magenta('●')} ${name.padEnd(28)} ${dim(provider.padEnd(8))} ${String(lines.length).padStart(4)} commits  ${dim(slug || '')}`,
  );
}

console.log();
console.log(
  `  ${bold(totalCommits)} commits across ${bold(projects.length)} ${projects.length === 1 ? 'project' : 'projects'}` +
    (skippedRepos ? `  ${dim(`(${skippedRepos} repo${skippedRepos === 1 ? '' : 's'} skipped — no matching commits)`)}` : ''),
);

// ─── emit makerlog state ───────────────────────────────────────────────────

const state = {
  projects,
  commits: commits.sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
  ideas: [],
  connections: [],
  version: 1,
  updatedAt: new Date().toISOString(),
};

writeFileSync(outArg, JSON.stringify(state, null, 2));

console.log();
console.log(`  ${magenta('✓')} wrote ${bold(outArg)}`);
console.log();
console.log(`  ${dim('next:')} open makerlog → click ${bold('Import')} ${dim('(top-right of the canvas)')} → pick this file.`);
console.log();
