import { test } from "node:test";
import assert from "node:assert/strict";
import { freezeConfigFromSettings } from "../www/js/freeze.js";

test("resolves indices to seconds", () => {
  const cfg = freezeConfigFromSettings({
    freezeMode: "timer",
    freezeTimer: 0,
    freezeTapDelay: 1,
    freezeAutoDelay: 3,
    discardAnimation: false,
    discardDuration: 0,
  });
  assert.deepEqual(cfg, {
    mode: "timer",
    timerSec: 5,
    tapDelaySec: 1,
    autoDelaySec: 0,
    discardAnimation: false,
    discardMs: 400,
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
