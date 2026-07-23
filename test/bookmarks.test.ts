import { describe, it, expect } from 'vitest';
import { normalizeUrl, findDuplicates } from '@/lib/bookmarks';
import type { Bookmark } from '@/lib/types';

const bm = (id: string, url: string, extra: Partial<Bookmark> = {}): Bookmark => ({
  id,
  parentId: '1',
  title: url,
  url,
  dateAdded: 0,
  folderPath: 'Bar',
  ...extra,
});

describe('normalizeUrl', () => {
  it('ignores www, trailing slash and hash', () => {
    expect(normalizeUrl('https://www.example.com/page/#top')).toBe('https://example.com/page');
    expect(normalizeUrl('https://example.com/page')).toBe('https://example.com/page');
  });

  it('keeps protocol and query string significant', () => {
    expect(normalizeUrl('http://a.com/x')).not.toBe(normalizeUrl('https://a.com/x'));
    expect(normalizeUrl('https://a.com/x?a=1')).not.toBe(normalizeUrl('https://a.com/x?a=2'));
  });

  it('maps a bare host to a root path', () => {
    expect(normalizeUrl('https://example.com')).toBe('https://example.com/');
  });
});

describe('findDuplicates', () => {
  it('groups only URLs that repeat after normalisation', () => {
    const groups = findDuplicates([
      bm('1', 'https://www.example.com/a'),
      bm('2', 'https://example.com/a/'), // dup of 1
      bm('3', 'https://example.com/b'), // unique
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.map((b) => b.id).sort()).toEqual(['1', '2']);
  });

  it('returns nothing when all URLs are distinct', () => {
    expect(findDuplicates([bm('1', 'https://a.com'), bm('2', 'https://b.com')])).toEqual([]);
  });
});
