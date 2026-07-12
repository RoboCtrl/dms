# UX Feedback Batch — Design

Date: 2026-07-12
Status: Approved

Nine small improvements collected from user feedback: new setting defaults,
catalog-import usability (padding, per-file preview, toasts, manual URL,
tolerant listing parser), a combined Manage Database screen replacing the two
clear buttons, and an About-link fix.

## 1. New setting defaults

Change `DEFAULTS` in `www/js/settings.js`:

| Setting          | Old      | New            |
| ---------------- | -------- | -------------- |
| `cameraHeight`   | `3`      | `1` (33%, second-smallest preset) |
| `hideDuplicates` | `false`  | `true`         |
| `groupMode`      | `"full"` | `"firstToken"` |

Fresh installs only — devices with a stored settings object keep their values;
no migration. `DEFAULT_CAMERA_HEIGHT` in `www/js/viewport.js` changes to `1` to
stay in sync (it is the out-of-range fallback for `applyCameraHeight`).

## 2. Import list tap targets

`.catalog-file` rows in the import file list are hard to tap. In
`www/css/styles.css`: make each label a full-width block row with roughly
10px vertical padding so tapping anywhere on the row toggles its checkbox.

## 3. Per-file Preview button

Each file row in the catalog import list gets a small **Preview** button.

- New module `www/js/ui/preview-overlay.js` + markup in `index.html`.
- Opens an overlay with the same size/shape/styling as the options panel,
  layered **on top of** the options overlay (higher z-index). Own header with
  the file name as title and a close button.
- The file is fetched as **text** (not pre-parsed), so raw display is always
  possible.
- **Error banner** (red, at the top): shown when `JSON.parse` fails (with the
  parse error message) or when the file parses but fails `validateCatalog`
  (with the validation error). Hidden otherwise.
- **"Formatted" checkbox**, checked by default, applies immediately on change:
  - checked → `JSON.stringify(parsed, null, 2)` rendered in a `<pre>`;
  - unchecked → the raw response text verbatim in the same `<pre>`.
  - If the JSON does not parse, the formatted view falls back to raw text
    (under the red error banner).
- Fetch failures never open the overlay; they surface as an error toast (§4).

## 4. Toast notifications

New module `www/js/ui/toast.js` + CSS.

- `showToast(message, { error = false } = {})` — a snackbar fixed near the
  bottom of the screen, auto-dismissing after ~3.5 s (~6 s for errors). A new
  toast replaces any visible one.
- Used by the catalog import flow:
  - per-file success: `Imported <name> — <n> entries`;
  - listing/fetch/parse/validation failures: red error toast — **replaces**
    the existing `alert()` calls in `www/js/ui/catalog-section.js`.
- Destructive confirmations remain `confirm()` dialogs.

## 5. Manage Database (combined screen)

Replaces both clear buttons:

- Database section: `Clear database` button → **`Manage database`**
  (`#manage-db-btn`).
- Catalog section: `Clear catalog` button removed entirely (stats and import
  controls stay).

The button opens a full overlay (same panel styling, on top of the options
overlay) implemented in a new module `www/js/ui/manage-db.js`, with two
sections:

- **List entries** — one row per scan record, newest first: checkbox, display
  text (catalog lookup via `catalog.displayFor`, falling back to raw content)
  and timestamp. Below the list: **Delete selected** and **Clear all**
  (confirm-guarded).
- **Catalog entries** — one row per token: checkbox, token, and its `text`
  when present. Below the list: **Delete selected** and **Clear all**
  (confirm-guarded).

Plumbing (no new db functions):

- scan deletion: `store.deleteEntry(id)` per selected id (Clear all keeps
  using `store.clearAll()`);
- catalog deletion: `catalog.replaceAll(entries.filter(not selected))`
  (Clear all keeps using `catalog.clear()`).

After any deletion the overlay re-renders its lists, both stats readouts
refresh, and the history panel re-renders via the existing change events /
`onChange` callbacks.

## 6. Import from manual URL

In the Catalog section, below `Import catalogs`:

- a text input pre-filled from a new persisted setting `importUrl`
  (default `""`), plus a **`Load from URL`** button;
- new `setImportUrl(value)` accessor in `settings.js`.

Behaviour on Load from URL:

1. Fetch the URL as text.
2. If the text parses as JSON → validate and import it directly as a single
   catalog file (same conflict confirm + toast flow as the listing path).
3. Otherwise → treat the text as a directory listing: run the tolerant parser
   (§7) and render the same checkbox/Preview/Load-selected UI as
   `Import catalogs`, with files fetched relative to the entered URL
   (normalised to a trailing slash).
4. On any successful load, persist the URL to `importUrl`.
5. Failures (network, no `.json` files found, invalid catalog) surface as
   error toasts.

The built-in `Import catalogs` button keeps using `CATALOG_BASE_URL`.
`www/js/ui/catalog-section.js` is refactored so the file-list UI takes its
base URL as a parameter instead of the module constant.

## 7. Tolerant directory-listing parsing

Extend `parseListing` in `www/js/catalog-import.js` to cope with common
autoindex styles (nginx, Apache, lighttpd, Python `http.server`, Caddy):

- accept hrefs containing paths — use the last path segment;
- strip query strings and fragments (e.g. Apache's `?C=N;O=D` sort links);
- `decodeURIComponent` the resulting name;
- case-insensitive `.json` extension check;
- skip parent-directory links; de-duplicate names;
- fallback: when the input contains no `href` attributes at all, scan the
  plain text for whitespace-separated `*.json` tokens.

## 8. About link

In `www/index.html`, replace `https://www.example.com` / `www.example.com`
with `https://github.com/RoboCtrl/dms` (href and link text).

## Cross-cutting

- `www/sw.js`: bump cache to `dms-v10`; precache `js/ui/toast.js`,
  `js/ui/preview-overlay.js`, `js/ui/manage-db.js`.
- Tests (`node --test`):
  - `test/settings.test.js`: new defaults, `importUrl` default and setter;
  - `test/catalog-import.test.js`: `parseListing` tolerance cases (paths,
    query strings, encoded names, case, dedupe, plain-text fallback);
  - new tests for the URL-import decision logic (JSON body → single file,
    HTML body → listing) with an injected fetch;
  - catalog selective delete covered via `replaceAll` filtering (existing
    model tests extended).
- DOM overlays (preview, manage database, toasts) are verified manually on
  mobile Chrome/Firefox, as with the existing options UI.

## Trade-offs considered

- **Defaults migration**: fresh-installs-only chosen over a versioned
  one-time migration — nobody's deliberate choices get overwritten, at the
  cost of existing devices not picking up the new defaults.
- **Manage Database layout**: a single combined screen (chosen, per user)
  over per-section managers — one entry point, both stores visible at once.
- **Toasts vs alerts**: non-blocking toasts chosen for import results;
  `confirm()` retained where an explicit decision is required.
- **Catalog selective delete via `replaceAll`** over a new
  `deleteCatalogByIds` db function — slightly more IO on delete, but zero new
  persistence surface and it reuses tested code paths.
