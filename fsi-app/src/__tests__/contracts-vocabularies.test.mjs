// Proof for the six shared vocabularies (Track F1, 2026-08-12).
//
// Run standalone:
//   node --experimental-strip-types --test fsi-app/src/__tests__/contracts-vocabularies.test.mjs
// Covered by the `fsi-app/src/__tests__/*.test.mjs` glob in run-test-suite.sh, so it is
// execution-wired rather than an F23 orphaned proof.
//
// WHAT THIS LOCKS. The vocabularies are the one home for what a value MEANS on every surface. The
// defects they exist to prevent are all live in the product today: counts and rows classified by two
// different populations, ~17 UI fields bound to absent producers rendering permanent dashes, and an
// Operations severity chip derived from the worst REGULATION in a region. Each is a value whose
// meaning was decided at the render site. These tests assert the properties that make one central
// definition safe to depend on: frozen, totally ordered, non-colliding, and correct on the two
// propagation rules the specs state repeatedly.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OBS_STATUS, isMissing,
  ORIGIN_CLASS, ORIGIN_CLASSES, weakestOriginClass, citableAsFact, admissibleInCalculation,
  SOURCE_RELIABILITY, INFO_CREDIBILITY, admiraltyCode, admiraltyToBand,
  PEDIGREE_AXES, validatePedigree, pedigreeToBand, CONFIDENCE_BAND,
  LIKELIHOOD, likelihoodForProbability,
  IMPACT, APPLICABILITY, BINDING_POSITION, FRESHNESS,
  RELATION, inverseRelation,
  VOCABULARIES, isValid, orderedValues,
} from "../lib/contracts/vocabularies.mjs";

// ── structural invariants, applied to every vocabulary ────────────────────

test("every vocabulary is frozen, and so is every entry", () => {
  for (const [name, vocab] of Object.entries(VOCABULARIES)) {
    assert.ok(Object.isFrozen(vocab), `${name} must be frozen`);
    for (const [k, entry] of Object.entries(vocab)) {
      assert.ok(Object.isFrozen(entry), `${name}.${k} must be frozen`);
    }
  }
});

test("every entry's code matches its key, so lookups cannot silently disagree", () => {
  for (const [name, vocab] of Object.entries(VOCABULARIES)) {
    for (const [k, entry] of Object.entries(vocab)) {
      assert.equal(entry.code, k, `${name}.${k} code mismatch`);
    }
  }
});

test("every entry carries a label and an order", () => {
  for (const [name, vocab] of Object.entries(VOCABULARIES)) {
    for (const [k, entry] of Object.entries(vocab)) {
      assert.equal(typeof entry.label, "string", `${name}.${k} needs a label`);
      assert.ok(entry.label.length > 0, `${name}.${k} label must be non-empty`);
      const hasOrder = typeof entry.order === "number" || typeof entry.strength === "number";
      assert.ok(hasOrder, `${name}.${k} needs an order or strength`);
    }
  }
});

test("orderedValues returns declared display order for every vocabulary", () => {
  for (const name of Object.keys(VOCABULARIES)) {
    const vals = orderedValues(name);
    assert.ok(vals.length > 0, `${name} must be non-empty`);
    for (let i = 1; i < vals.length; i++) {
      assert.ok((vals[i].order ?? 0) >= (vals[i - 1].order ?? 0), `${name} not ordered at index ${i}`);
    }
  }
});

test("isValid accepts every member and rejects non-members", () => {
  for (const [name, vocab] of Object.entries(VOCABULARIES)) {
    for (const k of Object.keys(vocab)) assert.ok(isValid(name, k), `${name}.${k}`);
    assert.equal(isValid(name, "__not_a_member__"), false);
  }
  assert.equal(isValid("__no_such_vocab__", "anything"), false);
});

// ── obs_status ───────────────────────────────────────────────────────────

test("obs_status: missing family is exactly the absent codes", () => {
  const missing = Object.values(OBS_STATUS).filter((e) => !e.isPresent).map((e) => e.code).sort();
  assert.deepEqual(missing, ["H", "L", "M", "N", "O", "Q"]);
});

test("isMissing: absent codes are missing, present codes are not, unknown is missing", () => {
  for (const c of ["M", "O", "L", "H", "Q", "N"]) assert.equal(isMissing(c), true, c);
  for (const c of ["A", "P", "E", "I", "F", "B"]) assert.equal(isMissing(c), false, c);
  // Unknown fails to missing: an unrecognised status must never read as a good observation.
  assert.equal(isMissing("__unknown__"), true);
  assert.equal(isMissing(undefined), true);
});

// ── origin_class: the propagation rule ───────────────────────────────────

test("origin_class strengths are unique and totally ordered", () => {
  const s = ORIGIN_CLASSES.map((c) => ORIGIN_CLASS[c].strength);
  assert.equal(new Set(s).size, s.length, "strengths must be unique for a total order");
});

test("community is weakest, official is strongest", () => {
  const sorted = ORIGIN_CLASSES.slice().sort((a, b) => ORIGIN_CLASS[a].strength - ORIGIN_CLASS[b].strength);
  assert.equal(sorted[0], "community");
  assert.equal(sorted[sorted.length - 1], "official");
});

test("weakestOriginClass propagates to the weakest constituent", () => {
  assert.equal(weakestOriginClass(["official", "verified", "modelled"]), "modelled");
  assert.equal(weakestOriginClass(["official", "official"]), "official");
  assert.equal(weakestOriginClass(["verified", "community"]), "community");
  assert.equal(weakestOriginClass(["derived", "partner", "community-corroborated"]), "community-corroborated");
});

test("weakestOriginClass is commutative over every ordered pair", () => {
  for (const a of ORIGIN_CLASSES) {
    for (const b of ORIGIN_CLASSES) {
      assert.equal(weakestOriginClass([a, b]), weakestOriginClass([b, a]), `${a},${b}`);
    }
  }
});

test("weakestOriginClass is idempotent and total over singletons", () => {
  for (const c of ORIGIN_CLASSES) assert.equal(weakestOriginClass([c]), c);
});

test("an unknown constituent fails to the weakest class, never silently dropped", () => {
  assert.equal(weakestOriginClass(["official", "__mystery__"]), "community");
});

test("an empty aggregate has no origin_class rather than a default", () => {
  // Returning a default here would invent provenance out of nothing.
  assert.equal(weakestOriginClass([]), null);
  assert.equal(weakestOriginClass(null), null);
});

test("community is never citable as fact and never admissible in a calculation", () => {
  for (const c of ["community", "community-corroborated"]) {
    assert.equal(citableAsFact(c), false, c);
    assert.equal(admissibleInCalculation(c), false, c);
  }
  assert.equal(citableAsFact("official"), true);
  assert.equal(admissibleInCalculation("derived"), true);
  // Modelled may feed a calculation but may not be cited as fact.
  assert.equal(admissibleInCalculation("modelled"), true);
  assert.equal(citableAsFact("modelled"), false);
});

// ── confidence: two schemes, independent axes ────────────────────────────

test("Admiralty axes are independent: A2 and E1 are both constructible", () => {
  assert.equal(admiraltyCode("A", 2), "A2");
  assert.equal(admiraltyCode("E", 1), "E1");
  assert.equal(admiraltyCode("Z", 1), null);
  assert.equal(admiraltyCode("A", 9), null);
});

test("Admiralty maps to a band using the worse axis", () => {
  assert.equal(admiraltyToBand("A", 1), "very_high");
  // A reliable source carrying unconfirmed information is not high confidence.
  assert.ok(["medium", "high"].includes(admiraltyToBand("A", 3)));
  assert.equal(admiraltyToBand("E", 5), "very_low");
});

test('"cannot be judged" floors the band at very_low rather than reading as mid', () => {
  assert.equal(admiraltyToBand("F", 1), "very_low");
  assert.equal(admiraltyToBand("A", 6), "very_low");
});

test("every Admiralty pair maps to a real band", () => {
  for (const r of Object.keys(SOURCE_RELIABILITY)) {
    for (const c of Object.keys(INFO_CREDIBILITY)) {
      const band = admiraltyToBand(r, c);
      assert.ok(band && CONFIDENCE_BAND[band], `${r}${c} -> ${band}`);
    }
  }
});

test("pedigree requires all five axes as integers 1..5", () => {
  const good = { reliability: 1, completeness: 2, temporal_correlation: 2, geographical_correlation: 3, technological_correlation: 2 };
  assert.deepEqual(validatePedigree(good), []);
  assert.equal(PEDIGREE_AXES.length, 5);
  const missingAxis = { ...good };
  delete missingAxis.completeness;
  assert.ok(validatePedigree(missingAxis).length > 0);
  assert.ok(validatePedigree({ ...good, reliability: 0 }).length > 0);
  assert.ok(validatePedigree({ ...good, reliability: 6 }).length > 0);
  assert.ok(validatePedigree({ ...good, reliability: 2.5 }).length > 0);
  assert.ok(validatePedigree(null).length > 0);
});

test("pedigree maps to a band, best to very_high and worst to very_low", () => {
  const all = (v) => Object.fromEntries(PEDIGREE_AXES.map((a) => [a, v]));
  assert.equal(pedigreeToBand(all(1)), "very_high");
  assert.equal(pedigreeToBand(all(5)), "very_low");
  assert.equal(pedigreeToBand(all(3)), "medium");
  assert.equal(pedigreeToBand({ reliability: 9 }), null);
});

test("both schemes land in the same band vocabulary, so one chip renders either", () => {
  const a = admiraltyToBand("B", 2);
  const p = pedigreeToBand(Object.fromEntries(PEDIGREE_AXES.map((x) => [x, 2])));
  assert.ok(CONFIDENCE_BAND[a] && CONFIDENCE_BAND[p]);
});

// ── likelihood: closed, published ladder, separate from confidence ───────

test("likelihood ladder is contiguous and covers 1..99", () => {
  for (let pct = 1; pct <= 99; pct++) {
    assert.ok(likelihoodForProbability(pct), `no band for ${pct}%`);
  }
});

test("likelihood refuses 0 and 100, which no honest estimate asserts", () => {
  assert.equal(likelihoodForProbability(0), null);
  assert.equal(likelihoodForProbability(100), null);
  assert.equal(likelihoodForProbability("likely"), null);
});

test("likelihood is a distinct vocabulary from confidence, never interchangeable", () => {
  // ICD 203 forbids combining a confidence level and a degree of likelihood in one statement.
  for (const k of Object.keys(LIKELIHOOD)) assert.equal(CONFIDENCE_BAND[k], undefined, k);
  for (const k of Object.keys(CONFIDENCE_BAND)) assert.equal(LIKELIHOOD[k], undefined, k);
});

// ── impact x applicability, and binding_position ─────────────────────────

test("impact and applicability are separate vocabularies", () => {
  for (const k of Object.keys(IMPACT)) assert.equal(APPLICABILITY[k], undefined, k);
});

test("a maximum-impact instrument can be not applicable at the same time", () => {
  // The exact case a single severity scalar hides, and the reason compliance products cry wolf.
  const row = { impact: "licence", applicability: "not_applicable" };
  assert.ok(IMPACT[row.impact] && APPLICABILITY[row.applicability]);
  assert.equal(APPLICABILITY[row.applicability].isActionable, false);
  assert.equal(IMPACT[row.impact].order, 4);
});

test("not_assessed is a first-class applicability value, never a null", () => {
  assert.ok(APPLICABILITY.not_assessed);
  assert.equal(APPLICABILITY.not_assessed.isActionable, false);
});

test("binding_position carries the four positions a forwarder can occupy", () => {
  assert.deepEqual(
    Object.keys(BINDING_POSITION).sort(),
    ["carrier_passthrough", "customer_contract", "direct_duty", "monitoring_only"]
  );
  for (const e of Object.values(BINDING_POSITION)) {
    assert.ok(e.note && e.note.length > 0, `${e.code} needs an explanatory note`);
  }
});

// ── freshness ────────────────────────────────────────────────────────────

test("freshness marks stale, frozen and unknown as degraded; current and ageing are not", () => {
  assert.equal(FRESHNESS.current.degraded, false);
  assert.equal(FRESHNESS.ageing.degraded, false);
  assert.equal(FRESHNESS.stale.degraded, true);
  assert.equal(FRESHNESS.frozen.degraded, true);
  // Unknown cadence is degraded: absence of a judgment is not a clean bill of health.
  assert.equal(FRESHNESS.unknown.degraded, true);
});

// ── relations: closed, typed, reciprocal ─────────────────────────────────

test("every relation declares an inverse that exists", () => {
  for (const [code, e] of Object.entries(RELATION)) {
    assert.ok(RELATION[e.inverse], `${code} inverse ${e.inverse} is not a relation`);
  }
});

test("inverse is involutive: the inverse of the inverse is the original", () => {
  for (const code of Object.keys(RELATION)) {
    assert.equal(inverseRelation(inverseRelation(code)), code, code);
  }
});

test("symmetric relations are their own inverse, and only those are marked symmetric", () => {
  for (const [code, e] of Object.entries(RELATION)) {
    assert.equal(e.symmetric, e.inverse === code, `${code} symmetric flag disagrees with its inverse`);
  }
  assert.equal(RELATION.contradicts.symmetric, true);
  assert.equal(RELATION.implements.symmetric, false);
});

test("inverseRelation returns null for a non-relation", () => {
  assert.equal(inverseRelation("keyword_overlap"), null);
});

// ── the lattice as a whole ───────────────────────────────────────────────

test("no vocabulary is empty and the registry lists eleven", () => {
  assert.equal(Object.keys(VOCABULARIES).length, 11);
  for (const [name, v] of Object.entries(VOCABULARIES)) {
    assert.ok(Object.keys(v).length > 0, `${name} is empty`);
  }
});
