/**
 * Domain types for makerlog.
 *
 * Shape note: every record is JSON-serialisable so the same payloads can
 * round-trip through localStorage today and a Cloudflare Worker (KV/D1)
 * tomorrow without conversion.
 */

export type ProjectType =
  | 'work'
  | 'personal'
  | 'tool'
  | 'experiment'
  | 'production';

export type Provider = 'github' | 'gitlab' | 'manual';

/** A repository / project the maker is building. */
export interface Project {
  id: string;
  name: string;
  /** Tag the project for filtering & visual grouping */
  type: ProjectType;
  provider: Provider;
  /** Full slug like "owner/repo" for hosted, or freeform for manual */
  slug: string;
  /** ISO date the project was first seen / created */
  createdAt: string;
  /** Optional one-liner */
  description?: string;
  /** Brand-ish accent (hex). If absent, derived from type */
  accent?: string;
}

/** A single commit / build event */
export interface Commit {
  id: string;
  projectId: string;
  /** ISO timestamp */
  timestamp: string;
  message: string;
  /** Lines added/removed if known */
  additions?: number;
  deletions?: number;
  sha?: string;
}

export type IdeaStatus = 'idea' | 'building' | 'shipped' | 'parked';

/** A user-tracked idea — may or may not link to a project */
export interface Idea {
  id: string;
  title: string;
  notes?: string;
  status: IdeaStatus;
  /** Optional project link once it becomes a build */
  projectId?: string;
  type?: ProjectType;
  /** ISO created / shipped timestamps */
  createdAt: string;
  shippedAt?: string;
}

/** Connection to a remote provider (PAT-based for now). */
export interface Connection {
  id: string;
  provider: Provider;
  username: string;
  /** Bare display value of the token (NOT shown after entry). */
  tokenHint: string;
  connectedAt: string;
}

/**
 * Persisted user preferences that are state-shaped (versus transient
 * UI-only filters). Lives inside MakerLogState so it round-trips through
 * the same dataSource.save() path.
 */
export interface Preferences {
  /**
   * Explicit list of project IDs to show in visualizations.
   * null/undefined = auto mode (top N by recent activity).
   * [] = explicitly hide all.
   */
  visibleProjectIds?: string[] | null;
  /** How many projects to surface in auto mode. Default 10. */
  autoTopN?: number;
}

export interface SkippedRepo {
  slug: string;
  name: string;
  reason: 'archived' | 'stale' | 'empty' | 'no-mine' | 'error';
}

/** The whole user state. Single document, easy to export. */
export interface MakerLogState {
  projects: Project[];
  commits: Commit[];
  ideas: Idea[];
  connections: Connection[];
  /** Optional persisted prefs (visibility, auto-N). */
  preferences?: Preferences;
  /** Repos excluded during last GitHub sync, for diagnostics. */
  skippedRepos?: SkippedRepo[];
  /** Schema version for future migrations */
  version: number;
  /** Last update timestamp ISO */
  updatedAt: string;
}

/** Filter state in the UI (not persisted). */
export interface UIFilters {
  types: ProjectType[]; // empty = all
  providers: Provider[]; // empty = all
  /** Window in days for the visualization */
  windowDays: number;
}
