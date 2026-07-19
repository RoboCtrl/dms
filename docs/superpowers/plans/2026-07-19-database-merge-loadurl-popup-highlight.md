# Database Merge, Load-from-URL Popup, First-Token Highlight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the Catalog options section into Database with separate stats lines, replace the inline catalog-import URL field with a Load-from-URL popup overlay, and restyle unmatched history entries (bold first token, accent-coloured last two characters).

**Architecture:** Pure client-side static web app (`www/` is the whole runtime, no build step). The popup follows the existing stacked-overlay pattern (`.overlay` > `.options-panel`, like `#preview` / `#manage-db`). `www/js/ui/catalog-section.js` remains the single owner of the import UI; `www/js/util/format.js` owns content segmentation.

**Tech Stack:** Vanilla ES modules, `node --test` for unit tests, no framework.

**Spec:** `docs/superpowers/specs/2026-07-19-database-merge-loadurl-popup-highlight-design.md`

## Global Constraints

- Code and comments in American English.
- Every function carries a doc comment (purpose, args, types, return value).
- All work on branch `dev-claude`; commit after each task.
- Tests: `npm test` (Node's built-in runner) from the repo root `/opt/shared/developer/dms`.
- DOM-touching modules have no unit tests in this repo; verify them manually via `npm run serve` (serves `www/` at `http://localhost:8000`).
- Exact UI copy: `Load from URL ...` (button), `Load from URL` (popup title), `Manage database`, `Import catalogs`, `<n> list entries`, `<n> catalog entries`, `<size> storage size`.
- Service worker cache name must be bumped `dms-v12` → `dms-v13` once, in the final task.

---

### Task 1: First-token highlight segmentation

**Files:**
- Modify: `www/js/util/format.js:38-56` (`segmentContent`)
- Modify: `www/js/ui/history-panel.js:47-60` (segment rendering)
- Modify: `www/css/styles.css` (new `.tok-accent` rule, after the `.entry`-related styles around the `/* --- Catalog import file list --- */` marker)
- Test: `test/format.test.js`

**Interfaces:**
- Produces: `segmentContent(content: string) → Array<{text: string, bold: boolean, accent: boolean}>`. Concatenating the `text` fields yields the display string — segments carry their own spacing, callers must NOT join with spaces. Consumed by `history-panel.js`.

- [ ] **Step 1: Write the failing tests**

Replace the three existing `segmentContent` tests in `test/format.test.js` (lines 20-45) with:

```js
test("segmentContent bolds the 1st token and accents its last two chars", () => {
  assert.deepEqual(segmentContent("123 AB3X 45 6"), [
    { text: "1", bold: true, accent: false },
    { text: "23", bold: true, accent: true },
    { text: " AB3X 45 6", bold: false, accent: false },
  ]);
});

test("segmentContent accents the whole 1st token when it has 2 chars or fewer", () => {
  assert.deepEqual(segmentContent("12 AB3X 45 6"), [
    { text: "12", bold: true, accent: true },
    { text: " AB3X 45 6", bold: false, accent: false },
  ]);
  assert.deepEqual(segmentContent("1 AB 2 3"), [
    { text: "1", bold: true, accent: true },
    { text: " AB 2 3", bold: false, accent: false },
  ]);
});

test("segmentContent normalizes whitespace between tokens", () => {
  assert.deepEqual(segmentContent("123   AB3X  45 6"), [
    { text: "1", bold: true, accent: false },
    { text: "23", bold: true, accent: true },
    { text: " AB3X 45 6", bold: false, accent: false },
  ]);
});

test("segmentContent returns one plain segment for non-matching content", () => {
  assert.deepEqual(segmentContent("hello world"), [
    { text: "hello world", bold: false, accent: false },
  ]);
  assert.deepEqual(segmentContent("12 AB 45"), [
    { text: "12 AB 45", bold: false, accent: false },
  ]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- test/format.test.js`
Expected: the four `segmentContent` tests FAIL (old segment shape has no `accent` field and bolds the second token); the `formatTimestamp` / `formatBytes` tests still pass.

- [ ] **Step 3: Implement the new segmentation**

Replace `segmentContent` (and its doc comment) in `www/js/util/format.js` with:

```js
/**
 * Split scanned content into display segments. When the content matches the
 * special format "<integer> <alphanumeric> <integer> <integer>", the first
 * token is marked bold and its last two characters (the whole token when it
 * has two characters or fewer) are additionally marked for accent coloring;
 * the remaining tokens follow as one plain segment. Any other content is
 * returned as a single plain segment. Concatenating the segment texts yields
 * the full display string — segments carry their own spacing.
 * @param {string} content - The scanned content.
 * @returns {Array<{text:string, bold:boolean, accent:boolean}>} Ordered display segments.
 */
export function segmentContent(content) {
  const special = /^(\d+)\s+([A-Za-z0-9]+)\s+([0-9]+)\s+([0-9]+)$/;
  const m = content.match(special);
  if (!m) return [{ text: content, bold: false, accent: false }];
  const first = m[1];
  const split = Math.max(first.length - 2, 0);
  const segments = [];
  if (split > 0) {
    segments.push({ text: first.slice(0, split), bold: true, accent: false });
  }
  segments.push({ text: first.slice(split), bold: true, accent: true });
  segments.push({ text: ` ${m[2]} ${m[3]} ${m[4]}`, bold: false, accent: false });
  return segments;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- test/format.test.js`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Update the renderer**

In `www/js/ui/history-panel.js`, replace the `else` branch that renders segments (lines 47-60, the block starting with the `// Render segments:` comment) with:

```js
    } else {
      // Render segments: bold first token, accent-colored last two chars.
      // Segments carry their own spacing, so no separators are inserted.
      const segments = segmentContent(rec.content);
      for (const seg of segments) {
        if (!seg.bold && !seg.accent) {
          content.appendChild(document.createTextNode(seg.text));
          continue;
        }
        const part = document.createElement(seg.bold ? "strong" : "span");
        if (seg.accent) part.classList.add("tok-accent");
        part.textContent = seg.text;
        content.appendChild(part);
      }
    }
```

Also update the module doc line referencing bolding if present (line 48's old comment is replaced by the block above; no other references).

- [ ] **Step 6: Add the accent CSS rule**

In `www/css/styles.css`, directly above the `/* --- Catalog import file list --- */` comment (line ~404), add:

```css
/* Accent-colored suffix of the first token in unmatched history entries. */
.tok-accent {
  color: var(--accent);
}
```

- [ ] **Step 7: Run the full test suite**

Run: `npm test`
Expected: PASS (no other suite touches `segmentContent`).

- [ ] **Step 8: Manual check**

Run: `npm run serve`, open `http://localhost:8000` in a browser, confirm an unmatched entry like `123 AB3X 45 6` renders `123` bold with `23` in the theme's green accent, and the rest plain. (Skip if no browser available; note it for the final verification.)

- [ ] **Step 9: Commit**

```bash
git add test/format.test.js www/js/util/format.js www/js/ui/history-panel.js www/css/styles.css
git commit -m "feat: bold first token with accent-colored suffix in unmatched entries"
```

---

### Task 2: Merge Catalog section into Database

**Files:**
- Modify: `www/index.html:151-169` (Database + Catalog sections)
- Modify: `www/js/ui/options-menu.js:33,38-42` (stats elements + `refreshStats`)
- Modify: `www/js/ui/catalog-section.js:32,38-41` (stats element + `refreshStats`)

**Interfaces:**
- Consumes: `formatBytes(bytes) → string` from `www/js/util/format.js`, `db.estimateSize() → Promise<{count, bytes}>` (both unchanged).
- Produces: DOM ids `#db-list-stats`, `#db-catalog-stats`, `#db-size-stats`, `#load-url-btn` (button is inert until Task 3). Ids `#catalog-import-btn`, `#catalog-files`, `#catalog-url`, `#catalog-url-btn` keep working. `#db-stats` and `#catalog-stats` are gone.

- [ ] **Step 1: Restructure the options markup**

In `www/index.html`, replace the two sections (lines 151-169, the `Database` and `Catalog` `<section class="opt-group">` blocks) with one section. The inline URL input and its old `Load from URL` button stay for now (Task 3 replaces them with the popup):

```html
        <section class="opt-group">
          <h3>Database</h3>
          <p id="db-list-stats">0 list entries</p>
          <p id="db-catalog-stats">0 catalog entries</p>
          <p id="db-size-stats">0 kB storage size</p>
          <button id="manage-db-btn">Manage database</button>
          <button id="load-url-btn" hidden>Load from URL ...</button>
          <button id="catalog-import-btn">Import catalogs</button>
          <input
            id="catalog-url"
            type="url"
            placeholder="https://example.com/catalogs/"
            aria-label="Catalog import URL"
          />
          <button id="catalog-url-btn">Load from URL</button>
          <div id="catalog-files" hidden></div>
        </section>
```

- [ ] **Step 2: Split the Database stats readout**

In `www/js/ui/options-menu.js` replace line 33:

```js
  const stats = document.getElementById("db-stats");
```

with:

```js
  const listStats = document.getElementById("db-list-stats");
  const sizeStats = document.getElementById("db-size-stats");
```

and replace `refreshStats` (lines 38-42) with:

```js
  /** Refresh the list-entry count and storage-size readouts. */
  async function refreshStats() {
    const { count, bytes } = await db.estimateSize();
    listStats.textContent = `${count} list entries`;
    sizeStats.textContent = `${formatBytes(bytes)} storage size`;
  }
```

- [ ] **Step 3: Re-point the catalog stats readout**

In `www/js/ui/catalog-section.js` replace line 32:

```js
  const statsEl = document.getElementById("catalog-stats");
```

with:

```js
  const statsEl = document.getElementById("db-catalog-stats");
```

and replace the `refreshStats` body (line 40):

```js
    statsEl.textContent = `${catalog.getEntries().length} catalog entries`;
```

- [ ] **Step 4: Run tests + manual check**

Run: `npm test` — Expected: PASS (these are DOM-only changes).
Then `npm run serve`, open the options menu: the Database section shows the three stats lines with real numbers, `Manage database` and `Import catalogs` still work, the inline URL field still loads catalogs, and no `Catalog` heading remains.

- [ ] **Step 5: Commit**

```bash
git add www/index.html www/js/ui/options-menu.js www/js/ui/catalog-section.js
git commit -m "feat: merge Catalog options section into Database with split stats lines"
```

---

### Task 3: Load-from-URL popup

**Files:**
- Modify: `www/index.html` (remove inline URL input + old button; unhide `#load-url-btn`; add `#load-url` overlay after the `#preview` overlay block)
- Modify: `www/js/ui/catalog-section.js` (popup wiring; full file replacement below)
- Modify: `www/css/styles.css` (replace `#catalog-url` rule; add `#load-url` z-index, actions row, close-button styling)

**Interfaces:**
- Consumes: `createPreviewOverlay() → {open(name, text)}`, `classifyImportBody`, `listingBaseUrl`, `urlDisplayName`, `fetchText`, `settings.get().importUrl` / `settings.setImportUrl(url)`, `setIcon(el, "x")` — all existing.
- Produces: DOM ids `#load-url`, `#load-url-close`, `#load-url-input`, `#load-url-cancel`, `#load-url-preview`, `#load-url-load`, `#load-url-files`. `createCatalogSection` signature unchanged.

- [ ] **Step 1: Update the markup**

In `www/index.html`:

1. In the Database section (Task 2), delete the `<input id="catalog-url" …/>` element and the `<button id="catalog-url-btn">Load from URL</button>` line, and remove the `hidden` attribute from `#load-url-btn`. The section becomes:

```html
        <section class="opt-group">
          <h3>Database</h3>
          <p id="db-list-stats">0 list entries</p>
          <p id="db-catalog-stats">0 catalog entries</p>
          <p id="db-size-stats">0 kB storage size</p>
          <button id="manage-db-btn">Manage database</button>
          <button id="load-url-btn">Load from URL ...</button>
          <button id="catalog-import-btn">Import catalogs</button>
          <div id="catalog-files" hidden></div>
        </section>
```

2. After the closing `</div>` of the `#preview` overlay block (line ~193, before the `<!-- Manage database overlay -->` comment), add:

```html
    <!-- Load-from-URL overlay (stacks above the options overlay) -->
    <div id="load-url" class="overlay" hidden>
      <div class="options-panel" role="dialog" aria-modal="true">
        <div class="options-header">
          <h2>Load from URL</h2>
          <button id="load-url-close" aria-label="Close"></button>
        </div>
        <input
          id="load-url-input"
          type="url"
          placeholder="https://example.com/catalogs/"
          aria-label="Catalog import URL"
        />
        <div class="load-url-actions">
          <button id="load-url-cancel">Cancel</button>
          <button id="load-url-preview">Preview</button>
          <button id="load-url-load">Load</button>
        </div>
        <div id="load-url-files" hidden></div>
      </div>
    </div>
```

- [ ] **Step 2: Update the CSS**

In `www/css/styles.css`:

1. Replace the `#catalog-url` rule (lines 475-480) with:

```css
#load-url-input {
  width: 100%;
  box-sizing: border-box;
  padding: 8px;
  margin: 10px 0 4px;
}
```

2. Directly below it add (15 sits above the options overlay's 10 and below the preview overlay's 20, so Preview stacks on top of the popup):

```css
/* --- Load-from-URL overlay --- */
#load-url {
  z-index: 15;
}

.load-url-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
```

3. Add `#load-url-close` to the shared close-button selector list (lines 338-340):

```css
#options-close,
#preview-close,
#manage-db-close,
#load-url-close {
```

- [ ] **Step 3: Rewrite the catalog-section controller**

Replace the entire contents of `www/js/ui/catalog-section.js` with:

```js
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
```

Notes for the implementer:

- The old inline `urlInput.value = settings.get().importUrl;` at module init is gone on purpose — the popup pre-fills on every open instead.
- `renderFileList` gained `container` and `onLoaded` parameters; the Import-catalogs flow passes `filesEl` and a no-op, the popup flows pass `popupFilesEl` and `closePopup`.
- Preview on a listing URL intentionally does NOT persist the URL (`settings.setImportUrl` only on Load), per the spec.

- [ ] **Step 4: Run tests + manual check**

Run: `npm test` — Expected: PASS.
Then `npm run serve` and verify in a browser:

1. `Load from URL ...` opens the popup; the URL field is pre-filled with the persisted import URL.
2. Cancel, the ✕ button, and a backdrop tap each close it.
3. Preview with an empty field shows the "Enter a URL first." error toast.
4. Preview with a direct catalog file URL (e.g. `http://localhost:8000/data/series_29.json`) opens the preview overlay on top of the popup.
5. Load with that URL imports it (toast), closes the popup, and the `catalog entries` count updates.
6. Load with a directory-listing URL shows the checkbox list inside the popup; `Load selected` imports and closes the popup.
7. `Import catalogs` still renders its list inside the Database section.

- [ ] **Step 5: Commit**

```bash
git add www/index.html www/css/styles.css www/js/ui/catalog-section.js
git commit -m "feat: Load-from-URL popup replaces inline catalog import URL field"
```

---

### Task 4: Service worker bump and final verification

**Files:**
- Modify: `www/sw.js:5` (cache name)

**Interfaces:**
- Consumes: nothing new. No files were added or removed in `www/`, so the `ASSETS` list is unchanged.

- [ ] **Step 1: Bump the cache version**

In `www/sw.js` line 5, change:

```js
const CACHE = "dms-v12";
```

to:

```js
const CACHE = "dms-v13";
```

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS, all suites.

- [ ] **Step 3: Commit**

```bash
git add www/sw.js
git commit -m "chore: bump service worker cache to v13 for options/highlight update"
```
