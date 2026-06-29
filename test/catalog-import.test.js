import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseListing,
  listCatalogFiles,
  fetchCatalogFile,
  validateCatalog,
  findConflicts,
  mergeEntries,
} from "../www/js/catalog-import.js";

const LISTING = `<html><body><pre>
<a href="../">../</a>
<a href="series_29.json">series_29.json</a>   28-Jun-2026   345
<a href="notes.txt">notes.txt</a>
</pre></body></html>`;

/** Build a minimal fetch stub returning the given body text. */
function fetchStub(body, ok = true, status = 200) {
  return async () => ({ ok, status, text: async () => body });
}

test("parseListing keeps only .json hrefs", () => {
  assert.deepEqual(parseListing(LISTING), ["series_29.json"]);
});

test("listCatalogFiles fetches and parses the listing", async () => {
  const files = await listCatalogFiles("base/", fetchStub(LISTING));
  assert.deepEqual(files, ["series_29.json"]);
});

test("fetchCatalogFile parses JSON; throws on bad JSON", async () => {
  const obj = await fetchCatalogFile("b/", "x.json", fetchStub('{"A":{}}'));
  assert.deepEqual(obj, { A: {} });
  await assert.rejects(
    fetchCatalogFile("b/", "x.json", fetchStub("not json")),
    /not valid JSON/,
  );
});

test("validateCatalog accepts good entries and copies fields", () => {
  const entries = validateCatalog({
    "418S6": { rn: 1, text: "Mech T-Rex" },
    "718S6": {},
  });
  assert.deepEqual(entries, [
    { token: "418S6", rn: 1, text: "Mech T-Rex" },
    { token: "718S6" },
  ]);
});

test("validateCatalog rejects bad tokens and bad field types", () => {
  assert.throws(() => validateCatalog({ "": {} }), /Invalid token/);
  assert.throws(() => validateCatalog({ "a b": {} }), /Invalid token/);
  assert.throws(() => validateCatalog({ A: { rn: 1.5 } }), /rn/);
  assert.throws(() => validateCatalog({ A: { text: 9 } }), /text/);
});

test("findConflicts lists tokens present in both sets", () => {
  const existing = [{ token: "A" }, { token: "B" }];
  const incoming = [{ token: "B" }, { token: "C" }];
  assert.deepEqual(findConflicts(existing, incoming), ["B"]);
});

test("mergeEntries replaces conflicts when asked", () => {
  const existing = [{ token: "A", text: "old" }, { token: "B", text: "keep" }];
  const incoming = [{ token: "A", text: "new" }, { token: "C", text: "add" }];
  const merged = mergeEntries(existing, incoming, true);
  assert.deepEqual(merged, [
    { token: "B", text: "keep" },
    { token: "A", text: "new" },
    { token: "C", text: "add" },
  ]);
});

test("mergeEntries keeps existing conflicts but adds new tokens", () => {
  const existing = [{ token: "A", text: "old" }];
  const incoming = [{ token: "A", text: "new" }, { token: "C", text: "add" }];
  const merged = mergeEntries(existing, incoming, false);
  assert.deepEqual(merged, [
    { token: "A", text: "old" },
    { token: "C", text: "add" },
  ]);
});
