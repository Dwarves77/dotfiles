// tag-yield.fixture.test.mjs — the TAGDERIVE dispatch's measurement (2026-09-03): proves, against REAL
// record-grade data (never a synthetic fixture), the measured cause of the tag-proposals defect (only
// 46/339 untagged verified live items derived any tag) and the measured before/after effect of this
// lane's two additions — tag-input.mjs (wider grounded input) and tag-aliases.mjs (legal-text
// synonyms for tags that already exist). PURE reads only: this file NEVER writes anything, NEVER calls
// a DB, NEVER calls an LLM. $0.
//
// DATA SOURCE: scripts/_snapshots/population-33749140151/census-rows.apply-ready.json, a
// git-tracked, real snapshot of 178 record-grade items (item_grade='record') from the 2026-09-02
// census-minting wave — the SAME population the dispatch's own "177 items minted today are
// record-grade" line describes (178 here; both counts describe the same live wave read at slightly
// different moments — see this lane's report). Each row carries: item (title, canonical_instrument_key,
// jurisdiction_iso, full_brief), sections (intelligence_item_sections shape), claims
// (section_claim_provenance shape, FACT and GAP), and search_results (agent_run_searches shape,
// result_content — the full captured source document, uncapped per ADR-016).
//
// TEN FIXTURES, chosen deterministically (index = i * floor(178/10) for i in 0..9, i.e. an even spread
// across the file's own row order — never cherry-picked for a favorable outcome) so a re-run of this
// file against the same tracked snapshot always names the same ten items.
//
// THREE CONDITIONS measured per item and over the full 178-item population:
//   BEFORE  — deriveTags() on the FLAT shape propose-tags.mjs's readCorpus() feeds it today
//             (title/canonical_instrument_key/jurisdiction_iso/full_brief only). This is the live
//             defect's own input shape.
//   WIDE    — deriveTags(assembleTagInput(row)) — same KEYWORD_MAP, wider INPUT (sections, FACT
//             claims, bounded captured-source window folded into full_brief). Isolates the input fix.
//   AFTER   — mergeTagProposals(deriveTags(wideInput).proposals, deriveAliasTags(wideInput).proposals)
//             — wide input AND the alias vocabulary together. The dispatch's target condition.
//
// Every AFTER proposal is checked, item by item, for the "no invented tags" requirement: its evidence
// string must be a real, case-insensitive substring of that item's own assembled input text — the same
// verbatim discipline record-facts.mjs's assertVerbatim enforces one layer up the pipeline, checked
// here for every one of the 178 items' every proposal, not a sample.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { deriveTags, TOPIC_TAG_VALUES, COMPLIANCE_OBJECT_VALUES, SCENARIO_TAG_VALUES } from "./derive-tags.mjs";
import { assembleTagInput } from "./tag-input.mjs";
import { deriveAliasTags, mergeTagProposals } from "./tag-aliases.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = resolve(HERE, "..", "..", "..", "scripts", "_snapshots", "population-33749140151", "census-rows.apply-ready.json");

/** @type {Array<any>} */
const POPULATION = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8"));

/** Build the flat shape propose-tags.mjs's readCorpus() feeds deriveTags() today. PURE. */
function flatItem(row) {
  return {
    id: row.id,
    title: row.item.title,
    canonical_instrument_key: row.item.canonical_instrument_key,
    jurisdiction_iso: row.item.jurisdiction_iso,
    full_brief: row.item.full_brief,
  };
}

/** Compute the three measured conditions for one snapshot row. PURE. */
function measure(row) {
  const before = deriveTags(flatItem(row));
  const wideInput = assembleTagInput({
    ...flatItem(row),
    sections: row.sections,
    claims: row.claims,
    search_results: row.search_results,
  });
  const wide = deriveTags(wideInput);
  const alias = deriveAliasTags(wideInput);
  const after = mergeTagProposals(wide.proposals, alias.proposals);
  return { before: before.proposals, wide: wide.proposals, after, wideInput };
}

const STEP = Math.floor(POPULATION.length / 10);
const FIXTURE_INDICES = Array.from({ length: 10 }, (_, i) => i * STEP);

test(`fixture population loaded: ${POPULATION.length} record-grade rows from the tracked snapshot`, () => {
  assert.ok(POPULATION.length >= 100, "expected the full 2026-09-02 record-grade wave");
  for (const row of POPULATION) assert.equal(row.item.grade, "record");
});

test("MEASURED CAUSE: the ten real fixtures — per-item before/after (printed table)", () => {
  const rows = [];
  for (const idx of FIXTURE_INDICES) {
    const row = POPULATION[idx];
    const { before, after } = measure(row);
    rows.push({
      idx,
      title: row.item.title.slice(0, 55),
      jurisdiction: row.item.jurisdiction_iso,
      before: before.length,
      after: after.length,
      afterTags: after.map((p) => `${p.field}:${p.tag}(${p.confidence})`).join("; "),
    });
  }

  console.log("\nTAGDERIVE fixture measurement — 10 real record-grade items, before/after:\n");
  console.log("idx | jurisdiction | before | after | title | after tags");
  for (const r of rows) {
    console.log(`${r.idx} | ${r.jurisdiction} | ${r.before} | ${r.after} | ${r.title} | ${r.afterTags || "(none — no vocabulary term supported by this item's own text)"}`);
  }
  console.log("");

  // Locked-in per-fixture result (from the tracked snapshot; a snapshot change would need a re-measure).
  const expected = {
    0: { before: 0, after: 0 }, // Minor NSR air permitting (US) — general permitting procedure, no freight-vocab fit
    17: { before: 0, after: 1 }, // EU EUDR high/low-risk country list — EUDR-due-diligence via alias
    34: { before: 0, after: 0 }, // GB Ecodesign for Energy-Related Products — no freight-vocab fit
    51: { before: 0, after: 1 }, // EU packaging-waste directive amendment — packaging via alias
    68: { before: 0, after: 1 }, // EU sustainability-factors/MiFID delegated regulation — emissions via alias
    85: { before: 0, after: 2 }, // EU heavy-duty-vehicle CO2 list — truck-CO2-standard + transport via alias
    102: { before: 0, after: 2 }, // EU biofuel/RED II GHG-savings decision — emissions + fuels via alias
    119: { before: 0, after: 0 }, // EU waste-sector reporting questionnaire — ADR-020 named gap, no tag owed yet
    136: { before: 0, after: 0 }, // EU REACH acrylamide restriction — no freight-vocab fit
    153: { before: 0, after: 0 }, // EEA eco-label textile decision — no freight-vocab fit
  };
  for (const r of rows) {
    assert.equal(r.before, expected[r.idx].before, `idx ${r.idx} BEFORE count changed — re-measure and update this fixture`);
    assert.equal(r.after, expected[r.idx].after, `idx ${r.idx} AFTER count changed — re-measure and update this fixture`);
  }

  // The headline finding this test exists to lock in: baseline finds nothing on any of the ten; the
  // combined fix finds at least one tag for exactly half, all of them real content matches (idx 17,
  // 51, 68, 85, 102) — and correctly finds NOTHING for the other half, because their real text does
  // not support a tag in the live, in-scope vocabulary (idx 0, 34, 119, 136, 153).
  assert.equal(rows.filter((r) => r.before > 0).length, 0);
  assert.equal(rows.filter((r) => r.after > 0).length, 5);
});

test("MEASURED CAUSE, full population: BEFORE (flat shape) vs WIDE (input only) vs AFTER (input + alias)", () => {
  let beforeHit = 0, wideHit = 0, afterHit = 0;
  const fieldHit = { operational_scenario_tags: 0, compliance_object_tags: 0, topic_tags: 0 };
  for (const row of POPULATION) {
    const { before, wide, after } = measure(row);
    if (before.length) beforeHit++;
    if (wide.length) wideHit++;
    if (after.length) afterHit++;
    for (const f of Object.keys(fieldHit)) if (after.some((p) => p.field === f)) fieldHit[f]++;
  }
  console.log(
    `\nTAGDERIVE full-population measurement (${POPULATION.length} record-grade items): ` +
    `BEFORE=${beforeHit} WIDE(input-only)=${wideHit} AFTER(input+alias)=${afterHit}. ` +
    `AFTER per-field coverage: operational_scenario_tags=${fieldHit.operational_scenario_tags}, ` +
    `compliance_object_tags=${fieldHit.compliance_object_tags}, topic_tags=${fieldHit.topic_tags}.\n`,
  );

  // Locked-in corpus-level counts (from the tracked snapshot).
  assert.equal(beforeHit, 16, "BEFORE hit count changed — re-measure against the tracked snapshot");
  assert.equal(wideHit, 51, "WIDE (input-only) hit count changed — re-measure against the tracked snapshot");
  assert.equal(afterHit, 72, "AFTER (input+alias) hit count changed — re-measure against the tracked snapshot");
  // Both the input fix alone and the alias vocabulary alone must move the needle in this population —
  // neither addition is a no-op, and each is separable in this measurement.
  assert.ok(wideHit > beforeHit, "wider grounded input must recover real matches the flat shape misses");
  assert.ok(afterHit > wideHit, "the alias vocabulary must recover additional real matches over the existing KEYWORD_MAP alone");
});

test("NO INVENTED TAGS: every AFTER proposal's evidence is a real, verbatim (case-insensitive) substring of that item's own assembled input", () => {
  let checked = 0;
  for (const row of POPULATION) {
    const { after, wideInput } = measure(row);
    const haystack = String(wideInput.full_brief || "").toLowerCase();
    for (const p of after) {
      checked++;
      assert.ok(
        haystack.includes(String(p.evidence).toLowerCase()),
        `item ${row.id}: proposal ${p.field}:${p.tag} evidence "${p.evidence}" is not a verbatim substring of the item's own assembled text`,
      );
    }
  }
  assert.ok(checked > 0, "expected at least one AFTER proposal across the population to check");
});

test("NO INVENTED TAGS: every AFTER proposal names a tag that is a real member of its field's live vocabulary", () => {
  // deriveTags()'s and deriveAliasTags()'s own module-load self-checks already enforce this for every
  // KEYWORD_MAP/ALIAS_MAP entry at import time; this test re-checks independently, end-to-end, over
  // every proposal the full population actually produces, rather than trusting the two self-checks
  // alone never to have been bypassed.
  const sets = {
    topic_tags: new Set(TOPIC_TAG_VALUES),
    compliance_object_tags: new Set(COMPLIANCE_OBJECT_VALUES),
    operational_scenario_tags: new Set(SCENARIO_TAG_VALUES),
  };
  let checked = 0;
  for (const row of POPULATION) {
    const { after } = measure(row);
    for (const p of after) {
      checked++;
      assert.ok(sets[p.field]?.has(p.tag), `item ${row.id}: proposal names tag "${p.tag}" absent from field "${p.field}"'s live vocabulary`);
    }
  }
  assert.ok(checked > 0, "expected at least one AFTER proposal across the population to check");
});
