# DMS — Developer Overview

DMS is a pure client-side mobile web app for scanning and tracking Data Matrix codes. It runs entirely in the browser with no backend server, stores all data locally on the device, and works offline as a progressive web app (PWA).

This document is the **developer** overview: architecture, local development, and the on-device test checklist. For the user-facing manual (what every control does), see the [root README](../README.md). For deployment, see [deployment.md](./deployment.md).

## What it does

- **Scan Data Matrix codes** using the rear camera (vendored ZXing, Data Matrix format only). Each frame is cropped to the on-screen reticle before decoding, so only the indicated area is scanned.
- **Freeze on recognition** — the decoded frame is overlaid through a radial alpha mask centred on the code, with a highlight polygon, then discarded with an optional shrink/darken animation. Three freeze modes (tap, timer, auto) each with a duration slider.
- **Keep a local history** of all scans in IndexedDB, with per-entry counts.
- **Group entries** by a configurable grouping mode (e.g. first token) so related scans share one row and counter.
- **Catalog lookup** — a local token→label/image table resolves scanned content to a readable name and picture. Catalog files (JSON) can be listed, previewed, and imported from a URL, with conflict detection and merge.
- **Manage the database** — a dedicated overlay lists every scan record and catalog entry with checkboxes, supports deleting selected rows, and offers confirm-guarded clear-all per section.
- **Undo** the last deletion (one level deep).
- **Select and highlight** history entries with long-press (visual-only, session-scoped).
- **Options panel** — theme, hide duplicates, grouping mode, camera viewport height, freeze mode and timings, discard animation, catalog import, database stats.
- **Install as standalone** — add to home screen and use offline after the first load.

## Target platforms

- **Chrome** and **Firefox** on mobile Android. (On iOS, PWA installation and offline features require Safari; third-party iOS browsers are WebKit-wrapped and do not support service-worker offline caching.)
- **Portrait orientation** (landscape not supported).
- Secure context required (HTTPS or localhost) for camera access.

## Module architecture

All runtime code lives in `www/`. Pure logic is kept in `www/js/util/` so it can be unit-tested without a DOM.

### Core

| Module | Purpose |
|--------|---------|
| `www/js/app.js` | Application bootstrap; wires persistence, store, settings, theming, UI panels, and the scanner, and re-renders on every store change. |
| `www/js/db.js` | IndexedDB persistence for scan records and catalog entries; async CRUD plus size estimation. |
| `www/js/store.js` | In-memory model of the scan history; per-group counts, de-duplicated view, session highlight selection, one-deep undo, change events. |
| `www/js/catalog.js` | In-memory model of the catalog table; indexes records by token, serves display lookups, emits change events. |
| `www/js/catalog-import.js` | Lists the remote catalog directory, fetches/parses/validates a file, and computes the merge against the existing catalog. Injectable `fetch`. |
| `www/js/scanner.js` | Camera acquisition, reticle-cropped decode loop, camera on/off, freeze overlay and discard animation. |
| `www/js/settings.js` | localStorage-backed user settings, with an injectable storage for tests. |
| `www/js/theme.js` | Applies a theme via `data-theme` on the document root. |
| `www/js/freeze.js` | Freeze-mode and discard-duration presets, plus the settings→config resolver. |
| `www/js/viewport.js` | Camera viewport height presets; writes the `--cam-height` custom property. |

### UI (`www/js/ui/`)

| Module | Purpose |
|--------|---------|
| `history-panel.js` | Renders visible scan entries; delete via trash, highlight via long-press, catalog display lookups. |
| `options-menu.js` | Options overlay: theme, hide duplicates, grouping radios, camera height slider, freeze radios + sliders, discard animation toggle and duration, database stats. |
| `catalog-section.js` | Catalog controls inside the options panel (import URL, load, merge). |
| `preview-overlay.js` | Shows a fetched catalog file as formatted JSON or raw text, surfacing parse and validation errors. |
| `manage-db.js` | Manage Database overlay: per-row checkboxes for scans and catalog entries, delete selected, confirm-guarded clear-all. |
| `bottom-bar.js` | Undo footer, visible only while an undo is available. |
| `toast.js` | Single-slot snackbar notifications (success 3.5 s, error 6 s). |

### Utilities (`www/js/util/`)

| Module | Purpose |
|--------|---------|
| `catalog-match.js` | Token matching: a token matches when it appears as a whole whitespace-delimited word of the content. |
| `grouping.js` | Derives the grouping key for a scan under the selected grouping mode. |
| `crop-region.js` | Maps the on-screen reticle to a source-frame pixel rect, reproducing CSS `object-fit: cover`. |
| `freeze-controller.js` | Pure freeze-lifecycle state machine; all timing via an injected `now`. |
| `freeze-mask.js` | Geometry for the radial freeze mask and its discard animation (centre, radius, transform origin). |
| `scan-gate.js` | Same-content cooldown gate so a held code is not recorded many times per second. |
| `format.js` | Timestamp and byte-size formatting. |
| `icon.js` | Inline Lucide icons as `currentColor` SVG strings — no web font, no runtime fetch. |

## Running locally

### Prerequisites

- Node.js 16+ (only for the test runner)
- Python 3 (for the simple HTTP server)

### Run tests

```bash
npm test
```

Runs every suite in `test/` with `node:test` (no framework), using `fake-indexeddb` to mock IndexedDB. Current suites: `catalog`, `catalog-db`, `catalog-import`, `catalog-match`, `crop-region`, `db`, `format`, `freeze`, `freeze-controller`, `freeze-mask`, `grouping`, `icon`, `scan-gate`, `settings`, `store`.

### Serve the app

```bash
npm run serve
```

Starts a Python HTTP server rooted at `www/` on port 8000 — open <http://localhost:8000>. Camera access needs a secure context; `localhost` counts as one.

### Runtime files

Everything the deployed app needs lives in **`www/`** (deploy that folder alone — see [deployment.md](./deployment.md)):

- `www/index.html` — HTML entry point.
- `www/css/styles.css` — Styling (dark and light themes).
- `www/manifest.webmanifest` — PWA manifest.
- `www/sw.js` — Service worker for offline caching.
- `www/vendor/zxing/zxing.min.js` — Vendored ZXing (Data Matrix decoding).
- `www/data/*.json` — Catalog files served for in-app import.
- `www/assets/icons/` — PWA app icons (192×192 and 512×512).

> **After changing any runtime file**, bump the cache version in `www/sw.js` (`const CACHE = "dms-vN"`) and add new files to its `ASSETS` list — otherwise clients keep serving the stale cached copy. On Firefox for Android the browser must be fully restarted, not just reloaded, to pick up the new worker.

## On-device testing checklist

1. **Deploy** to a static HTTPS host (see [deployment.md](./deployment.md)) or serve over LAN HTTPS.
2. **Camera permission**: open the app and check the browser prompts for camera access.
3. **Data Matrix detection**: hold a code in the reticle. Verify the frame freezes, the radial mask and highlight polygon appear, the decoded content shows, the freeze discards per the selected mode, and a history entry is created.
4. **Reticle crop**: verify a code outside the reticle is *not* decoded.
5. **Freeze modes**: switch between tap / timer / auto and move each slider; confirm the freeze duration and discard animation change accordingly.
6. **History management**: delete an entry via trash, confirm the undo bar appears and restores it. Scan the same content twice and confirm the counter increments instead of adding a row.
7. **Grouping**: switch grouping mode and confirm related entries collapse or split as expected.
8. **Catalog**: open the catalog section, load a file from URL, preview it (JSON and raw), import it, and confirm matching history entries now show the catalog label/image. Re-import to exercise conflict detection.
9. **Manage Database**: open the overlay, tick rows in both sections, delete selected, then exercise clear-all for each section and confirm the guard prompts.
10. **Long-press selection**: long-press an entry to highlight it, tap another to add it, reload and confirm highlights are cleared.
11. **Options**: switch theme, toggle hide duplicates, move the camera height slider, and check the database stats line.
12. **PWA installation** (Chrome and Firefox): install to the home screen, confirm standalone mode, then reopen offline and confirm the app loads and scans.
13. **Repeat on both browsers** in portrait.

## Architecture notes

- **No build step**: vanilla ES modules, served as-is.
- **Pure client-side**: no backend API, no remote storage; the only network call is the optional catalog import.
- **Offline-first**: the service worker caches the app shell on first load.
- **Persistent state**: scans and catalog entries in IndexedDB; settings in localStorage. Data in an incognito/private tab is lost when the tab closes — intended behaviour.
- **Testable core**: timing, geometry, and matching logic are pure functions in `www/js/util/` with injected clocks and fetches, so the DOM glue holds no logic.
- **Single-level undo**: only the most recent deletion can be undone.

## Browser support

- Chrome/Chromium 80+
- Firefox 89+

Older browsers may lack support for IndexedDB, ES modules, or the Camera API.

## License

See the root LICENSE file or project documentation for licensing details.
