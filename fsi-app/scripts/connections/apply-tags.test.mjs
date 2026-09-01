// apply-tags.test.mjs — proves the ratify:tags marker parser, PROPOSALS_JSON extraction, the
// ratifiability decision (TAG_NAMESPACE + resolved + resolved_by + marker + parseable non-empty
// proposals), the merge-never-overwrite patch builder (with FIELD_CAPS respected), the pure
// per-item discovery planner, and the injected-dependency applyTags() core — mocking the DB via plain
// injected functions, same fixture-the-client posture as ratify-flag-to-census.test.mjs /
// scripts/lib/db.test.mjs. Importing this module never invokes main().
import test from "node:test";
import assert from "node:assert/strict";
import {
  RATIFY_TAGS_TOKEN, hasRatifyTagsToken, extractProposalsFromDescription, evaluateApplication,
  buildMergePatch, planDiscoveryForItem, applyTags,
} from "./apply-tags.mjs";
import { buildFlagRow } from "./propose-tags.mjs";
import { TAG_NAMESPACE, createdBy } from "../../src/lib/connections/flag-namespaces.mjs";

// ── hasRatifyTagsToken ───────────────────────────────────────────────────────────────────────────

test("hasRatifyTagsToken: matches the bare token, case-insensitive, word-bounded", () => {
  assert.ok(hasRatifyTagsToken("ratify:tags"));
  assert.ok(hasRatifyTagsToken("RATIFY:TAGS looks good, applying"));
  assert.ok(hasRatifyTagsToken("checked the evidence — ratify:tags"));
});

test("hasRatifyTagsToken: does not false-positive on a hyphenated lookalike or absent token", () => {
  assert.ok(!hasRatifyTagsToken("not-ratify:tags-either"));
  assert.ok(!hasRatifyTagsToken("looks fine, closing this out"));
  assert.ok(!hasRatifyTagsToken(null));
  assert.ok(!hasRatifyTagsToken(undefined));
});

// ── extractProposalsFromDescription ──────────────────────────────────────────────────────────────

const PROPOSALS = [
  { field: "operational_scenario_tags", tag: "ocean-bunkering", evidence: "bunkering", confidence: "high" },
  { field: "topic_tags", tag: "emissions", evidence: "carbon pricing", confidence: "medium" },
];

test("extractProposalsFromDescription: round-trips a real buildFlagRow() description", () => {
  const row = buildFlagRow({ id: "item-1" }, { itemId: "item-1", proposals: PROPOSALS });
  const r = extractProposalsFromDescription(row.description);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, PROPOSALS);
});

test("extractProposalsFromDescription: refused when no PROPOSALS_JSON block is present", () => {
  const r = extractProposalsFromDescription("just some free text, no block here");
  assert.equal(r.ok, false);
  assert.match(r.error, /no parseable PROPOSALS_JSON/);
});

test("extractProposalsFromDescription: refused on malformed JSON", () => {
  const r = extractProposalsFromDescription("summary\n\nPROPOSALS_JSON: [{not valid json}]");
  assert.equal(r.ok, false);
  assert.match(r.error, /did not parse/);
});

test("extractProposalsFromDescription: refused when an entry names an unknown field or blank tag", () => {
  const badField = extractProposalsFromDescription('x\n\nPROPOSALS_JSON: [{"field":"not_a_real_field","tag":"x","evidence":"x","confidence":"high"}]');
  assert.equal(badField.ok, false);
  const blankTag = extractProposalsFromDescription('x\n\nPROPOSALS_JSON: [{"field":"topic_tags","tag":"","evidence":"x","confidence":"high"}]');
  assert.equal(blankTag.ok, false);
});

test("extractProposalsFromDescription: an empty proposals array parses OK (caller decides what to do with zero)", () => {
  const r = extractProposalsFromDescription("summary\n\nPROPOSALS_JSON: []");
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, []);
});

// ── evaluateApplication ──────────────────────────────────────────────────────────────────────────

function ratifiedFlag(overrides = {}) {
  const row = buildFlagRow({ id: "item-1" }, { itemId: "item-1", proposals: PROPOSALS });
  return {
    id: "flag-1",
    created_by: createdBy(TAG_NAMESPACE, "empty-signature"),
    status: "resolved",
    resolved_by: "operator-1",
    resolution_note: "checked the evidence, looks right — ratify:tags",
    description: row.description,
    subject_ref: row.subject_ref,
    ...overrides,
  };
}

test("evaluateApplication: missing flag -> refused", () => {
  assert.equal(evaluateApplication(null).ok, false);
});

test("evaluateApplication: wrong namespace -> refused (apply-tags only applies flywheel-tag: findings)", () => {
  const r = evaluateApplication(ratifiedFlag({ created_by: "flywheel-gap:jurisdiction_span_gap" }));
  assert.equal(r.ok, false);
  assert.match(r.error, /not in the .*namespace/);
});

test("evaluateApplication: status != resolved -> refused", () => {
  const r = evaluateApplication(ratifiedFlag({ status: "open" }));
  assert.equal(r.ok, false);
  assert.match(r.error, /not 'resolved'/);
});

test("evaluateApplication: resolved but no resolved_by -> refused", () => {
  const r = evaluateApplication(ratifiedFlag({ resolved_by: null }));
  assert.equal(r.ok, false);
  assert.match(r.error, /resolved_by/);
});

test("evaluateApplication: resolved + resolved_by but no ratify:tags marker -> refused", () => {
  const r = evaluateApplication(ratifiedFlag({ resolution_note: "looks fine" }));
  assert.equal(r.ok, false);
  assert.match(r.error, new RegExp(RATIFY_TAGS_TOKEN));
});

test("evaluateApplication: fully ratified -> ok, itemId + proposals extracted", () => {
  const r = evaluateApplication(ratifiedFlag());
  assert.equal(r.ok, true);
  assert.equal(r.itemId, "item-1");
  assert.deepEqual(r.proposals, PROPOSALS);
});

test("evaluateApplication: zero-proposal flag ratified -> refused (nothing to apply)", () => {
  const row = buildFlagRow({ id: "item-2" }, { itemId: "item-2", proposals: [] });
  const r = evaluateApplication(ratifiedFlag({ description: row.description, subject_ref: row.subject_ref }));
  assert.equal(r.ok, false);
  assert.match(r.error, /zero proposals/);
});

// ── buildMergePatch ──────────────────────────────────────────────────────────────────────────────

test("buildMergePatch: appends new tags onto an item with existing NON-EMPTY tags, never removes any", () => {
  const current = { operational_scenario_tags: ["road-cabotage"], compliance_object_tags: [], topic_tags: [] };
  const proposals = [{ field: "operational_scenario_tags", tag: "ocean-bunkering" }];
  const { patch, added } = buildMergePatch(current, proposals);
  assert.deepEqual(patch.operational_scenario_tags, ["road-cabotage", "ocean-bunkering"]);
  assert.deepEqual(added.operational_scenario_tags, ["ocean-bunkering"]);
  assert.ok(!("compliance_object_tags" in patch), "a field with no new tags must not appear in patch");
});

test("buildMergePatch: a proposal tag already present contributes nothing (alreadyPresent, not added)", () => {
  const current = { operational_scenario_tags: ["ocean-bunkering"], compliance_object_tags: [], topic_tags: [] };
  const proposals = [{ field: "operational_scenario_tags", tag: "ocean-bunkering" }];
  const { patch, alreadyPresent } = buildMergePatch(current, proposals);
  assert.deepEqual(patch, {});
  assert.deepEqual(alreadyPresent.operational_scenario_tags, ["ocean-bunkering"]);
});

test("buildMergePatch: on a fully-empty item, all three fields get set from proposals", () => {
  const current = { operational_scenario_tags: [], compliance_object_tags: [], topic_tags: [] };
  const proposals = [
    { field: "operational_scenario_tags", tag: "ocean-bunkering" },
    { field: "compliance_object_tags", tag: "shipper" },
    { field: "topic_tags", tag: "emissions" },
  ];
  const { patch } = buildMergePatch(current, proposals);
  assert.deepEqual(patch, {
    operational_scenario_tags: ["ocean-bunkering"],
    compliance_object_tags: ["shipper"],
    topic_tags: ["emissions"],
  });
});

test("buildMergePatch: respects FIELD_CAPS — proposals beyond the remaining room are cappedOut, not appended", () => {
  const current = { operational_scenario_tags: ["a", "b", "c", "d"], compliance_object_tags: [], topic_tags: [] }; // cap is 5, room=1
  const proposals = [
    { field: "operational_scenario_tags", tag: "ocean-bunkering" },
    { field: "operational_scenario_tags", tag: "drayage" },
  ];
  const { patch, added, cappedOut } = buildMergePatch(current, proposals);
  assert.deepEqual(patch.operational_scenario_tags, ["a", "b", "c", "d", "ocean-bunkering"]);
  assert.deepEqual(added.operational_scenario_tags, ["ocean-bunkering"]);
  assert.deepEqual(cappedOut.operational_scenario_tags, ["drayage"]);
});

test("buildMergePatch: an item already AT cap gets nothing added for that field, all novel proposals cappedOut", () => {
  const current = { operational_scenario_tags: ["a", "b", "c", "d", "e"], compliance_object_tags: [], topic_tags: [] };
  const proposals = [{ field: "operational_scenario_tags", tag: "ocean-bunkering" }];
  const { patch, cappedOut } = buildMergePatch(current, proposals);
  assert.ok(!("operational_scenario_tags" in patch));
  assert.deepEqual(cappedOut.operational_scenario_tags, ["ocean-bunkering"]);
});

test("buildMergePatch: null/absent existing arrays degrade to empty, never throw", () => {
  const { patch } = buildMergePatch({}, [{ field: "topic_tags", tag: "emissions" }]);
  assert.deepEqual(patch.topic_tags, ["emissions"]);
});

test("buildMergePatch: duplicate tags within the SAME proposal list are only added once", () => {
  const current = { operational_scenario_tags: [], compliance_object_tags: [], topic_tags: [] };
  const proposals = [
    { field: "operational_scenario_tags", tag: "ocean-bunkering" },
    { field: "operational_scenario_tags", tag: "ocean-bunkering" },
  ];
  const { patch } = buildMergePatch(current, proposals);
  assert.deepEqual(patch.operational_scenario_tags, ["ocean-bunkering"]);
});

// ── planDiscoveryForItem ─────────────────────────────────────────────────────────────────────────

test("planDiscoveryForItem: item absent from corpus -> refused", () => {
  const r = planDiscoveryForItem("missing-id", [{ id: "other-1" }]);
  assert.equal(r.ok, false);
  assert.match(r.error, /not found in the verified\/live corpus/);
});

test("planDiscoveryForItem: item with a fresh shared tag scores an edge, origin provenance_discovery", () => {
  const corpus = [
    { id: "item-a", item_type: "regulation", operational_scenario_tags: ["ocean-bunkering"], compliance_object_tags: [], topic_tags: [], jurisdictions: [], jurisdiction_iso: [] },
    { id: "item-b", item_type: "regulation", operational_scenario_tags: ["ocean-bunkering"], compliance_object_tags: [], topic_tags: [], jurisdictions: [], jurisdiction_iso: [] },
  ];
  const r = planDiscoveryForItem("item-a", corpus);
  assert.equal(r.ok, true);
  assert.equal(r.edges.length, 1);
  assert.equal(r.edges[0].source_item_id, "item-a");
  assert.equal(r.edges[0].target_item_id, "item-b");
  assert.equal(r.edges[0].origin, "provenance_discovery");
  assert.equal(r.edges[0].relationship, "related");
});

test("planDiscoveryForItem: an item with no shared signal against the corpus scores zero edges (not an error)", () => {
  const corpus = [
    { id: "item-a", item_type: "regulation", operational_scenario_tags: [], compliance_object_tags: [], topic_tags: [], jurisdictions: [], jurisdiction_iso: [] },
    { id: "item-b", item_type: "regulation", operational_scenario_tags: ["road-cabotage"], compliance_object_tags: [], topic_tags: [], jurisdictions: [], jurisdiction_iso: [] },
  ];
  const r = planDiscoveryForItem("item-a", corpus);
  assert.equal(r.ok, true);
  assert.deepEqual(r.edges, []);
});

// ── applyTags (injected-dependency core, mocked DB) ─────────────────────────────────────────────

function deps({ flag, item, updateResult } = {}) {
  return {
    readFlag: async () => ({ data: flag ?? null, error: null }),
    readItem: async () => ({ data: item ?? null, error: null }),
    updateItem: async () => updateResult ?? { updated: 1, snapshot: "/tmp/snap.jsonl" },
  };
}

test("applyTags: flag not found -> status not_found", async () => {
  const r = await applyTags(deps({ flag: null }), "missing-flag", { execute: true });
  assert.equal(r.status, "not_found");
});

test("applyTags: not ratifiable -> status not_ratifiable, item never read, never updated", async () => {
  let itemReadCalled = false, updateCalled = false;
  const d = deps({ flag: ratifiedFlag({ status: "open" }) });
  d.readItem = async () => { itemReadCalled = true; return { data: null, error: null }; };
  d.updateItem = async () => { updateCalled = true; return {}; };
  const r = await applyTags(d, "flag-1", { execute: true });
  assert.equal(r.status, "not_ratifiable");
  assert.equal(itemReadCalled, false);
  assert.equal(updateCalled, false);
});

test("applyTags: item not found -> status item_not_found", async () => {
  const r = await applyTags(deps({ flag: ratifiedFlag(), item: null }), "flag-1", { execute: true });
  assert.equal(r.status, "item_not_found");
});

test("applyTags: no_change when every proposal is already present", async () => {
  const item = { id: "item-1", operational_scenario_tags: ["ocean-bunkering"], compliance_object_tags: [], topic_tags: ["emissions"] };
  const r = await applyTags(deps({ flag: ratifiedFlag(), item }), "flag-1", { execute: true });
  assert.equal(r.status, "no_change");
});

test("applyTags: dry run computes the patch but never calls updateItem", async () => {
  const item = { id: "item-1", operational_scenario_tags: [], compliance_object_tags: [], topic_tags: [] };
  let updateCalled = false;
  const d = deps({ flag: ratifiedFlag(), item });
  d.updateItem = async () => { updateCalled = true; return {}; };
  const r = await applyTags(d, "flag-1", { execute: false });
  assert.equal(r.status, "dry_run");
  assert.equal(updateCalled, false);
  assert.deepEqual(r.merge.patch.operational_scenario_tags, ["ocean-bunkering"]);
  assert.deepEqual(r.merge.patch.topic_tags, ["emissions"]);
});

test("applyTags: execute=true applies the merge and returns the update result", async () => {
  const item = { id: "item-1", operational_scenario_tags: [], compliance_object_tags: [], topic_tags: [] };
  let capturedPatch = null, capturedId = null;
  const d = deps({ flag: ratifiedFlag(), item });
  d.updateItem = async (id, patch) => { capturedId = id; capturedPatch = patch; return { updated: 1, snapshot: "/tmp/x.jsonl" }; };
  const r = await applyTags(d, "flag-1", { execute: true });
  assert.equal(r.status, "applied");
  assert.equal(r.itemId, "item-1");
  assert.equal(capturedId, "item-1");
  assert.deepEqual(capturedPatch, r.merge.patch);
  assert.equal(r.updated, 1);
});

test("applyTags: read error propagates as status read_error, not thrown", async () => {
  const d = { readFlag: async () => ({ data: null, error: { message: "boom" } }), readItem: async () => ({ data: null, error: null }), updateItem: async () => ({}) };
  const r = await applyTags(d, "flag-1", { execute: true });
  assert.equal(r.status, "read_error");
  assert.match(r.error, /boom/);
});
