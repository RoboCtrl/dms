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
