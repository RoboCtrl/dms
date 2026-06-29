import "fake-indexeddb/auto";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as db from "../www/js/db.js";
import { createCatalog } from "../www/js/catalog.js";

beforeEach(async () => {
  await db.__resetForTests();
});

test("displayFor returns the text of a matched token", async () => {
  const catalog = createCatalog(db);
  await catalog.replaceAll([{ token: "418S6", text: "Mech T-Rex" }]);
  assert.equal(catalog.displayFor("x 418S6 y"), "Mech T-Rex");
});

test("displayFor returns null when there is no match", async () => {
  const catalog = createCatalog(db);
  await catalog.replaceAll([{ token: "418S6", text: "Mech T-Rex" }]);
  assert.equal(catalog.displayFor("nothing here"), null);
});

test("displayFor returns null when the matched entry has no text", async () => {
  const catalog = createCatalog(db);
  await catalog.replaceAll([{ token: "418S6" }]);
  assert.equal(catalog.displayFor("x 418S6 y"), null);
});

test("load reads persisted entries into the mirror", async () => {
  await db.replaceAllCatalog([{ token: "A", text: "Alpha" }]);
  const catalog = createCatalog(db);
  await catalog.load();
  assert.equal(catalog.getEntries().length, 1);
  assert.equal(catalog.displayFor("see A now"), "Alpha");
});

test("replaceAll and clear emit change", async () => {
  const catalog = createCatalog(db);
  let fired = 0;
  catalog.on("change", () => (fired += 1));
  await catalog.replaceAll([{ token: "A", text: "Alpha" }]);
  await catalog.clear();
  assert.equal(fired, 2);
  assert.equal(catalog.getEntries().length, 0);
});
