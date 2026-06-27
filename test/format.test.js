import { test } from "node:test";
import assert from "node:assert/strict";
import { formatTimestamp, formatBytes } from "../js/util/format.js";

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
