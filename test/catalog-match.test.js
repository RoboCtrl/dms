import { test } from "node:test";
import assert from "node:assert/strict";
import {
  contentWords,
  isValidToken,
  findMatch,
} from "../www/js/util/catalog-match.js";

const map = new Map([
  ["418S6", { token: "418S6", text: "Mech T-Rex" }],
  ["718S6", { token: "718S6", text: "Diver & Fish" }],
]);

test("contentWords splits on any whitespace and drops empties", () => {
  assert.deepEqual(contentWords("  a  b\tc\n"), ["a", "b", "c"]);
});

test("isValidToken rejects empties, whitespace, and non-strings", () => {
  assert.equal(isValidToken("418S6"), true);
  assert.equal(isValidToken(""), false);
  assert.equal(isValidToken("a b"), false);
  assert.equal(isValidToken(5), false);
});

test("findMatch matches a whole word only", () => {
  assert.equal(findMatch("x 418S6 y", map).entry.text, "Mech T-Rex");
  assert.equal(findMatch("418S6X", map), null);
  assert.equal(findMatch("x418S6", map), null);
});

test("findMatch returns the first match in reading order", () => {
  assert.equal(findMatch("718S6 418S6", map).entry.token, "718S6");
});

test("findMatch reports every distinct matching token", () => {
  const res = findMatch("418S6 718S6 418S6", map);
  assert.equal(res.entry.token, "418S6");
  assert.deepEqual(res.matchedTokens, ["418S6", "718S6"]);
});

test("findMatch returns null when nothing matches", () => {
  assert.equal(findMatch("hello world", map), null);
});
