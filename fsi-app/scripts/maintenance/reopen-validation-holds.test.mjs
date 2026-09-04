// Run: node --test scripts/maintenance/reopen-validation-holds.test.mjs — no DB, deps injected (same
// pattern as origin-class-backfill.test.mjs). scripts/mint/reopen-validation-holds.mjs's own selection
// predicate (isReopenTarget) and its own DB-mocked write path are pinned in that file's own test suite
// (scripts/mint/reopen-validation-holds.test.mjs); this file tests ONLY the wrapper's own orchestration —
// the --arg gate, dry-plan shaping, apply read-back, and that it never re-derives the selection or write
// itself (a single `deps.reopenMain` call per invocation is the whole DB interaction on the write side).
import { test } from "node:test";
import assert from "node:assert/strict";
import { main, notesHead } from "./reopen-validation-holds.mjs";

const LONG_NOTES = "x".repeat(250);

test("notesHead: short/absent notes pass through unchanged; long notes truncate with an ellipsis", () => {
  assert.equal(notesHead(null), null);
  assert.equal(notesHead(undefined), null);
  assert.equal(notesHead("short"), "short");
  const truncated = notesHead(LONG_NOTES);
  assert.equal(truncated.length, 201); // 200 chars + ellipsis
  assert.ok(truncated.endsWith("…"));
  assert.ok(LONG_NOTES.startsWith(truncated.slice(0, -1)));
});

// ── --arg gate: refuses BEFORE any DB call, in both modes ──────────────────────────────────────────────

function unreachableDeps() {
  return {
    reopenMain: async () => { throw new Error("reopenMain must not be called when --arg is blank"); },
    readAll: async () => { throw new Error("readAll must not be called when --arg is blank"); },
  };
}

test("dry, blank arg: refused, exit 1, no DB call", async () => {
  const r = await main({ mode: "dry", arg: "" }, unreachableDeps());
  assert.equal(r.step, "reopen-validation-holds");
  assert.equal(r.exitCode, 1);
  assert.match(r.note, /REFUSED/);
  assert.match(r.note, /--arg/);
});

test("dry, whitespace-only arg: refused the same as blank", async () => {
  const r = await main({ mode: "dry", arg: "   " }, unreachableDeps());
  assert.equal(r.exitCode, 1);
  assert.match(r.note, /REFUSED/);
});

test("dry, missing arg entirely (undefined): refused", async () => {
  const r = await main({ mode: "dry" }, unreachableDeps());
  assert.equal(r.exitCode, 1);
});

test("apply, blank arg: refused, exit 1, no DB call — a blanket apply is refused just as hard as a blanket dry read", async () => {
  const r = await main({ mode: "apply", arg: "" }, unreachableDeps());
  assert.equal(r.exitCode, 1);
  assert.match(r.note, /REFUSED/);
});

// ── dry mode: renders the full per-row plan from reopenMain's targets, writes nothing ──────────────────

test("dry: passes reasonContains through trimmed, apply:false; shapes targets into a per-row plan", async () => {
  const calls = [];
  const deps = {
    reopenMain: async (opts) => {
      calls.push(opts);
      return {
        mode: "dry-run",
        matched: 1,
        targets: [
          { id: "cw-1", dryrun_disposition: "hold", hold_reason: "validation_failed:2:ungrounded_url", notes: '[{"criterion":2,"reason":"ungrounded_url","url":"http://eur-lex»"}]' },
        ],
      };
    },
    readAll: async () => { throw new Error("dry mode must never call readAll"); },
  };
  const r = await main({ mode: "dry", arg: "  ungrounded_url  " }, deps);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { reasonContains: "ungrounded_url", apply: false });
  assert.equal(r.mode, "dry");
  assert.equal(r.counts.matched, 1);
  assert.equal(r.applied, 0);
  assert.equal(r.plan.length, 1);
  assert.equal(r.plan[0].id, "cw-1");
  assert.equal(r.plan[0].hold_reason, "validation_failed:2:ungrounded_url");
  assert.match(r.plan[0].notes_head, /ungrounded_url/);
  assert.deepEqual(r.read_back, {});
  assert.equal(r.exitCode, 0);
});

test("dry: 0 matched rows -> empty plan, not an error", async () => {
  const deps = {
    reopenMain: async () => ({ mode: "dry-run", matched: 0, targets: [] }),
    readAll: async () => { throw new Error("dry mode must never call readAll"); },
  };
  const r = await main({ mode: "dry", arg: "some-defect-nothing-matches" }, deps);
  assert.equal(r.counts.matched, 0);
  assert.deepEqual(r.plan, []);
  assert.equal(r.exitCode, 0);
});

// ── apply mode: writes through reopenMain only, then reads back exactly the written ids ─────────────────

test("apply: passes apply:true through; reads back only writtenIds; reports counts/applied", async () => {
  const calls = { reopenMain: [], readAll: [] };
  const deps = {
    reopenMain: async (opts) => {
      calls.reopenMain.push(opts);
      return { mode: "apply", matched: 1, written: 1, writtenIds: ["cw-1"], failures: [] };
    },
    readAll: async (table, cols, opts) => {
      calls.readAll.push({ table, cols, opts });
      return [{ id: "cw-1", dryrun_disposition: "would_mint", hold_reason: null, notes: "[reopened ...] " + LONG_NOTES }];
    },
  };
  const r = await main({ mode: "apply", arg: "ungrounded_url" }, deps);
  assert.deepEqual(calls.reopenMain[0], { reasonContains: "ungrounded_url", apply: true });
  assert.equal(calls.readAll.length, 1);
  assert.equal(calls.readAll[0].table, "census_worklist");
  assert.equal(r.counts.matched, 1);
  assert.equal(r.counts.written, 1);
  assert.equal(r.counts.failed, 0);
  assert.equal(r.applied, 1);
  assert.equal(r.read_back.reopened_count, 1);
  assert.equal(r.read_back.reopened[0].id, "cw-1");
  assert.equal(r.read_back.reopened[0].dryrun_disposition, "would_mint");
  assert.equal(r.read_back.reopened[0].hold_reason, null);
  assert.ok(r.read_back.reopened[0].notes_head.length <= 201);
  assert.equal(r.exitCode, 0);
});

test("apply: 0 matched -> no readAll call, empty read_back, exit 0 (a no-op is not a failure)", async () => {
  const calls = [];
  const deps = {
    reopenMain: async () => ({ mode: "apply", matched: 0, written: 0, writtenIds: [], failures: [] }),
    readAll: async (...args) => { calls.push(args); return []; },
  };
  const r = await main({ mode: "apply", arg: "nothing-matches-this" }, deps);
  assert.equal(r.counts.matched, 0);
  assert.equal(r.applied, 0);
  assert.equal(calls.length, 0, "no writtenIds means no read_back call is needed");
  assert.deepEqual(r.read_back, { reopened_count: 0, reopened: [] });
  assert.equal(r.exitCode, 0);
});

test("apply: a per-row write failure is surfaced in the summary note and sets exitCode 1, but read_back still covers whatever DID write", async () => {
  const deps = {
    reopenMain: async () => ({
      mode: "apply",
      matched: 2,
      written: 1,
      writtenIds: ["cw-1"],
      failures: [{ id: "cw-2", error: "RLS refused" }],
    }),
    readAll: async () => [{ id: "cw-1", dryrun_disposition: "would_mint", hold_reason: null, notes: null }],
  };
  const r = await main({ mode: "apply", arg: "ungrounded_url" }, deps);
  assert.equal(r.counts.matched, 2);
  assert.equal(r.counts.written, 1);
  assert.equal(r.counts.failed, 1);
  assert.equal(r.exitCode, 1);
  assert.match(r.note, /1 of 2 matched row\(s\) failed/);
  assert.match(r.note, /RLS refused/);
  assert.equal(r.read_back.reopened_count, 1);
  assert.equal(r.read_back.reopened[0].id, "cw-1");
});
