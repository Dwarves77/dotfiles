import { test } from "node:test";
import assert from "node:assert/strict";
import { validateResponseValue, evaluateResponseSubmission, FIELD_BOUNDS } from "./respond.mjs";
import { aggregateBenchmarkResponses } from "./benchmark.mjs";

// ── validateResponseValue ───────────────────────────────────────────────────────────────────────

test("validateResponseValue: accepts an in-bounds value for a registered field", () => {
  assert.deepEqual(validateResponseValue(4.5, "saf_premium_pct"), { ok: true });
  assert.deepEqual(validateResponseValue(3200, "rate_per_feu"), { ok: true });
});

test("validateResponseValue: rejects a non-finite or non-numeric value", () => {
  assert.equal(validateResponseValue(NaN, "saf_premium_pct").ok, false);
  assert.equal(validateResponseValue(Infinity, "saf_premium_pct").ok, false);
  assert.equal(validateResponseValue("4.5", "saf_premium_pct").ok, false);
  assert.equal(validateResponseValue(undefined, "saf_premium_pct").ok, false);
});

test("validateResponseValue: rejects a negative value", () => {
  const r = validateResponseValue(-1, "rate_per_feu");
  assert.equal(r.ok, false);
  assert.match(r.error, /non-negative/);
});

test("validateResponseValue: rejects a value above the field's registered ceiling (fat-finger guard)", () => {
  const r = validateResponseValue(50_000_000, "rate_per_feu"); // a plausible decimal-point slip
  assert.equal(r.ok, false);
  assert.match(r.error, /between/);
});

test("validateResponseValue: rejects a value above 100 for a percentage field", () => {
  const r = validateResponseValue(150, "saf_premium_pct");
  assert.equal(r.ok, false);
});

test("validateResponseValue: rejects an unregistered field_key rather than silently accepting", () => {
  const r = validateResponseValue(10, "not_a_real_field");
  assert.equal(r.ok, false);
  assert.match(r.error, /no registered value bounds/);
});

test("FIELD_BOUNDS covers every field_key migration 294's CHECK constraint allows", () => {
  for (const key of ["rate_per_feu", "wage_per_hour", "capacity_teu", "saf_premium_pct", "pricing"]) {
    assert.ok(FIELD_BOUNDS[key], `${key} must have registered bounds`);
  }
});

// ── evaluateResponseSubmission ──────────────────────────────────────────────────────────────────

const VERIFIED_ORG = { organisationKey: "abc123", refused: false, reason: null };
const UNVERIFIED = { organisationKey: null, refused: true, reason: "verify a corporate email first" };

test("evaluateResponseSubmission: refuses an unverified member before checking anything else", () => {
  const r = evaluateResponseSubmission({
    organisationKeyResult: UNVERIFIED,
    instrumentOpen: true,
    instrumentStatus: "open",
    value: 4.5,
    fieldKey: "saf_premium_pct",
  });
  assert.equal(r.accepted, false);
  assert.match(r.reason, /unverified/);
  assert.match(r.reason, /verify a corporate email first/);
});

test("evaluateResponseSubmission: refuses a closed instrument even for a verified member with a valid value", () => {
  const r = evaluateResponseSubmission({
    organisationKeyResult: VERIFIED_ORG,
    instrumentOpen: false,
    instrumentStatus: "closed",
    value: 4.5,
    fieldKey: "saf_premium_pct",
  });
  assert.equal(r.accepted, false);
  assert.match(r.reason, /closed/);
});

test("evaluateResponseSubmission: refuses an out-of-bounds value for an otherwise-eligible member", () => {
  const r = evaluateResponseSubmission({
    organisationKeyResult: VERIFIED_ORG,
    instrumentOpen: true,
    instrumentStatus: "open",
    value: -5,
    fieldKey: "saf_premium_pct",
  });
  assert.equal(r.accepted, false);
  assert.match(r.reason, /out of bounds/);
});

test("evaluateResponseSubmission: accepts a verified, in-window, in-bounds submission", () => {
  const r = evaluateResponseSubmission({
    organisationKeyResult: VERIFIED_ORG,
    instrumentOpen: true,
    instrumentStatus: "open",
    value: 4.5,
    fieldKey: "saf_premium_pct",
  });
  assert.deepEqual(r, { accepted: true });
});

// ── k-anonymity refusal path (spec 05 §1), proven end to end through the SAME aggregation function the
// respond route reuses (aggregateBenchmarkResponses, benchmark.mjs) rather than a second
// reimplementation — dispatch item 5: "4 organisations -> not publishable; 5 balanced -> publishable". ──

test("k-anonymity boundary: 4 distinct organisations, balanced values, is NOT publishable", () => {
  const instrument = { key: "saf-premium-air-2026-q3", periodEnd: "2026-01-01" };
  const responses = ["org-a", "org-b", "org-c", "org-d"].map((organisationKey) => ({
    organisationKey,
    valueNumeric: 4.0,
    submittedAt: "2025-12-01",
  }));
  const r = aggregateBenchmarkResponses(instrument, responses, new Date("2026-09-03"));
  assert.equal(r.distinctOrganisations, 4);
  assert.equal(r.publishable, false);
  assert.match(r.reason, /k-anonymity/);
  assert.equal(r.value, null, "no point estimate is ever shown while ungated");
});

test("k-anonymity boundary: 5 distinct organisations, balanced values, IS publishable", () => {
  const instrument = { key: "saf-premium-air-2026-q3", periodEnd: "2026-01-01" };
  const responses = ["org-a", "org-b", "org-c", "org-d", "org-e"].map((organisationKey) => ({
    organisationKey,
    valueNumeric: 4.0,
    submittedAt: "2025-12-01",
  }));
  const r = aggregateBenchmarkResponses(instrument, responses, new Date("2026-09-03"));
  assert.equal(r.distinctOrganisations, 5);
  assert.equal(r.publishable, true);
  assert.equal(r.value, 4.0);
  assert.equal(r.reason, null);
});
