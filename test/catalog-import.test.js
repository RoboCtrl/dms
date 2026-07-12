import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseListing,
  listCatalogFiles,
  fetchCatalogFile,
  fetchText,
  validateCatalog,
  findConflicts,
  mergeEntries,
  classifyImportBody,
  listingBaseUrl,
  urlDisplayName,
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

test("parseListing takes the basename of path hrefs", () => {
  assert.deepEqual(parseListing('<a href="/data/foo.json">foo.json</a>'), [
    "foo.json",
  ]);
});

test("parseListing strips query strings and fragments", () => {
  const html =
    '<a href="?C=N;O=D">Name</a> <a href="bar.json?v=2#top">bar.json</a>';
  assert.deepEqual(parseListing(html), ["bar.json"]);
});

test("parseListing decodes URL-encoded names", () => {
  assert.deepEqual(parseListing('<a href="my%20set.json">my set</a>'), [
    "my set.json",
  ]);
});

test("parseListing matches the extension case-insensitively", () => {
  assert.deepEqual(parseListing('<a href="UPPER.JSON">u</a>'), ["UPPER.JSON"]);
});

test("parseListing accepts single-quoted hrefs", () => {
  assert.deepEqual(parseListing("<a href='c.json'>c</a>"), ["c.json"]);
});

test("parseListing skips directory links and de-duplicates", () => {
  const html =
    '<a href="../">..</a><a href="sub/">sub</a>' +
    '<a href="a.json">a</a><a href="a.json">a</a>';
  assert.deepEqual(parseListing(html), ["a.json"]);
});

test("parseListing falls back to plain-text tokens when no hrefs", () => {
  assert.deepEqual(parseListing("a.json\nreadme.txt b.json"), [
    "a.json",
    "b.json",
  ]);
});

test("fetchText returns the body; throws on HTTP error", async () => {
  assert.equal(await fetchText("u", fetchStub("body text")), "body text");
  await assert.rejects(
    fetchText("u", fetchStub("", false, 404)),
    /HTTP 404/,
  );
});

test("classifyImportBody: JSON object body is a catalog", () => {
  assert.deepEqual(classifyImportBody('{"A":{"rn":1}}'), {
    kind: "catalog",
    json: { A: { rn: 1 } },
  });
});

test("classifyImportBody: non-object JSON falls through to listing", () => {
  assert.deepEqual(classifyImportBody("123"), { kind: "listing", files: [] });
});

test("classifyImportBody: HTML body is a listing", () => {
  assert.deepEqual(classifyImportBody(LISTING), {
    kind: "listing",
    files: ["series_29.json"],
  });
});

test("listingBaseUrl ensures a trailing slash", () => {
  assert.equal(listingBaseUrl("https://x.org/data"), "https://x.org/data/");
  assert.equal(listingBaseUrl("https://x.org/data/"), "https://x.org/data/");
});

test("urlDisplayName returns the decoded last path segment", () => {
  assert.equal(urlDisplayName("https://x.org/a/set%201.json?v=2"), "set 1.json");
  assert.equal(urlDisplayName("https://x.org/"), "x.org");
});
