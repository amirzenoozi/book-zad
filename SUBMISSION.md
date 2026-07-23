# Store submission reference

Everything you need to fill the Chrome Web Store, Firefox AMO and Edge Add-ons
listings. Copy fields verbatim; character counts are noted where a store enforces
a limit.

Artifacts (from `npm run package`, in `.output/`):
- `book-zad-1.0.0-chrome.zip`  → Chrome Web Store
- `book-zad-1.0.0-firefox.zip` + `book-zad-1.0.0-sources.zip` → Firefox AMO
- `book-zad-1.0.0-edge.zip`    → Edge Add-ons

---

## Shared copy (all three stores)

**Extension name** (≤45 chars — 31):
```
BookZad — bookmarks, reimagined
```

**Short description / summary** (this is the field that errored — now 120 chars, Chrome limit 132):
```
Score, search and de-clutter your bookmarks. On-device nudges suggest a folder when a page matches one you already keep.
```

**Firefox summary** (AMO allows 250 — you can use the short one above, or this fuller line, 178):
```
Score, search and de-clutter your native bookmarks — add notes, tags and ratings, clean up duplicates and dead links, and get an on-device nudge when a page matches a folder you keep.
```

**Detailed description** (Chrome ≤16,000, Edge ≤10,000, Firefox unlimited):
```
BookZad manages your browser bookmarks in a new way. It layers on top of your
native bookmarks — they stay the source of truth and keep working everywhere
else — and adds the tools a plain bookmark list is missing.

FEATURES

• Full manager page — a card dashboard of every bookmark, opened from the
  toolbar popup. Navigate folders with breadcrumbs; create, rename and delete
  folders; move a bookmark, or a whole folder, anywhere.

• Quick-add — save the page you're on into any folder in one click, with a
  duplicate check so you never double-save.

• Powerful search — filter instantly across title, URL, notes and tags.

• Notes & tags — annotate and tag any bookmark. Both are searchable and make
  the suggestions sharper.

• Scoring & ranking — every bookmark earns a score from how you actually use it
  (visits, recency, dwell time — all tracked locally), and you can override it
  with a manual star rating. Sort by score, recency, visits or title.

• Smart cleanup — duplicates, stale bookmarks and dead links surfaced in one
  tidy panel; remove them per-item or in bulk, keeping the copy you value most.

• Full backup — export a JSON file of ALL your bookmarks plus their notes, tags
  and scores, and import it back on any browser; missing bookmarks and folders
  are recreated automatically.

• Similarity nudge — as you browse, BookZad compares the page against your saved
  folders (local TF-IDF keyword matching) and, on a match, shows a quiet toolbar
  badge — plus an optional, actionable in-page card — suggesting the folder you
  might file it in, or the saved pages worth revisiting.

PRIVATE BY DESIGN

BookZad has no account and no server. The similarity check reads the page you're
on only to compare it, on your device, against your bookmarks. Nothing is ever
transmitted. Persian/Arabic text uses the Vazirmatn font bundled inside the
extension — never fetched from a CDN.
```

**Category:** Productivity (Edge: "Productivity"; Firefox: "Bookmarks" + "Tabs").

**Language:** English (primary) + Persian/Farsi. The extension name and short
description are localised in the package (`_locales/en` + `_locales/fa`), so
Chrome shows the Persian name and description to Persian-locale users
automatically — you can also paste the Persian copy into the store's own
per-language listing fields.

**Privacy policy URL:**
```
https://amirzenoozi.github.io/book-zad/en/privacy.html
```
Persian: `https://amirzenoozi.github.io/book-zad/fa/privacy.html`

**Homepage / support URL:**
```
https://amirzenoozi.github.io/book-zad/
```
Support / issues: `https://github.com/amirzenoozi/book-zad/issues`

**Search terms / keywords** (Edge & AMO tags): bookmarks, bookmark manager,
organize bookmarks, duplicate finder, dead link, tags, notes, privacy.

**Graphics** (in `mockups/`, already at store sizes):
- Icon 128×128 — `.output/*/icon/128.png`
- Screenshots 1280×800 — `banner.png`, `banner-nudge.png`, `banner-popup.png`
- Popup shots 600×1031 — `popup-dark.png`, `popup-light.png`
- Small promo tile 440×280 — `promo-small.png`
- Marquee 1400×560 — `promo-marquee.png`

---

## Single purpose (Chrome & Edge require this)

```
BookZad is a bookmark manager. Its single purpose is to help users organize,
search, rate and clean up their browser bookmarks, and to suggest a relevant
bookmark folder for the page they are currently viewing. All processing happens
on the user's device.
```

---

## Permission justifications (Chrome & Edge require one per permission)

**bookmarks**
```
Core function. BookZad reads and organizes the user's native bookmark tree —
listing, creating, renaming, moving and deleting bookmarks and folders is the
whole point of the extension.
```

**storage**
```
Stores the extension's own data locally: per-bookmark notes, tags, manual
ratings and usage signals, the local similarity index, and user settings. The
native bookmarks API cannot hold these extra fields. Nothing is sent to a server.
```

**tabs**
```
Reads the active tab's URL and title so the user can save the current page
(quick-add) and so the toolbar badge can reflect whether the current page
matches a saved folder.
```

**host_permissions: <all_urls>** (Chrome calls this the host-permission / broad
site-access justification)
```
The content script reads the text of the page the user is viewing so it can be
compared, entirely on-device, against the user's saved bookmarks to power the
similarity nudge. The comparison is local TF-IDF keyword matching; no page
content or browsing data is ever transmitted or stored beyond a local keyword
index.
```

**Remote code:** No. The extension executes no remote code; all scripts and the
Vazirmatn font are bundled in the package.

---

## Chrome Web Store — Privacy / data-use tab

Data handling — answer these as follows:

- **Does your extension collect or use user data?** Technically it processes
  bookmarks and page content locally, so tick the relevant boxes, but for every
  data type select **NOT sold to third parties**, **NOT used/transferred for
  purposes unrelated to the single purpose**, and **NOT used for
  creditworthiness/lending**. Nothing leaves the device.
- **Data types:** "Website content" (page text, processed locally for the
  similarity match) and "User activity" only in the loose sense of local usage
  counts. No personally identifiable information, no authentication info, no
  location, no financial info.
- **Privacy policy URL:** the GitHub Pages privacy link above.
- Certify compliance with the Developer Program Policies.

Suggested one-liner for the "how you handle data" box:
```
All data (bookmarks, notes, tags, ratings, page keywords) is stored and
processed locally on the user's device. Nothing is transmitted to any server,
sold, or shared. There is no account and no backend.
```

---

## Firefox AMO specifics

- **Data collection:** the manifest already declares
  `browser_specific_settings.gecko.data_collection_permissions.required = ['none']`.
  In the AMO form, select "Does not collect/transmit any data."
- **License:** CC-BY-NC-4.0 (matches `package.json`).
- **Source code:** upload `book-zad-1.0.0-sources.zip` (AMO requires it because
  the build is bundled/minified).

**Notes to reviewer** (paste into the AMO "Notes for reviewer" box):
```
Build tooling: WXT (https://wxt.dev) + npm. Node 20.

To reproduce the build from the attached sources zip:
  npm ci
  npm run build:firefox      # outputs .output/firefox-mv2/
  npm run zip:firefox        # produces the submitted zip

The extension is fully on-device. The <all_urls> content script extracts the
visible text of the current page and compares it locally (TF-IDF keyword
matching, lib/tfidf.ts + lib/similarity.ts) against the user's bookmarks to
suggest a matching folder. No network requests are made with page content or
any user data; there is no server and no analytics. The only network activity
is the optional, user-initiated dead-link check in the cleanup panel, which
sends HEAD/GET requests to the user's own bookmarked URLs to see if they still
resolve (entrypoints/background.ts, probeLink()).

Bundled Vazirmatn font files (public/fonts/*.woff2) are used for Persian/Arabic
UI text and are served from the extension package, never a CDN.
```

---

## Edge Add-ons specifics

- Same short/long description, screenshots, single-purpose and permission
  justifications as Chrome.
- **Category:** Productivity.
- **Privacy:** declare no data collected/transmitted; provide the privacy URL.
- Store listing also supports a Persian (fa) locale — reuse the docs/fa copy.

---

## Pre-submission checklist

- [x] Short description ≤132 chars (now 120).
- [ ] Set a real `gecko.id` if you don't want `book-zad@book-zad.app`
      (`wxt.config.ts`). The current value is valid and can ship as-is.
- [ ] Enable GitHub Pages (Settings → Pages → branch `main`, folder `/docs`) so
      the privacy-policy URLs resolve before you submit.
- [ ] Bump `version` in `package.json` for each subsequent submission.
- [ ] Upload screenshots from `mockups/` at the sizes listed above.
```
