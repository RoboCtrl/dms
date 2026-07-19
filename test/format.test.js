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

test("segmentContent bolds the 1st token and accents its last two chars", () => {
  assert.deepEqual(segmentContent("123 AB3X 45 6"), [
    { text: "1", bold: true, accent: false },
    { text: "23", bold: true, accent: true },
    { text: " AB3X 45 6", bold: false, accent: false },
  ]);
});

test("segmentContent accents the whole 1st token when it has 2 chars or fewer", () => {
  assert.deepEqual(segmentContent("12 AB3X 45 6"), [
    { text: "12", bold: true, accent: true },
    { text: " AB3X 45 6", bold: false, accent: false },
  ]);
  assert.deepEqual(segmentContent("1 AB 2 3"), [
    { text: "1", bold: true, accent: true },
    { text: " AB 2 3", bold: false, accent: false },
  ]);
});

test("segmentContent normalizes whitespace between tokens", () => {
  assert.deepEqual(segmentContent("123   AB3X  45 6"), [
    { text: "1", bold: true, accent: false },
    { text: "23", bold: true, accent: true },
    { text: " AB3X 45 6", bold: false, accent: false },
  ]);
});

test("segmentContent returns one plain segment for non-matching content", () => {
  assert.deepEqual(segmentContent("hello world"), [
    { text: "hello world", bold: false, accent: false },
  ]);
  assert.deepEqual(segmentContent("12 AB 45"), [
    { text: "12 AB 45", bold: false, accent: false },
  ]);
});
