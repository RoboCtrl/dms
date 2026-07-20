/**
 * Manage Database overlay: lists every scan record and every catalog entry
 * with a checkbox each, supports deleting the selected rows, and offers
 * confirm-guarded clear-all actions per section. Replaces the former
 * "Clear database" and "Clear catalog" buttons.
 */
import { formatTimestamp } from "../util/format.js";
import { setIcon } from "../util/icon.js";
import { createManualEntries } from "./manual-entries.js";

/**
 * Create the Manage Database controller. Wires the #manage-db-btn opener in
 * the options menu and the overlay's own controls.
 * @param {object} opts
 * @param {object} opts.store - The scan-history store instance.
 * @param {object} opts.catalog - The catalog model instance.
 * @param {() => void} opts.onChange - Called after any deletion so the app
 *   re-renders and refreshes stats readouts.
 * @returns {{open: () => void}}
 */
export function createManageDb({ store, catalog, onChange }) {
  const overlay = document.getElementById("manage-db");
  const openBtn = document.getElementById("manage-db-btn");
  const closeBtn = document.getElementById("manage-db-close");
  const scansEl = document.getElementById("manage-scans");
  const scansDeleteBtn = document.getElementById("manage-scans-delete");
  const scansClearBtn = document.getElementById("manage-scans-clear");
  const catalogEl = document.getElementById("manage-catalog");
  const catalogDeleteBtn = document.getElementById("manage-catalog-delete");
  const catalogClearBtn = document.getElementById("manage-catalog-clear");

  setIcon(closeBtn, "x");

  /**
   * Build one selectable row.
   * @param {string} value - The checkbox value (record id or token).
   * @param {string} text - The main row text.
   * @param {string|null} detail - Optional secondary text (timestamp/text).
   * @returns {HTMLLabelElement} The row element.
   */
  function buildRow(value, text, detail) {
    const label = document.createElement("label");
    label.className = "manage-row";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = value;
    const textEl = document.createElement("span");
    textEl.className = "manage-text";
    textEl.textContent = text;
    label.append(cb, textEl);
    if (detail !== null) {
      const detailEl = document.createElement("span");
      detailEl.className = "manage-time";
      detailEl.textContent = detail;
      label.appendChild(detailEl);
    }
    return label;
  }

  /** Render the scan-record rows, newest first. */
  function renderScans() {
    scansEl.replaceChildren();
    for (const rec of store.getVisible(false, "none")) {
      scansEl.appendChild(
        buildRow(
          String(rec.id),
          catalog.displayFor(rec.content) ?? rec.content,
          formatTimestamp(rec.timestamp),
        ),
      );
    }
    if (scansEl.children.length === 0) scansEl.textContent = "No entries.";
  }

  /** Render the catalog-entry rows (token plus display text when present). */
  function renderCatalog() {
    catalogEl.replaceChildren();
    for (const entry of catalog.getEntries()) {
      catalogEl.appendChild(
        buildRow(entry.token, entry.token, entry.text ?? null),
      );
    }
    if (catalogEl.children.length === 0) catalogEl.textContent = "No entries.";
  }

  /**
   * Collect the values of all checked checkboxes inside a container.
   * @param {HTMLElement} container - The list container.
   * @returns {string[]} The checked values.
   */
  function checkedValues(container) {
    return [...container.querySelectorAll("input:checked")].map((cb) => cb.value);
  }

  /** Re-render both lists and notify the app. */
  function refresh() {
    renderScans();
    renderCatalog();
    onChange();
  }

  const manualEntries = createManualEntries({ catalog, onChange: refresh });

  /** Open the overlay with freshly rendered lists and an empty manual editor. */
  function open() {
    renderScans();
    renderCatalog();
    manualEntries.reset();
    overlay.hidden = false;
  }

  /** Close the overlay. */
  function close() {
    overlay.hidden = true;
  }

  openBtn.addEventListener("click", open);
  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  scansDeleteBtn.addEventListener("click", async () => {
    const ids = checkedValues(scansEl).map(Number);
    if (ids.length === 0) return;
    for (const id of ids) await store.deleteEntry(id);
    refresh();
  });

  scansClearBtn.addEventListener("click", async () => {
    if (!confirm("Delete all scanned entries? This cannot be undone.")) return;
    await store.clearAll();
    refresh();
  });

  catalogDeleteBtn.addEventListener("click", async () => {
    const tokens = new Set(checkedValues(catalogEl));
    if (tokens.size === 0) return;
    await catalog.replaceAll(
      catalog.getEntries().filter((e) => !tokens.has(e.token)),
    );
    refresh();
  });

  catalogClearBtn.addEventListener("click", async () => {
    if (!confirm("Delete all catalog entries? This cannot be undone.")) return;
    await catalog.clear();
    refresh();
  });

  return { open };
}
