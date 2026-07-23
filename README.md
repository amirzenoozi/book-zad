# BookZad

A Chrome + Firefox + Edge extension that manages your browser bookmarks **in a
new way** — score them, search them, clean them up, and get a quiet nudge when a
page you're reading resembles a folder you already keep.

BookZad layers on top of your **native** browser bookmarks (they stay the source
of truth and keep working everywhere else). Everything runs **on-device** —
no accounts, no servers, nothing transmitted.

## Features

- **Full manager page** — opens from the toolbar button; a card dashboard of all
  your bookmarks.
- **Scoring & ranking** — every bookmark gets a score from how you actually use
  it (visits, recency, dwell time, tracked locally), which you can override with
  a manual star rating. Sort by score, recency, visits or title.
- **Powerful search** — instant filter across title, url, notes and tags.
- **Notes** — annotate any bookmark; notes are searchable.
- **Cleanup** — spot duplicate URLs and stale bookmarks (added long ago, never
  opened since install).
- **Similarity nudge** — as you browse, BookZad compares the page text against
  your saved folders (local TF-IDF) and, on a match, shows a **toolbar badge**
  (and an optional in-page **toast**) suggesting the folder you might file it in
  or revisit.

## Architecture

```
entrypoints/
  background.ts        # opens the manager, keeps the folder similarity index
                       #   warm, answers "is this page familiar?", records usage
  content/index.ts     # reads page text → asks background; tracks dwell time
  manager/             # the full manager page (index.html + main.ts + style.css)
lib/
  bookmarks.ts         # flatten the native tree; duplicates; url normalisation
  storage.ts           # per-bookmark metadata (notes/tags/score/signals/tokens)
  settings.ts          # theme, toast, nudge, threshold (storage.sync)
  text.ts              # tokenise + page-text extraction
  tfidf.ts             # TF-IDF + cosine similarity (dependency-free)
  similarity.ts        # build the per-folder index; match a page
  scoring.ts           # usage signals → 0–100 score
  theme.ts             # light/dark/auto via data-theme
  toast.ts             # the in-page nudge (shadow DOM, self-contained)
  messaging.ts         # typed content ⇄ background protocol
wxt.config.ts          # manifest: bookmarks/storage/tabs + <all_urls> content script
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
