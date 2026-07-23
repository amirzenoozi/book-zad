import type { Bookmark, BookmarkMeta, Folder, Signals } from './types';
import { normalizeUrl } from './bookmarks';
import { getMeta, setMeta } from './storage';

// Export/import of the metadata layer (notes, tags, scores, usage signals).
// This data lives in storage.local keyed by bookmark id, decoupled from the
// native bookmarks — so a backup keys entries by URL / folder path instead,
// which survives reinstalls and id changes.

export interface BackupBookmark {
  url: string;
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

/** True if a metadata record holds anything worth backing up. */
function hasData(m: BookmarkMeta): boolean {
  return (
    m.notes.trim() !== '' ||
    m.tags.length > 0 ||
    m.manualScore != null ||
    m.signals.visits > 0 ||
    m.signals.dwellMs > 0
  );
}

/** Build the backup object from the current tree + metadata. Pure. */
export function buildBackup(
  bookmarks: Bookmark[],
  folders: Folder[],
  metas: Map<string, BookmarkMeta>,
  exportedAt: string,
): Backup {
  const seenUrls = new Set<string>();
  const backupBookmarks: BackupBookmark[] = [];
  for (const b of bookmarks) {
    const m = metas.get(b.id);
    if (!m || !hasData(m)) continue;
    const key = normalizeUrl(b.url);
    if (seenUrls.has(key)) continue; // one record per URL
    seenUrls.add(key);
    backupBookmarks.push({
      url: b.url,
      notes: m.notes || undefined,
      tags: m.tags.length ? m.tags : undefined,
      manualScore: m.manualScore,
      signals: m.signals,
    });
  }

  const backupFolders: BackupFolder[] = [];
  for (const f of folders) {
    const note = metas.get(f.id)?.notes?.trim();
    if (note) backupFolders.push({ path: f.folderPath, notes: note });
  }

  return {
    app: 'book-zad',
    version: 1,
    exportedAt,
    bookmarks: backupBookmarks,
    folders: backupFolders,
  };
}

/** Basic shape check before we trust an imported file. */
export function isBackup(data: unknown): data is Backup {
  const d = data as Partial<Backup> | null;
  return !!d && d.app === 'book-zad' && Array.isArray(d.bookmarks) && Array.isArray(d.folders);
}

export interface RestoreResult {
  bookmarks: number;
  folders: number;
}

/** Apply a backup onto the current tree, matching by URL / folder path.
 *  Signals merge by max so we never lose recorded usage. */
export async function applyBackup(
  data: Backup,
  bookmarks: Bookmark[],
  folders: Folder[],
): Promise<RestoreResult> {
  const byUrl = new Map<string, BackupBookmark>();
  for (const b of data.bookmarks) byUrl.set(normalizeUrl(b.url), b);

  const byPath = new Map<string, BackupFolder>();
  for (const f of data.folders) byPath.set(f.path, f);

  let bookmarkCount = 0;
  for (const b of bookmarks) {
    const backup = byUrl.get(normalizeUrl(b.url));
    if (!backup) continue;
    const current = await getMeta(b.id);
    await setMeta(b.id, {
      notes: backup.notes ?? current.notes,
      tags: backup.tags ?? current.tags,
      manualScore: backup.manualScore ?? current.manualScore,
      signals: mergeSignals(current.signals, backup.signals),
    });
    bookmarkCount++;
  }

  let folderCount = 0;
  for (const f of folders) {
    const backup = byPath.get(f.folderPath);
    if (!backup?.notes) continue;
    await setMeta(f.id, { notes: backup.notes });
    folderCount++;
  }

  return { bookmarks: bookmarkCount, folders: folderCount };
}

function mergeSignals(current: Signals, backup: Signals | undefined): Signals {
  if (!backup) return current;
  return {
    visits: Math.max(current.visits, backup.visits),
    lastVisit: Math.max(current.lastVisit, backup.lastVisit),
    dwellMs: Math.max(current.dwellMs, backup.dwellMs),
  };
}
