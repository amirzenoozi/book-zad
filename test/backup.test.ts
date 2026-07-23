import { describe, it, expect } from 'vitest';
import { buildBackup, isBackup } from '@/lib/backup';
import { DEFAULT_META, type Bookmark, type BookmarkMeta, type Folder } from '@/lib/types';

const bm = (id: string, url: string): Bookmark => ({
  id,
  parentId: '1',
  title: url,
  url,
  dateAdded: 0,
  folderPath: 'Bar',
});
const folder = (id: string, path: string): Folder => ({ id, parentId: '1', title: path, folderPath: path });
const meta = (patch: Partial<BookmarkMeta>): BookmarkMeta => ({ ...DEFAULT_META, ...patch });

describe('buildBackup', () => {
  it('includes only records that hold data, keyed by url and path', () => {
    const bookmarks = [bm('1', 'https://a.com/x'), bm('2', 'https://b.com/y')];
    const folders = [folder('f1', 'Bar/Movies'), folder('f2', 'Bar/Empty')];
    const metas = new Map<string, BookmarkMeta>([
      ['1', meta({ notes: 'keep' })],
      ['2', meta({})], // no data → excluded
      ['f1', meta({ notes: 'films' })],
      ['f2', meta({})], // no note → excluded
    ]);

    const backup = buildBackup(bookmarks, folders, metas, '2026-01-01T00:00:00Z');
    expect(backup.bookmarks.map((b) => b.url)).toEqual(['https://a.com/x']);
    expect(backup.folders).toEqual([{ path: 'Bar/Movies', notes: 'films' }]);
    expect(backup.app).toBe('book-zad');
  });

  it('emits one record per normalised url', () => {
    const bookmarks = [bm('1', 'https://www.a.com/x'), bm('2', 'https://a.com/x/')];
    const metas = new Map<string, BookmarkMeta>([
      ['1', meta({ manualScore: 80 })],
      ['2', meta({ notes: 'dup' })],
    ]);
    const backup = buildBackup(bookmarks, [], metas, 'now');
    expect(backup.bookmarks).toHaveLength(1);
  });
});

describe('isBackup', () => {
  it('accepts a well-formed backup and rejects junk', () => {
    expect(isBackup({ app: 'book-zad', version: 1, exportedAt: 'x', bookmarks: [], folders: [] })).toBe(true);
    expect(isBackup({ app: 'other', bookmarks: [], folders: [] })).toBe(false);
    expect(isBackup(null)).toBe(false);
    expect(isBackup({ bookmarks: [] })).toBe(false);
  });
});
