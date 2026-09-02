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
