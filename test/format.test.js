import { test } from "node:test";
import assert from "node:assert/strict";
import { formatTimestamp, formatBytes, segmentContent } from "../www/js/util/format.js";

test("formatTimestamp pads to YYYY-MM-DD hh:mm:ss", () => {
  // Local-time construction so the assertion is timezone-independent.
  const ms = new Date(2026, 0, 5, 9, 3, 7).getTime();
  assert.equal(formatTimestamp(ms), "2026-01-05 09:03:07");
});

test("formatBytes uses kB below 1 MB", () => {
  assert.equal(formatBytes(0), "0 kB");
  assert.equal(formatBytes(12345), "12.3 kB");
});

test("formatBytes uses MB at or above 1 MB", () => {
  assert.equal(formatBytes(1_400_000), "1.4 MB");
});

test("segmentContent bolds only the 2nd token for the special format", () => {
  assert.deepEqual(segmentContent("12 AB3X 45 6"), [
    { text: "12", bold: false },
    { text: "AB3X", bold: true },
    { text: "45", bold: false },
    { text: "6", bold: false },
  ]);
});

test("segmentContent tolerates extra whitespace between tokens", () => {
  assert.deepEqual(segmentContent("12   AB3X  45 6"), [
    { text: "12", bold: false },
    { text: "AB3X", bold: true },
    { text: "45", bold: false },
    { text: "6", bold: false },
  ]);
});

test("segmentContent returns one normal segment for non-matching content", () => {
  assert.deepEqual(segmentContent("hello world"), [
    { text: "hello world", bold: false },
  ]);
  assert.deepEqual(segmentContent("12 AB 45"), [
    { text: "12 AB 45", bold: false },
  ]);
});
