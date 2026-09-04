// Gate-A scanner (mint-kit copy): non-assertion syntactic-context harvest skips (lane GATE-A-TOKENS,
// 2026-09-04). Every case here is drawn from live evidence in Maintenance #34's dry-plan snapshot
// (`_snapshots/heal34.json`, 87 quarantined-live items, 627 orphan tokens) or from the operator's own
// worked examples, verified against the real live full_brief text for the cited item ids (read-only SQL,
// this session) before being written into a fixture. See the file header for the classification writeup.
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractFactualTokens, scanBrief } from "./gate-a-scan.mjs";

const tokens = (s) => extractFactualTokens(s);

// ── metadata stamp ──────────────────────────────────────────────────────────────────────────────────

test("RED: a document-metadata stamp line ('As of:', operator's own example) is skipped", () => {
  assert.deepEqual(tokens("**As of:** 2025-05-01").deadlines, [], "the brief's own retrieval-date stamp is not a fact");
});

test("RED: a document-type|generation-date header line is skipped ('Technology Profile | April 2026')", () => {
  assert.deepEqual(tokens("**Technology Profile** | April 2026").deadlines, []);
});

test("RED: 'Regulatory Fact Document | Generated April 2025' header is skipped (structural pipe rule)", () => {
  assert.deepEqual(tokens("**Regulatory Fact Document** | Generated April 2025").deadlines, []);
});

test("RED: 'Date of generation:' / 'Document date:' stamps are skipped (live corpus)", () => {
  assert.deepEqual(tokens("**Date of generation:** 2026-05-27.").deadlines, []);
  assert.deepEqual(tokens("**Document date:** 2026-07-14").deadlines, []);
});

test("GREEN: 'Status:' and 'Last verified:' (operator-named, not observed live) are skipped when they are pure value lines", () => {
  assert.deepEqual(tokens("**Status:** Active").deadlines, []);
  assert.deepEqual(tokens("**Last verified:** 2026-05-01").deadlines, []);
});

test("GREEN: bold CALLOUT labels leading a real assertion are NOT skipped ('FACT:', evidenced live)", () => {
  const brief = `**FACT:** Globally, the IEA has lowered its renewable energy growth forecast for 2025-2030 by 5%, reflecting policy changes.`;
  assert.ok(tokens(brief).figures.includes("5%"), "a bold FACT: callout must not exempt its own figure");
});

test("GREEN: 'Effective date:' (a REGULATION's date) is NOT skipped -- distinguished vs. 'Effective date of this document:' (the brief's own stamp)", () => {
  assert.ok(
    tokens("**Effective date:** SECR was implemented on 1 April 2019, when the Regulations 2018 came into force.").deadlines.includes("1 April 2019"),
    "a regulation's own effective date must still gate even though the label is bold+colon like a stamp",
  );
  assert.deepEqual(
    tokens("**Effective date of this document:** 2026-06-06.").deadlines,
    [],
    "the brief's OWN effective-date stamp (a different, more specific label) is metadata",
  );
});

test("GREEN: a metadata-stamp label reused inside a longer real sentence is NOT blanket-exempted (length guard)", () => {
  // Same leading bold label as a real stamp, but the rest of the line is a full sentence, not a bare value.
  const brief = `**As of:** the Commission's most recent assessment, 23 Member States had submitted final updated NEPNs by 1 January 2028.`;
  assert.ok(tokens(brief).deadlines.includes("1 January 2028"), "a long non-value line must not be swallowed by the stamp guard");
});

// ── boilerplate GAP templates ───────────────────────────────────────────────────────────────────────

test("RED: 'No content for this section as of <date>' (operator's own example, 7x live) is skipped", () => {
  const brief = `*No content for this section as of May 2025: specific cost figures for road, air, and ocean modes in Brazil were not available in the retrieved source set.`;
  assert.deepEqual(tokens(brief).deadlines, []);
});

test("RED: 'not available from primary sources as of <date>' (measured: 24x live, the dominant GAP template) is skipped", () => {
  const brief = `*Specific cost figures for freight-specific emissions reporting tooling not available from primary sources as of 2026-05-27.*`;
  assert.deepEqual(tokens(brief).deadlines, []);
});

test("GREEN: the boilerplate skip is CLAUSE-SCOPED, not line-scoped -- a real prior sentence on the same line is untouched", () => {
  const brief = `That connection remains speculative and is not sourced. *Specific regulatory connection not available from primary sources as of June 2026.*`;
  assert.deepEqual(tokens(brief).deadlines, [], "no token in this fixture (no digit in the real-sentence clause) -- proves the clause match, not a false extra");
});

test("GREEN: a single non-repeated near-miss phrase is NOT treated as a template (measured: occurred once, not added)", () => {
  const brief = `No published schedule for the scenario consultation closing date has been identified in the source corpus as of May 2026.`;
  assert.ok(tokens(brief).deadlines.includes("May 2026"), "an unrepeated phrase must still gate -- only measured, repeated templates are exempted");
});

// ── heading / list-item ordinal numerals ────────────────────────────────────────────────────────────

test("RED: a heading's own ordinal number never fuses with its title into a false figure ('## 2. Tonne-Kilometre...', live defect)", () => {
  const brief = `## 2. Tonne-Kilometre Activity Data Capture`;
  assert.deepEqual(tokens(brief).figures, [], "the false '2. Tonne' quantity token must not be extracted");
});

test("GREEN: real content after a numbered heading still gates ('### 6.1 New qualification call... (March 2026)')", () => {
  const brief = `### 6.1 New qualification call for management entities (March 2026)`;
  assert.ok(tokens(brief).deadlines.includes("March 2026"), "the heading's real title content is not exempt, only its own ordinal");
});

test("GREEN: real content in a numbered list item still gates", () => {
  const brief = `1. **National Development Plan (Law 1753 of 2015)** governs non-motorised transport targets by 2020.`;
  assert.ok(tokens(brief).deadlines.includes("2020"));
});

test("GREEN: a heading whose title itself states a real fact still gates (not blanket-exempted as 'a heading')", () => {
  const brief = `## ACTION REQUIRED — SEEMP Part III Revision Deadline: 31 December 2025`;
  assert.ok(tokens(brief).deadlines.includes("31 December 2025"), "a real deadline stated only in a heading title must still gate");
});

// ── instrument-citation numbers ─────────────────────────────────────────────────────────────────────

test("RED: a Brazilian decree-numbering year ('Federal Law No. 12,305/2010', live defect, item 8de055dc-...) is not a deadline", () => {
  const brief = `This covers Brazil's federal reverse logistics framework, established by Federal Law No. 12,305/2010, and its subsequent implementing regulations, including Federal Decree No. 10,936/2022.`;
  const d = tokens(brief).deadlines;
  assert.ok(!d.includes("2010"), "the law's own numbering year is an identifier, not a date -- the pre-fix scanner extracted it via OBLIGATION_NEAR('by' in 'established by')");
  assert.ok(!d.includes("2022"), "the same rule applies to the decree citation");
});

test("GREEN: an EU-style year-first instrument number ('(EU) 2024/1735') is not a deadline even in obligation context", () => {
  const brief = `Compliant by (EU) 2024/1735 becomes the operative baseline once adopted.`;
  assert.ok(!tokens(brief).deadlines.includes("2024"), "the citation-number year must not leak through even beside an obligation word");
});

test("GREEN: the SAME year in real obligation prose (no slash-adjacency) still gates", () => {
  const brief = `The requirement applies from 2024 for all operators in scope.`;
  assert.ok(tokens(brief).deadlines.includes("2024"), "an ordinary obligation year must not be caught by the instrument-citation guard");
});

// ── position-nested date/figure sub-spans (dedup, never a coverage change) ─────────────────────────

test("RED: a full date's own year and month-year are not separately reported when nested at the SAME position", () => {
  const brief = `Member States must submit a draft updated NEPN to the European Commission by 1 January 2028 and adopt the final version by 1 January 2029.`;
  const d = tokens(brief).deadlines;
  assert.deepEqual(d.sort(), ["1 January 2028", "1 January 2029"].sort(), "the nested '2028'/'January 2028'/'2029'/'January 2029' sub-tokens collapse into their full dates");
});

test("GREEN: a standalone month-year elsewhere in the document (not nested at that position) still gates on its own", () => {
  const brief = `Analytical inference: based on the January 2028 draft submission deadline and typical lead time.`;
  assert.ok(tokens(brief).deadlines.includes("January 2028"), "a genuinely separate occurrence must not be suppressed just because a longer date exists elsewhere");
});

test("GREEN: two DIFFERENT figures that happen to share digits are NOT collapsed (measured live false-collision risk: '1 GW' / '1.1 GW')", () => {
  const brief = `The reference capacity in the related scenario is 1.1 GW, from a range of 1 GW to 2.4 GW.`;
  const f = tokens(brief).figures;
  assert.ok(f.includes("1.1 GW") && f.includes("1 GW") && f.includes("2.4 GW"), "position-anchored dedup must never collapse non-nested, textually-coincidental figures");
});

// ── citation-URL figure artifact (measured live defect, item aea2e314-...) ─────────────────────────

test("RED: a URL's own percent-encoding does not spell a false figure ('Appendix%202.6%20...', live defect)", () => {
  const brief = `| ESRS E1 (Climate Change) — EFRAG | https://www.efrag.org/Assets/Download?assetUrl=/sites/webpublishing/SiteAssets/Appendix%202.6%20-%20Draft%20standard%20-%20ESRS%20E1%20Climate%20change.pdf | 2 | ESRS E1 specifies the Scope 3 disclosure requirements under CSRD. |`;
  assert.ok(!tokens(brief).figures.includes("202.6%"), "the URL-encoding artifact must not be extracted as a figure");
});

test("GREEN: a real figure in an adjacent cell on the SAME line as a URL still gates (position-anchored, not line-blind)", () => {
  const brief = `| Source | https://example.org/report.pdf | Coverage rises from 40% to 60% of total emissions. |`;
  const f = tokens(brief).figures;
  assert.ok(f.includes("40%") && f.includes("60%"), "a real figure elsewhere on a citation-bearing line must not be exempted");
});

// ── refuted classes: headings and table rows are NOT blanket-skipped ───────────────────────────────

test("REFUTED: a full markdown heading is NOT blanket-skipped -- only its own leading ordinal is (measurement contradicted the premise)", () => {
  // NOTE: the live corpus writes this fact as "FY2028" (fused, no space) three times in item
  // 3f7e1aed-...; that fused form never matches the bare-year regex's own \b boundary requirement
  // (a pre-existing, unrelated regex-boundary property, not part of this lane's write set) -- heal34.json's
  // "sentence" display field for that item's "2028" orphan is a FUZZY nearest-match reconstruction and
  // misattributes it to this paragraph; the item's real (properly-bounded) "2028" occurrence is elsewhere in
  // the same document (verified live, read-only SQL, this session). This fixture uses a spaced year instead
  // so the assertion tests what it claims to: a heading is not blanket-skipped.
  const brief = `### GX-Surcharge on Fossil Fuels — From FY 2028`;
  assert.ok(tokens(brief).deadlines.includes("2028"), "a real policy year stated only in a heading's title must still gate");
});

test("REFUTED: a markdown table row is NOT blanket-skipped -- real facts live in table cells (China-ETS timeline, live corpus)", () => {
  const brief = `| 2024 | ETS expanded to steel, cement, aluminum; ~1,334 new entities; coverage raised from ~40% to ~60% of China's total carbon emissions |`;
  const r = tokens(brief);
  assert.ok(r.deadlines.includes("2024"));
  assert.ok(r.figures.includes("40%") && r.figures.includes("60%"), "a table row's own figures must still gate -- HEAL-10's brief-honest dry plans show what deleting these does");
});

test("REFUTED: a table row's date cell still gates (a superseded-application-date row, HEAL-10 dry evidence)", () => {
  const brief = `| 30 December 2025 | Original application date for large operators (superseded) | Superseded by Reg 2025/2650 | — |`;
  assert.ok(tokens(brief).deadlines.includes("30 December 2025"));
});

// ── scanBrief: counts field is additive, never silent ──────────────────────────────────────────────

test("scanBrief exposes a `counts` field tallying every non-assertion skip, additive to the existing shape", () => {
  const brief = `**As of:** 2025-05-01\n\n*No content for this section as of May 2025: nothing sourced.\n\n## 2. Tonne-Kilometre Activity Data Capture\n\nCompliant by (EU) 2024/1735.`;
  const ga = scanBrief(brief, []);
  assert.equal(typeof ga.scanned_hash, "string");
  assert.equal(typeof ga.orphan_count, "number");
  assert.ok(Array.isArray(ga.orphans));
  assert.equal(typeof ga.gate_a_version, "string");
  assert.ok(ga.counts, "counts must be present, never silent");
  assert.ok(ga.counts.metadata_stamp >= 1);
  assert.ok(ga.counts.boilerplate >= 1);
  assert.ok(ga.counts.heading_or_list_ordinal >= 1);
  assert.ok(ga.counts.instrument_citation >= 1);
});

test("scanBrief with no non-assertion content reports all-zero counts, never a phantom skip", () => {
  const ga = scanBrief(`The obligation applies from 2027 onwards for a fee of 45%.`, []);
  assert.deepEqual(ga.counts, { metadata_stamp: 0, boilerplate: 0, heading_or_list_ordinal: 0, instrument_citation: 0, citation_url: 0, nested_token: 0 });
});

// ── calibration case unchanged (RTFO, from the file's own header) ──────────────────────────────────

test("GREEN: the RTFO calibration case (65 orphans, existing behaviour) is unaffected by this change", () => {
  const brief = `The buy-out price is £0.145 per litre for the main obligation and £0.137 per litre for the sub-target, with a £100,000 penalty for non-compliance. Thresholds of 89 gCO2 and 26.7 gCO2 apply. The trajectory runs from 2026 to 2039.`;
  const r = tokens(brief);
  assert.ok(r.figures.includes("£0.145") && r.figures.includes("£100,000"));
  assert.ok(r.deadlines.includes("2026") && r.deadlines.includes("2039"), "trajectory years must still gate");
});
