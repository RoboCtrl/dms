/**
 * IndexedDB persistence layer for scan records and catalog entries. Owns the database connection
 * and exposes async CRUD plus size estimation. Knows nothing about the DOM.
 * A scan record is `{ id: number, content: string, timestamp: number }`.
 * A catalog record is `{ id: number, token: string, rn?: number, text?: string, svg?: string, png?: string }`.
 */

const DB_NAME = "dms";
const STORE = "scans";
const CATALOG = "catalog";
const VERSION = 2;

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
      if (!idb.objectStoreNames.contains(CATALOG)) {
        const cat = idb.createObjectStore(CATALOG, {
          keyPath: "id",
          autoIncrement: true,
        });
        cat.createIndex("byToken", "token", { unique: true });
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
