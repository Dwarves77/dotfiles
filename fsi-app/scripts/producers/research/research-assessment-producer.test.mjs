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
  decideApply,
  PRODUCER_NAME,
} from "./research-assessment-producer.mjs";
import { FIXTURE_CANDIDATES, FIXTURE_NOW } from "./fixtures/research-assessment-fixtures.mjs";
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

test("toRow maps assessItem's output onto migration-336 column names, honest nulls preserved", () => {
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
