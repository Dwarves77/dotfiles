// Run: node --test scripts/maintenance/tag-ratification.test.mjs — no DB, deps injected.
// evaluateApplication/applyTags/buildMergePatch themselves are pinned in
// scripts/connections/apply-tags.test.mjs; this file tests the wrapper's own orchestration only:
// listing ratifiable candidates, the arg-required apply gate, and per-id apply + read_back.
import { test } from "node:test";
import assert from "node:assert/strict";
import { main } from "./tag-ratification.mjs";
import { TAG_NAMESPACE, createdBy, buildSubjectRef } from "../../src/lib/connections/flag-namespaces.mjs";
import { deriveTags as realDeriveTags } from "../../src/lib/connections/derive-tags.mjs";

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
    ["item-3", { id: "item-3", operational_scenario_tags: [], compliance_object_tags: [], topic_tags: [], full_brief: "carbon pricing appears here" }],
    ["item-4", { id: "item-4", operational_scenario_tags: [], compliance_object_tags: [], topic_tags: [] }],
    ["item-5", { id: "item-5", operational_scenario_tags: [], compliance_object_tags: [], topic_tags: [], full_brief: "circular economy packaging is covered" }],
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

test("auto, dry: lists decidable/not-adoptable open flags + adopt/decline sample, writes nothing", async () => {
  const d = autoDeps();
  const r = await main({ mode: "dry", arg: "auto" }, d);
  assert.equal(r.counts.open_candidates, 3);
  assert.equal(r.counts.threshold, "high");
  assert.equal(r.counts.decidable_count, 3); // every open flag is now decidable (task 7.2 -- no residue stays open)
  assert.equal(r.counts.not_adoptable_count, 0);
  assert.equal(typeof r.counts.adopt_count, "number");
  assert.equal(typeof r.counts.decline_count, "number");
  assert.ok(Array.isArray(r.counts.adopted_sample));
  assert.ok(Array.isArray(r.counts.declined_sample));
  assert.equal(r.applied, 0);
  assert.ok(!d.calls.some((c) => c[0] === "updateItem" || c[0] === "resolveFlag"));
});

test("auto, apply: decides every open flag and CLOSES all three -- no residue stays open (task 7.2)", async () => {
  const d = autoDeps();
  const r = await main({ mode: "apply", arg: "auto" }, d);
  assert.equal(r.applied, 3); // every decidable flag closes, whichever way its proposals decide
  const byFlag = Object.fromEntries(r.counts.apply_results.map((x) => [x.flag_id, x.status]));
  assert.equal(byFlag["flag-open-mixed"], "decided");
  assert.equal(byFlag["flag-open-high"], "decided");
  assert.equal(byFlag["flag-open-medium"], "decided");
  assert.ok(d.calls.some((c) => c[0] === "resolveFlag" && c[1] === "flag-open-high"));
  assert.ok(d.calls.some((c) => c[0] === "resolveFlag" && c[1] === "flag-open-mixed"), "mixed flag closes too -- declined/adopted residue is still a decision");
  assert.ok(d.calls.some((c) => c[0] === "resolveFlag" && c[1] === "flag-open-medium"));
  assert.deepEqual(r.read_back["item-3"].operational_scenario_tags, ["ocean-bunkering"]);
  assert.deepEqual(r.read_back["item-3"].topic_tags, ["emissions"], "the medium proposal adopts once its evidence re-confirms in the item's own text");
  assert.deepEqual(r.read_back["item-4"].topic_tags, ["fuels"]);
  assert.deepEqual(r.read_back["item-5"].topic_tags, ["packaging"]);
});

test("auto, apply: every open flag is read and resolved -- none is skipped as untouchable residue", async () => {
  const d = autoDeps();
  await main({ mode: "apply", arg: "auto" }, d);
  assert.ok(d.calls.some((c) => c[0] === "readItem" && c[1] === "item-5"));
  assert.ok(d.calls.some((c) => c[0] === "resolveFlag" && c[1] === "flag-open-medium"));
});

test("auto is case-insensitive and trims whitespace", async () => {
  const d = autoDeps();
  const r = await main({ mode: "dry", arg: "  AUTO  " }, d);
  assert.equal(r.counts.open_candidates, 3);
});

// ── D15 part 1: zero-proposal bucketing + 20-row sampling (fix round 1, review-l10.md) ─────────────
// "tag-ratification.mjs's D15 dry and apply outcome bucketing (re-derived-and-adopted,
// re-derived-and-declined, no-derivable-tags) and its 20-row sampling gain tests mirroring the
// classification side's."

function zeroProposalFlag(n, overrides = {}) {
  return {
    id: `flag-zero-${n}`,
    subject_ref: buildSubjectRef(`item-zero-${n}`),
    created_by: createdBy(TAG_NAMESPACE, "empty-signature"),
    status: "open",
    resolved_by: null,
    resolution_note: null,
    description: `summary\n\nPROPOSALS_JSON: []`,
    ...overrides,
  };
}

/**
 * Deps for the D15 zero-proposal bucket tests. `itemsByFlagId` maps each zero-proposal flag's item id
 * to the item shape (some derivable -> "adopted", some not -> "no_derivable"); `deriveTagsOverride`
 * (optional) is threaded onto every item read so a "declined" bucket is constructable too (see
 * apply-tags.mjs's deps.deriveTags test seam and its own header comment for why a real KEYWORD_MAP
 * candidate can never decline naturally).
 */
function zeroProposalDeps({ flags, items, declinedItemIds = new Set() } = {}) {
  const calls = [];
  const flagMap = new Map(flags.map((f) => [f.id, f]));
  const itemMap = new Map(items.map((it) => [it.id, it]));
  return {
    calls,
    listOpenCandidates: async () => [...flagMap.values()],
    readFlag: async (id) => { calls.push(["readFlag", id]); return { data: flagMap.get(id) ?? null, error: null }; },
    readItem: async (id) => { calls.push(["readItem", id]); return { data: itemMap.get(id) ?? null, error: null }; },
    updateItem: async (id, patch) => { calls.push(["updateItem", id, patch]); itemMap.set(id, { ...itemMap.get(id), ...patch }); return { updated: 1, snapshot: "snap" }; },
    resolveFlag: async (id, note) => { calls.push(["resolveFlag", id, note]); flagMap.set(id, { ...flagMap.get(id), status: "resolved", resolved_by: "apply-tags.mjs", resolution_note: note }); return { updated: 1, snapshot: "flag-snap" }; },
    // deps.deriveTags is the SAME optional test seam autoAdoptTags/reDeriveZeroProposalTags reads
    // (apply-tags.mjs); this wrapper routes it per-item so a mixed batch can include a real-adopting
    // item, a real-no-derivable item, and a seam-supplied declining item in the SAME run.
    deriveTags: declinedItemIds.size
      ? (input) => (declinedItemIds.has(input.id)
        ? { itemId: input.id, proposals: [{ field: "operational_scenario_tags", tag: "ocean-bunkering", evidence: "bunkering surcharge schedule", confidence: "medium" }] }
        : realDeriveTags(input))
      : undefined,
  };
}

test("auto, dry: D15 zero-proposal buckets -- re-derived-and-adopted / no-derivable-tags counts and samples", async () => {
  const adoptedFlag = zeroProposalFlag("adopt");
  const noDerivableFlag = zeroProposalFlag("bare");
  const items = [
    { id: "item-zero-adopt", operational_scenario_tags: [], compliance_object_tags: [], topic_tags: [], title: "Untitled", full_brief: "New CBAM reporting duties apply." },
    { id: "item-zero-bare", operational_scenario_tags: [], compliance_object_tags: [], topic_tags: [], title: "Untitled", full_brief: null },
  ];
  const d = zeroProposalDeps({ flags: [adoptedFlag, noDerivableFlag], items });
  const r = await main({ mode: "dry", arg: "auto" }, d);
  assert.equal(r.counts.zero_proposal_count, 2);
  assert.equal(r.counts.re_derived_and_adopted_count, 1);
  assert.equal(r.counts.no_derivable_tags_count, 1);
  assert.equal(r.counts.re_derived_and_declined_count, 0);
  assert.ok(Array.isArray(r.counts.re_derived_and_adopted_sample));
  assert.ok(Array.isArray(r.counts.re_derived_and_declined_sample));
  assert.ok(Array.isArray(r.counts.no_derivable_tags_sample));
  assert.equal(r.counts.re_derived_and_adopted_sample[0].flag_id, "flag-zero-adopt");
  assert.equal(r.counts.no_derivable_tags_sample[0].flag_id, "flag-zero-bare");
  assert.ok(!d.calls.some((c) => c[0] === "updateItem" || c[0] === "resolveFlag"), "dry writes nothing");
});

test("auto, dry: D15 zero-proposal declined bucket, via the deriveTags test seam", async () => {
  const declinedFlag = zeroProposalFlag("decline");
  const items = [
    { id: "item-zero-decline", operational_scenario_tags: [], compliance_object_tags: [], topic_tags: [], title: "Untitled", full_brief: "Nothing about maritime fuel logistics is discussed here." },
  ];
  const d = zeroProposalDeps({ flags: [declinedFlag], items, declinedItemIds: new Set(["item-zero-decline"]) });
  const r = await main({ mode: "dry", arg: "auto" }, d);
  assert.equal(r.counts.re_derived_and_declined_count, 1);
  assert.equal(r.counts.re_derived_and_adopted_count, 0);
  assert.equal(r.counts.no_derivable_tags_count, 0);
  assert.equal(r.counts.re_derived_and_declined_sample[0].flag_id, "flag-zero-decline");
});

test("auto, apply: D15 zero-proposal buckets resolve every flag -- adopted writes + resolves, no-derivable resolves only, declined resolves only", async () => {
  const adoptedFlag = zeroProposalFlag("adopt2");
  const noDerivableFlag = zeroProposalFlag("bare2");
  const declinedFlag = zeroProposalFlag("decline2");
  const items = [
    { id: "item-zero-adopt2", operational_scenario_tags: [], compliance_object_tags: [], topic_tags: [], title: "Untitled", full_brief: "New CBAM reporting duties apply." },
    { id: "item-zero-bare2", operational_scenario_tags: [], compliance_object_tags: [], topic_tags: [], title: "Untitled", full_brief: null },
    { id: "item-zero-decline2", operational_scenario_tags: [], compliance_object_tags: [], topic_tags: [], title: "Untitled", full_brief: "Nothing about maritime fuel logistics is discussed here." },
  ];
  const d = zeroProposalDeps({ flags: [adoptedFlag, noDerivableFlag, declinedFlag], items, declinedItemIds: new Set(["item-zero-decline2"]) });
  const r = await main({ mode: "apply", arg: "auto" }, d);
  assert.equal(r.applied, 3, "every zero-proposal flag counts as decided, whichever way it decides");
  const byFlag = Object.fromEntries(r.counts.rederive_apply_results.map((x) => [x.flag_id, x]));
  assert.equal(byFlag["flag-zero-adopt2"].status, "re_derived_adopted");
  assert.equal(byFlag["flag-zero-bare2"].status, "re_derived_no_change");
  assert.equal(byFlag["flag-zero-decline2"].status, "re_derived_no_change");
  assert.ok(d.calls.some((c) => c[0] === "updateItem" && c[1] === "item-zero-adopt2"));
  assert.ok(!d.calls.some((c) => c[0] === "updateItem" && c[1] === "item-zero-bare2"));
  assert.ok(!d.calls.some((c) => c[0] === "updateItem" && c[1] === "item-zero-decline2"));
  assert.ok(d.calls.some((c) => c[0] === "resolveFlag" && c[1] === "flag-zero-adopt2"));
  assert.ok(d.calls.some((c) => c[0] === "resolveFlag" && c[1] === "flag-zero-bare2"));
  assert.ok(d.calls.some((c) => c[0] === "resolveFlag" && c[1] === "flag-zero-decline2"));
});

test("auto, dry: D15 20-row sample cap -- more than 20 in one bucket still counts fully but samples at 20", async () => {
  const flags = [];
  const items = [];
  for (let i = 0; i < 25; i++) {
    flags.push(zeroProposalFlag(`bulk-${i}`));
    items.push({ id: `item-zero-bulk-${i}`, operational_scenario_tags: [], compliance_object_tags: [], topic_tags: [], title: "Untitled", full_brief: null });
  }
  const d = zeroProposalDeps({ flags, items });
  const r = await main({ mode: "dry", arg: "auto" }, d);
  assert.equal(r.counts.no_derivable_tags_count, 25, "the full count is never truncated");
  assert.equal(r.counts.no_derivable_tags_sample.length, 20, "the sample caps at 20 rows");
});
