import { onMessage } from '@/lib/messaging';
import { buildFolderIndex, matchPage, type FolderIndex } from '@/lib/similarity';
import { getSettings } from '@/lib/settings';
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
  });

  onMessage('analyzePage', async ({ data, sender }) => {
    const settings = await getSettings();
    const tabId = sender.tab?.id;
    if (!settings.nudgeEnabled) {
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
});

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
