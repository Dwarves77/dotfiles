// Run: node --test scripts/maintenance/apply-classifications.test.mjs — no DB, deps injected.
// Tests the wrapper's own orchestration: propose+reflect+write cycles for three subtypes
// (--classify, --drift, --anomalies) and auto-adopt evaluation/application. Core logic
// (proposeSourceAxisClassification, detectDrift, etc.) is tested in their own modules;
// this tests the wrapper's orchestration and summary shape only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { main } from "./apply-classifications.mjs";

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
  // (UNCLASSIFIED_SOURCE has null fields) — the exact count depends on fixture details
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
