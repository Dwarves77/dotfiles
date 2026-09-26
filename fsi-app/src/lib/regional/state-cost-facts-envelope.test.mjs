import test from "node:test";
import assert from "node:assert/strict";
import {
  isVerbatimSpan,
  groundCandidate,
  originClassForTier,
  buildStateCostFactRow,
  naturalKey,
  planUpsert,
} from "./state-cost-facts-envelope.mjs";

test("isVerbatimSpan: exact substring matches", () => {
  assert.equal(isVerbatimSpan("The minimum wage in California is $16.00 per hour.", "$16.00 per hour"), true);
});

test("isVerbatimSpan: whitespace-insensitive (newlines/collapsed spaces) still matches", () => {
  const capture = "The minimum   wage\nin California is $16.00\nper hour, effective 2026-01-01.";
  assert.equal(isVerbatimSpan(capture, "minimum wage in California is $16.00 per hour"), true);
});

test("isVerbatimSpan: refuses a span not actually present (paraphrase)", () => {
  assert.equal(isVerbatimSpan("California's minimum wage rose to $16.00 per hour.", "wage is now sixteen dollars"), false);
});

test("isVerbatimSpan: empty span never matches", () => {
  assert.equal(isVerbatimSpan("anything at all", ""), false);
});

test("groundCandidate: ok when span is verbatim in the capture", () => {
  const candidate = { span_text: "$16.00 per hour" };
  const result = groundCandidate(candidate, "The minimum wage is $16.00 per hour statewide.");
  assert.deepEqual(result, { ok: true });
});

test("groundCandidate: refuses when span_text is missing (ungrounded figure)", () => {
  const result = groundCandidate({}, "some capture text");
  assert.equal(result.ok, false);
  assert.match(result.reason, /no span_text/);
});

test("groundCandidate: refuses when no capture text exists for the source", () => {
  const result = groundCandidate({ span_text: "$16.00 per hour" }, null);
  assert.equal(result.ok, false);
  assert.match(result.reason, /no capture text/);
});

test("groundCandidate: refuses a span that is not verbatim in the capture (paraphrase / hallucination guard)", () => {
  const result = groundCandidate(
    { span_text: "wage will rise to twenty dollars" },
    "The minimum wage is $16.00 per hour statewide.",
  );
  assert.equal(result.ok, false);
  assert.match(result.reason, /not a verbatim/);
});

test("originClassForTier: T1-T3 -> official (direct analogy to regional-facts-envelope.mjs)", () => {
  assert.equal(originClassForTier(1), "official");
  assert.equal(originClassForTier(2), "official");
  assert.equal(originClassForTier(3), "official");
});

test("originClassForTier: T4 -> verified", () => {
  assert.equal(originClassForTier(4), "verified");
});

test("originClassForTier: weaker tiers and unclassifiable (null) -> null, never invented", () => {
  assert.equal(originClassForTier(5), null);
  assert.equal(originClassForTier(7), null);
  assert.equal(originClassForTier(null), null);
  assert.equal(originClassForTier(undefined), null);
});

test("buildStateCostFactRow: shapes a full row with source + rating, no envelope columns invented", () => {
  const candidate = {
    state_code: "US-CA",
    state_label: "California",
    dimension: "labor_markets",
    fact_label: "State minimum wage",
    value: "16.00",
    unit: "USD/hour",
    trend: "up",
    effective_date: "2026-01-01",
    statute_citation: "Cal. Labor Code section  1182.12",
  };
  const row = buildStateCostFactRow(candidate, { source_id: "src-1", tier: 2 }, "region-us-id");
  assert.deepEqual(row, {
    region_id: "region-us-id",
    state_code: "US-CA",
    state_label: "California",
    dimension: "labor_markets",
    fact_label: "State minimum wage",
    value: "16.00",
    unit: "USD/hour",
    trend: "up",
    source_id: "src-1",
    statute_citation: "Cal. Labor Code section  1182.12",
    effective_date: "2026-01-01",
    origin_class: "official",
  });
});

test("naturalKey: matches the live UNIQUE(state_code, dimension, fact_label) constraint", () => {
  assert.equal(
    naturalKey({ state_code: "US-CA", dimension: "labor_markets", fact_label: "State minimum wage" }),
    "US-CA|labor_markets|State minimum wage",
  );
});

test("planUpsert: new natural key -> insert", () => {
  const candidate = { state_code: "US-CA", dimension: "labor_markets", fact_label: "State minimum wage", value: "16.00" };
  const plan = planUpsert([], [candidate]);
  assert.deepEqual(plan.toInsert, [candidate]);
  assert.deepEqual(plan.toUpdate, []);
  assert.equal(plan.unchanged, 0);
});

test("planUpsert: same key, changed value -> update patch", () => {
  const existing = { id: "row-1", state_code: "US-CA", dimension: "labor_markets", fact_label: "State minimum wage", value: "15.00", unit: "USD/hour", trend: null, source_id: "src-1", statute_citation: null, effective_date: null, origin_class: "official" };
  const candidate = { ...existing, value: "16.00" };
  delete candidate.id;
  const plan = planUpsert([existing], [candidate]);
  assert.equal(plan.toInsert.length, 0);
  assert.equal(plan.toUpdate.length, 1);
  assert.equal(plan.toUpdate[0].id, "row-1");
  assert.equal(plan.toUpdate[0].patch.value, "16.00");
});

test("planUpsert: same key, identical fields -> unchanged, no write", () => {
  const existing = { id: "row-1", state_code: "US-CA", dimension: "labor_markets", fact_label: "State minimum wage", value: "16.00", unit: "USD/hour", trend: null, source_id: "src-1", statute_citation: null, effective_date: null, origin_class: "official" };
  const candidate = { ...existing };
  delete candidate.id;
  const plan = planUpsert([existing], [candidate]);
  assert.equal(plan.toInsert.length, 0);
  assert.equal(plan.toUpdate.length, 0);
  assert.equal(plan.unchanged, 1);
});
