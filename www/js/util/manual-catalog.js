/**
 * Pure helpers for the manual catalog-entry rows in the Manage Database
 * overlay. Turns raw {token, text} input pairs into catalog records and merges
 * them into an existing entry set. Kept DOM-free so it stays unit-testable.
 */

/** Maximum number of manual entry rows shown at once. */
export const MAX_MANUAL_ROWS = 100;

/**
 * Convert raw input rows into catalog records. Rows whose token is empty (or
 * whitespace only) are dropped, tokens and texts are trimmed, and a blank text
 * is omitted entirely. Every produced record carries `rn: -1` to mark it as
 * manually added rather than imported from a catalog file. When the same token
 * appears in several rows the last one wins, so tokens stay unique.
 * @param {Array<{token:string, text:string}>} rows - The raw row values.
 * @returns {Array<{token:string, rn:number, text?:string}>} The catalog records.
 */
export function buildManualEntries(rows) {
  const byToken = new Map();
  for (const row of rows) {
    const token = typeof row?.token === "string" ? row.token.trim() : "";
    if (token === "") continue;
    const text = typeof row?.text === "string" ? row.text.trim() : "";
    const entry = { token, rn: -1 };
    if (text !== "") entry.text = text;
    byToken.set(token, entry);
  }
  return [...byToken.values()];
}

/**
 * Merge manual records into the existing catalog entries. A manual record whose
 * token already exists replaces that entry in place (keeping its position in the
 * list); the remaining manual records are appended in order. The inputs are not
 * mutated.
 * @param {Array<object>} existing - The current catalog entries.
 * @param {Array<{token:string}>} manual - The records to merge in.
 * @returns {Array<object>} The merged entry set.
 */
export function mergeManualEntries(existing, manual) {
  const pending = new Map(manual.map((e) => [e.token, e]));
  const merged = existing.map((entry) => {
    const replacement = pending.get(entry.token);
    if (!replacement) return entry;
    pending.delete(entry.token);
    return replacement;
  });
  return [...merged, ...pending.values()];
}
