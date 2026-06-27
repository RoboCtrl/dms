# DMS — Data Matrix Scanner: Design Spec

Date: 2026-06-27
Status: Approved (pre-implementation)

## 1. Overview

DMS is a pure client-side web app (no backend) that uses a phone camera to
scan Data Matrix codes, decodes them, and keeps a local, persistent history of
every scan. It targets Chrome and Firefox on mobile in portrait orientation,
and supports dark (default) and light themes.

All data stays on the device. The app ships as static files and is deployed to
a static host (e.g. GitHub Pages / Netlify) so it is served over HTTPS — a
requirement for camera access (`getUserMedia` needs a secure context).

## 2. Technology decisions

| Area            | Decision                                                        |
| --------------- | --------------------------------------------------------------- |
| Stack           | Vanilla JS, no build step, native ES modules                    |
| Decoder         | ZXing-js (`@zxing/library`), **vendored locally** (no CDN)      |
| Persistence     | IndexedDB for scans; `localStorage` for settings                |
| Storage size    | `navigator.storage.estimate()` (StorageManager API)             |
| Scan flow       | Auto-store on recognition; tap to resume scanning               |
| Offline / install | PWA: service worker (app-shell cache) + web manifest          |
| Hosting         | Deployable static files (HTTPS via static host)                 |
| Testing         | Node `node:test` + `fake-indexeddb`, dev-only (does not bundle) |

## 3. File layout

```
index.html
manifest.webmanifest
sw.js                     # service worker (offline app shell)
css/styles.css            # CSS custom properties drive theming
js/
  app.js                  # bootstrap + wiring
  store.js                # in-memory state + event emitter (the "model")
  db.js                   # IndexedDB CRUD + size reporting
  scanner.js              # camera stream + ZXing decode loop + freeze/highlight
  theme.js                # theme apply/persist
  settings.js             # localStorage-backed settings
  ui/
    history-panel.js      # bottom list (counter, content, timestamp, trash)
    options-menu.js       # overlay menu
    bottom-bar.js         # undo bar
  util/format.js          # timestamp + byte-size formatting (pure, testable)
vendor/zxing/             # vendored ESM build of @zxing/library
assets/icons/             # hamburger, trash, undo, close (inline SVG)
```

Each module has one clear purpose and communicates through small, explicit
interfaces:

- `db.js` — owns IndexedDB; exposes `add`, `getAll`, `delete`, `clear`,
  `countByContent`, `estimateSize`. Knows nothing about the DOM.
- `store.js` — in-memory mirror of the scan list plus derived state (per-content
  counts, highlight set, last-deleted record for undo). Emits change events; UI
  modules subscribe. Knows nothing about IndexedDB internals beyond calling
  `db.js`.
- `scanner.js` — owns the camera stream and the ZXing decode loop; emits a
  `recognized` event with `{ content, points }`. Knows nothing about storage.
- `ui/*` — render from `store.js` state and translate user actions into
  `store`/`scanner` calls. No business logic.
- `util/format.js` — pure functions (timestamp formatting, byte-size
  formatting). No side effects.

## 4. Data model

### IndexedDB

- Database `dms`, object store `scans`, `keyPath: id` (auto-increment).
- Record shape: `{ id: number, content: string, timestamp: number }`
  where `timestamp` is epoch milliseconds.
- Index `byContent` on `content` for duplicate counting.

### Deletion and undo

- **Delete is a hard delete** — the record is removed from IndexedDB. This is
  required because the per-entry counter reflects only entries still present, so
  deleting one identical entry must lower the count shown on the others.
- **Undo** keeps the **last-deleted record in memory** (one-deep history) and
  re-inserts it on demand. Re-insertion restores the same `content` and
  `timestamp`; a new `id` is acceptable.

### Counter semantics

- The counter on each row = number of records currently in the store with
  identical `content`, computed via the `byContent` index.
- The counter is independent of the "hide duplicates" view setting — hiding
  duplicates changes only which rows are rendered, never the counts.

### Settings and session state

- Settings persisted in `localStorage`: `theme` (`dark` default / `light`),
  `hideDuplicates` (default `false`).
- Highlight selection (from long-press) is **session-only** UI state, not
  persisted across reloads.

## 5. Scanning flow (auto-store, tap to resume)

1. On load, request the rear camera (`facingMode: "environment"`) and start a
   continuous ZXing decode loop on the live video.
2. Per-frame `NotFoundException` is normal and ignored; the loop keeps running.
3. On a successful decode:
   - Stop the loop.
   - Freeze the current frame onto an overlay canvas.
   - Draw a highlight polygon from ZXing's result points over the recognised
     area.
   - Display the decoded content over the frozen view.
   - Write a new record to IndexedDB and prepend it to the history list.
4. **Tapping the camera panel** clears the freeze and restarts the decode loop.
   Deliberate re-aim is what produces the next scan, which avoids accidental
   repeat scans of the same physical code.

## 6. UI / layout (portrait)

### Top panel (camera)

- Live video with an overlay canvas for the freeze frame and highlight polygon.
- Hamburger options button in the top-right corner.
- On recognition: frozen image + highlighted area + decoded content overlay.

### Bottom panel (history)

- Scrollable list, newest entry on top.
- Each row contains:
  - **Counter badge** (left): how many non-deleted entries share this exact
    content. Font: normal size, bold, fixed-size box wide enough for two digits
    without expanding; white (dark theme) / black (light theme).
  - **Content** (next to counter): the decoded string. Font: bold; dark gray
    (light theme) / light gray (dark theme).
  - **Timestamp** (below content): `YYYY-MM-DD hh:mm:ss`, smaller font.
  - **Trash icon** (right, right-aligned): deletes the entry on click; spans the
    full row height (including the timestamp row).
  - **Long-press** (~500ms) toggles a highlight on the entry; pressing again
    removes it. Multiple entries may be highlighted simultaneously. Highlight is
    purely visual.

### Bottom bar (undo)

- Full-width bar below the bottom panel.
- Hidden when there is nothing to undo; appears with an **Undo** button after a
  delete. Undo history is one entry deep.

### Options menu

- Only visible/interactive when opened via the hamburger icon.
- Rendered on top of the app over a full-screen dimming overlay:
  `#00000088` (dark theme) / `#cccccc80` (light theme), placed between the menu
  and the rest of the app.
- Close `x` icon in the top-right.
- Options:
  - **Theme select:** dark (default) / light.
  - **Hide duplicates** (default `false`): when on, only the latest entry of a
    set of duplicates is shown.
  - **Database section:** number of entries and storage used (kB or MB); a
    **Clear database** button that deletes all entries after a confirmation
    prompt.
  - **About section:** link to `www.example.com` (placeholder, to be replaced).

## 7. Theming

- CSS custom properties switched via a `data-theme` attribute on `<html>`.
- Dark is the default. All colours specified above map to theme variables.

## 8. PWA / offline

- `manifest.webmanifest`: app name, icons, `display: standalone`,
  `orientation: portrait`, theme colours.
- Service worker caches the app shell and the vendored ZXing library so the app
  loads and decodes offline once installed. (Camera access is local and needs no
  network.)

## 9. Error handling

- Camera permission denied / no camera available / insecure context → clear
  message in the top panel with a retry action.
- ZXing `NotFoundException` per frame → ignored; loop continues.
- IndexedDB unavailable → non-fatal banner; decoded content is still shown even
  though it cannot be persisted.

## 10. Testing

- Pure-logic and storage modules are covered by automated tests using Node's
  built-in `node:test` runner plus `fake-indexeddb`:
  - `util/format.js`: timestamp and byte-size formatting.
  - `store.js`: per-content counting, dedup view filtering, undo behaviour.
  - `db.js`: CRUD, `countByContent`, `clear`, size estimation (via fakes).
- These are dev-only dependencies; the shipped app remains plain static files
  with no bundling.
- Camera and DOM/interaction behaviour (freeze, highlight overlay, long-press,
  theming) is verified manually on-device in Chrome and Firefox mobile.

## 11. Out of scope (for now)

- Any backend, sync, or cloud storage.
- Barcode formats other than Data Matrix.
- Landscape layout.
- Export/import of the database.
