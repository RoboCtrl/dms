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
