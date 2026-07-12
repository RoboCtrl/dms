# UX Feedback Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the nine user-feedback items from
`docs/superpowers/specs/2026-07-12-ux-feedback-batch-design.md`: new setting
defaults, catalog-import usability (tap targets, per-file preview, toasts,
manual URL import, tolerant listing parsing), a combined Manage Database
screen, and the About-link fix.

**Architecture:** Pure client-side ES modules under `www/js/`. Pure logic
(parsing, classification, validation) lives in `www/js/catalog-import.js` and
is unit-tested with `node --test`; DOM controllers live in `www/js/ui/` and
are verified manually. Overlays reuse the existing `.overlay` /
`.options-panel` CSS pattern.

**Tech Stack:** Vanilla JS (ES modules), IndexedDB via `www/js/db.js`,
`node --test` + `node:assert/strict` for tests, no build step.

## Global Constraints

- Pure front-end; static files only; everything deployable lives in `www/`.
- Must work on mobile Chrome + Firefox, portrait, dark and light themes.
- Code and comments in American English; every function gets a JSDoc block
  (purpose, args, types, return values).
- Tests: `npm test` (runs `node --test` from the repo root). All tests must
  pass at every commit.
- Commit each task to the `dev-claude` branch.
- Do not add git-ignored files (e.g. `claude-log/`) to the repo.

---

### Task 1: New setting defaults

**Files:**
- Modify: `www/js/settings.js:7-17`
- Modify: `www/js/viewport.js:5-15`
- Test: `test/settings.test.js`

**Interfaces:**
- Produces: `createSettings().get()` now defaults to `cameraHeight: 1`,
  `hideDuplicates: true`, `groupMode: "firstToken"`. `DEFAULT_CAMERA_HEIGHT`
  in `viewport.js` becomes `1`. No signature changes.

- [ ] **Step 1: Update the default-value tests**

In `test/settings.test.js`, update every assertion that encodes the old
defaults. The full expected default object is now:

```js
{
  theme: "dark",
  hideDuplicates: true,
  groupMode: "firstToken",
  cameraOn: true,
  cameraHeight: 1,
  freezeMode: "auto",
  freezeTimer: 1,
  freezeTapDelay: 2,
  freezeAutoDelay: 2,
}
```

Concretely:

- Test `"defaults to dark theme and duplicates shown"`: rename to
  `"defaults to dark theme, hidden duplicates, first-token grouping"` and
  replace the expected object with the one above.
- Test `"persists theme and hideDuplicates across instances"`: change
  `s1.setHideDuplicates(true)` to `s1.setHideDuplicates(false)` and in the
  expected object use `hideDuplicates: false`, `groupMode: "firstToken"`,
  `cameraHeight: 1` (theme stays `"light"`).
- Test `"cameraHeight defaults to index 3 (current height)"`: rename to
  `"cameraHeight defaults to index 1 (second-smallest)"` and assert
  `assert.equal(s.get().cameraHeight, 1);`
- Test `"groupMode defaults to full"`: rename to
  `"groupMode defaults to firstToken"` and assert
  `assert.equal(s.get().groupMode, "firstToken");`

- [ ] **Step 2: Run the settings tests to verify they fail**

Run: `node --test test/settings.test.js`
Expected: FAIL — the renamed default tests assert the new values against the
old `DEFAULTS`.

- [ ] **Step 3: Change the defaults**

In `www/js/settings.js` replace the `DEFAULTS` values:

```js
const DEFAULTS = {
  theme: "dark",
  hideDuplicates: true,
  groupMode: "firstToken",
  cameraOn: true,
  cameraHeight: 1,
  freezeMode: "auto",
  freezeTimer: 1,
  freezeTapDelay: 2,
  freezeAutoDelay: 2,
};
```

In `www/js/viewport.js` update the fallback default and its docs:

```js
/** Index of the default camera-height preset (33%, second-smallest). */
export const DEFAULT_CAMERA_HEIGHT = 1;
```

Also update the module header comment (lines 5-8): index 1 (33%) is now the
default; index 3 (45%) is the historical default kept as a preset.

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: PASS (all files).

- [ ] **Step 5: Commit**

```bash
git add www/js/settings.js www/js/viewport.js test/settings.test.js
git commit -m "feat: new defaults - short camera, hide duplicates, first-token grouping"
```

---

### Task 2: Import-row tap targets + About link

**Files:**
- Modify: `www/index.html:151` (About link)
- Modify: `www/js/ui/catalog-section.js:84-93` (row structure)
- Modify: `www/css/styles.css` (new rules, append after `.opt-radio-row`)

**Interfaces:**
- Produces: each import file row is a `div.catalog-file` containing a
  `label.catalog-file-label` (checkbox + name). Task 5 appends a Preview
  button to `div.catalog-file`.

- [ ] **Step 1: Fix the About link**

In `www/index.html` replace line 151 with:

```html
          <p><a href="https://github.com/RoboCtrl/dms" target="_blank" rel="noopener">https://github.com/RoboCtrl/dms</a></p>
```

- [ ] **Step 2: Restructure the file rows**

In `www/js/ui/catalog-section.js`, inside `showFiles()`, replace the
`checks` construction with:

```js
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
      filesEl.appendChild(row);
      return cb;
    });
```

- [ ] **Step 3: Add the row CSS**

Append to `www/css/styles.css` (before the `[hidden]` rule at the end):

```css
/* --- Catalog import file list --- */
.catalog-file {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
}

.catalog-file-label {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
}

.catalog-file-label input[type="checkbox"] {
  width: 18px;
  height: 18px;
}
```

- [ ] **Step 4: Run tests and verify manually**

Run: `npm test` — Expected: PASS (no logic touched).
Manual: `npm run serve`, open `http://localhost:8000`, Options → Import
catalogs: rows are comfortably tappable; About shows the GitHub URL.

- [ ] **Step 5: Commit**

```bash
git add www/index.html www/js/ui/catalog-section.js www/css/styles.css
git commit -m "feat: tappable catalog import rows; About links to GitHub repo"
```

---

### Task 3: Tolerant directory-listing parser

**Files:**
- Modify: `www/js/catalog-import.js:12-27` (`parseListing`)
- Test: `test/catalog-import.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `parseListing(html: string): string[]` — unchanged signature,
  more tolerant behavior. Task 6 reuses it via `classifyImportBody`.

- [ ] **Step 1: Write the failing tests**

Append to `test/catalog-import.test.js`:

```js
test("parseListing takes the basename of path hrefs", () => {
  assert.deepEqual(parseListing('<a href="/data/foo.json">foo.json</a>'), [
    "foo.json",
  ]);
});

test("parseListing strips query strings and fragments", () => {
  const html =
    '<a href="?C=N;O=D">Name</a> <a href="bar.json?v=2#top">bar.json</a>';
  assert.deepEqual(parseListing(html), ["bar.json"]);
});

test("parseListing decodes URL-encoded names", () => {
  assert.deepEqual(parseListing('<a href="my%20set.json">my set</a>'), [
    "my set.json",
  ]);
});

test("parseListing matches the extension case-insensitively", () => {
  assert.deepEqual(parseListing('<a href="UPPER.JSON">u</a>'), ["UPPER.JSON"]);
});

test("parseListing accepts single-quoted hrefs", () => {
  assert.deepEqual(parseListing("<a href='c.json'>c</a>"), ["c.json"]);
});

test("parseListing skips directory links and de-duplicates", () => {
  const html =
    '<a href="../">..</a><a href="sub/">sub</a>' +
    '<a href="a.json">a</a><a href="a.json">a</a>';
  assert.deepEqual(parseListing(html), ["a.json"]);
});

test("parseListing falls back to plain-text tokens when no hrefs", () => {
  assert.deepEqual(parseListing("a.json\nreadme.txt b.json"), [
    "a.json",
    "b.json",
  ]);
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `node --test test/catalog-import.test.js`
Expected: FAIL — path hrefs, query strings, encoded names, uppercase
extensions, single quotes, and the plain-text fallback all fail against the
current implementation.

- [ ] **Step 3: Replace `parseListing`**

In `www/js/catalog-import.js`, replace the `parseListing` function (and its
doc comment) with:

```js
/**
 * Extract catalog file names from a directory listing. Handles common
 * autoindex styles (nginx, Apache, lighttpd, Python http.server, Caddy):
 * takes the basename of each href, strips query strings and fragments,
 * URL-decodes the name, matches the ".json" extension case-insensitively,
 * skips directory links, and de-duplicates. When the input contains no href
 * attributes at all, falls back to scanning the plain text for
 * whitespace-separated "*.json" tokens.
 * @param {string} html - The directory listing (HTML or plain text).
 * @returns {string[]} The catalog file names.
 */
export function parseListing(html) {
  const names = [];
  const seen = new Set();
  const add = (name) => {
    if (name !== null && !seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  };
  const re = /href\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  let sawHref = false;
  let m;
  while ((m = re.exec(html)) !== null) {
    sawHref = true;
    add(fileNameFromHref(m[1] ?? m[2]));
  }
  if (!sawHref) {
    for (const token of html.split(/\s+/)) add(fileNameFromHref(token));
  }
  return names;
}

/**
 * Reduce an href (or bare token) to a catalog file name: strip query string
 * and fragment, reject directory links, take the last path segment, and
 * URL-decode it. Returns null unless the result ends in ".json"
 * (case-insensitive).
 * @param {string} href - The href value or plain-text token.
 * @returns {string|null} The decoded file name, or null if not a catalog file.
 */
function fileNameFromHref(href) {
  const path = href.split(/[?#]/)[0];
  if (path === "" || path.endsWith("/")) return null;
  const segment = path.split("/").pop();
  let name;
  try {
    name = decodeURIComponent(segment);
  } catch {
    name = segment;
  }
  return /\.json$/i.test(name) ? name : null;
}
```

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: PASS — including the pre-existing
`"parseListing keeps only .json hrefs"` test.

- [ ] **Step 5: Commit**

```bash
git add www/js/catalog-import.js test/catalog-import.test.js
git commit -m "feat: tolerant directory-listing parser"
```

---

### Task 4: Toast notifications

**Files:**
- Create: `www/js/ui/toast.js`
- Modify: `www/css/styles.css` (append)
- Modify: `www/js/ui/catalog-section.js` (replace `alert()` calls, add
  success toast)

**Interfaces:**
- Produces: `showToast(message: string, opts?: {error?: boolean}): void` from
  `www/js/ui/toast.js`. Tasks 5, 6, 7 import it.

- [ ] **Step 1: Create the toast module**

Create `www/js/ui/toast.js`:

```js
/**
 * Minimal snackbar notifications. A single fixed element near the bottom of
 * the screen shows one message at a time; a new message replaces the current
 * one. Success toasts auto-dismiss after 3.5 s, error toasts after 6 s.
 */

let toastEl = null;
let hideTimer = 0;

/**
 * Show a toast message. Creates the toast element on first use.
 * @param {string} message - The text to display.
 * @param {{error?: boolean}} [opts] - Set error to true for error styling
 *   and a longer display time.
 */
export function showToast(message, { error = false } = {}) {
  if (toastEl === null) {
    toastEl = document.createElement("div");
    toastEl.id = "toast";
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = message;
  toastEl.classList.toggle("toast-error", error);
  toastEl.classList.add("toast-visible");
  clearTimeout(hideTimer);
  hideTimer = setTimeout(
    () => toastEl.classList.remove("toast-visible"),
    error ? 6000 : 3500,
  );
}
```

- [ ] **Step 2: Add the toast CSS**

Append to `www/css/styles.css` (before the `[hidden]` rule):

```css
/* --- Toast notifications --- */
#toast {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  max-width: 88%;
  padding: 10px 16px;
  border-radius: 8px;
  background: var(--panel);
  color: var(--content-fg);
  border-left: 4px solid var(--accent);
  box-shadow: 0 2px 12px #00000066;
  z-index: 30;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.25s;
}

#toast.toast-visible {
  opacity: 1;
}

#toast.toast-error {
  border-left-color: #e5484d;
}
```

- [ ] **Step 3: Use toasts in the catalog import flow**

In `www/js/ui/catalog-section.js`:

Add the import at the top:

```js
import { showToast } from "./toast.js";
```

In `loadFile()`, replace the catch block's alert with a toast and add a
success toast after the merge:

```js
    } catch (err) {
      console.error(err);
      showToast(`Could not import ${name}: ${err?.message ?? String(err)}`, {
        error: true,
      });
      return;
    }
```

and after `await catalog.replaceAll(...)`:

```js
    await catalog.replaceAll(mergeEntries(existing, entries, replace));
    showToast(`Imported ${name} — ${entries.length} entries`);
```

In `showFiles()`, replace the listing-error alert:

```js
    } catch (err) {
      console.error(err);
      showToast(`Could not list catalog files: ${err?.message ?? String(err)}`, {
        error: true,
      });
      importBtn.disabled = false;
      return;
    }
```

Update the `createCatalogSection` doc comment: import results and failures
are reported via toasts instead of alerts.

- [ ] **Step 4: Run tests and verify manually**

Run: `npm test` — Expected: PASS.
Manual: import a catalog file → green-edged toast "Imported … — N entries";
stop the network (devtools offline) and import → red-edged error toast.

- [ ] **Step 5: Commit**

```bash
git add www/js/ui/toast.js www/css/styles.css www/js/ui/catalog-section.js
git commit -m "feat: toast notifications for catalog import results"
```

---

### Task 5: Per-file Preview overlay

**Files:**
- Modify: `www/js/catalog-import.js` (add `fetchText`)
- Create: `www/js/ui/preview-overlay.js`
- Modify: `www/index.html` (preview overlay markup)
- Modify: `www/css/styles.css` (append)
- Modify: `www/js/ui/catalog-section.js` (Preview button per row)
- Test: `test/catalog-import.test.js`

**Interfaces:**
- Consumes: `showToast` (Task 4), `div.catalog-file` rows (Task 2),
  `validateCatalog` (existing).
- Produces: `fetchText(url: string, fetchFn?: typeof fetch): Promise<string>`
  in `catalog-import.js` (Task 6 reuses it);
  `createPreviewOverlay(): {open(name: string, text: string): void}` in
  `www/js/ui/preview-overlay.js`.

- [ ] **Step 1: Write the failing `fetchText` test**

Append to `test/catalog-import.test.js` (the `fetchStub` helper already
exists at the top of the file; add `fetchText` to the import list):

```js
test("fetchText returns the body; throws on HTTP error", async () => {
  assert.equal(await fetchText("u", fetchStub("body text")), "body text");
  await assert.rejects(
    fetchText("u", fetchStub("", false, 404)),
    /HTTP 404/,
  );
});
```

- [ ] **Step 2: Run tests to verify the new one fails**

Run: `node --test test/catalog-import.test.js`
Expected: FAIL — `fetchText` is not exported.

- [ ] **Step 3: Implement `fetchText`**

Add to `www/js/catalog-import.js` (after `parseListing`/`fileNameFromHref`):

```js
/**
 * Fetch a URL and return its body as text, bypassing the HTTP cache.
 * @param {string} url - The URL to fetch.
 * @param {typeof fetch} [fetchFn=fetch] - Fetch implementation (injectable for tests).
 * @returns {Promise<string>} The response body text.
 */
export async function fetchText(url, fetchFn = fetch) {
  const res = await fetchFn(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Fetch failed for ${url}: HTTP ${res.status}`);
  return res.text();
}
```

Run: `node --test test/catalog-import.test.js` — Expected: PASS.

- [ ] **Step 4: Add the preview overlay markup**

In `www/index.html`, insert after the closing `</div>` of the options
overlay (after line 154, before the `<script>` tags):

```html
    <!-- Catalog preview overlay (stacks above the options overlay) -->
    <div id="preview" class="overlay" hidden>
      <div class="options-panel" role="dialog" aria-modal="true">
        <div class="options-header">
          <h2 id="preview-title">Preview</h2>
          <button id="preview-close" aria-label="Close"></button>
        </div>
        <p id="preview-error" hidden></p>
        <label class="opt-row">
          <span>Formatted</span>
          <input id="preview-formatted" type="checkbox" checked />
        </label>
        <pre id="preview-content"></pre>
      </div>
    </div>
```

- [ ] **Step 5: Add the preview CSS**

Append to `www/css/styles.css` (before the `[hidden]` rule):

```css
/* --- Catalog preview overlay --- */
#preview {
  z-index: 20;
}

#preview-error {
  color: #e5484d;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

#preview-content {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 12px;
  margin: 8px 0 0;
}

.catalog-preview-btn {
  padding: 6px 10px;
  font-size: 13px;
}
```

Also extend the existing close-button rule so the preview close button gets
the same styling — change the `#options-close` selector
(`www/css/styles.css:314`) to:

```css
#options-close,
#preview-close {
```

- [ ] **Step 6: Create the preview-overlay module**

Create `www/js/ui/preview-overlay.js`:

```js
/**
 * Catalog file preview overlay. Shows a fetched catalog file as formatted
 * JSON (default) or the raw response text, with JSON parse errors and
 * catalog validation errors surfaced in a red banner at the top. Rendered
 * in an overlay with the same panel styling as the options menu, stacked
 * above it.
 */
import { setIcon } from "../util/icon.js";
import { validateCatalog } from "../catalog-import.js";

/**
 * Create the preview overlay controller bound to the #preview DOM.
 * @returns {{open: (name: string, text: string) => void}}
 */
export function createPreviewOverlay() {
  const overlay = document.getElementById("preview");
  const titleEl = document.getElementById("preview-title");
  const closeBtn = document.getElementById("preview-close");
  const errorEl = document.getElementById("preview-error");
  const formattedCb = document.getElementById("preview-formatted");
  const contentEl = document.getElementById("preview-content");

  setIcon(closeBtn, "x");

  /** @type {string} Raw response text of the previewed file. */
  let rawText = "";
  /** @type {*} Parsed JSON value; undefined when rawText is not valid JSON. */
  let parsed;
  /** @type {string|null} Error banner text, or null when the file is clean. */
  let errorText = null;

  /**
   * Render the error banner and the content area according to the current
   * state and the "Formatted" checkbox. Formatted display requires parsed
   * JSON; otherwise the raw text is shown.
   */
  function render() {
    errorEl.textContent = errorText ?? "";
    errorEl.hidden = errorText === null;
    const formatted = formattedCb.checked && parsed !== undefined;
    contentEl.textContent = formatted
      ? JSON.stringify(parsed, null, 2)
      : rawText;
  }

  /**
   * Open the overlay for one file: parse and validate the text, then show
   * it (formatted by default).
   * @param {string} name - The file name, used as the overlay title.
   * @param {string} text - The raw response body.
   */
  function open(name, text) {
    titleEl.textContent = name;
    rawText = text;
    parsed = undefined;
    errorText = null;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      errorText = `Parse error: ${err.message}`;
    }
    if (parsed !== undefined) {
      try {
        validateCatalog(parsed);
      } catch (err) {
        errorText = `Validation error: ${err.message}`;
      }
    }
    formattedCb.checked = true;
    render();
    overlay.hidden = false;
  }

  /** Close the overlay. */
  function close() {
    overlay.hidden = true;
  }

  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  formattedCb.addEventListener("change", render);

  return { open };
}
```

- [ ] **Step 7: Add the Preview button to each file row**

In `www/js/ui/catalog-section.js`:

Add the imports (extend the existing import from `../catalog-import.js` with
`fetchText`, and add the new module):

```js
import { createPreviewOverlay } from "./preview-overlay.js";
```

Inside `createCatalogSection`, after the element lookups:

```js
  const preview = createPreviewOverlay();
```

In `showFiles()`, inside the `files.map` callback from Task 2, insert before
`filesEl.appendChild(row);`:

```js
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
```

- [ ] **Step 8: Run tests and verify manually**

Run: `npm test` — Expected: PASS.
Manual: Options → Import catalogs → Preview on a file: overlay opens above
the options panel showing pretty-printed JSON; unchecking "Formatted" shows
the raw text; a file with broken JSON shows the red parse error on top.

- [ ] **Step 9: Commit**

```bash
git add www/js/catalog-import.js www/js/ui/preview-overlay.js www/index.html www/css/styles.css www/js/ui/catalog-section.js test/catalog-import.test.js
git commit -m "feat: per-file catalog preview overlay"
```

---

### Task 6: Import from manual URL

**Files:**
- Modify: `www/js/settings.js` (`importUrl` default + setter)
- Modify: `www/js/catalog-import.js` (`classifyImportBody`, `listingBaseUrl`,
  `urlDisplayName`)
- Modify: `www/js/ui/catalog-section.js` (URL controls; parameterize the
  file-list UI by base URL)
- Modify: `www/index.html` (URL input + button in the Catalog section)
- Modify: `www/css/styles.css` (append)
- Modify: `www/js/app.js` (pass `settings` to `createCatalogSection`)
- Test: `test/settings.test.js`, `test/catalog-import.test.js`

**Interfaces:**
- Consumes: `parseListing` (Task 3), `fetchText` (Task 5), `showToast`
  (Task 4), `settings.get()/update` (existing).
- Produces:
  - `settings.get().importUrl: string` (default `""`) and
    `settings.setImportUrl(value: string): void`;
  - `classifyImportBody(text: string): {kind:"catalog", json:object} | {kind:"listing", files:string[]}`;
  - `listingBaseUrl(url: string): string`;
  - `urlDisplayName(url: string): string`;
  - `createCatalogSection({catalog, settings, onChange})` — new `settings`
    option (app.js updated here).

- [ ] **Step 1: Write the failing settings tests**

Append to `test/settings.test.js`:

```js
test("importUrl defaults to empty and persists across instances", () => {
  const storage = fakeStorage();
  const s1 = createSettings(storage);
  assert.equal(s1.get().importUrl, "");
  s1.setImportUrl("https://example.org/catalogs/");
  const s2 = createSettings(storage);
  assert.equal(s2.get().importUrl, "https://example.org/catalogs/");
});
```

Also add `importUrl: ""` to the two full-object `assert.deepEqual` expected
objects (the tests updated in Task 1) — note the second one expects the URL
set in that test only if it sets one; it does not, so both get
`importUrl: ""`.

- [ ] **Step 2: Write the failing catalog-import tests**

Append to `test/catalog-import.test.js` (add `classifyImportBody`,
`listingBaseUrl`, `urlDisplayName` to the import list):

```js
test("classifyImportBody: JSON object body is a catalog", () => {
  assert.deepEqual(classifyImportBody('{"A":{"rn":1}}'), {
    kind: "catalog",
    json: { A: { rn: 1 } },
  });
});

test("classifyImportBody: non-object JSON falls through to listing", () => {
  assert.deepEqual(classifyImportBody("123"), { kind: "listing", files: [] });
});

test("classifyImportBody: HTML body is a listing", () => {
  assert.deepEqual(classifyImportBody(LISTING), {
    kind: "listing",
    files: ["series_29.json"],
  });
});

test("listingBaseUrl ensures a trailing slash", () => {
  assert.equal(listingBaseUrl("https://x.org/data"), "https://x.org/data/");
  assert.equal(listingBaseUrl("https://x.org/data/"), "https://x.org/data/");
});

test("urlDisplayName returns the decoded last path segment", () => {
  assert.equal(urlDisplayName("https://x.org/a/set%201.json?v=2"), "set 1.json");
  assert.equal(urlDisplayName("https://x.org/"), "x.org");
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — missing exports and missing `importUrl` default.

- [ ] **Step 4: Implement the settings change**

In `www/js/settings.js`: add `importUrl: ""` to `DEFAULTS` (after
`groupMode`), and add to the returned object:

```js
    /**
     * Set and persist the last manually entered catalog import URL.
     * @param {string} value - The URL, or an empty string.
     */
    setImportUrl(value) {
      update({ importUrl: value });
    },
```

Mention `importUrl:string` in the `get()`/`update()` JSDoc type unions.

- [ ] **Step 5: Implement the catalog-import helpers**

Add to `www/js/catalog-import.js`:

```js
/**
 * Interpret a body fetched from a manually entered URL. A body that parses
 * as a JSON object is a catalog file; anything else is treated as a
 * directory listing and scanned for catalog file names.
 * @param {string} text - The fetched response body.
 * @returns {{kind:"catalog", json:object} | {kind:"listing", files:string[]}}
 */
export function classifyImportBody(text) {
  try {
    const json = JSON.parse(text);
    if (json !== null && typeof json === "object" && !Array.isArray(json)) {
      return { kind: "catalog", json };
    }
  } catch {
    // Not JSON; fall through to listing detection.
  }
  return { kind: "listing", files: parseListing(text) };
}

/**
 * Normalize a directory URL so file names can be appended to it.
 * @param {string} url - The directory URL as entered by the user.
 * @returns {string} The URL with a trailing slash.
 */
export function listingBaseUrl(url) {
  return url.endsWith("/") ? url : url + "/";
}

/**
 * Derive a short display name from a URL: the decoded last non-empty path
 * segment (query string and fragment ignored), falling back to the host.
 * @param {string} url - The URL.
 * @returns {string} The display name.
 */
export function urlDisplayName(url) {
  const path = url.split(/[?#]/)[0];
  const segment = path.split("/").filter((s) => s !== "").pop() ?? url;
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
```

Note: for `"https://x.org/"` the last non-empty segment is `"x.org"` (the
host), which is the documented fallback.

- [ ] **Step 6: Run the unit tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Add the URL controls to the Catalog section**

In `www/index.html`, inside the Catalog `opt-group` (after the
`catalog-import-btn` button, before `catalog-clear-btn`):

```html
          <input
            id="catalog-url"
            type="url"
            placeholder="https://example.com/catalogs/"
            aria-label="Catalog import URL"
          />
          <button id="catalog-url-btn">Load from URL</button>
```

Append to `www/css/styles.css` (before the `[hidden]` rule):

```css
#catalog-url {
  width: 100%;
  box-sizing: border-box;
  padding: 8px;
  margin: 10px 0 4px;
}
```

- [ ] **Step 8: Rework `catalog-section.js` for parameterized sources**

Modify `www/js/ui/catalog-section.js`:

1. Extend the `../catalog-import.js` import with `classifyImportBody`,
   `listingBaseUrl`, `urlDisplayName` (and `fetchText` from Task 5).
2. Change the factory signature and doc comment to
   `createCatalogSection({ catalog, settings, onChange })`.
3. Add element lookups:

```js
  const urlInput = document.getElementById("catalog-url");
  const urlBtn = document.getElementById("catalog-url-btn");
```

4. Prefill the field once during setup (next to the existing
   `refreshStats()` call at the bottom):

```js
  urlInput.value = settings.get().importUrl;
```

5. Split `loadFile` so the validate/conflict/merge part is reusable for a
   directly fetched JSON body, and make the base URL a parameter:

```js
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
```

6. Extract the file-list rendering from `showFiles` into
   `renderFileList(files, baseUrl)` and use the base URL in the Preview and
   Load handlers. The resulting functions:

```js
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
```

7. Add the URL handler (next to the `importBtn` listener):

```js
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
```

- [ ] **Step 9: Pass settings through in `app.js`**

In `www/js/app.js` change the call:

```js
  createCatalogSection({ catalog, settings, onChange: render });
```

- [ ] **Step 10: Run tests and verify manually**

Run: `npm test` — Expected: PASS.
Manual: enter the default server URL → file list appears; enter a direct
`.json` URL → import runs with conflict confirm + toast; reopen the app →
the URL field is prefilled.

- [ ] **Step 11: Commit**

```bash
git add www/js/settings.js www/js/catalog-import.js www/js/ui/catalog-section.js www/index.html www/css/styles.css www/js/app.js test/settings.test.js test/catalog-import.test.js
git commit -m "feat: import catalogs from a manually entered URL"
```

---

### Task 7: Manage Database screen

**Files:**
- Modify: `www/index.html` (button swap, remove clear-catalog, new overlay)
- Create: `www/js/ui/manage-db.js`
- Modify: `www/js/ui/options-menu.js` (drop clear button, expose
  `refreshStats`)
- Modify: `www/js/ui/catalog-section.js` (drop clear button)
- Modify: `www/js/app.js` (wire `createManageDb`)
- Modify: `www/css/styles.css` (append)

**Interfaces:**
- Consumes: `store.getVisible(false, "none")`, `store.deleteEntry(id)`,
  `store.clearAll()`, `catalog.getEntries()`, `catalog.replaceAll(entries)`,
  `catalog.clear()`, `catalog.displayFor(content)`,
  `formatTimestamp(epochMs)`, `setIcon(el, name)` — all existing.
- Produces: `createManageDb({store, catalog, onChange}): {open: () => void}`
  (self-wires the `#manage-db-btn` click);
  `createOptionsMenu(...)` now returns `{open, refreshStats}`.

- [ ] **Step 1: Update the markup**

In `www/index.html`:

1. Database section — replace the clear button:

```html
        <section class="opt-group">
          <h3>Database</h3>
          <p id="db-stats">0 entries &middot; 0 kB</p>
          <button id="manage-db-btn">Manage database</button>
        </section>
```

2. Catalog section — delete the line
   `<button id="catalog-clear-btn">Clear catalog</button>`.

3. After the preview overlay (Task 5), add the manage overlay:

```html
    <!-- Manage database overlay (stacks above the options overlay) -->
    <div id="manage-db" class="overlay" hidden>
      <div class="options-panel" role="dialog" aria-modal="true">
        <div class="options-header">
          <h2>Manage database</h2>
          <button id="manage-db-close" aria-label="Close"></button>
        </div>

        <section class="opt-group">
          <h3>List entries</h3>
          <div id="manage-scans"></div>
          <div class="manage-actions">
            <button id="manage-scans-delete">Delete selected</button>
            <button id="manage-scans-clear">Clear all</button>
          </div>
        </section>

        <section class="opt-group">
          <h3>Catalog entries</h3>
          <div id="manage-catalog"></div>
          <div class="manage-actions">
            <button id="manage-catalog-delete">Delete selected</button>
            <button id="manage-catalog-clear">Clear all</button>
          </div>
        </section>
      </div>
    </div>
```

- [ ] **Step 2: Add the manage CSS**

Append to `www/css/styles.css` (before the `[hidden]` rule):

```css
/* --- Manage database overlay --- */
#manage-db {
  z-index: 20;
}

.manage-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
}

.manage-row input[type="checkbox"] {
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
}

.manage-text {
  flex: 1;
  overflow-wrap: anywhere;
}

.manage-time {
  font-size: 12px;
  color: var(--timestamp-fg);
  white-space: nowrap;
}

.manage-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
```

Also extend the shared close-button rule (updated in Task 5) to cover the
new close button — the selector becomes:

```css
#options-close,
#preview-close,
#manage-db-close {
```

- [ ] **Step 3: Create the manage-db module**

Create `www/js/ui/manage-db.js`:

```js
/**
 * Manage Database overlay: lists every scan record and every catalog entry
 * with a checkbox each, supports deleting the selected rows, and offers
 * confirm-guarded clear-all actions per section. Replaces the former
 * "Clear database" and "Clear catalog" buttons.
 */
import { formatTimestamp } from "../util/format.js";
import { setIcon } from "../util/icon.js";

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

  /** Open the overlay with freshly rendered lists. */
  function open() {
    renderScans();
    renderCatalog();
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
```

- [ ] **Step 4: Trim options-menu.js**

In `www/js/ui/options-menu.js`:

1. Delete the `clearBtn` lookup (`const clearBtn = …"clear-db-btn"`) and the
   entire `clearBtn.addEventListener(…)` block.
2. Change the return to expose the stats refresher, and update the factory
   doc comment (clear-database action moved to the Manage Database overlay):

```js
  return { open, refreshStats };
```

- [ ] **Step 5: Trim catalog-section.js**

In `www/js/ui/catalog-section.js`: delete the `clearBtn` lookup
(`const clearBtn = …"catalog-clear-btn"`) and its `clearBtn.addEventListener(…)`
block; update the factory doc comment (clear moved to Manage Database).

- [ ] **Step 6: Wire it in app.js**

In `www/js/app.js`:

```js
import { createManageDb } from "./ui/manage-db.js";
```

and replace the `createOptionsMenu`/`createCatalogSection` calls with:

```js
  const options = createOptionsMenu({
    store,
    settings,
    onSettingsChange: () => {
      render();
      scanner.refreshFreezeConfig();
    },
  });
  const catalogSection = createCatalogSection({
    catalog,
    settings,
    onChange: render,
  });
  createManageDb({
    store,
    catalog,
    onChange: () => {
      render();
      options.refreshStats();
      catalogSection.refreshStats();
    },
  });
```

- [ ] **Step 7: Run tests and verify manually**

Run: `npm test` — Expected: PASS.
Manual: Options → Manage database: both lists render; deleting selected scan
rows updates the history behind the overlay and the db-stats readout;
deleting selected catalog tokens updates the catalog count; both Clear all
buttons ask for confirmation first; Undo still works for scans deleted via
the history list.

- [ ] **Step 8: Commit**

```bash
git add www/index.html www/js/ui/manage-db.js www/js/ui/options-menu.js www/js/ui/catalog-section.js www/js/app.js www/css/styles.css
git commit -m "feat: Manage Database screen replaces clear buttons"
```

---

### Task 8: Service worker bump + final verification

**Files:**
- Modify: `www/sw.js:5-35`

**Interfaces:**
- Consumes: the new modules from Tasks 4, 5, 7.

- [ ] **Step 1: Bump the cache and precache the new modules**

In `www/sw.js`: change line 5 to

```js
const CACHE = "dms-v10";
```

and add to the `ASSETS` array (next to the other `js/ui/` entries):

```js
  "js/ui/toast.js",
  "js/ui/preview-overlay.js",
  "js/ui/manage-db.js",
```

- [ ] **Step 2: Full test suite**

Run: `npm test`
Expected: PASS — every test file.

- [ ] **Step 3: Manual smoke test**

`npm run serve`, open `http://localhost:8000` (and ideally a phone via LAN):

- fresh profile (or cleared site data): camera panel is short (33%), Hide
  duplicates checked, "Group by first token" selected;
- import flow: padded rows, Preview overlay, toasts, URL import;
- Manage database: selective + clear-all deletion for both stores;
- About shows `https://github.com/RoboCtrl/dms`;
- reload twice: the new service worker activates without console errors.

- [ ] **Step 4: Commit**

```bash
git add www/sw.js
git commit -m "chore: bump service worker cache to v10; precache new UI modules"
```
