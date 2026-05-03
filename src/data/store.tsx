import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import { dataSource } from './source';
import { generateMockState } from './mock';
import type {
  Commit,
  Connection,
  Idea,
  IdeaStatus,
  MakerLogState,
  Preferences,
  Project,
  Provider,
  UIFilters,
} from './types';

type Action =
  | { type: 'init'; state: MakerLogState }
  | { type: 'add-idea'; idea: Idea }
  | { type: 'update-idea'; id: string; patch: Partial<Idea> }
  | { type: 'remove-idea'; id: string }
  | { type: 'add-project'; project: Project }
  | { type: 'add-commit'; commit: Commit }
  | { type: 'reset-to-mock' }
  | { type: 'replace-state'; state: MakerLogState }
  | { type: 'set-preferences'; patch: Partial<Preferences> }
  | {
      type: 'ingest-snapshot';
      provider: Provider;
      projects: Project[];
      commits: Commit[];
      connection: Connection;
      mode: 'replace-all' | 'merge-by-provider';
    };

const initialState: MakerLogState = {
  projects: [],
  commits: [],
  ideas: [],
  connections: [],
  version: 1,
  updatedAt: new Date(0).toISOString(),
};

function reducer(state: MakerLogState, action: Action): MakerLogState {
  const stamp = (s: MakerLogState): MakerLogState => ({ ...s, updatedAt: new Date().toISOString() });
  switch (action.type) {
    case 'init':
    case 'replace-state':
      return action.state;
    case 'add-idea':
      return stamp({ ...state, ideas: [action.idea, ...state.ideas] });
    case 'update-idea':
      return stamp({
        ...state,
        ideas: state.ideas.map((i) => (i.id === action.id ? { ...i, ...action.patch } : i)),
      });
    case 'remove-idea':
      return stamp({ ...state, ideas: state.ideas.filter((i) => i.id !== action.id) });
    case 'add-project':
      return stamp({ ...state, projects: [...state.projects, action.project] });
    case 'add-commit':
      return stamp({ ...state, commits: [...state.commits, action.commit] });
    case 'reset-to-mock':
      return generateMockState();
    case 'set-preferences':
      return stamp({
        ...state,
        preferences: { ...(state.preferences ?? {}), ...action.patch },
      });
    case 'ingest-snapshot': {
      const otherConnections = state.connections.filter(
        (c) => !(c.provider === action.provider && c.username === action.connection.username),
      );
      const connections = [...otherConnections, action.connection];
      if (action.mode === 'replace-all') {
        return stamp({
          ...state,
          projects: action.projects,
          commits: action.commits,
          connections,
        });
      }
      // merge-by-provider: keep projects/commits from other providers, replace this one
      const keepProjects = state.projects.filter((p) => p.provider !== action.provider);
      const keepProjectIds = new Set(keepProjects.map((p) => p.id));
      const keepCommits = state.commits.filter((c) => keepProjectIds.has(c.projectId));
      return stamp({
        ...state,
        projects: [...keepProjects, ...action.projects],
        commits: [...keepCommits, ...action.commits],
        connections,
      });
    }
    default:
      return state;
  }
}

interface IngestInput {
  provider: Provider;
  projects: Project[];
  commits: Commit[];
  connection: Connection;
  mode?: 'replace-all' | 'merge-by-provider';
}

interface StoreCtx {
  state: MakerLogState;
  filters: UIFilters;
  setFilters: (f: Partial<UIFilters>) => void;
  addIdea: (input: { title: string; notes?: string; type?: Idea['type'] }) => void;
  setIdeaStatus: (id: string, status: IdeaStatus) => void;
  removeIdea: (id: string) => void;
  resetToMock: () => void;
  ingestSnapshot: (input: IngestInput) => void;
  setPreferences: (patch: Partial<Preferences>) => void;
  exportJSON: () => string;
  importJSON: (raw: string) => boolean;
  ready: boolean;
}

const Ctx = createContext<StoreCtx | null>(null);

const DEFAULT_FILTERS: UIFilters = { types: [], providers: [], windowDays: 365 };

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const filtersRef = useRef<UIFilters>(DEFAULT_FILTERS);
  // forceUpdate proxy via reducer-style local state
  const [, force] = useReducer((x) => x + 1, 0);
  const readyRef = useRef(false);

  // Boot: load from datasource or seed with mock.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const loaded = await dataSource.load();
      if (cancelled) return;
      const next = loaded ?? generateMockState();
      dispatch({ type: 'init', state: next });
      if (!loaded) {
        await dataSource.save(next);
      }
      readyRef.current = true;
      force();
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist on every change after boot.
  useEffect(() => {
    if (!readyRef.current) return;
    if (!state.projects.length && !state.ideas.length) return;
    dataSource.save(state).catch((err) => console.error('save failed', err));
  }, [state]);

  const setFilters = useCallback((patch: Partial<UIFilters>) => {
    filtersRef.current = { ...filtersRef.current, ...patch };
    force();
  }, []);

  const addIdea: StoreCtx['addIdea'] = useCallback((input) => {
    const idea: Idea = {
      id: `idea_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: input.title.trim(),
      notes: input.notes,
      type: input.type,
      status: 'idea',
      createdAt: new Date().toISOString(),
    };
    dispatch({ type: 'add-idea', idea });
  }, []);

  const setIdeaStatus: StoreCtx['setIdeaStatus'] = useCallback((id, status) => {
    dispatch({
      type: 'update-idea',
      id,
      patch: {
        status,
        shippedAt: status === 'shipped' ? new Date().toISOString() : undefined,
      },
    });
  }, []);

  const removeIdea: StoreCtx['removeIdea'] = useCallback((id) => {
    dispatch({ type: 'remove-idea', id });
  }, []);

  const resetToMock: StoreCtx['resetToMock'] = useCallback(() => {
    dispatch({ type: 'reset-to-mock' });
  }, []);

  const ingestSnapshot: StoreCtx['ingestSnapshot'] = useCallback((input) => {
    dispatch({
      type: 'ingest-snapshot',
      provider: input.provider,
      projects: input.projects,
      commits: input.commits,
      connection: input.connection,
      mode: input.mode ?? 'replace-all',
    });
  }, []);

  const setPreferences: StoreCtx['setPreferences'] = useCallback((patch) => {
    dispatch({ type: 'set-preferences', patch });
  }, []);

  const exportJSON: StoreCtx['exportJSON'] = useCallback(() => {
    return JSON.stringify(state, null, 2);
  }, [state]);

  const importJSON: StoreCtx['importJSON'] = useCallback((raw) => {
    try {
      const parsed = JSON.parse(raw) as MakerLogState;
      if (!parsed || !Array.isArray(parsed.projects) || !Array.isArray(parsed.commits)) return false;
      dispatch({ type: 'replace-state', state: parsed });
      return true;
    } catch {
      return false;
    }
  }, []);

  const value = useMemo<StoreCtx>(
    () => ({
      state,
      filters: filtersRef.current,
      setFilters,
      addIdea,
      setIdeaStatus,
      removeIdea,
      resetToMock,
      ingestSnapshot,
      setPreferences,
      exportJSON,
      importJSON,
      ready: readyRef.current,
    }),
    [state, setFilters, addIdea, setIdeaStatus, removeIdea, resetToMock, ingestSnapshot, setPreferences, exportJSON, importJSON],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): StoreCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}
