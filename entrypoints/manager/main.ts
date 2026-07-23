import {
  loadTree,
  findDuplicates,
  removeBookmark,
  moveBookmark,
  moveFolder,
  createFolder,
  renameNode,
  removeFolderTree,
} from '@/lib/bookmarks';
import { getManyMeta, setMeta, deleteMeta, getLastFolder, setLastFolder } from '@/lib/storage';
import { getSettings, setSettings } from '@/lib/settings';
import { effectiveScore } from '@/lib/scoring';
import { pickKeeper } from '@/lib/dedupe';
import { buildBackup, isBackup, applyBackup } from '@/lib/backup';
import { applyTheme } from '@/lib/theme';
import type { Bookmark, BookmarkMeta, Folder, Settings, Theme } from '@/lib/types';
import '@/lib/fonts.css';
import './style.css';

// The full manager page. Two modes:
//   - Folder view (default): browse the bookmark tree with breadcrumbs; create,
//     rename, delete folders; move bookmarks between them.
//   - Search view (when the search box is non-empty): a flat, global result
//     list across all folders.

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();

let bookmarks: Bookmark[] = [];
let folders: Folder[] = [];
let metas = new Map<string, BookmarkMeta>();
let foldersById = new Map<string, Folder>();
let settings: Settings;

/** Folder currently being browsed; null = "Home" (top-level folders). */
let currentFolderId: string | null = null;

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

const searchInput = $<HTMLInputElement>('#search');
const sortSelect = $<HTMLSelectElement>('#sort');
const themeSelect = $<HTMLSelectElement>('#theme');
const grid = $<HTMLDivElement>('#grid');
const emptyMsg = $<HTMLParagraphElement>('#empty');
const statsEl = $<HTMLElement>('#stats');
const hygieneBody = $<HTMLDivElement>('#hygiene-body');
const folderbar = $<HTMLDivElement>('#folderbar');
const crumbsEl = $<HTMLElement>('#crumbs');
const newFolderBtn = $<HTMLButtonElement>('#new-folder');

init();

async function init() {
  settings = await getSettings();
  applyTheme(settings.theme);
  themeSelect.value = settings.theme;

  // Restore the last-open folder so a page refresh keeps your place.
  currentFolderId = await getLastFolder();

  wireControls();
  wireDrawer();
  wireFolderBar();
  wireBackup();
  await reload();
}

/** Reload the whole tree + metadata from the browser and re-render. */
async function reload() {
  const tree = await loadTree();
  bookmarks = tree.bookmarks;
  folders = tree.folders;
  foldersById = new Map(folders.map((f) => [f.id, f]));
  // Metadata is keyed by node id — load it for folders too (folder notes).
  metas = await getManyMeta([...bookmarks.map((b) => b.id), ...folders.map((f) => f.id)]);

  // If the folder we were viewing was deleted/moved away, fall back to Home.
  if (currentFolderId && !foldersById.has(currentFolderId)) currentFolderId = null;

  render();
  renderHygiene();
}

// --- Tree helpers -----------------------------------------------------------

/** A parent id that isn't one of our folders means "under an invisible root". */
function isTopLevel(parentId: string | undefined): boolean {
  return !parentId || !foldersById.has(parentId);
}

function childFolders(id: string | null): Folder[] {
  const list = id === null ? folders.filter((f) => isTopLevel(f.parentId)) : folders.filter((f) => f.parentId === id);
  return list.sort((a, b) => a.title.localeCompare(b.title));
}

function childBookmarks(id: string | null): Bookmark[] {
  return id === null ? bookmarks.filter((b) => isTopLevel(b.parentId)) : bookmarks.filter((b) => b.parentId === id);
}

/** True if `folderId` is `ancestorId` itself or lives somewhere inside it. */
function isSelfOrDescendant(folderId: string, ancestorId: string): boolean {
  let cur: Folder | undefined = foldersById.get(folderId);
  while (cur) {
    if (cur.id === ancestorId) return true;
    cur = cur.parentId ? foldersById.get(cur.parentId) : undefined;
  }
  return false;
}

/** Folder → ancestor chain (root-most first) for the breadcrumb. */
function pathChain(id: string): Folder[] {
  const chain: Folder[] = [];
  let cur: Folder | undefined = foldersById.get(id);
  while (cur) {
    chain.unshift(cur);
    cur = cur.parentId ? foldersById.get(cur.parentId) : undefined;
  }
  return chain;
}

function navigate(id: string | null) {
  currentFolderId = id;
  void setLastFolder(id); // remember across refreshes
  render();
}

// --- Rendering --------------------------------------------------------------

function meta(id: string): BookmarkMeta {
  return metas.get(id)!;
}

function render() {
  const q = searchInput.value.trim().toLowerCase();
  if (q) renderSearch(q);
  else renderFolderView();
}

function renderSearch(q: string) {
  folderbar.hidden = true;

  const filtered = bookmarks.filter((b) => matchesQuery(b, q));
  sortInPlace(filtered);

  grid.replaceChildren(...filtered.map((b) => renderBookmarkCard(b, true)));
  emptyMsg.hidden = filtered.length > 0;
  renderStats(filtered.length);
}

function renderFolderView() {
  folderbar.hidden = false;
  newFolderBtn.hidden = false; // creating is allowed everywhere (Home → a root)
  renderCrumbs();

  const subFolders = childFolders(currentFolderId);
  const items = childBookmarks(currentFolderId);
  sortInPlace(items);

  const cards: HTMLElement[] = [
    ...subFolders.map(renderFolderCard),
    ...items.map((b) => renderBookmarkCard(b, false)),
  ];
  grid.replaceChildren(...cards);
  emptyMsg.hidden = cards.length > 0;
  emptyMsg.textContent = 'This folder is empty.';
  renderStats(items.length);
}

function renderCrumbs() {
  const parts: Node[] = [crumb('Home', () => navigate(null), currentFolderId === null)];
  if (currentFolderId) {
    for (const f of pathChain(currentFolderId)) {
      parts.push(sep(), crumb(f.title, () => navigate(f.id), f.id === currentFolderId));
    }
  }
  crumbsEl.replaceChildren(...parts);
}

function crumb(label: string, onClick: () => void, active: boolean): HTMLElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'crumb' + (active ? ' crumb--active' : '');
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

function sep(): HTMLElement {
  const s = document.createElement('span');
  s.className = 'crumb-sep';
  s.textContent = '/';
  return s;
}

function matchesQuery(b: Bookmark, q: string): boolean {
  const m = meta(b.id);
  const hay = `${b.title} ${b.url} ${b.folderPath} ${m.notes} ${m.tags.join(' ')}`.toLowerCase();
  return hay.includes(q);
}

function sortInPlace(list: Bookmark[]) {
  switch (sortSelect.value) {
    case 'recent':
      list.sort((a, b) => b.dateAdded - a.dateAdded);
      break;
    case 'visited':
      list.sort((a, b) => meta(b.id).signals.visits - meta(a.id).signals.visits);
      break;
    case 'title':
      list.sort((a, b) => a.title.localeCompare(b.title));
      break;
    default: // score
      list.sort((a, b) => effectiveScore(meta(b.id), now) - effectiveScore(meta(a.id), now));
  }
}

function renderStats(shown: number) {
  statsEl.replaceChildren(
    stat(String(bookmarks.length), 'bookmarks'),
    stat(String(folders.length), 'folders'),
    stat(String(shown), 'shown'),
  );
}

function stat(value: string, label: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'stat';
  const v = document.createElement('span');
  v.className = 'stat__value';
  v.textContent = value;
  const l = document.createElement('span');
  l.className = 'stat__label';
  l.textContent = label;
  el.append(v, l);
  return el;
}

// --- Folder card ------------------------------------------------------------

function renderFolderCard(f: Folder): HTMLElement {
  const card = document.createElement('article');
  card.className = 'card card--folder';

  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'folder__open';
  const icon = document.createElement('span');
  icon.className = 'folder__icon';
  icon.textContent = '📁';
  const name = document.createElement('span');
  name.className = 'folder__name';
  name.textContent = f.title;
  open.append(icon, name);
  open.addEventListener('click', () => navigate(f.id));

  const count = document.createElement('div');
  count.className = 'folder__count';
  const nSub = childFolders(f.id).length;
  const nBm = childBookmarks(f.id).length;
  count.textContent = `${nBm} bookmark${nBm === 1 ? '' : 's'}${nSub ? `, ${nSub} folder${nSub === 1 ? '' : 's'}` : ''}`;

  const footer = document.createElement('div');
  footer.className = 'card__footer';
  footer.append(
    button('Rename', 'btn btn--ghost btn--sm', () => void handleRenameFolder(f)),
    button('Delete', 'btn btn--danger', () => void handleDeleteFolder(f)),
  );

  // Folder note — searchable label, and a weighted source for suggestions.
  const fm = meta(f.id);
  const notes = document.createElement('textarea');
  notes.className = 'card__notes';
  notes.placeholder = 'Folder note — describe it to sharpen suggestions…';
  notes.value = fm.notes;
  notes.rows = 2;
  notes.addEventListener('change', async () => {
    await setMeta(f.id, { notes: notes.value });
    fm.notes = notes.value;
  });

  card.append(open, count, notes);
  // The special root folders (Bookmarks Bar, Other Bookmarks…) can't be moved.
  if (!isTopLevel(f.parentId)) card.append(folderMoveControl(f));
  card.append(footer);
  return card;
}

/** A "move folder to…" dropdown, excluding the folder itself and its subtree
 *  (moving a folder inside itself would create a cycle). */
function folderMoveControl(f: Folder): HTMLElement {
  const wrap = document.createElement('label');
  wrap.className = 'move';
  wrap.title = 'Move folder to…';

  const select = document.createElement('select');
  select.className = 'move__select';

  const destinations = folders
    .filter((d) => !isSelfOrDescendant(d.id, f.id))
    .sort((a, b) => a.folderPath.localeCompare(b.folderPath));

  for (const d of destinations) {
    const opt = document.createElement('option');
    opt.value = d.id;
    opt.textContent = d.folderPath;
    if (d.id === f.parentId) opt.selected = true;
    select.append(opt);
  }

  select.addEventListener('change', async () => {
    await moveFolder(f.id, select.value);
    await reload();
  });

  wrap.append(select);
  return wrap;
}

// --- Bookmark card ----------------------------------------------------------

function renderBookmarkCard(b: Bookmark, showPath: boolean): HTMLElement {
  const m = meta(b.id);
  const card = document.createElement('article');
  card.className = 'card';

  const head = document.createElement('div');
  head.className = 'card__head';
  head.append(monogram(b.url), titleLink(b));
  card.append(head);

  const urlEl = document.createElement('div');
  urlEl.className = 'card__url';
  urlEl.textContent = prettyUrl(b.url);
  card.append(urlEl);

  if (showPath && b.folderPath) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = b.folderPath;
    card.append(chip);
  }

  card.append(scoreRow(b, m));

  const usage = document.createElement('div');
  usage.className = 'card__usage';
  usage.textContent = usageLabel(m);
  card.append(usage);

  card.append(tagsEditor(b, m));

  // Bottom block (notes → move → actions) — same shape as the folder card, and
  // pinned to the bottom via CSS so it aligns across cards despite the rating.
  const notes = document.createElement('textarea');
  notes.className = 'card__notes';
  notes.placeholder = 'Add a note — also used for suggestions…';
  notes.value = m.notes;
  notes.rows = 2;
  notes.addEventListener('change', async () => {
    await setMeta(b.id, { notes: notes.value });
    m.notes = notes.value;
  });
  card.append(notes, moveControl(b));

  const footer = document.createElement('div');
  footer.className = 'card__footer';
  footer.append(button('Delete', 'btn btn--danger', () => void handleDeleteBookmark(b)));
  card.append(footer);

  return card;
}

/** Tag chips with a small inline input. Tags are searchable and (via notes-like
 *  tokens) part of the bookmark's own words. Rebuilds itself in place so typing
 *  doesn't trigger a full re-render. */
function tagsEditor(b: Bookmark, m: BookmarkMeta): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'tags';

  const rebuild = () => {
    wrap.replaceChildren();
    for (const tag of m.tags) {
      const chip = document.createElement('span');
      chip.className = 'tag';
      chip.textContent = tag;
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'tag__x';
      x.textContent = '×';
      x.title = 'Remove tag';
      x.addEventListener('click', async () => {
        m.tags = m.tags.filter((t) => t !== tag);
        await setMeta(b.id, { tags: m.tags });
        rebuild();
      });
      chip.append(x);
      wrap.append(chip);
    }

    const input = document.createElement('input');
    input.className = 'tag__input';
    input.placeholder = m.tags.length ? '+ tag' : 'add tags…';
    input.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const value = input.value.trim().toLowerCase();
      if (value && !m.tags.includes(value)) {
        m.tags = [...m.tags, value];
        await setMeta(b.id, { tags: m.tags });
        rebuild();
        wrap.querySelector<HTMLInputElement>('.tag__input')?.focus();
      } else {
        input.value = '';
      }
    });
    wrap.append(input);
  };

  rebuild();
  return wrap;
}

/** A "move to folder" dropdown, pre-selected to the bookmark's current folder. */
function moveControl(b: Bookmark): HTMLElement {
  const wrap = document.createElement('label');
  wrap.className = 'move';
  wrap.title = 'Move to folder';

  const select = document.createElement('select');
  select.className = 'move__select';
  for (const f of [...folders].sort((a, x) => a.folderPath.localeCompare(x.folderPath))) {
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = f.folderPath;
    if (f.id === b.parentId) opt.selected = true;
    select.append(opt);
  }
  select.addEventListener('change', async () => {
    await moveBookmark(b.id, select.value);
    await reload();
  });

  wrap.append(select);
  return wrap;
}

function titleLink(b: Bookmark): HTMLElement {
  const a = document.createElement('a');
  a.className = 'card__title';
  a.href = b.url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.textContent = b.title;
  return a;
}

function scoreRow(b: Bookmark, m: BookmarkMeta): HTMLElement {
  const row = document.createElement('div');
  row.className = 'score';

  const score = effectiveScore(m, now);
  const filled = Math.round(score / 20);

  const stars = document.createElement('div');
  stars.className = 'stars';
  for (let i = 1; i <= 5; i++) {
    const star = document.createElement('button');
    star.type = 'button';
    star.className = 'star' + (i <= filled ? ' star--on' : '');
    star.textContent = '★';
    star.title = `Set score to ${i * 20}`;
    star.addEventListener('click', async () => {
      const nextManual = m.manualScore === i * 20 ? null : i * 20;
      await setMeta(b.id, { manualScore: nextManual });
      m.manualScore = nextManual;
      render();
    });
    stars.append(star);
  }

  const tag = document.createElement('span');
  tag.className = 'score__tag';
  tag.textContent = m.manualScore != null ? `manual · ${score}` : `auto · ${score}`;

  row.append(stars, tag);
  return row;
}

function monogram(url: string): HTMLElement {
  const el = document.createElement('span');
  el.className = 'mono';
  let host = 'x';
  try {
    host = new URL(url).host.replace(/^www\./, '');
  } catch {
    /* keep default */
  }
  el.textContent = (host[0] ?? 'x').toUpperCase();
  el.style.background = `hsl(${hashHue(host)} 62% 52%)`;
  return el;
}

// --- Cleanup panel ----------------------------------------------------------

function renderHygiene() {
  hygieneBody.replaceChildren();

  const dupes = findDuplicates(bookmarks);
  const stale = bookmarks.filter((b) => {
    const m = meta(b.id);
    const ageDays = (now - b.dateAdded) / DAY;
    return b.dateAdded > 0 && ageDays > 180 && m.signals.visits === 0;
  });

  const extras = dupes.reduce((n, g) => n + (g.length - 1), 0);

  const dupeLine = hygieneLine(
    `${dupes.length} duplicate URL group(s)`,
    `${extras} redundant bookmark(s) can be removed`,
  );
  if (dupes.length) {
    dupeLine.append(
      button(`Remove all ${extras} duplicates`, 'btn btn--primary', () => void handleDedupeAll(dupes)),
    );
  }
  hygieneBody.append(
    dupeLine,
    hygieneLine(`${stale.length} stale bookmark(s)`, 'added >180 days ago, never opened since install'),
  );

  if (dupes.length) {
    const list = document.createElement('ul');
    list.className = 'dupes';
    for (const group of dupes.slice(0, 30)) {
      const li = document.createElement('li');
      li.className = 'dupes__item';
      const label = document.createElement('span');
      label.className = 'dupes__label';
      label.textContent = `${group.length}× ${prettyUrl(group[0]!.url)}`;
      const keeper = keeperOf(group);
      const clean = button('Keep best, delete rest', 'btn btn--ghost btn--sm', () =>
        void handleDedupeGroup(group),
      );
      clean.title = `Keeps “${keeper.title}” (highest score / oldest), deletes ${group.length - 1}`;
      li.append(label, clean);
      list.append(li);
    }
    hygieneBody.append(list);
  }
}

/** The bookmark to keep from a duplicate group: highest score, then oldest. */
function keeperOf(group: Bookmark[]): Bookmark {
  return pickKeeper(group, (b) => effectiveScore(meta(b.id), now));
}

async function removeAllBut(keeper: Bookmark, group: Bookmark[]): Promise<number> {
  let removed = 0;
  for (const b of group) {
    if (b.id === keeper.id) continue;
    await removeBookmark(b.id);
    await deleteMeta(b.id);
    removed++;
  }
  return removed;
}

async function handleDedupeGroup(group: Bookmark[]) {
  const keeper = keeperOf(group);
  if (!confirm(`Keep “${keeper.title}” and delete ${group.length - 1} duplicate(s)?`)) return;
  await removeAllBut(keeper, group);
  await reload();
}

async function handleDedupeAll(groups: Bookmark[][]) {
  const total = groups.reduce((n, g) => n + (g.length - 1), 0);
  if (!confirm(`Remove ${total} duplicate bookmark(s) across ${groups.length} group(s)? One copy of each is kept.`))
    return;
  for (const group of groups) await removeAllBut(keeperOf(group), group);
  await reload();
}

function hygieneLine(main: string, sub: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'hygiene-line';
  const a = document.createElement('span');
  a.className = 'hygiene-line__main';
  a.textContent = main;
  const b = document.createElement('span');
  b.className = 'hygiene-line__sub';
  b.textContent = sub;
  el.append(a, b);
  return el;
}

// --- Actions ----------------------------------------------------------------

async function handleDeleteBookmark(b: Bookmark) {
  if (!confirm(`Delete “${b.title}”? This removes the browser bookmark.`)) return;
  await removeBookmark(b.id);
  await deleteMeta(b.id);
  await reload();
}

async function handleRenameFolder(f: Folder) {
  const name = prompt('Rename folder', f.title);
  if (!name || name.trim() === f.title) return;
  await renameNode(f.id, name.trim());
  await reload();
}

async function handleDeleteFolder(f: Folder) {
  const nBm = childBookmarks(f.id).length;
  const nSub = childFolders(f.id).length;
  const warn =
    nBm || nSub
      ? `Delete folder “${f.title}” and everything inside it (${nBm} bookmark(s), ${nSub} subfolder(s))?`
      : `Delete empty folder “${f.title}”?`;
  if (!confirm(warn)) return;
  // If we're inside the folder being deleted, step out to its parent first.
  if (currentFolderId === f.id) currentFolderId = f.parentId ?? null;
  await removeFolderTree(f.id);
  await reload();
}

async function handleNewFolder() {
  const name = prompt('New folder name');
  if (!name || !name.trim()) return;

  // At Home, create under the first top-level folder (usually the bookmarks
  // bar) since the invisible root can't hold new folders directly.
  let parentId = currentFolderId;
  if (parentId === null) {
    const firstTop = childFolders(null)[0];
    if (!firstTop) {
      alert('No top-level folder to create in. Open a folder first.');
      return;
    }
    parentId = firstTop.id;
  }
  const id = await createFolder(parentId, name.trim());
  await reload();
  navigate(id);
}

// --- Controls & settings drawer ---------------------------------------------

function wireControls() {
  searchInput.addEventListener('input', render);
  sortSelect.addEventListener('change', render);
  themeSelect.addEventListener('change', async () => {
    const theme = themeSelect.value as Theme;
    applyTheme(theme);
    settings = await setSettings({ theme });
  });
}

function wireFolderBar() {
  newFolderBtn.addEventListener('click', () => void handleNewFolder());
}

function wireBackup() {
  const fileInput = $<HTMLInputElement>('#import-file');

  $('#export-backup').addEventListener('click', () => {
    const data = buildBackup(bookmarks, folders, metas, new Date().toISOString());
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `book-zad-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  $('#import-backup').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = ''; // allow re-importing the same file later
    if (!file) return;

    let data: unknown;
    try {
      data = JSON.parse(await file.text());
    } catch {
      alert('That file isn’t valid JSON.');
      return;
    }
    if (!isBackup(data)) {
      alert('That file isn’t a BookZad backup.');
      return;
    }
    const res = await applyBackup(data, bookmarks, folders);
    await reload();
    alert(`Restored ${res.bookmarks} bookmark(s) and ${res.folders} folder(s) from the backup.`);
  });
}

function wireDrawer() {
  const drawer = $<HTMLElement>('#drawer');
  const scrim = $<HTMLElement>('#scrim');
  const nudge = $<HTMLInputElement>('#set-nudge');
  const toast = $<HTMLInputElement>('#set-toast');
  const threshold = $<HTMLInputElement>('#set-threshold');
  const thresholdValue = $<HTMLElement>('#threshold-value');

  const open = () => {
    nudge.checked = settings.nudgeEnabled;
    toast.checked = settings.toastEnabled;
    threshold.value = String(Math.round(settings.similarityThreshold * 100));
    thresholdValue.textContent = threshold.value + '%';
    drawer.hidden = false;
    scrim.hidden = false;
  };
  const close = () => {
    drawer.hidden = true;
    scrim.hidden = true;
  };

  $('#settings-btn').addEventListener('click', open);
  $('#drawer-close').addEventListener('click', close);
  scrim.addEventListener('click', close);

  nudge.addEventListener('change', async () => {
    settings = await setSettings({ nudgeEnabled: nudge.checked });
  });
  toast.addEventListener('change', async () => {
    settings = await setSettings({ toastEnabled: toast.checked });
  });
  threshold.addEventListener('input', () => {
    thresholdValue.textContent = threshold.value + '%';
  });
  threshold.addEventListener('change', async () => {
    settings = await setSettings({ similarityThreshold: Number(threshold.value) / 100 });
  });
}

// --- Small helpers ----------------------------------------------------------

function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

function usageLabel(m: BookmarkMeta): string {
  if (m.signals.visits === 0) return 'not opened yet';
  const when = m.signals.lastVisit ? new Date(m.signals.lastVisit).toLocaleDateString() : 'unknown';
  return `${m.signals.visits} visit(s) · last ${when}`;
}

function prettyUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.host.replace(/^www\./, '') + (u.pathname === '/' ? '' : u.pathname);
  } catch {
    return url;
  }
}

function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}
