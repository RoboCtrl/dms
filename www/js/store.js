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
