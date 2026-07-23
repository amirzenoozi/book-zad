# Changelog

## [Unreleased]

### Added

- Full manager page: a card dashboard of every bookmark, opened from the toolbar popup.
- Folder navigation with breadcrumbs — browse into and out of folders, create, rename and delete folders, and move a bookmark between folders from a per-card dropdown.
- The last-open folder is remembered across page refreshes.
- Search across title, URL, notes and tags, as a flat global view spanning every folder.
- Sort bookmarks by score, most recently added, most visited, or title.
- Automatic per-bookmark scoring from local usage signals (visit count, recency, dwell time), with a manual star rating that overrides it.
- Per-bookmark notes, included in search.
- Tags on bookmarks, edited as chips on each card; tags are searchable and feed the similarity engine alongside notes.
- Export and import — a JSON backup of every bookmark from every folder plus its notes, tags and scores. Restore matches by URL and folder path, restoring metadata to existing bookmarks and recreating any that are missing (folders and all), so it works even on a fresh browser.
- Folder notes, and both folder and per-bookmark notes now feed the similarity engine as weighted comparison sources — so labelling a folder (e.g. "movies films series reviews") makes matching pages suggest it. The suggestion index refreshes as soon as a note is edited.
- Cleanup panel that finds duplicate URLs and stale bookmarks, with one-click "keep best, delete the rest" per duplicate group and a remove-all-duplicates action.
- Dead-link detection in cleanup — an on-demand scan that flags bookmarks that no longer resolve (404 / gone / server errors), with per-link and bulk removal. The last scan is remembered between sessions.
- Quick-add the current page from the toolbar popup, with a folder picker and a duplicate check.
- Similarity nudge: as you browse, the page text is compared on-device (TF-IDF) against your saved folders, badging the toolbar icon on a match.
- Optional in-page toast for a match that lets you add the current page to the suggested folder or open that folder.
- Toolbar popup launcher with quick settings — nudge toggle, in-page toast toggle, suggestion threshold, and theme.
- Dark, light and auto themes across the manager page, popup and toast.
- Persian and Arabic text renders in the bundled Vazirmatn font (scoped to that Unicode range, so Latin text keeps the system font); the font ships with the extension and is never fetched from a network.
- Cross-browser builds for Chrome/Edge (MV3) and Firefox (MV2), a dependency-free icon generator, and CI plus tag-triggered publishing to all three stores.

### Changed

- The cleanup panel is now an accordion — Duplicates, Stale and Dead links — with one section open at a time.
- The toolbar icon now opens a popup launcher instead of jumping straight to the manager page.
- The in-page toast is persistent — it stays until you close it or act on it, rather than auto-dismissing.
- Adopted the ping.sx visual theme (deep-navy panels, teal accent, monospace numerics); the toolbar badge, toast and generated icons were recolored to match.

### Fixed

- The toast's match percentage no longer overlaps the close button.
