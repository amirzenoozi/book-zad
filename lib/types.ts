// Shared types across background, content script and the manager page.

/** A single bookmark (a native bookmark node that has a url), flattened. */
export interface Bookmark {
  /** Native browser bookmark id — the key we hang all metadata off. */
  id: string;
  parentId: string | undefined;
  title: string;
  url: string;
  /** Epoch ms, from the native node. */
  dateAdded: number;
  /** Human-readable folder path, e.g. "Bookmarks Bar / Research / LLMs". */
  folderPath: string;
}

/** A folder in the native tree (no url). */
export interface Folder {
  id: string;
  parentId: string | undefined;
  title: string;
  folderPath: string;
}

/** Usage signals we track ourselves (never via the `history` permission). */
export interface Signals {
  /** Times we've seen the user open this bookmarked url. */
  visits: number;
  /** Epoch ms of the most recent visit, or 0 if never seen since install. */
  lastVisit: number;
  /** Total foreground dwell time across visits, in ms. */
  dwellMs: number;
}

/** Our metadata layered on top of a native bookmark, keyed by bookmark id. */
export interface BookmarkMeta {
  notes: string;
  tags: string[];
  /** Manual score 0–100 set by the user, or null to use the auto score. */
  manualScore: number | null;
  signals: Signals;
  /**
   * Compact token → frequency map captured from the page's own text the last
   * time the user visited it. Enriches similarity beyond the title alone.
   * Empty until the page has been visited with the extension installed.
   */
  tokens: Record<string, number>;
}

export const DEFAULT_META: BookmarkMeta = {
  notes: '',
  tags: [],
  manualScore: null,
  signals: { visits: 0, lastVisit: 0, dwellMs: 0 },
  tokens: {},
};

export type Theme = 'light' | 'dark' | 'auto';

/** UI language. 'auto' follows the browser's UI language (the i18n API's own
 *  pick); anything else overrides it with a bundled locale. */
export type UiLanguage = 'auto' | 'en' | 'fa' | 'de' | 'fr' | 'it' | 'nl' | 'tr';

export interface Settings {
  theme: Theme;
  language: UiLanguage;
  /** Show an in-page toast on a match (in addition to the toolbar badge). */
  toastEnabled: boolean;
  /** Cosine-similarity cutoff (0–1) for a page to count as matching a folder. */
  similarityThreshold: number;
  /** Master switch for the similarity nudge (badge + toast). */
  nudgeEnabled: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'auto',
  language: 'auto',
  toastEnabled: false,
  similarityThreshold: 0.18,
  nudgeEnabled: true,
};

/** A folder judged similar to the page the user is currently reading. */
export interface FolderMatch {
  folderId: string;
  folderPath: string;
  /** Cosine similarity of the page vector to the folder centroid (0–1). */
  score: number;
  /** A few bookmark titles from the folder, for the nudge UI. */
  sampleTitles: string[];
}
