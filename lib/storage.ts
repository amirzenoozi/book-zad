import { DEFAULT_META, type BookmarkMeta } from './types';

// Per-bookmark metadata (notes, tags, manual score, usage signals, page
// tokens), keyed by native bookmark id. Lives in `storage.local` — it's
// per-device and can grow large, so we don't sync it.

const PREFIX = 'meta:';

function key(bookmarkId: string): string {
  return PREFIX + bookmarkId;
}

export async function getMeta(bookmarkId: string): Promise<BookmarkMeta> {
  const k = key(bookmarkId);
  const data = await browser.storage.local.get(k);
  const stored = data[k] as Partial<BookmarkMeta> | undefined;
  return mergeMeta(stored);
}

/** Read metadata for many bookmarks at once, defaulting the missing ones. */
export async function getManyMeta(bookmarkIds: string[]): Promise<Map<string, BookmarkMeta>> {
  const keys = bookmarkIds.map(key);
  const data = await browser.storage.local.get(keys);
  const out = new Map<string, BookmarkMeta>();
  for (const id of bookmarkIds) {
    out.set(id, mergeMeta(data[key(id)] as Partial<BookmarkMeta> | undefined));
  }
  return out;
}

export async function setMeta(bookmarkId: string, patch: Partial<BookmarkMeta>): Promise<BookmarkMeta> {
  const current = await getMeta(bookmarkId);
  const next: BookmarkMeta = { ...current, ...patch };
  await browser.storage.local.set({ [key(bookmarkId)]: next });
  return next;
}

export async function deleteMeta(bookmarkId: string): Promise<void> {
  await browser.storage.local.remove(key(bookmarkId));
}

// --- Manager UI state (which folder was last open) --------------------------

const UI_FOLDER_KEY = 'ui.folder';

export async function getLastFolder(): Promise<string | null> {
  const data = await browser.storage.local.get(UI_FOLDER_KEY);
  return (data[UI_FOLDER_KEY] as string | null | undefined) ?? null;
}

export async function setLastFolder(folderId: string | null): Promise<void> {
  await browser.storage.local.set({ [UI_FOLDER_KEY]: folderId });
}

const UI_SAVE_FOLDER_KEY = 'ui.saveFolder';

export async function getLastSaveFolder(): Promise<string | null> {
  const data = await browser.storage.local.get(UI_SAVE_FOLDER_KEY);
  return (data[UI_SAVE_FOLDER_KEY] as string | null | undefined) ?? null;
}

export async function setLastSaveFolder(folderId: string): Promise<void> {
  await browser.storage.local.set({ [UI_SAVE_FOLDER_KEY]: folderId });
}

// --- Last dead-link scan (persisted so results survive reopening) ------------

export interface DeadCheck {
  /** Epoch ms when the scan ran. */
  checkedAt: number;
  /** URLs found dead at that time. */
  deadUrls: string[];
}

const DEAD_CHECK_KEY = 'ui.deadCheck';

export async function getDeadCheck(): Promise<DeadCheck | null> {
  const data = await browser.storage.local.get(DEAD_CHECK_KEY);
  return (data[DEAD_CHECK_KEY] as DeadCheck | undefined) ?? null;
}

export async function setDeadCheck(check: DeadCheck): Promise<void> {
  await browser.storage.local.set({ [DEAD_CHECK_KEY]: check });
}

/** Fill in any missing fields so callers always get a complete object. */
function mergeMeta(stored: Partial<BookmarkMeta> | undefined): BookmarkMeta {
  return {
    ...DEFAULT_META,
    ...stored,
    signals: { ...DEFAULT_META.signals, ...stored?.signals },
    tags: stored?.tags ?? [],
    tokens: stored?.tokens ?? {},
  };
}
