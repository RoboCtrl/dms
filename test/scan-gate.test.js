import { test } from "node:test";
import assert from "node:assert/strict";
import { createScanGate } from "../www/js/util/scan-gate.js";

test("first sighting is accepted", () => {
  const gate = createScanGate(2000);
  assert.equal(gate.accept("A", 0), true);
});

test("same content within cooldown is rejected", () => {
  const gate = createScanGate(2000);
  gate.accept("A", 0);
  assert.equal(gate.accept("A", 1500), false);
});

test("same content after cooldown is accepted again", () => {
  const gate = createScanGate(2000);
  gate.accept("A", 0);
  assert.equal(gate.accept("A", 2500), true);
});

test("different content is accepted immediately", () => {
  const gate = createScanGate(2000);
  gate.accept("A", 0);
  assert.equal(gate.accept("B", 100), true);
});

test("rejection does not reset the cooldown timer", () => {
  const gate = createScanGate(2000);
  gate.accept("A", 0);     // accepted; lastTime = 0
  gate.accept("A", 1500);  // rejected; lastTime must stay 0
  // 2100 ms after the first accepted sighting → should re-accept
  assert.equal(gate.accept("A", 2100), true);
});
