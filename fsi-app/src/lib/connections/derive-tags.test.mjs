// derive-tags.test.mjs — proves the SoT extractors bind to the REAL live vocabularies (not a hand-typed
// copy), the KEYWORD_MAP self-check holds, and deriveTags() produces correctly-tiered, capped,
// evidence-carrying proposals across the four instrument families named in the dispatch (maritime,
// aviation, road, reporting) plus the required negative case (customs-only text yields nothing).
import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveTags, extractQuotedArray, extractScenarioGlossary,
  TOPIC_TAG_VALUES, COMPLIANCE_OBJECT_VALUES, SCENARIO_TAG_VALUES, KEYWORD_MAP,
  CONFIDENCE_RANK, meetsConfidence,
} from "./derive-tags.mjs";

// ── SoT binding ──────────────────────────────────────────────────────────────────────────────────

test("SoT: topic_tags is the real closed 7-value vocabulary, verbatim order from parse-output.ts", () => {
  assert.deepEqual(TOPIC_TAG_VALUES, ["emissions", "fuels", "transport", "reporting", "packaging", "corridors", "research"]);
});

test("SoT: compliance_object_tags is the real closed 19-value vocabulary (includes nvocc, the '19 not 18' note)", () => {
  assert.equal(COMPLIANCE_OBJECT_VALUES.length, 19);
  assert.ok(COMPLIANCE_OBJECT_VALUES.includes("nvocc"));
  assert.ok(COMPLIANCE_OBJECT_VALUES.includes("carrier-ocean"));
  assert.ok(COMPLIANCE_OBJECT_VALUES.includes("warehouse-operator"));
});

test("SoT: operational_scenario_tags core glossary parses to the real ~32-value set", () => {
  assert.equal(SCENARIO_TAG_VALUES.length, 32);
  assert.ok(SCENARIO_TAG_VALUES.includes("ocean-bunkering"));
  assert.ok(SCENARIO_TAG_VALUES.includes("CBAM-declaration"));
  assert.ok(SCENARIO_TAG_VALUES.includes("product-due-diligence-CSDDD"));
});

test("SoT: retired scope tags (ADR-020 Amendment 1) are absent from the extracted scenario glossary", () => {
  for (const retired of ["customs-declaration-import", "customs-declaration-export", "dangerous-goods-classification"]) {
    assert.ok(!SCENARIO_TAG_VALUES.includes(retired), `retired tag "${retired}" must not resurface via extraction`);
  }
});

test("extractQuotedArray: throws on an absent const name (fail-closed, never derives from nothing)", () => {
  assert.throws(() => extractQuotedArray("const OTHER = [\"a\"] as const;", "MISSING"), /could not find/);
});

test("extractQuotedArray: throws on a const that parses to zero values", () => {
  assert.throws(() => extractQuotedArray("const EMPTY = [] as const;", "EMPTY"), /zero values/);
});

test("extractScenarioGlossary: throws when the 'Core glossary' block is absent", () => {
  assert.throws(() => extractScenarioGlossary("no glossary here"), /could not find/);
});

test("extractScenarioGlossary: parses category:tag lines correctly on a minimal fixture", () => {
  const fixture = [
    "Core glossary (~32 values, prefer these):",
    "",
    "Ocean: ocean-bunkering, ocean-fuel-blend-mandate",
    "",
    "Air: SAF-blending",
    "",
    "Empty array allowed when the item has no clear operational scenario (e.g. background research).",
  ].join("\n");
  const parsed = extractScenarioGlossary(fixture);
  assert.deepEqual(parsed, [
    { tag: "ocean-bunkering", category: "Ocean" },
    { tag: "ocean-fuel-blend-mandate", category: "Ocean" },
    { tag: "SAF-blending", category: "Air" },
  ]);
});

test("KEYWORD_MAP self-check: every mapped tag is a real member of its field's live vocabulary", () => {
  const topic = new Set(TOPIC_TAG_VALUES), compliance = new Set(COMPLIANCE_OBJECT_VALUES), scenario = new Set(SCENARIO_TAG_VALUES);
  for (const entry of KEYWORD_MAP) {
    const set = entry.field === "topic_tags" ? topic : entry.field === "compliance_object_tags" ? compliance : scenario;
    assert.ok(set.has(entry.tag), `${entry.field}:${entry.tag} must exist in the live vocabulary`);
  }
});

// ── deriveTags: fixtures across instrument families ─────────────────────────────────────────────

test("maritime instrument: title-level ocean/emissions keywords score HIGH, body-level score MEDIUM", () => {
  const item = {
    id: "item-maritime-1",
    title: "EU MRV Regulation covering CO2 emissions from ocean bunkering",
    canonical_instrument_key: "CELEX:32015R0757",
    full_brief: "Vessel operators calling at EU ports must comply with shore power requirements from 2030.",
  };
  const { itemId, proposals } = deriveTags(item);
  assert.equal(itemId, "item-maritime-1");
  const byTag = Object.fromEntries(proposals.map((p) => [p.tag, p]));
  assert.equal(byTag["ocean-bunkering"].confidence, "high");
  assert.equal(byTag["ocean-bunkering"].field, "operational_scenario_tags");
  assert.match(byTag["ocean-bunkering"].evidence, /bunkering/i);
  assert.equal(byTag["ocean-emissions-MRV"].confidence, "high");
  assert.equal(byTag["vessel-shore-power"].confidence, "medium");
  assert.equal(byTag["vessel-operator"].field, "compliance_object_tags");
  assert.equal(byTag["vessel-operator"].confidence, "medium");
});

test("aviation instrument: CORSIA/SAF title match is HIGH; distinct from the aviation-ETS token", () => {
  const item = {
    id: "item-aviation-1",
    title: "ICAO CORSIA offsetting requirements and SAF blending mandate for aircraft operators",
    canonical_instrument_key: null,
    full_brief: null,
  };
  const { proposals } = deriveTags(item);
  const byTag = Object.fromEntries(proposals.map((p) => [p.tag, p]));
  assert.equal(byTag["aircraft-emissions-CORSIA"].confidence, "high");
  assert.equal(byTag["SAF-blending"].confidence, "high");
  assert.equal(byTag["aircraft-operator"].field, "compliance_object_tags");
  assert.ok(!("aircraft-emissions-ETS" in byTag), "a CORSIA/SAF title must not also manufacture an unrelated ETS proposal");
});

test("road instrument: cabotage/drayage/truck-CO2 keywords derive correctly from title", () => {
  const item = {
    id: "item-road-1",
    title: "Heavy-duty CO2 standard amendment: cabotage and drayage operations in urban low emission zones",
    canonical_instrument_key: "EU-2019-1242-AMEND",
    full_brief: null,
  };
  const { proposals } = deriveTags(item);
  const tags = proposals.map((p) => p.tag).sort();
  assert.ok(tags.includes("road-cabotage"));
  assert.ok(tags.includes("drayage"));
  assert.ok(tags.includes("truck-CO2-standard"));
  assert.ok(tags.includes("urban-truck-zone"));
  for (const p of proposals) assert.equal(p.confidence, "high", `${p.tag} should be title-level HIGH`);
});

test("reporting instrument: CSRD/scope-3/ISSB disclosure keywords derive correctly", () => {
  const item = {
    id: "item-reporting-1",
    title: "CSRD sustainability reporting obligations",
    canonical_instrument_key: null,
    full_brief: "Companies must disclose Scope 3 emissions data and align with ISSB standards under this disclosure framework; a supplier data request process is required from in-scope suppliers.",
  };
  const { proposals } = deriveTags(item);
  const byTag = Object.fromEntries(proposals.map((p) => [p.tag, p]));
  assert.equal(byTag["sustainability-report-CSRD"].confidence, "high");
  assert.equal(byTag["emissions-reporting-Scope3"].confidence, "medium");
  assert.equal(byTag["disclosure-ISSB"].confidence, "medium");
  assert.equal(byTag["supplier-data-request"].confidence, "medium");
  assert.ok(proposals.some((p) => p.field === "topic_tags" && p.tag === "reporting"));
});

test("NEGATIVE CASE: customs-only text (no sustainability/emissions/role substance) yields zero proposals", () => {
  const item = {
    id: "item-customs-1",
    title: "Tariff Classification Update for HS Chapter 87 Motor Vehicle Parts",
    canonical_instrument_key: "REG-2024-1122",
    full_brief: "The declarant must file the customs declaration referencing the correct tariff line and HS code at the border crossing. Duty rates are unchanged from the prior schedule.",
  };
  const { itemId, proposals } = deriveTags(item);
  assert.equal(itemId, "item-customs-1");
  assert.deepEqual(proposals, [], "a purely customs-administration item must derive no tag proposals — better to emit nothing than to invent one");
});

test("a title match and a body match on the SAME tag are recorded ONCE, at the stronger (high) tier", () => {
  const item = {
    id: "item-dedup-1",
    title: "CBAM declaration requirements",
    canonical_instrument_key: null,
    full_brief: "Importers must also account for the carbon border adjustment mechanism (CBAM) in their declarations.",
  };
  const { proposals } = deriveTags(item);
  const cbam = proposals.filter((p) => p.tag === "CBAM-declaration");
  assert.equal(cbam.length, 1, "must not double-propose the same (field, tag) pair");
  assert.equal(cbam[0].confidence, "high");
});

test("caps: operational_scenario_tags is capped at 5, highest-confidence first, tag-name tiebreak", () => {
  const item = {
    id: "item-cap-1",
    // 7 distinct scenario keywords in the title -> all would be HIGH; cap must keep exactly 5.
    title: "Bunkering, fuel blend, MRV regulation, shore power, CII rating, port call and cabotage rules",
    canonical_instrument_key: null,
    full_brief: null,
  };
  const { proposals } = deriveTags(item);
  const scenario = proposals.filter((p) => p.field === "operational_scenario_tags");
  assert.equal(scenario.length, 5, "operational_scenario_tags proposals must be capped at 5");
  const sortedTags = scenario.map((p) => p.tag);
  assert.deepEqual([...sortedTags].sort(), sortedTags, "ties (all HIGH) must break by tag name ascending");
});

test("deriveTags is pure: identical input produces byte-identical output, input is never mutated", () => {
  const item = Object.freeze({
    id: "item-pure-1",
    title: "CORSIA offsetting for aircraft operators",
    canonical_instrument_key: null,
    full_brief: null,
  });
  const a = deriveTags(item);
  const b = deriveTags(item);
  assert.deepEqual(a, b);
});

test("deriveTags: absent/null fields degrade to an empty proposal set, never throws", () => {
  assert.deepEqual(deriveTags({ id: "item-empty-1" }), { itemId: "item-empty-1", proposals: [] });
  assert.deepEqual(deriveTags({ id: "item-empty-2", title: null, canonical_instrument_key: null, full_brief: null }).proposals, []);
});

// ── CONFIDENCE_RANK / meetsConfidence (2026-09-03 auto-adoption ruling) ─────────────────────────────

test("CONFIDENCE_RANK: high outranks medium", () => {
  assert.ok(CONFIDENCE_RANK.high > CONFIDENCE_RANK.medium);
});

test("meetsConfidence: high meets a high threshold; medium does not", () => {
  assert.equal(meetsConfidence("high", "high"), true);
  assert.equal(meetsConfidence("medium", "high"), false);
});

test("meetsConfidence: both tiers meet a medium threshold (high is stronger than the bar, not weaker)", () => {
  assert.equal(meetsConfidence("high", "medium"), true);
  assert.equal(meetsConfidence("medium", "medium"), true);
});

test("meetsConfidence: an unrecognized/missing confidence value ranks below every real tier, never throws", () => {
  assert.equal(meetsConfidence("low", "medium"), false);
  assert.equal(meetsConfidence(undefined, "medium"), false);
  assert.equal(meetsConfidence(null, "high"), false);
});

test("meetsConfidence over a real deriveTags() output: partitions maritime fixture proposals by tier exactly as expected", () => {
  const item = {
    id: "item-maritime-1",
    title: "EU MRV Regulation covering CO2 emissions from ocean bunkering",
    canonical_instrument_key: "CELEX:32015R0757",
    full_brief: "Vessel operators calling at EU ports must comply with shore power requirements from 2030.",
  };
  const { proposals } = deriveTags(item);
  const eligible = proposals.filter((p) => meetsConfidence(p.confidence, "high"));
  const residue = proposals.filter((p) => !meetsConfidence(p.confidence, "high"));
  assert.equal(eligible.length, 2, "ocean-bunkering + ocean-emissions-MRV are title-level HIGH");
  assert.equal(residue.length, 2, "vessel-shore-power + vessel-operator are body-only MEDIUM");
});
