import type { Bookmark, Folder } from './types';

// Thin wrappers over the native `browser.bookmarks` API. The tree stays the
// source of truth; here we mostly flatten it into lists the UI can render.

interface Flattened {
  bookmarks: Bookmark[];
  folders: Folder[];
}

/** The subset of a native BookmarkTreeNode we rely on (kept local for typing). */
interface TreeNode {
  id: string;
  parentId?: string;
  title: string;
  url?: string;
  dateAdded?: number;
  children?: TreeNode[];
}

/** Walk the whole bookmark tree once, producing flat bookmark + folder lists. */
export async function loadTree(): Promise<Flattened> {
  const roots = (await browser.bookmarks.getTree()) as TreeNode[];
  const bookmarks: Bookmark[] = [];
  const folders: Folder[] = [];

  const walk = (node: TreeNode, path: string[]) => {
    if (node.url) {
      bookmarks.push({
        id: node.id,
        parentId: node.parentId,
        title: node.title || node.url,
        url: node.url,
        dateAdded: node.dateAdded ?? 0,
        folderPath: path.join(' / '),
      });
      return;
    }
    // A folder. The invisible root(s) have no title — don't add them to the path.
    const nextPath = node.title ? [...path, node.title] : path;
    if (node.title) {
      folders.push({
        id: node.id,
        parentId: node.parentId,
        title: node.title,
        folderPath: nextPath.join(' / '),
      });
    }
    for (const child of node.children ?? []) walk(child, nextPath);
  };

  for (const root of roots) walk(root, []);
  return { bookmarks, folders };
}

export async function loadBookmarks(): Promise<Bookmark[]> {
  return (await loadTree()).bookmarks;
}

export async function moveBookmark(id: string, parentId: string): Promise<void> {
  await browser.bookmarks.move(id, { parentId });
}

/** Move a folder (and its whole subtree) under a new parent folder. */
export async function moveFolder(id: string, parentId: string): Promise<void> {
  await browser.bookmarks.move(id, { parentId });
}

export async function removeBookmark(id: string): Promise<void> {
  await browser.bookmarks.remove(id);
}

export async function createBookmark(parentId: string, title: string, url: string): Promise<string> {
  const node = await browser.bookmarks.create({ parentId, title, url });
  return node.id;
}

export async function createFolder(parentId: string, title: string): Promise<string> {
  const node = await browser.bookmarks.create({ parentId, title });
  return node.id;
}

/** Rename a bookmark or folder. */
export async function renameNode(id: string, title: string): Promise<void> {
  await browser.bookmarks.update(id, { title });
}

/** Delete a folder and everything inside it. */
export async function removeFolderTree(id: string): Promise<void> {
  await browser.bookmarks.removeTree(id);
}

/** Find every bookmark that points at exactly this url (after normalising). */
export async function findByUrl(url: string): Promise<Bookmark[]> {
  const target = normalizeUrl(url);
  const all = await loadBookmarks();
  return all.filter((b) => normalizeUrl(b.url) === target);
}

/** Group bookmarks that share a normalised url — the duplicate sets. */
export function findDuplicates(bookmarks: Bookmark[]): Bookmark[][] {
  const byUrl = new Map<string, Bookmark[]>();
  for (const b of bookmarks) {
    const k = normalizeUrl(b.url);
    (byUrl.get(k) ?? byUrl.set(k, []).get(k)!).push(b);
  }
  return [...byUrl.values()].filter((group) => group.length > 1);
}

/** Lightweight url normalisation for equality: drop hash, trailing slash, www. */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    const host = u.host.replace(/^www\./, '');
    let path = u.pathname.replace(/\/+$/, '');
    if (path === '') path = '/';
    return `${u.protocol}//${host}${path}${u.search}`;
  } catch {
    return url.trim();
  }
}
