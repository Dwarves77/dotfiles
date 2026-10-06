// research-assessment-producer.test.mjs -- pure-logic coverage for the producer's own orchestration
// (toAssessmentInput narrowing, hasChanged diffing, runResearchAssessmentProducer's plan/write split,
// decideApply's three-gate decision). No DB, no fetch -- the live-only halves (fetchLiveCandidates,
// fetchLiveCurrentByItemId) are deliberately NOT exercised here (they need real Supabase creds); see this
// file's own header for why that is an acceptable, named boundary rather than an untested branch.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toAssessmentInput,
  hasChanged,
  toRow,
  runResearchAssessmentProducer,
  resolveOpenAlexSourceRecords,
  decideApply,
  selectNeedingAssessment,
  fetchLiveCandidates,
  parseLimitArg,
  PRODUCER_NAME,
} from "./research-assessment-producer.mjs";
import {
  FIXTURE_CANDIDATES,
  FIXTURE_NOW,
  FIXTURE_OPENALEX_CANDIDATE,
  FIXTURE_OPENALEX_DOI,
  fixtureOpenAlexFetchStub,
} from "./fixtures/research-assessment-fixtures.mjs";
// F27 (producer-seam-proof): this file is the ONE proof that imports every first-party seam this
// producer composes TOGETHER -- the module graph alone (research-assessment-producer.mjs's own
// top-level import of assess.mjs) is not enough per that gate's own header ("a proof per module is
// not enough"). assessItem/writeProducerSummary/isResearchCandidate are exercised directly below,
// against the SAME fixture candidates runResearchAssessmentProducer (imported above) runs end to end,
// so the composition between all four modules is proven in one place, not four.
import { assessItem } from "../../../src/lib/research/assess.mjs";
import { writeProducerSummary } from "../lib/producer-summary.mjs";
import { isResearchCandidate } from "../../../src/lib/research/surface-candidate.mjs";

test("toAssessmentInput narrows a DB row shape into assess.mjs's AssessmentInput, joining title/what_is_it/why_matters/full_brief into text", () => {
  const input = toAssessmentInput({
    id: "x1",
    item_type: "research_finding",
    added_date: "2026-01-01",
    title: "Title",
    what_is_it: "What",
    why_matters: "Why",
    full_brief: "Brief",
    source_base_tier: 2,
    citation_count: 3,
    bias_tags: [{ dimension: "funding", tag: "x", confidence: null }],
    forward_events: [{ id: "e1", kind: "k", event_date: null, obligation_text: null, source_citation: null }],
  });
  assert.equal(input.id, "x1");
  assert.equal(input.text, "Title What Why Brief");
  assert.equal(input.sourceTier, 2);
  assert.equal(input.citationCount, 3);
  assert.equal(input.biasTags.length, 1);
  assert.equal(input.forwardEvents.length, 1);
});

test("toAssessmentInput defaults missing signals to honest null/empty, never invented", () => {
  const input = toAssessmentInput({ id: "x2", item_type: "technology", added_date: null, title: "T" });
  assert.equal(input.sourceTier, null);
  assert.equal(input.citationCount, null);
  assert.deepEqual(input.biasTags, []);
  assert.deepEqual(input.forwardEvents, []);
});

test("hasChanged is true when no current row exists (first assessment)", () => {
  assert.equal(hasChanged(null, { technicalMaturity: null, commercialMaturity: null, horizon: null, refusalReason: "x", credibilityEvidenceScore: null, statusToken: "HYPOTHESIS" }), true);
});

test("hasChanged is false when the current row already reflects an identical computed read", () => {
  const computed = {
    technicalMaturity: { low: 8, high: 9 },
    commercialMaturity: null,
    horizon: { band: "NEAR", rule: "R4", kind: "availability" },
    refusalReason: null,
    credibilityEvidenceScore: "medium",
    statusToken: "HYPOTHESIS",
  };
  const current = {
    technical_maturity_low: 8,
    technical_maturity_high: 9,
    commercial_maturity_low: null,
    commercial_maturity_high: null,
    horizon_band: "NEAR",
    horizon_rule: "R4",
    horizon_kind: "availability",
    refusal_reason: null,
    credibility_evidence_score: "medium",
    status_token: "HYPOTHESIS",
  };
  assert.equal(hasChanged(current, computed), false);
});

test("hasChanged is true when any scored field diverges from the current row", () => {
  const computed = {
    technicalMaturity: { low: 9, high: 10 }, // changed from 8-9
    commercialMaturity: null,
    horizon: { band: "NEAR", rule: "R4", kind: "availability" },
    refusalReason: null,
    credibilityEvidenceScore: "medium",
    statusToken: "HYPOTHESIS",
  };
  const current = {
    technical_maturity_low: 8,
    technical_maturity_high: 9,
    commercial_maturity_low: null,
    commercial_maturity_high: null,
    horizon_band: "NEAR",
    horizon_rule: "R4",
    horizon_kind: "availability",
    refusal_reason: null,
    credibility_evidence_score: "medium",
    status_token: "HYPOTHESIS",
  };
  assert.equal(hasChanged(current, computed), true);
});

test("toRow maps assessItem's output onto migration-344 column names, honest nulls preserved", () => {
  const row = toRow(
    {
      itemId: "it-1",
      technicalMaturity: null,
      commercialMaturity: null,
      horizon: null,
      refusalReason: "not forecastable",
      credibilityEvidenceScore: null,
      credibilityAuthorityScore: null,
      statusToken: "HYPOTHESIS",
    },
    { supersedes: "prior-id" },
  );
  assert.equal(row.item_id, "it-1");
  assert.equal(row.supersedes, "prior-id");
  assert.equal(row.is_current, true);
  assert.equal(row.technical_maturity_low, null);
  assert.equal(row.horizon_band, null);
  assert.equal(row.refusal_reason, "not forecastable");
  assert.equal(row.status_token, "HYPOTHESIS");
});

test("runResearchAssessmentProducer in dry mode never calls writeFn, even when every candidate changed", async () => {
  let calls = 0;
  const result = await runResearchAssessmentProducer({
    candidates: FIXTURE_CANDIDATES,
    currentByItemId: new Map(),
    mode: "dry",
    now: FIXTURE_NOW,
    deps: { writeFn: async () => { calls += 1; } },
  });
  assert.equal(calls, 0);
  assert.equal(result.metrics.written, 0);
  assert.equal(result.metrics.planned, 4);
  assert.equal(result.perItem.length, 4);
});

test("runResearchAssessmentProducer in apply mode calls writeFn once per changed candidate", async () => {
  let calls = 0;
  const seenRows = [];
  const result = await runResearchAssessmentProducer({
    candidates: FIXTURE_CANDIDATES,
    currentByItemId: new Map(),
    mode: "apply",
    now: FIXTURE_NOW,
    deps: {
      writeFn: async (row) => {
        calls += 1;
        seenRows.push(row);
      },
    },
  });
  assert.equal(calls, 4);
  assert.equal(result.metrics.written, 4);
  assert.ok(seenRows.every((r) => r.item_id));
});

test("runResearchAssessmentProducer skips unchanged candidates and writes nothing for them", async () => {
  const current = new Map([
    [
      "fixture-research-r4",
      {
        id: "existing-row-id",
        technical_maturity_low: 4,
        technical_maturity_high: 5,
        commercial_maturity_low: null,
        commercial_maturity_high: null,
        horizon_band: "FAR",
        horizon_rule: "R4",
        horizon_kind: "availability",
        refusal_reason: null,
        credibility_evidence_score: "limited",
        status_token: "HYPOTHESIS",
      },
    ],
  ]);
  let calls = 0;
  const result = await runResearchAssessmentProducer({
    candidates: FIXTURE_CANDIDATES,
    currentByItemId: current,
    mode: "apply",
    now: FIXTURE_NOW,
    deps: { writeFn: async () => { calls += 1; } },
  });
  assert.equal(calls, 3); // the other 3 fixtures still write; the r4 one (matching current exactly) does not
  assert.equal(result.metrics.unchanged, 1);
});

// ── Lane L3 (2026-10-02): the real OpenAlex-resolution step, offline via injected deps ─────────────

test("resolveOpenAlexSourceRecords makes NO network call when the item's text carries no DOI", async () => {
  let fetchCalled = false;
  const result = await resolveOpenAlexSourceRecords(
    { id: "x", text: "no identifier anywhere in this text" },
    { fetch: async () => { fetchCalled = true; } },
  );
  assert.deepEqual(result, []);
  assert.equal(fetchCalled, false);
});

test("resolveOpenAlexSourceRecords resolves a real-shaped record from the recorded fixture response, mapping raw snake_case onto the resolved-input shape", async () => {
  const [record] = await resolveOpenAlexSourceRecords(FIXTURE_OPENALEX_CANDIDATE, { fetch: fixtureOpenAlexFetchStub() });
  assert.equal(record.sourceId, `doi:${FIXTURE_OPENALEX_DOI}`);
  assert.equal(record.kind, "openalex");
  assert.equal(record.institution.displayName, "Harvard University");
  assert.equal(record.work.fwci, 48.9515);
  // The mapping-boundary finding this lane confirmed against a live fire: citation_normalized_percentile
  // is an OBJECT on the raw API, {value, ...} -- the mapped record must carry the extracted number, not
  // the raw object and not undefined.
  assert.equal(record.work.citationNormalizedPercentile, 0.99967102);
  assert.equal(record.work.isRetracted, false);
  assert.equal(record.funding, null); // grants parsing not resolved here -- honestly null, never guessed
});

test("resolveOpenAlexSourceRecords returns [] (never throws) when the resolved DOI 404s against the injected fetch", async () => {
  const input = { id: "x", text: "cites DOI 10.9999/does-not-exist for background." };
  const result = await resolveOpenAlexSourceRecords(input, { fetch: fixtureOpenAlexFetchStub() });
  assert.deepEqual(result, []);
});

test("runResearchAssessmentProducer wires the real OpenAlex record all the way into the planned row's credibility_authority_score, overriding the item's own vendor-tier stamp", async () => {
  const result = await runResearchAssessmentProducer({
    candidates: [FIXTURE_OPENALEX_CANDIDATE],
    currentByItemId: new Map(),
    mode: "dry",
    now: FIXTURE_NOW,
    deps: { openAlexDeps: { fetch: fixtureOpenAlexFetchStub() } },
  });
  assert.equal(result.plan.length, 1);
  const score = result.plan[0].credibility_authority_score;
  assert.ok(score, "credibility_authority_score must be populated");
  assert.equal(score.sources[0].roleClass, "university");
  // sourceTier 7 on FIXTURE_OPENALEX_CANDIDATE is a vendor-tier stamp on the ITEM; the real resolved
  // record must drive the result, never the degenerate tier fallback this lane replaced.
  assert.notEqual(score.vendorFlagged, 1);
});

test("runResearchAssessmentProducer with no openAlexDeps injected still runs the existing fixtures unchanged (default-safe, no network attempted)", async () => {
  const result = await runResearchAssessmentProducer({
    candidates: FIXTURE_CANDIDATES,
    currentByItemId: new Map(),
    mode: "dry",
    now: FIXTURE_NOW,
  });
  assert.equal(result.metrics.planned, 4); // unchanged from the pre-wiring count -- no DOI in any of these four
});

// ── decideApply: the three-gate decision (ADR-023 shape) ────────────────────────────────────────────

test("decideApply: no --apply is always a dry run regardless of other gates", () => {
  const d = decideApply({ apply: false, enabled: true, killSwitchOn: true, hasCreds: true });
  assert.equal(d.canWrite, false);
});

test("decideApply: --apply with ENABLED false refuses", () => {
  const d = decideApply({ apply: true, enabled: false, killSwitchOn: true, hasCreds: true });
  assert.equal(d.canWrite, false);
  assert.match(d.reason, /ENABLED constant is false/);
});

test("decideApply: --apply with kill switch off refuses", () => {
  const d = decideApply({ apply: true, enabled: true, killSwitchOn: false, hasCreds: true });
  assert.equal(d.canWrite, false);
  assert.match(d.reason, /kill switch/);
});

test("decideApply: --apply with no creds refuses", () => {
  const d = decideApply({ apply: true, enabled: true, killSwitchOn: true, hasCreds: false });
  assert.equal(d.canWrite, false);
  assert.match(d.reason, /DB creds/);
});

test("decideApply: all three gates satisfied allows the write", () => {
  const d = decideApply({ apply: true, enabled: true, killSwitchOn: true, hasCreds: true });
  assert.equal(d.canWrite, true);
});

// ── Lane RA-WF (2026-10-02): live candidate selection, closing rule 17's half-slice finding ──────────
// (this producer had a workflow but had never run against live candidates or landed a harness_runs row).

test("selectNeedingAssessment: excludes items that already have a current row", () => {
  const admitted = [{ id: "a1" }, { id: "a2" }, { id: "a3" }];
  const current = new Set(["a2"]);
  const result = selectNeedingAssessment(admitted, current, undefined);
  assert.deepEqual(result.map((r) => r.id), ["a1", "a3"]);
});

test("selectNeedingAssessment: bounds by limit after excluding current rows", () => {
  const admitted = [{ id: "a1" }, { id: "a2" }, { id: "a3" }];
  const result = selectNeedingAssessment(admitted, new Set(), 2);
  assert.deepEqual(result.map((r) => r.id), ["a1", "a2"]);
});

test("selectNeedingAssessment: no limit (undefined, 0, negative, NaN) is unbounded", () => {
  const admitted = [{ id: "a1" }, { id: "a2" }];
  for (const limit of [undefined, 0, -1, NaN]) {
    assert.equal(selectNeedingAssessment(admitted, new Set(), limit).length, 2, `limit=${limit}`);
  }
});

test("parseLimitArg: reads --limit N, ignores absence/garbage/non-positive", () => {
  assert.equal(parseLimitArg(["--live", "--limit", "5"]), 5);
  assert.equal(parseLimitArg(["--live"]), undefined);
  assert.equal(parseLimitArg(["--limit"]), undefined); // no value after the flag
  assert.equal(parseLimitArg(["--limit", "0"]), undefined);
  assert.equal(parseLimitArg(["--limit", "-3"]), undefined);
  assert.equal(parseLimitArg(["--limit", "abc"]), undefined);
});

/**
 * Minimal chainable Supabase mock for fetchLiveCandidates, same shape as db.test.mjs's own makeClient
 * (reused convention, not re-invented) but filtering on `eq`/`in` ops against an in-memory table map so
 * readAllByIds' chunked `.in()` reads resolve correctly without a database. `or`/`order`/`range`/`select`
 * are recorded but not used to filter -- this fake proves the SELECTION logic (which rows come back),
 * not PostgREST's own filter semantics.
 */
function makeFakeLiveClient(tables) {
  function matches(row, ops) {
    for (const op of ops) {
      if (op[0] === "eq" && row[op[1]] !== op[2]) return false;
      if (op[0] === "in" && !op[2].includes(row[op[1]])) return false;
    }
    return true;
  }
  function from(table) {
    const ops = [];
    const builder = {
      select(c) { ops.push(["select", c]); return builder; },
      or(c) { ops.push(["or", c]); return builder; },
      eq(c, v) { ops.push(["eq", c, v]); return builder; },
      in(c, v) { ops.push(["in", c, v]); return builder; },
      order(c) { ops.push(["order", c]); return builder; },
      range(a, z) { ops.push(["range", a, z]); return builder; },
      then(res, rej) {
        const all = tables[table] ?? [];
        const data = all.filter((row) => matches(row, ops));
        return Promise.resolve({ data, error: null }).then(res, rej);
      },
    };
    return builder;
  }
  return { from };
}

test("fetchLiveCandidates: with an injected client, scopes to admitted items lacking a current row", async () => {
  const client = makeFakeLiveClient({
    intelligence_items: [
      { id: "i1", item_type: "research_finding", domain: null, is_archived: false, provenance_status: "verified", title: "One", source_id: "s1" },
      { id: "i2", item_type: "research_finding", domain: null, is_archived: false, provenance_status: "verified", title: "Two", source_id: null },
      { id: "i3", item_type: "research_finding", domain: null, is_archived: false, provenance_status: "verified", title: "Three", source_id: null },
    ],
    research_assessments_current: [{ item_id: "i2" }], // i2 already has a current row
    sources: [{ id: "s1", base_tier: 2 }],
    item_forward_events: [],
  });
  const candidates = await fetchLiveCandidates({ client });
  assert.deepEqual(candidates.map((c) => c.id).sort(), ["i1", "i3"]); // i2 excluded
  const one = candidates.find((c) => c.id === "i1");
  assert.equal(one.sourceTier, 2); // joined from the sources table via source_id
});

test("fetchLiveCandidates: --limit bounds the live-candidate population lacking a current row", async () => {
  const client = makeFakeLiveClient({
    intelligence_items: [
      { id: "i1", item_type: "research_finding", domain: null, is_archived: false, provenance_status: "verified", title: "One", source_id: null },
      { id: "i2", item_type: "research_finding", domain: null, is_archived: false, provenance_status: "verified", title: "Two", source_id: null },
      { id: "i3", item_type: "research_finding", domain: null, is_archived: false, provenance_status: "verified", title: "Three", source_id: null },
    ],
    research_assessments_current: [],
    sources: [],
    item_forward_events: [],
  });
  const candidates = await fetchLiveCandidates({ client, limit: 1 });
  assert.equal(candidates.length, 1);
});

test("fetchLiveCandidates: a non-admitted item_type never reaches the output, even with no current row", async () => {
  const client = makeFakeLiveClient({
    intelligence_items: [
      { id: "i1", item_type: "regulation", domain: 2, is_archived: false, provenance_status: "verified", title: "Not research", source_id: null },
    ],
    research_assessments_current: [],
    sources: [],
    item_forward_events: [],
  });
  const candidates = await fetchLiveCandidates({ client });
  assert.deepEqual(candidates, []);
});

// ── F27 composition proof: assess.mjs + surface-candidate.mjs + producer-summary.mjs + the ──────────
// orchestrator all exercised TOGETHER, against the same fixture candidates, in one test. Proves real
// output from one module survives being fed into the next unchanged (the WO-17 defect class this gate
// exists to close): a candidate this lane's own surface_candidate rule would ADMIT to Research is
// exactly the set assessItem scores and runResearchAssessmentProducer plans a row for, and the run's
// own metrics survive being handed to writeProducerSummary without throwing.
test("F27 composition: surface-candidate admission, assess.mjs's ladder, and the orchestrator agree on the same fixture set", async () => {
  // Every fixture candidate is a research_finding or technology item -- surface-candidate.mjs's own
  // admission rule must agree these belong on Research, the same precondition the real producer's
  // fetchLiveCandidates() enforces before it ever calls assessItem.
  for (const c of FIXTURE_CANDIDATES) {
    assert.equal(isResearchCandidate(c.itemType, c.domain ?? null), true, `${c.id} should be surface-admitted`);
  }

  // assessItem (direct call) and the orchestrator's own per-item outcome must agree on which rule
  // fired -- proves the orchestrator is not silently dropping or reordering assess.mjs's output before
  // it reaches the plan (the "every layer green, nothing wired together" shape WO-17 shipped).
  const direct = FIXTURE_CANDIDATES.map((c) => assessItem(c, { now: FIXTURE_NOW }));
  const result = await runResearchAssessmentProducer({
    candidates: FIXTURE_CANDIDATES,
    currentByItemId: new Map(),
    mode: "dry",
    now: FIXTURE_NOW,
  });
  for (let i = 0; i < FIXTURE_CANDIDATES.length; i++) {
    const rule = direct[i].horizon?.rule ?? null;
    if (rule) assert.match(result.perItem[i].outcome, new RegExp(rule));
  }

  // writeProducerSummary (no PRODUCER_SUMMARY_DIR set, the default no-op path) must accept the run's
  // own metrics shape without throwing -- proves the orchestrator's output is seam-compatible with the
  // summary writer every other producer's CLI feeds it through.
  assert.doesNotThrow(() =>
    writeProducerSummary({ producer: PRODUCER_NAME, status: "ok", rows_changed: result.metrics.written, counts: result.metrics }),
  );
});

// ── Lane L4-D (2026-10-05): the assessment's dated expectation is written as a signposts row ─────────

const SP_NOW = new Date("2026-10-01T00:00:00Z");
const DATED = {
  id: "item-dated",
  itemType: "research_finding",
  addedDate: "2026-01-01",
  text: "ReFuelEU SAF blending steps apply to this route.",
  sourceTier: 2,
  citationCount: null,
  biasTags: [],
  entityId: "cl:instrument:00000000000000aa",
  forwardEvents: [{ id: "fe-1", kind: "obligation", event_date: "2027-01-01", obligation_text: "ReFuelEU SAF blending mandate takes effect.", source_citation: null }],
};

test("toAssessmentInput carries the item's instrument entity as entityId, null when it has none", () => {
  assert.equal(toAssessmentInput({ id: "a", item_type: "research_finding", instrument_entity_id: "cl:instrument:00000000000000aa" }).entityId, "cl:instrument:00000000000000aa");
  assert.equal(toAssessmentInput({ id: "a", item_type: "research_finding" }).entityId, null);
});

test("a fixture assessment with one dated expectation yields one signposts row, written once, and a re-run writes none", async () => {
  const written = [];
  const signposts = [];
  const existing = new Set();
  const deps = {
    writeFn: async (row) => { written.push(row); return { id: "assessment-uuid-1" }; },
    signpostFn: async (sp) => { signposts.push(sp); existing.add(sp.entity_id); },
    readExistingSignposts: async (ids) => ids.filter((id) => existing.has(id)),
  };
  const first = await runResearchAssessmentProducer({ candidates: [DATED], currentByItemId: new Map(), mode: "apply", now: SP_NOW, deps });
  assert.equal(signposts.length, 1);
  assert.equal(first.metrics.signposts_written, 1);
  const sp = signposts[0];
  assert.match(sp.entity_id, /^cl:signpost:[0-9a-f]{16}$/);
  assert.equal(sp.assessment_id, "assessment-uuid-1");
  assert.equal(sp.watches, "cl:instrument:00000000000000aa");
  assert.equal(sp.direction, "confirms");
  assert.equal(sp.predicate.op, "date_passed");
  assert.equal(sp.predicate.by, "2027-01-01");

  // Re-run over the same corpus state: the assessment is now current and unchanged, and the signpost exists.
  const current = new Map([[DATED.id, { id: "assessment-uuid-1", technical_maturity_low: null, technical_maturity_high: null, commercial_maturity_low: null, commercial_maturity_high: null, horizon_band: "NOW", horizon_rule: "R1", horizon_kind: "obligation", refusal_reason: null, credibility_evidence_score: null, status_token: "CONFIRMED" }]]);
  const second = await runResearchAssessmentProducer({ candidates: [DATED], currentByItemId: current, mode: "apply", now: SP_NOW, deps });
  assert.equal(second.metrics.unchanged, 1);
  assert.equal(second.metrics.signposts_planned, 0);
  assert.equal(second.metrics.signposts_written, 0);
  assert.equal(signposts.length, 1);
});

test("a signpost lost to a crash after its assessment was written is planned again on the next run (the assessment is unchanged)", async () => {
  const signposts = [];
  const current = new Map([[DATED.id, { id: "assessment-uuid-1", technical_maturity_low: null, technical_maturity_high: null, commercial_maturity_low: null, commercial_maturity_high: null, horizon_band: "NOW", horizon_rule: "R1", horizon_kind: "obligation", refusal_reason: null, credibility_evidence_score: null, status_token: "CONFIRMED" }]]);
  const result = await runResearchAssessmentProducer({
    candidates: [DATED], currentByItemId: current, mode: "apply", now: SP_NOW,
    deps: { writeFn: async () => { throw new Error("not called: unchanged"); }, signpostFn: async (sp) => { signposts.push(sp); }, readExistingSignposts: async () => [] },
  });
  assert.equal(signposts.length, 1);
  assert.equal(signposts[0].assessment_id, "assessment-uuid-1");
  assert.equal(result.metrics.signposts_written, 1);
});

test("dry mode plans the signpost and writes nothing anywhere", async () => {
  let writes = 0;
  const result = await runResearchAssessmentProducer({
    candidates: [DATED], currentByItemId: new Map(), mode: "dry", now: SP_NOW,
    deps: { writeFn: async () => { writes += 1; }, signpostFn: async () => { writes += 1; }, readExistingSignposts: async () => [] },
  });
  assert.equal(writes, 0);
  assert.equal(result.metrics.signposts_planned, 1);
  assert.equal(result.metrics.signposts_written, 0);
  assert.equal(result.signpostPlan.length, 1);
});

test("an assessment write that returns no id leaves its signpost unwritten and counted, never guessed", async () => {
  const signposts = [];
  const result = await runResearchAssessmentProducer({
    candidates: [DATED], currentByItemId: new Map(), mode: "apply", now: SP_NOW,
    deps: { writeFn: async () => {}, signpostFn: async (sp) => { signposts.push(sp); }, readExistingSignposts: async () => [] },
  });
  assert.equal(signposts.length, 0);
  assert.equal(result.metrics.signposts_skipped_no_assessment_id, 1);
});

test("a candidate with no entity or no dated anchor plans no signpost", async () => {
  const result = await runResearchAssessmentProducer({
    candidates: [{ ...DATED, id: "no-entity", entityId: null }, ...FIXTURE_CANDIDATES], currentByItemId: new Map(), mode: "dry", now: SP_NOW,
    deps: { readExistingSignposts: async () => [] },
  });
  assert.equal(result.metrics.signposts_planned, 0);
});
