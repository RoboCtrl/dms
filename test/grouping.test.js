import { test } from "node:test";
import assert from "node:assert/strict";
import { groupKey } from "../www/js/util/grouping.js";

test("full mode keys on the whole content string", () => {
  assert.equal(groupKey("12 AB34 5 6", "full"), "12 AB34 5 6");
});

test("unknown mode falls back to full", () => {
  assert.equal(groupKey("hello world", "wat"), "hello world");
});

test("none mode is always ungrouped", () => {
  assert.equal(groupKey("anything", "none"), null);
});

test("firstSuffix keys on the last two chars of the first token", () => {
  assert.equal(groupKey("418S6 rest", "firstSuffix"), "S6");
});

test("firstSuffix is ungrouped when the first token is too short or absent", () => {
  assert.equal(groupKey("A rest", "firstSuffix"), null);
  assert.equal(groupKey("   ", "firstSuffix"), null);
});

test("secondToken keys on the second whitespace token", () => {
  assert.equal(groupKey("12 AB34 5 6", "secondToken"), "AB34");
});

test("secondToken is ungrouped when there is no second token", () => {
  assert.equal(groupKey("solo", "secondToken"), null);
});
