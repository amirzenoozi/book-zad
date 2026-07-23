import { describe, it, expect } from 'vitest';
import { pickKeeper, redundant } from '@/lib/dedupe';
import type { Bookmark } from '@/lib/types';

const bm = (id: string, dateAdded: number): Bookmark => ({
  id,
  parentId: '1',
  title: id,
  url: 'https://example.com/x',
  dateAdded,
  folderPath: 'Bar',
});

describe('pickKeeper', () => {
  it('keeps the highest-scored bookmark', () => {
    const group = [bm('a', 100), bm('b', 200)];
    const score = (b: Bookmark) => (b.id === 'b' ? 90 : 10);
    expect(pickKeeper(group, score).id).toBe('b');
  });

  it('breaks ties by keeping the oldest', () => {
    const group = [bm('new', 200), bm('old', 100)];
    expect(pickKeeper(group, () => 0).id).toBe('old');
  });

  it('redundant returns everything except the keeper', () => {
    const group = [bm('a', 100), bm('b', 200), bm('c', 300)];
    const score = () => 0; // all tie → keep oldest ('a')
    expect(redundant(group, score).map((b) => b.id).sort()).toEqual(['b', 'c']);
  });
});
