# BookZad — Privacy

**BookZad does not collect, transmit, or sell any data. Everything stays on your
device.**

## What it accesses

- **Your bookmarks** (`bookmarks` permission) — to display, score, search and
  organise them.
- **The active tab's url and title** (`tabs` permission) — to drive the toolbar
  badge and quick actions.
- **The text of pages you visit** (content script + `<all_urls>`) — read locally
  so it can be compared against your saved bookmarks to power the similarity
  nudge.

## Where data goes

Nowhere. There is **no server, no account, and no network request** made by
BookZad to any external service. Specifically:

- Page text is tokenised and compared **on your device** using a local TF-IDF
  model. The text itself is never uploaded; only compact word-frequency counts
  for pages that are already bookmarked are stored locally to improve matching.
- Your notes, tags, scores and usage signals live in the browser's own
  extension storage (`storage.local` / `storage.sync`) on your device/profile.
- Usage signals (visit counts, recency, dwell time) are tracked by the extension
  itself — BookZad does **not** use the browser `history` permission.

## Removing your data

Uninstalling the extension removes all stored metadata. You can also clear it
from the browser's extension storage at any time. Your native bookmarks are
untouched by uninstalling.
