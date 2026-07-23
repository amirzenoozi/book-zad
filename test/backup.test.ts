import { describe, it, expect } from 'vitest';
import { buildBackup, isBackup } from '@/lib/backup';
import { DEFAULT_META, type Bookmark, type BookmarkMeta, type Folder } from '@/lib/types';

const bm = (id: string, url: string, folderPath = 'Bar'): Bookmark => ({
  id,
  parentId: '1',
  title: `title-${id}`,
  url,
  dateAdded: 0,
  folderPath,
});
const folder = (id: string, path: string): Folder => ({ id, parentId: '1', title: path, folderPath: path });
const meta = (patch: Partial<BookmarkMeta>): BookmarkMeta => ({ ...DEFAULT_META, ...patch });

describe('buildBackup', () => {
  it('includes every bookmark from every folder, with title and folder path', () => {
    const bookmarks = [bm('1', 'https://a.com/x', 'Bar/Movies'), bm('2', 'https://b.com/y', 'Bar')];
    const folders = [folder('f1', 'Bar/Movies'), folder('f2', 'Bar/Empty')];
    const metas = new Map<string, BookmarkMeta>([
      ['1', meta({ notes: 'keep', tags: ['film'] })],
      // '2' has no metadata — must still be exported
      ['f1', meta({ notes: 'films' })],
    ]);

    const backup = buildBackup(bookmarks, folders, metas, '2026-01-01T00:00:00Z');
    expect(backup.bookmarks.map((b) => b.url).sort()).toEqual(['https://a.com/x', 'https://b.com/y']);

    const a = backup.bookmarks.find((b) => b.url === 'https://a.com/x')!;
    expect(a.title).toBe('title-1');
    expect(a.folderPath).toBe('Bar/Movies');
    expect(a.notes).toBe('keep');
    expect(a.tags).toEqual(['film']);

    // Bookmark without metadata is present but carries no extra fields.
    const b = backup.bookmarks.find((x) => x.url === 'https://b.com/y')!;
    expect(b.notes).toBeUndefined();
    expect(b.tags).toBeUndefined();
  });

  it('records all folders, keeping a note where present', () => {
    const folders = [folder('f1', 'Bar/Movies'), folder('f2', 'Bar/Empty')];
    const metas = new Map<string, BookmarkMeta>([['f1', meta({ notes: 'films' })]]);
    const backup = buildBackup([], folders, metas, 'now');
    expect(backup.folders).toEqual([
      { path: 'Bar/Movies', notes: 'films' },
      { path: 'Bar/Empty', notes: undefined },
    ]);
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
