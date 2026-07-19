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
import { setIcon } from "../util/icon.js";

/**
 * Create the catalog import controls of the "Database" options section. Owns
 * the catalog entry-count readout, the "Import catalogs" button that lists
 * the default remote .json files inside the section, and the "Load from URL
 * ..." popup where the user enters a directory-listing or catalog-file URL
 * and can Cancel, Preview, or Load it. A directory listing renders a
 * checkbox file list (with per-file Preview) inside the popup; loading a
 * catalog closes the popup. Import results and failures are reported via
 * toasts. The "Clear catalog" action lives in the Manage Database overlay.
 * @param {object} opts
 * @param {object} opts.catalog - The in-memory catalog model.
 * @param {object} opts.settings - The settings accessor (for the persisted import URL).
 * @param {() => void} opts.onChange - Called after the catalog changes so the app re-renders.
 * @returns {{refreshStats: () => void}}
 */
export function createCatalogSection({ catalog, settings, onChange }) {
  const importBtn = document.getElementById("catalog-import-btn");
  const statsEl = document.getElementById("db-catalog-stats");
  const filesEl = document.getElementById("catalog-files");
  const openBtn = document.getElementById("load-url-btn");
  const overlay = document.getElementById("load-url");
  const closeBtn = document.getElementById("load-url-close");
  const urlInput = document.getElementById("load-url-input");
  const cancelBtn = document.getElementById("load-url-cancel");
  const previewBtn = document.getElementById("load-url-preview");
  const loadBtn = document.getElementById("load-url-load");
  const popupFilesEl = document.getElementById("load-url-files");
  const preview = createPreviewOverlay();

  setIcon(closeBtn, "x");

  /** Update the catalog entry-count readout. */
  function refreshStats() {
    statsEl.textContent = `${catalog.getEntries().length} catalog entries`;
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
   * @param {HTMLElement} container - Element the list is rendered into.
   * @param {() => void} onLoaded - Called after "Load selected" finishes.
   */
  function renderFileList(files, baseUrl, container, onLoaded) {
    container.replaceChildren();
    if (files.length === 0) {
      container.textContent = "No catalog files found.";
      container.hidden = false;
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
      container.appendChild(row);
      return cb;
    });
    const loadBtnRow = document.createElement("button");
    loadBtnRow.textContent = "Load selected";
    loadBtnRow.addEventListener("click", async () => {
      loadBtnRow.disabled = true;
      for (const cb of checks) {
        if (cb.checked) await loadFile(baseUrl, cb.value);
      }
      container.replaceChildren();
      container.hidden = true;
      refreshStats();
      onChange();
      onLoaded();
    });
    container.appendChild(loadBtnRow);
    container.hidden = false;
  }

  /**
   * Fetch the default remote listing and show the file list inside the
   * Database section.
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
    renderFileList(files, CATALOG_BASE_URL, filesEl, () => {});
    importBtn.disabled = false;
  }

  /** Open the Load-from-URL popup with the persisted URL and a clean list. */
  function openPopup() {
    urlInput.value = settings.get().importUrl;
    popupFilesEl.replaceChildren();
    popupFilesEl.hidden = true;
    overlay.hidden = false;
  }

  /** Close the Load-from-URL popup. */
  function closePopup() {
    overlay.hidden = true;
  }

  /**
   * Read and validate the popup's URL field.
   * @returns {string|null} The trimmed URL, or null (with a toast) when empty.
   */
  function requireUrl() {
    const url = urlInput.value.trim();
    if (url === "") {
      showToast("Enter a URL first.", { error: true });
      return null;
    }
    return url;
  }

  importBtn.addEventListener("click", showFiles);
  openBtn.addEventListener("click", openPopup);
  closeBtn.addEventListener("click", closePopup);
  cancelBtn.addEventListener("click", closePopup);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closePopup();
  });

  previewBtn.addEventListener("click", async () => {
    const url = requireUrl();
    if (url === null) return;
    previewBtn.disabled = true;
    try {
      const text = await fetchText(url);
      const body = classifyImportBody(text);
      if (body.kind === "catalog") {
        preview.open(urlDisplayName(url), text);
      } else if (body.files.length === 0) {
        showToast("No catalog files found at this URL.", { error: true });
      } else {
        renderFileList(body.files, listingBaseUrl(url), popupFilesEl, closePopup);
      }
    } catch (err) {
      console.error(err);
      showToast(`Could not preview URL: ${err?.message ?? String(err)}`, {
        error: true,
      });
    }
    previewBtn.disabled = false;
  });

  loadBtn.addEventListener("click", async () => {
    const url = requireUrl();
    if (url === null) return;
    loadBtn.disabled = true;
    try {
      const body = classifyImportBody(await fetchText(url));
      if (body.kind === "catalog") {
        const applied = await importParsed(urlDisplayName(url), body.json);
        if (applied) {
          settings.setImportUrl(url);
          refreshStats();
          onChange();
          closePopup();
        }
      } else if (body.files.length === 0) {
        showToast("No catalog files found at this URL.", { error: true });
      } else {
        renderFileList(body.files, listingBaseUrl(url), popupFilesEl, closePopup);
        settings.setImportUrl(url);
      }
    } catch (err) {
      console.error(err);
      showToast(`Could not load URL: ${err?.message ?? String(err)}`, {
        error: true,
      });
    }
    loadBtn.disabled = false;
  });

  refreshStats();

  return { refreshStats };
}
