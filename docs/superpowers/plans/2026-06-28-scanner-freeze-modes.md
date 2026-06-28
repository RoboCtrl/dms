# Scanner Freeze Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the scanner's post-recognition freeze behaviour user-selectable between tap-to-continue, auto-resume-after-timer, and automatic-unfreeze-when-code-leaves, configured from a new "Scanner" section in the options menu.

**Architecture:** A new pure, time-injected `freeze-controller.js` owns all freeze lifecycle/timing decisions; `scanner.js` becomes thin DOM glue that feeds it decode frames and taps. Preset value arrays + an index→seconds resolver live in a pure `freeze.js` (mirroring `viewport.js`). Settings persist the mode and three per-mode slider indices (mirroring `cameraHeight`). The options menu gains radios + sliders that reconfigure the live scanner.

**Tech Stack:** Vanilla ES modules, no build step, `node --test` for unit tests, `localStorage` for persistence, vendored ZXing for decoding.

## Global Constraints

- Pure front-end only; no server, no remote storage; runs from static files on mobile Chrome + Firefox (portrait). — from CLAUDE.md
- Code and comments in American English. — from CLAUDE.md
- Document every function in-code: purpose, args, types, return values. — from CLAUDE.md
- The entire runtime lives under `www/`; everything else is dev-only. — from CLAUDE.md
- Tests run with `npm test` (`node --test`); pure units inject time as a parameter (see `scan-gate.js`). — from spec
- Settings persist as **preset indices**, consistent with `cameraHeight`. — from spec
- Default mode is `auto`; slider leftmost position = longest duration. — from spec
- Per-prompt change log in `./claude-log` (git-ignored); commit each prompt's work to `dev-claude`. — from CLAUDE.md

### Preset values (verbatim from spec)

| Mode | Setting key | Values (index 0 → last) | Default index | Default value |
|------|-------------|-------------------------|---------------|---------------|
| `timer` ("Continue after:") | `freezeTimer` | `[5, 2, 1, 0.5]` | 1 | 2s |
| `tap` ("Tap to continue, delayed by") | `freezeTapDelay` | `[2, 1, 0.5, 0]` | 2 | 0.5s |
| `auto` ("Automatic unfreeze, delayed by:") | `freezeAutoDelay` | `[2, 1, 0.5, 0]` | 2 | 0.5s |
| — | `freezeMode` | `"tap" \| "timer" \| "auto"` | — | `"auto"` |

---

## File Structure

- **Create** `www/js/freeze.js` — preset value arrays, default indices, mode list, and `freezeConfigFromSettings(settings)` resolver (pure, no DOM).
- **Create** `www/js/util/freeze-controller.js` — pure freeze lifecycle state machine, time injected.
- **Create** `test/freeze.test.js` — resolver + fallback tests.
- **Create** `test/freeze-controller.test.js` — all three modes + cooldown/debounce tests.
- **Modify** `www/js/settings.js` — new defaults + setters.
- **Modify** `test/settings.test.js` — new defaults/round-trip assertions.
- **Modify** `www/js/scanner.js` — integrate controller, tap hint, `refreshFreezeConfig()`.
- **Modify** `www/index.html` — tap-hint element; Scanner options section (move cam-height in, add radios/sliders).
- **Modify** `www/css/styles.css` — tap-hint + freeze-row styles.
- **Modify** `www/js/ui/options-menu.js` — wire radios/sliders.
- **Modify** `www/js/app.js` — reconfigure scanner on settings change.

---

## Task 1: Settings keys for freeze mode

**Files:**
- Modify: `www/js/settings.js`
- Test: `test/settings.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: settings object now includes `freezeMode: "tap"|"timer"|"auto"` (default `"auto"`), `freezeTimer: number` (default `1`), `freezeTapDelay: number` (default `2`), `freezeAutoDelay: number` (default `2`); plus setters `setFreezeMode(mode)`, `setFreezeTimer(index)`, `setFreezeTapDelay(index)`, `setFreezeAutoDelay(index)`.

- [ ] **Step 1: Write the failing tests**

Add to `test/settings.test.js`:

```javascript
test("freeze defaults: auto mode, indices 1/2/2", () => {
  const s = createSettings(fakeStorage());
  const g = s.get();
  assert.equal(g.freezeMode, "auto");
  assert.equal(g.freezeTimer, 1);
  assert.equal(g.freezeTapDelay, 2);
  assert.equal(g.freezeAutoDelay, 2);
});

test("freeze setters persist across instances", () => {
  const storage = fakeStorage();
  const s1 = createSettings(storage);
  s1.setFreezeMode("tap");
  s1.setFreezeTimer(0);
  s1.setFreezeTapDelay(3);
  s1.setFreezeAutoDelay(0);
  const s2 = createSettings(storage);
  const g = s2.get();
  assert.equal(g.freezeMode, "tap");
  assert.equal(g.freezeTimer, 0);
  assert.equal(g.freezeTapDelay, 3);
  assert.equal(g.freezeAutoDelay, 0);
});
```

Also update the existing `"defaults to dark theme and duplicates shown"` test's `deepEqual` to include the new keys:

```javascript
  assert.deepEqual(s.get(), {
    theme: "dark",
    hideDuplicates: false,
    cameraOn: true,
    cameraHeight: 3,
    freezeMode: "auto",
    freezeTimer: 1,
    freezeTapDelay: 2,
    freezeAutoDelay: 2,
  });
```

And the `"persists theme and hideDuplicates across instances"` test's `deepEqual` similarly (it asserts the full object), adding the same four new keys with their default values.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — new keys are `undefined`, `setFreezeMode is not a function`.

- [ ] **Step 3: Add defaults and setters**

In `www/js/settings.js`, extend `DEFAULTS`:

```javascript
const DEFAULTS = {
  theme: "dark",
  hideDuplicates: false,
  cameraOn: true,
  cameraHeight: 3,
  freezeMode: "auto",
  freezeTimer: 1,
  freezeTapDelay: 2,
  freezeAutoDelay: 2,
};
```

Update both `get()` and `update()` JSDoc `@returns`/`@param` type literals to include the new keys (`freezeMode:"tap"|"timer"|"auto", freezeTimer:number, freezeTapDelay:number, freezeAutoDelay:number`).

Add these setters to the returned object (after `setCameraHeight`):

```javascript
    /**
     * Set and persist the active scanner freeze mode.
     * @param {"tap"|"timer"|"auto"} mode
     */
    setFreezeMode(mode) {
      update({ freezeMode: mode });
    },
    /**
     * Set and persist the timer-mode duration preset index.
     * @param {number} index - Index into the freeze-timer presets.
     */
    setFreezeTimer(index) {
      update({ freezeTimer: index });
    },
    /**
     * Set and persist the tap-mode post-resume cooldown preset index.
     * @param {number} index - Index into the tap-delay presets.
     */
    setFreezeTapDelay(index) {
      update({ freezeTapDelay: index });
    },
    /**
     * Set and persist the auto-mode absence-debounce preset index.
     * @param {number} index - Index into the auto-delay presets.
     */
    setFreezeAutoDelay(index) {
      update({ freezeAutoDelay: index });
    },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (all settings tests green).

- [ ] **Step 5: Commit**

```bash
git add www/js/settings.js test/settings.test.js
git commit -m "feat: persist scanner freeze mode settings

Add freezeMode plus three per-mode slider preset indices
(freezeTimer/freezeTapDelay/freezeAutoDelay) to settings, defaulting to
automatic-unfreeze. New setters mirror the existing cameraHeight pattern.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Freeze presets + config resolver

**Files:**
- Create: `www/js/freeze.js`
- Test: `test/freeze.test.js`

**Interfaces:**
- Consumes: a settings-shaped object `{ freezeMode, freezeTimer, freezeTapDelay, freezeAutoDelay }` (from Task 1).
- Produces:
  - `FREEZE_TIMER_VALUES = [5, 2, 1, 0.5]`, `FREEZE_TAP_DELAY_VALUES = [2, 1, 0.5, 0]`, `FREEZE_AUTO_DELAY_VALUES = [2, 1, 0.5, 0]`
  - `DEFAULT_FREEZE_TIMER = 1`, `DEFAULT_FREEZE_TAP_DELAY = 2`, `DEFAULT_FREEZE_AUTO_DELAY = 2`
  - `FREEZE_MODES = ["tap", "timer", "auto"]`, `DEFAULT_FREEZE_MODE = "auto"`
  - `freezeConfigFromSettings(s)` → `{ mode: string, timerSec: number, tapDelaySec: number, autoDelaySec: number }` (out-of-range indices fall back to the default index).

- [ ] **Step 1: Write the failing tests**

Create `test/freeze.test.js`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { freezeConfigFromSettings } from "../www/js/freeze.js";

test("resolves indices to seconds", () => {
  const cfg = freezeConfigFromSettings({
    freezeMode: "timer",
    freezeTimer: 0,
    freezeTapDelay: 1,
    freezeAutoDelay: 3,
  });
  assert.deepEqual(cfg, {
    mode: "timer",
    timerSec: 5,
    tapDelaySec: 1,
    autoDelaySec: 0,
  });
});

test("default indices map to spec defaults", () => {
  const cfg = freezeConfigFromSettings({
    freezeMode: "auto",
    freezeTimer: 1,
    freezeTapDelay: 2,
    freezeAutoDelay: 2,
  });
  assert.equal(cfg.timerSec, 2);
  assert.equal(cfg.tapDelaySec, 0.5);
  assert.equal(cfg.autoDelaySec, 0.5);
});

test("out-of-range index falls back to the default preset", () => {
  const cfg = freezeConfigFromSettings({
    freezeMode: "auto",
    freezeTimer: 99,
    freezeTapDelay: -1,
    freezeAutoDelay: undefined,
  });
  assert.equal(cfg.timerSec, 2); // DEFAULT_FREEZE_TIMER → 2s
  assert.equal(cfg.tapDelaySec, 0.5); // DEFAULT_FREEZE_TAP_DELAY → 0.5s
  assert.equal(cfg.autoDelaySec, 0.5); // DEFAULT_FREEZE_AUTO_DELAY → 0.5s
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../www/js/freeze.js'`.

- [ ] **Step 3: Implement `freeze.js`**

Create `www/js/freeze.js`:

```javascript
/**
 * Scanner freeze presets and the settings→config resolver.
 *
 * The options panel exposes one radio per freeze mode, each paired with a
 * 4-position slider. Each slider position maps to one of the second-values
 * below; settings persist the chosen index (like camera-height). This module
 * is pure (no DOM) so both the scanner and the options menu — and the unit
 * tests — share one source of truth. Index 0 is the longest duration so the
 * leftmost slider position is the longest, per the design.
 */

/** @type {number[]} Timer-mode durations in seconds, longest first. */
export const FREEZE_TIMER_VALUES = [5, 2, 1, 0.5];
/** @type {number[]} Tap-mode post-resume cooldowns in seconds, longest first. */
export const FREEZE_TAP_DELAY_VALUES = [2, 1, 0.5, 0];
/** @type {number[]} Auto-mode absence debounces in seconds, longest first. */
export const FREEZE_AUTO_DELAY_VALUES = [2, 1, 0.5, 0];

/** Default preset index for timer mode (→ 2s). */
export const DEFAULT_FREEZE_TIMER = 1;
/** Default preset index for tap mode (→ 0.5s). */
export const DEFAULT_FREEZE_TAP_DELAY = 2;
/** Default preset index for auto mode (→ 0.5s). */
export const DEFAULT_FREEZE_AUTO_DELAY = 2;

/** @type {string[]} Valid freeze modes. */
export const FREEZE_MODES = ["tap", "timer", "auto"];
/** Default freeze mode. */
export const DEFAULT_FREEZE_MODE = "auto";

/**
 * Resolve a preset index to its second-value, falling back to the preset at
 * `defaultIndex` when `index` is out of range. Keeps a malformed stored index
 * from producing `undefined` seconds.
 * @param {number[]} values - Preset value array.
 * @param {number} index - Stored preset index.
 * @param {number} defaultIndex - Fallback index into `values`.
 * @returns {number} The resolved seconds value.
 */
function resolve(values, index, defaultIndex) {
  return values[index] ?? values[defaultIndex];
}

/**
 * Build a freeze-controller config from a settings-shaped object, converting
 * the persisted preset indices into second-values the controller understands.
 * @param {{freezeMode:string, freezeTimer:number, freezeTapDelay:number, freezeAutoDelay:number}} s
 * @returns {{mode:string, timerSec:number, tapDelaySec:number, autoDelaySec:number}}
 */
export function freezeConfigFromSettings(s) {
  return {
    mode: FREEZE_MODES.includes(s.freezeMode) ? s.freezeMode : DEFAULT_FREEZE_MODE,
    timerSec: resolve(FREEZE_TIMER_VALUES, s.freezeTimer, DEFAULT_FREEZE_TIMER),
    tapDelaySec: resolve(FREEZE_TAP_DELAY_VALUES, s.freezeTapDelay, DEFAULT_FREEZE_TAP_DELAY),
    autoDelaySec: resolve(FREEZE_AUTO_DELAY_VALUES, s.freezeAutoDelay, DEFAULT_FREEZE_AUTO_DELAY),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add www/js/freeze.js test/freeze.test.js
git commit -m "feat: freeze presets and settings resolver

Add www/js/freeze.js holding the per-mode slider preset arrays, default
indices, and freezeConfigFromSettings() which converts persisted indices
to second-values with out-of-range fallback. Pure module shared by the
scanner, options menu, and tests.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Freeze lifecycle controller

**Files:**
- Create: `www/js/util/freeze-controller.js`
- Test: `test/freeze-controller.test.js`

**Interfaces:**
- Consumes: a config `{ mode, timerSec, tapDelaySec, autoDelaySec }` (from Task 2's resolver shape).
- Produces: `createFreezeController(config)` → object with:
  - `onResult(content, now)` — `content` is the decoded string this frame or `null` if none; `now` is ms. Returns `"freeze"` (start a fresh freeze), `"unfreeze"` (clear the freeze), or `"none"`.
  - `onTap(now)` — returns `"unfreeze"` or `"none"` (only acts in `tap` mode while frozen).
  - `setConfig(config)` — replace the live config (same shape).
  - `isFrozen()` — boolean.

**Behaviour contract (implement exactly):**
- Not frozen: a `null` content → `"none"`. A non-null content while `now < cooldownUntil` → `"none"` (post-resume cooldown, only ever set by `tap`). Otherwise freeze: record `frozenContent=content`, `freezeStart=now`, `lastSeenSame=now`, return `"freeze"`.
- Frozen, `tap`: `onResult` always returns `"none"`; only `onTap` unfreezes and sets `cooldownUntil = now + tapDelaySec*1000`.
- Frozen, `timer`: when `now - freezeStart >= timerSec*1000` → unfreeze (no cooldown), else `"none"`.
- Frozen, `auto`: if `content === frozenContent` → `lastSeenSame=now`, `"none"` (a different code or `null` does NOT update it); else if `now - lastSeenSame >= autoDelaySec*1000` → unfreeze (no extra cooldown; the absence wait already served as the delay), else `"none"`.

- [ ] **Step 1: Write the failing tests**

Create `test/freeze-controller.test.js`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { createFreezeController } from "../www/js/util/freeze-controller.js";

const base = { mode: "auto", timerSec: 2, tapDelaySec: 0.5, autoDelaySec: 0.5 };

test("freezes on first detected code", () => {
  const c = createFreezeController({ ...base, mode: "tap" });
  assert.equal(c.onResult("A", 0), "freeze");
  assert.equal(c.isFrozen(), true);
});

test("null content never freezes", () => {
  const c = createFreezeController({ ...base, mode: "tap" });
  assert.equal(c.onResult(null, 0), "none");
  assert.equal(c.isFrozen(), false);
});

test("tap: stays frozen until tap, then cooldown blocks re-freeze", () => {
  const c = createFreezeController({ ...base, mode: "tap", tapDelaySec: 0.5 });
  c.onResult("A", 0);
  assert.equal(c.onResult("A", 1000), "none"); // still frozen, no auto-resume
  assert.equal(c.onTap(1000), "unfreeze");
  assert.equal(c.onResult("A", 1200), "none"); // within 500ms cooldown
  assert.equal(c.onResult("A", 1500), "freeze"); // cooldown elapsed
});

test("tap: zero delay allows immediate re-freeze", () => {
  const c = createFreezeController({ ...base, mode: "tap", tapDelaySec: 0 });
  c.onResult("A", 0);
  c.onTap(1000);
  assert.equal(c.onResult("A", 1000), "freeze");
});

test("timer: auto-resumes after the configured duration", () => {
  const c = createFreezeController({ ...base, mode: "timer", timerSec: 2 });
  c.onResult("A", 0);
  assert.equal(c.onResult("A", 1999), "none");
  assert.equal(c.onResult("A", 2000), "unfreeze");
});

test("auto: same code keeps it frozen indefinitely", () => {
  const c = createFreezeController({ ...base, mode: "auto", autoDelaySec: 0.5 });
  c.onResult("A", 0);
  assert.equal(c.onResult("A", 5000), "none");
  assert.equal(c.onResult("A", 10000), "none");
  assert.equal(c.isFrozen(), true);
});

test("auto: unfreezes after code absent for the debounce window", () => {
  const c = createFreezeController({ ...base, mode: "auto", autoDelaySec: 0.5 });
  c.onResult("A", 0);
  assert.equal(c.onResult(null, 200), "none"); // absent 200ms
  assert.equal(c.onResult(null, 500), "unfreeze"); // absent >= 500ms
});

test("auto: a different code counts as absence", () => {
  const c = createFreezeController({ ...base, mode: "auto", autoDelaySec: 0.5 });
  c.onResult("A", 0);
  assert.equal(c.onResult("B", 200), "none");
  assert.equal(c.onResult("B", 500), "unfreeze");
});

test("auto: reappearance of same code resets the debounce", () => {
  const c = createFreezeController({ ...base, mode: "auto", autoDelaySec: 0.5 });
  c.onResult("A", 0);
  c.onResult(null, 300); // absent, not yet expired
  assert.equal(c.onResult("A", 400), "none"); // seen again → reset
  assert.equal(c.onResult(null, 800), "none"); // only 400ms since reset
  assert.equal(c.onResult(null, 900), "unfreeze"); // 500ms since reset
});

test("auto: zero delay unfreezes on first absent frame", () => {
  const c = createFreezeController({ ...base, mode: "auto", autoDelaySec: 0 });
  c.onResult("A", 0);
  assert.equal(c.onResult(null, 0), "unfreeze");
});

test("setConfig switches behaviour", () => {
  const c = createFreezeController({ ...base, mode: "auto", autoDelaySec: 0.5 });
  c.onResult("A", 0);
  c.setConfig({ ...base, mode: "tap", tapDelaySec: 0 });
  assert.equal(c.onResult(null, 100), "none"); // tap: never auto-unfreezes
  assert.equal(c.onTap(100), "unfreeze");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../www/js/util/freeze-controller.js'`.

- [ ] **Step 3: Implement `freeze-controller.js`**

Create `www/js/util/freeze-controller.js`:

```javascript
/**
 * Pure freeze-lifecycle state machine for the scanner. Decides when to start a
 * freeze after a recognition and when to clear it, per the selected mode, with
 * all timing driven by an injected `now` (ms) so it is fully unit-testable —
 * the DOM glue in scanner.js holds no timing logic. Time is fed frame-by-frame
 * via onResult; taps via onTap.
 *
 * Modes:
 *  - "tap":   stays frozen until onTap; after a tap, a post-resume cooldown
 *             (tapDelaySec) blocks the next freeze.
 *  - "timer": auto-unfreezes timerSec after the freeze began.
 *  - "auto":  stays frozen while the SAME code keeps being seen; unfreezes once
 *             that code has been absent (different code or none) for
 *             autoDelaySec.
 *
 * @param {{mode:string, timerSec:number, tapDelaySec:number, autoDelaySec:number}} config
 * @returns {{onResult:(content:string|null, now:number)=>("freeze"|"unfreeze"|"none"), onTap:(now:number)=>("unfreeze"|"none"), setConfig:(config:object)=>void, isFrozen:()=>boolean}}
 */
export function createFreezeController(config) {
  let { mode, timerSec, tapDelaySec, autoDelaySec } = config;

  let frozen = false;
  let frozenContent = null;
  let freezeStart = 0;
  let lastSeenSame = 0;
  let cooldownUntil = 0;

  /** Clear freeze state. */
  function clear() {
    frozen = false;
    frozenContent = null;
  }

  return {
    /**
     * Feed one decode frame.
     * @param {string|null} content - Decoded code this frame, or null if none.
     * @param {number} now - Current time in ms.
     * @returns {"freeze"|"unfreeze"|"none"}
     */
    onResult(content, now) {
      if (!frozen) {
        if (content == null) return "none";
        if (now < cooldownUntil) return "none";
        frozen = true;
        frozenContent = content;
        freezeStart = now;
        lastSeenSame = now;
        return "freeze";
      }
      if (mode === "tap") return "none";
      if (mode === "timer") {
        if (now - freezeStart >= timerSec * 1000) {
          clear();
          return "unfreeze";
        }
        return "none";
      }
      // auto
      if (content === frozenContent) {
        lastSeenSame = now;
        return "none";
      }
      if (now - lastSeenSame >= autoDelaySec * 1000) {
        clear();
        return "unfreeze";
      }
      return "none";
    },

    /**
     * Handle a viewport tap. Only unfreezes in tap mode while frozen, arming
     * the post-resume cooldown.
     * @param {number} now - Current time in ms.
     * @returns {"unfreeze"|"none"}
     */
    onTap(now) {
      if (!frozen || mode !== "tap") return "none";
      clear();
      cooldownUntil = now + tapDelaySec * 1000;
      return "unfreeze";
    },

    /**
     * Replace the live configuration (e.g. when options change).
     * @param {{mode:string, timerSec:number, tapDelaySec:number, autoDelaySec:number}} next
     */
    setConfig(next) {
      mode = next.mode;
      timerSec = next.timerSec;
      tapDelaySec = next.tapDelaySec;
      autoDelaySec = next.autoDelaySec;
    },

    /** @returns {boolean} Whether the scanner is currently frozen. */
    isFrozen() {
      return frozen;
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (all freeze-controller tests green).

- [ ] **Step 5: Commit**

```bash
git add www/js/util/freeze-controller.js test/freeze-controller.test.js
git commit -m "feat: pure freeze-lifecycle controller

Add createFreezeController, a time-injected state machine that decides
freeze/unfreeze per mode: tap (manual + post-resume cooldown), timer
(auto-resume), and auto (stay frozen while the same code is seen,
unfreeze after it is absent for the debounce window). Fully unit-tested.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Wire the controller into the scanner

**Files:**
- Modify: `www/js/scanner.js`
- Modify: `www/index.html` (add tap-hint element)
- Modify: `www/css/styles.css` (tap-hint styles)
- Modify: `www/js/app.js` (reconfigure scanner on settings change)

**Interfaces:**
- Consumes: `createFreezeController` (Task 3), `freezeConfigFromSettings` (Task 2), settings (Task 1).
- Produces: `createScanner(...)` return object gains `refreshFreezeConfig()` (re-reads settings and calls `controller.setConfig`). The decode loop and tap handler route through the controller; the tap hint shows only in `tap` mode while frozen.

This task is DOM glue; it has no unit test (consistent with the codebase). Verify via `npm test` (nothing breaks) plus a manual smoke test.

- [ ] **Step 1: Add the tap-hint element to `index.html`**

Inside `#camera-panel`, after the `#reticle` div (line ~24), add:

```html
        <div id="tap-hint" hidden>Tap to continue scanning</div>
```

- [ ] **Step 2: Add tap-hint styles to `styles.css`**

After the `#reticle i:nth-child(4)` rule (~line 134), add:

```css
/* Tap-to-continue hint shown while frozen in tap mode. */
#tap-hint {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 44px;
  text-align: center;
  color: #fff;
  font-weight: bold;
  pointer-events: none;
  text-shadow:
    -1px -1px 0 #000,
    1px -1px 0 #000,
    -1px 1px 0 #000,
    1px 1px 0 #000;
}
```

(`bottom: 44px` keeps it just above the `#scan-content` decoded-text bar.)

- [ ] **Step 3: Integrate the controller in `scanner.js`**

Add imports near the top (after the existing `createScanGate` import):

```javascript
import { createFreezeController } from "./util/freeze-controller.js";
import { freezeConfigFromSettings } from "./freeze.js";
```

Grab the tap-hint element alongside the other element refs (after `const reticle = ...`):

```javascript
  const tapHint = document.getElementById("tap-hint");
```

Create the controller after `const gate = createScanGate(2000);`:

```javascript
  const freezeCtl = createFreezeController(freezeConfigFromSettings(settings.get()));
```

Replace the `resume()` function so it also hides the tap hint:

```javascript
  /** Clear the frozen overlay and resume processing (camera never stopped). */
  function resume() {
    if (!frozen) return;
    frozen = false;
    freeze.hidden = true;
    overlay.hidden = true;
    content.hidden = true;
    tapHint.hidden = true;
  }
```

Replace the decode callback body in `startDecode()` (the `(result) => { ... }` passed to `decodeFromConstraints`) with controller-driven logic:

```javascript
        (result) => {
          const now = Date.now();
          const text = result ? result.getText() : null;
          const action = freezeCtl.onResult(text, now);
          if (action === "freeze") {
            frozen = true;
            drawFreeze(result.getResultPoints());
            content.textContent = text;
            content.hidden = false;
            tapHint.hidden = settings.get().freezeMode !== "tap";
            // Throttle duplicate records (e.g. brief flicker re-freeze).
            if (gate.accept(text, now)) onRecognized(text);
          } else if (action === "unfreeze") {
            resume();
          }
        },
```

Replace the panel click handler to route taps through the controller:

```javascript
  panel.addEventListener("click", (e) => {
    // Ignore clicks on the control buttons themselves.
    if (e.target.closest(".cam-ctrl")) return;
    if (freezeCtl.onTap(Date.now()) === "unfreeze") resume();
  });
```

Add `refreshFreezeConfig` to the returned object (alongside `start`):

```javascript
    /** Re-read freeze settings and apply them to the live controller. */
    refreshFreezeConfig() {
      freezeCtl.setConfig(freezeConfigFromSettings(settings.get()));
    },
```

Update the module-level JSDoc block at the top of `scanner.js` to mention that freeze lifecycle is delegated to `freeze-controller.js` and the resume trigger depends on the selected mode.

- [ ] **Step 4: Reconfigure the scanner on settings change in `app.js`**

Move scanner creation above the `createOptionsMenu` call, and have `onSettingsChange` reconfigure it. Replace the relevant block in `main()`:

```javascript
  const scanner = createScanner({
    onRecognized: (content) => store.recordScan(content),
    settings,
  });

  const history = createHistoryPanel({
    root: document.getElementById("history"),
    store,
    getHideDuplicates: () => settings.get().hideDuplicates,
  });
  const bottomBar = createBottomBar({ store });
  createOptionsMenu({
    store,
    settings,
    onSettingsChange: () => {
      render();
      scanner.refreshFreezeConfig();
    },
  });

  /** Re-render all store-driven UI. */
  function render() {
    history.render();
    bottomBar.render();
  }

  store.on("change", render);
  render();

  await scanner.start();
```

(Remove the original later `const scanner = createScanner(...)` / `await scanner.start();` lines so the scanner is only created once.)

- [ ] **Step 5: Run tests + manual smoke test**

Run: `npm test`
Expected: PASS (no regressions).

Then: `npm run serve`, open `http://localhost:8000` on a device/emulator with a camera over HTTPS/localhost. With the default `auto` mode, present a Data Matrix: it freezes; keep it in view → stays frozen; remove it → unfreezes after ~0.5s. (Mode switching is verified in Task 5.)
Expected: behaviour as described; no console errors.

- [ ] **Step 6: Commit**

```bash
git add www/js/scanner.js www/index.html www/css/styles.css www/js/app.js
git commit -m "feat: drive scanner freeze via the freeze controller

Route the decode loop and viewport taps through the freeze controller,
add the tap-to-continue hint element/styles, and expose
refreshFreezeConfig so options changes reconfigure the live scanner.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Scanner options section (UI + wiring)

**Files:**
- Modify: `www/index.html` (new Scanner section; move camera-height row in; radios + sliders)
- Modify: `www/css/styles.css` (freeze-row layout)
- Modify: `www/js/ui/options-menu.js` (wire radios + sliders)

**Interfaces:**
- Consumes: settings setters (Task 1), `onSettingsChange` which now also calls `scanner.refreshFreezeConfig()` (Task 4).
- Produces: a `Scanner` options group with the camera-height slider plus three radio+slider rows bound to `freezeMode` / `freezeTimer` / `freezeTapDelay` / `freezeAutoDelay`.

DOM glue; no unit test. Verify via manual smoke test.

- [ ] **Step 1: Restructure the options HTML**

In `www/index.html`, **remove** the standalone camera-height `label.opt-row` block (lines ~57–67). Then, **between** the `Hide duplicates` row and the `Database` section, insert:

```html
        <section class="opt-group">
          <h3>Scanner</h3>

          <label class="opt-row">
            <span>Camera viewport height</span>
            <input
              id="opt-cam-height"
              type="range"
              min="0"
              max="4"
              step="1"
              aria-label="Camera viewport height"
            />
          </label>

          <fieldset class="opt-freeze">
            <legend>Scanner freeze</legend>

            <label class="opt-freeze-row">
              <input type="radio" name="freeze-mode" value="timer" id="freeze-mode-timer" />
              <span>Continue after:</span>
              <input id="opt-freeze-timer" type="range" min="0" max="3" step="1"
                aria-label="Continue after duration" />
            </label>

            <label class="opt-freeze-row">
              <input type="radio" name="freeze-mode" value="tap" id="freeze-mode-tap" />
              <span>Tap to continue, delayed by</span>
              <input id="opt-freeze-tap" type="range" min="0" max="3" step="1"
                aria-label="Tap-to-continue delay" />
            </label>

            <label class="opt-freeze-row">
              <input type="radio" name="freeze-mode" value="auto" id="freeze-mode-auto" />
              <span>Automatic unfreeze, delayed by:</span>
              <input id="opt-freeze-auto" type="range" min="0" max="3" step="1"
                aria-label="Automatic unfreeze delay" />
            </label>
          </fieldset>
        </section>
```

- [ ] **Step 2: Add freeze-row styles**

In `www/css/styles.css`, after the `.opt-group` rule (~line 305), add:

```css
.opt-freeze {
  border: none;
  margin: 8px 0 0;
  padding: 0;
}

.opt-freeze legend {
  padding: 0;
  margin-bottom: 4px;
  font-weight: bold;
}

.opt-freeze-row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 8px;
  margin: 10px 0;
}

.opt-freeze-row input[type="range"] {
  width: 96px;
}
```

- [ ] **Step 3: Wire the controls in `options-menu.js`**

Add element refs in `createOptionsMenu` (after `const camHeight = ...`):

```javascript
  const freezeRadios = overlay.querySelectorAll('input[name="freeze-mode"]');
  const freezeTimer = document.getElementById("opt-freeze-timer");
  const freezeTap = document.getElementById("opt-freeze-tap");
  const freezeAuto = document.getElementById("opt-freeze-auto");
```

In `open()`, after `camHeight.value = String(s.cameraHeight);`, sync the new controls:

```javascript
    for (const radio of freezeRadios) {
      radio.checked = radio.value === s.freezeMode;
    }
    freezeTimer.value = String(s.freezeTimer);
    freezeTap.value = String(s.freezeTapDelay);
    freezeAuto.value = String(s.freezeAutoDelay);
```

After the existing `camHeight` listener, add the freeze listeners:

```javascript
  for (const radio of freezeRadios) {
    radio.addEventListener("change", () => {
      if (!radio.checked) return;
      settings.setFreezeMode(radio.value);
      onSettingsChange();
    });
  }

  freezeTimer.addEventListener("input", () => {
    settings.setFreezeTimer(Number(freezeTimer.value));
    onSettingsChange();
  });

  freezeTap.addEventListener("input", () => {
    settings.setFreezeTapDelay(Number(freezeTap.value));
    onSettingsChange();
  });

  freezeAuto.addEventListener("input", () => {
    settings.setFreezeAutoDelay(Number(freezeAuto.value));
    onSettingsChange();
  });
```

Update the `createOptionsMenu` JSDoc to note it also manages the Scanner freeze controls.

- [ ] **Step 4: Run tests + manual smoke test**

Run: `npm test`
Expected: PASS (no regressions).

Then `npm run serve` and open the app. Open Options → **Scanner** section:
- Camera-height slider still works (resizes viewport live).
- Select **Tap to continue** → scan a code: freezes, shows `Tap to continue scanning`; tapping resumes after the chosen delay.
- Select **Continue after** → scan: auto-resumes after the chosen seconds.
- Select **Automatic unfreeze** → scan: stays frozen while code present, resumes ~delay after it leaves.
- Reopen Options: the previously chosen mode + slider positions are restored.
Expected: all behave per spec; no console errors.

- [ ] **Step 5: Commit**

```bash
git add www/index.html www/css/styles.css www/js/ui/options-menu.js
git commit -m "feat: Scanner options section for freeze modes

Add a Scanner options group containing the (moved) camera viewport
height row and a Scanner-freeze radio+slider block for the three modes.
Wire the radios and sliders to settings; changes reconfigure the live
scanner immediately.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Three freeze modes (tap/timer/auto) → Task 3 (logic) + Task 4 (glue). ✓
- `Tap to continue scanning` hint, white text/black outline/centred/near bottom → Task 4 Steps 1–2. ✓
- Per-mode sliders with exact values + defaults → Task 1 (persist) + Task 2 (presets) + Task 5 (UI). ✓
- Default mode = auto → Task 1 default + Task 2 `DEFAULT_FREEZE_MODE`. ✓
- "different code counts as absence", "same code prevents unfreeze", post-resume cooldown semantics → Task 3 behaviour contract + tests. ✓
- Options menu: new `Scanner` section after `Hide duplicates`, camera-height moved in as first entry, `Scanner freeze` second → Task 5 Step 1. ✓
- Testable core, time-injected → Task 3. ✓
- Settings as indices (cameraHeight pattern) → Task 1. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"; every code step has full code. ✓

**Type consistency:** `freezeConfigFromSettings` returns `{mode,timerSec,tapDelaySec,autoDelaySec}`, consumed verbatim by `createFreezeController`/`setConfig`. Settings keys (`freezeMode/freezeTimer/freezeTapDelay/freezeAutoDelay`) and element ids (`opt-freeze-timer/-tap/-auto`, `freeze-mode-*`) are consistent across Tasks 1, 2, 4, 5. `onResult/onTap/setConfig/isFrozen` names match between Task 3 definition and Task 4 usage. ✓

---

## Reminder

Per project rules, also write a per-prompt change log to `./claude-log/YYYY-MM-DD__hh-mm-ss.log` (git-ignored) as part of the implementing prompt's work.
