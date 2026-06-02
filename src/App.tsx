import { useMemo, useState, useRef } from 'react';
import { Download, Upload, Github, Sparkles, SlidersHorizontal, Loader2, X } from 'lucide-react';
import { StoreProvider, useStore } from './data/store';
import { Header } from './components/Header';
import { ViewSwitcher, type ViewMode } from './components/ViewSwitcher';
import { ProjectFilter } from './components/ProjectFilter';
import { StatStrip } from './components/StatStrip';
import { IdeaPane } from './components/IdeaPane';
import { ConnectModal } from './components/ConnectModal';
import { ManageProjectsModal } from './components/ManageProjectsModal';
import { Garden } from './components/viz/Garden';
import { River } from './components/viz/River';
import { Blueprint } from './components/viz/Blueprint';
import { getVisibleProjects } from './lib/visibility';
import type { ProjectType } from './data/types';

const VIEW_META: Record<ViewMode, { title: string; sub: string }> = {
  garden: {
    title: 'Garden',
    sub: 'Each plant is a project. Stems rise with commits, blooms appear when ideas ship.',
  },
  river: {
    title: 'River',
    sub: 'A 90-day stream graph — bands thicken on busy days, thin on quiet ones.',
  },
  blueprint: {
    title: 'Blueprint',
    sub: 'Skyline of what you’ve built. Building height = total commits, foundation = streak.',
  },
};

function AppInner() {
  const { exportJSON, importJSON, state, seeding, viewingDemo, toggleDemo, syncNow } = useStore();
  const [skippedOpen, setSkippedOpen] = useState(false);
  const skippedRepos = state.skippedRepos ?? [];
  const errorRepos = skippedRepos.filter((r) => r.reason === 'error');
  const totalRepos = state.projects.length + skippedRepos.length;
  const [view, setView] = useState<ViewMode>('garden');
  const [filtered, setFiltered] = useState<ProjectType[]>([]);
  const [connectOpen, setConnectOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

  const visibleCount = useMemo(
    () => getVisibleProjects(state.projects, state.commits, filtered, state.preferences).length,
    [state.projects, state.commits, filtered, state.preferences],
  );
  const filteredTotal = useMemo(
    () =>
      filtered.length === 0
        ? state.projects.length
        : state.projects.filter((p) => filtered.includes(p.type)).length,
    [state.projects, filtered],
  );
  const visibilityMode: 'auto' | 'custom' = Array.isArray(state.preferences?.visibleProjectIds)
    ? 'custom'
    : 'auto';

  function handleExport() {
    const blob = new Blob([exportJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `makerlog-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      const ok = importJSON(text);
      if (!ok) alert('That doesn’t look like a makerlog export.');
    };
    input.click();
  }

  // "Are we still on the seeded demo data?" — every demo project id starts with `prj_`.
  const onDemoData =
    state.projects.length > 0 && state.projects.every((p) => p.id.startsWith('prj_'));

  return (
    <div className="ml-shell">
      <Header
        onConnect={() => setConnectOpen(true)}
        onToggleDemo={toggleDemo}
        viewingDemo={viewingDemo}
        onImport={handleImport}
        onSync={syncNow}
        syncing={seeding}
      />
      <main className="ml-main">
        <div className="ml-stage">
          {seeding ? (
            <div className="ml-banner" role="status">
              <span className="ml-banner__icon" aria-hidden>
                <Loader2 size={16} strokeWidth={1.75} style={{ animation: 'ml-spin 1s linear infinite' }} />
              </span>
              <div className="ml-banner__copy">
                <strong>Loading your GitHub data…</strong>{' '}
                Hang tight — this only happens on first visit. Future visits load instantly.
              </div>
            </div>
          ) : viewingDemo ? (
            <div className="ml-banner" role="status">
              <span className="ml-banner__icon" aria-hidden>
                <Sparkles size={16} strokeWidth={1.75} />
              </span>
              <div className="ml-banner__copy">
                <strong>Previewing sample data.</strong>{' '}
                This is synthetic data — your real commits are still saved.
              </div>
              <button
                className="of-btn of-btn--secondary of-btn--sm"
                onClick={toggleDemo}
              >
                <X size={14} strokeWidth={1.75} />
                <span>Exit demo</span>
              </button>
            </div>
          ) : onDemoData && (
            <div className="ml-banner" role="status">
              <span className="ml-banner__icon" aria-hidden>
                <Sparkles size={16} strokeWidth={1.75} />
              </span>
              <div className="ml-banner__copy">
                <strong>You're viewing demo data.</strong>{' '}
                Run <code className="ml-mono">npm run import:git ~/your/code</code> in your
                terminal, then click <strong>Import your data</strong> to see your real
                builder velocity.
              </div>
              <button
                className="of-btn of-btn--primary of-btn--sm"
                onClick={handleImport}
              >
                <Upload size={14} strokeWidth={1.75} />
                <span>Import</span>
              </button>
            </div>
          )}

          <StatStrip />

          <div className="ml-filters">
            <ProjectFilter selected={filtered} onChange={setFiltered} />
            <ViewSwitcher value={view} onChange={setView} />
          </div>

          <section className="of-card ml-canvas" aria-label={`${VIEW_META[view].title} visualization`}>
            <header className="ml-canvas__header">
              <div>
                <div className="ml-canvas__title">{VIEW_META[view].title}</div>
                <div className="ml-canvas__sub">{VIEW_META[view].sub}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="of-btn of-btn--secondary of-btn--sm" onClick={handleImport} title="Import a JSON snapshot">
                  <Upload size={14} strokeWidth={1.75} />
                  <span>Import</span>
                </button>
                <button className="of-btn of-btn--secondary of-btn--sm" onClick={handleExport} title="Export your data">
                  <Download size={14} strokeWidth={1.75} />
                  <span>Export</span>
                </button>
              </div>
            </header>

            <div className="ml-canvas__util">
              <span>
                Showing <strong>{visibleCount}</strong> of {filteredTotal} project
                {filteredTotal === 1 ? '' : 's'}
                {filtered.length > 0 && ' (filtered)'}
                <span className="ml-canvas__util-mode">
                  {visibilityMode === 'auto' ? '· auto' : '· custom'}
                </span>
              </span>
              <button
                className={
                  visibleCount < filteredTotal
                    ? 'of-btn of-btn--secondary of-btn--sm'
                    : 'of-btn of-btn--ghost of-btn--sm'
                }
                onClick={() => setManageOpen(true)}
                title="Choose which projects appear in the visualizations"
              >
                <SlidersHorizontal size={13} strokeWidth={1.75} />
                <span>
                  {visibleCount < filteredTotal
                    ? `Pick projects (+${filteredTotal - visibleCount})`
                    : 'Manage projects'}
                </span>
              </button>
            </div>

            {view === 'garden' && <Garden filteredTypes={filtered} />}
            {view === 'river' && <River filteredTypes={filtered} />}
            {view === 'blueprint' && <Blueprint filteredTypes={filtered} />}
          </section>

          <footer style={{ color: 'var(--of-fg-subtle)', fontSize: 12, padding: '0 4px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>
                {state.projects.length} of {totalRepos} repo{totalRepos === 1 ? '' : 's'} displayed
                <span className="ml-mono"> · </span>
                {state.commits.length} commits
                {skippedRepos.length > 0 && (
                  <>
                    <span className="ml-mono"> · </span>
                    <button
                      onClick={() => setSkippedOpen((o) => !o)}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: errorRepos.length > 0 ? 'var(--of-fg-warning, #f59e0b)' : 'var(--of-fg-subtle)', fontSize: 12, textDecoration: 'underline' }}
                    >
                      {skippedRepos.length} skipped
                    </button>
                  </>
                )}
              </span>
              <a href="https://github.com" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Github size={12} strokeWidth={1.75} />
                fork it
              </a>
            </div>
            {skippedOpen && skippedRepos.length > 0 && (
              <div style={{ marginTop: 8, padding: '8px 10px', background: 'var(--of-bg-elevated)', borderRadius: 6, border: '1px solid var(--of-border-line)' }}>
                <div style={{ marginBottom: 6, fontWeight: 600, color: 'var(--of-fg-muted)' }}>Skipped repos</div>
                {skippedRepos.map((r) => (
                  <div key={r.slug} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', gap: 12 }}>
                    <a href={`https://github.com/${r.slug}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--of-fg-default)', fontFamily: 'var(--of-font-mono)', textDecoration: 'none' }}>
                      {r.slug}
                    </a>
                    <span style={{ color: r.reason === 'error' ? 'var(--of-fg-warning, #f59e0b)' : 'var(--of-fg-subtle)', whiteSpace: 'nowrap' }}>
                      {r.reason === 'stale' ? 'no commits in window' :
                       r.reason === 'empty' ? 'no commits found' :
                       r.reason === 'error' ? 'access error (private?)' :
                       r.reason === 'archived' ? 'archived' :
                       r.reason}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </footer>
        </div>

        <aside className="ml-side">
          <IdeaPane />
        </aside>
      </main>
      <ConnectModal open={connectOpen} onClose={() => setConnectOpen(false)} />
      <ManageProjectsModal open={manageOpen} onClose={() => setManageOpen(false)} />
    </div>
  );
}

export function App() {
  return (
    <StoreProvider>
      <AppInner />
    </StoreProvider>
  );
}
