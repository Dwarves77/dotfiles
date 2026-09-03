import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateGridQueueGate } from "./grid-queue.mjs";

test("evaluateGridQueueGate: p90 queue longer than the decision horizon -> BLOCKED regardless of magnitude", () => {
  const r = evaluateGridQueueGate({ queueMonthsP90: 36, horizonMonths: 12 });
  assert.equal(r.status, "BLOCKED");
  assert.match(r.note, /BLOCKED regardless of/);
});

test("evaluateGridQueueGate: p90 queue within the horizon -> CLEAR", () => {
  const r = evaluateGridQueueGate({ queueMonthsP90: 8, horizonMonths: 12 });
  assert.equal(r.status, "CLEAR");
});

test("evaluateGridQueueGate: exactly at the horizon is CLEAR (not strictly greater)", () => {
  const r = evaluateGridQueueGate({ queueMonthsP90: 12, horizonMonths: 12 });
  assert.equal(r.status, "CLEAR");
});

test("evaluateGridQueueGate: missing p90 is UNKNOWN, never silently CLEAR", () => {
  const r = evaluateGridQueueGate({ queueMonthsP90: null, horizonMonths: 12 });
  assert.equal(r.status, "UNKNOWN");
  assert.notEqual(r.status, "CLEAR");
});

test("evaluateGridQueueGate: refuses (M) on an invalid horizon", () => {
  assert.equal(evaluateGridQueueGate({ queueMonthsP90: 10, horizonMonths: -1 }).label, "M");
  assert.equal(evaluateGridQueueGate({ queueMonthsP90: 10, horizonMonths: "x" }).label, "M");
});

test("evaluateGridQueueGate: refuses (M) on a negative p90 value", () => {
  assert.equal(evaluateGridQueueGate({ queueMonthsP90: -5, horizonMonths: 12 }).label, "M");
});
