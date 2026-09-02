// Run: node --test scripts/review/lib/ruling.test.mjs — pure, no DB.
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateRuling, isRulingStale } from "./ruling.mjs";

const ALLOWED = ["keep", "suspend", "skip"];

test("validateRuling: refuses a group with a missing decision", () => {
  const ruling = { queue: "q", generated_at: "2026-09-02T00:00:00Z", groups: [{ key: "g1", row_ids: ["1"], decision: null }] };
  const r = validateRuling(ruling, ALLOWED);
  assert.equal(r.ok, false);
  assert.match(r.errors.join("\n"), /decision is missing/);
});

test("validateRuling: refuses a decision outside the queue's vocabulary", () => {
  const ruling = { queue: "q", generated_at: "2026-09-02T00:00:00Z", groups: [{ key: "g1", row_ids: ["1"], decision: "delete-everything" }] };
  const r = validateRuling(ruling, ALLOWED);
  assert.equal(r.ok, false);
  assert.match(r.errors.join("\n"), /not one of/);
});

test("validateRuling: accepts every group ruled, including 'skip'", () => {
  const ruling = {
    queue: "q",
    generated_at: "2026-09-02T00:00:00Z",
    groups: [
      { key: "g1", row_ids: ["1"], decision: "keep" },
      { key: "g2", row_ids: ["2"], decision: "suspend" },
      { key: "g3", row_ids: ["3"], decision: "skip" },
    ],
  };
  const r = validateRuling(ruling, ALLOWED);
  assert.deepEqual(r, { ok: true, errors: [] });
});

test("validateRuling: refuses an empty or missing groups array", () => {
  assert.equal(validateRuling({ queue: "q", generated_at: "x", groups: [] }, ALLOWED).ok, false);
  assert.equal(validateRuling({ queue: "q", generated_at: "x" }, ALLOWED).ok, false);
  assert.equal(validateRuling(null, ALLOWED).ok, false);
});

test("isRulingStale: true when a live row is newer than the ruling — both directions covered", () => {
  assert.equal(isRulingStale("2026-09-01T00:00:00Z", "2026-09-02T00:00:00Z"), true); // stale
  assert.equal(isRulingStale("2026-09-02T00:00:00Z", "2026-09-01T00:00:00Z"), false); // fresh
  assert.equal(isRulingStale("2026-09-01T00:00:00Z", null), false); // nothing to compare — never falsely stale
});
