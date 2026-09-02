// apply-classifications.test.mjs — proves the pure decide-and-apply core: ratification-token
// detection, PROPOSALS_JSON extraction, the applicable-fields gate, the merge/set-once patch builder,
// and applyClassification's full decision tree with fake injected deps (no real Supabase, no process.exit).
import test from "node:test";
import assert from "node:assert/strict";
import {
  RATIFY_CLASSIFICATION_TOKEN, hasRatifyClassificationToken, extractProposalsFromDescription,
  evaluateApplication, buildMergePatch, applyClassification,
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
