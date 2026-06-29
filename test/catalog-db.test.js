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

test("v1→v2 migration preserves existing scans and creates the catalog store", async () => {
  // __resetForTests already ran in beforeEach: DB is deleted and dbPromise is null.
  // Opening at version 1 here is therefore the FIRST open; it establishes the v1 schema.
  await new Promise((resolve, reject) => {
    const req = indexedDB.open("dms", 1);
    req.onupgradeneeded = () => {
      // Recreate the exact v1 schema: scans store + byContent index.
      const store = req.result.createObjectStore("scans", {
        keyPath: "id",
        autoIncrement: true,
      });
      store.createIndex("byContent", "content", { unique: false });
    };
    req.onsuccess = () => {
      const idb = req.result;
      // Write one scan record before closing v1.
      const tx = idb.transaction("scans", "readwrite");
      tx.objectStore("scans").add({ content: "PRESERVED", timestamp: 1000 });
      tx.oncomplete = () => {
        idb.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });

  // db.getAll() calls openDB() which opens "dms" at VERSION 2.
  // The onupgradeneeded fires: the "scans" store already exists so it is
  // NOT recreated (the guard prevents data loss / a DOMException); the
  // "catalog" store does not exist yet and IS created.
  const scans = await db.getAll();
  assert.equal(scans.length, 1, "pre-existing scan must survive the v1→v2 upgrade");
  assert.equal(scans[0].content, "PRESERVED");

  // Catalog store must be fully operational after the upgrade.
  const catBefore = await db.getAllCatalog();
  assert.equal(catBefore.length, 0, "catalog should start empty after migration");

  await db.replaceAllCatalog([{ token: "X" }]);
  const catAfter = await db.getAllCatalog();
  assert.equal(catAfter.length, 1);
  assert.equal(catAfter[0].token, "X");
});
