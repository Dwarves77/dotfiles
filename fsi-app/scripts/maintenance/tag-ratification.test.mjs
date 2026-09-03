// Run: node --test scripts/maintenance/tag-ratification.test.mjs — no DB, deps injected.
// evaluateApplication/applyTags/buildMergePatch themselves are pinned in
// scripts/connections/apply-tags.test.mjs; this file tests the wrapper's own orchestration only:
// listing ratifiable candidates, the arg-required apply gate, and per-id apply + read_back.
import { test } from "node:test";
import assert from "node:assert/strict";
import { main } from "./tag-ratification.mjs";
import { TAG_NAMESPACE, createdBy, buildSubjectRef } from "../../src/lib/connections/flag-namespaces.mjs";

const RATIFIED_FLAG = {
  id: "flag-1",
  subject_ref: buildSubjectRef("item-1"),
  created_by: createdBy(TAG_NAMESPACE, "empty-signature"),
  status: "resolved",
  resolved_by: "operator",
  resolution_note: "looks right, ratify:tags",
  description: 'summary\n\nPROPOSALS_JSON: [{"field":"topic_tags","tag":"fuel-eu","evidence":"x","confidence":"high"}]',
};

const RESOLVED_NOT_RATIFIED_FLAG = {
  id: "flag-2",
  subject_ref: buildSubjectRef("item-2"),
  created_by: createdBy(TAG_NAMESPACE, "empty-signature"),
  status: "resolved",
  resolved_by: "operator",
  resolution_note: "not this — false positive",
  description: 'summary\n\nPROPOSALS_JSON: [{"field":"topic_tags","tag":"noise","evidence":"x","confidence":"low"}]',
};

function baseDeps(overrides = {}) {
  const calls = [];
  const items = new Map([
    ["item-1", { id: "item-1", operational_scenario_tags: [], compliance_object_tags: [], topic_tags: [] }],
    ["item-2", { id: "item-2", operational_scenario_tags: [], compliance_object_tags: [], topic_tags: [] }],
  ]);
  return {
    calls,
    listResolvedCandidates: async () => [RATIFIED_FLAG, RESOLVED_NOT_RATIFIED_FLAG],
    readFlag: async (id) => {
      calls.push(["readFlag", id]);
      const flag = [RATIFIED_FLAG, RESOLVED_NOT_RATIFIED_FLAG].find((f) => f.id === id);
      return { data: flag ?? null, error: null };
    },
    readItem: async (id) => {
      calls.push(["readItem", id]);
      return { data: items.get(id) ?? null, error: null };
    },
    updateItem: async (id, patch) => {
      calls.push(["updateItem", id, patch]);
      items.set(id, { ...items.get(id), ...patch });
      return { updated: 1, snapshot: "snap" };
    },
    ...overrides,
  };
}

test("dry: lists ratifiable vs. not-ratifiable candidates, writes nothing", async () => {
  const d = baseDeps();
  const r = await main({ mode: "dry" }, d);
  assert.equal(r.step, "tag-ratification");
  assert.equal(r.applied, 0);
  assert.equal(r.counts.resolved_candidates, 2);
  assert.equal(r.counts.ratifiable.length, 1);
  assert.equal(r.counts.ratifiable[0].flag_id, "flag-1");
  assert.equal(r.counts.not_ratifiable_count, 1);
  assert.ok(!d.calls.some((c) => c[0] === "updateItem"));
  assert.equal(r.exitCode, 0);
});

test("apply without arg: refused, no writes", async () => {
  const d = baseDeps();
  const r = await main({ mode: "apply", arg: "" }, d);
  assert.equal(r.applied, 0);
  assert.equal(r.exitCode, 1);
  assert.match(r.note, /REFUSED/);
  assert.ok(!d.calls.some((c) => c[0] === "updateItem"));
});

test("apply with arg naming the ratified flag: applies through applyTags, reads back the item's tags", async () => {
  const d = baseDeps();
  const r = await main({ mode: "apply", arg: "flag-1" }, d);
  assert.equal(r.applied, 1);
  assert.equal(r.counts.apply_results[0].status, "applied");
  assert.ok(d.calls.some((c) => c[0] === "updateItem" && c[1] === "item-1"));
  assert.ok(r.read_back["item-1"]);
  assert.deepEqual(r.read_back["item-1"].topic_tags, ["fuel-eu"]);
});

test("apply naming a resolved-but-not-ratified flag: applyTags reports not_ratifiable, nothing written for it", async () => {
  const d = baseDeps();
  const r = await main({ mode: "apply", arg: "flag-2" }, d);
  assert.equal(r.applied, 0);
  assert.equal(r.counts.apply_results[0].status, "not_ratifiable");
  assert.ok(!d.calls.some((c) => c[0] === "updateItem"));
});

test("apply with a comma-separated list applies each id independently", async () => {
  const d = baseDeps();
  const r = await main({ mode: "apply", arg: "flag-1, flag-2" }, d);
  assert.equal(r.applied, 1); // flag-1 applies, flag-2 does not
  assert.equal(r.counts.apply_results.length, 2);
});

// ── arg="auto" (2026-09-03 auto-adoption ruling) ─────────────────────────────────────────────────

const OPEN_MIXED_FLAG = {
  id: "flag-open-mixed",
  subject_ref: buildSubjectRef("item-3"),
  created_by: createdBy(TAG_NAMESPACE, "empty-signature"),
  status: "open",
  resolved_by: null,
  resolution_note: null,
  description:
    'summary\n\nPROPOSALS_JSON: [' +
    '{"field":"operational_scenario_tags","tag":"ocean-bunkering","evidence":"bunkering","confidence":"high"},' +
    '{"field":"topic_tags","tag":"emissions","evidence":"carbon pricing","confidence":"medium"}]',
};

const OPEN_ALL_HIGH_FLAG = {
  id: "flag-open-high",
  subject_ref: buildSubjectRef("item-4"),
  created_by: createdBy(TAG_NAMESPACE, "empty-signature"),
  status: "open",
  resolved_by: null,
  resolution_note: null,
  description: 'summary\n\nPROPOSALS_JSON: [{"field":"topic_tags","tag":"fuels","evidence":"e-fuel","confidence":"high"}]',
};

const OPEN_ALL_MEDIUM_FLAG = {
  id: "flag-open-medium",
  subject_ref: buildSubjectRef("item-5"),
  created_by: createdBy(TAG_NAMESPACE, "empty-signature"),
  status: "open",
  resolved_by: null,
  resolution_note: null,
  description: 'summary\n\nPROPOSALS_JSON: [{"field":"topic_tags","tag":"packaging","evidence":"circular economy packaging","confidence":"medium"}]',
};

function autoDeps(overrides = {}) {
  const calls = [];
  const items = new Map([
    ["item-3", { id: "item-3", operational_scenario_tags: [], compliance_object_tags: [], topic_tags: [] }],
    ["item-4", { id: "item-4", operational_scenario_tags: [], compliance_object_tags: [], topic_tags: [] }],
    ["item-5", { id: "item-5", operational_scenario_tags: [], compliance_object_tags: [], topic_tags: [] }],
  ]);
  const flags = new Map([
    [OPEN_MIXED_FLAG.id, OPEN_MIXED_FLAG],
    [OPEN_ALL_HIGH_FLAG.id, OPEN_ALL_HIGH_FLAG],
    [OPEN_ALL_MEDIUM_FLAG.id, OPEN_ALL_MEDIUM_FLAG],
  ]);
  return {
    calls,
    listOpenCandidates: async () => [...flags.values()],
    readFlag: async (id) => { calls.push(["readFlag", id]); return { data: flags.get(id) ?? null, error: null }; },
    readItem: async (id) => { calls.push(["readItem", id]); return { data: items.get(id) ?? null, error: null }; },
    updateItem: async (id, patch) => { calls.push(["updateItem", id, patch]); items.set(id, { ...items.get(id), ...patch }); return { updated: 1, snapshot: "snap" }; },
    resolveFlag: async (id, note) => { calls.push(["resolveFlag", id, note]); flags.set(id, { ...flags.get(id), status: "resolved", resolved_by: "apply-tags.mjs", resolution_note: note }); return { updated: 1, snapshot: "flag-snap" }; },
    ...overrides,
  };
}

test("auto, dry: lists eligible/below-threshold/not-adoptable open flags, writes nothing", async () => {
  const d = autoDeps();
  const r = await main({ mode: "dry", arg: "auto" }, d);
  assert.equal(r.counts.open_candidates, 3);
  assert.equal(r.counts.threshold, "high");
  assert.equal(r.counts.eligible.length, 2); // mixed + all-high both have >=1 high proposal
  assert.equal(r.counts.below_threshold_count, 1); // all-medium flag
  assert.equal(r.applied, 0);
  assert.ok(!d.calls.some((c) => c[0] === "updateItem" || c[0] === "resolveFlag"));
});

test("auto, apply: writes the high subset, resolves the all-high flag, leaves the mixed flag open with residue", async () => {
  const d = autoDeps();
  const r = await main({ mode: "apply", arg: "auto" }, d);
  assert.equal(r.applied, 2); // both eligible flags get SOME write (partial or full)
  const byFlag = Object.fromEntries(r.counts.apply_results.map((x) => [x.flag_id, x.status]));
  assert.equal(byFlag["flag-open-mixed"], "auto_adopted_partial");
  assert.equal(byFlag["flag-open-high"], "auto_adopted");
  assert.ok(d.calls.some((c) => c[0] === "resolveFlag" && c[1] === "flag-open-high"));
  assert.ok(!d.calls.some((c) => c[0] === "resolveFlag" && c[1] === "flag-open-mixed"), "mixed flag must stay open");
  assert.deepEqual(r.read_back["item-3"].operational_scenario_tags, ["ocean-bunkering"]);
  assert.deepEqual(r.read_back["item-4"].topic_tags, ["fuels"]);
});

test("auto, apply: the below-threshold flag is never touched", async () => {
  const d = autoDeps();
  await main({ mode: "apply", arg: "auto" }, d);
  assert.ok(!d.calls.some((c) => (c[0] === "readItem" && c[1] === "item-5") || (c[0] === "resolveFlag" && c[1] === "flag-open-medium")));
});

test("auto is case-insensitive and trims whitespace", async () => {
  const d = autoDeps();
  const r = await main({ mode: "dry", arg: "  AUTO  " }, d);
  assert.equal(r.counts.open_candidates, 3);
});
