import { useMemo, useState } from 'react';
import { Download, Upload, Github, Sparkles, SlidersHorizontal } from 'lucide-react';
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
  const { resetToMock, exportJSON, importJSON, state } = useStore();
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
        onReset={resetToMock}
        onImport={handleImport}
      />
      <main className="ml-main">
        <div className="ml-stage">
          {onDemoData && (
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

          <footer style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--of-fg-subtle)', fontSize: 12, padding: '0 4px 12px' }}>
            <span>
              {state.projects.length} project{state.projects.length === 1 ? '' : 's'}
              <span className="ml-mono"> · </span>
              {state.commits.length} commits
              <span className="ml-mono"> · </span>
              built with the Keel design system
            </span>
            <a href="https://github.com" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Github size={12} strokeWidth={1.75} />
              fork it
            </a>
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
