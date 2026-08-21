// Test for connection discovery (Pillar A1). Pure — runs in the no-npm suite via the
// src/lib/connections/*.test.mjs glob.
import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreConnection, discoverConnections, computeTagFrequencies } from "./discover.mjs";

const reg = { id: "r1", item_type: "regulation", canonical_instrument_key: "32024R1610", source_id: "s1", compliance_object_tags: ["cbam-certificate"], operational_scenario_tags: ["ocean-import"], jurisdictions: ["eu"], topic_tags: ["carbon-pricing"] };

test("same instrument dominates and names the relationship", () => {
  const mkt = { id: "m1", item_type: "market_signal", canonical_instrument_key: "32024R1610", jurisdictions: ["eu"], topic_tags: ["carbon-pricing"] };
  const r = scoreConnection(reg, mkt);
  assert.ok(r.score >= 0.9);
  assert.equal(r.relationship, "same_instrument");
  assert.equal(r.crossSurface, true); // regulation <-> market_signal
  assert.ok(r.basis.some((b) => b.signal === "same_instrument"));
});

test("shared compliance object + jurisdiction+topic accumulate, grounded in basis", () => {
  const research = { id: "res1", item_type: "research_finding", compliance_object_tags: ["cbam-certificate"], jurisdictions: ["eu"], topic_tags: ["carbon-pricing"] };
  const r = scoreConnection(reg, research);
  assert.ok(r.score >= 0.18 + 0.2 - 1e-9);
  assert.ok(r.basis.some((b) => b.detail.includes("cbam-certificate")));
  assert.ok(r.basis.some((b) => b.signal === "shared_jurisdiction_topic"));
  assert.equal(r.crossSurface, true);
});

test("jurisdiction alone (no topic overlap) does NOT connect", () => {
  const other = { id: "x", item_type: "regulation", jurisdictions: ["eu"], topic_tags: ["noise"] };
  const r = scoreConnection(reg, other);
  assert.equal(r.basis.some((b) => b.signal === "shared_jurisdiction_topic"), false);
});

test("no shared basis → score 0, no invented link", () => {
  const unrelated = { id: "u", item_type: "regulation", jurisdictions: ["brazil"], topic_tags: ["labor"] };
  const r = scoreConnection(reg, unrelated);
  assert.equal(r.score, 0);
  assert.deepEqual(r.basis, []);
});

test("same item / missing ids never self-connect", () => {
  assert.equal(scoreConnection(reg, reg).score, 0);
  assert.equal(scoreConnection(reg, {}).score, 0);
});

test("discoverConnections ranks cross-surface first, respects threshold + limit", () => {
  const sameSurfaceStrong = { id: "r2", item_type: "regulation", canonical_instrument_key: "32024R1610" }; // same instrument, same surface
  const crossSurfaceWeaker = { id: "m2", item_type: "market_signal", compliance_object_tags: ["cbam-certificate"], jurisdictions: ["eu"], topic_tags: ["carbon-pricing"] };
  const noise = { id: "n", item_type: "regulation", jurisdictions: ["brazil"], topic_tags: ["labor"] };
  const out = discoverConnections(reg, [sameSurfaceStrong, crossSurfaceWeaker, noise], { threshold: 0.3, limit: 5 });
  assert.equal(out.length, 2); // noise excluded
  assert.equal(out[0].target, "m2"); // cross-surface ranked first despite lower raw score
  assert.equal(out.every((c) => c.basis.length > 0), true); // every emitted connection is grounded
});

// ── ADR-019: inverse-frequency scenario weighting ──────────────────────────────────────────────────

test("ADR-019(a): no freqMap => byte-identical to pre-ADR-019 flat-weight scoring", () => {
  const x = { id: "x1", item_type: "regulation", operational_scenario_tags: ["ocean-import", "customs-transit"] };
  const y = { id: "x2", item_type: "regulation", operational_scenario_tags: ["ocean-import", "customs-transit"] };
  const r = scoreConnection(x, y); // no 4th arg at all
  const r2 = scoreConnection(x, y, undefined, undefined); // explicit undefined freqMap
  assert.equal(r.basis.filter((b) => b.signal === "shared_scenario").every((b) => b.weight === 0.3), true);
  assert.deepEqual(r, r2);
  assert.equal(r.score, 0.6); // 0.3 + 0.3, unchanged from pre-ADR-019 behavior
});

test("ADR-019(b): rarer shared tag scores strictly higher than an ubiquitous one, all else equal", () => {
  const corpus = [
    ...Array.from({ length: 20 }, (_, i) => ({ id: `ubi${i}`, operational_scenario_tags: ["ubiquitous-tag"] })),
    { id: "rareA", operational_scenario_tags: ["rare-tag"] },
    { id: "rareB", operational_scenario_tags: ["rare-tag"] },
  ];
  const freqMap = computeTagFrequencies(corpus);
  const base = { id: "p1", item_type: "regulation" };
  const withUbiquitous = { ...base, operational_scenario_tags: ["ubiquitous-tag"] };
  const withRare = { ...base, operational_scenario_tags: ["rare-tag"] };
  const other = { id: "p2", item_type: "regulation" };
  const scoreUbi = scoreConnection(withUbiquitous, { ...other, operational_scenario_tags: ["ubiquitous-tag"] }, undefined, freqMap).score;
  const scoreRare = scoreConnection(withRare, { ...other, operational_scenario_tags: ["rare-tag"] }, undefined, freqMap).score;
  assert.ok(scoreRare > scoreUbi, `expected rare tag score ${scoreRare} > ubiquitous tag score ${scoreUbi}`);
});

test("ADR-019(c): idf clamps at both ends (0.25 floor at 8x median, 1.0 ceiling for rarer-than-median)", () => {
  // Frequencies {2,2,3,4,5,6,7,8,9,10,48}: 11 eligible values, median (6th sorted) = 6. The floor tag
  // (freq 48 = 8x median) is deliberately IN the median population, it is corpus data like any other tag.
  const corpus = [];
  for (let i = 0; i < 2; i++) corpus.push({ id: `f2b-${i}`, operational_scenario_tags: ["tag-2b"] });
  for (let freq = 2; freq <= 10; freq++) {
    for (let i = 0; i < freq; i++) corpus.push({ id: `f${freq}-${i}`, operational_scenario_tags: [`tag-${freq}`] });
  }
  // the tag at exactly 8x the median (6*8=48), hits the floor
  for (let i = 0; i < 48; i++) corpus.push({ id: `f48-${i}`, operational_scenario_tags: ["tag-48"] });
  const freqMap = computeTagFrequencies(corpus);
  assert.equal(freqMap.refFreq, 6);
  const at = (tag) => {
    const a = { id: "a", operational_scenario_tags: [tag] };
    const b = { id: "b", operational_scenario_tags: [tag] };
    return scoreConnection(a, b, undefined, freqMap).basis[0].weight;
  };
  assert.ok(Math.abs(at("tag-48") - 0.3 * 0.25) < 1e-9); // 8x median hits the exact 0.25 floor
  assert.ok(Math.abs(at("tag-6") - 0.3 * 1.0) < 1e-9); // at median: full weight
  assert.ok(Math.abs(at("tag-2") - 0.3 * 1.0) < 1e-9); // far rarer than median: clamps at the 1.0 ceiling, never penalized
});

test("ADR-019(d): PER_TAG_CAP keeps the 3 HIGHEST-weighted shared tags, not the first 3 in overlap order", () => {
  // frequencies: rare1=2, rare2=2, mid=6, common1=30, common2=30 (all >=2; median of {2,2,6,30,30} = 6)
  const freqCorpus = [
    { id: "r1a", operational_scenario_tags: ["rare1"] }, { id: "r1b", operational_scenario_tags: ["rare1"] },
    { id: "r2a", operational_scenario_tags: ["rare2"] }, { id: "r2b", operational_scenario_tags: ["rare2"] },
    ...Array.from({ length: 6 }, (_, i) => ({ id: `m${i}`, operational_scenario_tags: ["mid"] })),
    ...Array.from({ length: 30 }, (_, i) => ({ id: `c1${i}`, operational_scenario_tags: ["common1"] })),
    ...Array.from({ length: 30 }, (_, i) => ({ id: `c2${i}`, operational_scenario_tags: ["common2"] })),
  ];
  const freqMap = computeTagFrequencies(freqCorpus);
  // overlap order deliberately lists the two COMMON (low-weight) tags first, rare ones last.
  const a = { id: "a", operational_scenario_tags: ["common1", "common2", "mid", "rare1", "rare2"] };
  const b = { id: "b", operational_scenario_tags: ["common1", "common2", "mid", "rare1", "rare2"] };
  const r = scoreConnection(a, b, undefined, freqMap);
  const kept = r.basis.filter((x) => x.signal === "shared_scenario").map((x) => x.detail);
  assert.equal(kept.length, 3);
  assert.ok(kept.some((d) => d.includes("rare1")));
  assert.ok(kept.some((d) => d.includes("rare2")));
  assert.ok(kept.some((d) => d.includes("mid")));
  assert.equal(kept.some((d) => d.includes("common1") || d.includes("common2")), false); // lowest-weighted, dropped
});

test("ADR-019(e): REF_FREQ median rule, including the even-count case", () => {
  const oddCorpus = [
    { id: "a1", operational_scenario_tags: ["t2"] }, { id: "a2", operational_scenario_tags: ["t2"] },
    { id: "b1", operational_scenario_tags: ["t4"] }, { id: "b2", operational_scenario_tags: ["t4"] }, { id: "b3", operational_scenario_tags: ["t4"] }, { id: "b4", operational_scenario_tags: ["t4"] },
    { id: "c1", operational_scenario_tags: ["t6"] }, { id: "c2", operational_scenario_tags: ["t6"] }, { id: "c3", operational_scenario_tags: ["t6"] }, { id: "c4", operational_scenario_tags: ["t6"] }, { id: "c5", operational_scenario_tags: ["t6"] }, { id: "c6", operational_scenario_tags: ["t6"] },
  ]; // frequencies {2,4,6} -> odd count (3), median = 4
  assert.equal(computeTagFrequencies(oddCorpus).refFreq, 4);

  const evenCorpus = [
    ...oddCorpus,
    { id: "d1", operational_scenario_tags: ["t8"] }, { id: "d2", operational_scenario_tags: ["t8"] }, { id: "d3", operational_scenario_tags: ["t8"] }, { id: "d4", operational_scenario_tags: ["t8"] }, { id: "d5", operational_scenario_tags: ["t8"] }, { id: "d6", operational_scenario_tags: ["t8"] }, { id: "d7", operational_scenario_tags: ["t8"] }, { id: "d8", operational_scenario_tags: ["t8"] },
  ]; // frequencies {2,4,6,8} -> even count (4), median = mean(4,6) = 5
  assert.equal(computeTagFrequencies(evenCorpus).refFreq, 5);

  // freq-1 (singleton) tags never enter the >=2 population and never affect REF_FREQ
  const withSingletons = [...evenCorpus, { id: "e1", operational_scenario_tags: ["t1"] }];
  assert.equal(computeTagFrequencies(withSingletons).refFreq, 5);

  // no tag occurs >=2x => refFreq is 0 (no reference point); idf() must still return 1 (no crash, no div-by-zero)
  const allSingletons = [{ id: "s1", operational_scenario_tags: ["only1"] }, { id: "s2", operational_scenario_tags: ["only2"] }];
  const singletonMap = computeTagFrequencies(allSingletons);
  assert.equal(singletonMap.refFreq, 0);
  const s = { id: "sa", operational_scenario_tags: ["only1"] };
  const t = { id: "sb", operational_scenario_tags: ["only1"] };
  assert.equal(scoreConnection(s, t, undefined, singletonMap).basis[0].weight, 0.3); // refFreq=0 => idf=1, no throw
});
