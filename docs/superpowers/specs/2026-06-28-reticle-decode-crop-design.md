# Reticle Decode Crop — Design

**Date:** 2026-06-28
**Status:** Approved (brainstorming), pending implementation plan
**Component:** Scanner

## Summary

Make the placement reticle functional: feed only the area inside the reticle —
plus an 8px on-screen margin on each side — to the Data Matrix decoder, instead
of decoding the entire camera frame. Today the reticle is purely decorative and
the decoder scans the whole source frame, so codes are recognised well outside
(and even off the visible edges of) the indicated box. This change crops the
decode input to the reticle region so the indicator matches what is actually
scanned.

## Background

Current behaviour (`www/js/scanner.js`):

- `startDecode()` calls `reader.decodeFromConstraints({ video: { facingMode:
  "environment" } }, video, callback)`. ZXing owns the camera stream, attaches
  it to `#video`, and runs an internal loop that decodes the **full**
  `videoWidth × videoHeight` frame, invoking the callback with each result.
- The reticle (`#reticle`, `www/css/styles.css`) is a centred square at 60% of
  the panel width with four corner brackets. `scanner.js` only toggles its
  `hidden` attribute; its geometry is never read and never reaches the decoder.
- `#video`/`#freeze`/`#overlay` use `object-fit: cover` in a portrait
  `#camera-panel`. The camera frame is usually landscape, so `cover` scales it
  to fill the panel and crops the left/right edges off-screen — yet ZXing still
  scans those cropped-off regions.
- On a hit, `drawFreeze(points)` sizes `#freeze`/`#overlay` to the full video
  frame and draws the 50%-opacity frozen image plus a green highlight polygon
  using the result points, which ZXing reports in **full-frame** pixel coords.
- Freeze lifecycle, the duplicate-cooldown gate
  (`www/js/util/scan-gate.js`), and `onRecognized` are unchanged by this work.

The mismatch: the reticle implies "put the code here," but recognition uses the
whole frame (and, via `cover`, even off-screen pixels). This change closes that
gap.

## Goals

- Decode only the reticle region, expanded by 8 **on-screen (CSS)** pixels per
  side, mapped through the `object-fit: cover` transform into source pixels.
- Keep the freeze overlay, highlight polygon, freeze modes, cooldown gate, and
  `onRecognized` contract working exactly as today.

## Non-goals

- No change to the reticle's appearance, size (60%), or markup.
- No change to freeze modes, history, settings, theme, or viewport height.
- The reticle fraction (0.6) and padding (8px) stay hard-coded constants; no new
  settings UI.

## Design

### 1. Pure geometry helper — `www/js/util/crop-region.js` (new)

A single dependency-free function so the geometry can be unit-tested without DOM
or ZXing:

```
computeCropRegion({ panelW, panelH, videoW, videoH, fraction, padCss })
  → { sx, sy, sw, sh }
```

It reproduces `object-fit: cover`:

1. Scale `s = max(panelW / videoW, panelH / videoH)`.
2. The rendered video is `videoW * s × videoH * s`, centred in the panel; the
   offsets of the visible top-left relative to the source origin are
   `offX = (panelW - videoW * s) / 2`, `offY = (panelH - videoH * s) / 2` in
   display pixels.
3. The reticle square has side `L = fraction * panelW`, centred, so in display
   space it spans `x ∈ [(panelW - L) / 2, (panelW + L) / 2]` and the equivalent
   in `y`. Grow it by `padCss` on every side.
4. Map each display coordinate `d` back to source pixels:
   `src = (d - off) / s`.
5. Return an integer rect clamped to `[0, videoW] × [0, videoH]`
   (`sx, sy, sw, sh`), guaranteeing a non-empty region.

Inputs are plain numbers; the caller passes live measurements. `fraction` and
`padCss` are supplied by the scanner (0.6 and 8) so the helper holds no magic
constants.

### 2. Rework the decode loop — `www/js/scanner.js`

`decodeFromConstraints` provides no region-of-interest hook, so it is replaced
with a manual capture loop that reuses the same ZXing reader for decoding only:

- **Stream:** acquire directly via `getUserMedia({ video: { facingMode:
  "environment" } })`, attach to `#video`, and `play()`. Same constraints and
  the same `try/catch` → `showError(...)` + hide reticle as today.
- **Capture canvas:** one reusable offscreen canvas sized to the crop rect each
  tick.
- **Loop:** a throttled `requestAnimationFrame`/timer loop. Each tick, once the
  video has dimensions: read live `#camera-panel` and `video.videoWidth/Height`,
  call `computeCropRegion({ ..., fraction: 0.6, padCss: 8 })`, `drawImage` only
  that source rect onto the capture canvas, then decode the canvas with ZXing
  (`createBinaryBitmap` + `decodeBitmap`). The routine "not found" exception per
  empty frame is caught and ignored.
- **Coordinate translation:** ZXing reports result points relative to the
  cropped canvas. Before calling `drawFreeze`, **add `sx`/`sy`** to each point so
  they return to full-frame coords, keeping the freeze image and highlight
  polygon aligned with the full-frame `#freeze`/`#overlay` canvases. Downstream
  (`freezeCtl.onResult`, gate, `onRecognized`) is untouched.
- **Teardown:** camera-off and re-init cancel the loop and stop the stream's
  tracks directly, rather than relying on `reader.reset()` to end the stream.

### 3. Untouched

Reticle CSS/markup, freeze lifecycle (`freeze-controller.js`,
`freezeConfigFromSettings`), `scan-gate.js`, settings, history, the
50%-opacity frozen frame, and the `onRecognized` signature.

## Testing

- `test/crop-region.test.js` (new): unit tests for `computeCropRegion` covering
  a landscape source in a portrait panel (horizontal crop), the symmetric case,
  the centring/offset maths, 8px padding expansion, and clamping at the frame
  edges. Pure function, no DOM — consistent with existing `util` tests.
- The scanner's stream/loop/DOM wiring is not unit-tested, consistent with the
  current codebase (`scanner.js` has no test today).

## Trade-offs

- The decode region now tracks the **visible** reticle, so the off-screen sides
  that `cover` currently crops are no longer scanned. That is the intended point
  of the change.
- Decoding a smaller canvas is slightly cheaper per frame.
- Replacing `decodeFromConstraints` means owning stream acquisition and teardown
  ourselves; the manual loop must guard against running before the video has
  dimensions and against overlapping ticks.
