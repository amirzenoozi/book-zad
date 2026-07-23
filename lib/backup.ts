import type { Bookmark, BookmarkMeta, Folder, Signals } from './types';
import { DEFAULT_META } from './types';
import { normalizeUrl, createBookmark, createFolder } from './bookmarks';
import { getMeta, setMeta } from './storage';

// Export/import of the user's bookmarks together with the metadata layer we keep
// on top (notes, tags, scores, usage). Export includes EVERY bookmark from every
// folder — not just the ones that have metadata — so the file is a full backup.
// Entries are keyed by URL / folder path (not bookmark id), so a restore works
// across reinstalls and even a fresh browser: existing bookmarks get their
// metadata back, and missing ones are recreated in their folder.

export interface BackupBookmark {
  url: string;
  title: string;
  /** Human-readable folder path, e.g. "Bookmarks Bar / Research". */
  folderPath: string;
  notes?: string;
  tags?: string[];
  manualScore?: number | null;
  signals?: Signals;
}

export interface BackupFolder {
  path: string;
  notes?: string;
}

export interface Backup {
  app: 'book-zad';
  version: 1;
  exportedAt: string;
  bookmarks: BackupBookmark[];
  folders: BackupFolder[];
}

/** Build a full backup from the current tree + metadata. Pure. */
export function buildBackup(
  bookmarks: Bookmark[],
  folders: Folder[],
  metas: Map<string, BookmarkMeta>,
  exportedAt: string,
): Backup {
  const backupBookmarks: BackupBookmark[] = bookmarks.map((b) => {
    const m = metas.get(b.id);
    const hasSignals = !!m && (m.signals.visits > 0 || m.signals.dwellMs > 0 || m.signals.lastVisit > 0);
    return {
      url: b.url,
      title: b.title,
      folderPath: b.folderPath,
      notes: m?.notes || undefined,
      tags: m && m.tags.length > 0 ? m.tags : undefined,
      manualScore: m?.manualScore ?? null,
      signals: hasSignals ? m!.signals : undefined,
    };
  });

  // Every folder is recorded (to preserve structure), with its note if any.
  const backupFolders: BackupFolder[] = folders.map((f) => ({
    path: f.folderPath,
    notes: metas.get(f.id)?.notes?.trim() || undefined,
  }));

  return { app: 'book-zad', version: 1, exportedAt, bookmarks: backupBookmarks, folders: backupFolders };
}

/** Basic shape check before we trust an imported file. */
export function isBackup(data: unknown): data is Backup {
  const d = data as Partial<Backup> | null;
  return !!d && d.app === 'book-zad' && Array.isArray(d.bookmarks) && Array.isArray(d.folders);
}

export interface RestoreResult {
  /** Existing bookmarks whose metadata was restored. */
  updated: number;
  /** Bookmarks that were missing and got recreated. */
  created: number;
  /** Folder notes restored. */
  folders: number;
}

/** Apply a backup onto the current tree. Existing bookmarks (matched by URL) get
 *  their metadata restored; missing ones are recreated in their folder path
 *  (folders created as needed). Usage signals merge by max. */
export async function applyBackup(
  data: Backup,
  bookmarks: Bookmark[],
  folders: Folder[],
): Promise<RestoreResult> {
  const byUrl = new Map<string, Bookmark[]>();
  for (const b of bookmarks) {
    const k = normalizeUrl(b.url);
    const list = byUrl.get(k);
    if (list) list.push(b);
    else byUrl.set(k, [b]);
  }

  const ensureFolder = makeFolderResolver(folders);

  let updated = 0;
  let created = 0;
  for (const bb of data.bookmarks) {
    const existing = byUrl.get(normalizeUrl(bb.url));
    if (existing && existing.length > 0) {
      for (const b of existing) await setMeta(b.id, await metaFromBackup(b.id, bb));
      updated += existing.length;
    } else if (ensureFolder) {
      const parentId = await ensureFolder(bb.folderPath);
      const id = await createBookmark(parentId, bb.title || bb.url, bb.url);
      await setMeta(id, mergeBackup(DEFAULT_META, bb));
      created++;
    }
  }

  let folderCount = 0;
  for (const bf of data.folders) {
    if (!bf.notes || !ensureFolder) continue;
    const id = await ensureFolder(bf.path);
    if (id) {
      await setMeta(id, { notes: bf.notes });
      folderCount++;
    }
  }

  return { updated, created, folders: folderCount };
}

/** Resolves a folder path to an id, creating any missing segments. Returns null
 *  if there's no folder to root new folders under. */
function makeFolderResolver(folders: Folder[]): ((path: string) => Promise<string>) | null {
  const folderIds = new Set(folders.map((f) => f.id));
  const topLevel = folders.find((f) => !f.parentId || !folderIds.has(f.parentId));
  if (!topLevel) return null;
  const defaultRootId = topLevel.id;

  const byPath = new Map<string, string>(folders.map((f) => [f.folderPath, f.id]));

  return async (path: string): Promise<string> => {
    const segments = (path || '').split(' / ').filter(Boolean);
    if (segments.length === 0) return defaultRootId;

    let parentId = defaultRootId;
    let acc = '';
    for (const seg of segments) {
      acc = acc ? `${acc} / ${seg}` : seg;
      let id = byPath.get(acc);
      if (!id) {
        id = await createFolder(parentId, seg);
        byPath.set(acc, id);
      }
      parentId = id;
    }
    return parentId;
  };
}

async function metaFromBackup(bookmarkId: string, bb: BackupBookmark): Promise<Partial<BookmarkMeta>> {
  return mergeBackup(await getMeta(bookmarkId), bb);
}

function mergeBackup(current: BookmarkMeta, bb: BackupBookmark): Partial<BookmarkMeta> {
  return {
    notes: bb.notes ?? current.notes,
    tags: bb.tags ?? current.tags,
    manualScore: bb.manualScore ?? current.manualScore,
    signals: mergeSignals(current.signals, bb.signals),
  };
}

function mergeSignals(current: Signals, backup: Signals | undefined): Signals {
  if (!backup) return current;
  return {
    visits: Math.max(current.visits, backup.visits),
    lastVisit: Math.max(current.lastVisit, backup.lastVisit),
    dwellMs: Math.max(current.dwellMs, backup.dwellMs),
  };
}
