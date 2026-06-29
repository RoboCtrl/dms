# Catalog Token Matching — Design

## Overview

Add a **catalog** to DMS: a local lookup table that maps a *token* string to a
display *text* (plus reserved-for-future `svg`/`png` fields). When a scanned
history entry contains a catalog token as a whitespace-delimited word, the
list row shows the catalog `text` in place of the raw scanned content.

Catalog data is imported by the user from a hardcoded remote directory that
serves a plain nginx autoindex listing of `.json` files. Import is triggered
explicitly from a button in the options overlay.

The app remains pure client-side: catalog records live in IndexedDB on the
device; the only network use is fetching catalog files from the deploy host.

## Data Model & Storage

A second IndexedDB object store, **`catalog`**, is added to the existing `dms`
database. The database `VERSION` is bumped `1 → 2`. The `onupgradeneeded`
handler creates each store guarded by a `contains` check, so the existing
`scans` store and its data are preserved across the upgrade.

Each catalog record:

| Field   | Type        | Required | Notes                                            |
| ------- | ----------- | -------- | ------------------------------------------------ |
| `id`    | number      | yes (PK) | Autoincrement primary key.                       |
| `token` | string      | yes      | Match string. Unique. No internal whitespace.    |
| `rn`    | number      | no       | Running number from third-party data. Integer.   |
| `text`  | string      | no       | Display text shown in place of scanned content.  |
| `svg`   | string      | no       | Reserved for a future feature. Stored, not used. |
| `png`   | string      | no       | Reserved (base64 PNG). Stored, not used.          |

The store uses `keyPath: "id"` with `autoIncrement: true`, plus a **unique
index `byToken`** on `token`. Ascending `id` reflects insertion order.

The only required field is `token` (the JSON object key). `rn`, `text`, `svg`,
and `png` are all optional and may be empty or absent.

## JSON Import Format

A catalog file is a JSON object keyed by token:

```json
{
  "418S6": { "rn": 1, "text": "Mech T-Rex" },
  "718S6": { "rn": 2, "text": "Diver & Fish" },
  "720S6": { "rn": 7, "text": "Boba Drink Costume", "png": "<base64>" }
}
```

Each value object may contain any subset of `rn`, `text`, `svg`, `png`. The
token is the key, so it is always present. JSON object semantics already
prevent duplicate keys within a single file (last value wins at parse time).

The bundled `www/data/series_29.json` is served from the remote data directory
and serves as the sample catalog available for import. It is **not**
auto-loaded.

## Matching Rule

A token matches scanned content when it appears as a **whole
whitespace-delimited word** of that content. This is exactly the boundary rule
from the requirements: the character preceding the token must be whitespace or
the start of the string, and the character following must be whitespace or the
end of the string. Because a token is bounded by whitespace, it cannot itself
contain whitespace.

Equivalent definition: `token` matches `content` when `token` is one of
`content.split(/\s+/)` (with empty fragments dropped). Partial substrings do
**not** match — e.g. token `18S6` does not match the word `418S6`.

Matching lives in a pure, dependency-free module `js/util/catalog-match.js`:

- `contentWords(content)` — split content on whitespace, drop empties.
- `isValidToken(token)` — non-empty string with no whitespace.
- `findMatch(content, byToken)` — given a `Map<string, entry>`, scan the
  content's words **left-to-right** and return `{ entry, matchedTokens }` for
  the first word that is a known token, collecting any further matching tokens
  in `matchedTokens`; return `null` when nothing matches.

When `matchedTokens.length > 1` (a scan matches multiple tokens), the first
match in reading order is used and the caller logs a `console.error`.

## In-Memory Catalog Model

`js/catalog.js` mirrors the `store.js` pattern: an in-memory model bound to an
injected `db` module.

- `load()` — read all catalog records into an array and a `Map<token, entry>`.
- `displayFor(content)` — run `findMatch`; if it matches and the entry's `text`
  is a non-empty string, return that text; otherwise return `null`. Logs a
  `console.error` on multiple matches.
- `getEntries()` — current entries (for the count readout).
- `replaceAll(entries)` — persist a new full entry set and refresh the mirror.
- `clear()` — remove all catalog records.
- `on("change", cb)` — emit on any mutation so the UI re-renders.

Persistence functions are added to `db.js` (it owns the IndexedDB connection
and upgrade path): `getAllCatalog()`, `replaceAllCatalog(entries)` (clear +
bulk add within one transaction), and `clearCatalog()`.

## Display Integration

`createHistoryPanel` gains a `catalog` dependency. In `buildEntry`:

1. `const text = catalog.displayFor(rec.content);`
2. If `text` is non-empty, render it as a single content node (no bold
   segmentation).
3. Otherwise fall back to the existing `segmentContent(rec.content)` rendering.

The counter (`store.countFor(rec.content)`) and timestamp are unchanged — they
remain keyed on the raw scanned content.

Lookup happens **at render time**, not at scan time. Nothing about the matched
catalog entry is stored on the scan record. Importing or clearing a catalog
therefore updates already-listed rows live: `app.js` subscribes
`catalog.on("change", render)`.

## Import Flow

A new **"Catalog"** group is added to the options overlay (`index.html`): a
count readout and an **"Import catalogs"** button. UI logic lives in
`js/ui/catalog-section.js`, which owns its own DOM elements within `#options`
(the existing `options-menu.js` is left as-is).

Constant `CATALOG_BASE_URL = "https://srv346879.hstgr.cloud/app/data/"`. This is
the same origin as the deployed app, so no CORS handling is needed in
production.

`js/catalog-import.js` holds the orchestration with an injectable `fetch` for
testing:

- `listCatalogFiles(baseUrl, fetchFn)` — fetch the listing with
  `cache: "no-store"`, parse `<a href="…">` anchors, keep those ending in
  `.json` (skipping `../`), return the filenames.
- `fetchCatalogFile(baseUrl, name, fetchFn)` — fetch the file with
  `cache: "no-store"` and `JSON.parse` it; throw a typed parse error on failure.
- `validateCatalog(json)` — convert the object to an entry array and validate
  each entry; return `{ entries }` or throw a validation error naming the
  offending token.

Interaction sequence when the button is pressed:

1. List the available `.json` files and render them as a small inline
   pick-list in the Catalog section.
2. On confirm, for each chosen file:
   a. Fetch + parse. On error → `alert` + `console.error`, skip the file.
   b. Validate. On error → `alert` naming the offending token + `console.error`,
      abort that file.
   c. Compute conflicts: incoming tokens already present in the catalog.
   d. If there are conflicts, show **one batched `confirm` per file**:
      "File X: N tokens already exist — replace them with the new versions?
      (Cancel keeps existing.)" Replace-all or keep-all accordingly.
   e. Merge the resulting entries and persist via `catalog.replaceAll(...)`.
3. Refresh the count readout and trigger a history re-render.

## Error Handling

| Case                                     | Behaviour                                                        |
| ---------------------------------------- | --------------------------------------------------------------- |
| JSON read / parse error                  | `alert` to user + `console.error`; skip that file.              |
| Missing/invalid required field on import | `alert` naming the offending token + `console.error`; abort file.|
| Non-unique token (incoming vs existing)  | One batched `confirm` per file: keep all existing or replace all.|
| Scan matches multiple tokens             | Use first match (reading order); `console.error`.               |

Validation details: a token must be a non-empty string with no whitespace; if
present, `rn` must be an integer and `text`/`svg`/`png` must be strings.

## Service Worker

`sw.js` precaches an explicit asset list and serves cache-first. Add the new
JS modules to `ASSETS` (`js/catalog.js`, `js/catalog-import.js`,
`js/util/catalog-match.js`, `js/ui/catalog-section.js`) and bump the cache
name `dms-v6 → dms-v7`. The catalog data directory is intentionally **not**
precached, and import fetches use `cache: "no-store"` so listings and files are
always fresh.

## Testing

Node's built-in test runner (`node --test`) with `fake-indexeddb`:

- `catalog-match.test.js` — word-boundary matching, rejection of partial
  substrings, left-to-right first-match, multiple-match detection, token
  validity.
- `catalog-import.test.js` — listing HTML parsing, good/bad JSON handling,
  validation errors, conflict computation; injects a fake `fetch`.
- Catalog persistence — `getAllCatalog` / `replaceAllCatalog` / `clearCatalog`
  round-trips and that the `1 → 2` version upgrade preserves existing `scans`
  data, using `fake-indexeddb`.
- Catalog model — `displayFor` returns `text` on match and `null` otherwise.

## Notes & Constraints

- **Local-dev caveat:** importing hits the remote URL cross-origin from
  `localhost`; nginx's autoindex sends no CORS headers, so import only works
  from the deployed site. Tests inject a fake `fetch` and are unaffected.
- No new runtime dependencies; the app stays vanilla ES modules.
- `svg` and `png` are stored but not rendered — reserved for a future feature.
