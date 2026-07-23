import {
  loadTree,
  findDuplicates,
  removeBookmark,
  moveBookmark,
  moveFolder,
  createFolder,
  renameNode,
  removeFolderTree,
  normalizeUrl,
} from '@/lib/bookmarks';
import {
  getManyMeta,
  setMeta,
  deleteMeta,
  getLastFolder,
  setLastFolder,
  getDeadCheck,
  setDeadCheck,
  type DeadCheck,
} from '@/lib/storage';
import { getSettings, setSettings } from '@/lib/settings';
import {
  getIgnoredSites,
  addIgnoredSite,
  removeIgnoredSite,
  addPresetSites,
  removePresetSites,
  toHost,
  PRESETS,
} from '@/lib/ignore';
import { effectiveScore } from '@/lib/scoring';
import { pickKeeper } from '@/lib/dedupe';
import { buildBackup, isBackup, applyBackup } from '@/lib/backup';
import { sendMessage } from '@/lib/messaging';
import { applyTheme } from '@/lib/theme';
import {
  t,
  plural,
  localeCode,
  applyDirection,
  localizeDom,
  type MessageKey,
} from '@/lib/i18n';
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

/** Which accordion section is open per group ("hygiene", "muted") — one at a
 *  time within a group, remembered across re-renders. */
const openAcc = new Map<string, string | null>();

/** Sites the similarity nudge stays quiet on (shared with the toolbar popup). */
let mutedSites: string[] = [];

/** Last persisted dead-link scan, loaded on reload so results survive reopening. */
let lastDeadCheck: DeadCheck | null = null;

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

const searchInput = $<HTMLInputElement>('#search');
const sortSelect = $<HTMLSelectElement>('#sort');
const themeSelect = $<HTMLSelectElement>('#theme');
const grid = $<HTMLDivElement>('#grid');
const emptyMsg = $<HTMLParagraphElement>('#empty');
const statsEl = $<HTMLElement>('#stats');
const hygieneBody = $<HTMLDivElement>('#hygiene-body');
const mutedBody = $<HTMLDivElement>('#muted-body');
const folderbar = $<HTMLDivElement>('#folderbar');
const crumbsEl = $<HTMLElement>('#crumbs');
const newFolderBtn = $<HTMLButtonElement>('#new-folder');

init();

async function init() {
  applyDirection();
  localizeDom();
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
  lastDeadCheck = await getDeadCheck();
  mutedSites = await getIgnoredSites();

  // If the folder we were viewing was deleted/moved away, fall back to Home.
  if (currentFolderId && !foldersById.has(currentFolderId)) currentFolderId = null;

  render();
  renderHygiene();
  renderMuted();
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
  // The folder view overwrites this text, so set it back on the way in.
  emptyMsg.textContent = t('empty_search');
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
  emptyMsg.textContent = t('empty_folder');
  renderStats(items.length);
}

function renderCrumbs() {
  const parts: Node[] = [crumb(t('home'), () => navigate(null), currentFolderId === null)];
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
    stat(String(bookmarks.length), t('stat_bookmarks')),
    stat(String(folders.length), t('stat_folders')),
    stat(String(shown), t('stat_shown')),
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
  count.textContent =
    plural(nBm, 'count_bookmarks_one', 'count_bookmarks_other') +
    (nSub ? plural(nSub, 'count_folders_one', 'count_folders_other') : '');

  const footer = document.createElement('div');
  footer.className = 'card__footer';
  footer.append(
    button(t('action_rename'), 'btn btn--ghost btn--sm', () => void handleRenameFolder(f)),
    button(t('action_delete'), 'btn btn--danger', () => void handleDeleteFolder(f)),
  );

  // Folder note — searchable label, and a weighted source for suggestions.
  const fm = meta(f.id);
  const notes = document.createElement('textarea');
  notes.className = 'card__notes';
  notes.placeholder = t('folder_note_placeholder');
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
  wrap.title = t('move_folder_to');

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
  notes.placeholder = t('note_placeholder');
  notes.value = m.notes;
  notes.rows = 2;
  notes.addEventListener('change', async () => {
    await setMeta(b.id, { notes: notes.value });
    m.notes = notes.value;
  });
  card.append(notes, moveControl(b));

  const footer = document.createElement('div');
  footer.className = 'card__footer';
  footer.append(button(t('action_delete'), 'btn btn--danger', () => void handleDeleteBookmark(b)));
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
      x.title = t('remove_tag');
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
    input.placeholder = m.tags.length ? t('tag_add_more') : t('tag_add_first');
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
  wrap.title = t('move_to_folder');

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
    star.title = t('set_score_to', String(i * 20));
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
  tag.textContent =
    m.manualScore != null ? t('score_manual', String(score)) : t('score_auto', String(score));

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
  const extras = dupes.reduce((n, g) => n + (g.length - 1), 0);
  const stale = bookmarks.filter((b) => {
    const m = meta(b.id);
    const ageDays = (now - b.dateAdded) / DAY;
    return b.dateAdded > 0 && ageDays > 180 && m.signals.visits === 0;
  });

  const acc = document.createElement('div');
  acc.className = 'acc';
  acc.append(
    accSection('hygiene', 'duplicates', t('acc_duplicates'),
      dupes.length ? t('dupes_summary', [String(dupes.length), String(extras)]) : t('acc_none_found'),
      (body) => buildDupBody(body, dupes, extras)),
    accSection('hygiene', 'stale', t('acc_stale'),
      stale.length ? t('stale_summary', String(stale.length)) : t('acc_none_found'),
      (body) => buildStaleBody(body, stale)),
    accSection('hygiene', 'dead', t('acc_dead'), t('dead_summary'), (body) => buildDeadBody(body)),
  );
  hygieneBody.append(acc);
}

/** One accordion section. Only one is open at a time — opening a section closes
 *  its siblings — and the open one is remembered across re-renders. Bodies are
 *  built eagerly so their content (e.g. a dead-link scan result) survives while
 *  the section is collapsed. */
function accSection(
  group: string,
  key: string,
  title: string,
  summary: string,
  build: (body: HTMLElement) => void,
): HTMLElement {
  const item = document.createElement('div');
  item.className = 'acc__item';

  const header = document.createElement('button');
  header.type = 'button';
  header.className = 'acc__header';
  const chev = document.createElement('span');
  chev.className = 'acc__chev';
  chev.textContent = '▸';
  const t = document.createElement('span');
  t.className = 'acc__title';
  t.textContent = title;
  const s = document.createElement('span');
  s.className = 'acc__summary';
  s.textContent = summary;
  header.append(chev, t, s);

  const body = document.createElement('div');
  body.className = 'acc__body';
  build(body);

  if (openAcc.get(group) === key) item.classList.add('open');

  header.addEventListener('click', () => {
    const isOpen = item.classList.contains('open');
    item.parentElement?.querySelectorAll('.acc__item.open').forEach((el) => el.classList.remove('open'));
    if (isOpen) {
      openAcc.set(group, null);
    } else {
      item.classList.add('open');
      openAcc.set(group, key);
    }
  });

  item.append(header, body);
  return item;
}

function buildDupBody(body: HTMLElement, dupes: Bookmark[][], extras: number) {
  if (dupes.length === 0) {
    body.append(accNote(t('dupes_none')));
    return;
  }
  const bar = document.createElement('div');
  bar.className = 'acc__bar';
  bar.append(button(t('dupes_remove_all', String(extras)), 'btn btn--primary btn--sm', () => void handleDedupeAll(dupes)));
  body.append(bar);

  const list = document.createElement('ul');
  list.className = 'dupes';
  for (const group of dupes.slice(0, 50)) {
    const li = document.createElement('li');
    li.className = 'dupes__item';
    const label = document.createElement('span');
    label.className = 'dupes__label';
    label.textContent = t('dupes_group_label', [String(group.length), prettyUrl(group[0]!.url)]);
    const keeper = keeperOf(group);
    const clean = button(t('dupes_keep_best'), 'btn btn--ghost btn--sm', () => void handleDedupeGroup(group));
    clean.title = t('dupes_keep_title', [keeper.title, String(group.length - 1)]);
    li.append(label, clean);
    list.append(li);
  }
  body.append(list);
}

function buildStaleBody(body: HTMLElement, stale: Bookmark[]) {
  body.append(accNote(t('stale_note')));
  if (stale.length === 0) {
    body.append(accNote(t('stale_none')));
    return;
  }
  const list = document.createElement('ul');
  list.className = 'dupes';
  for (const b of stale.slice(0, 100)) {
    const li = document.createElement('li');
    li.className = 'dupes__item';
    const label = document.createElement('span');
    label.className = 'dupes__label';
    label.textContent = `${b.title} — ${prettyUrl(b.url)}`;
    const del = button(t('action_delete'), 'btn btn--danger btn--sm', async () => {
      await removeBookmark(b.id);
      await deleteMeta(b.id);
      bookmarks = bookmarks.filter((x) => x.id !== b.id);
      metas.delete(b.id);
      li.remove();
    });
    li.append(label, del);
    list.append(li);
  }
  body.append(list);
}

function buildDeadBody(body: HTMLElement) {
  body.append(accNote(t('dead_note')));
  const bar = document.createElement('div');
  bar.className = 'acc__bar';
  const progress = document.createElement('span');
  progress.className = 'hygiene-line__sub';
  const results = document.createElement('div');
  const scanBtn = button(t('dead_scan'), 'btn btn--ghost btn--sm', () =>
    void scanDeadLinks(scanBtn, progress, results),
  );
  bar.append(scanBtn, progress);
  body.append(bar, results);

  // Show the last persisted scan (matched to the current bookmarks by URL).
  if (lastDeadCheck) {
    const deadSet = new Set(lastDeadCheck.deadUrls.map(normalizeUrl));
    const dead = bookmarks.filter((b) => deadSet.has(normalizeUrl(b.url)));
    renderDeadResults(results, dead, lastDeadCheck.checkedAt);
  }
}

function accNote(text: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'acc__note';
  el.textContent = text;
  return el;
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
  if (!confirm(t('confirm_dedupe_group', [keeper.title, String(group.length - 1)]))) return;
  await removeAllBut(keeper, group);
  await reload();
}

async function handleDedupeAll(groups: Bookmark[][]) {
  const total = groups.reduce((n, g) => n + (g.length - 1), 0);
  if (!confirm(t('confirm_dedupe_all', [String(total), String(groups.length)])))
    return;
  for (const group of groups) await removeAllBut(keeperOf(group), group);
  await reload();
}

// --- Dead-link scan ---------------------------------------------------------

let deadScanning = false;

async function scanDeadLinks(btn: HTMLButtonElement, progressEl: HTMLElement, resultsEl: HTMLElement) {
  if (deadScanning) return;
  deadScanning = true;
  btn.disabled = true;
  resultsEl.replaceChildren();

  const targets = [...bookmarks];
  const dead: Bookmark[] = [];
  let done = 0;
  let idx = 0;

  // A small worker pool — one network probe per bookmark, a few at a time.
  const worker = async () => {
    while (idx < targets.length) {
      const b = targets[idx++]!;
      try {
        const r = await sendMessage('checkLink', { url: b.url });
        if (r.dead) dead.push(b);
      } catch {
        /* ignore individual failures */
      }
      done++;
      progressEl.textContent = t('dead_scanning', [String(done), String(targets.length)]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, targets.length) }, worker));

  // Persist so the result is there next time the manager opens.
  lastDeadCheck = { checkedAt: Date.now(), deadUrls: dead.map((b) => b.url) };
  await setDeadCheck(lastDeadCheck);

  progressEl.textContent = t('dead_checked', String(targets.length));
  btn.disabled = false;
  deadScanning = false;
  renderDeadResults(resultsEl, dead, lastDeadCheck.checkedAt);
}

function renderDeadResults(el: HTMLElement, dead: Bookmark[], checkedAt?: number) {
  el.replaceChildren();
  if (checkedAt) el.append(accNote(t('dead_last_checked', new Date(checkedAt).toLocaleString(localeCode()))));
  if (dead.length === 0) {
    el.append(accNote(t('dead_none')));
    return;
  }

  const head = hygieneLine(t('dead_count', String(dead.length)), t('dead_sub'));
  head.append(button(t('dead_remove_all', String(dead.length)), 'btn btn--danger btn--sm', () => void removeDeadLinks(dead)));
  el.append(head);

  const list = document.createElement('ul');
  list.className = 'dupes';
  for (const b of dead.slice(0, 100)) {
    const li = document.createElement('li');
    li.className = 'dupes__item';
    const label = document.createElement('span');
    label.className = 'dupes__label';
    label.textContent = `${b.title} — ${prettyUrl(b.url)}`;
    const del = button(t('action_delete'), 'btn btn--danger btn--sm', async () => {
      await removeBookmark(b.id);
      await deleteMeta(b.id);
      bookmarks = bookmarks.filter((x) => x.id !== b.id);
      metas.delete(b.id);
      li.remove();
    });
    li.append(label, del);
    list.append(li);
  }
  el.append(list);
}

async function removeDeadLinks(dead: Bookmark[]) {
  if (!confirm(t('confirm_delete_dead', String(dead.length)))) return;
  for (const b of dead) {
    await removeBookmark(b.id);
    await deleteMeta(b.id);
  }
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

// --- Muted-sites panel ------------------------------------------------------

/** Sites the similarity nudge never fires on. Same collapsible treatment as the
 *  cleanup panel, and the same sync-storage list the toolbar popup's "Don't
 *  suggest here" writes to — so the two views always agree. */
function renderMuted() {
  mutedBody.replaceChildren();
  const acc = document.createElement('div');
  acc.className = 'acc';
  acc.append(
    accSection(
      'muted',
      'sites',
      t('muted_sites'),
      mutedSites.length ? t('muted_count', String(mutedSites.length)) : t('muted_none'),
      buildMutedBody,
    ),
  );
  mutedBody.append(acc);
}

function buildMutedBody(body: HTMLElement) {
  body.append(
    accNote(t('muted_note')),
  );

  // One toggle per preset bundle: it reads as "on" once every site in it is
  // muted, and clicking again unmutes the whole group. A partly-muted group
  // reads as off, so the first click tops it up.
  const presets = document.createElement('div');
  presets.className = 'mute__presets';
  for (const preset of PRESETS) {
    const applied = preset.sites.every((s) => mutedSites.includes(s));
    // Preset keys are data, so these two lookups can't be statically checked.
    const label = t(`preset_${preset.key}` as MessageKey);
    const hint = t(`preset_${preset.key}_hint` as MessageKey);
    const b = button(
      `${applied ? '✓' : '+'} ${label}`,
      `mute__preset${applied ? ' mute__preset--on' : ''}`,
      () =>
        void mutate(applied ? removePresetSites(preset.sites) : addPresetSites(preset.sites)),
    );
    b.setAttribute('aria-pressed', String(applied));
    b.title = applied
      ? t('preset_unmute_all', [String(preset.sites.length), hint])
      : t('preset_mute_all', [String(preset.sites.length), hint]);
    presets.append(b);
  }

  const form = document.createElement('form');
  form.className = 'mute__add';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'mute__input';
  input.placeholder = t('muted_add_placeholder');
  input.autocomplete = 'off';
  input.spellcheck = false;
  const add = document.createElement('button');
  add.type = 'submit';
  add.className = 'btn';
  add.textContent = t('action_add');
  form.append(input, add);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const host = toHost(input.value);
    if (!host) {
      input.setCustomValidity(t('muted_invalid'));
      input.reportValidity();
      return;
    }
    input.value = '';
    void mutate(addIgnoredSite(host), true);
  });
  input.addEventListener('input', () => input.setCustomValidity(''));

  const list = document.createElement('ul');
  list.className = 'mute__list';
  if (mutedSites.length === 0) {
    const li = document.createElement('li');
    li.className = 'mute__empty';
    li.textContent = t('muted_empty');
    list.append(li);
  } else {
    for (const site of mutedSites) {
      const li = document.createElement('li');
      li.className = 'mute__item';
      const name = document.createElement('span');
      name.textContent = site;
      const x = button('×', 'mute__x', () => void mutate(removeIgnoredSite(site)));
      x.title = t('muted_unmute_site', site);
      x.setAttribute('aria-label', x.title);
      li.append(name, x);
      list.append(li);
    }
  }

  body.append(presets, form, list);
}

/** Apply a change to the list, then repaint the section (which refreshes the
 *  header count too). `refocus` puts the cursor back for adding another domain. */
async function mutate(change: Promise<string[]>, refocus = false) {
  mutedSites = await change;
  renderMuted();
  if (refocus) mutedBody.querySelector<HTMLInputElement>('.mute__input')?.focus();
}

// --- Actions ----------------------------------------------------------------

async function handleDeleteBookmark(b: Bookmark) {
  if (!confirm(t('confirm_delete_bookmark', b.title))) return;
  await removeBookmark(b.id);
  await deleteMeta(b.id);
  await reload();
}

async function handleRenameFolder(f: Folder) {
  const name = prompt(t('prompt_rename_folder'), f.title);
  if (!name || name.trim() === f.title) return;
  await renameNode(f.id, name.trim());
  await reload();
}

async function handleDeleteFolder(f: Folder) {
  const nBm = childBookmarks(f.id).length;
  const nSub = childFolders(f.id).length;
  const warn =
    nBm || nSub
      ? t('confirm_delete_folder', [f.title, String(nBm), String(nSub)])
      : t('confirm_delete_folder_empty', f.title);
  if (!confirm(warn)) return;
  // If we're inside the folder being deleted, step out to its parent first.
  if (currentFolderId === f.id) currentFolderId = f.parentId ?? null;
  await removeFolderTree(f.id);
  await reload();
}

async function handleNewFolder() {
  const name = prompt(t('prompt_new_folder'));
  if (!name || !name.trim()) return;

  // At Home, create under the first top-level folder (usually the bookmarks
  // bar) since the invisible root can't hold new folders directly.
  let parentId = currentFolderId;
  if (parentId === null) {
    const firstTop = childFolders(null)[0];
    if (!firstTop) {
      alert(t('alert_no_top_folder'));
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
      alert(t('backup_invalid_json'));
      return;
    }
    if (!isBackup(data)) {
      alert(t('backup_invalid'));
      return;
    }
    const res = await applyBackup(data, bookmarks, folders);
    await reload();
    const parts = [t('backup_updated', String(res.updated))];
    if (res.created) parts.push(t('backup_created', String(res.created)));
    if (res.folders) parts.push(t('backup_folders', String(res.folders)));
    alert(t('backup_restored', parts.join(', ')));
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
