import { test } from "node:test";
import assert from "node:assert/strict";
import {
  selectAssessmentView,
  selectAssessmentViewsByItemId,
  horizonMetaLabel,
  technicalMaturityLabel,
  commercialMaturityLabel,
  refusalDisplayText,
  ASSUMPTION_SHIFT_ABSENCE,
  formatAssumptionShift,
} from "./read-assessments.mjs";
import { isAtRisk } from "../assumptions/contract.mjs";

function row(overrides = {}) {
  return {
    item_id: "item-1",
    technical_maturity_low: null,
    technical_maturity_high: null,
    technical_maturity_method: null,
    commercial_maturity_low: null,
    commercial_maturity_high: null,
    commercial_maturity_method: null,
    horizon_kind: null,
    horizon_band: null,
    horizon_rule: null,
    horizon_confidence: null,
    horizon_trigger_note: null,
    refusal_reason: "not forecastable",
    credibility_evidence_score: null,
    credibility_authority_score: null,
    status_token: "HYPOTHESIS",
    computed_at: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}

test("selectAssessmentView returns null for no row (honest absence)", () => {
  assert.equal(selectAssessmentView(null), null);
  assert.equal(selectAssessmentView(undefined), null);
});

test("selectAssessmentView maps a refusal row: horizon null, isRefusal true", () => {
  const view = selectAssessmentView(row());
  assert.equal(view.horizon, null);
  assert.equal(view.isRefusal, true);
  assert.equal(view.refusalReason, "not forecastable");
});

test("selectAssessmentView maps a scored row: maturity corridors + horizon all present", () => {
  const view = selectAssessmentView(
    row({
      technical_maturity_low: 8,
      technical_maturity_high: 9,
      technical_maturity_method: "read from text",
      horizon_kind: "obligation",
      horizon_band: "NOW",
      horizon_rule: "R1",
      horizon_confidence: "high",
      horizon_trigger_note: "binds 2027-01-01",
      refusal_reason: null,
      status_token: "CONFIRMED",
    }),
  );
  assert.deepEqual(view.technicalMaturity, { low: 8, high: 9, method: "read from text" });
  assert.equal(view.commercialMaturity, null);
  assert.deepEqual(view.horizon, { kind: "obligation", band: "NOW", rule: "R1", confidence: "high", triggerNote: "binds 2027-01-01" });
  assert.equal(view.isRefusal, false);
  assert.equal(view.statusToken, "CONFIRMED");
});

test("selectAssessmentViewsByItemId batches rows into a Map keyed by item_id, dropping null rows", () => {
  const map = selectAssessmentViewsByItemId([row({ item_id: "a" }), row({ item_id: "b" }), null]);
  assert.equal(map.size, 2);
  assert.ok(map.has("a"));
  assert.ok(map.has("b"));
});

test("horizonMetaLabel null for a refusal, formatted for a scored horizon", () => {
  assert.equal(horizonMetaLabel(selectAssessmentView(row())), null);
  const scored = selectAssessmentView(row({ horizon_band: "NEAR", horizon_rule: "R4", horizon_kind: "availability", refusal_reason: null }));
  assert.equal(horizonMetaLabel(scored), "NEAR horizon (R4)");
});

test("technicalMaturityLabel / commercialMaturityLabel format a corridor, collapse a point reading, null on absence", () => {
  assert.equal(technicalMaturityLabel(null), null);
  const withCorridor = selectAssessmentView(row({ technical_maturity_low: 4, technical_maturity_high: 5 }));
  assert.equal(technicalMaturityLabel(withCorridor), "TRL 4-5");
  const point = selectAssessmentView(row({ commercial_maturity_low: 6, commercial_maturity_high: 6 }));
  assert.equal(commercialMaturityLabel(point), "CRI 6");
});

test("refusalDisplayText prefers the real reason, falls back to a generic honest string", () => {
  assert.equal(refusalDisplayText("not forecastable: no dated evidence"), "not forecastable: no dated evidence");
  assert.match(refusalDisplayText(null), /not forecastable/);
});

test("ASSUMPTION_SHIFT_ABSENCE names what is needed, never a fabricated assumption", () => {
  assert.match(ASSUMPTION_SHIFT_ABSENCE, /planning assumption registered/);
});

// ── planning-assumption shift, wired to lane W2-R2's real reader (2026-10-02) ───────────────────────

/** One load-bearing, vulnerable (= at-risk) assumption, shaped exactly like read.ts's AssumptionRow
 *  (camelCase, the real GET /api/workspace/assumptions response shape) -- the fixture the coordinator
 *  asked for. */
function atRiskAssumptionFixture(overrides = {}) {
  return {
    id: "assumption-1",
    orgId: "org-1",
    name: "Frankfurt-Milan express road linehaul stays diesel-costed through 2030",
    valueNumeric: 34,
    unit: "% of quoted margin",
    boundTo: "34% of quoted margin on EU road",
    loadBearing: true,
    vulnerable: true,
    reviewDate: "2026-12-01",
    sourceNote: "Contract renewal cycle, EU road tender Q4.",
    status: "active",
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

test("isAtRisk (reused from src/lib/assumptions/contract.mjs, never re-implemented) admits the fixture", () => {
  const a = atRiskAssumptionFixture();
  assert.equal(isAtRisk(a), true);
});

test("formatAssumptionShift renders name, boundTo, the quantified value, and the review date for a real at-risk assumption", () => {
  const line = formatAssumptionShift(atRiskAssumptionFixture());
  assert.match(line, /Frankfurt-Milan express road linehaul stays diesel-costed through 2030/);
  assert.match(line, /34% of quoted margin on EU road/);
  assert.match(line, /\(34 % of quoted margin\)/);
  assert.match(line, /review by 2026-12-01/);
});

test("formatAssumptionShift omits the quantified segment when valueNumeric is null, never inventing a figure", () => {
  const line = formatAssumptionShift(atRiskAssumptionFixture({ valueNumeric: null, unit: null }));
  assert.doesNotMatch(line, /\(/);
  assert.match(line, /review by 2026-12-01/);
});

test("a load-bearing-but-not-vulnerable assumption is correctly excluded by isAtRisk (the shift needs both)", () => {
  const a = atRiskAssumptionFixture({ vulnerable: false });
  assert.equal(isAtRisk(a), false);
});
