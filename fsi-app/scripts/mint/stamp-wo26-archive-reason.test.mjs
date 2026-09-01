// Tests for stamp-wo26-archive-reason.mjs (Lane POP, 2026-09-01). node:test + node:assert/strict, no DB
// (db.mjs's write-client seam is overridden via __setWriteClientForTest — same mock pattern as
// scripts/lib/db.test.mjs). Run: node --test scripts/mint/stamp-wo26-archive-reason.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.DISCIPLINE_SNAP_DIR = join(tmpdir(), "stamp-wo26-test-snapshots");

const { isWo26UnstampedRow, ARCHIVE_REASON, TARGET_DATE, EXPECTED_COUNT, CITE, main } = await import(
  "./stamp-wo26-archive-reason.mjs"
);
const { __setWriteClientForTest } = await import("../lib/db.mjs");

test("constants: the archive reason and target date match Addendum 28 / system-review-2026-09-01.md", () => {
  assert.equal(ARCHIVE_REASON, "out_of_scope_wo26");
  assert.equal(TARGET_DATE, "2026-08-21");
  assert.equal(EXPECTED_COUNT, 491);
  assert.ok(CITE.skill && CITE.reason, "guardedUpdate requires a { skill, reason } cite — must be present");
  assert.match(CITE.reason, /Addendum 28|WO-26/);
});

// ── isWo26UnstampedRow — the pure four-condition predicate ─────────────────────────────────────────
test("isWo26UnstampedRow: matches exactly the four conditions (archived + reasonless + right date + verified)", () => {
  const good = { is_archived: true, archive_reason: null, archived_date: "2026-08-21", provenance_status: "verified" };
  assert.equal(isWo26UnstampedRow(good), true);
});

test("isWo26UnstampedRow: undefined archive_reason counts as unstamped too (not only literal null)", () => {
  const good = { is_archived: true, archived_date: "2026-08-21", provenance_status: "verified" };
  assert.equal(isWo26UnstampedRow(good), true);
});

test("isWo26UnstampedRow RED: not archived -> excluded", () => {
  assert.equal(isWo26UnstampedRow({ is_archived: false, archive_reason: null, archived_date: "2026-08-21", provenance_status: "verified" }), false);
});

test("isWo26UnstampedRow RED: already stamped (any non-null reason) -> excluded (idempotency)", () => {
  assert.equal(
    isWo26UnstampedRow({ is_archived: true, archive_reason: "out_of_scope_wo26", archived_date: "2026-08-21", provenance_status: "verified" }),
    false,
  );
  assert.equal(
    isWo26UnstampedRow({ is_archived: true, archive_reason: "off_domain", archived_date: "2026-08-21", provenance_status: "verified" }),
    false,
  );
});

test("isWo26UnstampedRow RED: wrong archived_date -> excluded (never sweeps in an unrelated archive wave)", () => {
  assert.equal(isWo26UnstampedRow({ is_archived: true, archive_reason: null, archived_date: "2026-08-20", provenance_status: "verified" }), false);
});

test("isWo26UnstampedRow RED: not provenance_status='verified' -> excluded", () => {
  assert.equal(isWo26UnstampedRow({ is_archived: true, archive_reason: null, archived_date: "2026-08-21", provenance_status: "quarantined" }), false);
});

// ── main() — DB-mocked integration ──────────────────────────────────────────────────────────────────
// Minimal chainable Supabase mock (same shape as scripts/lib/db.test.mjs's makeClient): handler({table,
// verb, ops}) -> { data, error }; settles on .range()/.single() or the automatic thenable await.
function makeClient(handler, calls) {
  function from(table) {
    const state = { table, verb: "select", ops: [] };
    const settle = () => { calls.push({ table: state.table, verb: state.verb, ops: state.ops.slice() }); return Promise.resolve(handler(state)); };
    const b = {
      select(c) { if (state.verb !== "insert" && state.verb !== "update" && state.verb !== "delete") state.verb = "select"; state.ops.push(["select", c]); return b; },
      update(p) { state.verb = "update"; state.ops.push(["update", p]); return b; },
      eq(c, v) { state.ops.push(["eq", c, v]); return b; },
      is(c, v) { state.ops.push(["is", c, v]); return b; },
      order(c) { state.ops.push(["order", c]); return b; },
      range(a, z) { state.ops.push(["range", a, z]); return settle(); },
      then(res, rej) { return settle().then(res, rej); },
    };
    return b;
  }
  return { from };
}

const ALL_ROWS = [
  { id: "aaaaaaaa-0000-0000-0000-000000000001", is_archived: true, archive_reason: null, archived_date: "2026-08-21", provenance_status: "verified" },
  { id: "bbbbbbbb-0000-0000-0000-000000000002", is_archived: true, archive_reason: null, archived_date: "2026-08-21", provenance_status: "verified" },
  { id: "cccccccc-0000-0000-0000-000000000003", is_archived: true, archive_reason: "off_domain", archived_date: "2026-08-21", provenance_status: "verified" }, // already stamped, different reason
  { id: "dddddddd-0000-0000-0000-000000000004", is_archived: true, archive_reason: null, archived_date: "2026-08-20", provenance_status: "verified" }, // wrong date
  { id: "eeeeeeee-0000-0000-0000-000000000005", is_archived: false, archive_reason: null, archived_date: "2026-08-21", provenance_status: "verified" }, // not archived
];
const MATCHING_IDS = ["aaaaaaaa-0000-0000-0000-000000000001", "bbbbbbbb-0000-0000-0000-000000000002"];

test("main({apply:false}): DRY-RUN reads intelligence_items and reports the matched count, writes NOTHING (no update call)", async () => {
  const calls = [];
  __setWriteClientForTest(() => makeClient((s) => {
    if (s.table === "intelligence_items" && s.verb === "select") return { data: ALL_ROWS, error: null };
    throw new Error(`unexpected call: ${s.table}/${s.verb}`);
  }, calls));

  const result = await main({ apply: false });
  assert.equal(result.mode, "dry-run");
  assert.equal(result.matched, 2);
  assert.ok(!calls.some((c) => c.verb === "update"), "a dry-run must never call .update()");
});

test("main({apply:true}): writes archive_reason via guardedUpdate with the correct cite and filter predicates, returns written count", async () => {
  const calls = [];
  __setWriteClientForTest(() => makeClient((s) => {
    if (s.table === "intelligence_items" && s.verb === "select") return { data: ALL_ROWS, error: null }; // readAll's scan
    if (s.table === "intelligence_items" && s.verb === "select" ) return { data: [], error: null };
    return { data: null, error: null };
  }, calls));
  // Two distinct select behaviors are needed (readAll's full scan vs guardedUpdate's snapshot-select) —
  // route by call ORDER instead, since both are table=intelligence_items/verb=select.
  let selectCallIndex = 0;
  __setWriteClientForTest(() => makeClient((s) => {
    if (s.table === "intelligence_items" && s.verb === "select") {
      selectCallIndex += 1;
      if (selectCallIndex === 1) return { data: ALL_ROWS, error: null }; // readAll's own full scan
      // guardedUpdate's pre-write snapshot select, filtered by applyMatch — simulate the DB doing the
      // filtering for real (only the two matching rows).
      return { data: ALL_ROWS.filter((r) => MATCHING_IDS.includes(r.id)), error: null };
    }
    if (s.table === "intelligence_items" && s.verb === "update") {
      return { data: MATCHING_IDS.map((id) => ({ id, archive_reason: "out_of_scope_wo26" })), error: null };
    }
    throw new Error(`unexpected call: ${s.table}/${s.verb}`);
  }, calls));

  const result = await main({ apply: true });
  assert.equal(result.mode, "apply");
  assert.equal(result.matched, 2);
  assert.equal(result.written, 2);

  const updateCall = calls.find((c) => c.verb === "update");
  assert.ok(updateCall, "expected exactly one .update() call");
  assert.deepEqual(updateCall.ops.find((o) => o[0] === "update")[1], { archive_reason: "out_of_scope_wo26" });
  const eqOps = updateCall.ops.filter((o) => o[0] === "eq");
  assert.ok(eqOps.some((o) => o[1] === "is_archived" && o[2] === true));
  assert.ok(eqOps.some((o) => o[1] === "archived_date" && o[2] === "2026-08-21"));
  assert.ok(eqOps.some((o) => o[1] === "provenance_status" && o[2] === "verified"));
  const isOps = updateCall.ops.filter((o) => o[0] === "is");
  assert.ok(isOps.some((o) => o[1] === "archive_reason" && o[2] === null));
});

test("main({apply:true}): 0 matching rows -> no update call, written:0 (no-op, never an error)", async () => {
  const calls = [];
  __setWriteClientForTest(() => makeClient((s) => {
    if (s.table === "intelligence_items" && s.verb === "select") {
      return { data: ALL_ROWS.filter((r) => !MATCHING_IDS.includes(r.id)), error: null }; // none unstamped
    }
    throw new Error(`unexpected call: ${s.table}/${s.verb}`);
  }, calls));

  const result = await main({ apply: true });
  assert.equal(result.matched, 0);
  assert.equal(result.written, 0);
  assert.ok(!calls.some((c) => c.verb === "update"));
});
