// ledger-onepass-audit.test.mjs -- DATA-1 (2026-10-11). Assertion B (per-type floor) failed the audit on 4
// verified items (g33, g20, 4a108d70, eu-battery-regulation-2023-1542) that hold a CRITICAL/HIGH FACT below
// their type floor. Migration 302 (operator ruling 2026-09-04, CLAUDE.md rule 18) made that a RATING, not a
// refusal: validate_item_provenance records it as a non-blocking warning, so those items are correctly verified.
// RED against the old code: the below-floor verified item produced fail=true. GREEN: it is rated and reported.
// Assertion A (stamp derivation) still fails. No jiti, no db: the pure pass is exercised on fixtures.
import { test } from "node:test";
import assert from "node:assert/strict";
import { assessLedger, FLOOR_MAX } from "./ledger-onepass-audit.mjs";

const resolver = { resolveSpan: () => ({ sourceId: null }) };
const sources = [
  { id: "s-t1", base_tier: 1, tier_override: null },
  { id: "s-t5", base_tier: 5, tier_override: null },
  { id: "s-t4-over", base_tier: 6, tier_override: 4 },
];
const searches = [{ id: "sr1", result_url: "https://x.example/a" }];
const item = (over) => ({ id: "i1", legacy_id: "g33", item_type: "regulation", priority: "CRITICAL", provenance_status: "verified", ...over });
const claim = (over) => ({ id: "c1234567-0000", intelligence_item_id: "i1", claim_kind: "FACT", source_id: "s-t5", source_tier_at_grounding: 5, search_result_id: "sr1", ...over });
const run = (items, claims) => assessLedger({ sources, searches, items, claims, resolver });

test("FLOOR_MAX mirrors the per-type floors", () => {
  assert.equal(FLOOR_MAX("regulation"), 2);
  assert.equal(FLOOR_MAX("research_finding"), 4);
  assert.equal(FLOOR_MAX("tool"), 5);
  assert.equal(FLOOR_MAX("market_signal"), null);
});

test("B: a verified regulation holding a T5 FACT (below its T2 floor) is RATED and reported, and the audit does NOT fail (migration 302)", () => {
  const r = run([item()], [claim()]);
  assert.equal(r.fail, false);
  assert.equal(r.stampDrift, 0);
  assert.deepEqual(r.ratedBelowFloor, [{ key: "g33", type: "regulation", below: 1, worstTier: 5, unrated: 0 }]);
  assert.equal(r.byType.regulation.belowFloorItems, 1);
});

test("B: a quarantined item with the same below-floor fact is not in the rated list; an exempt type or a LOW priority never counts", () => {
  assert.deepEqual(run([item({ provenance_status: "quarantined" })], [claim()]).ratedBelowFloor, []);
  assert.deepEqual(run([item({ item_type: "market_signal" })], [claim()]).ratedBelowFloor, []);
  assert.deepEqual(run([item({ priority: "LOW" })], [claim()]).ratedBelowFloor, []);
});

test("B: a fact within its floor is not rated; a FACT with no derivable tier is reported as unrated, still not a failure", () => {
  assert.deepEqual(run([item()], [claim({ source_id: "s-t1", source_tier_at_grounding: 1 })]).ratedBelowFloor, []);
  const r = run([item()], [claim({ source_id: null, source_tier_at_grounding: null })]);
  assert.deepEqual(r.ratedBelowFloor, [{ key: "g33", type: "regulation", below: 1, worstTier: null, unrated: 1 }]);
  assert.equal(r.fail, false);
});

test("A still fails the audit: a FACT stamp that differs from the source-derived tier, and a non-FACT carrying a stamp", () => {
  const drift = run([item()], [claim({ source_id: "s-t1", source_tier_at_grounding: 3 })]);
  assert.equal(drift.stampDrift, 1);
  assert.equal(drift.fail, true);
  const nonFact = run([item()], [claim({ claim_kind: "ANALYSIS", source_tier_at_grounding: 4 })]);
  assert.equal(nonFact.nonFactStamped, 1);
  assert.equal(nonFact.fail, true);
  assert.equal(run([item()], [claim({ claim_kind: "ANALYSIS", source_id: null, source_tier_at_grounding: null })]).fail, false);
});

test("the tier derives from COALESCE(tier_override, base_tier): an override makes a stamp agree", () => {
  const r = run([item({ item_type: "research_finding" })], [claim({ source_id: "s-t4-over", source_tier_at_grounding: 4 })]);
  assert.equal(r.stampDrift, 0);
  assert.deepEqual(r.ratedBelowFloor, []);
});
