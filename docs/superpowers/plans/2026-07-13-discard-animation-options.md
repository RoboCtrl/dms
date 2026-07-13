# Discard Animation Options & Motion Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the frozen-frame discard animation configurable (on/off toggle + 400/800/1200/1600ms duration slider under Scanner options) and change its motion to darken to 50%, slide down to the camera panel's bottom edge with slight acceleration, shrink, and fade.

**Architecture:** The existing `.discarding` CSS-class mechanism stays; per-freeze values flow in via inline CSS custom properties (`--discard-ms`, `--discard-shift`) set by `scanner.js`. Settings persist a boolean and a preset index; `freeze.js` resolves the index to milliseconds, mirroring the freeze-slider pattern.

**Tech Stack:** Vanilla ES modules, CSS transitions, `node --test` for unit tests. No build step.

**Spec:** `docs/superpowers/specs/2026-07-13-discard-animation-options-design.md`

## Global Constraints

- Pure front-end; everything deployable lives in `www/`; no new dependencies.
- Code, comments, and in-code docs in American English; every function documented (purpose, args, types, return values).
- All commits go to the `dev-claude` branch.
- Defaults must reproduce today's behavior: animation on, 800ms.
- Duration presets: `[400, 800, 1200, 1600]` ms, **shortest first** (slider left = 400ms).
- The duration slider stays enabled even when the toggle is off.
- Run tests from the repo root: `npm test` (alias for `node --test`).

---

### Task 1: Settings keys `discardAnimation` / `discardDuration`

**Files:**
- Modify: `www/js/settings.js`
- Test: `test/settings.test.js`

**Interfaces:**
- Produces: `settings.get()` now includes `discardAnimation: boolean` (default `true`) and `discardDuration: number` (default `1`); setters `setDiscardAnimation(value: boolean)` and `setDiscardDuration(index: number)`. Task 4 (options UI) consumes all four.

- [ ] **Step 1: Write the failing tests**

Append to `test/settings.test.js`:

```js
test("discard animation defaults: enabled, duration index 1", () => {
  const s = createSettings(fakeStorage());
  const g = s.get();
  assert.equal(g.discardAnimation, true);
  assert.equal(g.discardDuration, 1);
});

test("discard setters persist across instances", () => {
  const storage = fakeStorage();
  const s1 = createSettings(storage);
  s1.setDiscardAnimation(false);
  s1.setDiscardDuration(3);
  const s2 = createSettings(storage);
  const g = s2.get();
  assert.equal(g.discardAnimation, false);
  assert.equal(g.discardDuration, 3);
});
```

Also extend the two existing `assert.deepEqual(s.get(), {...})` tests
("defaults to dark theme…" and "persists theme and hideDuplicates…"): add
`discardAnimation: true,` and `discardDuration: 1,` to both expected objects
(after `freezeAutoDelay`, before `importUrl`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- test/settings.test.js`
Expected: the two new tests FAIL (`discardAnimation` is `undefined`); the two
extended `deepEqual` tests FAIL until the defaults are added.

- [ ] **Step 3: Implement**

In `www/js/settings.js`:

Add to `DEFAULTS` (after `freezeAutoDelay: 2,`):

```js
  discardAnimation: true,
  discardDuration: 1,
```

Add to the returned object (after `setFreezeAutoDelay`, before
`setImportUrl`):

```js
    /**
     * Set and persist whether the discard (fade-off) animation plays.
     * @param {boolean} value
     */
    setDiscardAnimation(value) {
      update({ discardAnimation: value });
    },
    /**
     * Set and persist the discard-animation duration preset index.
     * @param {number} index - Index into the discard-duration presets.
     */
    setDiscardDuration(index) {
      update({ discardDuration: index });
    },
```

Extend the JSDoc object types on `get()` and `update()` with
`discardAnimation:boolean, discardDuration:number` (keep the existing key
order style).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- test/settings.test.js`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add www/js/settings.js test/settings.test.js
git commit -m "feat: persist discard-animation toggle and duration settings"
```

---

### Task 2: Duration presets and config resolution in `freeze.js`

**Files:**
- Modify: `www/js/freeze.js`
- Test: `test/freeze.test.js`

**Interfaces:**
- Consumes: settings shape from Task 1 (`discardAnimation`, `discardDuration`).
- Produces: `DISCARD_DURATION_VALUES: number[]` (`[400, 800, 1200, 1600]`),
  `DEFAULT_DISCARD_DURATION = 1`; `freezeConfigFromSettings(s)` result gains
  `discardAnimation: boolean` and `discardMs: number`. Task 3 (scanner)
  consumes both fields.

- [ ] **Step 1: Write the failing tests**

In `test/freeze.test.js`, extend the first test's input object with
`discardAnimation: false, discardDuration: 0,` and its `assert.deepEqual`
expectation with `discardAnimation: false, discardMs: 400,`. Then append:

```js
test("discard defaults: animation on, index 1 → 800ms", () => {
  const cfg = freezeConfigFromSettings({
    freezeMode: "auto",
    freezeTimer: 1,
    freezeTapDelay: 2,
    freezeAutoDelay: 2,
    discardAnimation: true,
    discardDuration: 1,
  });
  assert.equal(cfg.discardAnimation, true);
  assert.equal(cfg.discardMs, 800);
});

test("out-of-range discard index falls back to 800ms; missing flag means on", () => {
  const cfg = freezeConfigFromSettings({
    freezeMode: "auto",
    freezeTimer: 1,
    freezeTapDelay: 2,
    freezeAutoDelay: 2,
    discardDuration: 99,
  });
  assert.equal(cfg.discardAnimation, true); // absent flag → enabled
  assert.equal(cfg.discardMs, 800); // DEFAULT_DISCARD_DURATION → 800ms
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- test/freeze.test.js`
Expected: FAIL — `discardMs` is `undefined`, and the first test's
`deepEqual` reports the missing keys.

- [ ] **Step 3: Implement**

In `www/js/freeze.js`, after `FREEZE_AUTO_DELAY_VALUES`:

```js
/** @type {number[]} Discard-animation durations in ms, shortest first. */
export const DISCARD_DURATION_VALUES = [400, 800, 1200, 1600];
```

After `DEFAULT_FREEZE_AUTO_DELAY`:

```js
/** Default preset index for the discard-animation duration (→ 800ms). */
export const DEFAULT_DISCARD_DURATION = 1;
```

In `freezeConfigFromSettings`, extend the JSDoc param type with
`discardAnimation:boolean, discardDuration:number` and the return type with
`discardAnimation:boolean, discardMs:number`, and add to the returned
object:

```js
    discardAnimation: s.discardAnimation !== false,
    discardMs: resolve(DISCARD_DURATION_VALUES, s.discardDuration, DEFAULT_DISCARD_DURATION),
```

Also update the module docblock's first paragraph to mention that the
discard-animation presets live here too (one sentence). Note the discard
values are **shortest first**, unlike the freeze sliders — say so in the
`DISCARD_DURATION_VALUES` comment if not already clear from "shortest
first".

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- test/freeze.test.js`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add www/js/freeze.js test/freeze.test.js
git commit -m "feat: resolve discard-animation config from settings"
```

---

### Task 3: New discard motion (CSS + scanner plumbing)

**Files:**
- Modify: `www/css/styles.css` (the `#freeze.discarding, #overlay.discarding` block, currently near line 79)
- Modify: `www/js/scanner.js`

**Interfaces:**
- Consumes: `freezeConfigFromSettings(...)` → `discardAnimation`, `discardMs` (Task 2; the import already exists in `scanner.js`).
- Produces: CSS custom properties `--discard-ms` (duration) and `--discard-shift` (downward travel in px), set inline on `#freeze` and `#overlay`. No JS-facing surface for later tasks.

- [ ] **Step 1: Replace the `.discarding` CSS**

In `www/css/styles.css`, replace the existing block (comment included):

```css
/* Discard animation: the freeze layers shrink slightly towards the detected
   code (transform-origin set inline by scanner.js) and fade out over 800ms.
   The transition lives on .discarding only, so removing the class mid-flight
   snaps the layers back to full scale/opacity instantly — used when a new
   freeze interrupts a running discard. */
#freeze.discarding,
#overlay.discarding {
  opacity: 0;
  transform: scale(0.85);
  transition:
    opacity 800ms ease-out,
    transform 800ms ease-out;
}
```

with:

```css
/* Discard animation: the freeze layers shrink slightly towards the detected
   code (transform-origin set inline by scanner.js), slide down until the code
   center reaches the panel's bottom edge (--discard-shift, set inline at draw
   time), and fade out. The frame itself additionally darkens to 50%
   brightness. Durations come from --discard-ms (set inline from settings on
   discard). Fade and darken are linear; the transform (slide + shrink) uses a
   mild ease-in so the movement accelerates slightly. translateY comes before
   scale so the shift is not scaled down by the shrink. The transition lives
   on .discarding only, so removing the class mid-flight snaps the layers
   back instantly — used when a new freeze interrupts a running discard. */
#freeze.discarding,
#overlay.discarding {
  opacity: 0;
  transform: translateY(var(--discard-shift, 0px)) scale(0.85);
  transition:
    opacity var(--discard-ms, 800ms) linear,
    transform var(--discard-ms, 800ms) cubic-bezier(0.4, 0, 0.8, 0.6);
}

/* Only the frozen frame darkens; the highlight polygon keeps its color. */
#freeze.discarding {
  filter: brightness(0.5);
  transition:
    opacity var(--discard-ms, 800ms) linear,
    filter var(--discard-ms, 800ms) linear,
    transform var(--discard-ms, 800ms) cubic-bezier(0.4, 0, 0.8, 0.6);
}
```

- [ ] **Step 2: Set the custom properties and honor the config in `scanner.js`**

In `www/js/scanner.js`:

(a) Replace the fallback constant (currently near line 61):

```js
  // Fallback delay (ms) before force-hiding the freeze layers if the 800ms
  // discard transition's transitionend event never fires.
  const DISCARD_FALLBACK_MS = 850;
```

with:

```js
  // Slack (ms) added to the configured discard duration for the fallback
  // timer that force-hides the freeze layers if transitionend never fires.
  const DISCARD_FALLBACK_SLACK_MS = 50;
```

(b) In `drawFreeze()`, right after the two `transformOrigin` assignments,
compute and store the downward travel — the distance from the code center to
the panel's bottom edge, so the center lands exactly on the edge at
animation end:

```js
    const shift = Math.max(0, panel.clientHeight - mask.originY);
    freeze.style.setProperty("--discard-shift", `${shift}px`);
    overlay.style.setProperty("--discard-shift", `${shift}px`);
```

Extend the `drawFreeze` JSDoc: it also records the downward travel
(`--discard-shift`) the layers slide on discard.

(c) Replace `resume()` (keep its JSDoc, updated as shown):

```js
  /**
   * Discard the frozen overlay and resume processing (the camera never
   * stopped). The decoded-text bar and tap hint hide immediately. When the
   * fade-off animation is enabled, the freeze/overlay layers darken, slide
   * down, shrink, and fade over the configured duration (via --discard-ms)
   * and are hidden once the CSS transition ends, with a timeout fallback in
   * case transitionend never fires; when disabled they hide instantly.
   */
  function resume() {
    if (!frozen) return;
    frozen = false;
    content.hidden = true;
    tapHint.hidden = true;
    const { discardAnimation, discardMs } = freezeConfigFromSettings(settings.get());
    if (!discardAnimation) {
      endDiscard();
      return;
    }
    freeze.style.setProperty("--discard-ms", `${discardMs}ms`);
    overlay.style.setProperty("--discard-ms", `${discardMs}ms`);
    freeze.classList.add("discarding");
    overlay.classList.add("discarding");
    discardTimer = setTimeout(endDiscard, discardMs + DISCARD_FALLBACK_SLACK_MS);
  }
```

(d) In the module docblock, change "discards it with an 800ms
shrink-and-fade animation" to "discards it with a configurable darken,
slide-down, shrink, and fade animation".

Reading the config inside `resume()` means a settings change applies to the
very next discard with no extra plumbing; `refreshFreezeConfig()` stays
untouched.

- [ ] **Step 3: Run the full test suite (guard against regressions)**

Run: `npm test`
Expected: PASS — no unit tests cover scanner DOM behavior; this confirms
nothing else broke.

- [ ] **Step 4: Manual smoke check (dev machine)**

Run: `npm run serve`, open `http://localhost:8000` in a desktop browser with
a webcam (or verify by inspection if no camera): scan/freeze, then observe
the discard — frame darkens and slides down while shrinking and fading; the
code center ends at the camera panel's bottom edge. Full phone verification
happens after deploy.

- [ ] **Step 5: Commit**

```bash
git add www/css/styles.css www/js/scanner.js
git commit -m "feat: darken, slide-down discard motion with configurable duration"
```

---

### Task 4: Options-panel controls

**Files:**
- Modify: `www/index.html` (Scanner section, after the `opt-freeze` fieldset, currently near line 93)
- Modify: `www/js/ui/options-menu.js`

**Interfaces:**
- Consumes: `settings.get().discardAnimation` / `.discardDuration`,
  `settings.setDiscardAnimation(boolean)`, `settings.setDiscardDuration(number)` (Task 1).
- Produces: DOM controls `#opt-discard-anim` (checkbox) and
  `#opt-discard-duration` (range 0–3). Nothing downstream consumes them.

- [ ] **Step 1: Add the markup**

In `www/index.html`, inside the Scanner `opt-group` section, directly after
the closing `</fieldset>` of the `opt-freeze` fieldset:

```html
          <label class="opt-row">
            <span>Fade-off animation</span>
            <input id="opt-discard-anim" type="checkbox" />
          </label>

          <label class="opt-row">
            <span>Animation duration</span>
            <input
              id="opt-discard-duration"
              type="range"
              min="0"
              max="3"
              step="1"
              aria-label="Fade-off animation duration"
            />
          </label>
```

No new CSS: `opt-row` already styles both control types.

- [ ] **Step 2: Wire the controls**

In `www/js/ui/options-menu.js`:

(a) Element lookups, after the `freezeAuto` line:

```js
  const discardAnim = document.getElementById("opt-discard-anim");
  const discardDuration = document.getElementById("opt-discard-duration");
```

(b) In `open()`, after `freezeAuto.value = String(s.freezeAutoDelay);`:

```js
    discardAnim.checked = s.discardAnimation;
    discardDuration.value = String(s.discardDuration);
```

(c) Listeners, after the `freezeAuto` listener:

```js
  discardAnim.addEventListener("change", () => {
    settings.setDiscardAnimation(discardAnim.checked);
    onSettingsChange();
  });

  discardDuration.addEventListener("input", () => {
    settings.setDiscardDuration(Number(discardDuration.value));
    onSettingsChange();
  });
```

(d) Update the factory docblock's control list to mention the fade-off
animation toggle and duration slider.

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: PASS (options UI has no unit tests, per project convention — DOM
overlays are verified manually).

- [ ] **Step 4: Manual smoke check**

Run: `npm run serve`, open `http://localhost:8000`: open Options → Scanner
shows both new rows; toggle + slider persist across a reload (localStorage);
slider left = 400ms, right = 1600ms.

- [ ] **Step 5: Commit**

```bash
git add www/index.html www/js/ui/options-menu.js
git commit -m "feat: fade-off animation toggle and duration slider in options"
```

---

### Task 5: Service-worker cache bump + final verification

**Files:**
- Modify: `www/sw.js:5`

**Interfaces:**
- Consumes: nothing new. No new files were added, so the precache `ASSETS` list is unchanged.

- [ ] **Step 1: Bump the cache version**

In `www/sw.js`, change:

```js
const CACHE = "dms-v11";
```

to:

```js
const CACHE = "dms-v12";
```

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS — all suites green.

- [ ] **Step 3: Commit**

```bash
git add www/sw.js
git commit -m "chore: bump service worker cache to v12 for discard-animation update"
```

- [ ] **Step 4: On-device verification (after deploy)**

After merging to `main` and pulling on the VPS, verify on a phone (mobile
Chrome and Firefox; on Firefox/Android fully restart the browser to clear
the stale SW cache):

- discard motion: darken to 50%, slide down (code center reaches the panel's
  bottom edge), shrink, fade; slide visibly accelerates;
- duration slider: 400ms feels snappy, 1600ms slow; applies to the next
  discard without reopening the app;
- toggle off: frame disappears instantly on unfreeze;
- interruption: re-scan during a discard snaps the new freeze in cleanly;
- camera-off mid-discard hides the layers immediately.
