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
