import type { MakerLogState } from './types';

/**
 * DataSource is the contract makerlog uses to load and save user state.
 *
 * Today: LocalDataSource (browser localStorage).
 * Tomorrow: WorkerDataSource (Cloudflare Worker + KV/D1) drops in here
 * with no changes to UI components.
 */
export interface DataSource {
  /** Pull current state. Returns null if uninitialised. */
  load(): Promise<MakerLogState | null>;
  /** Persist state. Replaces document atomically. */
  save(state: MakerLogState): Promise<void>;
  /** Wipe everything (used for "reset demo data"). */
  reset(): Promise<void>;
  /** Stable label for diagnostics */
  readonly name: string;
}

const STORAGE_KEY = 'makerlog:v1';

export class LocalDataSource implements DataSource {
  readonly name = 'local';

  async load(): Promise<MakerLogState | null> {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as MakerLogState;
      // basic shape guard
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.projects)) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  async save(state: MakerLogState): Promise<void> {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...state, updatedAt: new Date().toISOString() }),
    );
  }

  async reset(): Promise<void> {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

/**
 * Placeholder for the future Worker-backed source. Same shape, fetch underneath.
 *
 * @example
 *   const ds = new WorkerDataSource('https://makerlog.example.workers.dev', token);
 */
export class WorkerDataSource implements DataSource {
  readonly name = 'worker';
  constructor(private endpoint: string, private bearer: string) {}

  async load(): Promise<MakerLogState | null> {
    const res = await fetch(`${this.endpoint}/state`, {
      headers: { Authorization: `Bearer ${this.bearer}` },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Worker load failed: ${res.status}`);
    return (await res.json()) as MakerLogState;
  }

  async save(state: MakerLogState): Promise<void> {
    const res = await fetch(`${this.endpoint}/state`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${this.bearer}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(state),
    });
    if (!res.ok) throw new Error(`Worker save failed: ${res.status}`);
  }

  async reset(): Promise<void> {
    const res = await fetch(`${this.endpoint}/state`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${this.bearer}` },
    });
    if (!res.ok && res.status !== 404) throw new Error(`Worker reset failed: ${res.status}`);
  }
}

/** Single shared instance used by the app. Swap implementation here later. */
export const dataSource: DataSource = new LocalDataSource();
