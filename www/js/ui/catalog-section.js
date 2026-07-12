import {
  CATALOG_BASE_URL,
  listCatalogFiles,
  fetchCatalogFile,
  fetchText,
  validateCatalog,
  findConflicts,
  mergeEntries,
  classifyImportBody,
  listingBaseUrl,
  urlDisplayName,
} from "../catalog-import.js";
import { showToast } from "./toast.js";
import { createPreviewOverlay } from "./preview-overlay.js";

/**
 * Create the catalog options section. Owns the "Catalog" group in the options
 * overlay: an entry-count readout, an "Import catalogs" button that lists the
 * remote .json files, a manual URL field that accepts either a directory
 * listing or a direct catalog file, and the per-file load flow (fetch,
 * validate, resolve duplicate tokens via a batched confirm, persist). The
 * "Clear catalog" action has moved to the Manage Database overlay. Import
 * results and failures are reported via toasts instead of alerts.
 * @param {object} opts
 * @param {object} opts.catalog - The in-memory catalog model.
 * @param {object} opts.settings - The settings accessor (for the persisted import URL).
 * @param {() => void} opts.onChange - Called after the catalog changes so the app re-renders.
 * @returns {{refreshStats: () => void}}
 */
export function createCatalogSection({ catalog, settings, onChange }) {
  const importBtn = document.getElementById("catalog-import-btn");
  const statsEl = document.getElementById("catalog-stats");
  const filesEl = document.getElementById("catalog-files");
  const urlInput = document.getElementById("catalog-url");
  const urlBtn = document.getElementById("catalog-url-btn");
  const preview = createPreviewOverlay();

  /** Update the catalog entry-count readout. */
  function refreshStats() {
    statsEl.textContent = `${catalog.getEntries().length} entries`;
  }

  /**
   * Validate a parsed catalog object, resolve duplicate tokens via a batched
   * confirm, persist the merge, and report the result as a toast.
   * @param {string} name - Display name of the source (file name or URL).
   * @param {object} json - The parsed catalog object.
   * @returns {Promise<boolean>} True when the import was applied.
   */
  async function importParsed(name, json) {
    let entries;
    try {
      entries = validateCatalog(json);
    } catch (err) {
      console.error(err);
      showToast(`Could not import ${name}: ${err?.message ?? String(err)}`, {
        error: true,
      });
      return false;
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
    return true;
  }

  /**
   * Fetch one catalog file from a directory and import it via importParsed.
   * Fetch and parse failures are reported as error toasts.
   * @param {string} baseUrl - Directory URL with trailing slash.
   * @param {string} name - The catalog file name.
   * @returns {Promise<void>}
   */
  async function loadFile(baseUrl, name) {
    let json;
    try {
      json = await fetchCatalogFile(baseUrl, name);
    } catch (err) {
      console.error(err);
      showToast(`Could not import ${name}: ${err?.message ?? String(err)}`, {
        error: true,
      });
      return;
    }
    await importParsed(name, json);
  }

  /**
   * Render a checkbox + Preview row per file plus a "Load selected" button
   * that imports the checked files, all fetched relative to baseUrl.
   * @param {string[]} files - The catalog file names.
   * @param {string} baseUrl - Directory URL with trailing slash.
   */
  function renderFileList(files, baseUrl) {
    filesEl.replaceChildren();
    if (files.length === 0) {
      filesEl.textContent = "No catalog files found.";
      filesEl.hidden = false;
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
          preview.open(name, await fetchText(baseUrl + name));
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
        if (cb.checked) await loadFile(baseUrl, cb.value);
      }
      filesEl.replaceChildren();
      filesEl.hidden = true;
      refreshStats();
      onChange();
    });
    filesEl.appendChild(loadBtn);
    filesEl.hidden = false;
  }

  /**
   * Fetch the default remote listing and show the file list.
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
    renderFileList(files, CATALOG_BASE_URL);
    importBtn.disabled = false;
  }

  importBtn.addEventListener("click", showFiles);
  urlBtn.addEventListener("click", async () => {
    const url = urlInput.value.trim();
    if (url === "") {
      showToast("Enter a URL first.", { error: true });
      return;
    }
    urlBtn.disabled = true;
    try {
      const body = classifyImportBody(await fetchText(url));
      if (body.kind === "catalog") {
        const applied = await importParsed(urlDisplayName(url), body.json);
        if (applied) {
          settings.setImportUrl(url);
          refreshStats();
          onChange();
        }
      } else if (body.files.length === 0) {
        showToast("No catalog files found at this URL.", { error: true });
      } else {
        renderFileList(body.files, listingBaseUrl(url));
        settings.setImportUrl(url);
      }
    } catch (err) {
      console.error(err);
      showToast(`Could not load URL: ${err?.message ?? String(err)}`, {
        error: true,
      });
    }
    urlBtn.disabled = false;
  });
  refreshStats();
  urlInput.value = settings.get().importUrl;

  return { refreshStats };
}
