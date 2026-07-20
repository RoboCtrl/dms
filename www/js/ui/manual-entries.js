/**
 * Manual catalog-entry editor inside the Manage Database overlay. Renders a
 * growing list of token/display-text input pairs: typing a token into the last
 * row appends a fresh empty row below it, up to a fixed maximum. The "Add
 * entries" button writes the filled rows into the catalog and resets the editor
 * to a single empty row.
 */
import {
  MAX_MANUAL_ROWS,
  buildManualEntries,
  mergeManualEntries,
} from "../util/manual-catalog.js";

/**
 * Create the manual-entry editor controller and wire its DOM.
 * @param {object} opts
 * @param {object} opts.catalog - The catalog model instance.
 * @param {() => void} opts.onChange - Called after entries are added so the
 *   overlay re-renders its lists and the app refreshes its stats readouts.
 * @returns {{reset: () => void}} Controller exposing a reset for reopening.
 */
export function createManualEntries({ catalog, onChange }) {
  const rowsEl = document.getElementById("manual-entries");
  const limitEl = document.getElementById("manual-entries-limit");
  const addBtn = document.getElementById("manual-entries-add");

  /**
   * Build one editor row: a token field on the left, a display-text field on
   * the right.
   * @returns {HTMLDivElement} The row element.
   */
  function buildRow() {
    const row = document.createElement("div");
    row.className = "manual-row";
    const token = document.createElement("input");
    token.type = "text";
    token.className = "manual-token";
    token.placeholder = "Token";
    token.setAttribute("aria-label", "Catalog token");
    const text = document.createElement("input");
    text.type = "text";
    text.className = "manual-text";
    text.placeholder = "Display text";
    text.setAttribute("aria-label", "Display text");
    row.append(token, text);
    return row;
  }

  /**
   * Read the current row values in document order.
   * @returns {Array<{token:string, text:string}>} The raw row values.
   */
  function readRows() {
    return [...rowsEl.children].map((row) => ({
      token: row.querySelector(".manual-token").value,
      text: row.querySelector(".manual-text").value,
    }));
  }

  /**
   * Keep exactly one trailing empty row: append one when the last row has a
   * token, and drop surplus empty rows when a token is cleared again. At the
   * row maximum no further row is added and the limit notice is shown instead.
   */
  function syncRows() {
    const rows = () => [...rowsEl.children];
    /**
     * Whether a row has neither a token nor a display text.
     * @param {HTMLElement} row - The row to inspect.
     * @returns {boolean} True when both fields are empty.
     */
    const isEmpty = (row) =>
      row.querySelector(".manual-token").value.trim() === "" &&
      row.querySelector(".manual-text").value.trim() === "";

    let list = rows();
    while (list.length > 1 && isEmpty(list[list.length - 1]) &&
           isEmpty(list[list.length - 2])) {
      list[list.length - 1].remove();
      list = rows();
    }
    const atLimit = list.length >= MAX_MANUAL_ROWS;
    if (!atLimit && (list.length === 0 || !isEmpty(list[list.length - 1]))) {
      rowsEl.appendChild(buildRow());
    }
    limitEl.hidden = rowsEl.children.length < MAX_MANUAL_ROWS;
  }

  /** Clear the editor back to a single empty row. */
  function reset() {
    rowsEl.replaceChildren(buildRow());
    limitEl.hidden = true;
  }

  rowsEl.addEventListener("input", syncRows);

  addBtn.addEventListener("click", async () => {
    const entries = buildManualEntries(readRows());
    if (entries.length === 0) return;
    await catalog.replaceAll(mergeManualEntries(catalog.getEntries(), entries));
    reset();
    onChange();
  });

  reset();
  return { reset };
}
