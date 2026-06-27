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

test("defaults to dark theme and duplicates shown", () => {
  const s = createSettings(fakeStorage());
  assert.deepEqual(s.get(), { theme: "dark", hideDuplicates: false, cameraOn: true });
});

test("persists theme and hideDuplicates across instances", () => {
  const storage = fakeStorage();
  const s1 = createSettings(storage);
  s1.setTheme("light");
  s1.setHideDuplicates(true);
  const s2 = createSettings(storage);
  assert.deepEqual(s2.get(), { theme: "light", hideDuplicates: true, cameraOn: true });
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
