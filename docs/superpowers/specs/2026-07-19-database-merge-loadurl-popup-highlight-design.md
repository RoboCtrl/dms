# Database Section Merge, Load-from-URL Popup, First-Token Highlight — Design

Date: 2026-07-19
Status: Approved

## Overview

Three small UI updates to the options overlay and the history list:

1. Replace the inline catalog-import URL field with a **Load from URL popup**.
2. **Merge the `Catalog` options section into `Database`** with a new stats
   layout.
3. Change the **highlight style for unmatched list entries** from
   bold-second-token to bold-first-token with an accent-coloured suffix.

## 1. Load from URL popup

### Trigger

The `Database` section gains a `Load from URL ...` button (renamed from
`Load from URL`; the inline `#catalog-url` text input is removed from the
options overlay). Clicking the button opens a new popup overlay.

### Markup / pattern

A new `#load-url` overlay in `index.html`, following the existing stacked
overlay pattern (`.overlay` > `.options-panel`, same as `#preview` and
`#manage-db`), stacking above the options overlay.

Contents, top to bottom:

- Header: title `Load from URL` + close (✕) button.
- URL input (`type="url"`), pre-filled from the persisted `importUrl`
  setting.
- Button row: `Cancel`, `Preview`, `Load`.
- File-list container (hidden until a listing is loaded).

### Behaviour

- **Cancel**, the ✕ button, and a backdrop tap all close the popup with no
  further action.
- **Preview** fetches the URL as text and opens the existing preview overlay
  (raw/formatted JSON view) stacked on top. Errors surface as error toasts.
- **Load** keeps today's classify logic (`classifyImportBody`):
  - Direct catalog file → validate, resolve duplicate-token conflicts via the
    batched confirm, import, persist the URL, show success toast, close the
    popup.
  - Directory listing → render the checkbox file list (with per-file
    `Preview` buttons) *inside the popup*, below the buttons; persist the
    URL. `Load selected` imports the ticked files, then closes the popup.
  - Empty listing / fetch errors → error toast, popup stays open.
- Empty URL on Preview/Load → "Enter a URL first." error toast.

### Ownership

`www/js/ui/catalog-section.js` remains the controller for the import UI; it
gains the popup open/close wiring and loses the inline URL field handling.
Its doc comment is updated accordingly.

## 2. Database section merge

The `Catalog` section in the options overlay is removed. The `Database`
section becomes (top to bottom):

```
Database
  <n> list entries
  <n> catalog entries
  <size> storage size        e.g. "12.3 kB storage size" / "1.4 MB storage size"
  [ Manage database ]
  [ Load from URL ... ]
  [ Import catalogs ]
```

- Three separate `<p>` readouts replace the combined `#db-stats` line:
  `#db-list-stats`, `#db-catalog-stats`, `#db-size-stats`.
- Storage size keeps the current measurement (`db.estimateSize()`:
  whole-origin `navigator.storage.estimate()` usage, falling back to a JSON
  approximation of the scan records).
- Size formatting keeps `formatBytes()` (kB below 1 MB, MB above, one
  decimal).
- Button labels: `Manage database` keeps its existing sentence case (matches
  the overlay title). `Import catalogs` keeps its current behaviour and
  renders its file list where it does today, in the section below the
  buttons — it does not use the popup.
- `options-menu.js` updates the list-entry and storage-size lines;
  `catalog-section.js` updates the catalog-entry line.

## 3. First-token highlight for unmatched entries

Applies only to history entries with **no catalog match** (the
`catalog.displayFor()` branch is untouched).

`segmentContent()` in `www/js/util/format.js` is reworked:

- Same 4-token pattern as today:
  `^(\d+)\s+([A-Za-z0-9]+)\s+(\d+)\s+(\d+)$`.
- No match → the whole string as one plain segment (no bold, no colour).
- On match:
  - **First token: bold.** Its **last two characters** are additionally
    coloured with `var(--accent)` (still bold). If the first token has fewer
    than two characters, the whole token gets the colour.
  - Tokens 2–4: plain text (the second token is no longer bold).
  - Tokens joined with single spaces, as today.
- Segments gain an `accent: boolean` flag alongside `bold`.
- `www/js/ui/history-panel.js` renders accent segments as a `<strong>` (or
  span) with a class; new CSS rule sets `color: var(--accent)`.
- `test/format.test.js` updated to the new segmentation.

## Housekeeping

- Service worker cache version bumped (`dms-v12` → `dms-v13`) so deployed
  clients refresh.
- Per-prompt change log in `./claude-log`; commit on `dev-claude`.
- Tests run via `node --test`.

## Trade-offs considered

- **Popup as a stacked overlay (chosen) vs native `<dialog>`**: the overlay
  pattern matches `#preview`/`#manage-db` styling exactly and behaves
  predictably on older mobile Firefox; `<dialog>` saves little markup here.
- **Directory file list inside the popup (chosen) vs in the options
  section**: keeps the whole URL-driven flow in one place; the
  `Import catalogs` default-listing flow keeps its in-section list to avoid
  entangling the two flows.
- **`Import catalogs` kept as its own button (chosen, per user)** rather than
  folding the default listing into the popup.
- **Accent colour via existing `--accent` variable (chosen, per user)** over
  introducing a new highlight colour: adapts to both themes for free.
