import {
  CATALOG_BASE_URL,
  listCatalogFiles,
  fetchCatalogFile,
  fetchText,
  validateCatalog,
  findConflicts,
  mergeEntries,
} from "../catalog-import.js";
import { showToast } from "./toast.js";
import { createPreviewOverlay } from "./preview-overlay.js";

/**
 * Create the catalog options section. Owns the "Catalog" group in the options
 * overlay: an entry-count readout, an "Import catalogs" button that lists the
 * remote .json files, the per-file load flow (fetch, validate, resolve
 * duplicate tokens via a batched confirm, persist), and a "Clear catalog"
 * action guarded by a confirmation prompt. Import results and failures are
 * reported via toasts instead of alerts.
 * @param {object} opts
 * @param {object} opts.catalog - The in-memory catalog model.
 * @param {() => void} opts.onChange - Called after the catalog changes so the app re-renders.
 * @returns {{refreshStats: () => void}}
 */
export function createCatalogSection({ catalog, onChange }) {
  const importBtn = document.getElementById("catalog-import-btn");
  const statsEl = document.getElementById("catalog-stats");
  const filesEl = document.getElementById("catalog-files");
  const clearBtn = document.getElementById("catalog-clear-btn");
  const preview = createPreviewOverlay();

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
      showToast(`Could not import ${name}: ${err?.message ?? String(err)}`, {
        error: true,
      });
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
    showToast(`Imported ${name} — ${entries.length} entries`);
  }

  /**
   * Fetch the remote listing and render a checkbox per available file plus a
   * "Load selected" button that imports the checked files in order.
   * @returns {Promise<void>}
   */
  async function showFiles() {
    importBtn.disabled = true;
    filesEl.replaceChildren();
    let files;
    try {
      files = await listCatalogFiles(CATALOG_BASE_URL);
    } catch (err) {
      console.error(err);
      showToast(`Could not list catalog files: ${err?.message ?? String(err)}`, {
        error: true,
      });
      importBtn.disabled = false;
      return;
    }
    if (files.length === 0) {
      filesEl.textContent = "No catalog files found.";
      filesEl.hidden = false;
      importBtn.disabled = false;
      return;
    }
    const checks = files.map((name) => {
      const row = document.createElement("div");
      row.className = "catalog-file";
      const label = document.createElement("label");
      label.className = "catalog-file-label";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = name;
      label.append(cb, document.createTextNode(" " + name));
      row.appendChild(label);
      const pvBtn = document.createElement("button");
      pvBtn.type = "button";
      pvBtn.className = "catalog-preview-btn";
      pvBtn.textContent = "Preview";
      pvBtn.addEventListener("click", async () => {
        pvBtn.disabled = true;
        try {
          preview.open(name, await fetchText(CATALOG_BASE_URL + name));
        } catch (err) {
          console.error(err);
          showToast(`Could not preview ${name}: ${err?.message ?? String(err)}`, {
            error: true,
          });
        }
        pvBtn.disabled = false;
      });
      row.appendChild(pvBtn);
      filesEl.appendChild(row);
      return cb;
    });
    const loadBtn = document.createElement("button");
    loadBtn.textContent = "Load selected";
    loadBtn.addEventListener("click", async () => {
      loadBtn.disabled = true;
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
    importBtn.disabled = false;
  }

  importBtn.addEventListener("click", showFiles);
  clearBtn.addEventListener("click", async () => {
    if (!confirm("Delete all catalog entries? This cannot be undone.")) return;
    await catalog.clear();
    refreshStats();
    onChange();
  });
  refreshStats();

  return { refreshStats };
}
