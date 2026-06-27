# DMS Data Matrix Scanner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a pure client-side mobile web app that scans Data Matrix codes with the phone camera, decodes them, and keeps a local IndexedDB history with a scan-count, undo, themes, and offline PWA support.

**Architecture:** Vanilla JS with native ES modules and no build step. A `db.js` IndexedDB layer is wrapped by an in-memory `store.js` model that emits change events; UI modules render from the store. A `scanner.js` module owns the camera + a vendored ZXing-js decode loop and emits recognised codes. Pure logic (`util/format.js`, `store.js`, `db.js`, `settings.js`) is covered by `node:test`; DOM/camera behaviour is verified manually.

**Tech Stack:** HTML/CSS/ES modules, IndexedDB, `localStorage`, ZXing-js (`@zxing/library` 0.23.0, vendored UMD), Service Worker + Web App Manifest, `node:test` + `fake-indexeddb` (dev-only).

## Global Constraints

- Pure client-side only. No backend, no remote storage, no runtime CDN dependency (ZXing is vendored).
- Must run on Chrome and Firefox mobile, portrait orientation; camera needs a secure context (HTTPS or `localhost`).
- Code and comments in American English. Every function gets in-code doc comments (purpose, args, types, return).
- Decode **Data Matrix only** (`BarcodeFormat.DATA_MATRIX`).
- Themes: dark is default, light optional. Dim overlay colors: `#00000088` (dark) / `#cccccc80` (light).
- Scan flow: auto-store on recognition, tap camera panel to resume.
- Delete is a hard delete; undo history is one entry deep.
- Counter badge: bold, fixed-size box fitting two digits; white (dark) / black (light). Counts only non-deleted entries with identical content.
- Content text: bold, dark gray (light theme) / light gray (dark theme).
- Timestamp format: `YYYY-MM-DD hh:mm:ss`.
- Node >= 18 for tests. Test files live under `test/`, named `*.test.js`.
- Active git branch: `dev-claude`. Commit after each task. Do not commit `node_modules/` or `claude-log/`.

---

### Task 1: Project scaffolding + test harness + `util/format.js`

**Files:**
- Create: `package.json`
- Create: `js/util/format.js`
- Test: `test/format.test.js`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `formatTimestamp(epochMs: number): string` → `"YYYY-MM-DD hh:mm:ss"` in local time.
  - `formatBytes(bytes: number): string` → `"0 kB"`, `"12.3 kB"`, `"1.4 MB"` (kB below 1 MB, else MB, 1 decimal).

- [ ] **Step 1: Add node_modules to .gitignore**

Append to `.gitignore` (file currently contains `claude-log/`):

```
node_modules/
```

- [ ] **Step 2: Create package.json**

Create `package.json`:

```json
{
  "name": "dms",
  "version": "0.1.0",
  "description": "Client-side Data Matrix scanner web app.",
  "type": "module",
  "private": true,
  "scripts": {
    "test": "node --test",
    "serve": "python3 -m http.server 8000"
  },
  "devDependencies": {
    "fake-indexeddb": "^6.0.0"
  }
}
```

- [ ] **Step 3: Install dev dependency**

Run: `npm install`
Expected: creates `node_modules/` and `package-lock.json`, installs `fake-indexeddb`.

- [ ] **Step 4: Write the failing test**

Create `test/format.test.js`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatTimestamp, formatBytes } from "../js/util/format.js";

test("formatTimestamp pads to YYYY-MM-DD hh:mm:ss", () => {
  // Local-time construction so the assertion is timezone-independent.
  const ms = new Date(2026, 0, 5, 9, 3, 7).getTime();
  assert.equal(formatTimestamp(ms), "2026-01-05 09:03:07");
});

test("formatBytes uses kB below 1 MB", () => {
  assert.equal(formatBytes(0), "0 kB");
  assert.equal(formatBytes(12345), "12.3 kB");
});

test("formatBytes uses MB at or above 1 MB", () => {
  assert.equal(formatBytes(1_400_000), "1.4 MB");
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find module `../js/util/format.js`.

- [ ] **Step 6: Implement util/format.js**

Create `js/util/format.js`:

```javascript
/**
 * Zero-pad a number to a minimum width.
 * @param {number} n - The value to pad.
 * @param {number} [width=2] - Minimum number of digits.
 * @returns {string} The zero-padded string.
 */
function pad(n, width = 2) {
  return String(n).padStart(width, "0");
}

/**
 * Format an epoch-millisecond timestamp as a local-time
 * "YYYY-MM-DD hh:mm:ss" string for display in the history list.
 * @param {number} epochMs - Timestamp in milliseconds since the epoch.
 * @returns {string} The formatted local timestamp.
 */
export function formatTimestamp(epochMs) {
  const d = new Date(epochMs);
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  return `${date} ${time}`;
}

/**
 * Format a byte count for the database-size readout, using kB below 1 MB and
 * MB at or above 1 MB, rounded to one decimal place.
 * @param {number} bytes - Number of bytes.
 * @returns {string} A human-readable size string, e.g. "12.3 kB" or "1.4 MB".
 */
export function formatBytes(bytes) {
  const KB = 1000;
  const MB = 1000 * 1000;
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)} MB`;
  if (bytes === 0) return "0 kB";
  return `${(bytes / KB).toFixed(1)} kB`;
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test`
Expected: PASS — all three tests green.

- [ ] **Step 8: Commit**

```bash
git add .gitignore package.json package-lock.json js/util/format.js test/format.test.js
git commit -m "Add test harness and formatting utilities"
```

---

### Task 2: IndexedDB layer `js/db.js`

**Files:**
- Create: `js/db.js`
- Test: `test/db.test.js`

**Interfaces:**
- Consumes: nothing (uses the global `indexedDB`; `navigator.storage` when available).
- Produces (a record is `{ id: number, content: string, timestamp: number }`):
  - `add(content: string, timestamp: number): Promise<Record>` — resolves with the stored record including its new `id`.
  - `getAll(): Promise<Record[]>` — all records ascending by `id`.
  - `deleteById(id: number): Promise<void>`
  - `clear(): Promise<void>`
  - `approxBytes(records: Record[]): number` — UTF-8 byte size of the records as JSON (pure).
  - `estimateSize(): Promise<{ count: number, bytes: number }>` — `count` from `getAll`; `bytes` from `navigator.storage.estimate().usage` when available, else `approxBytes(getAll())`.
  - `__resetForTests(): Promise<void>` — closes and deletes the database (test helper).

- [ ] **Step 1: Write the failing test**

Create `test/db.test.js`:

```javascript
import "fake-indexeddb/auto";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as db from "../js/db.js";

beforeEach(async () => {
  await db.__resetForTests();
});

test("add returns a record with an id and getAll returns it", async () => {
  const rec = await db.add("HELLO", 1000);
  assert.equal(typeof rec.id, "number");
  assert.equal(rec.content, "HELLO");
  assert.equal(rec.timestamp, 1000);
  const all = await db.getAll();
  assert.equal(all.length, 1);
  assert.deepEqual(all[0], rec);
});

test("deleteById removes only the target record", async () => {
  const a = await db.add("A", 1);
  await db.add("B", 2);
  await db.deleteById(a.id);
  const all = await db.getAll();
  assert.deepEqual(all.map((r) => r.content), ["B"]);
});

test("clear removes all records", async () => {
  await db.add("A", 1);
  await db.add("B", 2);
  await db.clear();
  assert.equal((await db.getAll()).length, 0);
});

test("approxBytes counts UTF-8 JSON size and grows with data", () => {
  const small = db.approxBytes([{ id: 1, content: "A", timestamp: 1 }]);
  const big = db.approxBytes([{ id: 1, content: "AAAAA", timestamp: 1 }]);
  assert.ok(small > 0);
  assert.ok(big > small);
});

test("estimateSize falls back to approxBytes without StorageManager", async () => {
  await db.add("HELLO", 1);
  const { count, bytes } = await db.estimateSize();
  assert.equal(count, 1);
  assert.ok(bytes > 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find module `../js/db.js`.

- [ ] **Step 3: Implement js/db.js**

Create `js/db.js`:

```javascript
/**
 * IndexedDB persistence layer for scan records. Owns the database connection
 * and exposes async CRUD plus size estimation. Knows nothing about the DOM.
 * A record is `{ id: number, content: string, timestamp: number }`.
 */

const DB_NAME = "dms";
const STORE = "scans";
const VERSION = 1;

let dbPromise = null;

/**
 * Open (and memoize) the IndexedDB database, creating the object store and
 * the content index on first run.
 * @returns {Promise<IDBDatabase>} The open database connection.
 */
function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const idb = req.result;
      if (!idb.objectStoreNames.contains(STORE)) {
        const store = idb.createObjectStore(STORE, {
          keyPath: "id",
          autoIncrement: true,
        });
        store.createIndex("byContent", "content", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

/**
 * Run a callback inside a transaction on the scans store and resolve when the
 * transaction completes.
 * @param {IDBTransactionMode} mode - "readonly" or "readwrite".
 * @param {(store: IDBObjectStore) => void} fn - Receives the object store.
 * @returns {Promise<void>} Resolves on transaction completion.
 */
async function withStore(mode, fn) {
  const idb = await openDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(STORE, mode);
    fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/**
 * Add a scan record and resolve with the stored record including its new id.
 * @param {string} content - The decoded Data Matrix content.
 * @param {number} timestamp - Epoch milliseconds when the scan occurred.
 * @returns {Promise<{id: number, content: string, timestamp: number}>}
 */
export async function add(content, timestamp) {
  const idb = await openDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(STORE, "readwrite");
    const req = tx.objectStore(STORE).add({ content, timestamp });
    req.onsuccess = () => resolve({ id: req.result, content, timestamp });
    req.onerror = () => reject(req.error);
  });
}

/**
 * Get all scan records ascending by id.
 * @returns {Promise<Array<{id: number, content: string, timestamp: number}>>}
 */
export async function getAll() {
  const idb = await openDB();
  return new Promise((resolve, reject) => {
    const req = idb.transaction(STORE, "readonly").objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Delete a single scan record by id (hard delete).
 * @param {number} id - The record id to remove.
 * @returns {Promise<void>}
 */
export async function deleteById(id) {
  return withStore("readwrite", (store) => store.delete(id));
}

/**
 * Remove every scan record.
 * @returns {Promise<void>}
 */
export async function clear() {
  return withStore("readwrite", (store) => store.clear());
}

/**
 * Compute the approximate UTF-8 byte size of a set of records serialized as
 * JSON. Used as a fallback when the StorageManager API is unavailable.
 * @param {Array<object>} records - The records to measure.
 * @returns {number} Byte length of the JSON encoding.
 */
export function approxBytes(records) {
  return new TextEncoder().encode(JSON.stringify(records)).length;
}

/**
 * Estimate database usage for the options panel: the entry count plus a byte
 * size from the StorageManager API when available, otherwise an approximation
 * derived from the stored records.
 * @returns {Promise<{count: number, bytes: number}>}
 */
export async function estimateSize() {
  const records = await getAll();
  let bytes = approxBytes(records);
  if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
    try {
      const est = await navigator.storage.estimate();
      if (typeof est.usage === "number") bytes = est.usage;
    } catch {
      // Keep the approximation on failure.
    }
  }
  return { count: records.length, bytes };
}

/**
 * Close and delete the database. Test-only helper for isolating cases.
 * @returns {Promise<void>}
 */
export async function __resetForTests() {
  if (dbPromise) {
    (await dbPromise).close();
    dbPromise = null;
  }
  await new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — all `db.test.js` cases green.

- [ ] **Step 5: Commit**

```bash
git add js/db.js test/db.test.js
git commit -m "Add IndexedDB persistence layer"
```

---

### Task 3: In-memory model `js/store.js`

**Files:**
- Create: `js/store.js`
- Test: `test/store.test.js`

**Interfaces:**
- Consumes: `db` module from Task 2 (injected, so tests can supply the real db over fake-indexeddb).
- Produces: `createStore(db): Store` where `Store` has:
  - `load(): Promise<void>` — load all records into the in-memory mirror.
  - `recordScan(content: string): Promise<Record>` — persist with `Date.now()`, add to mirror, emit `change`.
  - `deleteEntry(id: number): Promise<void>` — remove from db + mirror, remember as last-deleted, emit `change`.
  - `undo(): Promise<void>` — re-add the last-deleted record's content+timestamp, clear it, emit `change`.
  - `clearAll(): Promise<void>` — clear db + mirror + last-deleted + highlights, emit `change`.
  - `getVisible(hideDuplicates: boolean): Record[]` — newest first; when hiding, only the newest record per content.
  - `countFor(content: string): number` — number of mirror records with identical content.
  - `toggleHighlight(id: number): void`, `isHighlighted(id: number): boolean` — session-only, emit `change`.
  - `canUndo(): boolean`
  - `on(event: "change", cb: () => void): void`

- [ ] **Step 1: Write the failing test**

Create `test/store.test.js`:

```javascript
import "fake-indexeddb/auto";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as db from "../js/db.js";
import { createStore } from "../js/store.js";

beforeEach(async () => {
  await db.__resetForTests();
});

test("recordScan adds entries and getVisible returns newest first", async () => {
  const store = createStore(db);
  await store.load();
  await store.recordScan("A");
  await store.recordScan("B");
  assert.deepEqual(store.getVisible(false).map((r) => r.content), ["B", "A"]);
});

test("countFor counts identical non-deleted entries", async () => {
  const store = createStore(db);
  await store.load();
  await store.recordScan("X");
  await store.recordScan("X");
  await store.recordScan("Y");
  assert.equal(store.countFor("X"), 2);
  assert.equal(store.countFor("Y"), 1);
});

test("deleteEntry lowers the count and undo restores it", async () => {
  const store = createStore(db);
  await store.load();
  await store.recordScan("X");
  const second = await store.recordScan("X");
  await store.deleteEntry(second.id);
  assert.equal(store.countFor("X"), 1);
  assert.ok(store.canUndo());
  await store.undo();
  assert.equal(store.countFor("X"), 2);
  assert.equal(store.canUndo(), false);
});

test("getVisible(true) hides duplicates keeping the newest", async () => {
  const store = createStore(db);
  await store.load();
  await store.recordScan("X");
  await store.recordScan("Y");
  await store.recordScan("X");
  const visible = store.getVisible(true).map((r) => r.content);
  assert.deepEqual(visible, ["X", "Y"]);
});

test("toggleHighlight is session-only and reversible", async () => {
  const store = createStore(db);
  await store.load();
  const rec = await store.recordScan("X");
  assert.equal(store.isHighlighted(rec.id), false);
  store.toggleHighlight(rec.id);
  assert.equal(store.isHighlighted(rec.id), true);
  store.toggleHighlight(rec.id);
  assert.equal(store.isHighlighted(rec.id), false);
});

test("change event fires on recordScan", async () => {
  const store = createStore(db);
  await store.load();
  let fired = 0;
  store.on("change", () => {
    fired += 1;
  });
  await store.recordScan("X");
  assert.equal(fired, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find module `../js/store.js`.

- [ ] **Step 3: Implement js/store.js**

Create `js/store.js`:

```javascript
/**
 * In-memory model of the scan history. Mirrors the persisted records, derives
 * per-content counts and the de-duplicated view, tracks session-only highlight
 * selection and a one-deep undo buffer, and emits "change" events for the UI.
 * Depends only on an injected db module (Task 2's interface).
 */

/**
 * Create a store bound to a persistence module.
 * @param {object} db - Persistence module exposing add/getAll/deleteById/clear.
 * @returns {object} The store instance.
 */
export function createStore(db) {
  /** @type {Array<{id:number, content:string, timestamp:number}>} */
  let records = [];
  /** @type {Set<number>} */
  const highlighted = new Set();
  /** @type {{content:string, timestamp:number} | null} */
  let lastDeleted = null;
  const listeners = [];

  /** Notify all "change" subscribers. */
  function emit() {
    for (const cb of listeners) cb();
  }

  return {
    /**
     * Load all persisted records into the in-memory mirror, ascending by id.
     * @returns {Promise<void>}
     */
    async load() {
      records = await db.getAll();
    },

    /**
     * Persist a new scan with the current time, mirror it, and emit change.
     * @param {string} content - Decoded Data Matrix content.
     * @returns {Promise<{id:number, content:string, timestamp:number}>}
     */
    async recordScan(content) {
      const rec = await db.add(content, Date.now());
      records.push(rec);
      emit();
      return rec;
    },

    /**
     * Hard-delete a record, remember it for undo, and emit change.
     * @param {number} id - The record id to delete.
     * @returns {Promise<void>}
     */
    async deleteEntry(id) {
      const idx = records.findIndex((r) => r.id === id);
      if (idx === -1) return;
      const [removed] = records.splice(idx, 1);
      highlighted.delete(id);
      lastDeleted = { content: removed.content, timestamp: removed.timestamp };
      await db.deleteById(id);
      emit();
    },

    /**
     * Re-insert the most recently deleted record (one-deep history).
     * @returns {Promise<void>}
     */
    async undo() {
      if (!lastDeleted) return;
      const rec = await db.add(lastDeleted.content, lastDeleted.timestamp);
      records.push(rec);
      lastDeleted = null;
      emit();
    },

    /**
     * Remove every record and reset highlight + undo state.
     * @returns {Promise<void>}
     */
    async clearAll() {
      await db.clear();
      records = [];
      highlighted.clear();
      lastDeleted = null;
      emit();
    },

    /**
     * Return records newest first. When hideDuplicates is true, only the newest
     * record of each distinct content is included.
     * @param {boolean} hideDuplicates - Whether to collapse duplicates.
     * @returns {Array<{id:number, content:string, timestamp:number}>}
     */
    getVisible(hideDuplicates) {
      const newestFirst = [...records].reverse();
      if (!hideDuplicates) return newestFirst;
      const seen = new Set();
      return newestFirst.filter((r) => {
        if (seen.has(r.content)) return false;
        seen.add(r.content);
        return true;
      });
    },

    /**
     * Count how many mirrored records share the exact given content.
     * @param {string} content - Content to count.
     * @returns {number} The number of identical records.
     */
    countFor(content) {
      return records.reduce((n, r) => n + (r.content === content ? 1 : 0), 0);
    },

    /**
     * Toggle the session-only highlight on a record and emit change.
     * @param {number} id - The record id to toggle.
     */
    toggleHighlight(id) {
      if (highlighted.has(id)) highlighted.delete(id);
      else highlighted.add(id);
      emit();
    },

    /**
     * Whether a record is currently highlighted.
     * @param {number} id - The record id.
     * @returns {boolean}
     */
    isHighlighted(id) {
      return highlighted.has(id);
    },

    /**
     * Whether an undo is currently available.
     * @returns {boolean}
     */
    canUndo() {
      return lastDeleted !== null;
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

Run: `npm test`
Expected: PASS — all `store.test.js` cases green.

- [ ] **Step 5: Commit**

```bash
git add js/store.js test/store.test.js
git commit -m "Add in-memory store model with counts, undo, and dedup"
```

---

### Task 4: Settings module `js/settings.js`

**Files:**
- Create: `js/settings.js`
- Test: `test/settings.test.js`

**Interfaces:**
- Consumes: a storage object with `getItem(key)`/`setItem(key, value)` (defaults to `localStorage`, injected in tests).
- Produces: `createSettings(storage): Settings` with:
  - `get(): { theme: "dark"|"light", hideDuplicates: boolean }` — defaults `{theme:"dark", hideDuplicates:false}`.
  - `setTheme(theme: "dark"|"light"): void`
  - `setHideDuplicates(value: boolean): void`

- [ ] **Step 1: Write the failing test**

Create `test/settings.test.js`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { createSettings } from "../js/settings.js";

/** Minimal in-memory Storage stub for tests. */
function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
  };
}

test("defaults to dark theme and duplicates shown", () => {
  const s = createSettings(fakeStorage());
  assert.deepEqual(s.get(), { theme: "dark", hideDuplicates: false });
});

test("persists theme and hideDuplicates across instances", () => {
  const storage = fakeStorage();
  const s1 = createSettings(storage);
  s1.setTheme("light");
  s1.setHideDuplicates(true);
  const s2 = createSettings(storage);
  assert.deepEqual(s2.get(), { theme: "light", hideDuplicates: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find module `../js/settings.js`.

- [ ] **Step 3: Implement js/settings.js**

Create `js/settings.js`:

```javascript
/**
 * Persistent user settings (theme, hide-duplicates) backed by a Storage-like
 * object. Defaults to localStorage but accepts an injected storage for tests.
 */

const KEY = "dms.settings";
const DEFAULTS = { theme: "dark", hideDuplicates: false };

/**
 * Create a settings accessor bound to a storage backend.
 * @param {{getItem:(k:string)=>string|null, setItem:(k:string,v:string)=>void}} [storage=localStorage]
 * @returns {object} The settings instance.
 */
export function createSettings(storage = localStorage) {
  /**
   * Read settings, merging stored values over defaults. Malformed JSON falls
   * back to defaults.
   * @returns {{theme:"dark"|"light", hideDuplicates:boolean}}
   */
  function get() {
    try {
      const raw = storage.getItem(KEY);
      if (!raw) return { ...DEFAULTS };
      return { ...DEFAULTS, ...JSON.parse(raw) };
    } catch {
      return { ...DEFAULTS };
    }
  }

  /**
   * Persist a partial update merged over current settings.
   * @param {Partial<{theme:"dark"|"light", hideDuplicates:boolean}>} patch
   */
  function update(patch) {
    storage.setItem(KEY, JSON.stringify({ ...get(), ...patch }));
  }

  return {
    get,
    /**
     * Set and persist the active theme.
     * @param {"dark"|"light"} theme
     */
    setTheme(theme) {
      update({ theme });
    },
    /**
     * Set and persist the hide-duplicates preference.
     * @param {boolean} value
     */
    setHideDuplicates(value) {
      update({ hideDuplicates: value });
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — both `settings.test.js` cases green.

- [ ] **Step 5: Commit**

```bash
git add js/settings.js test/settings.test.js
git commit -m "Add persistent settings module"
```

---

### Task 5: App shell — HTML + CSS theming + `js/theme.js`

This task has no automated tests (DOM/visual). It is verified manually in a desktop browser. ZXing and the scanner come later, so the camera area shows a placeholder for now.

**Files:**
- Create: `index.html`
- Create: `css/styles.css`
- Create: `js/theme.js`

**Interfaces:**
- Consumes: nothing yet (wired in Task 9).
- Produces:
  - DOM contract (IDs that later tasks bind to): `#camera-panel`, `#video`, `#overlay` (canvas), `#freeze` (canvas), `#scan-content`, `#menu-btn`, `#history`, `#bottom-bar`, `#undo-btn`, `#options`, `#options-close`, `#opt-theme` (select), `#opt-hide-dup` (checkbox), `#db-stats`, `#clear-db-btn`, `#camera-error`.
  - `applyTheme(theme: "dark"|"light"): void` in `js/theme.js` — sets `document.documentElement.dataset.theme`.

- [ ] **Step 1: Create index.html**

Create `index.html`:

```html
<!DOCTYPE html>
<html lang="en" data-theme="dark">
  <head>
    <meta charset="UTF-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
    />
    <meta name="theme-color" content="#121212" />
    <link rel="manifest" href="manifest.webmanifest" />
    <title>DMS — Data Matrix Scanner</title>
    <link rel="stylesheet" href="css/styles.css" />
  </head>
  <body>
    <main id="app">
      <!-- Top: camera + freeze overlay -->
      <section id="camera-panel">
        <video id="video" playsinline muted></video>
        <canvas id="freeze" hidden></canvas>
        <canvas id="overlay" hidden></canvas>
        <div id="scan-content" hidden></div>
        <div id="camera-error" hidden></div>
        <button id="menu-btn" aria-label="Options">&#9776;</button>
      </section>

      <!-- Bottom: scan history -->
      <section id="history" aria-label="Scan history"></section>

      <!-- Undo bar -->
      <footer id="bottom-bar" hidden>
        <button id="undo-btn">Undo delete</button>
      </footer>
    </main>

    <!-- Options overlay -->
    <div id="options" class="overlay" hidden>
      <div class="options-panel" role="dialog" aria-modal="true">
        <button id="options-close" aria-label="Close">&times;</button>
        <h2>Options</h2>

        <label class="opt-row">
          <span>Theme</span>
          <select id="opt-theme">
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </label>

        <label class="opt-row">
          <span>Hide duplicates</span>
          <input id="opt-hide-dup" type="checkbox" />
        </label>

        <section class="opt-group">
          <h3>Database</h3>
          <p id="db-stats">0 entries &middot; 0 kB</p>
          <button id="clear-db-btn">Clear database</button>
        </section>

        <section class="opt-group">
          <h3>About</h3>
          <p><a href="https://www.example.com" target="_blank" rel="noopener">www.example.com</a></p>
        </section>
      </div>
    </div>

    <script src="vendor/zxing/zxing.min.js"></script>
    <script type="module" src="js/app.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Create css/styles.css**

Create `css/styles.css`:

```css
/* Theme variables. Dark is the default; [data-theme="light"] overrides. */
:root,
[data-theme="dark"] {
  --bg: #121212;
  --panel: #1e1e1e;
  --row: #242424;
  --row-highlight: #3a3a00;
  --counter-fg: #ffffff;
  --content-fg: #cccccc;
  --timestamp-fg: #888888;
  --accent: #4caf50;
  --error: #ff6b6b;
  --overlay-dim: #00000088;
}

[data-theme="light"] {
  --bg: #fafafa;
  --panel: #ffffff;
  --row: #f0f0f0;
  --row-highlight: #fff7b0;
  --counter-fg: #000000;
  --content-fg: #333333;
  --timestamp-fg: #777777;
  --accent: #2e7d32;
  --error: #c62828;
  --overlay-dim: #cccccc80;
}

* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  height: 100%;
}

body {
  background: var(--bg);
  color: var(--content-fg);
  font-family: system-ui, sans-serif;
  overflow: hidden;
}

#app {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

/* --- Camera panel --- */
#camera-panel {
  position: relative;
  flex: 0 0 45%;
  background: #000;
  overflow: hidden;
}

#video,
#freeze,
#overlay {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

#scan-content {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 8px 12px;
  background: #000000aa;
  color: #fff;
  font-weight: bold;
  word-break: break-all;
}

#camera-error {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 16px;
  color: var(--error);
}

#menu-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  font-size: 24px;
  line-height: 1;
  background: #000000aa;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 6px 10px;
}

/* --- History --- */
#history {
  flex: 1 1 auto;
  overflow-y: auto;
  background: var(--panel);
}

.entry {
  display: grid;
  grid-template-columns: auto 1fr auto;
  grid-template-rows: auto auto;
  gap: 2px 10px;
  align-items: center;
  padding: 8px 10px;
  border-bottom: 1px solid #00000022;
  background: var(--row);
}

.entry.highlighted {
  background: var(--row-highlight);
}

.entry .counter {
  grid-row: 1 / 3;
  min-width: 2.2em;
  text-align: center;
  font-weight: bold;
  color: var(--counter-fg);
}

.entry .content {
  font-weight: bold;
  color: var(--content-fg);
  word-break: break-all;
}

.entry .timestamp {
  grid-column: 2;
  font-size: 0.75em;
  color: var(--timestamp-fg);
}

.entry .trash {
  grid-row: 1 / 3;
  background: none;
  border: none;
  color: var(--content-fg);
  font-size: 20px;
  height: 100%;
  padding: 0 8px;
}

/* --- Bottom bar --- */
#bottom-bar {
  flex: 0 0 auto;
}

#bottom-bar button {
  width: 100%;
  padding: 12px;
  background: var(--accent);
  color: #fff;
  border: none;
  font-weight: bold;
}

/* --- Options overlay --- */
.overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay-dim);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

.options-panel {
  position: relative;
  width: 88%;
  max-width: 420px;
  max-height: 80vh;
  overflow-y: auto;
  background: var(--panel);
  color: var(--content-fg);
  border-radius: 10px;
  padding: 16px;
}

#options-close {
  position: absolute;
  top: 8px;
  right: 8px;
  font-size: 22px;
  background: none;
  border: none;
  color: var(--content-fg);
}

.opt-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 12px 0;
}

.opt-group {
  border-top: 1px solid #80808044;
  margin-top: 12px;
  padding-top: 8px;
}

[hidden] {
  display: none !important;
}
```

- [ ] **Step 3: Create js/theme.js**

Create `js/theme.js`:

```javascript
/**
 * Apply a theme by setting the data-theme attribute on the document root.
 * CSS variables in styles.css respond to this attribute.
 * @param {"dark"|"light"} theme - The theme to activate.
 */
export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
}
```

- [ ] **Step 4: Create a temporary app.js stub so the page loads**

Create `js/app.js` (replaced fully in Task 9):

```javascript
import { applyTheme } from "./theme.js";

// Temporary bootstrap to verify the shell renders. Replaced in Task 9.
applyTheme("dark");
```

- [ ] **Step 5: Manually verify the shell**

Run: `npm run serve`
Then open `http://localhost:8000/` in a desktop browser.
Expected:
- Top ~45% is a black camera area with a hamburger button top-right.
- Bottom area is the (empty) history panel.
- Clicking the hamburger does nothing yet (wired in Task 9) — that is fine.
- No console errors except a possible 404 for the not-yet-vendored ZXing script and `manifest.webmanifest`; note them and continue.

- [ ] **Step 6: Commit**

```bash
git add index.html css/styles.css js/theme.js js/app.js
git commit -m "Add app shell, theming, and CSS layout"
```

---

### Task 6: History panel rendering `js/ui/history-panel.js`

No automated tests (DOM). Verified by driving the store from the browser console.

**Files:**
- Create: `js/ui/history-panel.js`

**Interfaces:**
- Consumes: `store` (Task 3), `formatTimestamp` (Task 1).
- Produces: `createHistoryPanel({ root, store, getHideDuplicates }): { render(): void }`
  - `root: HTMLElement` — the `#history` element.
  - `store` — the store instance.
  - `getHideDuplicates: () => boolean` — reads current setting.
  - Renders one `.entry` per visible record with counter, content, timestamp, trash button; wires trash click → `store.deleteEntry`, long-press (500 ms) → `store.toggleHighlight`.

- [ ] **Step 1: Implement js/ui/history-panel.js**

Create `js/ui/history-panel.js`:

```javascript
import { formatTimestamp } from "../util/format.js";

const LONG_PRESS_MS = 500;

/**
 * Create the history-panel renderer. Renders the visible scan entries and wires
 * per-entry interactions (delete via trash, highlight via long-press).
 * @param {object} opts
 * @param {HTMLElement} opts.root - Container element (#history).
 * @param {object} opts.store - The store instance (Task 3).
 * @param {() => boolean} opts.getHideDuplicates - Current hide-duplicates setting.
 * @returns {{render: () => void}}
 */
export function createHistoryPanel({ root, store, getHideDuplicates }) {
  /**
   * Build a single entry row element for a record.
   * @param {{id:number, content:string, timestamp:number}} rec
   * @returns {HTMLElement}
   */
  function buildEntry(rec) {
    const el = document.createElement("div");
    el.className = "entry" + (store.isHighlighted(rec.id) ? " highlighted" : "");
    el.dataset.id = String(rec.id);

    const counter = document.createElement("span");
    counter.className = "counter";
    counter.textContent = String(store.countFor(rec.content));

    const content = document.createElement("span");
    content.className = "content";
    content.textContent = rec.content;

    const ts = document.createElement("span");
    ts.className = "timestamp";
    ts.textContent = formatTimestamp(rec.timestamp);

    const trash = document.createElement("button");
    trash.className = "trash";
    trash.setAttribute("aria-label", "Delete entry");
    trash.textContent = "🗑"; // wastebasket
    trash.addEventListener("click", (e) => {
      e.stopPropagation();
      store.deleteEntry(rec.id);
    });

    attachLongPress(el, () => store.toggleHighlight(rec.id));

    el.append(counter, content, ts, trash);
    return el;
  }

  /**
   * Attach a long-press handler (pointer held LONG_PRESS_MS without moving).
   * @param {HTMLElement} el - Element to watch.
   * @param {() => void} onLongPress - Invoked when the press threshold is met.
   */
  function attachLongPress(el, onLongPress) {
    let timer = null;
    const clear = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };
    el.addEventListener("pointerdown", () => {
      clear();
      timer = setTimeout(() => {
        timer = null;
        onLongPress();
      }, LONG_PRESS_MS);
    });
    for (const ev of ["pointerup", "pointerleave", "pointermove", "pointercancel"]) {
      el.addEventListener(ev, clear);
    }
  }

  return {
    /** Re-render the full list from current store state. */
    render() {
      root.replaceChildren();
      for (const rec of store.getVisible(getHideDuplicates())) {
        root.appendChild(buildEntry(rec));
      }
    },
  };
}
```

- [ ] **Step 2: Manually verify rendering**

Add a temporary import in `js/app.js` only for this check, or use the browser console after Task 9. For an isolated check now, append to `js/app.js` (then revert before committing this task):

```javascript
import * as db from "./db.js";
import { createStore } from "./store.js";
import { createHistoryPanel } from "./ui/history-panel.js";

const store = createStore(db);
await store.load();
const panel = createHistoryPanel({
  root: document.getElementById("history"),
  store,
  getHideDuplicates: () => false,
});
store.on("change", () => panel.render());
window.__demo = { store, panel };
panel.render();
```

Run: `npm run serve`, open `http://localhost:8000/`, then in the console:
```javascript
await window.__demo.store.recordScan("HELLO-123");
await window.__demo.store.recordScan("HELLO-123");
```
Expected: two rows appear newest-first; both show counter `2`; long-pressing a row turns it highlighted; clicking the trash icon removes a row and the remaining identical row's counter drops to `1`.

- [ ] **Step 3: Revert the temporary app.js demo code**

Restore `js/app.js` to the Task 5 stub (the demo block is replaced wholesale in Task 9). Confirm `git diff js/app.js` shows no demo code.

- [ ] **Step 4: Commit**

```bash
git add js/ui/history-panel.js
git commit -m "Add history panel rendering with delete and long-press highlight"
```

---

### Task 7: Options menu + undo bar `js/ui/options-menu.js`, `js/ui/bottom-bar.js`

No automated tests (DOM). Verified manually.

**Files:**
- Create: `js/ui/options-menu.js`
- Create: `js/ui/bottom-bar.js`

**Interfaces:**
- Consumes: `store` (Task 3), `settings` (Task 4), `applyTheme` (Task 5), `formatBytes` (Task 1), `db.estimateSize` (Task 2).
- Produces:
  - `createOptionsMenu({ store, settings, onSettingsChange }): { open(): void }` — wires open/close, theme select, hide-duplicates checkbox, db stats refresh, and clear-database (with `confirm`). Calls `onSettingsChange()` after any setting changes so the app re-renders.
  - `createBottomBar({ store }): { render(): void }` — shows `#bottom-bar` with the undo button when `store.canUndo()`, hidden otherwise; undo button calls `store.undo()`.

- [ ] **Step 1: Implement js/ui/bottom-bar.js**

Create `js/ui/bottom-bar.js`:

```javascript
/**
 * Create the undo bottom-bar controller. The bar is visible only while an undo
 * is available; its button restores the last deleted entry.
 * @param {object} opts
 * @param {object} opts.store - The store instance (Task 3).
 * @returns {{render: () => void}}
 */
export function createBottomBar({ store }) {
  const bar = document.getElementById("bottom-bar");
  const btn = document.getElementById("undo-btn");
  btn.addEventListener("click", () => store.undo());

  return {
    /** Show or hide the bar based on undo availability. */
    render() {
      bar.hidden = !store.canUndo();
    },
  };
}
```

- [ ] **Step 2: Implement js/ui/options-menu.js**

Create `js/ui/options-menu.js`:

```javascript
import { applyTheme } from "../theme.js";
import { formatBytes } from "../util/format.js";
import * as db from "../db.js";

/**
 * Create the options-menu controller. Manages the overlay's open/close state
 * and wires the theme select, hide-duplicates toggle, database stats, and the
 * clear-database action (guarded by a confirmation prompt).
 * @param {object} opts
 * @param {object} opts.store - The store instance (Task 3).
 * @param {object} opts.settings - The settings instance (Task 4).
 * @param {() => void} opts.onSettingsChange - Called after any change so the app re-renders.
 * @returns {{open: () => void}}
 */
export function createOptionsMenu({ store, settings, onSettingsChange }) {
  const overlay = document.getElementById("options");
  const closeBtn = document.getElementById("options-close");
  const menuBtn = document.getElementById("menu-btn");
  const themeSel = document.getElementById("opt-theme");
  const hideDup = document.getElementById("opt-hide-dup");
  const stats = document.getElementById("db-stats");
  const clearBtn = document.getElementById("clear-db-btn");

  /** Refresh the database entry-count and size readout. */
  async function refreshStats() {
    const { count, bytes } = await db.estimateSize();
    stats.textContent = `${count} entries · ${formatBytes(bytes)}`;
  }

  /** Open the overlay, syncing controls to current settings + stats. */
  function open() {
    const s = settings.get();
    themeSel.value = s.theme;
    hideDup.checked = s.hideDuplicates;
    refreshStats();
    overlay.hidden = false;
  }

  /** Close the overlay. */
  function close() {
    overlay.hidden = true;
  }

  menuBtn.addEventListener("click", open);
  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  themeSel.addEventListener("change", () => {
    settings.setTheme(themeSel.value);
    applyTheme(themeSel.value);
    onSettingsChange();
  });

  hideDup.addEventListener("change", () => {
    settings.setHideDuplicates(hideDup.checked);
    onSettingsChange();
  });

  clearBtn.addEventListener("click", async () => {
    if (!confirm("Delete all scanned entries? This cannot be undone.")) return;
    await store.clearAll();
    await refreshStats();
    onSettingsChange();
  });

  return { open };
}
```

- [ ] **Step 3: Manually verify (after Task 9 wiring exists, or with a temporary harness)**

Defer interactive verification to Task 9's manual check, which exercises the menu and undo bar end to end. For now confirm there are no syntax errors:

Run: `node --check js/ui/options-menu.js && node --check js/ui/bottom-bar.js`
Expected: no output (exit 0).

- [ ] **Step 4: Commit**

```bash
git add js/ui/options-menu.js js/ui/bottom-bar.js
git commit -m "Add options menu and undo bottom bar controllers"
```

---

### Task 8: Camera + decode loop `js/scanner.js` + vendored ZXing

No automated tests (camera/DOM). Verified manually on desktop (localhost camera) and on a phone after deploy.

**Files:**
- Create: `vendor/zxing/zxing.min.js` (downloaded)
- Create: `js/scanner.js`

**Interfaces:**
- Consumes: the global `ZXing` (UMD), `#video`, `#freeze`, `#overlay`, `#scan-content`, `#camera-error`, `#camera-panel`.
- Produces: `createScanner({ onRecognized }): { start(): Promise<void> }`
  - `onRecognized(content: string): void` — called once per recognised code (after freeze).
  - Internally: starts the rear camera, runs a continuous Data-Matrix-only decode; on a hit freezes the frame, draws the highlight polygon, shows content, calls `onRecognized`; tapping `#camera-panel` resumes.

- [ ] **Step 1: Vendor the ZXing UMD bundle**

Run:
```bash
mkdir -p vendor/zxing
curl -L -o vendor/zxing/zxing.min.js https://cdn.jsdelivr.net/npm/@zxing/library@0.23.0/umd/index.min.js
```
Expected: `vendor/zxing/zxing.min.js` exists and is non-empty (~hundreds of KB). Verify the global name:
```bash
grep -o "self.ZXing" vendor/zxing/zxing.min.js | head -1
```
Expected: prints `self.ZXing` (confirms the UMD global is `ZXing`).

- [ ] **Step 2: Implement js/scanner.js**

Create `js/scanner.js`:

```javascript
/**
 * Camera + Data Matrix decode loop using the vendored ZXing-js UMD global.
 * Owns the live video stream, freezes the frame and draws a highlight polygon
 * on recognition, and resumes scanning when the camera panel is tapped. Emits
 * recognised content via the onRecognized callback.
 */

/* global ZXing */

/**
 * Create the scanner controller.
 * @param {object} opts
 * @param {(content: string) => void} opts.onRecognized - Called after a code is recognised and frozen.
 * @returns {{start: () => Promise<void>}}
 */
export function createScanner({ onRecognized }) {
  const panel = document.getElementById("camera-panel");
  const video = document.getElementById("video");
  const freeze = document.getElementById("freeze");
  const overlay = document.getElementById("overlay");
  const content = document.getElementById("scan-content");
  const errorBox = document.getElementById("camera-error");

  const hints = new Map();
  hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
    ZXing.BarcodeFormat.DATA_MATRIX,
  ]);
  const reader = new ZXing.BrowserMultiFormatReader(hints);

  let frozen = false;

  /**
   * Show a camera error message in place of the video.
   * @param {string} message - The message to display.
   */
  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
  }

  /**
   * Draw the frozen frame and a highlight polygon around the recognised code.
   * @param {Array<{getX:()=>number,getY:()=>number}>} points - ZXing result points (video-pixel coords).
   */
  function drawFreeze(points) {
    const w = video.videoWidth;
    const h = video.videoHeight;
    for (const c of [freeze, overlay]) {
      c.width = w;
      c.height = h;
      c.hidden = false;
    }
    freeze.getContext("2d").drawImage(video, 0, 0, w, h);

    const ctx = overlay.getContext("2d");
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = "#4caf50";
    ctx.lineWidth = Math.max(3, w * 0.01);
    ctx.beginPath();
    points.forEach((p, i) => {
      const x = p.getX();
      const y = p.getY();
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.stroke();
  }

  /** Resume live scanning by clearing the freeze and restarting decode. */
  async function resume() {
    if (!frozen) return;
    frozen = false;
    freeze.hidden = true;
    overlay.hidden = true;
    content.hidden = true;
    await startDecode();
  }

  /** Start the continuous decode loop on the rear camera. */
  async function startDecode() {
    try {
      await reader.decodeFromConstraints(
        { video: { facingMode: "environment" } },
        video,
        (result) => {
          if (!result || frozen) return;
          frozen = true;
          reader.reset();
          const text = result.getText();
          drawFreeze(result.getResultPoints());
          content.textContent = text;
          content.hidden = false;
          onRecognized(text);
        },
      );
    } catch (err) {
      showError(
        "Camera unavailable. Grant camera permission and use HTTPS or localhost. (" +
          (err?.name || err) +
          ")",
      );
    }
  }

  panel.addEventListener("click", () => {
    if (frozen) resume();
  });

  return {
    /** Start the scanner. */
    async start() {
      await startDecode();
    },
  };
}
```

- [ ] **Step 3: Manually verify decoding (desktop)**

Defer full verification to Task 9 where the scanner is wired to the store. After Task 9, run `npm run serve`, open `http://localhost:8000/` on a laptop with a webcam, grant camera permission, and hold a Data Matrix code to the camera.
Expected: frame freezes, a green polygon outlines the code, the decoded text appears at the bottom of the camera panel, and a new history row is added. Tapping the camera resumes scanning.

- [ ] **Step 4: Commit**

```bash
git add vendor/zxing/zxing.min.js js/scanner.js
git commit -m "Vendor ZXing and add camera decode loop with freeze and highlight"
```

---

### Task 9: App wiring `js/app.js`

No automated tests (integration/DOM). End-to-end manual verification of all interactions.

**Files:**
- Modify: `js/app.js` (replace the Task 5 stub entirely)

**Interfaces:**
- Consumes: `db`, `createStore`, `createSettings`, `applyTheme`, `createHistoryPanel`, `createOptionsMenu`, `createBottomBar`, `createScanner`.
- Produces: the running application; no exports.

- [ ] **Step 1: Replace js/app.js**

Create `js/app.js` (overwrite):

```javascript
/**
 * Application bootstrap. Wires persistence, the in-memory store, settings,
 * theming, the UI panels, and the scanner together, and re-renders the UI on
 * every store change.
 */
import * as db from "./db.js";
import { createStore } from "./store.js";
import { createSettings } from "./settings.js";
import { applyTheme } from "./theme.js";
import { createHistoryPanel } from "./ui/history-panel.js";
import { createOptionsMenu } from "./ui/options-menu.js";
import { createBottomBar } from "./ui/bottom-bar.js";
import { createScanner } from "./scanner.js";

/** Initialize and start the application. */
async function main() {
  const settings = createSettings();
  applyTheme(settings.get().theme);

  const store = createStore(db);
  await store.load();

  const history = createHistoryPanel({
    root: document.getElementById("history"),
    store,
    getHideDuplicates: () => settings.get().hideDuplicates,
  });
  const bottomBar = createBottomBar({ store });
  createOptionsMenu({
    store,
    settings,
    onSettingsChange: () => render(),
  });

  /** Re-render all store-driven UI. */
  function render() {
    history.render();
    bottomBar.render();
  }

  store.on("change", render);
  render();

  const scanner = createScanner({
    onRecognized: (content) => store.recordScan(content),
  });
  await scanner.start();
}

main();
```

- [ ] **Step 2: Register the service worker (added in Task 10)**

Leave a placeholder comment at the end of `main()` body is unnecessary; SW registration is added in Task 10 to avoid a missing-file error now.

- [ ] **Step 3: End-to-end manual verification (desktop)**

Run: `npm run serve`, open `http://localhost:8000/`, grant camera access.
Verify each:
- Scanning a Data Matrix freezes + highlights + shows content and adds a newest-first history row; tapping the camera resumes.
- Duplicate scans share the same counter value; deleting one lowers the others' counter.
- Deleting shows the undo bar; undo restores the row and hides the bar.
- Long-press highlights/unhighlights a row; multiple can be highlighted.
- Options: theme switch recolors immediately and persists on reload; hide-duplicates collapses duplicate rows; database stats show count + size; clear-database asks for confirmation then empties the list.

- [ ] **Step 4: Commit**

```bash
git add js/app.js
git commit -m "Wire store, settings, UI panels, and scanner into the app"
```

---

### Task 10: PWA — manifest + service worker

No automated tests. Verified via DevTools Application panel and an offline reload.

**Files:**
- Create: `manifest.webmanifest`
- Create: `sw.js`
- Create: `assets/icons/icon-192.png`, `assets/icons/icon-512.png`
- Modify: `js/app.js` (register the service worker)

**Interfaces:**
- Consumes: all app-shell files.
- Produces: an installable, offline-capable app.

- [ ] **Step 1: Create manifest.webmanifest**

Create `manifest.webmanifest`:

```json
{
  "name": "DMS — Data Matrix Scanner",
  "short_name": "DMS",
  "start_url": ".",
  "scope": ".",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#121212",
  "theme_color": "#121212",
  "icons": [
    { "src": "assets/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "assets/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Step 2: Generate placeholder icons**

Run:
```bash
mkdir -p assets/icons
python3 - <<'PY'
import struct, zlib
def png(path, size, rgb):
    def chunk(t, d):
        c = t + d
        return struct.pack(">I", len(d)) + c + struct.pack(">I", zlib.crc32(c) & 0xffffffff)
    raw = b"".join(b"\x00" + bytes(rgb) * size for _ in range(size))
    data = (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9))
            + chunk(b"IEND", b""))
    open(path, "wb").write(data)
png("assets/icons/icon-192.png", 192, (18, 18, 18))
png("assets/icons/icon-512.png", 512, (18, 18, 18))
PY
ls -l assets/icons/
```
Expected: two non-empty PNG files. (Replaceable with real artwork later.)

- [ ] **Step 3: Create sw.js**

Create `sw.js`:

```javascript
/**
 * Service worker providing an offline app shell. Caches core assets on install
 * and serves cache-first with a network fallback.
 */
const CACHE = "dms-v1";
const ASSETS = [
  ".",
  "index.html",
  "css/styles.css",
  "manifest.webmanifest",
  "js/app.js",
  "js/db.js",
  "js/store.js",
  "js/settings.js",
  "js/theme.js",
  "js/scanner.js",
  "js/util/format.js",
  "js/ui/history-panel.js",
  "js/ui/options-menu.js",
  "js/ui/bottom-bar.js",
  "vendor/zxing/zxing.min.js",
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request)),
  );
});
```

- [ ] **Step 4: Register the service worker in app.js**

Add to the end of `main()` in `js/app.js`, after `await scanner.start();`:

```javascript
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {
      // Offline support is optional; ignore registration failures.
    });
  }
```

- [ ] **Step 5: Manually verify PWA**

Run: `npm run serve`, open `http://localhost:8000/` in Chrome.
- DevTools → Application → Manifest: name, icons, standalone, portrait all present.
- DevTools → Application → Service Workers: `sw.js` activated.
- Toggle "Offline" in the Network panel and reload: the app shell still loads.

- [ ] **Step 6: Commit**

```bash
git add manifest.webmanifest sw.js assets/icons/icon-192.png assets/icons/icon-512.png js/app.js
git commit -m "Add PWA manifest, icons, and offline service worker"
```

---

### Task 11: Docs + on-device verification

**Files:**
- Create: `docs/README.md`
- Create: `docs/deployment.md`

- [ ] **Step 1: Write docs/README.md**

Create `docs/README.md` describing: what the app does; the module map (db/store/settings/theme/scanner/ui/app); how to run tests (`npm test`); how to serve locally (`npm run serve`, open `http://localhost:8000`); the secure-context requirement for camera access. Use prose matching the spec.

- [ ] **Step 2: Write docs/deployment.md**

Create `docs/deployment.md` describing static deployment (copy all files except `node_modules/`, `test/`, `claude-log/`, and dev config to any static HTTPS host such as GitHub Pages or Netlify) and noting that camera access requires HTTPS.

- [ ] **Step 3: Full test run**

Run: `npm test`
Expected: PASS — all suites green (`format`, `db`, `store`, `settings`).

- [ ] **Step 4: On-device verification**

Deploy to a static HTTPS host (or serve over LAN HTTPS), open on an Android phone in both Chrome and Firefox, portrait. Verify: camera permission prompt; Data Matrix recognition freezes + highlights + shows content + records a row; tap resumes; delete/undo; long-press highlight; options (theme, hide duplicates, db stats, clear); add to home screen and confirm it opens standalone and works offline after first load.

- [ ] **Step 5: Commit**

```bash
git add docs/README.md docs/deployment.md
git commit -m "Add project and deployment documentation"
```

---

## Self-Review

**Spec coverage:**
- No-backend pure static, Chrome/Firefox mobile, portrait — Tasks 5, 8, 11. ✓
- Vanilla JS / no build / ES modules — all tasks. ✓
- ZXing-js vendored, Data Matrix only — Task 8. ✓
- IndexedDB persistence; localStorage settings — Tasks 2, 4. ✓
- StorageManager size + count — Tasks 2, 7. ✓
- Auto-store, tap-to-resume — Task 8. ✓
- Hard delete + one-deep undo — Tasks 3, 7. ✓
- Counter semantics (identical non-deleted; independent of hide-dup) — Tasks 3, 6. ✓
- Camera freeze + highlight polygon + content overlay — Task 8. ✓
- Hamburger options button — Tasks 5, 7. ✓
- History row layout (counter/content/timestamp/full-height trash) — Tasks 5, 6. ✓
- Long-press highlight, multiple, visual-only, session-only — Tasks 3, 6. ✓
- Undo bottom bar (hidden unless undo available) — Tasks 5, 7. ✓
- Options overlay with dim colors, close x, theme, hide duplicates, db section w/ confirm clear, About link — Tasks 5, 7. ✓
- Dark default + light theme, specified colors — Task 5. ✓
- PWA installable + offline — Task 10. ✓
- Testing approach (node:test + fake-indexeddb, dev-only) — Tasks 1–4. ✓
- In-code docs for functions — every implementation step. ✓

**Placeholder scan:** No "TBD"/"implement later"/vague-handling steps; all code shown in full. Icons are real generated PNGs, not placeholders. ✓

**Type consistency:** `createStore(db)`, `createSettings(storage)`, `createScanner({onRecognized})`, `createHistoryPanel({root,store,getHideDuplicates})`, `createOptionsMenu({store,settings,onSettingsChange})`, `createBottomBar({store})` are used consistently in Task 9. Record shape `{id,content,timestamp}` consistent across db/store/ui. DOM IDs in Task 5 match all consumers. `db.estimateSize` returns `{count,bytes}` consumed in Task 7. ✓
