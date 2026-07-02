import "fake-indexeddb/auto";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as db from "../www/js/db.js";
import { createStore } from "../www/js/store.js";

beforeEach(async () => {
  await db.__resetForTests();
});

test("recordScan adds entries and getVisible returns newest first", async () => {
  const store = createStore(db);
  await store.load();
  await store.recordScan("A");
  await store.recordScan("B");
  assert.deepEqual(store.getVisible(false, "full").map((r) => r.content), ["B", "A"]);
});

test("countFor counts identical non-deleted entries", async () => {
  const store = createStore(db);
  await store.load();
  await store.recordScan("X");
  await store.recordScan("X");
  await store.recordScan("Y");
  assert.equal(store.countFor("X", "full"), 2);
  assert.equal(store.countFor("Y", "full"), 1);
});

test("deleteEntry lowers the count and undo restores it", async () => {
  const store = createStore(db);
  await store.load();
  await store.recordScan("X");
  const second = await store.recordScan("X");
  await store.deleteEntry(second.id);
  assert.equal(store.countFor("X", "full"), 1);
  assert.ok(store.canUndo());
  await store.undo();
  assert.equal(store.countFor("X", "full"), 2);
  assert.equal(store.canUndo(), false);
});

test("getVisible(true) hides duplicates keeping the newest", async () => {
  const store = createStore(db);
  await store.load();
  await store.recordScan("X");
  await store.recordScan("Y");
  await store.recordScan("X");
  const visible = store.getVisible(true, "full").map((r) => r.content);
  assert.deepEqual(visible, ["X", "Y"]);
});

test("toggleHighlight is session-only and reversible", async () => {
  const store = createStore(db);
  await store.load();
  const rec = await store.recordScan("X");
  assert.equal(store.isHighlighted(rec.id), false);
  store.toggleHighlight(rec.id);
  assert.equal(store.isHighlighted(rec.id), true);
  store.toggleHighlight(rec.id);
  assert.equal(store.isHighlighted(rec.id), false);
});

test("change event fires on recordScan", async () => {
  const store = createStore(db);
  await store.load();
  let fired = 0;
  store.on("change", () => {
    fired += 1;
  });
  await store.recordScan("X");
  assert.equal(fired, 1);
});

test("countFor groups by secondToken and returns 1 for ungrouped content", async () => {
  const store = createStore(db);
  await store.load();
  await store.recordScan("1 AB 9");
  await store.recordScan("2 AB 8");
  await store.recordScan("solo");
  // "AB" is the shared second token → group of 2.
  assert.equal(store.countFor("1 AB 9", "secondToken"), 2);
  // "solo" has no second token → ungrouped → 1.
  assert.equal(store.countFor("solo", "secondToken"), 1);
});

test("getVisible collapses same-group entries and always keeps ungrouped ones", async () => {
  const store = createStore(db);
  await store.load();
  await store.recordScan("1 AB 9");
  await store.recordScan("solo");
  await store.recordScan("2 AB 8");
  const visible = store.getVisible(true, "secondToken").map((r) => r.content);
  // Newest-first: "2 AB 8" kept (first of AB group), "solo" kept (ungrouped),
  // "1 AB 9" dropped (same AB group as the newer one).
  assert.deepEqual(visible, ["2 AB 8", "solo"]);
});

test("none mode never collapses duplicates", async () => {
  const store = createStore(db);
  await store.load();
  await store.recordScan("X");
  await store.recordScan("X");
  assert.equal(store.getVisible(true, "none").length, 2);
  assert.equal(store.countFor("X", "none"), 1);
});
