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
