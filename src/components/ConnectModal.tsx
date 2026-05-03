import { useEffect, useRef, useState } from 'react';
import {
  Github,
  Gitlab,
  ShieldCheck,
  Lock,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { Modal } from './Modal';
import {
  fetchGitLabSnapshot,
  GitLabError,
  snapshotToProjectsAndCommits as glSnapshotMap,
  type GitLabSnapshot,
} from '../lib/gitlab';
import {
  fetchGitHubSnapshot,
  GitHubError,
  snapshotToProjectsAndCommits as ghSnapshotMap,
  type GitHubSnapshot,
} from '../lib/github';
import type { FetchProgress } from '../lib/gitlab';
import { useStore } from '../data/store';
import type { Connection } from '../data/types';

interface ConnectModalProps {
  open: boolean;
  onClose: () => void;
}

type Step = 'choose' | 'token' | 'fetching' | 'success' | 'error';
type Provider = 'github' | 'gitlab';

interface ProviderMeta {
  id: Provider;
  label: string;
  help: string;
  href: string;
  Icon: typeof Github;
  defaultHost: string;
  hostLabel: string;
  hostEditable: boolean;
  scopesHint: string;
  tokenPlaceholder: string;
  swatch: string; // background colour for the provider tile
}

const PROVIDERS: ProviderMeta[] = [
  {
    id: 'github',
    label: 'GitHub',
    help: 'Read your repos and commit history. Best path for personal accounts.',
    href: 'https://github.com/settings/tokens/new?scopes=repo,read:user&description=makerlog',
    Icon: Github,
    defaultHost: 'https://api.github.com',
    hostLabel: 'GitHub API host',
    hostEditable: false,
    scopesHint: 'repo (or public_repo) + read:user',
    tokenPlaceholder: 'ghp_…',
    swatch: 'var(--of-gray-900)',
  },
  {
    id: 'gitlab',
    label: 'GitLab',
    help: 'Personal accounts work. SSO-bound work accounts often don\'t — use the local importer instead.',
    href: 'https://gitlab.com/-/user_settings/personal_access_tokens?name=makerlog&scopes=read_api,read_user,read_repository',
    Icon: Gitlab,
    defaultHost: 'https://gitlab.com',
    hostLabel: 'GitLab host',
    hostEditable: true,
    scopesHint: 'read_api + read_user + read_repository',
    tokenPlaceholder: 'glpat-…',
    swatch: 'var(--of-warning-500)',
  },
];

type AnySnapshot =
  | { kind: 'gitlab'; data: GitLabSnapshot }
  | { kind: 'github'; data: GitHubSnapshot };

export function ConnectModal({ open, onClose }: ConnectModalProps) {
  const { ingestSnapshot } = useStore();
  const [step, setStep] = useState<Step>('choose');
  const [provider, setProvider] = useState<Provider>('github');
  const [host, setHost] = useState('https://api.github.com');
  const [token, setToken] = useState('');
  const [progress, setProgress] = useState<FetchProgress | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [errorSsoUrl, setErrorSsoUrl] = useState<string>('');
  const [snapshot, setSnapshot] = useState<AnySnapshot | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Reset on open
  useEffect(() => {
    if (open) {
      setStep('choose');
      setProvider('github');
      setHost('https://api.github.com');
      setToken('');
      setProgress(null);
      setErrorMsg('');
      setErrorSsoUrl('');
      setSnapshot(null);
    }
  }, [open]);

  function close() {
    abortRef.current?.abort();
    abortRef.current = null;
    onClose();
  }

  async function startFetch() {
    const cleanToken = token.trim();
    const cleanHost = host.trim().replace(/\/$/, '');
    if (!cleanToken) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setStep('fetching');
    setErrorMsg('');
    setErrorSsoUrl('');
    setProgress({ phase: 'auth', message: 'Verifying token…' });

    try {
      if (provider === 'gitlab') {
        const snap = await fetchGitLabSnapshot({
          host: cleanHost || 'https://gitlab.com',
          token: cleanToken,
          windowDays: 365,
          onProgress: setProgress,
          signal: controller.signal,
        });
        setSnapshot({ kind: 'gitlab', data: snap });
        const { projects, commits } = glSnapshotMap(snap);
        const connection: Connection = {
          id: `conn-gl-${snap.user.id}-${Date.now()}`,
          provider: 'gitlab',
          username: snap.user.username,
          tokenHint: token.slice(0, 6) + '…' + token.slice(-2),
          connectedAt: new Date().toISOString(),
        };
        ingestSnapshot({
          provider: 'gitlab',
          projects,
          commits,
          connection,
          mode: 'merge-by-provider',
        });
      } else {
        const snap = await fetchGitHubSnapshot({
          token: cleanToken,
          windowDays: 365,
          // No author filter: include every commit in repos you have access
          // to. Co-contributor commits still count as builder activity.
          onlyMine: false,
          onProgress: setProgress,
          signal: controller.signal,
        });
        setSnapshot({ kind: 'github', data: snap });
        const { projects, commits } = ghSnapshotMap(snap);
        const connection: Connection = {
          id: `conn-gh-${snap.user.id}-${Date.now()}`,
          provider: 'github',
          username: snap.user.login,
          tokenHint: token.slice(0, 6) + '…' + token.slice(-2),
          connectedAt: new Date().toISOString(),
        };
        ingestSnapshot({
          provider: 'github',
          projects,
          commits,
          connection,
          mode: 'merge-by-provider',
        });
      }
      setStep('success');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return; // closed mid-flight
      }
      let msg: string;
      let ssoUrl = '';
      if (err instanceof GitLabError) {
        msg = err.message;
        if (err.body) {
          try {
            const parsed = JSON.parse(err.body);
            const hint =
              parsed.error_description || parsed.error || parsed.message || JSON.stringify(parsed);
            msg += ` GitLab said: "${hint}".`;
          } catch {
            const trimmed = err.body.slice(0, 200);
            if (trimmed) msg += ` GitLab said: "${trimmed}".`;
          }
        }
      } else if (err instanceof GitHubError) {
        msg = err.message;
        if (err.ssoUrl) ssoUrl = err.ssoUrl;
        if (err.body && !err.ssoUrl) {
          try {
            const parsed = JSON.parse(err.body);
            const hint = parsed.message || JSON.stringify(parsed);
            msg += ` GitHub said: "${hint}".`;
          } catch {
            const trimmed = err.body.slice(0, 200);
            if (trimmed) msg += ` GitHub said: "${trimmed}".`;
          }
        }
      } else if (err instanceof Error) {
        msg = err.message;
      } else {
        msg = 'Unknown error';
      }
      setErrorMsg(msg);
      setErrorSsoUrl(ssoUrl);
      setStep('error');
    }
  }

  const activeProvider = PROVIDERS.find((p) => p.id === provider)!;

  // Counts shown on the success screen (provider-aware)
  const successCounts = (() => {
    if (!snapshot) {
      return {
        active: 0,
        total: 0,
        who: '',
        whose: '',
        emails: [] as string[],
        breakdown: [] as Array<{ label: string; count: number }>,
      };
    }
    if (snapshot.kind === 'gitlab') {
      const s = snapshot.data;
      const active = s.projects.filter((p) => p.commits.length).length;
      const skipped = s.projects.length - active;
      return {
        active,
        total: s.totalCommits,
        who: `@${s.user.username}`,
        whose: s.host.replace(/^https?:\/\//, ''),
        emails: [],
        breakdown: skipped > 0 ? [{ label: 'no commits in window', count: skipped }] : [],
      };
    } else {
      const s = snapshot.data;
      const active = s.repos.length; // already filtered to non-empty by fetcher
      const counts: Record<string, number> = {};
      for (const k of s.skipped) counts[k.reason] = (counts[k.reason] ?? 0) + 1;
      const breakdown: Array<{ label: string; count: number }> = [];
      if (counts.stale) breakdown.push({ label: 'no pushes in window', count: counts.stale });
      if (counts.empty) breakdown.push({ label: 'empty', count: counts.empty });
      if (counts.archived) breakdown.push({ label: 'archived', count: counts.archived });
      if (counts['no-mine']) {
        // Only shown if user opted into onlyMine filtering.
        breakdown.push({ label: 'no commits credited to you', count: counts['no-mine'] });
      }
      if (counts.error) breakdown.push({ label: 'errors', count: counts.error });
      return {
        active,
        total: s.totalCommits,
        who: `@${s.user.login}`,
        whose: 'github.com',
        emails: s.emails,
        breakdown,
      };
    }
  })();

  return (
    <Modal open={open} onClose={close} labelledBy="connect-title">
      <h2 id="connect-title">
        {step === 'success'
          ? 'Connected'
          : step === 'error'
            ? "Couldn't connect"
            : 'Connect a repo host'}
      </h2>

      {step === 'choose' && (
        <>
          <p className="ml-modal__sub">
            Bring your real commits in. Read-only scopes only — token stays in your browser. You can
            connect both providers and they'll merge.
          </p>
          <div style={{ display: 'grid', gap: 10 }}>
            {PROVIDERS.map(({ id, label, help, Icon, swatch }) => (
              <button
                key={id}
                onClick={() => {
                  const next = PROVIDERS.find((p) => p.id === id)!;
                  setProvider(id);
                  setHost(next.defaultHost);
                  setStep('token');
                }}
                className="of-card"
                style={{
                  textAlign: 'left',
                  cursor: 'pointer',
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr auto',
                  gap: 12,
                  alignItems: 'center',
                  background: 'var(--of-bg-recessed)',
                  border: '1px solid var(--of-border-line)',
                  padding: 14,
                }}
              >
                <span
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    display: 'grid',
                    placeItems: 'center',
                    background: swatch,
                    color: '#fff',
                  }}
                >
                  <Icon size={20} strokeWidth={1.75} />
                </span>
                <div>
                  <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {label}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--of-fg-subtle)' }}>{help}</div>
                </div>
                <span style={{ color: 'var(--of-fg-subtle)' }}>→</span>
              </button>
            ))}
          </div>
          <div className="ml-divider" />
          <p
            style={{
              fontSize: 12,
              color: 'var(--of-fg-subtle)',
              display: 'flex',
              gap: 8,
              alignItems: 'flex-start',
            }}
          >
            <Lock size={12} strokeWidth={1.75} style={{ marginTop: 2, flexShrink: 0 }} />
            <span>
              Local-first. The token is held in memory while fetching, never persisted as plaintext.
              Only a 6-char hint + last 2 chars are stored alongside the connection record.
            </span>
          </p>
        </>
      )}

      {step === 'token' && (
        <>
          <p className="ml-modal__sub">
            Paste a Personal Access Token with read-only scopes. We'll fetch your repos and the last
            365 days of your own commits, then merge into your data.
          </p>

          {activeProvider.hostEditable && (
            <div className="of-field" style={{ marginBottom: 12 }}>
              <label className="of-label" htmlFor="ml-host">
                {activeProvider.hostLabel}
              </label>
              <input
                id="ml-host"
                className="of-input"
                placeholder={activeProvider.defaultHost}
                value={host}
                onChange={(e) => setHost(e.target.value)}
              />
              <div className="of-field__hint">
                For self-hosted, paste the base URL (e.g.{' '}
                <code className="ml-mono">https://gitlab.mycompany.com</code>).
              </div>
            </div>
          )}

          <div className="of-field" style={{ marginBottom: 12 }}>
            <label className="of-label" htmlFor="ml-token">
              Personal access token
            </label>
            <input
              id="ml-token"
              type="password"
              className="of-input"
              placeholder={activeProvider.tokenPlaceholder}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="off"
            />
            <div className="of-field__hint">
              <a href={activeProvider.href} target="_blank" rel="noopener noreferrer">
                Generate one with the right scopes →
              </a>
              {' · '}
              Needs <code className="ml-mono">{activeProvider.scopesHint}</code>.
            </div>
          </div>

          {provider === 'github' && (
            <div
              className="of-card"
              style={{
                background: 'var(--of-bg-recessed)',
                border: '1px solid var(--of-border-line)',
                padding: 12,
                fontSize: 12,
                color: 'var(--of-fg-subtle)',
                marginBottom: 12,
              }}
            >
              <strong style={{ color: 'var(--of-fg-default)' }}>SSO orgs?</strong> If your token
              accesses an SSO-enforced organization, GitHub will return an error with an
              "Authorize" link. Click it once per org and retry.
            </div>
          )}

          {provider === 'gitlab' && (
            <div
              className="of-card"
              style={{
                background: 'var(--of-bg-recessed)',
                border: '1px solid var(--of-border-line)',
                padding: 12,
                fontSize: 12,
                color: 'var(--of-fg-subtle)',
                marginBottom: 12,
              }}
            >
              <strong style={{ color: 'var(--of-fg-default)' }}>Heads up — SSO-bound work accounts.</strong>{' '}
              GitLab&apos;s enterprise SAML SSO often blocks personal access tokens at the workspace
              level, even after you&apos;re logged in. If your gitlab.com login redirects through
              Okta / Google / Azure / a company SSO, this will likely fail with{' '}
              <code className="ml-mono">401 Unauthorized</code>. <strong>Personal gitlab.com
              accounts work fine.</strong> For locked-down work accounts, use{' '}
              <code className="ml-mono">npm run import:git</code> on a folder of your local clones —
              that path bypasses the API entirely and works regardless of SSO policy.
            </div>
          )}

          <div className="ml-modal__row">
            <button className="of-btn of-btn--ghost of-btn--md" onClick={() => setStep('choose')}>
              Back
            </button>
            <button
              className="of-btn of-btn--primary of-btn--md"
              disabled={!token}
              onClick={startFetch}
            >
              Fetch & merge
            </button>
          </div>
        </>
      )}

      {step === 'fetching' && (
        <>
          <p className="ml-modal__sub">
            Pulling your real {activeProvider.label} history. This stays in your browser.
          </p>
          <div
            className="of-card"
            style={{
              background: 'var(--of-bg-recessed)',
              border: '1px solid var(--of-border-line)',
              padding: 16,
              display: 'grid',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Loader2
                size={18}
                strokeWidth={1.75}
                style={{ color: 'var(--of-fg-brand)', animation: 'ml-spin 1s linear infinite' }}
              />
              <span style={{ fontWeight: 600 }}>{progress?.message ?? 'Working…'}</span>
            </div>
            {progress?.projectsTotal != null && progress.projectsTotal > 0 && (
              <div>
                <div
                  style={{
                    height: 6,
                    borderRadius: 999,
                    background: 'var(--of-border-subtle)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${Math.round(((progress.projectsDone ?? 0) / progress.projectsTotal) * 100)}%`,
                      height: '100%',
                      background: 'var(--of-gradient-brand)',
                      transition: 'width 200ms ease',
                    }}
                  />
                </div>
                <div style={{ marginTop: 6, fontSize: 12, color: 'var(--of-fg-subtle)' }}>
                  {progress.projectsDone ?? 0} / {progress.projectsTotal} repos
                  {progress.commitsTotal != null && ` · ${progress.commitsTotal} commits so far`}
                </div>
              </div>
            )}
          </div>
          <div className="ml-modal__row">
            <button
              className="of-btn of-btn--ghost of-btn--md"
              onClick={() => {
                abortRef.current?.abort();
                setStep('token');
              }}
            >
              Cancel
            </button>
          </div>
        </>
      )}

      {step === 'success' && snapshot && (
        <>
          <p className="ml-modal__sub">
            Connected to <strong>{successCounts.whose}</strong> as{' '}
            <code className="ml-mono">{successCounts.who}</code>.
          </p>
          <div
            className="of-card"
            style={{
              background: 'var(--of-bg-success-tint, var(--of-bg-recessed))',
              border:
                '1px solid color-mix(in srgb, var(--of-success-500, #2FA775) 35%, transparent)',
              padding: 16,
              display: 'grid',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
              <CheckCircle2
                size={18}
                strokeWidth={1.75}
                style={{ color: 'var(--of-success-500, #2FA775)' }}
              />
              Imported & merged
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.6 }}>
              <li>
                <strong>{successCounts.active}</strong> active{' '}
                {snapshot.kind === 'github' ? 'repos' : 'projects'}
                {successCounts.breakdown.length > 0 && (
                  <span style={{ color: 'var(--of-fg-subtle)' }}>
                    {' '}
                    (
                    {successCounts.breakdown
                      .map((b) => `${b.count} ${b.label}`)
                      .join(', ')}
                    )
                  </span>
                )}
              </li>
              <li>
                <strong>{successCounts.total}</strong> commits over the last 365 days
              </li>
              {snapshot.kind === 'github' && (
                <li style={{ color: 'var(--of-fg-muted)' }}>
                  All commits in repos you have access to are included — co-contributor commits
                  count as activity in your builder graph too.
                </li>
              )}
              <li>
                {snapshot.kind === 'github' ? (
                  <>
                    Org repos tagged <code className="ml-mono">work</code>, forks tagged{' '}
                    <code className="ml-mono">experiment</code>, your own tagged{' '}
                    <code className="ml-mono">personal</code>.
                  </>
                ) : (
                  <>
                    Group projects tagged <code className="ml-mono">work</code>, personal projects
                    tagged <code className="ml-mono">personal</code>.
                  </>
                )}{' '}
                Other-provider data (and local imports) preserved.
              </li>
            </ul>
          </div>
          <div className="ml-modal__row">
            <button className="of-btn of-btn--primary of-btn--md" onClick={close}>
              View my journal
            </button>
          </div>
        </>
      )}

      {step === 'error' && (
        <>
          <p className="ml-modal__sub">Nothing was imported. Your existing data is untouched.</p>
          <div
            className="of-card"
            style={{
              background: 'var(--of-bg-danger-tint, var(--of-bg-recessed))',
              border:
                '1px solid color-mix(in srgb, var(--of-danger-500, #C13333) 35%, transparent)',
              padding: 16,
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
            }}
          >
            <AlertTriangle
              size={18}
              strokeWidth={1.75}
              style={{ color: 'var(--of-danger-500, #C13333)', flexShrink: 0, marginTop: 2 }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{errorMsg || 'Request failed.'}</div>
              {errorSsoUrl && (
                <a
                  href={errorSsoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="of-btn of-btn--secondary of-btn--sm"
                  style={{ marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <ExternalLink size={12} strokeWidth={1.75} />
                  <span>Authorize PAT for this SSO org</span>
                </a>
              )}
              <div style={{ fontSize: 12, color: 'var(--of-fg-subtle)', marginTop: 8 }}>
                {provider === 'github'
                  ? 'Common fixes: regenerate the token with `repo` + `read:user`, or authorize the PAT for SSO orgs at the link above.'
                  : 'Common fixes: regenerate with read_api read_user read_repository, or double-check the host URL. If you log in to GitLab via SSO (Okta / Google / Azure / company login), this likely cannot be fixed client-side — use `npm run import:git` on local clones instead.'}
              </div>
            </div>
          </div>
          <div className="ml-modal__row">
            <button className="of-btn of-btn--ghost of-btn--md" onClick={close}>
              Close
            </button>
            <button className="of-btn of-btn--primary of-btn--md" onClick={() => setStep('token')}>
              Try again
            </button>
          </div>
        </>
      )}

      <ShieldCheck style={{ display: 'none' }} />
    </Modal>
  );
}
