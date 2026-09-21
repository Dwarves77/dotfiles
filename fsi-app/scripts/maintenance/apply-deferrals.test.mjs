// Tests for apply-deferrals.mjs (lane M6, 2026-09-21). Pure-validation only -- no DB call is made by any
// test here (this lane builds the applier; it does not run it -- see the module's own header).
// Run: node --test scripts/maintenance/apply-deferrals.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateDeferralRow,
  partitionDeferralRows,
  buildDeferralFlagRow,
  main,
} from "./apply-deferrals.mjs";

const NOW = new Date("2026-09-21T00:00:00Z");

function validRow(overrides = {}) {
  return {
    item_id: "11111111-1111-1111-1111-111111111111",
    reason: "source silence: primary source unreachable, awaiting reground once refetched",
    deferred_until: "2026-10-15T00:00:00Z",
    owner: "coordinator",
    resolution_event: "next refetch pass for this host",
    ...overrides,
  };
}

test("GREEN: a well-formed row validates", () => {
  const v = validateDeferralRow(validRow(), NOW);
  assert.equal(v.ok, true);
  assert.equal(v.item_id, validRow().item_id);
  assert.equal(v.payload.reason, validRow().reason);
});

test("RED: missing item_id is refused, not thrown", () => {
  const { item_id, ...rest } = validRow();
  const v = validateDeferralRow(rest, NOW);
  assert.equal(v.ok, false);
  assert.match(v.error, /item_id is required/);
});

test("RED: empty-string item_id is refused", () => {
  const v = validateDeferralRow(validRow({ item_id: "  " }), NOW);
  assert.equal(v.ok, false);
  assert.match(v.error, /item_id is required/);
});

test("RED: a vague reason with no disposition-path keyword is refused (assertValidDeferral's own guard, re-exercised here)", () => {
  const v = validateDeferralRow(validRow({ reason: "blocked, needs review, will get to it eventually ok" }), NOW);
  assert.equal(v.ok, false);
  assert.match(v.error, /names no disposition path/);
});

test("RED: an expired deferred_until is refused", () => {
  const v = validateDeferralRow(validRow({ deferred_until: "2020-01-01T00:00:00Z" }), NOW);
  assert.equal(v.ok, false);
  assert.match(v.error, /not in the future/);
});

test("RED: a placeholder owner is refused", () => {
  const v = validateDeferralRow(validRow({ owner: "TBD" }), NOW);
  assert.equal(v.ok, false);
  assert.match(v.error, /placeholder/);
});

test("RED: a missing resolution_event is refused", () => {
  const { resolution_event, ...rest } = validRow();
  const v = validateDeferralRow(rest, NOW);
  assert.equal(v.ok, false);
  assert.match(v.error, /resolution_event is required/);
});

test("partitionDeferralRows: splits valid from invalid, preserving order", () => {
  const rows = [
    validRow({ item_id: "a" }),
    validRow({ item_id: "b", owner: "unknown" }),
    validRow({ item_id: "c" }),
  ];
  const { valid, invalid } = partitionDeferralRows(rows, NOW);
  assert.deepEqual(valid.map((v) => v.item_id), ["a", "c"]);
  assert.deepEqual(invalid.map((v) => v.item_id), ["b"]);
});

test("partitionDeferralRows: a non-array input yields both lists empty, never throws", () => {
  const { valid, invalid } = partitionDeferralRows(null, NOW);
  assert.deepEqual(valid, []);
  assert.deepEqual(invalid, []);
});

test("ATTACK: partitionDeferralRows never lets an invalid row slip into `valid` (mixed batch, malformed entries)", () => {
  const rows = [validRow({ item_id: "ok-1" }), { not: "a deferral row" }, 42, null, validRow({ item_id: "ok-2" })];
  const { valid, invalid } = partitionDeferralRows(rows, NOW);
  assert.deepEqual(valid.map((v) => v.item_id), ["ok-1", "ok-2"]);
  assert.equal(invalid.length, 3);
});

test("buildDeferralFlagRow: shape matches quarantine-disposition-audit.mjs's own read side (created_by, recommended_actions[0].deferral)", () => {
  const v = validateDeferralRow(validRow(), NOW);
  const row = buildDeferralFlagRow(v);
  assert.equal(row.category, "data_quality");
  assert.equal(row.subject_type, "item");
  assert.equal(row.subject_ref, v.item_id);
  assert.equal(row.created_by, "disposition_deferred");
  assert.equal(row.status, "open");
  assert.equal(row.recommended_actions.length, 1);
  assert.deepEqual(row.recommended_actions[0].deferral, v.payload);
});

// ── main(): dry mode plans, apply mode writes only the valid rows -- both exercised with injected deps,
// no real filesystem or DB access. ─────────────────────────────────────────────────────────────────────

test("main: blank --arg is refused before any file read", async () => {
  const res = await main({ mode: "dry", arg: "" }, { readDeferralsFile: async () => { throw new Error("should not be called"); } });
  assert.equal(res.exitCode, 1);
  assert.match(res.note, /--arg must name/);
});

test("main: a file that is not a JSON array is refused", async () => {
  const res = await main({ mode: "dry", arg: "x.json" }, { readDeferralsFile: async () => ({ not: "an array" }) });
  assert.equal(res.exitCode, 1);
  assert.match(res.note, /does not parse to a JSON array/);
});

test("main: dry mode reports a plan and never calls insertDeferralFlag", async () => {
  const rows = [validRow({ item_id: "a" }), validRow({ item_id: "b", owner: "unknown" })];
  let inserted = 0;
  const res = await main(
    { mode: "dry", arg: "x.json" },
    { readDeferralsFile: async () => rows, insertDeferralFlag: async () => { inserted++; return { id: "x" }; } },
  );
  assert.equal(res.exitCode, 0);
  assert.equal(res.applied, 0);
  assert.equal(inserted, 0);
  assert.equal(res.counts.valid, 1);
  assert.equal(res.counts.invalid, 1);
  assert.equal(res.read_back.plan.length, 1);
  assert.equal(res.read_back.plan[0].item_id, "a");
});

test("main: apply mode writes exactly the valid rows, in order, and reports the invalid ones without writing them", async () => {
  const rows = [validRow({ item_id: "a" }), validRow({ item_id: "b", owner: "unknown" }), validRow({ item_id: "c" })];
  const insertedIds = [];
  const res = await main(
    { mode: "apply", arg: "x.json" },
    {
      readDeferralsFile: async () => rows,
      insertDeferralFlag: async (row) => { insertedIds.push(row.subject_ref); return { id: `flag-${row.subject_ref}` }; },
    },
  );
  assert.equal(res.exitCode, 0);
  assert.equal(res.applied, 2);
  assert.deepEqual(insertedIds, ["a", "c"]);
  assert.deepEqual(res.read_back.written.map((w) => w.item_id), ["a", "c"]);
  assert.equal(res.read_back.invalid.length, 1);
  assert.equal(res.read_back.invalid[0].item_id, "b");
});
