// Tests for the pure diff core, scripts/verify/lib/vocab-drift.mjs (D7 part 3).
import { test } from "node:test";
import assert from "node:assert/strict";
import { diffVocabulary } from "./vocab-drift.mjs";

test("diffVocabulary: no drift when both sides agree (order-independent)", () => {
  const live = [{ constraint: "sources_status_check", table: "sources", column: "status", allowed: ["active", "stale"] }];
  const tracked = [{ constraint: "sources_status_check", table: "sources", column: "status", allowed: ["stale", "active"] }];
  const { drift, onlyLive, onlyTracked } = diffVocabulary(live, tracked);
  assert.deepEqual(drift, []);
  assert.deepEqual(onlyLive, []);
  assert.deepEqual(onlyTracked, []);
});

test("diffVocabulary: reports a constraint whose allowed set differs", () => {
  const live = [{ constraint: "provisional_sources_status_check", table: "provisional_sources", column: "status", allowed: ["pending_review", "confirmed", "rejected", "needs_more_data", "promoted"] }];
  const tracked = [{ constraint: "provisional_sources_status_check", table: "provisional_sources", column: "status", allowed: ["pending_review", "confirmed", "rejected", "needs_more_data"] }];
  const { drift } = diffVocabulary(live, tracked);
  assert.equal(drift.length, 1);
  assert.equal(drift[0].constraint, "provisional_sources_status_check");
  assert.deepEqual(drift[0].live, ["pending_review", "confirmed", "rejected", "needs_more_data", "promoted"]);
});

test("diffVocabulary: reports a constraint live but absent from tracked", () => {
  const live = [{ constraint: "new_table_status_check", table: "new_table", column: "status", allowed: ["a"] }];
  const { onlyLive, drift, onlyTracked } = diffVocabulary(live, []);
  assert.equal(onlyLive.length, 1);
  assert.deepEqual(drift, []);
  assert.deepEqual(onlyTracked, []);
});

test("diffVocabulary: reports a constraint tracked but no longer live", () => {
  const tracked = [{ constraint: "gone_table_status_check", table: "gone_table", column: "status", allowed: ["a"] }];
  const { onlyTracked, drift, onlyLive } = diffVocabulary([], tracked);
  assert.equal(onlyTracked.length, 1);
  assert.deepEqual(drift, []);
  assert.deepEqual(onlyLive, []);
});

test("diffVocabulary: both sides unparsed (allowed:null) the same way is agreement, not drift", () => {
  const live = [{ constraint: "x_check", table: "x", column: null, allowed: null }];
  const tracked = [{ constraint: "x_check", table: "x", column: null, allowed: null }];
  const { drift } = diffVocabulary(live, tracked);
  assert.deepEqual(drift, []);
});

test("diffVocabulary: a null-vs-array mismatch on the SAME constraint is reported as drift", () => {
  const live = [{ constraint: "x_check", table: "x", column: "status", allowed: ["a", "b"] }];
  const tracked = [{ constraint: "x_check", table: "x", column: null, allowed: null }];
  const { drift } = diffVocabulary(live, tracked);
  assert.equal(drift.length, 1);
});
