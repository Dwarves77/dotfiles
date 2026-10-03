// pulse-shared.test.mjs — DB-free node --test proof for the Dashboard five-surface pulse cards'
// pure helpers (Lane DASH, 2026-09-02). Plain ESM, zero deps — portable, joins the no-npm-ci
// discipline suite via a directory glob (see this lane's report for the exact line to add).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PRIORITY_RANK,
  rankByPriorityThenRecency,
  formatShortDate,
} from "./pulse-shared.mjs";

test("PRIORITY_RANK orders CRITICAL first, LOW last", () => {
  assert.equal(PRIORITY_RANK.CRITICAL, 0);
  assert.equal(PRIORITY_RANK.HIGH, 1);
  assert.equal(PRIORITY_RANK.MODERATE, 2);
  assert.equal(PRIORITY_RANK.LOW, 3);
});

test("rankByPriorityThenRecency: sorts by priority band first", () => {
  const input = [
    { id: "a", priority: "LOW", added: "2026-08-01" },
    { id: "b", priority: "CRITICAL", added: "2026-08-01" },
    { id: "c", priority: "MODERATE", added: "2026-08-01" },
  ];
  const out = rankByPriorityThenRecency(input).map((r) => r.id);
  assert.deepEqual(out, ["b", "c", "a"]);
});

test("rankByPriorityThenRecency: ties on priority break by most-recent `added`", () => {
  const input = [
    { id: "old", priority: "HIGH", added: "2026-01-01" },
    { id: "new", priority: "HIGH", added: "2026-08-20" },
    { id: "mid", priority: "HIGH", added: "2026-05-15" },
  ];
  const out = rankByPriorityThenRecency(input).map((r) => r.id);
  assert.deepEqual(out, ["new", "mid", "old"]);
});

test("rankByPriorityThenRecency: unrecognized/missing priority ranks last, never throws", () => {
  const input = [
    { id: "unknown", priority: "NOT_A_BAND", added: "2026-08-01" },
    { id: "low", priority: "LOW", added: "2026-08-01" },
    { id: "none", added: "2026-08-01" },
  ];
  const out = rankByPriorityThenRecency(input).map((r) => r.id);
  assert.equal(out[0], "low");
  assert.ok(out.includes("unknown") && out.includes("none"));
});

test("rankByPriorityThenRecency: does not mutate the input array", () => {
  const input = [
    { id: "a", priority: "LOW", added: "2026-08-01" },
    { id: "b", priority: "CRITICAL", added: "2026-08-01" },
  ];
  const copy = [...input];
  rankByPriorityThenRecency(input);
  assert.deepEqual(input, copy);
});

test("rankByPriorityThenRecency: null/undefined input returns empty array, never throws", () => {
  assert.deepEqual(rankByPriorityThenRecency(null), []);
  assert.deepEqual(rankByPriorityThenRecency(undefined), []);
});

test("formatShortDate: formats an ISO date as 'D Mon' in UTC", () => {
  assert.equal(formatShortDate("2026-08-12T00:00:00Z"), "12 Aug");
  assert.equal(formatShortDate("2026-01-01T23:59:00Z"), "1 Jan");
});

test("formatShortDate: empty/invalid/missing input returns empty string, never throws", () => {
  assert.equal(formatShortDate(""), "");
  assert.equal(formatShortDate(null), "");
  assert.equal(formatShortDate(undefined), "");
  assert.equal(formatShortDate("not-a-date"), "");
});
