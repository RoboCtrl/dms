import "fake-indexeddb/auto";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as db from "../js/db.js";

beforeEach(async () => {
  await db.__resetForTests();
});

test("add returns a record with an id and getAll returns it", async () => {
  const rec = await db.add("HELLO", 1000);
  assert.equal(typeof rec.id, "number");
  assert.equal(rec.content, "HELLO");
  assert.equal(rec.timestamp, 1000);
  const all = await db.getAll();
  assert.equal(all.length, 1);
  assert.deepEqual(all[0], rec);
});

test("deleteById removes only the target record", async () => {
  const a = await db.add("A", 1);
  await db.add("B", 2);
  await db.deleteById(a.id);
  const all = await db.getAll();
  assert.deepEqual(all.map((r) => r.content), ["B"]);
});

test("clear removes all records", async () => {
  await db.add("A", 1);
  await db.add("B", 2);
  await db.clear();
  assert.equal((await db.getAll()).length, 0);
});

test("approxBytes counts UTF-8 JSON size and grows with data", () => {
  const small = db.approxBytes([{ id: 1, content: "A", timestamp: 1 }]);
  const big = db.approxBytes([{ id: 1, content: "AAAAA", timestamp: 1 }]);
  assert.ok(small > 0);
  assert.ok(big > small);
});

test("estimateSize falls back to approxBytes without StorageManager", async () => {
  await db.add("HELLO", 1);
  const { count, bytes } = await db.estimateSize();
  assert.equal(count, 1);
  assert.ok(bytes > 0);
});
