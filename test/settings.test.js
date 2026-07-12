import { test } from "node:test";
import assert from "node:assert/strict";
import { createSettings } from "../www/js/settings.js";

/** Minimal in-memory Storage stub for tests. */
function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
  };
}

test("defaults to dark theme, hidden duplicates, first-token grouping", () => {
  const s = createSettings(fakeStorage());
  assert.deepEqual(s.get(), {
    theme: "dark",
    hideDuplicates: true,
    groupMode: "firstToken",
    cameraOn: true,
    cameraHeight: 1,
    freezeMode: "auto",
    freezeTimer: 1,
    freezeTapDelay: 2,
    freezeAutoDelay: 2,
  });
});

test("persists theme and hideDuplicates across instances", () => {
  const storage = fakeStorage();
  const s1 = createSettings(storage);
  s1.setTheme("light");
  s1.setHideDuplicates(false);
  const s2 = createSettings(storage);
  assert.deepEqual(s2.get(), {
    theme: "light",
    hideDuplicates: false,
    groupMode: "firstToken",
    cameraOn: true,
    cameraHeight: 1,
    freezeMode: "auto",
    freezeTimer: 1,
    freezeTapDelay: 2,
    freezeAutoDelay: 2,
  });
});

test("cameraOn defaults to true", () => {
  const s = createSettings(fakeStorage());
  assert.equal(s.get().cameraOn, true);
});

test("setCameraOn persists the value", () => {
  const s = createSettings(fakeStorage());
  s.setCameraOn(false);
  assert.equal(s.get().cameraOn, false);
});

test("cameraHeight defaults to index 1 (second-smallest)", () => {
  const s = createSettings(fakeStorage());
  assert.equal(s.get().cameraHeight, 1);
});

test("setCameraHeight persists the chosen index", () => {
  const storage = fakeStorage();
  const s1 = createSettings(storage);
  s1.setCameraHeight(0);
  const s2 = createSettings(storage);
  assert.equal(s2.get().cameraHeight, 0);
});

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

test("groupMode defaults to firstToken", () => {
  const s = createSettings(fakeStorage());
  assert.equal(s.get().groupMode, "firstToken");
});

test("setGroupMode persists across instances", () => {
  const storage = fakeStorage();
  const s1 = createSettings(storage);
  s1.setGroupMode("secondToken");
  const s2 = createSettings(storage);
  assert.equal(s2.get().groupMode, "secondToken");
});
