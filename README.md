# BookZad

A Chrome + Firefox + Edge extension that manages your browser bookmarks **in a
new way** — score them, search them, clean them up, and get a quiet nudge when a
page you're reading resembles a folder you already keep.

BookZad layers on top of your **native** browser bookmarks (they stay the source
of truth and keep working everywhere else). Everything runs **on-device** —
no accounts, no servers, nothing transmitted.

## Features

- **Full manager page** — a card dashboard of all your bookmarks, opened from the
  toolbar popup.
- **Toolbar popup** — a launcher + quick settings, and **quick-add**: save the
  current page into a folder in one click (with a duplicate check).
- **Folders** — breadcrumb navigation; create/rename/delete folders; move a
  bookmark *or a whole folder* anywhere.
- **Scoring & ranking** — every bookmark gets a score from how you actually use
  it (visits, recency, dwell time, tracked locally), which you can override with
  a manual star rating. Sort by score, recency, visits or title.
- **Powerful search** — instant filter across title, url, notes and tags.
- **Notes & tags** — annotate and tag any bookmark; both are searchable and feed
  the suggestions.
- **Cleanup** — an accordion of **duplicates**, **stale** bookmarks, and
  **dead-link** detection (a best-effort on-demand scan, remembered between
  sessions); remove per-item or in bulk.
- **Backup** — export a JSON file of *all* your bookmarks plus their notes, tags
  and scores, and import it back — matched by URL and folder path, recreating any
  missing bookmarks so it works even on a fresh browser.
- **Similarity nudge** — as you browse, BookZad compares the page text against
  your saved folders (local TF-IDF) and, on a match, shows a **toolbar badge**
  (and an optional, actionable in-page **toast**) suggesting the folder you might
  file it in or revisit.
- **Seven languages** — English, Deutsch, Français, Italiano, Nederlands,
  Türkçe and فارسی. The interface follows your browser's UI language (English
  fallback) or whatever you pick in settings; Persian gets full RTL layout and
  the bundled Vazirmatn font.
- **Muted sites** — sites the nudge never fires on. Mute the current site from
  the popup, add domains by hand, or toggle preset groups (search engines — on
  by default — mail, social). Muting a domain covers its subdomains.

## Architecture

```
entrypoints/
  background.ts        # keeps the folder similarity index warm, answers "is this
                       #   page familiar?", records usage, probes dead links
  content/index.ts     # reads page text → asks background; tracks dwell time
  popup/               # toolbar popup: quick-add + settings (index.html+main.ts+css)
  manager/             # the full manager page (index.html + main.ts + style.css)
lib/
  bookmarks.ts         # flatten the native tree; move/create; duplicates; url norm.
  storage.ts           # per-node metadata + UI state (last folder, dead-link scan)
  backup.ts            # full export / import of bookmarks + metadata
  dedupe.ts            # which duplicate to keep (pure, tested)
  settings.ts          # theme, toast, nudge, threshold (storage.sync)
  ignore.ts            # muted sites + preset groups (pure host matching, tested)
  text.ts              # tokenise + page-text extraction
  tfidf.ts             # TF-IDF + cosine similarity (dependency-free)
  similarity.ts        # build the per-folder index (title+url+notes+tags); match
  scoring.ts           # usage signals → 0–100 score
  theme.ts             # light/dark/auto via data-theme
  toast.ts             # the in-page nudge (shadow DOM, self-contained)
  manager.ts           # open/focus the manager tab
  messaging.ts         # typed content ⇄ background protocol
  i18n.ts              # t()/plural() + <html lang|dir> from the active locale
  fonts.css            # Vazirmatn @font-face (Persian/Arabic, unicode-range)
public/_locales/       # 7 messages.json files (also localise the manifest)
docs/                  # GitHub Pages landing site in all 7 languages
mockups/               # store screenshots + promo tiles (render.sh)
wxt.config.ts          # manifest: bookmarks/storage/tabs + <all_urls> + fonts
```

The native bookmarks API only stores title/url/folder, so BookZad keeps its
richer fields (notes, tags, score, usage signals, page tokens) in a parallel
`storage.local` store keyed by bookmark id.

## Develop

```bash
npm install            # also runs `wxt prepare` to generate types
npm run gen:icons      # generate public/icon/*.png (bookmark glyph)
npm run dev            # Chrome with HMR (opens a dev browser)
npm run dev:firefox    # Firefox with HMR
npm run compile        # type-check (tsc --noEmit)
npm test               # unit tests (Vitest) for the core logic
```

## Build & package for the stores

```bash
npm run package        # builds + zips chrome, firefox and edge into .output/
```

Produces `book-zad-<version>-chrome.zip`, `-firefox.zip`, a `-sources.zip` (AMO
requires the source bundle for review), and `-edge.zip`.

### Before your first publish

- Set a real extension id in `wxt.config.ts` →
  `browser_specific_settings.gecko.id`.
- Bump `version` in `package.json` for each submission.

## Continuous integration & publishing

- **`ci.yml`** — on push to `main` and every PR: `npm ci` → generate icons →
  type-check → build both browsers. Keeps the tree always-buildable.
- **`release.yml`** — on a pushed version tag (`v*`) or manual dispatch: zips
  all three stores, uploads them as a workflow artifact, then publishes via
  [`wxt submit`](https://wxt.dev/guide/essentials/publishing.html). Each store
  step is skipped unless its secrets are present.

### Cutting a release

```bash
npm version patch            # or minor / major — updates package.json
git push && git push --tags
```

The release workflow verifies the tag matches `package.json` (`v0.2.0` ⇄
`0.2.0`) before publishing.

## Permissions & privacy

- `bookmarks` — read and organise your bookmarks (the whole point).
- `storage` — your notes, scores and settings (on your device).
- `tabs` — read the active tab's url/title for badges and quick actions.
- `<all_urls>` + a content script — read the text of pages you visit **only to
  compare it, on-device, against your bookmarks**. Nothing is sent anywhere.

See [PRIVACY.md](./PRIVACY.md).

## Credits

Flag icons on the landing site come from [Twemoji](https://github.com/twitter/twemoji)
(graphics CC-BY 4.0), bundled in `docs/assets/flags/` rather than loaded from a CDN.
