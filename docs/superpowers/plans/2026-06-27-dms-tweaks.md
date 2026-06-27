# DMS Tweaks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply a batch of UI/UX tweaks to the Data Matrix Scanner — Lucide icons, a persisted camera on/off toggle, continuous-scan ergonomics, refined history entries, and options-panel polish.

**Architecture:** Pure client-side ES modules under `www/`. Logic that can be unit-tested (settings, content segmenting, scan cooldown, icon markup) lives in small pure modules tested with `node --test`. DOM/CSS-heavy changes (scanner, history panel, options) are wired to those modules and verified manually in a browser.

**Tech Stack:** Vanilla ES modules, ZXing-js (vendored UMD global), `node:test` + `node:assert/strict`, localStorage, IndexedDB. No build step.

## Global Constraints

- Pure front-end only — no backend, no build step, no remote dependencies. Everything ships under `www/`. (Offline PWA.)
- Code and comments in American English.
- Document every function in-code (purpose, args, types, return values).
- Icons delivered as **inline SVG** (Lucide), not a web font. SVGs are embedded as string constants in `js/util/icon.js` (no separate asset files, no runtime fetch) so they inject inline and theme via `currentColor`.
- Special content format regex (verbatim): `^\d+\s+[A-Za-z0-9]+\s+[0-9]+\s+[0-9]+$` — an integer, an alphanumeric token, then two integers; only the 2nd token is bold.
- Link colours: `#7FC1DF` (dark theme) / `#496E80` (light theme), applied to `:link`/`:visited`/`:active`.
- Same-content cooldown: ~2000 ms.
- After any runtime change, bump the service-worker cache version in `www/sw.js`.
- Tests run with `npm test` (`node --test`). Test files live in `test/`.
- Per global rules: write a `claude-log/YYYY-MM-DD__hh-mm-ss.log` entry and commit work to the `dev-claude` branch.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `www/js/settings.js` (modify) | Add persisted `cameraOn` setting + `setCameraOn`. |
| `www/js/util/format.js` (modify) | Add `segmentContent` — split content into `{text, bold}` segments. |
| `www/js/util/scan-gate.js` (create) | `createScanGate` — pure same-content cooldown decision. |
| `www/js/util/icon.js` (create) | `iconSvg`/`setIcon` — embedded Lucide SVG markup. |
| `www/index.html` (modify) | Camera toggle button, camera-off screen, reticle, About text, icon hosts. |
| `www/css/styles.css` (modify) | `--link` var, camera controls, camera-off fill, reticle, 50% freeze, entry layout, options heading, link colours. |
| `www/js/ui/history-panel.js` (modify) | Render content via `segmentContent`; trash uses Lucide icon. |
| `www/js/ui/options-menu.js` (modify) | Set `menu`/`x` icons on its buttons. |
| `www/js/scanner.js` (modify) | Camera toggle + persistence, keep-running-after-detect, 50% freeze, reticle, cooldown gate, camera-off screen, camera icon. |
| `www/js/app.js` (modify) | Pass `settings` into `createScanner`. |
| `www/sw.js` (modify) | Bump cache version; precache `icon.js` and `scan-gate.js`. |
| `test/settings.test.js` (modify) | Cover `cameraOn`. |
| `test/format.test.js` (modify) | Cover `segmentContent`. |
| `test/scan-gate.test.js` (create) | Cover the cooldown. |
| `test/icon.test.js` (create) | Cover icon markup. |

---

## Task 1: `cameraOn` setting

**Files:**
- Modify: `www/js/settings.js`
- Test: `test/settings.test.js`

**Interfaces:**
- Consumes: existing `createSettings(storage)` with `get()` / `update(patch)`.
- Produces: `settings.get().cameraOn: boolean` (default `true`); `settings.setCameraOn(value: boolean): void`.

- [ ] **Step 1: Write the failing test**

Append to `test/settings.test.js` (keep existing imports/tests):

```js
test("cameraOn defaults to true", () => {
  const store = new Map();
  const s = createSettings({
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, v),
  });
  assert.equal(s.get().cameraOn, true);
});

test("setCameraOn persists the value", () => {
  const store = new Map();
  const s = createSettings({
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, v),
  });
  s.setCameraOn(false);
  assert.equal(s.get().cameraOn, false);
});
```

If `test/settings.test.js` does not already import `createSettings`, add at the top:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createSettings } from "../www/js/settings.js";
```

(Check the file first; only add imports that are missing.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `cameraOn` is `undefined`.

- [ ] **Step 3: Implement**

In `www/js/settings.js`, add `cameraOn: true` to `DEFAULTS`:

```js
const DEFAULTS = { theme: "dark", hideDuplicates: false, cameraOn: true };
```

Add a setter alongside `setHideDuplicates` (inside the returned object), with a doc comment:

```js
    /**
     * Set and persist whether the camera is on.
     * @param {boolean} value
     */
    setCameraOn(value) {
      update({ cameraOn: value });
    },
```

Update the `get()` return-type doc comment to include `cameraOn:boolean`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add www/js/settings.js test/settings.test.js
git commit -m "feat: add persisted cameraOn setting"
```

---

## Task 2: `segmentContent` helper

**Files:**
- Modify: `www/js/util/format.js`
- Test: `test/format.test.js`

**Interfaces:**
- Produces: `segmentContent(content: string): Array<{text: string, bold: boolean}>`.
  - Matching the special format → four segments, only index 1 (`bold: true`).
  - Otherwise → single segment `[{text: content, bold: false}]`.
  - Note: in the matching case whitespace between tokens is normalized to single spaces by the consumer when joining; segments carry only token text.

- [ ] **Step 1: Write the failing test**

Append to `test/format.test.js`:

```js
import { segmentContent } from "../www/js/util/format.js";

test("segmentContent bolds only the 2nd token for the special format", () => {
  assert.deepEqual(segmentContent("12 AB3X 45 6"), [
    { text: "12", bold: false },
    { text: "AB3X", bold: true },
    { text: "45", bold: false },
    { text: "6", bold: false },
  ]);
});

test("segmentContent tolerates extra whitespace between tokens", () => {
  assert.deepEqual(segmentContent("12   AB3X  45 6"), [
    { text: "12", bold: false },
    { text: "AB3X", bold: true },
    { text: "45", bold: false },
    { text: "6", bold: false },
  ]);
});

test("segmentContent returns one normal segment for non-matching content", () => {
  assert.deepEqual(segmentContent("hello world"), [
    { text: "hello world", bold: false },
  ]);
  assert.deepEqual(segmentContent("12 AB 45"), [
    { text: "12 AB 45", bold: false },
  ]);
});
```

(Adjust the import line if the file already imports from `format.js` — add `segmentContent` to the existing import instead of duplicating.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `segmentContent is not a function`.

- [ ] **Step 3: Implement**

Append to `www/js/util/format.js`:

```js
/**
 * Split scanned content into display segments. When the content matches the
 * special format "<integer> <alphanumeric> <integer> <integer>", the four
 * tokens are returned with only the second (alphanumeric) token marked bold;
 * any other content is returned as a single non-bold segment.
 * @param {string} content - The scanned content.
 * @returns {Array<{text:string, bold:boolean}>} Ordered display segments.
 */
export function segmentContent(content) {
  const special = /^(\d+)\s+([A-Za-z0-9]+)\s+([0-9]+)\s+([0-9]+)$/;
  const m = content.match(special);
  if (!m) return [{ text: content, bold: false }];
  return [
    { text: m[1], bold: false },
    { text: m[2], bold: true },
    { text: m[3], bold: false },
    { text: m[4], bold: false },
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add www/js/util/format.js test/format.test.js
git commit -m "feat: add segmentContent for conditional bold rendering"
```

---

## Task 3: Scan cooldown gate

**Files:**
- Create: `www/js/util/scan-gate.js`
- Test: `test/scan-gate.test.js`

**Interfaces:**
- Produces: `createScanGate(cooldownMs?: number)` → `{ accept(content: string, now: number): boolean }`.
  - First sighting of a content → `true` and records `(content, now)`.
  - Same content within `cooldownMs` of the last accepted sighting → `false` (timestamp NOT updated).
  - Same content after `cooldownMs` → `true`.
  - Different content → always `true` (immediate).

- [ ] **Step 1: Write the failing test**

Create `test/scan-gate.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createScanGate } from "../www/js/util/scan-gate.js";

test("first sighting is accepted", () => {
  const gate = createScanGate(2000);
  assert.equal(gate.accept("A", 0), true);
});

test("same content within cooldown is rejected", () => {
  const gate = createScanGate(2000);
  gate.accept("A", 0);
  assert.equal(gate.accept("A", 1500), false);
});

test("same content after cooldown is accepted again", () => {
  const gate = createScanGate(2000);
  gate.accept("A", 0);
  assert.equal(gate.accept("A", 2500), true);
});

test("different content is accepted immediately", () => {
  const gate = createScanGate(2000);
  gate.accept("A", 0);
  assert.equal(gate.accept("B", 100), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `www/js/util/scan-gate.js`:

```js
/**
 * Same-content cooldown gate for continuous scanning. Prevents the decode loop
 * from re-recording the same code many times per second: the same content is
 * only accepted again after a different code is seen or the cooldown elapses.
 * @param {number} [cooldownMs=2000] - Minimum gap before re-accepting identical content.
 * @returns {{accept: (content: string, now: number) => boolean}} The gate.
 */
export function createScanGate(cooldownMs = 2000) {
  let lastContent = null;
  let lastTime = 0;
  return {
    /**
     * Decide whether a sighting should be recorded.
     * @param {string} content - The decoded content.
     * @param {number} now - Current time in ms (e.g. Date.now()).
     * @returns {boolean} True if the sighting should be recorded.
     */
    accept(content, now) {
      if (content === lastContent && now - lastTime < cooldownMs) return false;
      lastContent = content;
      lastTime = now;
      return true;
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add www/js/util/scan-gate.js test/scan-gate.test.js
git commit -m "feat: add same-content scan cooldown gate"
```

---

## Task 4: Lucide icon helper

**Files:**
- Create: `www/js/util/icon.js`
- Test: `test/icon.test.js`

**Interfaces:**
- Produces:
  - `iconSvg(name: "menu"|"x"|"trash-2"|"camera"|"camera-off"): string` — SVG markup; throws `Error` for unknown names.
  - `setIcon(el: HTMLElement, name): void` — sets `el.innerHTML = iconSvg(name)`.

- [ ] **Step 1: Write the failing test**

Create `test/icon.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { iconSvg } from "../www/js/util/icon.js";

test("iconSvg returns themeable svg markup for known names", () => {
  for (const name of ["menu", "x", "trash-2", "camera", "camera-off"]) {
    const svg = iconSvg(name);
    assert.match(svg, /<svg/);
    assert.match(svg, /viewBox="0 0 24 24"/);
    assert.match(svg, /stroke="currentColor"/);
  }
});

test("iconSvg throws for unknown names", () => {
  assert.throws(() => iconSvg("nope"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `www/js/util/icon.js`:

```js
/**
 * Inline Lucide (lucide.dev) icons as themeable SVG markup. Icons are embedded
 * as string constants so they inject inline and inherit the current text colour
 * via stroke="currentColor" — no web font, no runtime fetch, fully offline.
 */

/**
 * Wrap inner SVG markup in a standard 24x24 Lucide svg element sized to 1em.
 * @param {string} inner - The path/line/circle markup for the icon body.
 * @returns {string} Complete <svg> markup.
 */
function svg(inner) {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" ' +
    'width="1em" height="1em" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ' +
    'aria-hidden="true">' +
    inner +
    "</svg>"
  );
}

/** Icon body markup keyed by Lucide icon name. */
const ICONS = {
  menu: svg(
    '<line x1="4" x2="20" y1="6" y2="6"/>' +
      '<line x1="4" x2="20" y1="12" y2="12"/>' +
      '<line x1="4" x2="20" y1="18" y2="18"/>',
  ),
  x: svg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
  "trash-2": svg(
    '<path d="M3 6h18"/>' +
      '<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>' +
      '<path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>' +
      '<line x1="10" x2="10" y1="11" y2="17"/>' +
      '<line x1="14" x2="14" y1="11" y2="17"/>',
  ),
  camera: svg(
    '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>' +
      '<circle cx="12" cy="13" r="3"/>',
  ),
  "camera-off": svg(
    '<line x1="2" x2="22" y1="2" y2="22"/>' +
      '<path d="M7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16"/>' +
      '<path d="M9.5 4h5L17 7h3a2 2 0 0 1 2 2v7.5"/>' +
      '<path d="M14.121 15.121A3 3 0 1 1 9.88 10.88"/>',
  ),
};

/**
 * Return SVG markup for a named Lucide icon.
 * @param {"menu"|"x"|"trash-2"|"camera"|"camera-off"} name - Icon name.
 * @returns {string} Complete <svg> markup.
 * @throws {Error} If the icon name is unknown.
 */
export function iconSvg(name) {
  const markup = ICONS[name];
  if (!markup) throw new Error(`Unknown icon: ${name}`);
  return markup;
}

/**
 * Replace an element's contents with a named Lucide icon.
 * @param {HTMLElement} el - Target element.
 * @param {"menu"|"x"|"trash-2"|"camera"|"camera-off"} name - Icon name.
 */
export function setIcon(el, name) {
  el.innerHTML = iconSvg(name);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add www/js/util/icon.js test/icon.test.js
git commit -m "feat: add inline Lucide icon helper"
```

---

## Task 5: HTML structure — camera toggle, camera-off screen, reticle, About text

**Files:**
- Modify: `www/index.html`

**Interfaces:**
- Produces DOM hosts consumed by later tasks: `#camera-btn` (class `cam-ctrl`), `#menu-btn` (class `cam-ctrl`), `#camera-off` (with `.cam-off-icon` child), `#reticle` (with four `<i>` corner children).

This task is verified manually (no DOM unit test harness in the project).

- [ ] **Step 1: Add the camera toggle button and give both controls a shared class**

In `www/index.html`, replace the existing menu button line:

```html
        <button id="menu-btn" aria-label="Options">&#9776;</button>
```

with:

```html
        <button id="camera-btn" class="cam-ctrl" aria-label="Toggle camera"></button>
        <button id="menu-btn" class="cam-ctrl" aria-label="Options"></button>
```

(Icons are injected by JS in later tasks; buttons start empty.)

- [ ] **Step 2: Add the camera-off screen and the placement reticle**

Inside `<section id="camera-panel">`, after the `<div id="camera-error" hidden></div>` line, add:

```html
        <div id="camera-off" hidden><span class="cam-off-icon"></span></div>
        <div id="reticle" hidden><i></i><i></i><i></i><i></i></div>
```

- [ ] **Step 3: Add the About text and prepare the close button for an icon**

Replace the About section block:

```html
        <section class="opt-group">
          <h3>About</h3>
          <p><a href="https://www.example.com" target="_blank" rel="noopener">www.example.com</a></p>
        </section>
```

with:

```html
        <section class="opt-group">
          <h3>About</h3>
          <p class="about-name">Data Matrix Scanner</p>
          <p><a href="https://www.example.com" target="_blank" rel="noopener">www.example.com</a></p>
        </section>
```

Change the close button line from `<button id="options-close" aria-label="Close">&times;</button>` to an empty button (icon injected by JS):

```html
        <button id="options-close" aria-label="Close"></button>
```

- [ ] **Step 4: Verify manually**

Run: `npm run serve` then open `http://localhost:8000/` (the camera/icons will be wired in later tasks). Confirm the page still loads and the new elements exist in the DOM (DevTools → Elements: `#camera-btn`, `#camera-off`, `#reticle`, `.about-name`).
Expected: page renders without console errors; new elements present (icons empty for now).

- [ ] **Step 5: Commit**

```bash
git add www/index.html
git commit -m "feat: add camera toggle, camera-off screen, reticle, and About text markup"
```

---

## Task 6: CSS — controls, camera-off, reticle, 50% freeze, entry layout, options polish, link colours

**Files:**
- Modify: `www/css/styles.css`

Verified manually. Make these edits:

- [ ] **Step 1: Add the `--link` theme variable**

In the dark block (`:root, [data-theme="dark"]`) add:

```css
  --link: #7FC1DF;
```

In the `[data-theme="light"]` block add:

```css
  --link: #496E80;
```

- [ ] **Step 2: Replace the `#menu-btn` rule with a shared `.cam-ctrl` rule**

Replace the entire existing `#menu-btn { ... }` block with:

```css
.cam-ctrl {
  position: absolute;
  top: 8px;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  line-height: 1;
  background: #000000aa;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 0;
}

#menu-btn {
  right: 8px;
}

#camera-btn {
  right: 56px;
}
```

- [ ] **Step 3: Camera-off screen and reticle**

Append:

```css
/* Camera off: dark fill with a centered white icon. */
#camera-off {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #333333;
  color: #ffffff;
  font-size: 64px;
}

/* Placement reticle: four accent corner brackets in the center. */
#reticle {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 60%;
  aspect-ratio: 1 / 1;
  transform: translate(-50%, -50%);
  pointer-events: none;
}

#reticle i {
  position: absolute;
  width: 22px;
  height: 22px;
  border: 3px solid var(--accent);
}

#reticle i:nth-child(1) { top: 0; left: 0; border-right: none; border-bottom: none; }
#reticle i:nth-child(2) { top: 0; right: 0; border-left: none; border-bottom: none; }
#reticle i:nth-child(3) { bottom: 0; left: 0; border-right: none; border-top: none; }
#reticle i:nth-child(4) { bottom: 0; right: 0; border-left: none; border-top: none; }
```

- [ ] **Step 4: 50%-transparent frozen frame**

In the existing `#video, #freeze, #overlay { ... }` rule, leave as-is, and add a dedicated rule so only the freeze layer is dimmed (the highlight overlay stays full opacity):

```css
#freeze {
  opacity: 0.5;
}
```

- [ ] **Step 5: Entry layout — larger counter, taller content row, normal-weight content**

Replace the `.entry` row-template and the `.counter` / `.content` rules:

In `.entry`, change `grid-template-rows: auto auto;` to:

```css
  grid-template-rows: 1.6fr 1fr;
```

Replace `.entry .counter { ... }` with:

```css
.entry .counter {
  grid-row: 1 / 3;
  min-width: 2.2em;
  text-align: center;
  font-weight: bold;
  font-size: 1.4em;
  color: var(--counter-fg);
}
```

Replace `.entry .content { ... }` with:

```css
.entry .content {
  font-weight: normal;
  color: var(--content-fg);
  word-break: break-all;
}

.entry .content strong {
  font-weight: bold;
}
```

- [ ] **Step 6: Options heading placement and link colours**

Add a rule pinning the heading to the top of the panel:

```css
.options-panel h2 {
  margin-top: 0;
}
```

Add link colours (after the `.options-panel` rule):

```css
.options-panel a:link,
.options-panel a:visited,
.options-panel a:active {
  color: var(--link);
}
```

- [ ] **Step 7: Verify manually**

Run: `npm run serve`, open the app, open Options. Toggle theme dark/light.
Expected: counter larger; content normal weight; Options heading sits at the panel top; About shows "Data Matrix Scanner" above a link tinted `#7FC1DF` (dark) / `#496E80` (light). (Camera-off/reticle/freeze visuals are confirmed in Task 8.)

- [ ] **Step 8: Commit**

```bash
git add www/css/styles.css
git commit -m "feat: style camera controls, reticle, entry layout, and options panel"
```

---

## Task 7: History panel — segmented content and Lucide trash icon

**Files:**
- Modify: `www/js/ui/history-panel.js`

**Interfaces:**
- Consumes: `segmentContent` (Task 2), `setIcon` (Task 4).

Verified manually (rendering uses the unit-tested `segmentContent`).

- [ ] **Step 1: Update imports**

At the top of `www/js/ui/history-panel.js`, change:

```js
import { formatTimestamp } from "../util/format.js";
```

to:

```js
import { formatTimestamp, segmentContent } from "../util/format.js";
import { setIcon } from "../util/icon.js";
```

- [ ] **Step 2: Build content from segments and use the icon for trash**

In `buildEntry`, replace the content-span creation:

```js
    const content = document.createElement("span");
    content.className = "content";
    content.textContent = rec.content;
```

with:

```js
    const content = document.createElement("span");
    content.className = "content";
    // Render segments: only the special-format alphanumeric token is bold.
    const segments = segmentContent(rec.content);
    segments.forEach((seg, i) => {
      if (i > 0) content.appendChild(document.createTextNode(" "));
      if (seg.bold) {
        const strong = document.createElement("strong");
        strong.textContent = seg.text;
        content.appendChild(strong);
      } else {
        content.appendChild(document.createTextNode(seg.text));
      }
    });
```

And replace the trash glyph:

```js
    trash.textContent = "🗑"; // wastebasket
```

with:

```js
    setIcon(trash, "trash-2");
```

- [ ] **Step 3: Verify manually**

Run: `npm run serve`, scan or add entries (or temporarily inspect with a known value). Confirm a value like `12 AB3X 45 6` shows only `AB3X` in bold and the rest normal; a plain value shows entirely normal weight; the trash control shows the Lucide bin icon.
Expected: correct bolding and icon; no console errors.

- [ ] **Step 4: Commit**

```bash
git add www/js/ui/history-panel.js
git commit -m "feat: render history content via segmentContent and Lucide trash icon"
```

---

## Task 8: Scanner — toggle, keep-running, 50% freeze, reticle, cooldown, camera-off

**Files:**
- Modify: `www/js/scanner.js`
- Modify: `www/js/app.js`

**Interfaces:**
- Consumes: `setIcon` (Task 4), `createScanGate` (Task 3), `settings` (Task 1) — `settings.get().cameraOn`, `settings.setCameraOn(bool)`.
- Produces: `createScanner({ onRecognized, settings })` with `start()`.

Verified manually (camera + DOM).

- [ ] **Step 1: Replace `www/js/scanner.js` with the updated controller**

```js
/**
 * Camera + Data Matrix decode loop using the vendored ZXing-js UMD global.
 * Owns the live video stream and a camera on/off toggle, keeps the stream
 * running after a recognition (pausing only result *processing*), overlays the
 * frozen frame at 50% opacity with a highlight polygon, shows a placement
 * reticle while scanning, and throttles duplicate recordings via a cooldown
 * gate. Emits recognised content via the onRecognized callback.
 */

/* global ZXing */

import { setIcon } from "./util/icon.js";
import { createScanGate } from "./util/scan-gate.js";

/**
 * Create the scanner controller.
 * @param {object} opts
 * @param {(content: string) => void} opts.onRecognized - Called when a code is recognised and recorded.
 * @param {object} opts.settings - Settings instance for reading/persisting cameraOn.
 * @returns {{start: () => Promise<void>}}
 */
export function createScanner({ onRecognized, settings }) {
  const panel = document.getElementById("camera-panel");
  const video = document.getElementById("video");
  const freeze = document.getElementById("freeze");
  const overlay = document.getElementById("overlay");
  const content = document.getElementById("scan-content");
  const errorBox = document.getElementById("camera-error");
  const camBtn = document.getElementById("camera-btn");
  const camOff = document.getElementById("camera-off");
  const camOffIcon = camOff.querySelector(".cam-off-icon");
  const reticle = document.getElementById("reticle");

  const hints = new Map();
  hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
    ZXing.BarcodeFormat.DATA_MATRIX,
  ]);
  const reader = new ZXing.BrowserMultiFormatReader(hints);
  const gate = createScanGate(2000);

  let frozen = false;
  let cameraOn = settings.get().cameraOn;

  /**
   * Show a camera error message in place of the video.
   * @param {string} message - The message to display.
   */
  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
  }

  /**
   * Draw the frozen frame and a highlight polygon around the recognised code.
   * The freeze layer is rendered at 50% opacity (via CSS) so the live feed
   * shows through; the overlay polygon stays full opacity.
   * @param {Array<{getX:()=>number,getY:()=>number}>} points - ZXing result points (video-pixel coords).
   */
  function drawFreeze(points) {
    const w = video.videoWidth;
    const h = video.videoHeight;
    for (const c of [freeze, overlay]) {
      c.width = w;
      c.height = h;
      c.hidden = false;
    }
    freeze.getContext("2d").drawImage(video, 0, 0, w, h);

    const ctx = overlay.getContext("2d");
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = "#4caf50";
    ctx.lineWidth = Math.max(3, w * 0.01);
    ctx.beginPath();
    points.forEach((p, i) => {
      const x = p.getX();
      const y = p.getY();
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.stroke();
  }

  /** Clear the frozen overlay and resume processing (camera never stopped). */
  function resume() {
    if (!frozen) return;
    frozen = false;
    freeze.hidden = true;
    overlay.hidden = true;
    content.hidden = true;
  }

  /** Start the continuous decode loop on the rear camera. */
  async function startDecode() {
    try {
      await reader.decodeFromConstraints(
        { video: { facingMode: "environment" } },
        video,
        (result) => {
          if (!result || frozen) return;
          const text = result.getText();
          // Throttle duplicate recordings; skip entirely if within cooldown.
          if (!gate.accept(text, Date.now())) return;
          frozen = true;
          drawFreeze(result.getResultPoints());
          content.textContent = text;
          content.hidden = false;
          onRecognized(text);
        },
      );
    } catch (err) {
      showError(
        "Camera unavailable. Grant camera permission and use HTTPS or localhost. (" +
          (err?.name || err) +
          ")",
      );
    }
  }

  /**
   * Turn the camera on or off, persist the choice, and update the UI: when off,
   * stop the stream and show the dark camera-off screen; when on, restart the
   * decode loop and show the placement reticle.
   * @param {boolean} on - Desired camera state.
   */
  async function setCamera(on) {
    cameraOn = on;
    settings.setCameraOn(on);
    setIcon(camBtn, on ? "camera" : "camera-off");
    if (on) {
      camOff.hidden = true;
      reticle.hidden = false;
      await startDecode();
    } else {
      reader.reset();
      resume();
      reticle.hidden = true;
      camOff.hidden = false;
    }
  }

  panel.addEventListener("click", (e) => {
    // Ignore clicks on the control buttons themselves.
    if (e.target.closest(".cam-ctrl")) return;
    if (frozen) resume();
  });

  camBtn.addEventListener("click", () => setCamera(!cameraOn));

  return {
    /** Start the scanner, honoring the persisted camera on/off state. */
    async start() {
      setIcon(camOffIcon, "camera-off");
      await setCamera(cameraOn);
    },
  };
}
```

- [ ] **Step 2: Pass `settings` into the scanner in `app.js`**

In `www/js/app.js`, change:

```js
  const scanner = createScanner({
    onRecognized: (content) => store.recordScan(content),
  });
```

to:

```js
  const scanner = createScanner({
    onRecognized: (content) => store.recordScan(content),
    settings,
  });
```

- [ ] **Step 3: Verify manually (camera flow)**

Run: `npm run serve`, open on an HTTPS origin or `localhost` with a camera (a phone via the VPS, or a laptop webcam). Check:
- Camera button (left of options) toggles the camera; when off, a dark-gray screen with a white camera-off icon shows; state survives a reload.
- The reticle is visible while scanning.
- On detecting a code: the frame freezes at ~50% opacity with the green highlight; the live feed is still visible underneath; the entry is added once.
- Tapping the panel clears the frozen overlay.
- Holding the same code in view does not flood the history (cooldown); a different code records immediately.
Expected: all behaviors as described; no console errors.

- [ ] **Step 4: Commit**

```bash
git add www/js/scanner.js www/js/app.js
git commit -m "feat: camera toggle, keep-running scan, 50% freeze, reticle, cooldown"
```

---

## Task 9: Options menu icons + service-worker cache bump

**Files:**
- Modify: `www/js/ui/options-menu.js`
- Modify: `www/sw.js`

- [ ] **Step 1: Set the menu and close icons**

In `www/js/ui/options-menu.js`, add the import at the top:

```js
import { setIcon } from "../util/icon.js";
```

After the element lookups (after `const clearBtn = ...`), add:

```js
  setIcon(menuBtn, "menu");
  setIcon(closeBtn, "x");
```

- [ ] **Step 2: Bump the cache version and precache the new modules**

In `www/sw.js`, change:

```js
const CACHE = "dms-v1";
```

to:

```js
const CACHE = "dms-v2";
```

In the `ASSETS` array, add these entries (alongside the other `js/util/...` and `js/ui/...` paths):

```js
  "js/util/icon.js",
  "js/util/scan-gate.js",
```

- [ ] **Step 3: Verify manually**

Run: `npm run serve`, hard-reload (or unregister the old SW in DevTools → Application). Confirm the hamburger and close icons render as Lucide icons, and that the app still works offline after one load (DevTools → Network → Offline, reload).
Expected: Lucide menu/close icons; app loads offline; no console errors.

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: PASS (all settings/format/scan-gate/icon tests green).

- [ ] **Step 5: Commit**

```bash
git add www/js/ui/options-menu.js www/sw.js
git commit -m "feat: Lucide menu/close icons and bump SW cache to v2"
```

---

## Final wrap-up (not a code task)

- [ ] Write a `claude-log/YYYY-MM-DD__hh-mm-ss.log` entry summarizing created/modified files and intent, ending with a blank line then `Agent: Opus 4.8`.
- [ ] Confirm all work is committed on `dev-claude`.
- [ ] Use the finishing-a-development-branch skill to decide on merge to `main` / deploy.

---

## Self-Review

**Spec coverage:**
- Icon font → Lucide: Tasks 4 (helper), 5/7/9 (apply to all buttons + trash). ✓
- Camera toggle button left of options, same size: Task 5 (markup) + 6 (`.cam-ctrl`) + 8 (logic). ✓
- Camera-off dark screen with white icon: Tasks 5/6/8. ✓
- Keep camera running after detect: Task 8 (no `reader.reset()` on detect; `frozen` pauses processing only). ✓
- Frozen frame at 50% transparency: Task 6 (`#freeze opacity .5`) + 8. ✓
- Placement indicator: Tasks 5/6 (reticle) + 8 (visibility). ✓
- Entry layout (counter spanning both rows + larger; taller content row; timestamp; trash): Task 6. ✓
- Conditional 2nd-token bold for `<int> <alnum> <int> <int>`: Tasks 2 + 7. ✓
- Options heading placement independent of close button: Task 6 (`h2 margin-top:0`). ✓
- About: add "Data Matrix Scanner" above link: Task 5. ✓
- Link colours dark/light: Tasks 6 (`--link`, link states). ✓
- Cooldown / camera persistence: Tasks 3, 1, 8. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code. ✓

**Type consistency:** `segmentContent` → `{text,bold}[]` used identically in Tasks 2/7; `createScanGate(ms).accept(content, now)` consistent in Tasks 3/8; `setIcon(el, name)` / `iconSvg(name)` consistent in Tasks 4/7/8/9; `settings.setCameraOn`/`get().cameraOn` consistent in Tasks 1/8. ✓
