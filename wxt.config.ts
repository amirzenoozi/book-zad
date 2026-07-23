import { defineConfig } from 'wxt';

// WXT generates one manifest per browser from this config + the files in
// entrypoints/. Chrome/Edge build as MV3 (background.service_worker), Firefox as
// MV2 (background.scripts) with the gecko id below.
// See https://wxt.dev/guide/essentials/config/manifest.html
export default defineConfig({
  manifest: {
    name: 'BookZad — bookmarks, reimagined',
    description:
      'Score, search and de-clutter your bookmarks. As you browse, BookZad nudges you when a page matches a folder you already keep — all on-device.',
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      128: 'icon/128.png',
    },
    // Clicking the toolbar button opens the popup (entrypoints/popup) — a quick
    // launcher + settings. WXT auto-fills action.default_popup from that
    // entrypoint; the popup's "Open manager" button opens the full page.
    action: {
      default_icon: {
        16: 'icon/16.png',
        32: 'icon/32.png',
        48: 'icon/48.png',
        128: 'icon/128.png',
      },
      default_title: 'BookZad',
    },
    // bookmarks: read/organise the native bookmark tree (source of truth).
    // storage:   our layered metadata (notes, scores, tags), the TF-IDF index
    //            and settings — the native bookmarks API can't hold these.
    // tabs:      read the active tab's url/title for quick-add and badge control.
    permissions: ['bookmarks', 'storage', 'tabs'],
    // <all_urls> lets the content script read the text of pages the user visits
    // so it can be compared against saved bookmarks. All comparison is local
    // (TF-IDF); nothing is transmitted. See PRIVACY.md.
    host_permissions: ['<all_urls>'],
    // The in-page toast (shadow DOM on host pages) loads the bundled Vazirmatn
    // font for Persian text, so it must be reachable from those pages.
    web_accessible_resources: [
      {
        resources: ['fonts/*.woff2'],
        matches: ['<all_urls>'],
      },
    ],
    browser_specific_settings: {
      gecko: {
        // Required by AMO. Change to your own id before publishing.
        id: 'book-zad@book-zad.app',
        // We don't collect or transmit any user data — declare so for AMO.
        data_collection_permissions: {
          required: ['none'],
        },
      },
    },
  },
});
