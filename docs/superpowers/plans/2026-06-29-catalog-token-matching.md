# Catalog Token Matching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a scanned history row display catalog text in place of its raw content when the content contains a known catalog token, with catalog data imported by the user from a remote directory listing.

**Architecture:** A new IndexedDB `catalog` object store holds token→display records. A pure matching module decides word-boundary matches; an in-memory catalog model (mirroring `store.js`) serves render-time lookups; an import module fetches/validates remote `.json` files; an options-overlay UI section drives import. The history panel substitutes catalog `text` at render time.

**Tech Stack:** Vanilla ES modules, IndexedDB, Node's built-in test runner (`node --test`) with `fake-indexeddb`. No build step, no new runtime dependencies.

## Global Constraints

- Pure front-end only — no server, no remote storage of scan/catalog data beyond the device's IndexedDB. The only network use is fetching catalog files from `https://srv346879.hstgr.cloud/app/data/`.
- All runtime code lives under `www/`. Tests live under `test/`.
- Code and comments in American English; document every function in-code (purpose, args, types, return values).
- No new npm dependencies.
- Tests run with `npm test` (`node --test`) and must pass.
- Conversation in British English; per-prompt change logs go in `./claude-log` (git-ignored); commit to branch `dev-claude`.

---

## File Structure

**Create:**
- `www/js/util/catalog-match.js` — pure matching helpers (`contentWords`, `isValidToken`, `findMatch`).
- `www/js/catalog.js` — in-memory catalog model bound to an injected `db` (`createCatalog`).
- `www/js/catalog-import.js` — remote listing parse, file fetch, JSON validation, conflict/merge helpers.
- `www/js/ui/catalog-section.js` — the "Catalog" options-overlay UI (`createCatalogSection`).
- `test/catalog-match.test.js`, `test/catalog.test.js`, `test/catalog-import.test.js`, `test/catalog-db.test.js`.

**Modify:**
- `www/js/db.js` — bump `VERSION` to 2, add the `catalog` store and its CRUD.
- `www/js/ui/history-panel.js` — accept a `catalog` dependency and substitute display text.
- `www/js/app.js` — create/load the catalog model, wire it into the history panel and the new UI section, re-render on catalog change.
- `www/index.html` — add the "Catalog" options group.
- `www/sw.js` — add the new JS files to `ASSETS`, bump the cache name to `dms-v7`.

---

## Task 1: Catalog persistence in db.js

**Files:**
- Modify: `www/js/db.js`
- Test: `test/catalog-db.test.js`

**Interfaces:**
- Consumes: existing `openDB()`, `__resetForTests()` in `db.js`.
- Produces:
  - `getAllCatalog(): Promise<Array<{id:number, token:string, rn?:number, text?:string, svg?:string, png?:string}>>` — ascending by id.
  - `replaceAllCatalog(entries: Array<{token:string, rn?:number, text?:string, svg?:string, png?:string}>): Promise<void>` — clears the store then adds each entry (fresh autoincrement ids), in one transaction.
  - `clearCatalog(): Promise<void>`.

- [ ] **Step 1: Write the failing test**

Create `test/catalog-db.test.js`:

```js
import "fake-indexeddb/auto";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as db from "../www/js/db.js";

beforeEach(async () => {
  await db.__resetForTests();
});

test("replaceAllCatalog stores entries and getAllCatalog returns them", async () => {
  await db.replaceAllCatalog([
    { token: "418S6", rn: 1, text: "Mech T-Rex" },
    { token: "718S6", text: "Diver & Fish" },
  ]);
  const all = await db.getAllCatalog();
  assert.equal(all.length, 2);
  assert.deepEqual(
    all.map((e) => e.token).sort(),
    ["418S6", "718S6"],
  );
  assert.ok(all.every((e) => typeof e.id === "number"));
});

test("replaceAllCatalog replaces the entire previous set", async () => {
  await db.replaceAllCatalog([{ token: "A" }, { token: "B" }]);
  await db.replaceAllCatalog([{ token: "C" }]);
  const all = await db.getAllCatalog();
  assert.deepEqual(all.map((e) => e.token), ["C"]);
});

test("clearCatalog empties the catalog store", async () => {
  await db.replaceAllCatalog([{ token: "A" }]);
  await db.clearCatalog();
  assert.equal((await db.getAllCatalog()).length, 0);
});

test("catalog and scans stores coexist independently", async () => {
  await db.add("SCANNED", 1000);
  await db.replaceAllCatalog([{ token: "A", text: "Alpha" }]);
  assert.equal((await db.getAll()).length, 1);
  assert.equal((await db.getAllCatalog()).length, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/catalog-db.test.js`
Expected: FAIL — `db.replaceAllCatalog is not a function`.

- [ ] **Step 3: Implement the catalog store and CRUD**

In `www/js/db.js`, update the top doc comment's first paragraph to mention the catalog store, then change the version constant and store name block near the top:

```js
const DB_NAME = "dms";
const STORE = "scans";
const CATALOG = "catalog";
const VERSION = 2;
```

Replace the `req.onupgradeneeded` handler inside `openDB()` with:

```js
    req.onupgradeneeded = () => {
      const idb = req.result;
      if (!idb.objectStoreNames.contains(STORE)) {
        const store = idb.createObjectStore(STORE, {
          keyPath: "id",
          autoIncrement: true,
        });
        store.createIndex("byContent", "content", { unique: false });
      }
      if (!idb.objectStoreNames.contains(CATALOG)) {
        const cat = idb.createObjectStore(CATALOG, {
          keyPath: "id",
          autoIncrement: true,
        });
        cat.createIndex("byToken", "token", { unique: true });
      }
    };
```

Append these three functions to `www/js/db.js` (before `__resetForTests`):

```js
/**
 * Get all catalog records ascending by id.
 * @returns {Promise<Array<{id:number, token:string, rn?:number, text?:string, svg?:string, png?:string}>>}
 */
export async function getAllCatalog() {
  const idb = await openDB();
  return new Promise((resolve, reject) => {
    const req = idb
      .transaction(CATALOG, "readonly")
      .objectStore(CATALOG)
      .getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Replace the entire catalog with a new entry set in a single transaction:
 * the store is cleared, then each entry is added with a fresh autoincrement id
 * (any incoming `id` is dropped). Callers must ensure tokens are unique.
 * @param {Array<{token:string, rn?:number, text?:string, svg?:string, png?:string}>} entries
 * @returns {Promise<void>}
 */
export async function replaceAllCatalog(entries) {
  const idb = await openDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(CATALOG, "readwrite");
    const store = tx.objectStore(CATALOG);
    store.clear();
    for (const entry of entries) {
      const { id, ...rest } = entry;
      void id;
      store.add(rest);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/**
 * Remove every catalog record.
 * @returns {Promise<void>}
 */
export async function clearCatalog() {
  const idb = await openDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(CATALOG, "readwrite");
    tx.objectStore(CATALOG).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/catalog-db.test.js`
Expected: PASS (4 tests). Also run `npm test` to confirm existing `db.test.js`/`store.test.js` still pass with `VERSION = 2`.

- [ ] **Step 5: Commit**

```bash
git add www/js/db.js test/catalog-db.test.js
git commit -m "feat: catalog object store and CRUD in db layer

Bump IndexedDB to version 2 and add a catalog store (autoincrement id,
unique token index) with getAllCatalog/replaceAllCatalog/clearCatalog.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Pure matching module

**Files:**
- Create: `www/js/util/catalog-match.js`
- Test: `test/catalog-match.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `contentWords(content: string): string[]` — whitespace-split, empties dropped.
  - `isValidToken(token: unknown): boolean` — non-empty string with no whitespace.
  - `findMatch(content: string, byToken: Map<string, object>): {entry: object, matchedTokens: string[]} | null` — first matching word in reading order; `matchedTokens` lists every distinct matching token.

- [ ] **Step 1: Write the failing test**

Create `test/catalog-match.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  contentWords,
  isValidToken,
  findMatch,
} from "../www/js/util/catalog-match.js";

const map = new Map([
  ["418S6", { token: "418S6", text: "Mech T-Rex" }],
  ["718S6", { token: "718S6", text: "Diver & Fish" }],
]);

test("contentWords splits on any whitespace and drops empties", () => {
  assert.deepEqual(contentWords("  a  b\tc\n"), ["a", "b", "c"]);
});

test("isValidToken rejects empties, whitespace, and non-strings", () => {
  assert.equal(isValidToken("418S6"), true);
  assert.equal(isValidToken(""), false);
  assert.equal(isValidToken("a b"), false);
  assert.equal(isValidToken(5), false);
});

test("findMatch matches a whole word only", () => {
  assert.equal(findMatch("x 418S6 y", map).entry.text, "Mech T-Rex");
  assert.equal(findMatch("418S6X", map), null);
  assert.equal(findMatch("x418S6", map), null);
});

test("findMatch returns the first match in reading order", () => {
  assert.equal(findMatch("718S6 418S6", map).entry.token, "718S6");
});

test("findMatch reports every distinct matching token", () => {
  const res = findMatch("418S6 718S6 418S6", map);
  assert.equal(res.entry.token, "418S6");
  assert.deepEqual(res.matchedTokens, ["418S6", "718S6"]);
});

test("findMatch returns null when nothing matches", () => {
  assert.equal(findMatch("hello world", map), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/catalog-match.test.js`
Expected: FAIL — cannot find module `catalog-match.js`.

- [ ] **Step 3: Implement the module**

Create `www/js/util/catalog-match.js`:

```js
/**
 * Pure token-matching helpers for the catalog feature. A token matches scanned
 * content when it appears as a whole whitespace-delimited word of that content.
 * No DOM or storage dependencies.
 */

/**
 * Split scanned content into its whitespace-delimited words, dropping empty
 * fragments produced by leading, trailing, or repeated whitespace.
 * @param {string} content - The scanned content.
 * @returns {string[]} The non-empty words, in order.
 */
export function contentWords(content) {
  return content.split(/\s+/).filter(Boolean);
}

/**
 * Whether a value is a valid catalog token: a non-empty string containing no
 * whitespace (a token bounded by whitespace can never itself contain any).
 * @param {unknown} token - The candidate token.
 * @returns {boolean} True when the token is usable.
 */
export function isValidToken(token) {
  return typeof token === "string" && token.length > 0 && !/\s/.test(token);
}

/**
 * Find the catalog entry matching scanned content. Words are scanned
 * left-to-right; the first word that is a known token determines the returned
 * entry. Every distinct matching token is collected in `matchedTokens` so the
 * caller can detect (and report) multi-token matches.
 * @param {string} content - The scanned content.
 * @param {Map<string, object>} byToken - Map of token to catalog entry.
 * @returns {{entry: object, matchedTokens: string[]} | null} The first match, or null.
 */
export function findMatch(content, byToken) {
  let entry = null;
  const matchedTokens = [];
  for (const word of contentWords(content)) {
    if (byToken.has(word)) {
      if (!entry) entry = byToken.get(word);
      if (!matchedTokens.includes(word)) matchedTokens.push(word);
    }
  }
  return entry ? { entry, matchedTokens } : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/catalog-match.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add www/js/util/catalog-match.js test/catalog-match.test.js
git commit -m "feat: pure catalog token-matching helpers

Word-boundary matching with first-in-reading-order selection and
multi-match detection; no DOM or storage dependencies.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: In-memory catalog model

**Files:**
- Create: `www/js/catalog.js`
- Test: `test/catalog.test.js`

**Interfaces:**
- Consumes: `db.getAllCatalog`, `db.replaceAllCatalog`, `db.clearCatalog` (Task 1); `findMatch` (Task 2).
- Produces: `createCatalog(db): { load(): Promise<void>, displayFor(content: string): string|null, getEntries(): object[], replaceAll(entries: object[]): Promise<void>, clear(): Promise<void>, on(event: "change", cb: () => void): void }`.

- [ ] **Step 1: Write the failing test**

Create `test/catalog.test.js`:

```js
import "fake-indexeddb/auto";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as db from "../www/js/db.js";
import { createCatalog } from "../www/js/catalog.js";

beforeEach(async () => {
  await db.__resetForTests();
});

test("displayFor returns the text of a matched token", async () => {
  const catalog = createCatalog(db);
  await catalog.replaceAll([{ token: "418S6", text: "Mech T-Rex" }]);
  assert.equal(catalog.displayFor("x 418S6 y"), "Mech T-Rex");
});

test("displayFor returns null when there is no match", async () => {
  const catalog = createCatalog(db);
  await catalog.replaceAll([{ token: "418S6", text: "Mech T-Rex" }]);
  assert.equal(catalog.displayFor("nothing here"), null);
});

test("displayFor returns null when the matched entry has no text", async () => {
  const catalog = createCatalog(db);
  await catalog.replaceAll([{ token: "418S6" }]);
  assert.equal(catalog.displayFor("x 418S6 y"), null);
});

test("load reads persisted entries into the mirror", async () => {
  await db.replaceAllCatalog([{ token: "A", text: "Alpha" }]);
  const catalog = createCatalog(db);
  await catalog.load();
  assert.equal(catalog.getEntries().length, 1);
  assert.equal(catalog.displayFor("see A now"), "Alpha");
});

test("replaceAll and clear emit change", async () => {
  const catalog = createCatalog(db);
  let fired = 0;
  catalog.on("change", () => (fired += 1));
  await catalog.replaceAll([{ token: "A", text: "Alpha" }]);
  await catalog.clear();
  assert.equal(fired, 2);
  assert.equal(catalog.getEntries().length, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/catalog.test.js`
Expected: FAIL — cannot find module `catalog.js`.

- [ ] **Step 3: Implement the model**

Create `www/js/catalog.js`:

```js
/**
 * In-memory model of the catalog lookup table. Mirrors the persisted catalog
 * records, indexes them by token for matching, serves render-time display
 * lookups, and emits "change" events for the UI. Depends only on an injected
 * db module (Task 1's interface).
 */
import { findMatch } from "./util/catalog-match.js";

/**
 * Create a catalog model bound to a persistence module.
 * @param {object} db - Persistence module exposing getAllCatalog/replaceAllCatalog/clearCatalog.
 * @returns {object} The catalog instance.
 */
export function createCatalog(db) {
  /** @type {Array<{id?:number, token:string, rn?:number, text?:string, svg?:string, png?:string}>} */
  let entries = [];
  /** @type {Map<string, object>} */
  let byToken = new Map();
  const listeners = [];

  /** Rebuild the token index from the current entries. */
  function reindex() {
    byToken = new Map(entries.map((e) => [e.token, e]));
  }

  /** Notify all "change" subscribers. */
  function emit() {
    for (const cb of listeners) cb();
  }

  return {
    /**
     * Load all persisted catalog records into the in-memory mirror.
     * @returns {Promise<void>}
     */
    async load() {
      entries = await db.getAllCatalog();
      reindex();
    },

    /**
     * Resolve the display text for scanned content. Returns the matched entry's
     * non-empty `text`, or null when there is no match or no usable text. Logs
     * a console error when the content matches more than one token.
     * @param {string} content - The scanned content.
     * @returns {string|null} The text to display, or null to fall back.
     */
    displayFor(content) {
      const res = findMatch(content, byToken);
      if (!res) return null;
      if (res.matchedTokens.length > 1) {
        console.error(
          `Scan "${content}" matches multiple tokens ` +
            `(${res.matchedTokens.join(", ")}); using "${res.entry.token}".`,
        );
      }
      const text = res.entry.text;
      return typeof text === "string" && text.length > 0 ? text : null;
    },

    /**
     * The current catalog entries.
     * @returns {Array<object>}
     */
    getEntries() {
      return entries;
    },

    /**
     * Persist a new full entry set, refresh the mirror, and emit change.
     * @param {Array<{token:string, rn?:number, text?:string, svg?:string, png?:string}>} next
     * @returns {Promise<void>}
     */
    async replaceAll(next) {
      await db.replaceAllCatalog(next);
      entries = await db.getAllCatalog();
      reindex();
      emit();
    },

    /**
     * Remove every catalog entry and emit change.
     * @returns {Promise<void>}
     */
    async clear() {
      await db.clearCatalog();
      entries = [];
      reindex();
      emit();
    },

    /**
     * Subscribe to change events.
     * @param {"change"} _event - Event name (only "change" is emitted).
     * @param {() => void} cb - Callback invoked on every change.
     */
    on(_event, cb) {
      listeners.push(cb);
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/catalog.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add www/js/catalog.js test/catalog.test.js
git commit -m "feat: in-memory catalog model with render-time lookup

Mirrors persisted catalog records, indexes by token, and exposes
displayFor/getEntries/replaceAll/clear with change events.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Import orchestration

**Files:**
- Create: `www/js/catalog-import.js`
- Test: `test/catalog-import.test.js`

**Interfaces:**
- Consumes: `isValidToken` (Task 2).
- Produces:
  - `CATALOG_BASE_URL: string` = `"https://srv346879.hstgr.cloud/app/data/"`.
  - `parseListing(html: string): string[]` — `.json` file names from an nginx autoindex page.
  - `listCatalogFiles(baseUrl: string, fetchFn?): Promise<string[]>`.
  - `fetchCatalogFile(baseUrl: string, name: string, fetchFn?): Promise<object>` — parsed JSON; throws on HTTP/parse failure.
  - `validateCatalog(json: object): Array<{token:string, rn?:number, text?:string, svg?:string, png?:string}>` — throws on invalid input.
  - `findConflicts(existing: object[], incoming: object[]): string[]` — tokens present in both.
  - `mergeEntries(existing: object[], incoming: object[], replaceConflicts: boolean): object[]` — full merged set.

- [ ] **Step 1: Write the failing test**

Create `test/catalog-import.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseListing,
  listCatalogFiles,
  fetchCatalogFile,
  validateCatalog,
  findConflicts,
  mergeEntries,
} from "../www/js/catalog-import.js";

const LISTING = `<html><body><pre>
<a href="../">../</a>
<a href="series_29.json">series_29.json</a>   28-Jun-2026   345
<a href="notes.txt">notes.txt</a>
</pre></body></html>`;

/** Build a minimal fetch stub returning the given body text. */
function fetchStub(body, ok = true, status = 200) {
  return async () => ({ ok, status, text: async () => body });
}

test("parseListing keeps only .json hrefs", () => {
  assert.deepEqual(parseListing(LISTING), ["series_29.json"]);
});

test("listCatalogFiles fetches and parses the listing", async () => {
  const files = await listCatalogFiles("base/", fetchStub(LISTING));
  assert.deepEqual(files, ["series_29.json"]);
});

test("fetchCatalogFile parses JSON; throws on bad JSON", async () => {
  const obj = await fetchCatalogFile("b/", "x.json", fetchStub('{"A":{}}'));
  assert.deepEqual(obj, { A: {} });
  await assert.rejects(
    fetchCatalogFile("b/", "x.json", fetchStub("not json")),
    /not valid JSON/,
  );
});

test("validateCatalog accepts good entries and copies fields", () => {
  const entries = validateCatalog({
    "418S6": { rn: 1, text: "Mech T-Rex" },
    "718S6": {},
  });
  assert.deepEqual(entries, [
    { token: "418S6", rn: 1, text: "Mech T-Rex" },
    { token: "718S6" },
  ]);
});

test("validateCatalog rejects bad tokens and bad field types", () => {
  assert.throws(() => validateCatalog({ "": {} }), /Invalid token/);
  assert.throws(() => validateCatalog({ "a b": {} }), /Invalid token/);
  assert.throws(() => validateCatalog({ A: { rn: 1.5 } }), /rn/);
  assert.throws(() => validateCatalog({ A: { text: 9 } }), /text/);
});

test("findConflicts lists tokens present in both sets", () => {
  const existing = [{ token: "A" }, { token: "B" }];
  const incoming = [{ token: "B" }, { token: "C" }];
  assert.deepEqual(findConflicts(existing, incoming), ["B"]);
});

test("mergeEntries replaces conflicts when asked", () => {
  const existing = [{ token: "A", text: "old" }, { token: "B", text: "keep" }];
  const incoming = [{ token: "A", text: "new" }, { token: "C", text: "add" }];
  const merged = mergeEntries(existing, incoming, true);
  assert.deepEqual(merged, [
    { token: "B", text: "keep" },
    { token: "A", text: "new" },
    { token: "C", text: "add" },
  ]);
});

test("mergeEntries keeps existing conflicts but adds new tokens", () => {
  const existing = [{ token: "A", text: "old" }];
  const incoming = [{ token: "A", text: "new" }, { token: "C", text: "add" }];
  const merged = mergeEntries(existing, incoming, false);
  assert.deepEqual(merged, [
    { token: "A", text: "old" },
    { token: "C", text: "add" },
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/catalog-import.test.js`
Expected: FAIL — cannot find module `catalog-import.js`.

- [ ] **Step 3: Implement the module**

Create `www/js/catalog-import.js`:

```js
/**
 * Catalog import orchestration: list the remote directory of catalog files,
 * fetch and parse a chosen file, validate its contents, and compute how an
 * imported set merges with the existing catalog (conflict detection + merge).
 * Network access is via an injectable fetch so the logic is unit-testable.
 */
import { isValidToken } from "./util/catalog-match.js";

/** Remote directory (nginx autoindex) that serves catalog .json files. */
export const CATALOG_BASE_URL = "https://srv346879.hstgr.cloud/app/data/";

/**
 * Extract catalog file names from an nginx autoindex HTML page: every `href`
 * that ends in ".json" and names a file in this directory (no path separator).
 * @param {string} html - The directory listing HTML.
 * @returns {string[]} The catalog file names.
 */
export function parseListing(html) {
  const names = [];
  const re = /href="([^"]+)"/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const href = m[1];
    if (href.endsWith(".json") && !href.includes("/")) names.push(href);
  }
  return names;
}

/**
 * Fetch and parse the remote directory listing into catalog file names.
 * @param {string} baseUrl - The directory URL (with trailing slash).
 * @param {typeof fetch} [fetchFn=fetch] - Fetch implementation (injectable for tests).
 * @returns {Promise<string[]>} The available catalog file names.
 */
export async function listCatalogFiles(baseUrl, fetchFn = fetch) {
  const res = await fetchFn(baseUrl, { cache: "no-store" });
  if (!res.ok) throw new Error(`Listing fetch failed: HTTP ${res.status}`);
  return parseListing(await res.text());
}

/**
 * Fetch a single catalog file and parse it as JSON.
 * @param {string} baseUrl - The directory URL (with trailing slash).
 * @param {string} name - The catalog file name.
 * @param {typeof fetch} [fetchFn=fetch] - Fetch implementation (injectable for tests).
 * @returns {Promise<object>} The parsed catalog object.
 */
export async function fetchCatalogFile(baseUrl, name, fetchFn = fetch) {
  const res = await fetchFn(baseUrl + name, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Catalog fetch failed for ${name}: HTTP ${res.status}`);
  }
  const raw = await res.text();
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Catalog file ${name} is not valid JSON: ${err.message}`);
  }
}

/**
 * Validate a parsed catalog object and convert it to an entry array. Throws an
 * Error naming the offending token when a token is invalid (empty or contains
 * whitespace), an entry value is not an object, `rn` is not an integer, or
 * `text`/`svg`/`png` is present but not a string. Optional fields that are
 * absent or null are omitted from the entry.
 * @param {object} json - The parsed catalog object, keyed by token.
 * @returns {Array<{token:string, rn?:number, text?:string, svg?:string, png?:string}>}
 */
export function validateCatalog(json) {
  if (json === null || typeof json !== "object" || Array.isArray(json)) {
    throw new Error("Catalog must be a JSON object keyed by token.");
  }
  const entries = [];
  for (const [token, value] of Object.entries(json)) {
    if (!isValidToken(token)) {
      throw new Error(
        `Invalid token "${token}": must be non-empty with no whitespace.`,
      );
    }
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`Invalid entry for token "${token}": value must be an object.`);
    }
    const entry = { token };
    if (value.rn !== undefined && value.rn !== null) {
      if (!Number.isInteger(value.rn)) {
        throw new Error(`Invalid rn for token "${token}": must be an integer.`);
      }
      entry.rn = value.rn;
    }
    for (const field of ["text", "svg", "png"]) {
      if (value[field] !== undefined && value[field] !== null) {
        if (typeof value[field] !== "string") {
          throw new Error(`Invalid ${field} for token "${token}": must be a string.`);
        }
        entry[field] = value[field];
      }
    }
    entries.push(entry);
  }
  return entries;
}

/**
 * List the tokens that exist in both the current catalog and an imported set.
 * @param {Array<{token:string}>} existing - Current catalog entries.
 * @param {Array<{token:string}>} incoming - Entries from the imported file.
 * @returns {string[]} The conflicting tokens.
 */
export function findConflicts(existing, incoming) {
  const incomingTokens = new Set(incoming.map((e) => e.token));
  return existing.filter((e) => incomingTokens.has(e.token)).map((e) => e.token);
}

/**
 * Merge an imported set into the existing catalog and return the full result.
 * When `replaceConflicts` is true, conflicting tokens take the imported entry;
 * otherwise they keep the existing entry. Non-conflicting imported tokens are
 * always added.
 * @param {Array<{token:string}>} existing - Current catalog entries.
 * @param {Array<{token:string}>} incoming - Entries from the imported file.
 * @param {boolean} replaceConflicts - Whether imported entries replace conflicts.
 * @returns {Array<object>} The merged entry set.
 */
export function mergeEntries(existing, incoming, replaceConflicts) {
  if (replaceConflicts) {
    const incomingTokens = new Set(incoming.map((e) => e.token));
    const kept = existing.filter((e) => !incomingTokens.has(e.token));
    return [...kept, ...incoming];
  }
  const existingTokens = new Set(existing.map((e) => e.token));
  const additions = incoming.filter((e) => !existingTokens.has(e.token));
  return [...existing, ...additions];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/catalog-import.test.js`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add www/js/catalog-import.js test/catalog-import.test.js
git commit -m "feat: catalog import parsing, validation, and merge helpers

Parse the nginx autoindex listing, fetch+parse files, validate entries,
and compute conflict/merge results against the existing catalog.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Display integration in the history panel

**Files:**
- Modify: `www/js/ui/history-panel.js`
- Modify: `www/js/app.js`

**Interfaces:**
- Consumes: `catalog.displayFor` (Task 3); `createCatalog` (Task 3).
- Produces: `createHistoryPanel` now requires a `catalog` option.

This task is UI wiring with no Node-testable surface (the panel uses `document`, matching the existing untested `history-panel.js`/`options-menu.js`). The decision logic it relies on is covered by Task 3's `displayFor` tests. Verify manually by serving the app.

- [ ] **Step 1: Add the catalog dependency to the history panel**

In `www/js/ui/history-panel.js`, update the factory signature and its JSDoc to include `catalog`:

```js
/**
 * @param {object} opts
 * @param {HTMLElement} opts.root - Container element (#history).
 * @param {object} opts.store - The store instance (Task 3).
 * @param {object} opts.catalog - The catalog model; supplies displayFor().
 * @param {() => boolean} opts.getHideDuplicates - Current hide-duplicates setting.
 * @returns {{render: () => void}}
 */
export function createHistoryPanel({ root, store, catalog, getHideDuplicates }) {
```

- [ ] **Step 2: Substitute catalog text when a row matches**

In `buildEntry`, replace the content-building block (the `const content = …` span creation through the `segments.forEach(...)` loop) with:

```js
    const content = document.createElement("span");
    content.className = "content";
    const display = catalog.displayFor(rec.content);
    if (display) {
      // A catalog token matched: show its text in place of the scanned content.
      content.textContent = display;
    } else {
      // Render segments: only the special-format alphanumeric token is bold.
      const segments = segmentContent(rec.content);
      segments.forEach((seg, i) => {
        if (i > 0) content.appendChild(document.createTextNode(" "));
        if (seg.bold) {
          const strong = document.createElement("strong");
          strong.textContent = seg.text;
          content.appendChild(strong);
        } else {
          content.appendChild(document.createTextNode(seg.text));
        }
      });
    }
```

- [ ] **Step 3: Wire the catalog model into app.js**

In `www/js/app.js`, add the import beside the other imports:

```js
import { createCatalog } from "./catalog.js";
```

After `await store.load();`, create and load the catalog:

```js
  const catalog = createCatalog(db);
  await catalog.load();
```

Pass `catalog` into the history panel:

```js
  const history = createHistoryPanel({
    root: document.getElementById("history"),
    store,
    catalog,
    getHideDuplicates: () => settings.get().hideDuplicates,
  });
```

Subscribe the existing `render` to catalog changes (add after `store.on("change", render);`):

```js
  catalog.on("change", render);
```

- [ ] **Step 4: Verify existing tests still pass**

Run: `npm test`
Expected: PASS — all suites green (this task adds no tests; it must not break existing ones).

- [ ] **Step 5: Manual verification**

Run: `npm run serve`, open `http://localhost:8000`, and in the browser console seed a catalog entry to confirm substitution without needing the remote import:

```js
// In DevTools console:
const dbm = await import("/js/db.js");
await dbm.replaceAllCatalog([{ token: "418S6", text: "Mech T-Rex" }]);
location.reload();
```

Scan or (for a quick check) add a record whose content contains `418S6` as a word and confirm the row shows "Mech T-Rex"; confirm a non-matching row still renders normally. (Remote import is wired in Task 6; it only works from the deployed origin — see Notes.)

- [ ] **Step 6: Commit**

```bash
git add www/js/ui/history-panel.js www/js/app.js
git commit -m "feat: show catalog text for matching history rows

The history panel substitutes a matched catalog entry's text for the raw
scanned content at render time; the app loads the catalog and re-renders
on catalog change.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Catalog import UI

**Files:**
- Modify: `www/index.html`
- Create: `www/js/ui/catalog-section.js`
- Modify: `www/js/app.js`

**Interfaces:**
- Consumes: `CATALOG_BASE_URL`, `listCatalogFiles`, `fetchCatalogFile`, `validateCatalog`, `findConflicts`, `mergeEntries` (Task 4); the `catalog` model (Task 3).
- Produces: `createCatalogSection({ catalog, onChange }): { refreshStats: () => void }`.

UI wiring; verify manually. The fetch/validate/merge logic it calls is covered by Task 4.

- [ ] **Step 1: Add the Catalog options group to index.html**

In `www/index.html`, insert this `<section>` immediately after the Database `opt-group` (after the `</section>` that closes the Database group, before the About group):

```html
        <section class="opt-group">
          <h3>Catalog</h3>
          <p id="catalog-stats">0 entries</p>
          <button id="catalog-import-btn">Import catalogs</button>
          <div id="catalog-files" hidden></div>
        </section>
```

- [ ] **Step 2: Create the catalog UI module**

Create `www/js/ui/catalog-section.js`:

```js
import {
  CATALOG_BASE_URL,
  listCatalogFiles,
  fetchCatalogFile,
  validateCatalog,
  findConflicts,
  mergeEntries,
} from "../catalog-import.js";

/**
 * Create the catalog options section. Owns the "Catalog" group in the options
 * overlay: an entry-count readout, an "Import catalogs" button that lists the
 * remote .json files, and the per-file load flow (fetch, validate, resolve
 * duplicate tokens via a batched confirm, persist).
 * @param {object} opts
 * @param {object} opts.catalog - The in-memory catalog model.
 * @param {() => void} opts.onChange - Called after the catalog changes so the app re-renders.
 * @returns {{refreshStats: () => void}}
 */
export function createCatalogSection({ catalog, onChange }) {
  const importBtn = document.getElementById("catalog-import-btn");
  const statsEl = document.getElementById("catalog-stats");
  const filesEl = document.getElementById("catalog-files");

  /** Update the catalog entry-count readout. */
  function refreshStats() {
    statsEl.textContent = `${catalog.getEntries().length} entries`;
  }

  /**
   * Fetch, validate, resolve conflicts for, and persist one catalog file.
   * Reports parse/validation failures to the user and the console, then skips
   * the file. Conflicting tokens trigger a single batched confirm.
   * @param {string} name - The catalog file name.
   * @returns {Promise<void>}
   */
  async function loadFile(name) {
    let entries;
    try {
      const json = await fetchCatalogFile(CATALOG_BASE_URL, name);
      entries = validateCatalog(json);
    } catch (err) {
      console.error(err);
      alert(`Could not import ${name}: ${err.message}`);
      return;
    }
    const existing = catalog.getEntries();
    const conflicts = findConflicts(existing, entries);
    let replace = true;
    if (conflicts.length > 0) {
      replace = confirm(
        `${name}: ${conflicts.length} token(s) already exist. ` +
          `Replace them with the new versions? (Cancel keeps the existing ones.)`,
      );
    }
    await catalog.replaceAll(mergeEntries(existing, entries, replace));
  }

  /**
   * Fetch the remote listing and render a checkbox per available file plus a
   * "Load selected" button that imports the checked files in order.
   * @returns {Promise<void>}
   */
  async function showFiles() {
    filesEl.replaceChildren();
    let files;
    try {
      files = await listCatalogFiles(CATALOG_BASE_URL);
    } catch (err) {
      console.error(err);
      alert(`Could not list catalog files: ${err.message}`);
      return;
    }
    if (files.length === 0) {
      filesEl.textContent = "No catalog files found.";
      filesEl.hidden = false;
      return;
    }
    const checks = files.map((name) => {
      const label = document.createElement("label");
      label.className = "catalog-file";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = name;
      label.append(cb, document.createTextNode(" " + name));
      filesEl.appendChild(label);
      return cb;
    });
    const loadBtn = document.createElement("button");
    loadBtn.textContent = "Load selected";
    loadBtn.addEventListener("click", async () => {
      for (const cb of checks) {
        if (cb.checked) await loadFile(cb.value);
      }
      filesEl.replaceChildren();
      filesEl.hidden = true;
      refreshStats();
      onChange();
    });
    filesEl.appendChild(loadBtn);
    filesEl.hidden = false;
  }

  importBtn.addEventListener("click", showFiles);
  refreshStats();

  return { refreshStats };
}
```

- [ ] **Step 3: Wire the section into app.js**

In `www/js/app.js`, add the import:

```js
import { createCatalogSection } from "./ui/catalog-section.js";
```

After the `createOptionsMenu({ ... })` call, create the catalog section:

```js
  createCatalogSection({ catalog, onChange: render });
```

- [ ] **Step 4: Verify existing tests still pass**

Run: `npm test`
Expected: PASS — all suites green (no new Node tests; must not break existing ones).

- [ ] **Step 5: Manual verification (deployed origin)**

Because importing fetches the remote directory cross-origin, it only works from the deployed site (see Notes). After deploying this branch, open the app, open Options → Catalog, click **Import catalogs**, tick `series_29.json`, click **Load selected**, and confirm the entry count updates and matching rows show their catalog text. Re-importing the same file should trigger the duplicate-token confirm.

- [ ] **Step 6: Commit**

```bash
git add www/index.html www/js/ui/catalog-section.js www/js/app.js
git commit -m "feat: catalog import UI in the options overlay

Adds a Catalog options group that lists remote .json files, imports the
selected ones, resolves duplicate tokens with a batched confirm, and
reports parse/validation errors.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Service worker cache update

**Files:**
- Modify: `www/sw.js`

**Interfaces:**
- Consumes: nothing.
- Produces: updated precache list and cache version.

- [ ] **Step 1: Add the new modules to the precache list and bump the cache**

In `www/sw.js`, change the cache name:

```js
const CACHE = "dms-v7";
```

Add these four entries to the `ASSETS` array (next to the related existing entries):

```js
  "js/catalog.js",
  "js/catalog-import.js",
  "js/util/catalog-match.js",
  "js/ui/catalog-section.js",
```

(Do **not** add the `data/` directory — catalog listings/files are fetched fresh with `cache: "no-store"` and must not be precached.)

- [ ] **Step 2: Verify the full suite and a clean load**

Run: `npm test`
Expected: PASS — every suite green.

Then run `npm run serve`, hard-reload `http://localhost:8000`, and confirm in DevTools → Application → Service Workers that `dms-v7` is active and the app loads with no console errors.

- [ ] **Step 3: Commit**

```bash
git add www/sw.js
git commit -m "chore: precache catalog modules and bump SW cache to v7

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Notes

- **Local-dev import caveat:** `listCatalogFiles`/`fetchCatalogFile` hit `https://srv346879.hstgr.cloud/app/data/` cross-origin when the app is served from `localhost`; nginx's autoindex sends no CORS headers, so import only works from the deployed site. Unit tests inject a fake `fetch` and are unaffected. Display substitution (Task 5) can be verified locally by seeding the catalog store from the console.
- **`svg`/`png`** are validated and stored but never rendered — reserved for a future feature.
- After merging to `main` and deploying, the bumped `dms-v7` cache forces clients to refresh.
