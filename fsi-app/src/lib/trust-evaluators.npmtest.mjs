// @ts-check
// RD-14 GOLDEN CONTRACT TESTS for the four trust EVALUATORS (Ruling 1: WIRE — these are Unit 1's autonomous
// promotion/demotion/provisional-triage decision core). Line-read-is-not-verification: they ship with a
// table-driven behavioral contract before Unit 1's first live verdict. jiti imports the TS home (@/types alias).
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { evaluatePromotion, evaluateDemotion, evaluateProvisionalSource } =
  await jiti.import("./trust.ts");

const OLD = "2020-01-01T00:00:00Z"; // far past → age + last_accessible satisfied
const source = (over = {}) => ({
  base_tier: 7,
  created_at: over.created_at ?? OLD,
  trust_score: { overall: 100, ...(over.trust_score || {}) },
  trust_metrics: {
    confirmation_count: 100, conflict_count: 0, conflict_total: 0, independent_citers: 10,
    accessibility_rate: 1.0, lead_time_samples: 100, last_accessible: OLD, total_checks: 100,
    ...(over.trust_metrics || {}),
  },
  ...(over.base_tier ? { base_tier: over.base_tier } : {}),
});

// ── evaluatePromotion — ALL-criteria model ──
test("promotion: T1 cannot promote further → null", () => {
  assert.equal(evaluatePromotion(source({ base_tier: 1 })), null);
});
test("promotion: T7 meeting ALL 7→6 criteria → eligible for T6, blocking empty", () => {
  const r = evaluatePromotion(source({ base_tier: 7 }));
  assert.ok(r && r.eligible === true, "eligible");
  assert.equal(r.target_tier, 6);
  assert.deepEqual(r.blocking, []);
});
test("promotion: T7 failing criteria → NOT eligible, blocking populated (ALL means one miss blocks)", () => {
  const r = evaluatePromotion(source({
    base_tier: 7, created_at: new Date().toISOString(), trust_score: { overall: 0 },
    trust_metrics: { confirmation_count: 0, conflict_count: 0, conflict_total: 0, independent_citers: 0, accessibility_rate: 0, lead_time_samples: 0, last_accessible: OLD, total_checks: 0 },
  }));
  assert.equal(r.eligible, false);
  assert.ok(r.blocking.length >= 1, "at least one blocking reason");
});

// ── evaluateDemotion — ANY-trigger model ──
test("demotion: a clean T4 source → not triggered, tier held", () => {
  const r = evaluateDemotion(source({ base_tier: 4, trust_metrics: { conflict_count: 0, conflict_total: 0, accessibility_rate: 1.0, total_checks: 3, last_accessible: new Date().toISOString(), confirmation_count: 10, independent_citers: 5, lead_time_samples: 5 } }));
  assert.equal(r.triggered, false);
  assert.deepEqual(r.triggers_fired, []);
  assert.equal(r.recommended_tier, 4);
});
test("demotion: T4 losing >30% of disputes → high_conflict fires (ANY trigger → triggered)", () => {
  const r = evaluateDemotion(source({ base_tier: 4, trust_metrics: { conflict_count: 3, conflict_total: 5, accessibility_rate: 1.0, total_checks: 3, last_accessible: new Date().toISOString(), confirmation_count: 10, independent_citers: 5, lead_time_samples: 5 } }));
  assert.equal(r.triggered, true);
  assert.ok(r.triggers_fired.some((t) => t.trigger.trigger === "high_conflict_rate"));
  assert.equal(r.recommended_tier, 5); // one step down
});

// ── evaluateProvisionalSource — Unit 1's decision core ──
const ps = (over = {}) => ({ accessibility_verified: true, entity_identified: true, independent_citers: 0, highest_citing_tier: 7, publishes_structured_content: true, citation_count: 0, ...over });
test("provisional: unverified URL → needs_more_data (not ready)", () => {
  const r = evaluateProvisionalSource(ps({ accessibility_verified: false }));
  assert.equal(r.ready_for_review, false);
  assert.equal(r.recommended_action, "needs_more_data");
});
test("provisional: 3+ citers, highest ≤T2 → confirm at T5", () => {
  const r = evaluateProvisionalSource(ps({ independent_citers: 3, highest_citing_tier: 2 }));
  assert.equal(r.recommended_action, "confirm");
  assert.equal(r.recommended_tier, 5);
});
test("provisional: 1 citer → confirm at T6", () => {
  const r = evaluateProvisionalSource(ps({ independent_citers: 1, highest_citing_tier: 4 }));
  assert.equal(r.recommended_action, "confirm");
  assert.equal(r.recommended_tier, 6);
});
test("provisional: citations but zero INDEPENDENT (echo chamber) → reject", () => {
  const r = evaluateProvisionalSource(ps({ citation_count: 5, independent_citers: 0 }));
  assert.equal(r.recommended_action, "reject");
  assert.equal(r.recommended_tier, 7);
});
