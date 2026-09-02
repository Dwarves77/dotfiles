// validate-mint-payload.test.mjs — red/green coverage of every C1-C7 failure reason validate-mint-payload.mjs
// can emit, plus a canonicalize-citation-url unit and a full-payload green baseline. Run standalone:
//   node --test scripts/mint/validate-mint-payload.test.mjs
// (scripts/mint/** is this lane's own write set, outside the wired discipline suite glob list -- see
// MINT-RUNBOOK.md "running the kit's own tests".)

import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { validateMintPayload } from "./validate-mint-payload.mjs";
import { canonicalizeCitationUrl } from "./lib/canonicalize-citation-url.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TESTDATA_DIR = resolve(__dirname, "testdata");

function clone(o) { return JSON.parse(JSON.stringify(o)); }

// A valid screen verdict (Lane WSEQ, 2026-09-02) — every grade='record' fixture below that is not itself
// testing the screen check gets this attached, so those tests isolate the ONE thing under test instead of
// also incidentally tripping the new screen_verdict_missing failure.
const VALID_SCREEN = { verdict: "on_vertical", provenance: "rule", basis: "eur-lex regulatory instrument" };

// A minimal payload engineered to pass ALL seven criteria (baseline green). Every mutation test below
// clones this and breaks exactly one thing.
function basePayload() {
  return {
    item: {
      source_url: "https://example.gov/reg",
      item_type: "directive",
      priority: "MODERATE",
      title: "Example Directive",
      full_brief: "The rule enters into force on 1 January 2026. Compliance is required by 1 January 2027.",
    },
    source: { id: "src-1", url: "https://example.gov/reg", base_tier: 1, tier_override: null, status: "active", institution_id: null },
    registry_sources: [],
    sections: [
      { section_key: "body", section_order: 1, content_md: "The rule applies as described. https://example.gov/reg" },
    ],
    search_results: [
      {
        result_url: "https://example.gov/reg",
        result_content: "This regulation enters into force on 1 January 2026. Compliance is required by 1 January 2027 for all operators.",
        fetched_length: 112,
      },
    ],
    claims: [
      { section_key: "body", claim_kind: "FACT", claim_text: "[effective_date] The rule enters into force on 1 January 2026.", source_span: "enters into force on 1 January 2026", source_url: "https://example.gov/reg", slot_key: "effective_date" },
      { section_key: "body", claim_kind: "FACT", claim_text: "[primary_deadline] Compliance is required by 1 January 2027.", source_span: "by 1 January 2027", source_url: "https://example.gov/reg", slot_key: "primary_deadline" },
      { section_key: "body", claim_kind: "GAP", claim_text: "[jurisdictional_scope] not available from primary sources as of grounding", slot_key: "jurisdictional_scope" },
      { section_key: "body", claim_kind: "GAP", claim_text: "[penalty_summary] not available from primary sources as of grounding", slot_key: "penalty_summary" },
    ],
  };
}

test("baseline payload is GREEN: valid, no failures, recommended_status=verified", () => {
  const r = validateMintPayload(basePayload());
  assert.deepEqual(r.failures, []);
  assert.equal(r.valid, true);
  assert.equal(r.recommended_status, "verified");
  assert.equal(r.gate_a.orphan_count, 0);
});

// ── C1 ──────────────────────────────────────────────────────────────────
test("C1 RED: missing source.id -> missing_source_id", () => {
  const p = basePayload();
  p.source.id = "";
  const r = validateMintPayload(p);
  assert.ok(r.failures.some((f) => f.criterion === 1 && f.reason === "missing_source_id"));
  assert.equal(r.valid, false);
});

test("C1 RED: source status suspended -> source_not_active", () => {
  const p = basePayload();
  p.source.status = "suspended";
  const r = validateMintPayload(p);
  assert.ok(r.failures.some((f) => f.criterion === 1 && f.reason === "source_not_active"));
});

test("C1 RED: no base_tier and no tier_override -> source_tier_null", () => {
  const p = basePayload();
  p.source.base_tier = null;
  p.source.tier_override = null;
  const r = validateMintPayload(p);
  assert.ok(r.failures.some((f) => f.criterion === 1 && f.reason === "source_tier_null"));
});

// ── C2 ──────────────────────────────────────────────────────────────────
test("C2 RED: no non-blank section content -> no_section_content (fail-close, migration 119)", () => {
  const p = basePayload();
  p.sections = [{ section_key: "body", section_order: 1, content_md: "" }];
  const r = validateMintPayload(p);
  assert.deepEqual(r.failures, [{ criterion: 2, reason: "no_section_content" }]);
});

test("C2 RED: a citation URL on an unregistered host -> ungrounded_url", () => {
  const p = basePayload();
  p.sections[0].content_md += " also see https://not-a-known-host.example/page";
  const r = validateMintPayload(p);
  assert.ok(r.failures.some((f) => f.criterion === 2 && f.reason === "ungrounded_url"));
});

test("C2 GREEN: canonicalization tolerates www./trailing-slash/markdown-emphasis (migration 150)", () => {
  const p = basePayload();
  p.sections[0].content_md = "The rule applies as described. *https://www.example.gov/reg/*";
  const r = validateMintPayload(p);
  assert.ok(!r.failures.some((f) => f.criterion === 2));
});

// ── C3 ──────────────────────────────────────────────────────────────────
test("C3 RED: FACT with empty source_span -> fact_missing_source_span", () => {
  const p = basePayload();
  p.claims[0].source_span = "";
  const r = validateMintPayload(p);
  assert.ok(r.failures.some((f) => f.criterion === 3 && f.reason === "fact_missing_source_span"));
});

test("C3 RED: FACT span not verbatim in the cited source's fetched text -> fact_span_not_in_source", () => {
  const p = basePayload();
  p.claims[0].source_span = "a sentence that never appears in the fetched text";
  const r = validateMintPayload(p);
  assert.ok(r.failures.some((f) => f.criterion === 3 && f.reason === "fact_span_not_in_source"));
});

test("C3 RED: FACT below the reg-family authority floor (tier 5 source, floor is 2) -> fact_below_authority_floor", () => {
  const p = basePayload();
  p.source.base_tier = 5;
  const r = validateMintPayload(p);
  assert.ok(r.failures.some((f) => f.criterion === 3 && f.reason === "fact_below_authority_floor"));
});

test("C3 GREEN: a FACT citing a DOCUMENT URL under the registered INSTITUTION source resolves that source's tier (registry identity, 2026-09-02)", () => {
  // mint-run-008's shape: the registry row is the host root (registerSource dedups by institutionKey), the
  // fact cites the instrument's own page. Exact-URL resolution derived null and walled all 19 payloads.
  const p = basePayload();
  p.source = { id: "src-uk", url: "https://legislation.gov.uk/", base_tier: 1, tier_override: null, status: "active", institution_id: null };
  p.item.source_url = "https://www.legislation.gov.uk/uksi/2021/1095";
  p.sections[0].content_md = "The rule applies as described. https://www.legislation.gov.uk/uksi/2021/1095";
  p.search_results[0].result_url = "https://www.legislation.gov.uk/uksi/2021/1095";
  for (const c of p.claims) if (c.claim_kind === "FACT") c.source_url = "https://www.legislation.gov.uk/uksi/2021/1095";
  const r = validateMintPayload(p);
  assert.deepEqual(r.failures.filter((f) => f.reason === "fact_below_authority_floor"), [], JSON.stringify(r.failures));
  assert.equal(r.valid, true, JSON.stringify(r.failures));
});

test("C3 RED: registry identity does NOT cross institutions — a document on a different host than every registered source still derives null", () => {
  const p = basePayload();
  p.source = { id: "src-uk", url: "https://legislation.gov.uk/", base_tier: 1, tier_override: null, status: "active", institution_id: null };
  p.registry_sources = [{ id: "src-other", url: "https://example.gov/", base_tier: 1, tier_override: null, status: "active", institution_id: null }];
  p.search_results[0].result_url = "https://www.gov.uk/guidance/reg";
  p.sections[0].content_md = "The rule applies as described. https://www.gov.uk/guidance/reg";
  for (const c of p.claims) if (c.claim_kind === "FACT") c.source_url = "https://www.gov.uk/guidance/reg";
  const r = validateMintPayload(p);
  const floor = r.failures.filter((f) => f.reason === "fact_below_authority_floor");
  assert.equal(floor.length, 2);
  assert.equal(floor[0].source_tier_derived, null);
});

test("C3: exact canonical URL still wins over registry identity when both resolve (a per-document registry row keeps its own tier)", () => {
  const p = basePayload();
  p.source = { id: "src-root", url: "https://example.gov/", base_tier: 1, tier_override: null, status: "active", institution_id: null };
  p.registry_sources = [{ id: "src-doc", url: "https://example.gov/reg", base_tier: 5, tier_override: null, status: "active", institution_id: null }];
  const r = validateMintPayload(p);
  const floor = r.failures.filter((f) => f.reason === "fact_below_authority_floor");
  assert.equal(floor.length, 2);
  assert.equal(floor[0].source_tier_derived, 5);
});

test("C3 RED: FACT carrying a non-null mint_hold_reason -> fact_mint_hold (migration 206)", () => {
  const p = basePayload();
  p.claims[0].mint_hold_reason = "S-CONFLATE";
  const r = validateMintPayload(p);
  assert.ok(r.failures.some((f) => f.criterion === 3 && f.reason === "fact_mint_hold"));
});

// ── C4 ──────────────────────────────────────────────────────────────────
test("C4 RED: ANALYSIS claim text not carried by a recognized label paragraph -> analysis_missing_label_syntax", () => {
  const p = basePayload();
  p.sections[0].content_md += "\n\nThe workspace believes enforcement will tighten next year.";
  p.claims.push({ section_key: "body", claim_kind: "ANALYSIS", claim_text: "The workspace believes enforcement will tighten next year." });
  const r = validateMintPayload(p);
  assert.ok(r.failures.some((f) => f.criterion === 4 && f.reason === "analysis_missing_label_syntax"));
});

test("C4 GREEN: a properly labeled ANALYSIS claim passes", () => {
  const p = basePayload();
  p.sections[0].content_md += "\n\n*Analytical inference:* enforcement will likely tighten next year.";
  p.claims.push({ section_key: "body", claim_kind: "ANALYSIS", claim_text: "enforcement will likely tighten next year." });
  const r = validateMintPayload(p);
  assert.ok(!r.failures.some((f) => f.criterion === 4 && f.reason === "analysis_missing_label_syntax"));
});

test("C4 RED: LEGAL claim with no *Legal Confirmation Required:* callout anywhere -> legal_not_routed_to_callout", () => {
  const p = basePayload();
  p.claims.push({ section_key: "body", claim_kind: "LEGAL", claim_text: "Counsel should confirm the exemption applies." });
  const r = validateMintPayload(p);
  assert.ok(r.failures.some((f) => f.criterion === 4 && f.reason === "legal_not_routed_to_callout"));
});

test("C4 RED: unlabeled strong-modal prose with no label, no callout, no FACT in that section -> unlabeled_assertion", () => {
  const p = basePayload();
  p.sections.push({ section_key: "extra", section_order: 2, content_md: "Operators must register before shipment." });
  const r = validateMintPayload(p);
  assert.ok(r.failures.some((f) => f.criterion === 4 && f.reason === "unlabeled_assertion" && f.section_key === "extra"));
});

// ── C5 ──────────────────────────────────────────────────────────────────
test("C5 RED: a required slot with zero covering FACT/GAP claims -> missing_required_slot", () => {
  const p = basePayload();
  p.claims = p.claims.filter((c) => c.slot_key !== "penalty_summary");
  const r = validateMintPayload(p);
  assert.ok(r.failures.some((f) => f.criterion === 5 && f.reason === "missing_required_slot" && f.slot_key === "penalty_summary"));
});

// ── C6 ──────────────────────────────────────────────────────────────────
test("C6 RED: blank full_brief -> missing_full_brief", () => {
  const p = basePayload();
  p.item.full_brief = "   ";
  const r = validateMintPayload(p);
  assert.ok(r.failures.some((f) => f.criterion === 6 && f.reason === "missing_full_brief"));
});

// ── C7 (Gate A) ─────────────────────────────────────────────────────────
test("C7 RED: a factual token in full_brief with no covering FACT span -> gate_a_unproven_or_stale", () => {
  const p = basePayload();
  p.item.full_brief += " The fee is set at 12%.";
  const r = validateMintPayload(p);
  const f = r.failures.find((x) => x.criterion === 7 && x.reason === "gate_a_unproven_or_stale");
  assert.ok(f, "expected a Gate A orphan failure");
  assert.ok(f.orphans.some((o) => o.token === "12%"));
});

test("C7 GREEN: adding the covering FACT span clears the Gate A orphan", () => {
  const p = basePayload();
  p.item.full_brief += " The fee is set at 12%.";
  p.claims.push({ section_key: "body", claim_kind: "FACT", claim_text: "[penalty_summary] The fee is set at 12%.", source_span: "12%", source_url: "https://example.gov/reg" });
  p.search_results[0].result_content += " The fee is set at 12% of the shipment value.";
  p.search_results[0].fetched_length = p.search_results[0].result_content.length; // keep capture-complete
  const r = validateMintPayload(p);
  assert.ok(!r.failures.some((f) => f.criterion === 7));
});

// ── kit-level structural guard ──────────────────────────────────────────
test("kit RED: a claim referencing an unknown section_key is flagged (not a live C1-C7 number)", () => {
  const p = basePayload();
  p.claims.push({ section_key: "does-not-exist", claim_kind: "GAP", claim_text: "[x] stray" });
  const r = validateMintPayload(p);
  assert.ok(r.failures.some((f) => f.criterion === "kit" && f.reason === "claim_references_unknown_section_key"));
});

// ── canonicalize-citation-url unit ───────────────────────────────────────
test("canonicalizeCitationUrl matches migration 150's SQL: lowercase, strip */`, strip www., strip trailing /.,;:", () => {
  assert.equal(canonicalizeCitationUrl("HTTPS://WWW.Example.GOV/Reg/"), "https://example.gov/reg");
  assert.equal(canonicalizeCitationUrl("https://example.gov/reg*"), "https://example.gov/reg");
  assert.equal(canonicalizeCitationUrl("https://example.gov/reg."), "https://example.gov/reg");
  assert.equal(canonicalizeCitationUrl("https://example.gov/reg"), "https://example.gov/reg");
});

// ── Wave MH-3: capture-completeness gate ─────────────────────────────────────────────────────────
// mint-run-001.json's defects_found[0]: batch-001's six archived source files held only 2-12KB
// cited-excerpt windows for documents that were actually 43,813-178,953 chars -- nothing stopped a
// payload whose result_content was silently an excerpt. These tests exercise the new gate directly.

test("kit RED: search_results[] entry with no fetched_length -> missing_fetched_length", () => {
  const p = basePayload();
  delete p.search_results[0].fetched_length;
  const r = validateMintPayload(p);
  assert.ok(r.failures.some((f) => f.criterion === "kit" && f.reason === "missing_fetched_length" && f.result_index === 0));
});

test("kit RED: result_content far shorter than fetched_length (batch-001's real shape) -> capture_incomplete", () => {
  // Real batch-001 figures (BATCH-001-REPORT-v2.md §3, mint-run-001.json metrics): 32019R1242 was
  // fetched at 102,988 chars; its archived excerpt held only 2,621 chars -- a 2.5% capture ratio.
  const p = basePayload();
  p.search_results[0].fetched_length = 102988;
  // result_content stays the base payload's short excerpt (112 chars) -- exactly batch-001's shape.
  const r = validateMintPayload(p);
  const f = r.failures.find((x) => x.criterion === "kit" && x.reason === "capture_incomplete");
  assert.ok(f, "expected a capture_incomplete failure");
  assert.equal(f.fetched_length, 102988);
  assert.ok(f.ratio < 0.02, `expected a ~2% ratio, got ${f.ratio}`);
});

test("kit RED: result_content just over the tolerance but above the floor -> capture_length_mismatch (not capture_incomplete)", () => {
  const p = basePayload();
  const base = p.search_results[0].result_content; // 112 chars
  p.search_results[0].fetched_length = base.length + 200; // ratio ~0.36 -- wait, must stay >= 0.98 floor
  // Use a longer base so the ratio comfortably clears the 0.98 floor while the raw gap clears tolerance.
  p.search_results[0].result_content = base.repeat(50); // 5,600 chars
  p.search_results[0].fetched_length = 5700; // diff=100 (>50-char tolerance), ratio=5600/5700=0.982 (>=0.98 floor)
  const r = validateMintPayload(p);
  assert.ok(r.failures.some((f) => f.criterion === "kit" && f.reason === "capture_length_mismatch"));
  assert.ok(!r.failures.some((f) => f.criterion === "kit" && f.reason === "capture_incomplete"));
});

test("kit RED: result_content longer than fetched_length beyond tolerance -> capture_length_exceeds_fetched", () => {
  const p = basePayload();
  p.search_results[0].fetched_length = 10; // far shorter than the real 112-char result_content
  const r = validateMintPayload(p);
  assert.ok(r.failures.some((f) => f.criterion === "kit" && f.reason === "capture_length_exceeds_fetched"));
});

test("kit GREEN: fetched_length within tolerance of result_content.length -> no capture-completeness failure", () => {
  const p = basePayload(); // fetched_length: 112 === result_content.length exactly
  const r = validateMintPayload(p);
  assert.ok(!r.failures.some((f) => f.criterion === "kit" && String(f.reason).startsWith("capture_")));
  assert.ok(!r.failures.some((f) => f.criterion === "kit" && f.reason === "missing_fetched_length"));
});

test("kit RED: batch-001's actual six fetch/capture pairs all fail capture_incomplete (the retrofit proof)", () => {
  // The real recorded fetch table (BATCH-001-REPORT-v2.md §3 / mint-run-001.json's per-item verdicts):
  // 43813 / 12237 / 75954 / 102988 / 174417 / 178953, against archived excerpts of a few KB each.
  const fetchedLengths = [43813, 12237, 75954, 102988, 174417, 178953];
  for (const fetchedLength of fetchedLengths) {
    const p = basePayload();
    p.search_results[0].fetched_length = fetchedLength; // result_content stays the 112-char excerpt
    const r = validateMintPayload(p);
    const f = r.failures.find((x) => x.criterion === "kit" && x.reason === "capture_incomplete");
    assert.ok(f, `expected capture_incomplete for fetched_length=${fetchedLength}`);
    assert.ok(f.ratio < CAPTURE_COMPLETENESS_FLOOR_FOR_TEST, `ratio ${f.ratio} should be well under the floor`);
  }
});
const CAPTURE_COMPLETENESS_FLOOR_FOR_TEST = 0.98; // mirrors validate-mint-payload.mjs's own constant

// ── Wave MH-3: unicode integrity ─────────────────────────────────────────────────────────────────
// mint-run-001.json's defects_found[1]+[2]: an ASCII 'x' substituted for the source's real '×' in
// 32019R1242's Article 8 formula / jurisdictional_scope span, and curly quotes substituted for the
// source's straight quotes around 'CBAM' in 32023R0956 -- BOTH passed criterion 3 clean because the
// SAME wrong character was typed into both source_span and result_content. These are RED cases
// reproducing those two actual bugs, using the real archived-source strings (verbatim, copied from
// source-32019R1242.txt / source-32023R0956.txt) as the independent archive the gate checks against.

function unicodePayload({ sourceSpan, resultContent, claimText, archivedSourcePath }) {
  const p = basePayload();
  p.claims = [
    {
      section_key: "body",
      claim_kind: "FACT",
      claim_text: claimText,
      source_span: sourceSpan,
      source_url: "https://example.gov/reg",
      slot_key: null,
    },
    // GAP-cover all four required "directive" slots (item-type-required-slots.json) unconditionally so
    // criterion 5 never confounds these unicode-integrity-focused tests -- the FACT claim above already
    // covers whichever slot its own claimText brackets, redundant coverage is harmless.
    { section_key: "body", claim_kind: "GAP", claim_text: "[effective_date] not available from primary sources as of grounding", slot_key: "effective_date" },
    { section_key: "body", claim_kind: "GAP", claim_text: "[jurisdictional_scope] not available from primary sources as of grounding", slot_key: "jurisdictional_scope" },
    { section_key: "body", claim_kind: "GAP", claim_text: "[penalty_summary] not available from primary sources as of grounding", slot_key: "penalty_summary" },
    { section_key: "body", claim_kind: "GAP", claim_text: "[primary_deadline] not available from primary sources as of grounding", slot_key: "primary_deadline" },
  ];
  p.sections[0].content_md = "The rule applies as described. https://example.gov/reg";
  p.item.full_brief = "The rule applies as described.";
  p.search_results[0].result_content = resultContent;
  p.search_results[0].fetched_length = resultContent.length;
  p.search_results[0].archived_source_path = archivedSourcePath;
  return p;
}

test("kit RED: batch-001's real × -> x bug (32019R1242) -- span AND result_content share the mistranscription, C3 alone would miss it", () => {
  // The real corrupted form: an ASCII 'x' where the source has '×' (multiplication sign) -- typed
  // identically into both the claim's source_span and the payload's own result_content, exactly as
  // batch-001's actual bug did before it was caught by an independent cross-check, not by C3.
  const brokenSpan = "(Excess CO2 emissions premium) = (Excess CO2 emissions x 4 250 EUR/gCO2/tkm)";
  const p = unicodePayload({
    sourceSpan: brokenSpan,
    resultContent: `Article 8 Compliance with the specific CO2 emissions targets 1. Where a manufacturer is found, pursuant to paragraph 2, to have excess CO2 emissions in a given reporting period from 2025 onwards, the Commission shall impose an excess CO2 emissions premium, calculated in accordance with the following formula: (a) from 2025 to 2029, ${brokenSpan}`,
    claimText: "[penalty_summary] Excess CO2 emissions premium formula, Article 8.",
    archivedSourcePath: resolve(TESTDATA_DIR, "archived-source-32019R1242-excerpt.txt"),
  });

  // Sanity: criterion 3 (payload-internal only) does NOT catch this -- confirms the historical gap.
  const rWithoutArchive = validateMintPayload(clone({ ...p, search_results: [{ ...p.search_results[0], archived_source_path: null }] }));
  assert.ok(!rWithoutArchive.failures.some((f) => f.criterion === 3 && f.reason === "fact_span_not_in_source"),
    "criterion 3 alone should NOT catch a corruption shared by both payload fields -- this is the documented gap");

  const r = validateMintPayload(p);
  const f = r.failures.find((x) => x.criterion === "kit" && x.reason === "fact_span_matches_payload_only_not_archive");
  assert.ok(f, "expected the archive cross-check to catch what C3 missed");
  assert.equal(f.substitution.class, "multiplication_sign");
  assert.equal(r.valid, false);
});

test("kit RED: batch-001's real curly-vs-straight-quote bug (32023R0956) -- span AND result_content share the mistranscription", () => {
  // The real corrupted form: curly quotation marks around 'CBAM' where the source has straight quotes.
  const brokenSpan = "This Regulation establishes a carbon border adjustment mechanism (the ‘CBAM’) to address greenhouse gas emissions embedded in the goods listed in Annex I on their importation into the customs territory of the Union";
  const p = unicodePayload({
    sourceSpan: brokenSpan,
    resultContent: `Article 1 Subject matter 1. ${brokenSpan} in order to prevent the risk of carbon leakage.`,
    claimText: "[jurisdictional_scope] CBAM subject matter and scope, Article 1.",
    archivedSourcePath: resolve(TESTDATA_DIR, "archived-source-32023R0956-excerpt.txt"),
  });

  const r = validateMintPayload(p);
  const f = r.failures.find((x) => x.criterion === "kit" && x.reason === "fact_span_matches_payload_only_not_archive");
  assert.ok(f, "expected the archive cross-check to catch what C3 missed");
  assert.equal(f.substitution.class, "curly_single_quote");
  assert.equal(r.valid, false);
});

test("kit RED: source_span alone (not result_content) carries the substitution -> fact_span_unicode_substitution", () => {
  // A different, narrower scenario than the two real bugs above: result_content is clean (matches the
  // archive), but the CLAIM's source_span alone was mistyped -- criterion 3's loose match would already
  // catch most of this (× and x differ under a case-insensitive compare too), but this test locks in
  // that the new check names the specific substitution class rather than only the generic "not found".
  const cleanFormula = "(Excess CO2 emissions premium) = (Excess CO2 emissions × 4 250 EUR/gCO2/tkm)";
  const brokenSpan = cleanFormula.replace("×", "x");
  const p = unicodePayload({
    sourceSpan: brokenSpan,
    resultContent: `Article 8 formula: ${cleanFormula}`,
    claimText: "[penalty_summary] Excess CO2 emissions premium formula, Article 8.",
    archivedSourcePath: resolve(TESTDATA_DIR, "archived-source-32019R1242-excerpt.txt"),
  });
  const r = validateMintPayload(p);
  assert.ok(r.failures.some((f) => f.criterion === 3 && f.reason === "fact_span_not_in_source"),
    "C3 should also fail here since result_content itself doesn't contain the broken span");
  const f = r.failures.find((x) => x.criterion === "kit" && x.reason === "fact_span_unicode_substitution");
  assert.ok(f, "expected the unicode-substitution reason naming the multiplication_sign class");
  assert.equal(f.substitution_class, "multiplication_sign");
});

test("kit GREEN: span, result_content, and the archived source all agree character-for-character -> no unicode-integrity failure", () => {
  const cleanSpan = "This Regulation establishes a carbon border adjustment mechanism (the 'CBAM') to address greenhouse gas emissions embedded in the goods listed in Annex I on their importation into the customs territory of the Union";
  const p = unicodePayload({
    sourceSpan: cleanSpan,
    resultContent: `Article 1 Subject matter 1. ${cleanSpan} in order to prevent the risk of carbon leakage.`,
    claimText: "[jurisdictional_scope] CBAM subject matter and scope, Article 1.",
    archivedSourcePath: resolve(TESTDATA_DIR, "archived-source-32023R0956-excerpt.txt"),
  });
  const r = validateMintPayload(p);
  assert.ok(!r.failures.some((f) => f.criterion === "kit" && String(f.reason).startsWith("fact_span_")));
});

test("kit RED: archived_source_path names a file that does not exist -> archived_source_path_unreadable", () => {
  const p = unicodePayload({
    sourceSpan: "some span",
    resultContent: "some span appears in this result content",
    claimText: "[penalty_summary] some claim",
    archivedSourcePath: resolve(TESTDATA_DIR, "does-not-exist.txt"),
  });
  const r = validateMintPayload(p);
  assert.ok(r.failures.some((f) => f.criterion === "kit" && f.reason === "archived_source_path_unreadable"));
});

test("kit RED: prose scan catches a substitution-class divergence in full_brief against the archived source", () => {
  const p = basePayload();
  p.search_results[0].archived_source_path = resolve(TESTDATA_DIR, "archived-source-32023R0956-excerpt.txt");
  p.search_results[0].fetched_length = p.search_results[0].result_content.length;
  p.item.full_brief =
    "This Regulation establishes a carbon border adjustment mechanism (the ‘CBAM’) to address greenhouse gas emissions embedded in the goods listed in Annex I on their importation into the customs territory of the Union.";
  const r = validateMintPayload(p);
  const f = r.failures.find((x) => x.criterion === "kit" && x.reason === "prose_unicode_substitution");
  assert.ok(f, "expected the prose scan to flag the curly-quote divergence in full_brief");
  assert.equal(f.substitution_class, "curly_single_quote");
  assert.equal(f.location, "full_brief");
});

// ── Lane POP (2026-09-01, migration 278): grade discriminator ────────────────────────────────────────
// basePayload() carries only FACT/GAP claims, and its full_brief already textually contains both FACT
// claims' source_span verbatim -- so it satisfies BOTH record-purity kit checks unmodified, and setting
// item.grade="record" on an unmutated clone is itself a real, meaningful assertion (not a fixture built
// backwards from the check).

test("grade omitted (absent from item{}) behaves EXACTLY like grade='brief' -- the discriminator is a strict addition, not a behavior change", () => {
  const withGrade = basePayload();
  withGrade.item.grade = "brief";
  const withoutGrade = basePayload(); // no .grade field at all
  const r1 = validateMintPayload(withGrade);
  const r2 = validateMintPayload(withoutGrade);
  assert.deepEqual(r1, r2, "an explicit grade:'brief' and an absent grade field must validate identically");
  assert.deepEqual(r2.failures, [], "brief-grade behavior (this file's whole existing suite) is unchanged by the discriminator's addition");
});

test("grade='record' GREEN: a payload whose claims are already FACT/GAP-only, whose full_brief already quotes every FACT span, and whose screen verdict is on_vertical passes with zero failures", () => {
  const p = basePayload();
  p.item.grade = "record";
  p.screen = VALID_SCREEN;
  const r = validateMintPayload(p);
  assert.deepEqual(r.failures, []);
  assert.equal(r.valid, true);
  assert.equal(r.recommended_status, "verified");
});

test("grade='record' RED: an ANALYSIS claim in a record-grade payload -> record_grade_forbidden_claim_kind (no synthesis)", () => {
  const p = basePayload();
  p.item.grade = "record";
  p.screen = VALID_SCREEN;
  p.claims.push({
    section_key: "body",
    claim_kind: "ANALYSIS",
    claim_text: "*Per the workspace's reading:* this rule is significant for operators.",
    slot_key: null,
  });
  const r = validateMintPayload(p);
  const f = r.failures.find((x) => x.criterion === "kit" && x.reason === "record_grade_forbidden_claim_kind");
  assert.ok(f, "an ANALYSIS claim must be rejected on a record-grade payload");
  assert.equal(f.claim_kind, "ANALYSIS");
});

test("grade='record' RED: a LEGAL claim in a record-grade payload is also forbidden (same rule, different kind)", () => {
  const p = basePayload();
  p.item.grade = "record";
  p.screen = VALID_SCREEN;
  p.claims.push({ section_key: "body", claim_kind: "LEGAL", claim_text: "*Legal confirmation required:* consult counsel.", slot_key: null });
  const r = validateMintPayload(p);
  assert.ok(r.failures.some((x) => x.criterion === "kit" && x.reason === "record_grade_forbidden_claim_kind" && x.claim_kind === "LEGAL"));
});

test("grade='record' RED: a FACT claim whose source_span is NOT quoted in full_brief -> record_grade_full_brief_not_extractive", () => {
  const p = basePayload();
  p.item.grade = "record";
  p.screen = VALID_SCREEN;
  // full_brief no longer contains this FACT's source_span verbatim -- the 'short extracted description'
  // must be built ONLY from the payload's own FACT spans; a paraphrase (even an accurate one) fails.
  p.item.full_brief = "The rule takes effect at the start of next year. Compliance is required by 1 January 2027.";
  const r = validateMintPayload(p);
  const f = r.failures.find((x) => x.criterion === "kit" && x.reason === "record_grade_full_brief_not_extractive");
  assert.ok(f, "a FACT source_span absent from full_brief must fail the extractive-only check on a record-grade payload");
  assert.equal(f.source_span, "enters into force on 1 January 2026");
});

test("grade='record': the SAME ANALYSIS payload is untouched (still GREEN on that check) when grade is 'brief' or absent -- the purity checks are grade-gated, not global", () => {
  const p = basePayload();
  p.claims.push({
    section_key: "body",
    claim_kind: "ANALYSIS",
    claim_text: "*Per the workspace's reading:* not backed anywhere; would need C4 label discipline to pass, unrelated to record-purity.",
    slot_key: null,
  });
  // Deliberately NOT setting item.grade -> defaults to "brief" -> record-purity checks never run.
  const r = validateMintPayload(p);
  assert.ok(!r.failures.some((f) => f.reason === "record_grade_forbidden_claim_kind"), "record-purity must never fire for grade='brief'/absent");
});

test("grade='record': C1-C7 still apply in full (grade is additive, never a bypass) -- a bad source still fails criterion 1", () => {
  const p = basePayload();
  p.item.grade = "record";
  p.screen = VALID_SCREEN;
  p.source.status = "suspended";
  const r = validateMintPayload(p);
  assert.ok(r.failures.some((f) => f.criterion === 1 && f.reason === "source_not_active"), "criterion 1 must still fire on a record-grade payload");
});

// ── Lane WSEQ (2026-09-02): the screen-verdict kit check ─────────────────────────────────────────────
// Three population-turn apply runs minted ~half off-vertical record-grade items from an unscreened pool
// (MINT-RUNBOOK.md's "relevance screen is part of the export"); this check makes payload.screen a
// mechanically-enforced, not merely conventional, part of every record-grade payload.

test("grade='record' RED: no screen field at all -> screen_verdict_missing (this is what a payload built before the field existed, or with a forgotten screen, looks like)", () => {
  const p = basePayload();
  p.item.grade = "record";
  // Deliberately NOT setting p.screen.
  const r = validateMintPayload(p);
  const f = r.failures.find((x) => x.criterion === "kit" && x.reason === "screen_verdict_missing");
  assert.ok(f, "a record-grade payload with no screen field must fail screen_verdict_missing");
  assert.equal(f.screen, null);
  assert.equal(r.valid, false);
});

test("grade='record' RED: a screen object missing basis (empty string) -> screen_verdict_missing, not silently accepted", () => {
  const p = basePayload();
  p.item.grade = "record";
  p.screen = { verdict: "on_vertical", provenance: "rule", basis: "" };
  const r = validateMintPayload(p);
  assert.ok(r.failures.some((x) => x.criterion === "kit" && x.reason === "screen_verdict_missing"), "a blank basis is not a usable screen verdict");
});

test("grade='record' RED: a screen object with an unrecognized provenance -> screen_verdict_missing (malformed, not trusted)", () => {
  const p = basePayload();
  p.item.grade = "record";
  p.screen = { verdict: "on_vertical", provenance: "guess", basis: "looks EU-shaped" };
  const r = validateMintPayload(p);
  assert.ok(r.failures.some((x) => x.criterion === "kit" && x.reason === "screen_verdict_missing"));
});

test("grade='record' RED: screen.verdict='off_vertical' -> screen_verdict_not_on_vertical (the payload's own evidence says it should never have minted)", () => {
  const p = basePayload();
  p.item.grade = "record";
  p.screen = { verdict: "off_vertical", provenance: "rule", basis: "USCG safety zone — off vertical" };
  const r = validateMintPayload(p);
  const f = r.failures.find((x) => x.criterion === "kit" && x.reason === "screen_verdict_not_on_vertical");
  assert.ok(f, "an off_vertical screen verdict must quarantine a record-grade payload");
  assert.equal(f.verdict, "off_vertical");
  assert.equal(r.valid, false);
});

test("grade='record' RED: screen.verdict='ambiguous' -> screen_verdict_not_on_vertical (only on_vertical mints, per isMintable)", () => {
  const p = basePayload();
  p.item.grade = "record";
  p.screen = { verdict: "ambiguous", provenance: "rule", basis: "no rule fired either way" };
  const r = validateMintPayload(p);
  assert.ok(r.failures.some((x) => x.criterion === "kit" && x.reason === "screen_verdict_not_on_vertical" && x.verdict === "ambiguous"));
});

test("grade='record': the screen check never fires for grade='brief'/absent -- it is grade-gated, exactly like the record-purity checks", () => {
  const p = basePayload();
  // Deliberately NOT setting item.grade or p.screen.
  const r = validateMintPayload(p);
  assert.deepEqual(r.failures, [], "a brief-grade (default) payload with no screen field must still be GREEN — the screen gates the record tier's exporter only");
});
