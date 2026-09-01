// propose-tags.test.mjs — proves the pure decision surface: arg parsing, the empty-signature predicate,
// target selection per mode, the flag-row builder (human summary + compact PROPOSALS_JSON block + exact
// apply command), and the dedup-before-insert/resolve-if-stale plan (including the narrow-run scoping
// deviation from analyze-corpus.mjs's reflectFlags, named in the file header). Importing this module
// never invokes main() (IS_MAIN checks process.argv[1] against the test file, same posture as
// discover-for-items.mjs / ratify-flag-to-census.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import {
  parseArgs, isEmptySignature, selectTargets, buildFlagRow, planReflect,
} from "./propose-tags.mjs";
import { TAG_NAMESPACE, createdBy, buildSubjectRef } from "../../src/lib/connections/flag-namespaces.mjs";

// ── parseArgs ────────────────────────────────────────────────────────────────────────────────────

test("parseArgs: no selector defaults to mode 'untagged'", () => {
  const r = parseArgs([]);
  assert.deepEqual(r, { ok: true, mode: "untagged", ids: null, since: null, execute: false });
});

test("parseArgs: explicit --untagged is the same as the default", () => {
  const r = parseArgs(["--untagged"]);
  assert.equal(r.ok, true);
  assert.equal(r.mode, "untagged");
});

test("parseArgs: --ids parses a comma-separated list, trims", () => {
  const r = parseArgs(["--ids", "a-1, b-2 ,c-3"]);
  assert.equal(r.ok, true);
  assert.equal(r.mode, "ids");
  assert.deepEqual(r.ids, ["a-1", "b-2", "c-3"]);
});

test("parseArgs: --ids with no value is refused", () => {
  const r = parseArgs(["--ids"]);
  assert.equal(r.ok, false);
  assert.match(r.error, /--ids requires/);
});

test("parseArgs: --since parses a valid ISO date", () => {
  const r = parseArgs(["--since", "2026-08-01"]);
  assert.equal(r.ok, true);
  assert.equal(r.mode, "since");
  assert.equal(r.since, "2026-08-01");
});

test("parseArgs: --since with an unparseable date is refused", () => {
  const r = parseArgs(["--since", "not-a-date"]);
  assert.equal(r.ok, false);
  assert.match(r.error, /not a parseable date/);
});

test("parseArgs: --ids and --since together is refused (ambiguous)", () => {
  const r = parseArgs(["--ids", "a", "--since", "2026-08-01"]);
  assert.equal(r.ok, false);
  assert.match(r.error, /at most one/);
});

test("parseArgs: --execute is honored alongside any mode", () => {
  assert.equal(parseArgs(["--execute"]).execute, true);
  assert.equal(parseArgs(["--ids", "a", "--execute"]).execute, true);
  assert.equal(parseArgs([]).execute, false);
});

// ── isEmptySignature ─────────────────────────────────────────────────────────────────────────────

test("isEmptySignature: true when all three arrays are empty/absent/null", () => {
  assert.ok(isEmptySignature({ operational_scenario_tags: [], compliance_object_tags: [], topic_tags: [] }));
  assert.ok(isEmptySignature({}));
  assert.ok(isEmptySignature({ operational_scenario_tags: null, compliance_object_tags: undefined, topic_tags: [] }));
});

test("isEmptySignature: false when ANY one array carries a value", () => {
  assert.ok(!isEmptySignature({ operational_scenario_tags: ["ocean-bunkering"], compliance_object_tags: [], topic_tags: [] }));
  assert.ok(!isEmptySignature({ operational_scenario_tags: [], compliance_object_tags: ["shipper"], topic_tags: [] }));
  assert.ok(!isEmptySignature({ operational_scenario_tags: [], compliance_object_tags: [], topic_tags: ["emissions"] }));
});

// ── selectTargets ────────────────────────────────────────────────────────────────────────────────

const CORPUS = [
  { id: "tagged-1", created_at: "2026-08-10T00:00:00Z", operational_scenario_tags: ["ocean-bunkering"], compliance_object_tags: [], topic_tags: [] },
  { id: "untagged-1", created_at: "2026-08-15T00:00:00Z", operational_scenario_tags: [], compliance_object_tags: [], topic_tags: [] },
  { id: "untagged-2", created_at: "2026-08-20T00:00:00Z", operational_scenario_tags: [], compliance_object_tags: [], topic_tags: [] },
];

test("selectTargets: mode 'untagged' returns only empty-signature items", () => {
  const { targets, missingIds } = selectTargets(CORPUS, { mode: "untagged" });
  assert.deepEqual(targets.map((t) => t.id).sort(), ["untagged-1", "untagged-2"]);
  assert.deepEqual(missingIds, []);
});

test("selectTargets: mode 'ids' returns exactly the matched ids REGARDLESS of tag state, reports missing", () => {
  const { targets, missingIds } = selectTargets(CORPUS, { mode: "ids", ids: ["tagged-1", "untagged-1", "does-not-exist"] });
  assert.deepEqual(targets.map((t) => t.id).sort(), ["tagged-1", "untagged-1"]);
  assert.deepEqual(missingIds, ["does-not-exist"]);
});

test("selectTargets: mode 'since' filters by created_at >= the given timestamp", () => {
  const { targets } = selectTargets(CORPUS, { mode: "since", since: "2026-08-16T00:00:00Z" });
  assert.deepEqual(targets.map((t) => t.id), ["untagged-2"]);
});

// ── buildFlagRow ─────────────────────────────────────────────────────────────────────────────────

test("buildFlagRow: with proposals — category/subject_type/subject_ref/created_by shape, JSON block, apply command in recommended_actions", () => {
  const item = { id: "item-1" };
  const derived = { itemId: "item-1", proposals: [{ field: "operational_scenario_tags", tag: "ocean-bunkering", evidence: "bunkering", confidence: "high" }] };
  const row = buildFlagRow(item, derived);
  assert.equal(row.category, "data_quality");
  assert.equal(row.subject_type, "item");
  assert.equal(row.subject_ref, buildSubjectRef("item-1"));
  assert.equal(row.subject_ref, "item-1");
  assert.equal(row.status, "open");
  assert.equal(row.created_by, createdBy(TAG_NAMESPACE, "empty-signature"));
  assert.match(row.description, /PROPOSALS_JSON: \[\{.*ocean-bunkering.*\}\]/);
  assert.match(row.description, /discover\.mjs scores 0 edges/);
  assert.ok(row.recommended_actions.some((a) => a.includes("ratify:tags")));
  assert.ok(row.recommended_actions.some((a) => a.includes("scripts/connections/apply-tags.mjs")));
});

test("buildFlagRow: zero proposals — description says so plainly, recommended_actions asks for manual tagging (no apply command)", () => {
  const item = { id: "item-2" };
  const derived = { itemId: "item-2", proposals: [] };
  const row = buildFlagRow(item, derived);
  assert.match(row.description, /found no candidate tags/);
  assert.match(row.description, /PROPOSALS_JSON: \[\]/);
  assert.ok(row.recommended_actions.some((a) => /manually/.test(a)));
  assert.ok(!row.recommended_actions.some((a) => a.includes("apply-tags.mjs")), "no apply command should be recommended when there is nothing to apply");
});

test("buildFlagRow: PROPOSALS_JSON round-trips the exact proposals array", () => {
  const proposals = [
    { field: "topic_tags", tag: "emissions", evidence: "carbon pricing", confidence: "medium" },
    { field: "compliance_object_tags", tag: "shipper", evidence: "shippers", confidence: "medium" },
  ];
  const row = buildFlagRow({ id: "item-3" }, { itemId: "item-3", proposals });
  const m = /PROPOSALS_JSON: (\[.*\])$/s.exec(row.description);
  assert.ok(m, "description must end with a parseable PROPOSALS_JSON block");
  assert.deepEqual(JSON.parse(m[1]), proposals);
});

// ── planReflect ──────────────────────────────────────────────────────────────────────────────────

function freshFor(itemId, proposals = [{ field: "topic_tags", tag: "emissions", evidence: "x", confidence: "medium" }]) {
  const row = buildFlagRow({ id: itemId }, { itemId, proposals });
  return { subjectRef: buildSubjectRef(itemId), row };
}

test("planReflect: a fresh finding with no matching existing open row is a new insert", () => {
  const plan = planReflect([], [freshFor("item-1")]);
  assert.equal(plan.newRows.length, 1);
  assert.equal(plan.newRows[0].subject_ref, "item-1");
  assert.deepEqual(plan.staleIds, []);
  assert.equal(plan.unchanged, 0);
});

test("planReflect: an already-open matching (subject_ref, created_by) is NOT re-inserted (dedup)", () => {
  const existing = [{ id: "flag-1", subject_ref: "item-1", created_by: createdBy(TAG_NAMESPACE, "empty-signature") }];
  const plan = planReflect(existing, [freshFor("item-1")]);
  assert.deepEqual(plan.newRows, []);
  assert.equal(plan.unchanged, 1);
  assert.deepEqual(plan.staleIds, []);
});

test("planReflect: full-scope (scopeSubjectRefs omitted) resolves ANY existing open row absent from fresh", () => {
  const existing = [
    { id: "flag-1", subject_ref: "item-1", created_by: createdBy(TAG_NAMESPACE, "empty-signature") },
    { id: "flag-2", subject_ref: "item-2", created_by: createdBy(TAG_NAMESPACE, "empty-signature") },
  ];
  // only item-1 reproduces this run (item-2 presumably got tagged and dropped out of the untagged set)
  const plan = planReflect(existing, [freshFor("item-1")]);
  assert.deepEqual(plan.staleIds, ["flag-2"]);
});

test("planReflect: SCOPED run (scopeSubjectRefs set) must NEVER resolve a flag outside its own scope", () => {
  const existing = [
    { id: "flag-1", subject_ref: "item-1", created_by: createdBy(TAG_NAMESPACE, "empty-signature") },
    { id: "flag-2", subject_ref: "item-2", created_by: createdBy(TAG_NAMESPACE, "empty-signature") },
  ];
  // A narrow --ids run that only ever considered item-1 this time — item-2's flag must survive
  // untouched even though it is absent from `fresh`, because item-2 was never in scope this run.
  const plan = planReflect(existing, [freshFor("item-1")], { scopeSubjectRefs: new Set(["item-1"]) });
  assert.deepEqual(plan.staleIds, [], "an out-of-scope item's open flag must never be silently resolved");
});

test("planReflect: SCOPED run DOES resolve a flag inside its own scope when the item is no longer flag-worthy", () => {
  const existing = [{ id: "flag-1", subject_ref: "item-1", created_by: createdBy(TAG_NAMESPACE, "empty-signature") }];
  // item-1 was in scope this run (targeted via --ids) but is no longer flag-worthy (now tagged) -> fresh=[]
  const plan = planReflect(existing, [], { scopeSubjectRefs: new Set(["item-1"]) });
  assert.deepEqual(plan.staleIds, ["flag-1"]);
});

test("planReflect: namespace isolation is the CALLER's responsibility (readAll's .like(created_by, TAG_NAMESPACE+'%') filter in main()) — " +
  "planReflect itself trusts existingOpen to already be namespace-scoped, exactly like analyze-corpus.mjs's reflectFlags(); " +
  "a foreign-namespace row that leaked in unfiltered would be (correctly, per that shared contract) treated as stale", () => {
  const existing = [{ id: "flag-other", subject_ref: "item-1", created_by: "flywheel-gap:jurisdiction_span_gap" }];
  const plan = planReflect(existing, [freshFor("item-1")]);
  assert.deepEqual(plan.newRows.map((r) => r.created_by), [createdBy(TAG_NAMESPACE, "empty-signature")]);
  assert.deepEqual(plan.staleIds, ["flag-other"], "documents planReflect's actual (shared, reflectFlags-identical) contract — see main()'s .like() pre-filter, which is what real isolation relies on");
});
