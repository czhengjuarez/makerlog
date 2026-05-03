import { useEffect, useMemo, useState } from 'react';
import { ListChecks, RotateCcw, Search, Sparkles } from 'lucide-react';
import { Modal } from './Modal';
import { useStore } from '../data/store';
import { DEFAULT_AUTO_TOP_N, rankProjectsByActivity } from '../lib/visibility';
import { TYPE_LABEL, accentForType } from '../data/mock';
import { relativeDate } from '../lib/format';

interface Props {
  open: boolean;
  onClose: () => void;
}

type Mode = 'auto' | 'custom';

const STALE_DAYS = 90;

export function ManageProjectsModal({ open, onClose }: Props) {
  const { state, setPreferences } = useStore();

  const ranked = useMemo(
    () => rankProjectsByActivity(state.projects, state.commits, 90),
    [state.projects, state.commits],
  );
  const total = state.projects.length;

  const [mode, setMode] = useState<Mode>('auto');
  const [n, setN] = useState(DEFAULT_AUTO_TOP_N);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');

  // Sync local state from current preferences whenever the modal opens.
  // If the user has more projects than auto would show, default to Custom
  // tab so the full list is immediately visible — opening straight into
  // the Auto preview hid the very repos they'd come here to find.
  useEffect(() => {
    if (!open) return;
    const ids = state.preferences?.visibleProjectIds;
    const topN = state.preferences?.autoTopN ?? DEFAULT_AUTO_TOP_N;
    if (Array.isArray(ids)) {
      setMode('custom');
      setSelected(new Set(ids));
    } else if (total > topN) {
      // Auto mode but more inventory than shown — land on Custom with the
      // current auto pick pre-selected so they can extend it.
      setMode('custom');
      setSelected(new Set(ranked.slice(0, topN).map((r) => r.project.id)));
    } else {
      setMode('auto');
      setSelected(new Set(ranked.slice(0, topN).map((r) => r.project.id)));
    }
    setN(topN);
    setQuery('');
  }, [open, state.preferences, ranked, total]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ranked;
    return ranked.filter((r) => {
      const slug = r.project.slug?.toLowerCase() ?? '';
      return (
        r.project.name.toLowerCase().includes(q) ||
        slug.includes(q) ||
        TYPE_LABEL[r.project.type].toLowerCase().includes(q)
      );
    });
  }, [ranked, query]);

  function toggleId(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectTopN(num: number) {
    setSelected(new Set(ranked.slice(0, num).map((r) => r.project.id)));
  }

  function selectAll() {
    setSelected(new Set(ranked.map((r) => r.project.id)));
  }

  function activeIn(days: number) {
    const cutoff = Date.now() - days * 86400_000;
    setSelected(
      new Set(
        ranked
          .filter((r) => r.lastCommitAt && Date.parse(r.lastCommitAt) >= cutoff)
          .map((r) => r.project.id),
      ),
    );
  }

  function apply() {
    if (mode === 'auto') {
      setPreferences({ visibleProjectIds: null, autoTopN: n });
    } else {
      setPreferences({ visibleProjectIds: Array.from(selected) });
    }
    onClose();
  }

  function resetToAuto() {
    setMode('auto');
    setN(DEFAULT_AUTO_TOP_N);
    setSelected(new Set(ranked.slice(0, DEFAULT_AUTO_TOP_N).map((r) => r.project.id)));
  }

  return (
    <Modal open={open} onClose={onClose} labelledBy="manage-projects-title" className="ml-modal--projects">
      <h2 id="manage-projects-title">Which projects to show</h2>
      <p className="ml-modal__sub">
        You have {total} project{total === 1 ? '' : 's'}. Visualizations look best with around 8&ndash;15.
        Pick how to choose them.
      </p>

      <div className="ml-tabs" style={{ marginBottom: 16 }}>
        <button aria-pressed={mode === 'auto'} onClick={() => setMode('auto')}>
          <Sparkles size={13} strokeWidth={1.75} style={{ marginRight: 6, verticalAlign: '-2px' }} />
          Auto (top by activity)
        </button>
        <button aria-pressed={mode === 'custom'} onClick={() => setMode('custom')}>
          <ListChecks size={13} strokeWidth={1.75} style={{ marginRight: 6, verticalAlign: '-2px' }} />
          Custom selection
        </button>
      </div>

      {mode === 'auto' ? (
        <div>
          <div className="ml-pref-row">
            <label htmlFor="autoTopN" className="ml-pref-label">
              Show top
            </label>
            <input
              id="autoTopN"
              type="range"
              min={5}
              max={Math.max(20, total)}
              step={1}
              value={Math.min(n, Math.max(20, total))}
              onChange={(e) => setN(parseInt(e.target.value, 10))}
              style={{ flex: 1, accentColor: 'var(--of-bg-brand)' }}
            />
            <strong className="ml-mono">{n}</strong>
          </div>
          <div className="ml-pref-preview">
            <div className="ml-pref-preview__label">By 90-day commit count</div>
            <ol className="ml-pref-preview__list">
              {ranked.slice(0, n).map((r) => {
                const accent = r.project.accent ?? accentForType(r.project.type);
                return (
                  <li key={r.project.id}>
                    <span
                      style={{
                        display: 'inline-block',
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: accent,
                        marginRight: 6,
                        verticalAlign: '2px',
                      }}
                    />
                    {r.project.name}
                    <span className="ml-pref-preview__count">
                      {r.commitsInWindow > 0 ? `${r.commitsInWindow}` : '—'}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
          <p className="ml-modal__sub" style={{ marginTop: 12, marginBottom: 0 }}>
            Auto follows your activity. A quiet project re-surfaces when you push to it again.
          </p>
          {total > n && (
            <div
              className="of-card"
              style={{
                marginTop: 12,
                padding: 12,
                background: 'var(--of-bg-recessed)',
                border: '1px solid var(--of-border-line)',
                display: 'flex',
                gap: 10,
                alignItems: 'center',
              }}
            >
              <ListChecks size={16} strokeWidth={1.75} style={{ color: 'var(--of-fg-muted)' }} />
              <div style={{ flex: 1, fontSize: 13, lineHeight: 1.5 }}>
                <strong>{total - n}</strong> more project{total - n === 1 ? '' : 's'} hidden. Want to
                pin specific ones?
              </div>
              <button
                className="of-btn of-btn--secondary of-btn--sm"
                onClick={() => setMode('custom')}
              >
                Pick specific
              </button>
            </div>
          )}
        </div>
      ) : (
        <div>
          <div className="ml-pref-search">
            <Search size={14} strokeWidth={1.75} />
            <input
              className="of-input"
              placeholder="Search by name, slug, type"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="ml-pref-actions">
            <button className="of-btn of-btn--ghost of-btn--sm" onClick={() => selectTopN(10)}>
              Top 10
            </button>
            <button className="of-btn of-btn--ghost of-btn--sm" onClick={() => selectTopN(20)}>
              Top 20
            </button>
            <button className="of-btn of-btn--ghost of-btn--sm" onClick={selectAll}>
              All
            </button>
            <button
              className="of-btn of-btn--ghost of-btn--sm"
              onClick={() => activeIn(STALE_DAYS)}
            >
              Active 90d
            </button>
            <span className="ml-pref-count">{selected.size} selected</span>
          </div>
          <div className="ml-pref-list" role="list">
            {filtered.length === 0 && (
              <p className="ml-muted" style={{ padding: 16, textAlign: 'center' }}>
                No matches.
              </p>
            )}
            {filtered.map((r) => {
              const accent = r.project.accent ?? accentForType(r.project.type);
              const checked = selected.has(r.project.id);
              return (
                <label key={r.project.id} className="ml-pref-row__item">
                  <input
                    type="checkbox"
                    className="ml-idea__check"
                    checked={checked}
                    onChange={() => toggleId(r.project.id)}
                  />
                  <span
                    style={{
                      display: 'inline-block',
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: accent,
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="ml-pref-row__name">{r.project.name}</div>
                    <div className="ml-pref-row__meta">
                      {TYPE_LABEL[r.project.type]} &middot; {r.commitsInWindow} in 90d &middot;{' '}
                      {r.totalCommits} all-time
                      {r.lastCommitAt && (
                        <>
                          {' '}
                          &middot; last {relativeDate(r.lastCommitAt)}
                        </>
                      )}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      )}

      <div className="ml-modal__row">
        <button className="of-btn of-btn--ghost" onClick={resetToAuto} title="Switch to auto mode with default settings">
          <RotateCcw size={14} strokeWidth={1.75} />
          <span>Reset</span>
        </button>
        <span style={{ flex: 1 }} />
        <button className="of-btn of-btn--ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="of-btn of-btn--primary" onClick={apply}>
          Apply
        </button>
      </div>
    </Modal>
  );
}
