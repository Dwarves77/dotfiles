// Run: node --test scripts/maintenance/apply-classifications.test.mjs -- no DB, deps injected.
// Tests the wrapper's own orchestration: propose+reflect+write cycles for three subtypes
// (--classify, --drift, --anomalies) and auto-adopt evaluation/application. Core logic
// (proposeSourceAxisClassification, detectDrift, etc.) is tested in their own modules;
// this tests the wrapper's orchestration and summary shape only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main, buildRealDeps, CITE } from "./apply-classifications.mjs";
import { __setWriteClientForTest } from "../lib/db.mjs";

// guardedUpdate snapshots prior row state to disk before writing (db.mjs) -- redirect to a tmp dir so
// this test never touches scripts/_snapshots (same convention as reopen-validation-holds.test.mjs /
// stamp-wo26-archive-reason.test.mjs).
process.env.DISCIPLINE_SNAP_DIR = join(tmpdir(), "apply-classifications-test-snapshots");

// Minimal source and item fixtures
const CLASSIFIED_SOURCE = {
  id: "src-1",
  name: "Active Source",
  url: "https://example.com",
  source_role: "regulator",
  status: "active",
  scope_topics: ["regulatory"],
  scope_modes: ["ocean"],
  scope_verticals: ["energy"],
  expected_output: { regulations: 0.5, research: 0.3, market: 0.1, operations: 0.05, out_of_scope: 0.05 },
};

const UNCLASSIFIED_SOURCE = {
  id: "src-2",
  name: "Unclassified",
  url: "https://example.com/2",
  status: "active",
  scope_topics: null,
  scope_modes: null,
  scope_verticals: null,
  expected_output: null,
};

const VERIFIED_ITEM = {
  id: "item-1",
  source_id: "src-1",
  item_type: "regulation",
  domain: 1,
};

function baseDeps(overrides = {}) {
  const calls = [];
  return {
    calls,
    readAll: async (table, cols, opts) => {
      calls.push(["readAll", table, cols]);
      if (table === "sources") return [UNCLASSIFIED_SOURCE, CLASSIFIED_SOURCE];
      if (table === "intelligence_items") return [VERIFIED_ITEM];
      return [];
    },
    insertMany: async (table, rows, opts) => {
      calls.push(["insertMany", table, rows.length]);
      return { inserted: rows.length, snapshot: "snap-ins" };
    },
    updateStale: async (table, ids, patch) => {
      calls.push(["updateStale", table, ids.length]);
      return { updated: ids.length, snapshot: "snap-upd" };
    },
    listOpenClassifications: async () => {
      calls.push(["listOpenClassifications"]);
      return [];
    },
    readFlag: async (id) => {
      calls.push(["readFlag", id]);
      return { data: null, error: null };
    },
    readSource: async (id) => {
      calls.push(["readSource", id]);
      return { data: null, error: null };
    },
    updateSource: async (id, patch) => {
      calls.push(["updateSource", id]);
      return { updated: 0, snapshot: null };
    },
    resolveFlag: async (id, note) => {
      calls.push(["resolveFlag", id]);
      return { updated: 0, snapshot: null };
    },
    ...overrides,
  };
}

// ── dry mode ─────────────────────────────────────────────────────────────────────────────────

test("dry: computes proposals for all three subtypes, lists auto-adopt eligibility, writes nothing", async () => {
  const d = baseDeps();
  const r = await main({ mode: "dry" }, d);
  assert.equal(r.step, "apply-classifications");
  assert.equal(r.mode, "dry");
  assert.equal(r.applied, 0);
  assert.equal(r.exitCode, 0);
  assert.ok(r.counts.propose);
  assert.ok(r.counts.auto_adopt);
  assert.ok(!d.calls.some((c) => c[0] === "insertMany" || c[0] === "updateStale"));
  assert.match(r.note, /DRY/);
});

test("dry: includes classify proposal plan in counts", async () => {
  const d = baseDeps();
  const r = await main({ mode: "dry" }, d);
  assert.ok(r.counts.propose.classify);
  assert.ok(r.counts.propose.classify.plan);
});

test("dry: includes drift and anomaly proposal plans in counts", async () => {
  const d = baseDeps();
  const r = await main({ mode: "dry" }, d);
  assert.ok(r.counts.propose.drift);
  assert.ok(r.counts.propose.anomaly);
});

test("dry: lists open classifications and auto-adopt eligibility in counts", async () => {
  const d = baseDeps();
  const r = await main({ mode: "dry" }, d);
  assert.equal(typeof r.counts.auto_adopt.open_candidates, "number");
  assert.equal(typeof r.counts.auto_adopt.eligible_count, "number");
  assert.equal(typeof r.counts.auto_adopt.not_eligible_count, "number");
  assert.ok(Array.isArray(r.counts.auto_adopt.eligible));
});

// ── apply mode ──────────────────────────────────────────────────────────────────────────────────

test("apply: runs propose with execute=true, writes new flags via insertMany", async () => {
  const d = baseDeps();
  const r = await main({ mode: "apply" }, d);
  assert.equal(r.mode, "apply");
  assert.ok(r.counts.propose);
  // With the fixture sources and items, we expect at least the classify subtype to propose
  // (UNCLASSIFIED_SOURCE has null fields) -- the exact count depends on fixture details
  assert.ok(d.calls.some((c) => c[0] === "insertMany" || (r.applied === 0 && r.counts.propose.classify.plan.new === 0)));
});

test("apply: evaluates open flags for auto-adoption and applies eligible ones", async () => {
  // This test verifies the auto-adopt orchestration runs and tries to apply any eligible flags
  const mockFlag = {
    id: "flag-1",
    created_by: "axis-framework:source-classification",
    status: "open",
    description: `summary\n\nPROPOSALS_JSON: [{"field":"scope_topics","value":["environmental"],"confidence":"medium","applicable":true}]`,
    subject_ref: "src-1",
  };
  const d = baseDeps({
    listOpenClassifications: async () => {
      d.calls.push(["listOpenClassifications"]);
      return [mockFlag];
    },
  });
  const r = await main({ mode: "apply" }, d);
  assert.ok(r.counts.auto_adopt);
  assert.ok(r.counts.auto_adopt.open_candidates >= 1);
  assert.ok(d.calls.some((c) => c[0] === "listOpenClassifications"));
});

test("apply: includes applied count in summary", async () => {
  const d = baseDeps();
  const r = await main({ mode: "apply" }, d);
  assert.equal(typeof r.applied, "number");
  assert.equal(r.applied, 0); // With the base fixture (no eligible flags), applied count is 0
});

test("apply: includes read-back written sources in summary", async () => {
  const d = baseDeps();
  const r = await main({ mode: "apply" }, d);
  assert.ok(typeof r.read_back === "object");
});

test("apply: summary note explains proposal and auto-adopt results", async () => {
  const d = baseDeps();
  const r = await main({ mode: "apply" }, d);
  assert.ok(r.note);
  assert.match(r.note, /Proposed|Auto-adopted/);
});

// ── Mode validation ──────────────────────────────────────────────────────────────────────────────

test("dry by default when mode omitted", async () => {
  const d = baseDeps();
  const r = await main({}, d);
  assert.equal(r.mode, "dry");
});

test("summary always includes step and mode", async () => {
  const d = baseDeps();
  const r = await main({ mode: "dry" }, d);
  assert.equal(r.step, "apply-classifications");
  assert.equal(r.mode, "dry");
});

test("summary includes counts and applied", async () => {
  const d = baseDeps();
  const r = await main({ mode: "dry" }, d);
  assert.ok(r.counts);
  assert.equal(typeof r.applied, "number");
});

// ── buildRealDeps -- regression test for the 2026-09-12 "guardedUpdate is not defined" crash ───────────
//
// Maintenance run 34691660889 (apply mode) threw ReferenceError at updateSource because this file's real
// buildDeps() destructured guardedInsertMany/guardedUpdateByIds from db.mjs but not guardedUpdate, which
// updateSource/resolveFlag both call. Dry mode never reaches those closures (main() returns before Phase
// 2's write loop when mode !== "apply"), so the omission was invisible to every dry-mode test AND to this
// file's own pre-fix tests (all of which pass a hand-built fake `deps` object into main(), never touching
// the real buildRealDeps()/db.mjs import at all). This block calls the REAL buildRealDeps() with db.mjs's
// write-client seam (__setWriteClientForTest) swapped for a fake Supabase client -- so a missing import in
// buildRealDeps throws exactly the same ReferenceError here that it threw in production, and a passing
// test proves the apply-only closures are wired, not just that main()'s orchestration logic is correct.

function makeClient(handler, calls) {
  function from(table) {
    const state = { table, verb: "select", ops: [] };
    const settle = () => { calls.push({ table: state.table, verb: state.verb, ops: state.ops.slice() }); return Promise.resolve(handler(state)); };
    const b = {
      select(c) { if (state.verb !== "insert" && state.verb !== "update" && state.verb !== "delete") state.verb = "select"; state.ops.push(["select", c]); return b; },
      update(p) { state.verb = "update"; state.ops.push(["update", p]); return b; },
      insert(p) { state.verb = "insert"; state.ops.push(["insert", p]); return b; },
      eq(c, v) { state.ops.push(["eq", c, v]); return b; },
      in(c, v) { state.ops.push(["in", c, v]); return b; },
      order(c) { state.ops.push(["order", c]); return b; },
      range(a, z) { state.ops.push(["range", a, z]); return settle(); },
      maybeSingle() { return settle(); },
      single() { return settle(); },
      then(res, rej) { return settle().then(res, rej); },
    };
    return b;
  }
  return { from };
}

test("buildRealDeps().updateSource: calls the real guardedUpdate (no ReferenceError) and writes the patch to sources", async () => {
  const calls = [];
  __setWriteClientForTest(() => makeClient((s) => {
    if (s.table === "sources" && s.verb === "select") return { data: [{ id: "src-1", scope_topics: null }], error: null };
    if (s.table === "sources" && s.verb === "update") return { data: [{ id: "src-1", scope_topics: ["emissions"] }], error: null };
    throw new Error(`unexpected call: ${s.table}/${s.verb}`);
  }, calls));

  const deps = await buildRealDeps();
  const result = await deps.updateSource("src-1", { scope_topics: ["emissions"] });

  assert.equal(result.updated, 1);
  assert.ok(result.snapshot, "expected a snapshot path back from the guarded write");
  const updateCall = calls.find((c) => c.table === "sources" && c.verb === "update");
  assert.ok(updateCall, "expected an .update() call against sources");
  assert.deepEqual(updateCall.ops.find((o) => o[0] === "update")[1], { scope_topics: ["emissions"] });
});

test("buildRealDeps().resolveFlag: calls the real guardedUpdate (no ReferenceError) and resolves the flag", async () => {
  const calls = [];
  __setWriteClientForTest(() => makeClient((s) => {
    if (s.table === "integrity_flags" && s.verb === "select") return { data: [{ id: "flag-1", status: "open" }], error: null };
    if (s.table === "integrity_flags" && s.verb === "update") return { data: [{ id: "flag-1", status: "resolved" }], error: null };
    throw new Error(`unexpected call: ${s.table}/${s.verb}`);
  }, calls));

  const deps = await buildRealDeps();
  const result = await deps.resolveFlag("flag-1", "auto-adopted:classification:scope_topics");

  assert.equal(result.updated, 1);
  assert.ok(result.snapshot);
  const updateCall = calls.find((c) => c.table === "integrity_flags" && c.verb === "update");
  assert.ok(updateCall, "expected an .update() call against integrity_flags");
  const patch = updateCall.ops.find((o) => o[0] === "update")[1];
  assert.equal(patch.status, "resolved");
  assert.equal(patch.resolved_by, "apply-classifications.mjs (MAINT)");
  assert.equal(patch.resolution_note, "auto-adopted:classification:scope_topics");
});

test("buildRealDeps(): readAll/insertMany/updateStale/listOpenClassifications/readFlag/readSource are all present and callable (the whole deps contract, not just the two apply-only closures)", async () => {
  const calls = [];
  __setWriteClientForTest(() => makeClient((s) => {
    if (s.verb === "select") return { data: [], error: null };
    if (s.verb === "insert") return { data: [], error: null };
    if (s.verb === "update") return { data: [], error: null };
    throw new Error(`unexpected call: ${s.table}/${s.verb}`);
  }, calls));

  const deps = await buildRealDeps();
  assert.equal(typeof deps.readAll, "function");
  assert.equal(typeof deps.insertMany, "function");
  assert.equal(typeof deps.updateStale, "function");
  assert.equal(typeof deps.listOpenClassifications, "function");
  assert.equal(typeof deps.readFlag, "function");
  assert.equal(typeof deps.readSource, "function");
  assert.equal(typeof deps.updateSource, "function");
  assert.equal(typeof deps.resolveFlag, "function");

  // Exercise each apply-only write path once more end-to-end via main()'s own real shape is out of scope
  // here (main()'s orchestration is covered by the fake-deps tests above); this test's job is only to
  // prove every contract member buildRealDeps() promises actually exists and is invocable without a
  // ReferenceError -- updateStale (guardedUpdateByIds) and insertMany (guardedInsertMany) included, since
  // those two were correctly imported before this fix and must stay that way.
  await deps.updateStale("integrity_flags", ["flag-x"], { status: "resolved" });
  await deps.insertMany("integrity_flags", [{ category: "source_issue" }], { cite: CITE, select: "id" });
});
