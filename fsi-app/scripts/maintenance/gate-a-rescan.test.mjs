// gate-a-rescan.test.mjs -- node --test scripts/maintenance/gate-a-rescan.test.mjs. No DB, no network:
// every dep is injected (DI, DRY by default). resolveLimit and selectStaleItems are pure; main() is
// exercised against fake deps mirroring provenance-heal.test.mjs's own shape.
import { test } from "node:test";
import assert from "node:assert/strict";
import { main, resolveLimit, selectStaleItems, CITE } from "./gate-a-rescan.mjs";
import { GATE_A_VERSION } from "../../src/lib/agent/gate-a-scan.mjs";
import { buildGateARow } from "../../src/lib/intake/write-item.ts";

test("CITE carries a governing skill and a reason", () => {
  assert.equal(typeof CITE.skill, "string");
  assert.ok(CITE.skill.length > 0);
  assert.match(CITE.reason, /Gate A re-scan/);
});

// ── resolveLimit ─────────────────────────────────────────────────────────────────────────────────────

test("resolveLimit: a workflow_run trigger is ALWAYS capped at 50, whatever is requested", () => {
  assert.deepEqual(resolveLimit({ trigger: "workflow_run", requested: undefined }), { limit: 50, refused: false, reason: null });
  assert.deepEqual(resolveLimit({ trigger: "workflow_run", requested: 9999 }), { limit: 50, refused: false, reason: null });
});

test("resolveLimit: a dispatch trigger defaults to 500 when nothing is requested", () => {
  const r = resolveLimit({ trigger: "workflow_dispatch", requested: undefined });
  assert.deepEqual(r, { limit: 500, refused: false, reason: null });
});

test("resolveLimit: a dispatch trigger honors a requested value at or under 2000", () => {
  assert.deepEqual(resolveLimit({ trigger: "workflow_dispatch", requested: "1500" }), { limit: 1500, refused: false, reason: null });
  assert.deepEqual(resolveLimit({ trigger: "workflow_dispatch", requested: "2000" }), { limit: 2000, refused: false, reason: null });
});

test("resolveLimit: a dispatch trigger REFUSES (never clamps) a requested value above 2000", () => {
  const r = resolveLimit({ trigger: "workflow_dispatch", requested: "2001" });
  assert.equal(r.refused, true);
  assert.equal(r.limit, null);
  assert.match(r.reason, /2001/);
  assert.match(r.reason, /not clamped/);
});

test("resolveLimit: a dispatch trigger REFUSES a non-positive or non-numeric requested value", () => {
  assert.equal(resolveLimit({ trigger: "workflow_dispatch", requested: "0" }).refused, true);
  assert.equal(resolveLimit({ trigger: "workflow_dispatch", requested: "-5" }).refused, true);
  assert.equal(resolveLimit({ trigger: "workflow_dispatch", requested: "banana" }).refused, true);
});

// ── selectStaleItems ─────────────────────────────────────────────────────────────────────────────────

test("selectStaleItems: a row with no state, or a stale gate_a_version, is stale; a current row is not", () => {
  const items = [
    { id: "a", full_brief: "text a", is_archived: false }, // no state row -> stale
    { id: "b", full_brief: "text b", is_archived: false }, // stale version
    { id: "c", full_brief: "text c", is_archived: false }, // current version
  ];
  const stateByItemId = new Map([
    ["b", { gate_a_version: "OLD", scanned_at: "2026-01-01T00:00:00Z" }],
    ["c", { gate_a_version: GATE_A_VERSION, scanned_at: "2026-01-01T00:00:00Z" }],
  ]);
  const got = selectStaleItems({ items, stateByItemId, gateAVersion: GATE_A_VERSION });
  assert.deepEqual(new Set(got), new Set(["a", "b"]));
});

test("selectStaleItems: excludes archived items and items with an empty/missing full_brief", () => {
  const items = [
    { id: "a", full_brief: "text", is_archived: true },
    { id: "b", full_brief: "", is_archived: false },
    { id: "c", full_brief: null, is_archived: false },
    { id: "d", full_brief: "   ", is_archived: false },
  ];
  const got = selectStaleItems({ items, stateByItemId: new Map(), gateAVersion: GATE_A_VERSION });
  assert.deepEqual(got, []);
});

test("selectStaleItems: touched-first ids (that are themselves stale) sort ahead of the rest", () => {
  const items = [
    { id: "a", full_brief: "x", is_archived: false },
    { id: "b", full_brief: "x", is_archived: false },
    { id: "c", full_brief: "x", is_archived: false },
  ];
  const got = selectStaleItems({ items, stateByItemId: new Map(), gateAVersion: GATE_A_VERSION, touchedFirstIds: ["c", "a"] });
  assert.deepEqual(got.slice(0, 2), ["c", "a"]);
  assert.deepEqual(new Set(got), new Set(["a", "b", "c"]));
});

test("selectStaleItems: a touchedFirstIds entry that is NOT itself stale is never invented into the result", () => {
  const items = [
    { id: "a", full_brief: "x", is_archived: false },
    { id: "b", full_brief: "x", is_archived: false },
  ];
  const stateByItemId = new Map([["b", { gate_a_version: GATE_A_VERSION, scanned_at: "2026-01-01T00:00:00Z" }]]);
  const got = selectStaleItems({ items, stateByItemId, gateAVersion: GATE_A_VERSION, touchedFirstIds: ["b", "a"] });
  assert.deepEqual(got, ["a"]);
});

test("selectStaleItems: the non-touched rest orders by scanned_at ascending, never-scanned first", () => {
  const items = [
    { id: "a", full_brief: "x", is_archived: false },
    { id: "b", full_brief: "x", is_archived: false },
    { id: "c", full_brief: "x", is_archived: false },
  ];
  const stateByItemId = new Map([
    ["a", { gate_a_version: "OLD", scanned_at: "2026-03-01T00:00:00Z" }],
    ["b", { gate_a_version: "OLD", scanned_at: "2026-01-01T00:00:00Z" }],
    // c has no state row at all -> sorts first (never-scanned is staler than any scanned_at)
  ]);
  const got = selectStaleItems({ items, stateByItemId, gateAVersion: GATE_A_VERSION });
  assert.deepEqual(got, ["c", "b", "a"]);
});

// ── main() ───────────────────────────────────────────────────────────────────────────────────────────

function fakeDeps(overrides = {}) {
  const calls = [];
  return {
    calls,
    trigger: "workflow_dispatch",
    requestedLimit: null,
    upstreamRunId: null,
    upstreamFamily: null,
    readCandidateItems: async () => [],
    readGateAStates: async () => [],
    readFactClaims: async () => [],
    derivedCoveredTokens: async () => new Set(),
    readGateAStateRow: async (itemId) => ({ intelligence_item_id: itemId, gate_a_version: GATE_A_VERSION }),
    upsertGateAState: async (row) => { calls.push(["upsertGateAState", row]); },
    readProvenanceStatus: async () => "verified",
    touchItem: async (itemId) => { calls.push(["touchItem", itemId]); },
    readUpstreamTouchedIds: async () => null,
    countDistinctGateAVersions: async () => 1,
    ...overrides,
  };
}

test("main: REFUSED -- a dispatch requesting a limit above 2000 writes nothing, never runs the scan", async () => {
  const deps = fakeDeps({ requestedLimit: "5000" });
  const r = await main({ mode: "apply" }, deps);
  assert.equal(r.exitCode, 1);
  assert.match(r.note, /REFUSED/);
  assert.deepEqual(deps.calls, []);
});

test("main: dry mode never writes, even when candidates are stale", async () => {
  const items = [{ id: "item-a", full_brief: "The levy is €500.", is_archived: false }];
  const deps = fakeDeps({
    readCandidateItems: async () => items,
    readGateAStates: async () => [],
  });
  const r = await main({ mode: "dry" }, deps);
  assert.equal(r.exitCode, 0);
  assert.equal(r.applied, 0);
  assert.equal(r.counts.stale, 1);
  assert.deepEqual(deps.calls, []);
  assert.equal(r.per_item[0].id, "item-a");
  assert.equal(r.per_item[0].touched, false);
});

test("main: apply mode upserts every selected item and touches only the ones that actually changed", async () => {
  const items = [
    { id: "item-a", full_brief: "The levy is €500.", is_archived: false }, // no prior state -> stale, touched
    { id: "item-b", full_brief: "No figures here.", is_archived: false }, // stale version, but Gate A output identical -> upserted, NOT touched
  ];
  // Seed item-b's prior state with the EXACT row a fresh scan will recompute (same brief, no claims,
  // no derived coverage) so its scanned_hash/orphan_count are unchanged -- only gate_a_version is stale.
  const recomputed = buildGateARow({ itemId: "item-b", fullBrief: items[1].full_brief, factClaims: [] });
  const stateByItemId = [
    { intelligence_item_id: "item-b", gate_a_version: "OLD", orphan_count: recomputed.orphan_count, scanned_hash: recomputed.scanned_hash },
  ];
  const deps = fakeDeps({
    readCandidateItems: async () => items,
    readGateAStates: async () => stateByItemId,
    readGateAStateRow: async (itemId) => ({ intelligence_item_id: itemId, gate_a_version: GATE_A_VERSION }),
  });
  const r = await main({ mode: "apply" }, deps);
  assert.equal(r.exitCode, 0);
  const upserts = deps.calls.filter((c) => c[0] === "upsertGateAState");
  assert.equal(upserts.length, 2, "every selected item is upserted");
  const touches = deps.calls.filter((c) => c[0] === "touchItem");
  assert.equal(touches.length, 1, "only item-a (no prior state) is touched");
  assert.deepEqual(touches[0][1], "item-a");
});

test("main: apply mode HALTS non-zero when the post-write readback fails per-step verification", async () => {
  const items = [{ id: "item-a", full_brief: "The levy is €500.", is_archived: false }];
  const deps = fakeDeps({
    readCandidateItems: async () => items,
    readGateAStates: async () => [],
    readGateAStateRow: async () => ({ intelligence_item_id: "item-a", gate_a_version: "STALE-STILL" }),
  });
  const r = await main({ mode: "apply" }, deps);
  assert.equal(r.exitCode, 1);
  assert.match(r.note, /HALT/);
});

test("main: honors the upstream-touched-first ordering when the upstream artifact resolves ids", async () => {
  const items = [
    { id: "a", full_brief: "x", is_archived: false },
    { id: "b", full_brief: "x", is_archived: false },
  ];
  const deps = fakeDeps({
    upstreamRunId: "1001",
    upstreamFamily: "mint",
    readCandidateItems: async () => items,
    readGateAStates: async () => [],
    readUpstreamTouchedIds: async () => ["b", "a"],
  });
  const r = await main({ mode: "dry" }, deps);
  assert.equal(r.per_item[0].id, "b");
  assert.equal(r.per_item[1].id, "a");
  assert.match(r.config.scope_source, /upstream mint artifact for run 1001/);
});

test("main: records an honest scope_source when no upstream artifact is on the tree", async () => {
  const deps = fakeDeps({ readCandidateItems: async () => [] });
  const r = await main({ mode: "dry" }, deps);
  assert.match(r.config.scope_source, /no upstream artifact on the tree/);
});
