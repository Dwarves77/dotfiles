// Tests for reopen-validation-holds.mjs (lane URL-GUIL, 2026-09-03). node:test + node:assert/strict, no
// DB (db.mjs's write-client seam is overridden via __setWriteClientForTest — same mock pattern as
// stamp-wo26-archive-reason.test.mjs / scripts/lib/db.test.mjs).
// Run: node --test scripts/mint/reopen-validation-holds.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.DISCIPLINE_SNAP_DIR = join(tmpdir(), "reopen-validation-holds-test-snapshots");

const { isReopenTarget, appendReopenNote, HOLD_PREFIX, CITE, main } = await import(
  "./reopen-validation-holds.mjs"
);
const { __setWriteClientForTest } = await import("../lib/db.mjs");

test("constants: the hold prefix matches apply-mint-batch.mjs's VALIDATION_FAILED_HOLD_REASON_PREFIX, and the cite is present", () => {
  assert.equal(HOLD_PREFIX, "validation_failed:");
  assert.ok(CITE.skill && CITE.reason, "guardedUpdate requires a { skill, reason } cite — must be present");
});

// ── isReopenTarget — the pure predicate ─────────────────────────────────────────────────────────────

test("isReopenTarget: matches a held validation_failed row whose reason contains the substring (case-insensitive)", () => {
  const row = { dryrun_disposition: "hold", hold_reason: "validation_failed:2:ungrounded_url" };
  assert.equal(isReopenTarget(row, "ungrounded_url"), true);
  assert.equal(isReopenTarget(row, "UNGROUNDED_URL"), true);
  assert.equal(isReopenTarget(row, "2:ungrounded"), true);
});

test("isReopenTarget RED: not currently held -> excluded", () => {
  assert.equal(isReopenTarget({ dryrun_disposition: "would_mint", hold_reason: null }, "ungrounded_url"), false);
});

test("isReopenTarget RED: held for a DIFFERENT reason than the caller named -> excluded (never a blanket sweep)", () => {
  const row = { dryrun_disposition: "hold", hold_reason: "validation_failed:3:fact_missing_source_span" };
  assert.equal(isReopenTarget(row, "ungrounded_url"), false);
});

test("isReopenTarget RED: held, but NOT this lane's validation_failed vocabulary (e.g. a census-write-time hold) -> excluded", () => {
  const row = { dryrun_disposition: "hold", hold_reason: "entity-gate: portal, not a specific document" };
  assert.equal(isReopenTarget(row, "portal"), false);
});

test("isReopenTarget RED: empty/missing reasonContains matches nothing — a blanket reopen is refused at the predicate level too", () => {
  const row = { dryrun_disposition: "hold", hold_reason: "validation_failed:2:ungrounded_url" };
  assert.equal(isReopenTarget(row, ""), false);
  assert.equal(isReopenTarget(row, "   "), false);
  assert.equal(isReopenTarget(row, undefined), false);
  assert.equal(isReopenTarget(row, null), false);
});

// ── appendReopenNote ─────────────────────────────────────────────────────────────────────────────────

test("appendReopenNote: appends to existing notes (the held evidence JSON) rather than discarding it", () => {
  const existing = '[{"criterion":2,"reason":"ungrounded_url","url":"http://eur-lex»"}]';
  const out = appendReopenNote(existing, "ungrounded_url", "2026-09-04T00:00:00.000Z");
  assert.ok(out.startsWith(existing), "the original evidence must survive verbatim, unmodified, at the start");
  assert.match(out, /\[reopened 2026-09-04T00:00:00\.000Z\]/);
  assert.match(out, /ungrounded_url/);
});

test("appendReopenNote: no existing notes -> the marker alone, never a leading blank/undefined", () => {
  const out = appendReopenNote(null, "ungrounded_url", "2026-09-04T00:00:00.000Z");
  assert.equal(out.startsWith("[reopened"), true);
});

// ── main() — DB-mocked integration ──────────────────────────────────────────────────────────────────
// Minimal chainable Supabase mock (same shape as stamp-wo26-archive-reason.test.mjs's own makeClient).
function makeClient(handler, calls) {
  function from(table) {
    const state = { table, verb: "select", ops: [] };
    const settle = () => { calls.push({ table: state.table, verb: state.verb, ops: state.ops.slice() }); return Promise.resolve(handler(state)); };
    const b = {
      select(c) { if (state.verb !== "insert" && state.verb !== "update" && state.verb !== "delete") state.verb = "select"; state.ops.push(["select", c]); return b; },
      update(p) { state.verb = "update"; state.ops.push(["update", p]); return b; },
      eq(c, v) { state.ops.push(["eq", c, v]); return b; },
      order(c) { state.ops.push(["order", c]); return b; },
      range(a, z) { state.ops.push(["range", a, z]); return settle(); },
      then(res, rej) { return settle().then(res, rej); },
    };
    return b;
  }
  return { from };
}

const ALL_ROWS = [
  { id: "cw-1", dryrun_disposition: "hold", hold_reason: "validation_failed:2:ungrounded_url", notes: '[{"criterion":2,"reason":"ungrounded_url"}]' },
  { id: "cw-2", dryrun_disposition: "hold", hold_reason: "validation_failed:3:fact_missing_source_span", notes: "[]" }, // different reason
  { id: "cw-3", dryrun_disposition: "would_mint", hold_reason: null, notes: null }, // not held
  { id: "cw-4", dryrun_disposition: "hold", hold_reason: "entity-gate: portal", notes: null }, // held, wrong vocabulary
];

test("main({apply:false}): DRY-RUN reads census_worklist and reports the matched count, writes NOTHING", async () => {
  const calls = [];
  __setWriteClientForTest(() => makeClient((s) => {
    if (s.table === "census_worklist" && s.verb === "select") return { data: ALL_ROWS, error: null };
    throw new Error(`unexpected call: ${s.table}/${s.verb}`);
  }, calls));

  const result = await main({ reasonContains: "ungrounded_url", apply: false });
  assert.equal(result.mode, "dry-run");
  assert.equal(result.matched, 1);
  assert.ok(!calls.some((c) => c.verb === "update"), "a dry-run must never call .update()");
});

test("main({apply:true}): flips dryrun_disposition back to would_mint, clears hold_reason, appends the reopen note — touches ONLY the matched row", async () => {
  const calls = [];
  let selectCallIndex = 0;
  __setWriteClientForTest(() => makeClient((s) => {
    if (s.table === "census_worklist" && s.verb === "select") {
      selectCallIndex += 1;
      if (selectCallIndex === 1) return { data: ALL_ROWS, error: null }; // readAll's own full scan
      return { data: [ALL_ROWS[0]], error: null }; // guardedUpdate's pre-write snapshot select
    }
    if (s.table === "census_worklist" && s.verb === "update") {
      return { data: [{ id: "cw-1", dryrun_disposition: "would_mint", hold_reason: null }], error: null };
    }
    throw new Error(`unexpected call: ${s.table}/${s.verb}`);
  }, calls));

  const result = await main({ reasonContains: "ungrounded_url", apply: true });
  assert.equal(result.mode, "apply");
  assert.equal(result.matched, 1);
  assert.equal(result.written, 1);
  assert.deepEqual(result.failures, []);

  const updateCall = calls.find((c) => c.verb === "update");
  assert.ok(updateCall, "expected an .update() call");
  const patch = updateCall.ops.find((o) => o[0] === "update")[1];
  assert.equal(patch.dryrun_disposition, "would_mint");
  assert.equal(patch.hold_reason, null);
  assert.match(patch.notes, /\[reopened /);
  assert.match(patch.notes, /"criterion":2/, "the held evidence must survive inside the appended notes");
  const eqOp = updateCall.ops.find((o) => o[0] === "eq");
  assert.deepEqual(eqOp, ["eq", "id", "cw-1"]);
  assert.equal(calls.filter((c) => c.verb === "update").length, 1, "cw-2/cw-3/cw-4 must never be touched");
});

test("main({apply:true}): 0 matching rows -> no update call, written:0 (no-op, never an error)", async () => {
  const calls = [];
  __setWriteClientForTest(() => makeClient((s) => {
    if (s.table === "census_worklist" && s.verb === "select") return { data: ALL_ROWS, error: null };
    throw new Error(`unexpected call: ${s.table}/${s.verb}`);
  }, calls));

  const result = await main({ reasonContains: "some-defect-nothing-matches", apply: true });
  assert.equal(result.matched, 0);
  assert.equal(result.written, 0);
  assert.ok(!calls.some((c) => c.verb === "update"));
});

test("main(): --reason-contains is required — refuses a blanket reopen before any DB call", async () => {
  await assert.rejects(() => main({ apply: false }), /--reason-contains is required/);
  await assert.rejects(() => main({ reasonContains: "  ", apply: false }), /--reason-contains is required/);
});

test("main({apply:true}): a per-row write failure is reported in `failures`, does not abort the batch, and exits non-zero", async () => {
  const calls = [];
  let selectCallIndex = 0;
  __setWriteClientForTest(() => makeClient((s) => {
    if (s.table === "census_worklist" && s.verb === "select") {
      selectCallIndex += 1;
      if (selectCallIndex === 1) return { data: ALL_ROWS, error: null };
      return { data: null, error: { message: "RLS refused" } };
    }
    throw new Error(`unexpected call: ${s.table}/${s.verb}`);
  }, calls));
  const priorExitCode = process.exitCode;
  const result = await main({ reasonContains: "ungrounded_url", apply: true });
  assert.equal(result.written, 0);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].id, "cw-1");
  assert.equal(process.exitCode, 1);
  process.exitCode = priorExitCode;
});
