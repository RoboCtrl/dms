# Reticle Decode Crop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Feed only the reticle region (plus 8 on-screen pixels of padding per side) to the Data Matrix decoder, instead of decoding the whole camera frame.

**Architecture:** A new pure geometry helper (`util/crop-region.js`) converts the on-screen reticle rectangle into a source-frame pixel crop, reproducing `object-fit: cover`. `scanner.js` drops ZXing's full-frame `decodeFromConstraints` loop and runs its own capture loop: grab the stream directly, each frame draw only the crop rect onto a small offscreen canvas, decode that canvas, and offset the result points back to full-frame coords so the freeze overlay still lines up.

**Tech Stack:** Vanilla ES modules, vendored ZXing-js UMD global (`ZXing`), `node --test` for unit tests, no build step.

## Global Constraints

- Pure front-end only; runs from static files on mobile Chrome + Firefox, portrait orientation. No backend, no new dependencies.
- Code and comments in American English; document every function (purpose, args, types, return).
- Each function gets a 2–5 sentence (or one-line for trivial) doc comment, matching the existing `www/js/util/*.js` JSDoc style.
- The whole runtime lives in `www/`; tests live in `test/` (development-only, never deployed).
- Reticle constants stay hard-coded: `fraction = 0.6` (matches `#reticle { width: 60% }` of panel width), on-screen `padCss = 8`.
- Tests use `node:test` + `node:assert/strict`, importing source directly from `../www/js/...`, following `test/scan-gate.test.js`.

---

### Task 1: Pure crop-region geometry helper

Convert the on-screen reticle rectangle into an integer source-frame pixel crop, reproducing CSS `object-fit: cover`. Pure function, fully unit-tested, no DOM or ZXing.

**Files:**
- Create: `www/js/util/crop-region.js`
- Test: `test/crop-region.test.js`

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces: `computeCropRegion({ panelW, panelH, videoW, videoH, fraction, padCss }) → { sx, sy, sw, sh }` — all inputs numbers; returns integer source-pixel rect, clamped to `[0, videoW] × [0, videoH]`, with `sw ≥ 1` and `sh ≥ 1`.

- [ ] **Step 1: Write the failing tests**

Create `test/crop-region.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeCropRegion } from "../www/js/util/crop-region.js";

// Square 1000x1000 source shown in a tall 400x800 portrait panel.
// object-fit:cover scale = max(400/1000, 800/1000) = 0.8; height fills,
// width overflows and is cropped left/right.
test("horizontal cover crop maps reticle + 8px pad to source pixels", () => {
  const r = computeCropRegion({
    panelW: 400, panelH: 800, videoW: 1000, videoH: 1000,
    fraction: 0.6, padCss: 8,
  });
  assert.deepEqual(r, { sx: 340, sy: 340, sw: 320, sh: 320 });
});

// Square 1000x1000 source in a wide 800x600 panel: width fills, height
// is cropped top/bottom. scale = max(800/1000, 600/1000) = 0.8.
test("vertical cover crop centers the crop with the offset applied", () => {
  const r = computeCropRegion({
    panelW: 800, panelH: 600, videoW: 1000, videoH: 1000,
    fraction: 0.6, padCss: 8,
  });
  assert.deepEqual(r, { sx: 190, sy: 190, sw: 620, sh: 620 });
});

// Padding widens the region by padCss/scale on each side: with scale 0.8,
// 8 CSS px -> 10 source px per side, so 20 px wider/taller than no padding.
test("padding expands the region in source pixels", () => {
  const base = { panelW: 400, panelH: 800, videoW: 1000, videoH: 1000, fraction: 0.6 };
  const noPad = computeCropRegion({ ...base, padCss: 0 });
  const padded = computeCropRegion({ ...base, padCss: 8 });
  assert.deepEqual(noPad, { sx: 350, sy: 350, sw: 300, sh: 300 });
  assert.equal(padded.sw, noPad.sw + 20);
  assert.equal(padded.sh, noPad.sh + 20);
  assert.equal(padded.sx, noPad.sx - 10);
  assert.equal(padded.sy, noPad.sy - 10);
});

// A huge pad pushes the rect past the frame; it must clamp to [0, video].
test("crop clamps to the frame bounds", () => {
  const r = computeCropRegion({
    panelW: 400, panelH: 800, videoW: 1000, videoH: 1000,
    fraction: 0.6, padCss: 500,
  });
  assert.deepEqual(r, { sx: 0, sy: 0, sw: 1000, sh: 1000 });
});

// Degenerate inputs must never yield a zero/negative-sized crop.
test("crop never collapses below 1x1", () => {
  const r = computeCropRegion({
    panelW: 0, panelH: 0, videoW: 10, videoH: 10, fraction: 0.6, padCss: 0,
  });
  assert.ok(r.sw >= 1 && r.sh >= 1);
  assert.ok(r.sx >= 0 && r.sy >= 0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/crop-region.test.js`
Expected: FAIL — `Cannot find module '.../www/js/util/crop-region.js'`.

- [ ] **Step 3: Write the implementation**

Create `www/js/util/crop-region.js`:

```js
/**
 * Map the on-screen placement reticle to a source-frame pixel rectangle,
 * reproducing CSS `object-fit: cover`. The reticle is a centered square whose
 * side is `fraction` of the panel width (matching `#reticle { width: 60% }`),
 * grown by `padCss` on-screen pixels on every side. The result is the region
 * of the raw camera frame that the displayed reticle covers, so the decoder
 * can be fed exactly that area instead of the whole frame.
 *
 * `cover` scales the video by `s = max(panelW/videoW, panelH/videoH)`, centers
 * it, and crops the overflow; offsets of the visible origin relative to the
 * source origin are `(panelDim - videoDim*s)/2` in display pixels. Each display
 * coordinate maps back to source pixels via `(d - offset) / s`. The returned
 * rect is integer-aligned (floor the top-left, ceil the bottom-right), clamped
 * to the frame, and never smaller than 1x1.
 *
 * @param {object} args
 * @param {number} args.panelW - Camera panel width in CSS pixels.
 * @param {number} args.panelH - Camera panel height in CSS pixels.
 * @param {number} args.videoW - Source frame width in pixels (video.videoWidth).
 * @param {number} args.videoH - Source frame height in pixels (video.videoHeight).
 * @param {number} args.fraction - Reticle side as a fraction of panel width (e.g. 0.6).
 * @param {number} args.padCss - Extra margin per side, in on-screen CSS pixels.
 * @returns {{sx:number, sy:number, sw:number, sh:number}} Integer source-pixel crop rect.
 */
export function computeCropRegion({ panelW, panelH, videoW, videoH, fraction, padCss }) {
  const s = Math.max(panelW / videoW, panelH / videoH);
  const offX = (panelW - videoW * s) / 2;
  const offY = (panelH - videoH * s) / 2;

  const side = fraction * panelW;
  const dLeft = (panelW - side) / 2 - padCss;
  const dTop = (panelH - side) / 2 - padCss;
  const dRight = (panelW + side) / 2 + padCss;
  const dBottom = (panelH + side) / 2 + padCss;

  // Map display coords back into source-frame pixels.
  const toSrcX = (d) => (d - offX) / s;
  const toSrcY = (d) => (d - offY) / s;

  const sx = clamp(Math.floor(toSrcX(dLeft)), 0, videoW);
  const sy = clamp(Math.floor(toSrcY(dTop)), 0, videoH);
  const ex = clamp(Math.ceil(toSrcX(dRight)), 0, videoW);
  const ey = clamp(Math.ceil(toSrcY(dBottom)), 0, videoH);

  return {
    sx,
    sy,
    sw: Math.max(1, ex - sx),
    sh: Math.max(1, ey - sy),
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/crop-region.test.js`
Expected: PASS — all 5 tests pass.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS — existing suites plus the new file, no regressions.

- [ ] **Step 6: Commit**

```bash
git add www/js/util/crop-region.js test/crop-region.test.js
git commit -m "feat: crop-region helper mapping reticle to source pixels

Pure function reproducing object-fit:cover to convert the on-screen
reticle square (plus 8px padding) into an integer source-frame crop
rect, clamped to the frame. Unit-tested for horizontal/vertical cover
crops, padding expansion, and clamping.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Crop the scanner decode loop to the reticle

Replace ZXing's full-frame `decodeFromConstraints` loop with a manual capture loop that decodes only the crop region and offsets result points back to full-frame coordinates. DOM/stream/loop glue — not unit-tested, consistent with the existing untested `scanner.js`; verified manually in the browser.

**Files:**
- Modify: `www/js/scanner.js`

**Interfaces:**
- Consumes: `computeCropRegion({ panelW, panelH, videoW, videoH, fraction, padCss })` from Task 1; existing `freezeCtl.onResult/reset`, `gate.accept`, `drawFreeze`, `resume`, `showError`.
- Produces: no new exported API — `createScanner(...)` keeps returning `{ start, refreshFreezeConfig }` unchanged.

- [ ] **Step 1: Add the crop-region import**

In `www/js/scanner.js`, add to the import block (after the `freeze-controller` import, line 18):

```js
import { computeCropRegion } from "./util/crop-region.js";
```

- [ ] **Step 2: Add reticle constants and loop/stream state**

Just after `const freezeCtl = createFreezeController(...)` (line 47), add:

```js
  // Reticle geometry: side is 60% of the panel width (matches #reticle CSS),
  // grown by 8 on-screen pixels per side before mapping to source pixels.
  const RETICLE_FRACTION = 0.6;
  const RETICLE_PAD = 8;

  // Reused offscreen canvas the cropped frame is drawn onto before decoding.
  const capture = document.createElement("canvas");
  const captureCtx = capture.getContext("2d", { willReadFrequently: true });
```

Then change the existing state declarations (lines 49–51) from:

```js
  let frozen = false;
  let transitioning = false;
  let cameraOn = settings.get().cameraOn;
```

to:

```js
  let frozen = false;
  let transitioning = false;
  let cameraOn = settings.get().cameraOn;
  let stream = null;
  let rafId = 0;
```

- [ ] **Step 3: Add a result-point offset helper**

Immediately above `drawFreeze` (before line 68's doc comment), add:

```js
  /**
   * Translate ZXing result points from cropped-canvas coordinates back to
   * full-frame video coordinates by adding the crop's top-left offset. The
   * freeze/overlay canvases are sized to the full frame, so points must be in
   * full-frame space to line up. Returns lightweight point-likes exposing the
   * same getX/getY interface drawFreeze consumes.
   * @param {Array<{getX:()=>number,getY:()=>number}>} points - Crop-local points.
   * @param {number} dx - Crop left offset in source pixels (sx).
   * @param {number} dy - Crop top offset in source pixels (sy).
   * @returns {Array<{getX:()=>number,getY:()=>number}>} Full-frame point-likes.
   */
  function offsetPoints(points, dx, dy) {
    return points.map((p) => ({
      getX: () => p.getX() + dx,
      getY: () => p.getY() + dy,
    }));
  }
```

- [ ] **Step 4: Replace `startDecode` with the manual capture loop**

Replace the entire `startDecode` function (lines 103–139, the doc comment through its closing brace) with:

```js
  /**
   * Decode one frame: compute the reticle crop, draw just that region onto the
   * capture canvas, and run ZXing's Data Matrix decoder on it. Returns the
   * result plus the crop offset so the caller can map points to full-frame
   * coordinates. A "not found" frame (no code) returns a null result; ZXing's
   * routine not-found exception is swallowed.
   * @returns {{result: object|null, sx: number, sy: number}}
   */
  function decodeCropFrame() {
    const videoW = video.videoWidth;
    const videoH = video.videoHeight;
    const { sx, sy, sw, sh } = computeCropRegion({
      panelW: panel.clientWidth,
      panelH: panel.clientHeight,
      videoW,
      videoH,
      fraction: RETICLE_FRACTION,
      padCss: RETICLE_PAD,
    });
    if (capture.width !== sw) capture.width = sw;
    if (capture.height !== sh) capture.height = sh;
    captureCtx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);

    let result = null;
    try {
      const source = new ZXing.HTMLCanvasElementLuminanceSource(capture);
      const bitmap = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(source));
      result = reader.decodeBitmap(bitmap);
    } catch {
      result = null; // No code in the crop this frame.
    }
    return { result, sx, sy };
  }

  /**
   * Per-frame scan loop. Schedules itself via requestAnimationFrame, decodes
   * the reticle crop, and drives the freeze controller exactly as the old
   * ZXing callback did: freeze + draw + record on a fresh recognition, resume
   * on auto/timer unfreeze. Skips frames until the video reports dimensions.
   */
  function scanLoop() {
    rafId = requestAnimationFrame(scanLoop);
    if (!video.videoWidth || !video.videoHeight) return;

    const { result, sx, sy } = decodeCropFrame();
    const now = Date.now();
    const text = result ? result.getText() : null;
    const action = freezeCtl.onResult(text, now);
    if (action === "freeze") {
      frozen = true;
      drawFreeze(offsetPoints(result.getResultPoints(), sx, sy));
      content.textContent = text;
      content.hidden = false;
      tapHint.hidden = settings.get().freezeMode !== "tap";
      // Throttle duplicate records (e.g. brief flicker re-freeze).
      if (gate.accept(text, now)) onRecognized(text);
    } else if (action === "unfreeze") {
      resume();
    }
  }

  /**
   * Start the rear-camera stream and the decode loop. Acquires the stream
   * directly (so the loop can crop to the reticle), attaches it to the video
   * element, and begins scanning. Camera/permission errors are caught and
   * surfaced via the on-screen error box; this function never throws.
   */
  async function startDecode() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      video.srcObject = stream;
      await video.play();
      scanLoop();
    } catch (err) {
      showError(
        "Camera unavailable. Grant camera permission and use HTTPS or localhost. (" +
          (err?.name || err) +
          ")",
      );
      reticle.hidden = true;
    }
  }
```

- [ ] **Step 5: Update camera-off teardown in `setCamera`**

In `setCamera`, replace the current `else` branch body (lines 158–164) — from `reader.reset();` through `camOff.hidden = false;` — with:

```js
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = 0;
        }
        if (stream) {
          stream.getTracks().forEach((t) => t.stop());
          stream = null;
        }
        video.srcObject = null;
        resume();
        freezeCtl.reset();
        reticle.hidden = true;
        camOff.hidden = false;
```

(This drops the `reader.reset()` call: the reader no longer owns the stream — we manage acquisition and teardown ourselves. The reader is now used only for `decodeBitmap`.)

- [ ] **Step 6: Update the module doc comment**

At the top of the file, update the header comment (lines 1–12) so it no longer claims ZXing owns the loop. Replace the first paragraph's "Camera + Data Matrix decode loop using the vendored ZXing-js UMD global." sentence's surrounding description by replacing lines 2–7:

```
 * Camera + Data Matrix decode loop using the vendored ZXing-js UMD global.
 * Owns the live video stream and a camera on/off toggle, keeps the stream
 * running after a recognition (pausing only result *processing*), overlays the
 * frozen frame at 50% opacity with a highlight polygon, shows a placement
 * reticle while scanning, and throttles duplicate recordings via a cooldown
 * gate. Emits recognised content via the onRecognized callback.
```

with:

```
 * Camera + Data Matrix decode loop using the vendored ZXing-js UMD global.
 * Owns the live video stream (acquired via getUserMedia) and a camera on/off
 * toggle, and runs its own requestAnimationFrame decode loop that crops each
 * frame to the on-screen reticle region before decoding, so only the indicated
 * area is scanned. Keeps the stream running after a recognition (pausing only
 * result *processing*), overlays the frozen frame at 50% opacity with a
 * highlight polygon, shows the placement reticle while scanning, and throttles
 * duplicate recordings via a cooldown gate. Emits recognised content via the
 * onRecognized callback.
```

- [ ] **Step 7: Verify the full test suite still passes**

Run: `npm test`
Expected: PASS — no test imports `scanner.js`, so existing suites are unaffected; nothing regresses.

- [ ] **Step 8: Manual browser verification**

Serve and check on a device/emulator with a camera:

Run: `npm run serve` then open `http://localhost:8000` (camera needs HTTPS or localhost).

Verify:
- A Data Matrix is recognized only when it sits inside the reticle (codes parked outside the brackets are no longer picked up).
- On recognition the green highlight polygon still aligns with the code in the frozen frame.
- Camera off then on still works; no console errors; switching freeze modes still behaves.

- [ ] **Step 9: Commit**

```bash
git add www/js/scanner.js
git commit -m "feat: crop scanner decode input to the reticle region

Replace ZXing's full-frame decodeFromConstraints loop with a manual
requestAnimationFrame loop that acquires the stream directly, draws only
the reticle crop (computeCropRegion, +8px padding) onto an offscreen
canvas, and decodes that. Result points are offset back to full-frame
coordinates so the freeze overlay still lines up. Camera-off now stops
the stream and cancels the loop directly instead of reader.reset().

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Bump the service worker cache version

A PWA shipping changed JS must bump the SW cache version so installed clients pick up the new files (per CLAUDE.md deployment notes).

**Files:**
- Modify: `www/sw.js`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: Inspect the current cache version and asset list**

Run: `grep -nE "v[0-9]+|CACHE|crop-region|scanner" www/sw.js`
Expected: shows the current cache-name constant (e.g. `...-v5`) and the precache list.

- [ ] **Step 2: Bump the cache version**

In `www/sw.js`, increment the cache-version constant by one (e.g. `dms-cache-v5` → `dms-cache-v6`), matching the existing naming exactly.

- [ ] **Step 3: Add the new module to the precache list if present**

If `www/sw.js` precaches an explicit list of JS files (rather than caching at runtime), add `"./js/util/crop-region.js"` alongside the other `js/util/*.js` entries, matching the existing path style. If the SW caches dynamically (no explicit list), make no list change.

- [ ] **Step 4: Verify**

Run: `node --check www/sw.js`
Expected: PASS — no syntax errors.

- [ ] **Step 5: Commit**

```bash
git add www/sw.js
git commit -m "chore: bump SW cache version for reticle decode crop

New util/crop-region.js module and the reworked scanner.js require a
service-worker cache bump so installed PWA clients refresh.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- "Pure geometry helper `computeCropRegion`" → Task 1 (signature, cover maths, clamping, padding all covered by tests).
- "Rework decode loop: direct stream, manual crop loop, decode cropped canvas" → Task 2, Steps 4.
- "Translate result points back to full-frame coords" → Task 2, Step 3 (`offsetPoints`) + used in `scanLoop`.
- "Teardown stops stream + cancels loop, not `reader.reset()`" → Task 2, Step 5.
- "Unchanged: reticle CSS/markup, freeze lifecycle, gate, onRecognized, settings, history" → no tasks touch those files; `scanLoop` mirrors the old callback exactly.
- "Tests for the helper (cover crops, padding, clamping)" → Task 1, Step 1.
- PWA cache bump (CLAUDE.md deployment rule, recent commit `0470a2a` precedent) → Task 3.

**Placeholder scan:** No TBD/TODO/"handle edge cases"; every code step shows complete code; Task 3 Step 3 is conditional but states exactly what to do in each branch.

**Type consistency:** `computeCropRegion` returns `{sx,sy,sw,sh}` — consumed with those exact names in `decodeCropFrame`. `offsetPoints(points, dx, dy)` called with `(…, sx, sy)`. `decodeCropFrame()` returns `{result, sx, sy}` — destructured identically in `scanLoop`. `freezeCtl.onResult` return values `"freeze"|"unfreeze"|"none"` handled as in the original.
