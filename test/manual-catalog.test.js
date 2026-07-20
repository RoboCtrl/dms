import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_MANUAL_ROWS,
  buildManualEntries,
  mergeManualEntries,
} from "../www/js/util/manual-catalog.js";

test("MAX_MANUAL_ROWS is 100", () => {
  assert.equal(MAX_MANUAL_ROWS, 100);
});

test("buildManualEntries trims and marks entries with rn -1", () => {
  assert.deepEqual(buildManualEntries([{ token: "  418S6 ", text: " Mech " }]), [
    { token: "418S6", rn: -1, text: "Mech" },
  ]);
});

test("buildManualEntries drops rows with an empty or blank token", () => {
  const rows = [
    { token: "", text: "no token" },
    { token: "   ", text: "blank token" },
    { token: "A1", text: "kept" },
  ];
  assert.deepEqual(buildManualEntries(rows), [
    { token: "A1", rn: -1, text: "kept" },
  ]);
});

test("buildManualEntries omits text when it is blank", () => {
  assert.deepEqual(buildManualEntries([{ token: "A1", text: "  " }]), [
    { token: "A1", rn: -1 },
  ]);
});

test("buildManualEntries tolerates missing or non-string fields", () => {
  assert.deepEqual(buildManualEntries([{ token: "A1" }, {}, null]), [
    { token: "A1", rn: -1 },
  ]);
});

test("buildManualEntries keeps the last row when a token repeats", () => {
  const rows = [
    { token: "A1", text: "first" },
    { token: "A1", text: "second" },
  ];
  assert.deepEqual(buildManualEntries(rows), [
    { token: "A1", rn: -1, text: "second" },
  ]);
});

test("mergeManualEntries replaces a matching token in place", () => {
  const existing = [
    { token: "A1", rn: 3, text: "old" },
    { token: "B2", rn: 4, text: "keep" },
  ];
  const manual = [{ token: "A1", rn: -1, text: "new" }];
  assert.deepEqual(mergeManualEntries(existing, manual), [
    { token: "A1", rn: -1, text: "new" },
    { token: "B2", rn: 4, text: "keep" },
  ]);
});

test("mergeManualEntries appends unknown tokens in order", () => {
  const existing = [{ token: "A1", rn: 3 }];
  const manual = [
    { token: "B2", rn: -1 },
    { token: "C3", rn: -1 },
  ];
  assert.deepEqual(mergeManualEntries(existing, manual), [
    { token: "A1", rn: 3 },
    { token: "B2", rn: -1 },
    { token: "C3", rn: -1 },
  ]);
});

test("mergeManualEntries does not mutate its inputs", () => {
  const existing = [{ token: "A1", rn: 3, text: "old" }];
  const manual = [{ token: "A1", rn: -1, text: "new" }];
  mergeManualEntries(existing, manual);
  assert.deepEqual(existing, [{ token: "A1", rn: 3, text: "old" }]);
  assert.deepEqual(manual, [{ token: "A1", rn: -1, text: "new" }]);
});

test("mergeManualEntries returns the existing set when nothing is added", () => {
  const existing = [{ token: "A1", rn: 3 }];
  assert.deepEqual(mergeManualEntries(existing, []), existing);
});
