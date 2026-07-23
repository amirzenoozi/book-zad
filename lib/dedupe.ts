import type { Bookmark } from './types';

// Which bookmark to keep when a URL is duplicated: the one the user values most
// (highest score), and on a tie the original (oldest). `scoreOf` is injected so
// this stays pure and testable — callers pass the effective score.

export function pickKeeper(group: Bookmark[], scoreOf: (b: Bookmark) => number): Bookmark {
  return [...group].sort((a, b) => {
    const byScore = scoreOf(b) - scoreOf(a);
    if (byScore !== 0) return byScore;
    return a.dateAdded - b.dateAdded; // older first
  })[0]!;
}

/** The bookmarks to remove from a group (everything except the keeper). */
export function redundant(group: Bookmark[], scoreOf: (b: Bookmark) => number): Bookmark[] {
  const keeper = pickKeeper(group, scoreOf);
  return group.filter((b) => b.id !== keeper.id);
}
