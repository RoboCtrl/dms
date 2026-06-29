import "fake-indexeddb/auto";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as db from "../www/js/db.js";

beforeEach(async () => {
  await db.__resetForTests();
});

test("replaceAllCatalog stores entries and getAllCatalog returns them", async () => {
  await db.replaceAllCatalog([
    { token: "418S6", rn: 1, text: "Mech T-Rex" },
    { token: "718S6", text: "Diver & Fish" },
  ]);
  const all = await db.getAllCatalog();
  assert.equal(all.length, 2);
  assert.deepEqual(
    all.map((e) => e.token).sort(),
    ["418S6", "718S6"],
  );
  assert.ok(all.every((e) => typeof e.id === "number"));
});

test("replaceAllCatalog replaces the entire previous set", async () => {
  await db.replaceAllCatalog([{ token: "A" }, { token: "B" }]);
  await db.replaceAllCatalog([{ token: "C" }]);
  const all = await db.getAllCatalog();
  assert.deepEqual(all.map((e) => e.token), ["C"]);
});

test("clearCatalog empties the catalog store", async () => {
  await db.replaceAllCatalog([{ token: "A" }]);
  await db.clearCatalog();
  assert.equal((await db.getAllCatalog()).length, 0);
});

test("catalog and scans stores coexist independently", async () => {
  await db.add("SCANNED", 1000);
  await db.replaceAllCatalog([{ token: "A", text: "Alpha" }]);
  assert.equal((await db.getAll()).length, 1);
  assert.equal((await db.getAllCatalog()).length, 1);
});
