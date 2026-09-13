// apply-classifications.test.mjs — proves the pure decide-and-apply core: ratification-token
// detection, PROPOSALS_JSON extraction, the applicable-fields gate, the merge/set-once patch builder,
// and applyClassification's full decision tree with fake injected deps (no real Supabase, no process.exit).
import test from "node:test";
import assert from "node:assert/strict";
import {
  RATIFY_CLASSIFICATION_TOKEN, hasRatifyClassificationToken, extractProposalsFromDescription,
  evaluateApplication, buildMergePatch, applyClassification,
  AUTO_ADOPT_FIELDS, isAutoAdoptableProposal, partitionProposals, evaluateAutoAdoption, autoAdoptClassification,
  decideClassificationProposal, decideScopeTopicsProposal, decideClassificationProposals, buildAdoptedProposalsForMerge,
  isZeroProposalClassificationFlag, buildNoDerivableClassificationNote, deriveClassTableCandidates,
  countDistinctDates, decideDriftResolution, autoResolveDriftFlag, retireAnomalyFlag,
  DRIFT_MIN_ITEMS, DRIFT_MIN_DISTINCT_DATES, ANOMALY_RETIRED_NOTE,
} from "./apply-classifications.mjs";
import { APPLICABLE_FIELDS } from "../../src/lib/classification/classify-source.mjs";
import {
  AXIS_NAMESPACE, SOURCE_CLASSIFICATION_SUBTYPE, SOURCE_DRIFT_SUBTYPE, ITEM_ANOMALY_SUBTYPE,
} from "../../src/lib/classification/flags.mjs";
import { createdBy } from "../../src/lib/connections/flag-namespaces.mjs";

const CLASSIFY_CREATED_BY = createdBy(AXIS_NAMESPACE, SOURCE_CLASSIFICATION_SUBTYPE);
const DRIFT_CREATED_BY = createdBy(AXIS_NAMESPACE, SOURCE_DRIFT_SUBTYPE);
const ANOMALY_CREATED_BY = createdBy(AXIS_NAMESPACE, ITEM_ANOMALY_SUBTYPE);

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

// ── D9, lane L14, 2026-09-13: jurisdiction_iso is an ARRAY_FIELDS member (merge, never overwrite) ───

test("buildMergePatch: jurisdiction_iso merges -- preserves an existing value and appends a novel one", () => {
  const current = { jurisdiction_iso: ["GB"] };
  const proposals = [{ field: "jurisdiction_iso", value: ["FR"] }];
  const { patch, applied } = buildMergePatch(current, proposals);
  assert.deepEqual(patch.jurisdiction_iso, ["GB", "FR"]);
  assert.deepEqual(applied.jurisdiction_iso, ["FR"]);
});

test("buildMergePatch: jurisdiction_iso -- a duplicate proposed value is a no-op, reported as skipped", () => {
  const current = { jurisdiction_iso: ["GB"] };
  const proposals = [{ field: "jurisdiction_iso", value: ["GB"] }];
  const { patch, skipped } = buildMergePatch(current, proposals);
  assert.equal(patch.jurisdiction_iso, undefined);
  assert.match(skipped.jurisdiction_iso, /already present/);
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

test("isAutoAdoptableProposal: the legacy jurisdictions column never auto-adopts (not in AUTO_ADOPT_FIELDS)", () => {
  assert.equal(isAutoAdoptableProposal({ field: "jurisdictions", confidence: "high" }), false);
  assert.ok(!AUTO_ADOPT_FIELDS.includes("jurisdictions"));
});

test("isAutoAdoptableProposal: jurisdiction_iso auto-adopts only at 'high' confidence (D9, lane L14, 2026-09-13 -- the scope_modes rule)", () => {
  assert.ok(AUTO_ADOPT_FIELDS.includes("jurisdiction_iso"));
  assert.equal(isAutoAdoptableProposal({ field: "jurisdiction_iso", confidence: "high" }), true);
  assert.equal(isAutoAdoptableProposal({ field: "jurisdiction_iso", confidence: "medium" }), false);
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

// ── evaluateAutoAdoption (task 7.2, 2026-09-12: any flag with >=1 proposal is decidable) ────────────

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

test("evaluateAutoAdoption: an open flag with a high-confidence scope_modes proposal is decidable", () => {
  const r = evaluateAutoAdoption(openFlag());
  assert.equal(r.ok, true);
  assert.equal(r.sourceId, "source-1");
  assert.equal(r.proposals.length, 1);
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

test("evaluateAutoAdoption: a scope_topics-only flag is NOW decidable (task 7.2 closes this former forever-open residue)", () => {
  const proposals = [{ field: "scope_topics", value: ["environmental"], confidence: "medium", basis: "x", applicable: true }];
  const r = evaluateAutoAdoption(openFlag({ description: `summary\n\nPROPOSALS_JSON: ${JSON.stringify(proposals)}` }));
  assert.equal(r.ok, true);
  assert.equal(r.proposals.length, 1);
});

test("evaluateAutoAdoption: a jurisdiction-only flag is NOW decidable too (declines, but decides)", () => {
  const proposals = [{ field: "jurisdictions", value: ["GB"], confidence: "high", basis: "y", applicable: false }];
  const r = evaluateAutoAdoption(openFlag({ description: `summary\n\nPROPOSALS_JSON: ${JSON.stringify(proposals)}` }));
  assert.equal(r.ok, true);
  assert.equal(r.proposals.length, 1);
});

test("evaluateAutoAdoption: zero-proposal flag -> refused, nothing to decide", () => {
  const r = evaluateAutoAdoption(openFlag({ description: "summary\n\nPROPOSALS_JSON: []" }));
  assert.equal(r.ok, false);
  assert.match(r.error, /zero proposals/);
});

// ── decideClassificationProposal / decideScopeTopicsProposal (task 7.2 decision rules) ─────────────

test("decideClassificationProposal: expected_output adopts when unset, declines when already set", () => {
  const proposal = { field: "expected_output", value: { regulations: 1 }, confidence: "medium" };
  assert.equal(decideClassificationProposal(proposal, { expected_output: null }).decision, "adopt");
  assert.equal(decideClassificationProposal(proposal, { expected_output: { regulations: 0.9 } }).decision, "decline");
});

test("decideClassificationProposal: scope_modes/scope_verticals adopt only at high confidence, else decline with reason", () => {
  const high = decideClassificationProposal({ field: "scope_modes", value: ["ocean"], confidence: "high" }, {});
  const medium = decideClassificationProposal({ field: "scope_verticals", value: ["fine_art"], confidence: "medium" }, {});
  assert.equal(high.decision, "adopt");
  assert.equal(medium.decision, "decline");
  assert.match(medium.reason, /does not meet the decisive 'high' bar/);
});

test("decideClassificationProposal: the legacy jurisdictions column has no decision rule (never proposed by classify-source.mjs, so this is unreachable in practice)", () => {
  const r = decideClassificationProposal({ field: "jurisdictions", value: ["GB"], confidence: "high" }, {});
  assert.equal(r.decision, "decline");
  assert.match(r.reason, /has no decision rule/);
});

// ── D9, lane L14, 2026-09-13: jurisdiction_iso adopts into migration 033's column ───────────────────

test("decideClassificationProposal: jurisdiction_iso adopts at high confidence with a vocab-valid value", () => {
  const r = decideClassificationProposal({ field: "jurisdiction_iso", value: ["GB"], confidence: "high" }, {});
  assert.equal(r.decision, "adopt");
  assert.match(r.reason, /decisive host-identity match/);
});

test("decideClassificationProposal: jurisdiction_iso declines at medium confidence, same rule as scope_modes/scope_verticals", () => {
  const r = decideClassificationProposal({ field: "jurisdiction_iso", value: ["GB"], confidence: "medium" }, {});
  assert.equal(r.decision, "decline");
  assert.match(r.reason, /does not meet the decisive 'high' bar/);
});

test("decideClassificationProposal: jurisdiction_iso declines a value outside vocab.mjs's shape, regardless of confidence", () => {
  const r = decideClassificationProposal({ field: "jurisdiction_iso", value: ["not-a-code"], confidence: "high" }, {});
  assert.equal(r.decision, "decline");
  assert.equal(r.reason, "jurisdiction_iso value not-a-code is not in the framework vocabulary.");
});

test("decideClassificationProposal: jurisdiction_iso vocab check runs before the confidence check (an invalid value at medium confidence still names the vocab reason)", () => {
  const r = decideClassificationProposal({ field: "jurisdiction_iso", value: ["zzz"], confidence: "medium" }, {});
  assert.equal(r.decision, "decline");
  assert.match(r.reason, /not in the framework vocabulary/);
});

test("decideScopeTopicsProposal: adopts a topic whose keyword still matches the source's own name", () => {
  const rows = decideScopeTopicsProposal({ field: "scope_topics", value: ["environmental"] }, { name: "EU Climate and Environment Agency" });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].decision, "adopt");
  assert.match(rows[0].reason, /re-confirmed/);
});

test("decideScopeTopicsProposal: declines a topic whose keyword no longer matches the source's current name", () => {
  const rows = decideScopeTopicsProposal({ field: "scope_topics", value: ["environmental"] }, { name: "Renamed Neutral Body" });
  assert.equal(rows[0].decision, "decline");
  assert.match(rows[0].reason, /no re-confirmable/);
});

test("decideScopeTopicsProposal: adopts the role-derived 'regulatory' topic when the source_role still qualifies", () => {
  const rows = decideScopeTopicsProposal({ field: "scope_topics", value: ["regulatory"] }, { name: "Some Body", source_role: "primary_legal_authority" });
  assert.equal(rows[0].decision, "adopt");
  assert.match(rows[0].reason, /source_role=primary_legal_authority/);
});

test("decideScopeTopicsProposal: decides EVERY topic independently -- a multi-topic proposal can split adopt/decline", () => {
  const rows = decideScopeTopicsProposal({ field: "scope_topics", value: ["environmental", "finance"] }, { name: "Environment Council" });
  assert.equal(rows.length, 2);
  assert.equal(rows.find((r) => r.tag === "environmental").decision, "adopt");
  assert.equal(rows.find((r) => r.tag === "finance").decision, "decline");
});

test("decideClassificationProposals: expands scope_topics per-topic and decides every other field once, no residue", () => {
  const proposals = [
    { field: "scope_modes", value: ["ocean"], confidence: "high" },
    { field: "scope_topics", value: ["environmental", "finance"] },
    { field: "jurisdictions", value: ["GB"], confidence: "high" },
  ];
  const decisions = decideClassificationProposals(proposals, { name: "Environment Council" });
  assert.equal(decisions.length, 4); // scope_modes + 2 scope_topics + jurisdictions
  assert.ok(decisions.every((d) => d.decision === "adopt" || d.decision === "decline"));
});

test("buildAdoptedProposalsForMerge: regroups adopted scope_topics tags into one field entry, passes through other adopted fields", () => {
  const decisions = [
    { field: "scope_modes", value: ["ocean"], decision: "adopt" },
    { field: "scope_topics", tag: "environmental", decision: "adopt" },
    { field: "scope_topics", tag: "finance", decision: "decline" },
    { field: "jurisdictions", value: ["GB"], decision: "decline" },
  ];
  const merged = buildAdoptedProposalsForMerge(decisions);
  assert.equal(merged.length, 2);
  assert.deepEqual(merged.find((p) => p.field === "scope_modes").value, ["ocean"]);
  assert.deepEqual(merged.find((p) => p.field === "scope_topics").value, ["environmental"]);
});

// ── autoAdoptClassification (fake deps) -- every proposal decided, flag always closes ───────────────

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

test("autoAdoptClassification: dry_run computes the patch and decisions, writes nothing", async () => {
  const deps = fakeAutoDeps({ flag: openFlag(), source: { id: "source-1", scope_modes: [] } });
  const r = await autoAdoptClassification(deps, "flag-1", { execute: false });
  assert.equal(r.status, "dry_run");
  assert.deepEqual(r.merge.patch.scope_modes, ["ocean"]);
  assert.equal(r.decisions[0].decision, "adopt");
  assert.equal(deps.updateCalls.length, 0);
  assert.equal(deps.resolveCalls.length, 0);
});

test("autoAdoptClassification: a decisive proposal writes the patch AND resolves the flag", async () => {
  const deps = fakeAutoDeps({ flag: openFlag(), source: { id: "source-1", scope_modes: [] } });
  const r = await autoAdoptClassification(deps, "flag-1", { execute: true });
  assert.equal(r.status, "applied");
  assert.equal(r.written, true);
  assert.equal(r.resolved, true);
  assert.equal(deps.updateCalls.length, 1);
  assert.deepEqual(deps.updateCalls[0].patch.scope_modes, ["ocean"]);
  assert.equal(deps.resolveCalls.length, 1);
  assert.equal(deps.resolveCalls[0].id, "flag-1");
  assert.match(deps.resolveCalls[0].note, /decided 1 \(adopted 1, declined 0\)/);
});

test("autoAdoptClassification: mixed proposal set writes the adopted field AND resolves the flag -- no residue stays open", async () => {
  const proposals = [
    { field: "scope_modes", value: ["ocean"], confidence: "high", basis: "x", applicable: true },
    { field: "scope_topics", value: ["environmental"], confidence: "medium", basis: "y", applicable: true },
  ];
  const flag = openFlag({ description: `summary\n\nPROPOSALS_JSON: ${JSON.stringify(proposals)}` });
  const deps = fakeAutoDeps({ flag, source: { id: "source-1", name: "Environment Council", scope_modes: [] } });
  const r = await autoAdoptClassification(deps, "flag-1", { execute: true });
  assert.equal(r.status, "applied");
  assert.equal(r.written, true);
  assert.equal(r.resolved, true, "task 7.2: the flag closes even though scope_topics is a separate decision");
  assert.deepEqual(deps.updateCalls[0].patch.scope_modes, ["ocean"]);
  assert.deepEqual(deps.updateCalls[0].patch.scope_topics, ["environmental"]);
  assert.equal(deps.resolveCalls.length, 1);
});

test("autoAdoptClassification: value already present -> no patch write, but still resolves (nothing left undecided)", async () => {
  const deps = fakeAutoDeps({ flag: openFlag(), source: { id: "source-1", scope_modes: ["ocean"] } });
  const r = await autoAdoptClassification(deps, "flag-1", { execute: true });
  assert.equal(r.status, "applied");
  assert.equal(r.written, false);
  assert.equal(r.resolved, true);
  assert.equal(deps.updateCalls.length, 0, "already-present value never triggers a write");
  assert.equal(deps.resolveCalls.length, 1, "already-decided-adopt with nothing left to write still closes the flag");
});

test("autoAdoptClassification: a scope_topics-only flag with no re-confirmable evidence DECLINES and still resolves", async () => {
  const proposals = [{ field: "scope_topics", value: ["environmental"], confidence: "medium", basis: "x", applicable: true }];
  const flag = openFlag({ description: `summary\n\nPROPOSALS_JSON: ${JSON.stringify(proposals)}` });
  const deps = fakeAutoDeps({ flag, source: { id: "source-1", name: "Renamed Neutral Body" } });
  const r = await autoAdoptClassification(deps, "flag-1", { execute: true });
  assert.equal(r.status, "applied");
  assert.equal(r.written, false);
  assert.equal(r.resolved, true, "task 7.2: a fully-declined flag still closes -- 'no action, and why' is a valid close");
  assert.equal(r.decisions[0].decision, "decline");
  assert.equal(deps.resolveCalls.length, 1);
});

test("autoAdoptClassification: a legacy jurisdictions-field-only flag DECLINES (no decision rule for that field) and still resolves", async () => {
  const proposals = [{ field: "jurisdictions", value: ["GB"], confidence: "high", basis: "x", applicable: false }];
  const flag = openFlag({ description: `summary\n\nPROPOSALS_JSON: ${JSON.stringify(proposals)}` });
  const deps = fakeAutoDeps({ flag, source: { id: "source-1" } });
  const r = await autoAdoptClassification(deps, "flag-1", { execute: true });
  assert.equal(r.status, "applied");
  assert.equal(r.written, false);
  assert.equal(r.resolved, true);
  assert.equal(r.decisions[0].decision, "decline");
  assert.match(r.decisions[0].reason, /has no decision rule/);
});

// ── D9, lane L14, 2026-09-13: a jurisdiction_iso-only flag now ADOPTS at high confidence ────────────

test("autoAdoptClassification: a high-confidence jurisdiction_iso-only flag ADOPTS, writes the patch, and resolves", async () => {
  const proposals = [{ field: "jurisdiction_iso", value: ["GB"], confidence: "high", basis: "x", applicable: true }];
  const flag = openFlag({ description: `summary\n\nPROPOSALS_JSON: ${JSON.stringify(proposals)}` });
  const deps = fakeAutoDeps({ flag, source: { id: "source-1", jurisdiction_iso: [] } });
  const r = await autoAdoptClassification(deps, "flag-1", { execute: true });
  assert.equal(r.status, "applied");
  assert.equal(r.written, true);
  assert.equal(r.resolved, true);
  assert.deepEqual(deps.updateCalls[0].patch.jurisdiction_iso, ["GB"]);
  assert.equal(r.decisions[0].decision, "adopt");
});

test("autoAdoptClassification: a medium-confidence jurisdiction_iso-only flag is NOT auto-adopted, but decides (declines) and closes -- still ratifiable through the ratified path", async () => {
  const proposals = [{ field: "jurisdiction_iso", value: ["GB"], confidence: "medium", basis: "x", applicable: true }];
  const flag = openFlag({ description: `summary\n\nPROPOSALS_JSON: ${JSON.stringify(proposals)}` });
  const deps = fakeAutoDeps({ flag, source: { id: "source-1", jurisdiction_iso: [] } });
  const r = await autoAdoptClassification(deps, "flag-1", { execute: true });
  assert.equal(r.written, false, "medium confidence never auto-adopts (isAutoAdoptableProposal / decideClassificationProposal agree)");
  assert.equal(r.decisions[0].decision, "decline");
  // The RATIFIED path (evaluateApplication/applyClassification) is a SEPARATE, confidence-blind gate:
  // once an operator ratifies the SAME proposal (resolution_note carries ratify:classification), it
  // writes regardless of confidence -- proving the medium-confidence proposal is not stuck, just not
  // auto-adopted.
  const ratifiedFlag = {
    id: "flag-2", created_by: CLASSIFY_CREATED_BY, status: "resolved", resolved_by: "operator-1",
    resolution_note: "ratify:classification", subject_ref: "source-1",
    description: `summary\n\nPROPOSALS_JSON: ${JSON.stringify(proposals)}`,
  };
  const ratifyDeps = fakeDeps({ flag: ratifiedFlag, source: { id: "source-1", jurisdiction_iso: [] } });
  const ratified = await applyClassification(ratifyDeps, "flag-2", { execute: true });
  assert.equal(ratified.status, "applied");
  assert.deepEqual(ratifyDeps.calls[0].patch.jurisdiction_iso, ["GB"]);
});

// ── INVARIANT: no residue stays open ────────────────────────────────────────────────────────────

test("INVARIANT: autoAdoptClassification always resolves a decidable flag (never leaves one open)", async () => {
  const cases = [
    [{ field: "scope_modes", value: ["ocean"], confidence: "high" }],
    [{ field: "scope_modes", value: ["ocean"], confidence: "medium" }],
    [{ field: "scope_topics", value: ["environmental"], confidence: "medium" }],
    [{ field: "jurisdictions", value: ["GB"], confidence: "high" }], // legacy field, no decision rule
    [{ field: "jurisdiction_iso", value: ["GB"], confidence: "high" }],
    [{ field: "jurisdiction_iso", value: ["not-a-code"], confidence: "high" }], // vocab-invalid
    [{ field: "expected_output", value: { regulations: 1 }, confidence: "medium" }],
  ];
  for (const proposals of cases) {
    const flag = openFlag({ description: `summary\n\nPROPOSALS_JSON: ${JSON.stringify(proposals)}` });
    const deps = fakeAutoDeps({ flag, source: { id: "source-1", name: "Environment Council" } });
    const r = await autoAdoptClassification(deps, "flag-1", { execute: true });
    assert.equal(r.status, "applied");
    assert.equal(r.resolved, true, `proposals ${JSON.stringify(proposals)} must still resolve the flag`);
    assert.equal(deps.resolveCalls.length, 1);
  }
});

// ── D17 family 4: classification zero-proposal re-derivation (defect-fix-plan-2026-09-12) ─────────

function zeroProposalClassificationFlag(overrides = {}) {
  return {
    id: "flag-1",
    created_by: CLASSIFY_CREATED_BY,
    status: "open",
    description: "summary\n\nPROPOSALS_JSON: []",
    subject_ref: "source-1",
    ...overrides,
  };
}

test("isZeroProposalClassificationFlag: true for an empty PROPOSALS_JSON array, false when proposals exist or malformed", () => {
  assert.equal(isZeroProposalClassificationFlag(zeroProposalClassificationFlag()), true);
  assert.equal(isZeroProposalClassificationFlag(openFlag()), false);
  assert.equal(isZeroProposalClassificationFlag({ description: "no json here" }), false);
});

test("buildNoDerivableClassificationNote: carries the date and 're-evaluated on the next classify run'", () => {
  const note = buildNoDerivableClassificationNote(new Date("2026-09-12T00:00:00Z"));
  assert.match(note, /^no derivable classification from the class table or the observed output on 2026-09-12/);
  assert.match(note, /re-evaluated on the next classify run/);
});

// deriveClassTableCandidates: pure, no I/O.

test("deriveClassTableCandidates: a tier-1 legal-primary host derives scope_topics, scope_verticals, and a role-default expected_output when unset", () => {
  const source = { url: "https://eur-lex.europa.eu/some-path" };
  const gaps = { scope_topics: true, scope_verticals: true, expected_output: true };
  const candidates = deriveClassTableCandidates(source, gaps, null);
  const byField = Object.fromEntries(candidates.map((c) => [c.field, c]));
  assert.deepEqual(byField.scope_topics.value, ["regulatory"]);
  assert.deepEqual(byField.scope_verticals.value, ["freight_general"]);
  assert.ok(byField.expected_output, "expected_output derives from the primary_legal_authority role default");
  assert.match(byField.expected_output.basis, /tier 1/);
});

test("deriveClassTableCandidates: a sufficient observed distribution is preferred over the tier-1 role default for expected_output", () => {
  const source = { url: "https://eur-lex.europa.eu/some-path" };
  const gaps = { scope_topics: false, scope_verticals: false, expected_output: true };
  const observed = { regulations: 0.7, research: 0.1, market: 0.1, operations: 0.05, out_of_scope: 0.05 };
  const candidates = deriveClassTableCandidates(source, gaps, observed);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].field, "expected_output");
  assert.deepEqual(candidates[0].value, observed);
  assert.match(candidates[0].basis, /observed item-category distribution/);
});

test("deriveClassTableCandidates: a tier-2 (gov/intergov) host derives ONLY scope_topics, never scope_verticals or a role-default expected_output", () => {
  const source = { url: "https://www.imo.org/some-path" };
  const gaps = { scope_topics: true, scope_verticals: true, expected_output: true };
  const candidates = deriveClassTableCandidates(source, gaps, null);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].field, "scope_topics");
});

test("deriveClassTableCandidates: an unclassifiable host derives nothing (never guesses)", () => {
  const source = { url: "https://some-random-blog.example/post" };
  const gaps = { scope_topics: true, scope_verticals: true, expected_output: true };
  assert.deepEqual(deriveClassTableCandidates(source, gaps, null), []);
});

test("deriveClassTableCandidates: a malformed/missing url never throws", () => {
  assert.deepEqual(deriveClassTableCandidates({ url: null }, { scope_topics: true, scope_verticals: true, expected_output: true }, null), []);
  assert.deepEqual(deriveClassTableCandidates({ url: "not a url" }, { scope_topics: true, scope_verticals: true, expected_output: true }, null), []);
});

// reDeriveZeroProposalClassification, via autoAdoptClassification (fake deps).

function fakeZeroProposalDeps({ flag, source, items = [], updateResult = { updated: 1, snapshot: "s.jsonl" }, resolveResult = { updated: 1, snapshot: "s2.jsonl" } } = {}) {
  const updateCalls = [], resolveCalls = [];
  return {
    updateCalls, resolveCalls,
    readFlag: async (id) => (flag && flag.id === id ? { data: flag, error: null } : { data: null, error: null }),
    readSource: async (id) => (source && source.id === id ? { data: source, error: null } : { data: null, error: null }),
    readSourceItems: async () => items,
    updateSource: async (id, patch) => { updateCalls.push({ id, patch }); return updateResult; },
    resolveFlag: async (id, note) => { resolveCalls.push({ id, note }); return resolveResult; },
  };
}

test("autoAdoptClassification (D17 family 4): a zero-proposal flag whose host resolves to the SC-13 class table is re-derived, adopted, and resolved", async () => {
  const flag = zeroProposalClassificationFlag();
  const source = { id: "source-1", name: "EUR-Lex", url: "https://eur-lex.europa.eu/x", scope_topics: [], scope_modes: [], scope_verticals: [], expected_output: null };
  const deps = fakeZeroProposalDeps({ flag, source });
  const r = await autoAdoptClassification(deps, "flag-1", { execute: true });
  assert.equal(r.status, "re_derived_adopted");
  assert.ok(deps.updateCalls.some((c) => c.id === "source-1" && Array.isArray(c.patch.scope_topics)));
  assert.equal(deps.resolveCalls.length, 1);
});

test("autoAdoptClassification (D17 family 4): a zero-proposal flag whose host is unclassifiable and has no observed sample is resolved with the no-derivable note, no source write", async () => {
  const flag = zeroProposalClassificationFlag();
  const source = { id: "source-1", name: "Some Blog", url: "https://some-random-blog.example/", scope_topics: [], scope_modes: [], scope_verticals: [], expected_output: null };
  const deps = fakeZeroProposalDeps({ flag, source, items: [] });
  const r = await autoAdoptClassification(deps, "flag-1", { execute: true });
  assert.equal(r.status, "re_derived_no_change");
  assert.equal(deps.updateCalls.length, 0);
  assert.match(deps.resolveCalls[0].note, /no derivable classification/);
});

test("autoAdoptClassification (D17 family 4): a second run against the now-resolved flag is refused, never re-derived", async () => {
  const flag = zeroProposalClassificationFlag();
  const source = { id: "source-1", name: "Some Blog", url: "https://some-random-blog.example/", scope_topics: [], scope_modes: [], scope_verticals: [], expected_output: null };
  const d1 = fakeZeroProposalDeps({ flag, source });
  const r1 = await autoAdoptClassification(d1, "flag-1", { execute: true });
  assert.equal(r1.status, "re_derived_no_change");
  const d2 = fakeZeroProposalDeps({ flag: { ...flag, status: "resolved" }, source });
  const r2 = await autoAdoptClassification(d2, "flag-1", { execute: true });
  assert.equal(r2.status, "not_auto_adoptable");
  assert.equal(d2.updateCalls.length, 0);
  assert.equal(d2.resolveCalls.length, 0);
});

// ── D17 family 5: drift auto-resolution + anomaly retirement (defect-fix-plan-2026-09-12) ─────────

test("countDistinctDates: counts distinct calendar (UTC) dates, ignoring missing/null created_at", () => {
  assert.equal(countDistinctDates([
    { created_at: "2026-09-01T00:00:00Z" }, { created_at: "2026-09-01T12:00:00Z" },
    { created_at: "2026-09-02T00:00:00Z" }, { created_at: null }, {},
  ]), 2);
  assert.equal(countDistinctDates([]), 0);
});

test("decideDriftResolution: adopts the observed distribution once the sample clears the item/date floor", () => {
  const observed = { regulations: 0.6, research: 0.2, market: 0.1, operations: 0.05, out_of_scope: 0.05 };
  const items = Array.from({ length: DRIFT_MIN_ITEMS }, (_, i) => ({ created_at: i % 2 === 0 ? "2026-09-01T00:00:00Z" : "2026-09-02T00:00:00Z" }));
  const r = decideDriftResolution(observed, { regulations: 0.1 }, items);
  assert.equal(r.adopt, true);
  assert.deepEqual(r.patch, { expected_output: observed });
  assert.match(r.note, /drift resolved/);
  assert.match(r.note, /before=/);
  assert.match(r.note, /after=/);
});

test("decideDriftResolution: below the item floor resolves 'insufficient sample', never adopts", () => {
  const observed = { regulations: 0.6, research: 0.2, market: 0.1, operations: 0.05, out_of_scope: 0.05 };
  const items = Array.from({ length: DRIFT_MIN_ITEMS - 1 }, () => ({ created_at: "2026-09-01T00:00:00Z" }));
  const r = decideDriftResolution(observed, null, items);
  assert.equal(r.adopt, false);
  assert.equal(r.patch, null);
  assert.match(r.note, /insufficient sample, re-evaluated next run/);
});

test("decideDriftResolution: enough items but only ONE distinct date still resolves 'insufficient sample'", () => {
  const observed = { regulations: 0.6, research: 0.2, market: 0.1, operations: 0.05, out_of_scope: 0.05 };
  const items = Array.from({ length: DRIFT_MIN_ITEMS + 5 }, () => ({ created_at: "2026-09-01T00:00:00Z" }));
  assert.equal(countDistinctDates(items), 1);
  assert.ok(countDistinctDates(items) < DRIFT_MIN_DISTINCT_DATES);
  const r = decideDriftResolution(observed, null, items);
  assert.equal(r.adopt, false);
});

function fakeFamily5Deps({ flag, source, items = [] } = {}) {
  const updateCalls = [], resolveCalls = [];
  return {
    updateCalls, resolveCalls,
    readFlag: async (id) => (flag && flag.id === id ? { data: flag, error: null } : { data: null, error: null }),
    readSource: async (id) => (source && source.id === id ? { data: source, error: null } : { data: null, error: null }),
    readSourceItems: async () => items,
    updateSource: async (id, patch) => { updateCalls.push({ id, patch }); return { updated: 1, snapshot: "s.jsonl" }; },
    resolveFlag: async (id, note) => { resolveCalls.push({ id, note }); return { updated: 1, snapshot: "s2.jsonl" }; },
  };
}

function driftFlag(overrides = {}) {
  return { id: "drift-1", created_by: DRIFT_CREATED_BY, status: "open", subject_ref: "source-1", ...overrides };
}

test("autoResolveDriftFlag: refuses a flag from the wrong namespace or the wrong status", async () => {
  const deps = fakeFamily5Deps({ flag: driftFlag({ created_by: CLASSIFY_CREATED_BY }) });
  assert.equal((await autoResolveDriftFlag(deps, "drift-1", { execute: true })).status, "not_applicable");
  const deps2 = fakeFamily5Deps({ flag: driftFlag({ status: "resolved" }) });
  assert.equal((await autoResolveDriftFlag(deps2, "drift-1", { execute: true })).status, "not_applicable");
});

test("autoResolveDriftFlag: adopts and writes source.expected_output when the sample is sufficient, then resolves", async () => {
  const items = Array.from({ length: DRIFT_MIN_ITEMS }, (_, i) => ({
    item_type: "regulation", domain: 1, created_at: i % 2 === 0 ? "2026-09-01T00:00:00Z" : "2026-09-02T00:00:00Z",
  }));
  const source = { id: "source-1", expected_output: { regulations: 0.1, research: 0.1, market: 0.7, operations: 0.05, out_of_scope: 0.05 } };
  const deps = fakeFamily5Deps({ flag: driftFlag(), source, items });
  const r = await autoResolveDriftFlag(deps, "drift-1", { execute: true });
  assert.equal(r.status, "resolved");
  assert.equal(r.adopted, true);
  assert.equal(deps.updateCalls.length, 1);
  assert.equal(deps.updateCalls[0].id, "source-1");
  assert.equal(deps.resolveCalls.length, 1);
});

test("autoResolveDriftFlag: insufficient sample resolves without writing the source", async () => {
  const source = { id: "source-1", expected_output: { regulations: 1, research: 0, market: 0, operations: 0, out_of_scope: 0 } };
  const deps = fakeFamily5Deps({ flag: driftFlag(), source, items: [] });
  const r = await autoResolveDriftFlag(deps, "drift-1", { execute: true });
  assert.equal(r.status, "resolved");
  assert.equal(r.adopted, false);
  assert.equal(deps.updateCalls.length, 0);
  assert.equal(deps.resolveCalls.length, 1);
  assert.match(deps.resolveCalls[0].note, /insufficient sample/);
});

test("autoResolveDriftFlag: dry run computes the decision but writes nothing", async () => {
  const source = { id: "source-1", expected_output: null };
  const deps = fakeFamily5Deps({ flag: driftFlag(), source, items: [] });
  const r = await autoResolveDriftFlag(deps, "drift-1", { execute: false });
  assert.equal(r.status, "dry_run");
  assert.equal(deps.updateCalls.length, 0);
  assert.equal(deps.resolveCalls.length, 0);
});

function anomalyFlag(overrides = {}) {
  return { id: "anomaly-1", created_by: ANOMALY_CREATED_BY, status: "open", subject_ref: "item-1", ...overrides };
}

test("retireAnomalyFlag: refuses a flag from the wrong namespace or the wrong status", async () => {
  const deps = fakeFamily5Deps({ flag: anomalyFlag({ created_by: CLASSIFY_CREATED_BY }) });
  assert.equal((await retireAnomalyFlag(deps, "anomaly-1", { execute: true })).status, "not_applicable");
  const deps2 = fakeFamily5Deps({ flag: anomalyFlag({ status: "resolved" }) });
  assert.equal((await retireAnomalyFlag(deps2, "anomaly-1", { execute: true })).status, "not_applicable");
});

test("retireAnomalyFlag: resolves an open anomaly flag unconditionally with the fixed retirement note", async () => {
  const deps = fakeFamily5Deps({ flag: anomalyFlag() });
  const r = await retireAnomalyFlag(deps, "anomaly-1", { execute: true });
  assert.equal(r.status, "resolved");
  assert.equal(r.resolvedNote, ANOMALY_RETIRED_NOTE);
  assert.equal(deps.resolveCalls.length, 1);
  assert.equal(deps.resolveCalls[0].note, ANOMALY_RETIRED_NOTE);
});

test("retireAnomalyFlag: dry run reports the note but writes nothing", async () => {
  const deps = fakeFamily5Deps({ flag: anomalyFlag() });
  const r = await retireAnomalyFlag(deps, "anomaly-1", { execute: false });
  assert.equal(r.status, "dry_run");
  assert.equal(deps.resolveCalls.length, 0);
});
