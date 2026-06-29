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
