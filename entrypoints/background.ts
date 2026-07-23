import { onMessage } from '@/lib/messaging';
import { buildFolderIndex, matchPage, type FolderIndex } from '@/lib/similarity';
import { getSettings } from '@/lib/settings';
import { getIgnoredSites, isIgnored, seedDefaultIgnores, IGNORE_KEY } from '@/lib/ignore';
import { findByUrl, createBookmark } from '@/lib/bookmarks';
import { getMeta, setMeta, deleteMeta, setLastFolder } from '@/lib/storage';
import { openManager } from '@/lib/manager';

// The background worker: keeps the folder similarity index warm, answers the
// content script's "is this page familiar?" queries (setting a toolbar badge),
// records usage signals for scoring, and services the toast's add/open actions.
// (The toolbar click opens the popup — see entrypoints/popup — not this worker.)

// MV3 (Chrome/Edge) exposes the toolbar API as `browser.action`; Firefox MV2
// exposes it as `browser.browserAction`. Use whichever exists.
const action = browser.action ?? (browser as unknown as { browserAction: typeof browser.action }).browserAction;

export default defineBackground(() => {
  // Warm the index now, and invalidate it whenever the bookmark tree changes so
  // the next query rebuilds from fresh data. Clean up metadata on removal.
  void ensureIndex();

  // Mute the search engines out of the box (once — see seedDefaultIgnores).
  browser.runtime.onInstalled.addListener(() => void seedDefaultIgnores());

  browser.bookmarks.onCreated.addListener(invalidateIndex);
  browser.bookmarks.onChanged.addListener(invalidateIndex);
  browser.bookmarks.onMoved.addListener(invalidateIndex);
  browser.bookmarks.onRemoved.addListener((id) => {
    invalidateIndex();
    void deleteMeta(id);
  });

  // Notes/tokens live in storage, not the bookmark tree, so a note edit doesn't
  // fire a bookmarks event — invalidate the index when our metadata changes so
  // updated notes feed suggestions right away.
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && Object.keys(changes).some((k) => k.startsWith('meta:'))) {
      invalidateIndex();
    }
    // Muting a site takes effect immediately — pull any badge already showing
    // on its open tabs (the content script pulls its own toast).
    if (area === 'sync' && changes[IGNORE_KEY]) {
      void clearBadgesForIgnored();
    }
  });

  onMessage('analyzePage', async ({ data, sender }) => {
    const settings = await getSettings();
    const tabId = sender.tab?.id;
    if (!settings.nudgeEnabled) {
      if (tabId !== undefined) await setBadge(tabId, 0);
      return { matches: [] };
    }

    // A muted site never gets a suggestion, however well it matches.
    if (isIgnored(data.url, await getIgnoredSites())) {
      if (tabId !== undefined) await setBadge(tabId, 0);
      return { matches: [] };
    }

    const index = await ensureIndex();
    const matches = matchPage(index, data.text, settings.similarityThreshold);
    if (tabId !== undefined) await setBadge(tabId, matches.length);
    return { matches };
  });

  onMessage('recordVisit', async ({ data }) => {
    const bookmarks = await findByUrl(data.url);
    if (bookmarks.length === 0) return;
    for (const b of bookmarks) {
      const meta = await getMeta(b.id);
      await setMeta(b.id, {
        signals: {
          visits: meta.signals.visits + 1,
          lastVisit: Date.now(),
          dwellMs: meta.signals.dwellMs + Math.max(0, data.dwellMs),
        },
        // Refresh the stored page tokens so the index sharpens over time.
        tokens: data.tokens,
      });
    }
    // Captured page tokens changed the corpus — rebuild lazily.
    invalidateIndex();
  });

  // Toast "Add here" → create the bookmark in the matched folder.
  onMessage('addToFolder', async ({ data }) => {
    try {
      await createBookmark(data.folderId, data.title || data.url, data.url);
      invalidateIndex();
      return { ok: true };
    } catch {
      return { ok: false };
    }
  });

  // Toast "Open folder" → open the manager focused on that folder.
  onMessage('openManagerAt', async ({ data }) => {
    await setLastFolder(data.folderId);
    await openManager();
  });

  // Cleanup "dead link" scan → probe whether a URL still resolves. host
  // permissions let the worker read cross-origin responses.
  onMessage('checkLink', ({ data }) => probeLink(data.url));
});

/** Best-effort reachability probe. HEAD first (cheap), falling back to GET when
 *  the server rejects HEAD. Only hard failures count as dead — 401/403/429 are
 *  treated as reachable to avoid deleting valid but bot-protected links. */
async function probeLink(url: string): Promise<{ status: number; dead: boolean }> {
  const opts: RequestInit = { redirect: 'follow', signal: AbortSignal.timeout(8000) };
  try {
    let res = await fetch(url, { ...opts, method: 'HEAD' });
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, { ...opts, method: 'GET' });
    }
    return { status: res.status, dead: isDead(res.status) };
  } catch {
    return { status: 0, dead: true }; // network / DNS failure or timeout
  }
}

function isDead(status: number): boolean {
  return status === 0 || status === 404 || status === 410 || status >= 500;
}

/** Clear the toolbar badge on every open tab whose site is now muted. */
async function clearBadgesForIgnored(): Promise<void> {
  const list = await getIgnoredSites();
  if (list.length === 0) return;
  const tabs = await browser.tabs.query({});
  for (const tab of tabs) {
    if (tab.id !== undefined && tab.url && isIgnored(tab.url, list)) {
      await setBadge(tab.id, 0);
    }
  }
}

// --- Similarity index (kept in worker memory, rebuilt lazily) ---------------

let index: FolderIndex | null = null;
let building: Promise<FolderIndex> | null = null;

async function ensureIndex(): Promise<FolderIndex> {
  if (index) return index;
  if (!building) {
    building = buildFolderIndex().then((built) => {
      index = built;
      building = null;
      return built;
    });
  }
  return building;
}

function invalidateIndex(): void {
  index = null;
}

// --- Toolbar badge ----------------------------------------------------------

async function setBadge(tabId: number, count: number): Promise<void> {
  try {
    await action.setBadgeText({ tabId, text: count > 0 ? String(count) : '' });
    if (count > 0) {
      await action.setBadgeBackgroundColor({ tabId, color: '#46bea0' });
    }
  } catch {
    // Tab may have closed between analysis and badge update — ignore.
  }
}
