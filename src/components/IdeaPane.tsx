import { useMemo, useState } from 'react';
import { Lightbulb, Plus, Sparkles } from 'lucide-react';
import { useStore } from '../data/store';
import { TYPE_LABEL, accentForType } from '../data/mock';
import type { IdeaStatus, ProjectType } from '../data/types';
import { relativeDate } from '../lib/format';

const STATUS_TABS: Array<{ id: 'active' | 'shipped' | 'all'; label: string }> = [
  { id: 'active', label: 'In flight' },
  { id: 'shipped', label: 'Shipped' },
  { id: 'all', label: 'All' },
];

const STATUS_BADGE: Record<IdeaStatus, string> = {
  idea: 'of-badge--default',
  building: 'of-badge--purple',
  shipped: 'of-badge--green',
  parked: 'of-badge--amber',
};

const STATUS_LABEL: Record<IdeaStatus, string> = {
  idea: 'Idea',
  building: 'Building',
  shipped: 'Shipped',
  parked: 'Parked',
};

export function IdeaPane() {
  const { state, addIdea, setIdeaStatus, removeIdea } = useStore();
  const [tab, setTab] = useState<'active' | 'shipped' | 'all'>('active');
  const [draft, setDraft] = useState('');
  const [draftType, setDraftType] = useState<ProjectType | ''>('');

  const ideas = useMemo(() => {
    const sorted = [...state.ideas].sort((a, b) => {
      const aTime = a.shippedAt ?? a.createdAt;
      const bTime = b.shippedAt ?? b.createdAt;
      return bTime.localeCompare(aTime);
    });
    if (tab === 'shipped') return sorted.filter((i) => i.status === 'shipped');
    if (tab === 'active') return sorted.filter((i) => i.status !== 'shipped');
    return sorted;
  }, [state.ideas, tab]);

  const totalShipped = state.ideas.filter((i) => i.status === 'shipped').length;

  function submit() {
    const t = draft.trim();
    if (!t) return;
    addIdea({ title: t, type: draftType || undefined });
    setDraft('');
  }

  function cycleStatus(id: string, current: IdeaStatus) {
    const order: IdeaStatus[] = ['idea', 'building', 'shipped', 'parked'];
    const next = order[(order.indexOf(current) + 1) % order.length];
    setIdeaStatus(id, next);
  }

  return (
    <section className="of-card ml-pane" aria-label="Ideas">
      <div className="ml-pane__title">
        <h3>
          <Lightbulb size={18} strokeWidth={1.75} style={{ verticalAlign: '-3px', marginRight: 6, color: 'var(--of-fg-warning)' }} />
          Ideas
        </h3>
        <span className="of-badge of-badge--green">
          <Sparkles size={11} strokeWidth={1.75} style={{ marginRight: 4 }} />
          {totalShipped} shipped
        </span>
      </div>

      <div className="ml-tabs">
        {STATUS_TABS.map((t) => (
          <button key={t.id} aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <div role="list" style={{ maxHeight: 480, overflowY: 'auto' }}>
        {ideas.length === 0 && (
          <p className="ml-muted" style={{ fontSize: 13, padding: '24px 8px' }}>
            {tab === 'shipped' ? 'Nothing shipped yet — pick something small.' : 'Drop your next idea below.'}
          </p>
        )}
        {ideas.map((idea) => {
          const proj = state.projects.find((p) => p.id === idea.projectId);
          const accent = idea.type ? accentForType(idea.type) : 'var(--of-border-strong)';
          return (
            <div
              key={idea.id}
              role="listitem"
              className={`ml-idea${idea.status === 'shipped' ? ' ml-idea--shipped' : ''}`}
            >
              <input
                type="checkbox"
                className="ml-idea__check"
                checked={idea.status === 'shipped'}
                onChange={() =>
                  setIdeaStatus(idea.id, idea.status === 'shipped' ? 'idea' : 'shipped')
                }
                aria-label={`Mark "${idea.title}" as ${idea.status === 'shipped' ? 'open' : 'shipped'}`}
              />
              <div>
                <div className="ml-idea__title">{idea.title}</div>
                <div className="ml-idea__meta">
                  <span className={`of-badge ${STATUS_BADGE[idea.status]}`} style={{ marginRight: 6 }}>
                    {STATUS_LABEL[idea.status]}
                  </span>
                  {idea.type && (
                    <span style={{ marginRight: 6 }}>
                      <span style={{
                        display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                        background: accent, marginRight: 4, verticalAlign: 'middle',
                      }} />
                      {TYPE_LABEL[idea.type]}
                    </span>
                  )}
                  {proj && <span style={{ marginRight: 6 }}>· {proj.name}</span>}
                  <span>· {idea.status === 'shipped' && idea.shippedAt
                    ? `shipped ${relativeDate(idea.shippedAt)}`
                    : `added ${relativeDate(idea.createdAt)}`}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  className="of-btn of-btn--ghost of-btn--sm"
                  onClick={() => cycleStatus(idea.id, idea.status)}
                  title="Cycle status"
                >
                  Status
                </button>
                <button
                  className="of-btn of-btn--ghost of-btn--sm"
                  onClick={() => removeIdea(idea.id)}
                  aria-label="Delete idea"
                >
                  ×
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="ml-add-idea">
        <input
          className="of-input"
          placeholder="A new thing to build…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
        />
        <select
          className="of-select"
          value={draftType}
          onChange={(e) => setDraftType(e.target.value as ProjectType | '')}
          aria-label="Type"
          style={{ width: 130 }}
        >
          <option value="">Type</option>
          {(Object.keys(TYPE_LABEL) as ProjectType[]).map((t) => (
            <option key={t} value={t}>{TYPE_LABEL[t]}</option>
          ))}
        </select>
        <button className="of-btn of-btn--primary of-btn--md" onClick={submit} aria-label="Add idea">
          <Plus size={16} strokeWidth={1.75} />
        </button>
      </div>
    </section>
  );
}
