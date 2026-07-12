# Freeze Radial Mask & Discard Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat 50%-opacity frozen scan frame with a radial alpha mask centered on the detected Data Matrix, and discard the frozen frame with an 800ms shrink-and-fade animation.

**Architecture:** A new pure geometry module (`freeze-mask.js`) computes the mask center (polygon centroid), the gradient radius (2/3 of the distance to the farthest visible corner under `object-fit: cover`), and the CSS transform-origin. `scanner.js` punches the gradient into the freeze canvas's alpha channel via `destination-in` compositing; the discard is a CSS transition (`opacity` + `transform: scale`) driven by a `.discarding` class, with interruption handling for re-freezes and camera-off.

**Tech Stack:** Vanilla ES modules, Canvas 2D, CSS transitions, `node --test` for unit tests. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-12-freeze-radial-mask-design.md`

## Global Constraints

- Pure front-end; everything deployable lives in `www/`. Tests/docs stay outside `www/`.
- Code and code comments in American English. Every function gets a JSDoc block (purpose, args, types, return values).
- Mask falloff: alpha 1 at the code centroid → alpha 0 at exactly **2/3** of the distance to the farthest visible corner.
- Discard animation: **800ms** ease-out, scale 1 → **0.85**, opacity 1 → 0; timeout fallback at **850ms**.
- Service worker: new module must be precached and the cache version bumped (`dms-v10` → `dms-v11`).
- Run tests from the repo root with `npm test` (wraps `node --test`).
- Commit each task to branch `dev-claude`.

---

### Task 1: Pure geometry module `freeze-mask.js`

**Files:**
- Create: `www/js/util/freeze-mask.js`
- Test: `test/freeze-mask.test.js`

**Interfaces:**
- Consumes: nothing (pure module, no imports).
- Produces: `computeFreezeMask({points, panelW, panelH, videoW, videoH})` →
  `{cx, cy, radius, originX, originY}` where `points` is a non-empty
  `Array<{x:number, y:number}>` in video-pixel coordinates, `cx`/`cy`/`radius`
  are in video pixels, and `originX`/`originY` are in panel CSS pixels.
  Task 2 imports this exact signature.

- [ ] **Step 1: Write the failing tests**

Create `test/freeze-mask.test.js` (mirrors the style of `test/crop-region.test.js`):

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeFreezeMask } from "../www/js/util/freeze-mask.js";

/**
 * Assert two numbers are equal within a small epsilon. Keeps the float
 * comparisons in these tests readable.
 * @param {number} actual - Computed value.
 * @param {number} expected - Expected value.
 */
function approx(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} !== ${expected}`);
}

// Square 1000x1000 video in a tall 400x800 panel: cover scale = 0.8, the
// width overflows by 200 CSS px per side, so the visible source rect is
// x:[250,750], y:[0,1000]. A centered square's centroid is the video center;
// all four visible corners are equidistant (hypot(250,500)).
test("centered code: centroid, radius from visible corners, CSS origin", () => {
  const m = computeFreezeMask({
    points: [
      { x: 400, y: 400 },
      { x: 600, y: 400 },
      { x: 600, y: 600 },
      { x: 400, y: 600 },
    ],
    panelW: 400,
    panelH: 800,
    videoW: 1000,
    videoH: 1000,
  });
  approx(m.cx, 500);
  approx(m.cy, 500);
  approx(m.radius, (2 / 3) * Math.hypot(250, 500));
  approx(m.originX, 200); // panel center
  approx(m.originY, 400);
});

// Off-center detection in the same geometry: the farthest visible corner is
// (750,1000), and the origin maps through scale 0.8 with offX = -200.
test("off-center code: farthest corner picked, origin mapped to CSS px", () => {
  const m = computeFreezeMask({
    points: [{ x: 300, y: 200 }],
    panelW: 400,
    panelH: 800,
    videoW: 1000,
    videoH: 1000,
  });
  approx(m.cx, 300);
  approx(m.cy, 200);
  approx(m.radius, (2 / 3) * Math.hypot(450, 800));
  approx(m.originX, 40); // 300 * 0.8 - 200
  approx(m.originY, 160); // 200 * 0.8 + 0
});

// Wide 800x600 panel, same 1000x1000 video: cover crops top/bottom instead
// (offY = -100), visible source rect x:[0,1000], y:[125,875]. From the
// center all corners sit at hypot(500,375) = 625.
test("wide panel: vertical crop axis handled", () => {
  const m = computeFreezeMask({
    points: [{ x: 500, y: 500 }],
    panelW: 800,
    panelH: 600,
    videoW: 1000,
    videoH: 1000,
  });
  approx(m.radius, (2 / 3) * 625);
  approx(m.originX, 400);
  approx(m.originY, 300); // 500 * 0.8 - 100
});

// Degenerate panel dimensions fall back to the full frame being visible and
// an identity CSS mapping, so the code never divides by zero.
test("degenerate panel falls back to full-frame visibility", () => {
  const m = computeFreezeMask({
    points: [{ x: 100, y: 100 }],
    panelW: 0,
    panelH: 0,
    videoW: 1000,
    videoH: 1000,
  });
  approx(m.radius, (2 / 3) * Math.hypot(900, 900));
  approx(m.originX, 100);
  approx(m.originY, 100);
});

// The radius is clamped to at least 1 source pixel so the canvas radial
// gradient never gets a degenerate (zero) outer radius.
test("radius never collapses below 1", () => {
  const m = computeFreezeMask({
    points: [{ x: 0.5, y: 0.5 }],
    panelW: 1,
    panelH: 1,
    videoW: 1,
    videoH: 1,
  });
  assert.equal(m.radius, 1);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- test/freeze-mask.test.js`
Expected: FAIL — `Cannot find module ..../www/js/util/freeze-mask.js`

- [ ] **Step 3: Write the implementation**

Create `www/js/util/freeze-mask.js`:

```js
/**
 * Pure geometry for the frozen-frame radial mask and its discard animation.
 * Given the detected code's result points (video-pixel coordinates) and the
 * panel/video dimensions, computes everything the scanner needs to render the
 * effect: the mask center (polygon centroid), the gradient radius, and the
 * CSS-pixel transform-origin the freeze layers shrink towards on discard.
 *
 * The radius is 2/3 of the distance from the centroid to the farthest corner
 * of the *visible* part of the video — the sub-rectangle actually shown in
 * the panel under CSS `object-fit: cover` (scale
 * `s = max(panelW/videoW, panelH/videoH)`, centered, overflow cropped; same
 * mapping as crop-region.js). Because `cover` scales uniformly, a circle in
 * video pixels renders as a circle on screen.
 */

/** Fraction of the centroid→farthest-visible-corner distance at which the
 * mask reaches full transparency. */
const FALLOFF_FRACTION = 2 / 3;

/**
 * Compute the radial-mask geometry for a frozen frame.
 * Degenerate panel dimensions (<= 0) fall back to treating the full frame as
 * visible with an identity CSS mapping. `points` must be non-empty.
 * @param {object} args
 * @param {Array<{x:number, y:number}>} args.points - Detected code polygon in video pixels.
 * @param {number} args.panelW - Camera panel width in CSS pixels.
 * @param {number} args.panelH - Camera panel height in CSS pixels.
 * @param {number} args.videoW - Source frame width in pixels (video.videoWidth).
 * @param {number} args.videoH - Source frame height in pixels (video.videoHeight).
 * @returns {{cx:number, cy:number, radius:number, originX:number, originY:number}}
 *   Mask center and gradient radius in video pixels (radius >= 1), and the
 *   transform-origin in panel CSS pixels.
 */
export function computeFreezeMask({ points, panelW, panelH, videoW, videoH }) {
  let cx = 0;
  let cy = 0;
  for (const p of points) {
    cx += p.x;
    cy += p.y;
  }
  cx /= points.length;
  cy /= points.length;

  // cover-fit mapping and visible source rect (full frame when degenerate).
  let s = 1;
  let offX = 0;
  let offY = 0;
  let left = 0;
  let top = 0;
  let right = videoW;
  let bottom = videoH;
  if (panelW > 0 && panelH > 0) {
    s = Math.max(panelW / videoW, panelH / videoH);
    offX = (panelW - videoW * s) / 2;
    offY = (panelH - videoH * s) / 2;
    left = clamp(-offX / s, 0, videoW);
    top = clamp(-offY / s, 0, videoH);
    right = clamp((panelW - offX) / s, 0, videoW);
    bottom = clamp((panelH - offY) / s, 0, videoH);
  }

  let farthest = 0;
  for (const [x, y] of [
    [left, top],
    [right, top],
    [left, bottom],
    [right, bottom],
  ]) {
    farthest = Math.max(farthest, Math.hypot(x - cx, y - cy));
  }

  return {
    cx,
    cy,
    radius: Math.max(1, FALLOFF_FRACTION * farthest),
    originX: cx * s + offX,
    originY: cy * s + offY,
  };
}

/**
 * Clamp a number to an inclusive range.
 * @param {number} v - Value.
 * @param {number} lo - Lower bound.
 * @param {number} hi - Upper bound.
 * @returns {number} `v` confined to `[lo, hi]`.
 */
function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- test/freeze-mask.test.js`
Expected: 5 tests PASS. Then run the full suite (`npm test`) — everything green.

- [ ] **Step 5: Commit**

```bash
git add www/js/util/freeze-mask.js test/freeze-mask.test.js
git commit -m "feat: add freeze-mask geometry util

Pure helper computing the radial-mask center (polygon centroid), the
gradient radius (2/3 of the distance to the farthest visible corner
under object-fit: cover) and the CSS transform-origin for the upcoming
frozen-frame mask and discard animation.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Scanner integration + CSS (mask rendering and discard animation)

**Files:**
- Modify: `www/js/scanner.js` (header comment, imports, state, `drawFreeze`, `resume`, discard helpers, `setCamera`, listener wiring)
- Modify: `www/css/styles.css` (remove `#freeze { opacity: 0.5 }`, add `.discarding` rules)

**Interfaces:**
- Consumes: `computeFreezeMask({points, panelW, panelH, videoW, videoH})` → `{cx, cy, radius, originX, originY}` from Task 1.
- Produces: no new exports; `createScanner`'s public API is unchanged.

- [ ] **Step 1: Update the CSS**

In `www/css/styles.css`, **delete** this rule (around line 74):

```css
#freeze {
  opacity: 0.5;
}
```

and **add** in its place:

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

- [ ] **Step 2: Update scanner.js — import and header comment**

Add the import after the `computeCropRegion` import:

```js
import { computeFreezeMask } from "./util/freeze-mask.js";
```

In the file header comment, replace the sentence fragment

```
 * frame to the on-screen reticle region before decoding, so only the indicated
 * area is scanned. Keeps the stream running after a recognition (pausing only
 * result *processing*), overlays the frozen frame at 50% opacity with a
 * highlight polygon, shows the placement reticle while scanning, and throttles
```

with

```
 * frame to the on-screen reticle region before decoding, so only the indicated
 * area is scanned. Keeps the stream running after a recognition (pausing only
 * result *processing*), overlays the frozen frame through a radial alpha mask
 * centered on the detected code (opaque at the code, transparent towards the
 * edges) with a highlight polygon, discards it with an 800ms shrink-and-fade
 * animation, shows the placement reticle while scanning, and throttles
```

- [ ] **Step 3: Add discard state and helpers**

Below `let rafId = 0;` add:

```js
  let discardTimer = 0;
```

Near the `RETICLE_*` constants add:

```js
  // Fallback delay (ms) before force-hiding the freeze layers if the 800ms
  // discard transition's transitionend event never fires.
  const DISCARD_FALLBACK_MS = 850;
```

Add two helpers above `drawFreeze`:

```js
  /**
   * Cancel any in-flight discard animation: clears the pending hide timer and
   * removes the .discarding class from both freeze layers. The CSS transition
   * is defined on .discarding only, so removing the class snaps the layers
   * back to full scale/opacity instantly.
   */
  function cancelDiscard() {
    if (discardTimer) {
      clearTimeout(discardTimer);
      discardTimer = 0;
    }
    freeze.classList.remove("discarding");
    overlay.classList.remove("discarding");
  }

  /**
   * Finish a discard: cancel any animation state and hide both freeze layers.
   * Idempotent — used as the transition-end handler, the timeout fallback,
   * and the instant hide path on camera-off.
   */
  function endDiscard() {
    cancelDiscard();
    freeze.hidden = true;
    overlay.hidden = true;
  }
```

- [ ] **Step 4: Rewrite `drawFreeze` to apply the radial mask**

Replace the existing `drawFreeze` function (its JSDoc and body) with:

```js
  /**
   * Draw the frozen frame and a highlight polygon around the recognised code.
   * The freeze layer's alpha channel is shaped by a radial gradient centered
   * on the detected code — opaque at the code, fully transparent at 2/3 of
   * the distance to the farthest visible corner — so the live feed shows
   * through towards the edges. The overlay polygon stays full opacity. Also
   * cancels any discard animation still in flight (a re-freeze interrupts it)
   * and records the mask center as the transform-origin both layers shrink
   * towards when discarded.
   * @param {Array<{getX:()=>number,getY:()=>number}>} points - ZXing result points (video-pixel coords).
   */
  function drawFreeze(points) {
    cancelDiscard();
    const w = video.videoWidth;
    const h = video.videoHeight;
    for (const c of [freeze, overlay]) {
      c.width = w;
      c.height = h;
      c.hidden = false;
    }

    const mask = computeFreezeMask({
      points: points.map((p) => ({ x: p.getX(), y: p.getY() })),
      panelW: panel.clientWidth,
      panelH: panel.clientHeight,
      videoW: w,
      videoH: h,
    });
    freeze.style.transformOrigin = `${mask.originX}px ${mask.originY}px`;
    overlay.style.transformOrigin = `${mask.originX}px ${mask.originY}px`;

    const fctx = freeze.getContext("2d");
    fctx.drawImage(video, 0, 0, w, h);
    const grad = fctx.createRadialGradient(mask.cx, mask.cy, 0, mask.cx, mask.cy, mask.radius);
    grad.addColorStop(0, "rgba(0, 0, 0, 1)");
    grad.addColorStop(1, "rgba(0, 0, 0, 0)");
    fctx.globalCompositeOperation = "destination-in";
    fctx.fillStyle = grad;
    fctx.fillRect(0, 0, w, h);
    fctx.globalCompositeOperation = "source-over";

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
```

- [ ] **Step 5: Rewrite `resume` and wire up the animation end paths**

Replace the existing `resume` function with:

```js
  /**
   * Discard the frozen overlay with the 800ms shrink-and-fade animation and
   * resume processing (the camera never stopped). The decoded-text bar and
   * tap hint hide immediately; the freeze/overlay canvases are hidden once
   * the CSS transition ends, with a timeout fallback in case transitionend
   * never fires.
   */
  function resume() {
    if (!frozen) return;
    frozen = false;
    content.hidden = true;
    tapHint.hidden = true;
    freeze.classList.add("discarding");
    overlay.classList.add("discarding");
    discardTimer = setTimeout(endDiscard, DISCARD_FALLBACK_MS);
  }
```

Next to the existing `panel.addEventListener("click", ...)` registration add:

```js
  // Hide the freeze layers as soon as the discard transition finishes (the
  // guard keeps unrelated transitions from hiding a live freeze; endDiscard
  // is idempotent when both opacity and transform fire the event).
  freeze.addEventListener("transitionend", () => {
    if (freeze.classList.contains("discarding")) endDiscard();
  });
```

In `setCamera`, the camera-off branch currently reads:

```js
        video.srcObject = null;
        resume();
        freezeCtl.reset();
```

Replace with:

```js
        video.srcObject = null;
        resume(); // clears frozen state and starts a discard...
        endDiscard(); // ...which camera-off cuts short: hide immediately
        freezeCtl.reset();
```

- [ ] **Step 6: Run the full test suite (regression)**

Run: `npm test`
Expected: all existing tests PASS (this task adds DOM/visual behavior; the geometry is covered by Task 1's tests).

- [ ] **Step 7: Commit**

```bash
git add www/js/scanner.js www/css/styles.css
git commit -m "feat: radial freeze mask and 800ms discard animation

The frozen frame's alpha is now a radial gradient centered on the
detected code (destination-in composite), replacing the flat 50% CSS
opacity. Discarding the freeze shrinks both layers to 0.85 towards the
code and fades them out over 800ms via a .discarding CSS transition,
with transitionend + timeout fallback and clean interruption when a new
freeze or camera-off lands mid-animation.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Service worker precache + manual verification

**Files:**
- Modify: `www/sw.js` (cache version, asset list)

**Interfaces:**
- Consumes: the module path `js/util/freeze-mask.js` created in Task 1.
- Produces: nothing new — deployment plumbing only.

- [ ] **Step 1: Bump the cache and precache the new module**

In `www/sw.js` change:

```js
const CACHE = "dms-v10";
```

to:

```js
const CACHE = "dms-v11";
```

and in the `ASSETS` array, directly after `"js/util/freeze-controller.js",` add:

```js
  "js/util/freeze-mask.js",
```

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 3: Manual verification (on-device)**

Serve `www/` locally (e.g. `npx http-server www` or any static server; camera needs HTTPS or localhost) and on mobile Chrome + Firefox check:

1. Scan a code: the frozen frame is fully opaque at the code and fades smoothly to invisible towards the edges (live feed visible there); the green polygon stays crisp.
2. Let the freeze expire (auto/timer) or tap (tap mode): frame + polygon shrink slightly towards the code and fade out over ~0.8s; text bar disappears instantly.
3. Scan again *during* the fade (set a short freeze duration): the animation cuts off cleanly and the new freeze appears at full opacity/scale.
4. Turn the camera off while frozen and while fading: the layers disappear immediately, no ghost animation over the camera-off screen.
5. Check both dark and light themes.

- [ ] **Step 4: Commit**

```bash
git add www/sw.js
git commit -m "chore: bump service worker cache to v11; precache freeze-mask util

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
