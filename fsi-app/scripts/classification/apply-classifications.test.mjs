// apply-classifications.test.mjs — proves the pure decide-and-apply core: ratification-token
// detection, PROPOSALS_JSON extraction, the applicable-fields gate, the merge/set-once patch builder,
// and applyClassification's full decision tree with fake injected deps (no real Supabase, no process.exit).
import test from "node:test";
import assert from "node:assert/strict";
import {
  RATIFY_CLASSIFICATION_TOKEN, hasRatifyClassificationToken, extractProposalsFromDescription,
  evaluateApplication, buildMergePatch, applyClassification,
  AUTO_ADOPT_FIELDS, isAutoAdoptableProposal, partitionProposals, evaluateAutoAdoption, autoAdoptClassification,
} from "./apply-classifications.mjs";
import { APPLICABLE_FIELDS } from "../../src/lib/classification/classify-source.mjs";
import { AXIS_NAMESPACE, SOURCE_CLASSIFICATION_SUBTYPE, SOURCE_DRIFT_SUBTYPE } from "../../src/lib/classification/flags.mjs";
import { createdBy } from "../../src/lib/connections/flag-namespaces.mjs";

const CLASSIFY_CREATED_BY = createdBy(AXIS_NAMESPACE, SOURCE_CLASSIFICATION_SUBTYPE);
const DRIFT_CREATED_BY = createdBy(AXIS_NAMESPACE, SOURCE_DRIFT_SUBTYPE);

// ── hasRatifyClassificationToken ─────────────────────────────────────────────────────────────────

test("hasRatifyClassificationToken: matches the exact token, word-bounded", () => {
  assert.ok(hasRatifyClassificationToken("looks good, ratify:classification"));
  assert.ok(hasRatifyClassificationToken(RATIFY_CLASSIFICATION_TOKEN));
  assert.ok(!hasRatifyClassificationToken("not-ratify:classification-either"));
  assert.ok(!hasRatifyClassificationToken("ratify:tags")); // a different marker entirely
  assert.ok(!hasRatifyClassificationToken(null));
  assert.ok(!hasRatifyClassificationToken(undefined));
});

// ── extractProposalsFromDescription ──────────────────────────────────────────────────────────────

test("extractProposalsFromDescription: round-trips a well-formed PROPOSALS_JSON block", () => {
  const proposals = [
    { field: "scope_topics", value: ["environmental"], confidence: "medium", basis: "x", applicable: true },
    { field: "jurisdictions", value: ["GB"], confidence: "high", basis: "y", applicable: false },
  ];
  const description = `summary text\n\nPROPOSALS_JSON: ${JSON.stringify(proposals)}`;
  const r = extractProposalsFromDescription(description);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, proposals);
});

test("extractProposalsFromDescription: no PROPOSALS_JSON block -> error", () => {
  const r = extractProposalsFromDescription("just a summary, no JSON block");
  assert.equal(r.ok, false);
  assert.match(r.error, /no parseable PROPOSALS_JSON/);
});

test("extractProposalsFromDescription: malformed JSON -> error, not a throw", () => {
  const r = extractProposalsFromDescription("text\n\nPROPOSALS_JSON: [{not valid json");
  assert.equal(r.ok, false);
});

test("extractProposalsFromDescription: an entry missing 'field' or 'value' -> error", () => {
  assert.equal(extractProposalsFromDescription("PROPOSALS_JSON: [{\"value\":1}]").ok, false);
  assert.equal(extractProposalsFromDescription("PROPOSALS_JSON: [{\"field\":\"x\"}]").ok, false);
});

// ── evaluateApplication ──────────────────────────────────────────────────────────────────────────

function baseFlag(overrides = {}) {
  const proposals = [{ field: "scope_topics", value: ["environmental"], confidence: "medium", basis: "x", applicable: true }];
  return {
    id: "flag-1",
    created_by: CLASSIFY_CREATED_BY,
    status: "resolved",
    resolved_by: "operator-1",
    resolution_note: RATIFY_CLASSIFICATION_TOKEN,
    description: `summary\n\nPROPOSALS_JSON: ${JSON.stringify(proposals)}`,
    subject_ref: "source-1",
    ...overrides,
  };
}

test("evaluateApplication: a fully ratified, well-formed source-classification flag is applicable", () => {
  const r = evaluateApplication(baseFlag());
  assert.equal(r.ok, true);
  assert.equal(r.sourceId, "source-1");
  assert.equal(r.proposals.length, 1);
});

test("evaluateApplication: rejects a flag not found / no id", () => {
  assert.equal(evaluateApplication(null).ok, false);
  assert.equal(evaluateApplication({}).ok, false);
});

test("evaluateApplication: rejects a source-drift flag (advisory-only, not apply-eligible) even if ratified", () => {
  const r = evaluateApplication(baseFlag({ created_by: DRIFT_CREATED_BY }));
  assert.equal(r.ok, false);
  assert.match(r.error, /advisory-only/);
});

test("evaluateApplication: rejects a flag from a foreign namespace entirely", () => {
  const r = evaluateApplication(baseFlag({ created_by: "flywheel-tag:empty-signature" }));
  assert.equal(r.ok, false);
});

test("evaluateApplication: rejects unresolved status", () => {
  assert.equal(evaluateApplication(baseFlag({ status: "open" })).ok, false);
});

test("evaluateApplication: rejects resolved-but-no-resolved_by", () => {
  assert.equal(evaluateApplication(baseFlag({ resolved_by: null })).ok, false);
});

test("evaluateApplication: rejects resolved without the ratify:classification token", () => {
  assert.equal(evaluateApplication(baseFlag({ resolution_note: "looks fine, approved" })).ok, false);
  assert.equal(evaluateApplication(baseFlag({ resolution_note: "ratify:tags" })).ok, false);
});

test("evaluateApplication: rejects a flag whose ONLY proposal is jurisdiction (advisory-only field, nothing applicable)", () => {
  const proposals = [{ field: "jurisdictions", value: ["GB"], confidence: "high", basis: "x", applicable: false }];
  const flag = baseFlag({ description: `summary\n\nPROPOSALS_JSON: ${JSON.stringify(proposals)}` });
  const r = evaluateApplication(flag);
  assert.equal(r.ok, false);
  assert.match(r.error, /zero APPLICABLE_FIELDS/);
});

test("evaluateApplication: a mixed flag (applicable + jurisdiction) keeps only the applicable proposals", () => {
  const proposals = [
    { field: "scope_modes", value: ["ocean"], confidence: "high", basis: "x", applicable: true },
    { field: "jurisdictions", value: ["GB"], confidence: "high", basis: "y", applicable: false },
  ];
  const flag = baseFlag({ description: `summary\n\nPROPOSALS_JSON: ${JSON.stringify(proposals)}` });
  const r = evaluateApplication(flag);
  assert.equal(r.ok, true);
  assert.equal(r.proposals.length, 1);
  assert.equal(r.proposals[0].field, "scope_modes");
});

test("evaluateApplication: never returns a proposal for a field outside APPLICABLE_FIELDS", () => {
  const r = evaluateApplication(baseFlag());
  for (const p of r.proposals) assert.ok(APPLICABLE_FIELDS.includes(p.field));
});

// ── buildMergePatch ───────────────────────────────────────────────────────────────────────────────

test("buildMergePatch: array field — novel values appended, existing values preserved, order stable", () => {
  const current = { scope_topics: ["regulatory"] };
  const proposals = [{ field: "scope_topics", value: ["environmental", "finance"] }];
  const { patch, applied, skipped } = buildMergePatch(current, proposals);
  assert.deepEqual(patch.scope_topics, ["regulatory", "environmental", "finance"]);
  assert.deepEqual(applied.scope_topics, ["environmental", "finance"]);
  assert.equal(skipped.scope_topics, undefined);
});

test("buildMergePatch: array field — a value already present contributes nothing, reported as skipped", () => {
  const current = { scope_modes: ["ocean"] };
  const proposals = [{ field: "scope_modes", value: ["ocean"] }];
  const { patch, skipped } = buildMergePatch(current, proposals);
  assert.equal(patch.scope_modes, undefined);
  assert.match(skipped.scope_modes, /already present/);
});

test("buildMergePatch: missing/null existing array treated as empty, never throws", () => {
  const { patch } = buildMergePatch({}, [{ field: "scope_verticals", value: ["fine_art"] }]);
  assert.deepEqual(patch.scope_verticals, ["fine_art"]);
});

test("buildMergePatch: expected_output SETS when currently null", () => {
  const dist = { regulations: 0.5, research: 0.3, market: 0.1, operations: 0.05, out_of_scope: 0.05 };
  const { patch, applied } = buildMergePatch({ expected_output: null }, [{ field: "expected_output", value: dist }]);
  assert.deepEqual(patch.expected_output, dist);
  assert.deepEqual(applied.expected_output, dist);
});

test("buildMergePatch: expected_output NEVER overwrites an already-set distribution (framework: refined by observed history)", () => {
  const already = { regulations: 0.9, research: 0.05, market: 0.02, operations: 0.02, out_of_scope: 0.01 };
  const proposed = { regulations: 0.5, research: 0.3, market: 0.1, operations: 0.05, out_of_scope: 0.05 };
  const { patch, skipped } = buildMergePatch({ expected_output: already }, [{ field: "expected_output", value: proposed }]);
  assert.equal(patch.expected_output, undefined);
  assert.match(skipped.expected_output, /never overwrites/);
});

test("buildMergePatch: a jurisdictions proposal (should never reach here from evaluateApplication, but defensively) is ignored — not one of the patch-eligible fields", () => {
  const { patch } = buildMergePatch({}, [{ field: "jurisdictions", value: ["GB"] }]);
  assert.deepEqual(patch, {});
});

test("buildMergePatch: zero proposals -> empty patch", () => {
  assert.deepEqual(buildMergePatch({}, []).patch, {});
});

// ── applyClassification (fake deps) ─────────────────────────────────────────────────────────────

function fakeDeps({ flag, source, updateResult = { updated: 1, snapshot: "snap.jsonl" } } = {}) {
  const updateCalls = [];
  return {
    calls: updateCalls,
    readFlag: async (id) => (flag && flag.id === id ? { data: flag, error: null } : { data: null, error: null }),
    readSource: async (id) => (source && source.id === id ? { data: source, error: null } : { data: null, error: null }),
    updateSource: async (id, patch) => { updateCalls.push({ id, patch }); return updateResult; },
  };
}

test("applyClassification: not_found when the flag id does not resolve", async () => {
  const deps = fakeDeps({});
  const r = await applyClassification(deps, "missing-flag", { execute: true });
  assert.equal(r.status, "not_found");
});

test("applyClassification: not_ratifiable surfaces evaluateApplication's error verbatim", async () => {
  const deps = fakeDeps({ flag: baseFlag({ status: "open" }) });
  const r = await applyClassification(deps, "flag-1", { execute: true });
  assert.equal(r.status, "not_ratifiable");
});

test("applyClassification: source_not_found when the flag is ratifiable but the source is gone", async () => {
  const deps = fakeDeps({ flag: baseFlag() });
  const r = await applyClassification(deps, "flag-1", { execute: true });
  assert.equal(r.status, "source_not_found");
});

test("applyClassification: dry_run computes the patch but writes nothing", async () => {
  const deps = fakeDeps({ flag: baseFlag(), source: { id: "source-1", scope_topics: [] } });
  const r = await applyClassification(deps, "flag-1", { execute: false });
  assert.equal(r.status, "dry_run");
  assert.deepEqual(r.merge.patch.scope_topics, ["environmental"]);
  assert.equal(deps.calls.length, 0);
});

test("applyClassification: applied writes exactly once, via updateSource", async () => {
  const deps = fakeDeps({ flag: baseFlag(), source: { id: "source-1", scope_topics: [] } });
  const r = await applyClassification(deps, "flag-1", { execute: true });
  assert.equal(r.status, "applied");
  assert.equal(deps.calls.length, 1);
  assert.equal(deps.calls[0].id, "source-1");
  assert.deepEqual(deps.calls[0].patch.scope_topics, ["environmental"]);
});

test("applyClassification: no_change when every applicable proposal is already present — no write", async () => {
  const deps = fakeDeps({ flag: baseFlag(), source: { id: "source-1", scope_topics: ["environmental"] } });
  const r = await applyClassification(deps, "flag-1", { execute: true });
  assert.equal(r.status, "no_change");
  assert.equal(deps.calls.length, 0);
});

// ── isAutoAdoptableProposal / partitionProposals (operator ruling 2026-09-03) ─────────────────────

test("isAutoAdoptableProposal: scope_modes/scope_verticals auto-adopt only at 'high' confidence", () => {
  assert.equal(isAutoAdoptableProposal({ field: "scope_modes", confidence: "high" }), true);
  assert.equal(isAutoAdoptableProposal({ field: "scope_modes", confidence: "medium" }), false);
  assert.equal(isAutoAdoptableProposal({ field: "scope_verticals", confidence: "high" }), true);
  assert.equal(isAutoAdoptableProposal({ field: "scope_verticals", confidence: "medium" }), false);
});

test("isAutoAdoptableProposal: expected_output always auto-adopts (deterministic role->default lookup, confidence label irrelevant)", () => {
  assert.equal(isAutoAdoptableProposal({ field: "expected_output", confidence: "medium" }), true);
  assert.equal(isAutoAdoptableProposal({ field: "expected_output" }), true);
});

test("isAutoAdoptableProposal: scope_topics NEVER auto-adopts, at any confidence (undecidable residue — see file header)", () => {
  assert.equal(isAutoAdoptableProposal({ field: "scope_topics", confidence: "high" }), false);
  assert.equal(isAutoAdoptableProposal({ field: "scope_topics", confidence: "medium" }), false);
});

test("isAutoAdoptableProposal: jurisdictions never auto-adopts (not in AUTO_ADOPT_FIELDS)", () => {
  assert.equal(isAutoAdoptableProposal({ field: "jurisdictions", confidence: "high" }), false);
  assert.ok(!AUTO_ADOPT_FIELDS.includes("jurisdictions"));
});

test("isAutoAdoptableProposal: malformed input never throws", () => {
  assert.equal(isAutoAdoptableProposal(null), false);
  assert.equal(isAutoAdoptableProposal({}), false);
});

test("partitionProposals: splits auto-adoptable from remaining, preserves order within each bucket", () => {
  const proposals = [
    { field: "scope_modes", confidence: "high" },
    { field: "scope_topics", confidence: "medium" },
    { field: "expected_output" },
    { field: "jurisdictions", confidence: "high" },
  ];
  const { autoAdoptable, remaining } = partitionProposals(proposals);
  assert.deepEqual(autoAdoptable.map((p) => p.field), ["scope_modes", "expected_output"]);
  assert.deepEqual(remaining.map((p) => p.field), ["scope_topics", "jurisdictions"]);
});

// ── evaluateAutoAdoption ─────────────────────────────────────────────────────────────────────────

function openFlag(overrides = {}) {
  const proposals = [{ field: "scope_modes", value: ["ocean"], confidence: "high", basis: "x", applicable: true }];
  return {
    id: "flag-1",
    created_by: CLASSIFY_CREATED_BY,
    status: "open",
    description: `summary\n\nPROPOSALS_JSON: ${JSON.stringify(proposals)}`,
    subject_ref: "source-1",
    ...overrides,
  };
}

test("evaluateAutoAdoption: an open flag with a high-confidence scope_modes proposal is fully covered", () => {
  const r = evaluateAutoAdoption(openFlag());
  assert.equal(r.ok, true);
  assert.equal(r.sourceId, "source-1");
  assert.equal(r.autoAdoptable.length, 1);
  assert.equal(r.fullyCovered, true);
});

test("evaluateAutoAdoption: rejects a non-open flag (already resolved -- ratified or a prior auto-adopt pass)", () => {
  const r = evaluateAutoAdoption(openFlag({ status: "resolved" }));
  assert.equal(r.ok, false);
  assert.match(r.error, /not 'open'/);
});

test("evaluateAutoAdoption: rejects a source-drift flag even though it's open", () => {
  const r = evaluateAutoAdoption(openFlag({ created_by: DRIFT_CREATED_BY }));
  assert.equal(r.ok, false);
  assert.match(r.error, /source-drift|item-anomaly/);
});

test("evaluateAutoAdoption: no auto-adoptable proposal (only scope_topics, medium) -> not ok, stays open", () => {
  const proposals = [{ field: "scope_topics", value: ["environmental"], confidence: "medium", basis: "x", applicable: true }];
  const r = evaluateAutoAdoption(openFlag({ description: `summary\n\nPROPOSALS_JSON: ${JSON.stringify(proposals)}` }));
  assert.equal(r.ok, false);
  assert.match(r.error, /zero auto-adoptable/);
});

test("evaluateAutoAdoption: partial coverage (decisive scope_modes + medium scope_topics) -> fullyCovered=false", () => {
  const proposals = [
    { field: "scope_modes", value: ["ocean"], confidence: "high", basis: "x", applicable: true },
    { field: "scope_topics", value: ["environmental"], confidence: "medium", basis: "y", applicable: true },
  ];
  const r = evaluateAutoAdoption(openFlag({ description: `summary\n\nPROPOSALS_JSON: ${JSON.stringify(proposals)}` }));
  assert.equal(r.ok, true);
  assert.equal(r.autoAdoptable.length, 1);
  assert.equal(r.fullyCovered, false);
});

test("evaluateAutoAdoption: a jurisdiction proposal riding along never blocks fullyCovered", () => {
  const proposals = [
    { field: "scope_modes", value: ["ocean"], confidence: "high", basis: "x", applicable: true },
    { field: "jurisdictions", value: ["GB"], confidence: "high", basis: "y", applicable: false },
  ];
  const r = evaluateAutoAdoption(openFlag({ description: `summary\n\nPROPOSALS_JSON: ${JSON.stringify(proposals)}` }));
  assert.equal(r.ok, true);
  assert.equal(r.fullyCovered, true);
});

// ── autoAdoptClassification (fake deps) ─────────────────────────────────────────────────────────

function fakeAutoDeps({ flag, source, updateResult = { updated: 1, snapshot: "snap.jsonl" }, resolveResult = { updated: 1, snapshot: "snap2.jsonl" } } = {}) {
  const updateCalls = [], resolveCalls = [];
  return {
    updateCalls, resolveCalls,
    readFlag: async (id) => (flag && flag.id === id ? { data: flag, error: null } : { data: null, error: null }),
    readSource: async (id) => (source && source.id === id ? { data: source, error: null } : { data: null, error: null }),
    updateSource: async (id, patch) => { updateCalls.push({ id, patch }); return updateResult; },
    resolveFlag: async (id, note) => { resolveCalls.push({ id, note }); return resolveResult; },
  };
}

test("autoAdoptClassification: not_found when the flag id does not resolve", async () => {
  const deps = fakeAutoDeps({});
  const r = await autoAdoptClassification(deps, "missing-flag", { execute: true });
  assert.equal(r.status, "not_found");
});

test("autoAdoptClassification: not_auto_adoptable surfaces evaluateAutoAdoption's error verbatim", async () => {
  const deps = fakeAutoDeps({ flag: openFlag({ status: "resolved" }) });
  const r = await autoAdoptClassification(deps, "flag-1", { execute: true });
  assert.equal(r.status, "not_auto_adoptable");
});

test("autoAdoptClassification: dry_run computes the patch and willResolve, writes nothing", async () => {
  const deps = fakeAutoDeps({ flag: openFlag(), source: { id: "source-1", scope_modes: [] } });
  const r = await autoAdoptClassification(deps, "flag-1", { execute: false });
  assert.equal(r.status, "dry_run");
  assert.deepEqual(r.merge.patch.scope_modes, ["ocean"]);
  assert.equal(r.willResolve, true);
  assert.equal(deps.updateCalls.length, 0);
  assert.equal(deps.resolveCalls.length, 0);
});

test("autoAdoptClassification: fully-covered flag writes the patch AND resolves the flag", async () => {
  const deps = fakeAutoDeps({ flag: openFlag(), source: { id: "source-1", scope_modes: [] } });
  const r = await autoAdoptClassification(deps, "flag-1", { execute: true });
  assert.equal(r.status, "applied");
  assert.equal(r.written, true);
  assert.equal(r.resolved, true);
  assert.equal(deps.updateCalls.length, 1);
  assert.deepEqual(deps.updateCalls[0].patch.scope_modes, ["ocean"]);
  assert.equal(deps.resolveCalls.length, 1);
  assert.equal(deps.resolveCalls[0].id, "flag-1");
  assert.match(deps.resolveCalls[0].note, /^auto-adopted:classification:scope_modes$/);
});

test("autoAdoptClassification: partially-covered flag writes the eligible field but leaves the flag open", async () => {
  const proposals = [
    { field: "scope_modes", value: ["ocean"], confidence: "high", basis: "x", applicable: true },
    { field: "scope_topics", value: ["environmental"], confidence: "medium", basis: "y", applicable: true },
  ];
  const flag = openFlag({ description: `summary\n\nPROPOSALS_JSON: ${JSON.stringify(proposals)}` });
  const deps = fakeAutoDeps({ flag, source: { id: "source-1", scope_modes: [] } });
  const r = await autoAdoptClassification(deps, "flag-1", { execute: true });
  assert.equal(r.status, "applied");
  assert.equal(r.written, true);
  assert.equal(r.resolved, false);
  assert.equal(deps.updateCalls.length, 1);
  assert.equal(deps.resolveCalls.length, 0, "flag stays open for the operator to ratify scope_topics");
});

test("autoAdoptClassification: value already present + fully covered -> no patch write, but still resolves (nothing left to do)", async () => {
  const deps = fakeAutoDeps({ flag: openFlag(), source: { id: "source-1", scope_modes: ["ocean"] } });
  const r = await autoAdoptClassification(deps, "flag-1", { execute: true });
  assert.equal(r.status, "applied");
  assert.equal(r.written, false);
  assert.equal(r.resolved, true);
  assert.equal(deps.updateCalls.length, 0, "already-present value never triggers a write");
  assert.equal(deps.resolveCalls.length, 1, "fully covered with nothing left to write still closes the flag");
});

test("autoAdoptClassification: no auto-adoptable proposal at all -> not_auto_adoptable, no write, no resolve", async () => {
  const proposals = [{ field: "scope_topics", value: ["environmental"], confidence: "medium", basis: "x", applicable: true }];
  const flag = openFlag({ description: `summary\n\nPROPOSALS_JSON: ${JSON.stringify(proposals)}` });
  const deps = fakeAutoDeps({ flag, source: { id: "source-1" } });
  const r = await autoAdoptClassification(deps, "flag-1", { execute: true });
  assert.equal(r.status, "not_auto_adoptable");
  assert.equal(deps.updateCalls.length, 0);
  assert.equal(deps.resolveCalls.length, 0);
});
