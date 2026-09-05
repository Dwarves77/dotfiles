// heal-provenance.test.mjs — node --test scripts/mint/heal-provenance.test.mjs. No DB, no network: every
// I/O-touching function here is exercised with injected deps/fetchImpl stubs, per the lane contract.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";

import {
  HEAL_VERSION,
  loadRequiredSlots,
  claimCoversSlot,
  missingRequiredSlots,
  buildNormalizedIndex,
  locateSpanInText,
  containsCaseInsensitive,
  diceCoefficient,
  findClosestFuzzyMatch,
  needsCapture,
  resolveCaptureUrl,
  envelopeFromPlainGet,
  captureItem,
  buildCaptureSearchRow,
  planGroundingForClaim,
  buildSlotClaim,
  bestCaptureText,
  findSearchIdForSpan,
  planGateA,
  shouldUnarchive,
  parseSelection,
  resolveSlotsBackfillCandidates,
  // KIT-BACKFILL (2026-09-05, lane KIT-BACKFILL, W2.3/W2.4)
  requiredSlotItemTypes,
  resolveKitBackfillCandidates,
  healOneItem,
  summarizeReports,
  main,
  // second pass (HEAL-2)
  REG_FAMILY,
  floorMaxFor,
  isFloorArmed,
  deriveSourceTier,
  effectiveFloorForClaim,
  buildSourcesIndex,
  claimNeedsResource,
  buildUrlVariants,
  buildOwnCanonicalBucket,
  buildTierQualifyingBucket,
  buildCorpusPoolBucket,
  planResourceForClaim,
  resolveInstitutionKeyForSource,
  findOwningSection,
  buildOrphanClaimText,
  planOrphanGrounding,
  splitParagraphsPreserving,
  planRelabelParagraph,
  planRelabelModalParagraph,
  sectionNeedsRelabel,
  reclassifyReason,
  // third pass (HEAL-3)
  extractSlotKeyFromMarker,
  isRequiredSlotMarkerClaim,
  CAPTURE_CITED_MAX_PER_ITEM,
  collectCitedUrls,
  unfetchedCitedUrls,
  captureCitedUrl,
  // fourth pass (HEAL-4)
  overlapTokens,
  jaccardTokenOverlap,
  OWNING_PARAGRAPH_MIN_SCORE,
  findOwningParagraphByOverlap,
  splitSentences,
  pickBestSentence,
  stripLeadingMarker,
  planOwningParagraphRewrite,
  // fifth pass (CITED-HELD, 2026-09-04)
  parseOjReference,
  cellarEndpointForOj,
  waybackAvailabilityUrl,
  parseWaybackAvailability,
  waybackSnapshotFetchUrl,
  // sixth pass (HEAL-BUDGET, 2026-09-04)
  writeCheckpoint,
  buildSummaryObject,
  // seventh pass (HEAL-6, 2026-09-04)
  MIN_SUBSTANTIVE_TOKENS,
  isSubstantiveParagraph,
  findOwningParagraphAcrossSections,
  planOwningParagraphRewriteAcrossSections,
  computeDerivedCovered,
  // eighth pass (HEAL-7, 2026-09-04) — STEP SOURCE
  SOURCE_MAX_CANDIDATE_URLS_PER_ORPHAN,
  SOURCE_MAX_PER_ITEM,
  classifyCitedUrlForOrphan,
  candidateUrlsForOrphan,
  // ninth pass (HEAL-8, 2026-09-04) — numeric-tolerant matching, one-hop follow, sentence context
  buildNumericNormalizedIndex,
  SOURCE_MAX_HOP_LINKS_PER_TOKEN,
  extractHopLinks,
  classifyHopLink,
  hopLinksForToken,
  extractSentenceContext,
  // tenth pass (HEAL-10, 2026-09-04) — Tasks 1-4
  buildCaptureIndex,
  getCaptureIndex,
  containsCaseInsensitiveCached,
  locateSpanInTextIndexed,
  locateSpanInTextCached,
  computeItemTimeBudgetSeconds,
  sentenceSpans,
  findSentenceSpanForToken,
  removeSentenceSpan,
  planStripUnprovableClause,
  planStripUnprovableSentence,
  planBriefHonest,
  planRelabelFromFullBrief,
} from "./heal-provenance.mjs";
import { norm } from "../../src/lib/agent/gate-a-match.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

test("HEAL_VERSION is a stamped string", () => {
  assert.match(HEAL_VERSION, /^hp10-/);
});

// ── loadRequiredSlots / claimCoversSlot / missingRequiredSlots ──────────────────────────────────────

test("loadRequiredSlots reads the real kit file and includes the wave-3 slots", () => {
  const map = loadRequiredSlots();
  assert.ok(map.market_signal.includes("corridor_identity"));
  assert.ok(map.research_finding.includes("evidence_agreement_signal"));
  assert.ok(map.regulation.includes("primary_deadline"));
});

test("loadRequiredSlots reads a custom path (DI-testable, matches export-census-rows.mjs's own pattern)", () => {
  const dir = mkdtempSync(resolve(tmpdir(), "heal-slots-"));
  const path = resolve(dir, "slots.json");
  writeFileSync(path, JSON.stringify({ widget: ["a_slot"], _comment: "ignored, not an array" }));
  assert.deepEqual(loadRequiredSlots(path), { widget: ["a_slot"] });
});

test("claimCoversSlot: FACT/GAP with slot_key literal in claim_text, case-insensitive", () => {
  assert.equal(claimCoversSlot({ claim_kind: "FACT", claim_text: "[primary_deadline] states X" }, "primary_deadline"), true);
  assert.equal(claimCoversSlot({ claim_kind: "GAP", claim_text: "[PRIMARY_DEADLINE] not stated" }, "primary_deadline"), true);
  assert.equal(claimCoversSlot({ claim_kind: "ANALYSIS", claim_text: "[primary_deadline] mentioned" }, "primary_deadline"), false, "ANALYSIS never counts");
  assert.equal(claimCoversSlot({ claim_kind: "FACT", claim_text: "unrelated" }, "primary_deadline"), false);
  assert.equal(claimCoversSlot(null, "x"), false);
});

test("missingRequiredSlots: only slots no claim covers, item_type with no entry -> nothing required", () => {
  const map = { regulation: ["effective_date", "primary_deadline"] };
  const claims = [{ claim_kind: "GAP", claim_text: "[effective_date] not stated" }];
  assert.deepEqual(missingRequiredSlots("regulation", claims, map), ["primary_deadline"]);
  assert.deepEqual(missingRequiredSlots("unknown_type", claims, map), []);
});

// ── buildNormalizedIndex / locateSpanInText ─────────────────────────────────────────────────────────

test("buildNormalizedIndex: whitespace runs collapse, position map resolves back to original", () => {
  const { normalized, map } = buildNormalizedIndex("a  \n\t b");
  assert.equal(normalized, "a b");
  assert.equal(map[0], 0); // 'a'
  assert.equal(map[2], 6); // 'b' after the collapsed run
});

test("buildNormalizedIndex: curly quotes fold to straight, soft hyphen drops", () => {
  const { normalized } = buildNormalizedIndex("“Member States’­ obligation”");
  assert.equal(normalized, '"Member States\' obligation"');
});

test("buildNormalizedIndex: HTML entities decode to their single character", () => {
  const { normalized } = buildNormalizedIndex("Fish &amp; Chips &#39;co&#x2019;");
  assert.equal(normalized, "Fish & Chips 'co’");
});

test("locateSpanInText: exact literal match, cheapest path", () => {
  const r = locateSpanInText("shall apply from 1 January 2027", "Text: shall apply from 1 January 2027, more.");
  assert.equal(r.method, "exact");
  assert.equal(r.span, "shall apply from 1 January 2027");
});

test("locateSpanInText: whitespace/quote drift resolved under normalization, returns ORIGINAL slice", () => {
  const hay = 'The Council states “member   states\nshall  comply” by the deadline.';
  const r = locateSpanInText('"member states shall comply"', hay);
  assert.equal(r.method, "normalized");
  // the returned span is a verbatim slice of hay (its own curly quotes/newlines), not the normalized form
  assert.ok(hay.includes(r.span));
  assert.match(r.span, /member\s+states\s+shall\s+comply/);
});

test("locateSpanInText: case-insensitive fallback when case itself is the only mismatch after normalization", () => {
  const r = locateSpanInText("MEMBER STATES SHALL COMPLY", "the member states shall comply immediately");
  assert.equal(r.method, "normalized_ci");
  assert.equal(r.span.toLowerCase(), "member states shall comply");
});

test("locateSpanInText: not found anywhere -> null", () => {
  assert.equal(locateSpanInText("nowhere to be found", "totally unrelated text"), null);
  assert.equal(locateSpanInText("", "some text"), null);
  assert.equal(locateSpanInText("x", ""), null);
});

test("containsCaseInsensitive: matches DB criterion-3's own case-insensitive substring test", () => {
  assert.equal(containsCaseInsensitive("The QUICK Fox", "quick fox"), true);
  assert.equal(containsCaseInsensitive("The Quick Fox", "  Quick Fox  "), true, "btrim'd");
  assert.equal(containsCaseInsensitive("The Quick Fox", "slow fox"), false);
  assert.equal(containsCaseInsensitive(null, "x"), false);
});

// ── fuzzy fallback ───────────────────────────────────────────────────────────────────────────────────

test("diceCoefficient: identical strings score 1, disjoint strings score low", () => {
  assert.equal(diceCoefficient("hello world", "hello world"), 1);
  assert.ok(diceCoefficient("hello world", "zzz qqq") < 0.2);
  assert.equal(diceCoefficient("", "x"), 0);
});

test("findClosestFuzzyMatch: finds a near-miss window and reports its score/location", () => {
  const hay = "Some prose. Member States shal comply promptly with this provision. More prose.";
  const best = findClosestFuzzyMatch("Member States shall comply promptly", hay);
  assert.ok(best.score > 0.8, `expected a high fuzzy score, got ${best.score}`);
  assert.match(best.window.toLowerCase(), /states/);
});

test("findClosestFuzzyMatch: null for empty inputs", () => {
  assert.equal(findClosestFuzzyMatch("", "text"), null);
  assert.equal(findClosestFuzzyMatch("text", ""), null);
});

// ── CAPTURE ──────────────────────────────────────────────────────────────────────────────────────────

test("needsCapture: true only when no capture exceeds 200 trimmed chars", () => {
  assert.equal(needsCapture([]), true);
  assert.equal(needsCapture([{ result_content: "short" }]), true);
  assert.equal(needsCapture([{ result_content: "x".repeat(201) }]), false);
});

test("resolveCaptureUrl: item.source_url wins, falls back to the source-registry url", () => {
  assert.equal(resolveCaptureUrl({ source_url: "https://a.example/doc" }, "https://b.example"), "https://a.example/doc");
  assert.equal(resolveCaptureUrl({ source_url: null }, "https://b.example"), "https://b.example");
  assert.equal(resolveCaptureUrl({ source_url: null }, null), null);
});

test("envelopeFromPlainGet: usable only past the >200-char floor, mirrors buildExportRow's own threshold", () => {
  const short = envelopeFromPlainGet({ ok: true, status: 200, html: "<p>hi</p>", text: "hi", error: null }, "https://x");
  assert.equal(short.usable, false);
  const long = envelopeFromPlainGet({ ok: true, status: 200, html: "x".repeat(300), text: "x".repeat(300), error: null }, "https://x");
  assert.equal(long.usable, true);
  assert.equal(long.text.length, 300);
});

test("captureItem: no url -> held no_source_url, no fetch attempted", async () => {
  let fetched = false;
  const r = await captureItem({}, null, { fetchImpl: async () => { fetched = true; } });
  assert.equal(r.status, "held");
  assert.equal(r.reason, "no_source_url");
  assert.equal(fetched, false);
});

test("captureItem: eurlex host with no resolvable CELEX key -> held canonical_key_unresolved, no fetch", async () => {
  let fetched = false;
  const r = await captureItem(
    { canonical_instrument_key: null, instrument_identifier: null },
    "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=NOTACELEX",
    { fetchImpl: async () => { fetched = true; } },
  );
  assert.equal(r.status, "held");
  assert.equal(r.reason, "canonical_key_unresolved");
  assert.equal(fetched, false);
});

test("captureItem: federal_register host with no document number -> held, no fetch", async () => {
  let fetched = false;
  const r = await captureItem({}, "https://www.federalregister.gov/d/2026-00000", { fetchImpl: async () => { fetched = true; } });
  assert.equal(r.status, "held");
  assert.equal(r.reason, "fr_document_number_unresolved");
  assert.equal(fetched, false);
});

test("captureItem: plain-GET family (host none of eurlex/federal_register) captures on a usable response", async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    text: async () => "<html><title>A Real Title</title><body>" + "content ".repeat(60) + "</body></html>",
  });
  const r = await captureItem({}, "https://example-regulator.gov/notice/42", { fetchImpl });
  assert.equal(r.status, "captured");
  assert.ok(r.text.length > 200);
  assert.equal(r.evidence.status, 200);
});

test("captureItem: plain-GET family holds capture_blocked_no_archive when both the direct fetch AND the Wayback archive fallback refuse (FIFTH PASS)", async () => {
  // The one fetchImpl every call in this module shares refuses every URL alike -- direct AND the archive
  // availability lookup AND (had it gotten that far) the snapshot fetch. capture_blocked_no_archive is
  // the correct, honest end state: neither the publisher nor its Wayback copy answered.
  const fetchImpl = async () => ({ ok: false, status: 404, text: async () => "not found" });
  const r = await captureItem({}, "https://example-regulator.gov/gone", { fetchImpl });
  assert.equal(r.status, "held");
  assert.equal(r.reason, "capture_blocked_no_archive");
  assert.equal(r.evidence.direct.status, 404);
  assert.equal(r.evidence.archive_availability.error, "HTTP 404");
});

test("captureItem: plain-GET family, direct blocked but a Wayback snapshot exists -> captured via the archive, result_url stays the CITED url", async () => {
  const citedUrl = "https://example-regulator.gov/gone-but-archived";
  const fetchImpl = async (url) => {
    if (String(url).startsWith("https://archive.org/wayback/available")) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            archived_snapshots: {
              closest: { available: true, status: "200", timestamp: "20250601000000", url: `http://web.archive.org/web/20250601000000/${citedUrl}` },
            },
          }),
      };
    }
    if (String(url).startsWith("https://web.archive.org/web/20250601000000id_/")) {
      return { ok: true, status: 200, text: async () => "<html><title>Archived</title><body>" + "archived content ".repeat(30) + "</body></html>" };
    }
    return { ok: false, status: 403, text: async () => "forbidden" };
  };
  const r = await captureItem({}, citedUrl, { fetchImpl });
  assert.equal(r.status, "captured");
  assert.equal(r.url, citedUrl);
  assert.ok(r.text.length > 200);
  assert.equal(r.evidence.transport, "wayback");
  assert.equal(r.evidence.snapshot_timestamp, "20250601000000");
});

test("captureItem: plain-GET family, direct response reaches (200) but text falls short of the 200-char floor -> held capture_thin (distinct from a bot-gate capture_blocked), archive also refused", async () => {
  const fetchImpl = async (url) => {
    if (String(url).startsWith("https://archive.org/wayback/available")) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ archived_snapshots: {} }) };
    }
    return { ok: true, status: 200, text: async () => "<p>hi</p>" }; // real 200, real (short) body -- never a block
  };
  const r = await captureItem({}, "https://example-regulator.gov/near-empty", { fetchImpl });
  assert.equal(r.status, "held");
  assert.equal(r.reason, "capture_thin_no_archive");
  assert.equal(r.evidence.direct.status, 200);
  assert.equal(r.evidence.direct.bytes, Buffer.byteLength("<p>hi</p>", "utf8")); // the byte count is in evidence
});

// ── OJ-REFERENCE RESOLUTION (FIFTH PASS): parseOjReference / cellarEndpointForOj, then the integration
//    through captureItem/captureCitedUrl for the canonical_key_unresolved OJ-issue residue ─────────────

test("parseOjReference: concatenated form (OJ:L_202500040, no separator between year and issue)", () => {
  const ref = parseOjReference("https://eur-lex.europa.eu/legal-content/EN/TXT?uri=OJ:L_202500040");
  assert.deepEqual(ref, { series: "L", year: "2025", issue: "00040", edition: null });
});

test("parseOjReference: underscore form (OJ:L_2025_040) and the C series", () => {
  assert.deepEqual(
    parseOjReference("https://eur-lex.europa.eu/legal-content/EN/TXT?uri=OJ:L_2025_040"),
    { series: "L", year: "2025", issue: "00040", edition: null },
  );
  assert.deepEqual(
    parseOjReference("https://eur-lex.europa.eu/legal-content/EN/TXT?uri=OJ:C_2025_226"),
    { series: "C", year: "2025", issue: "00226", edition: null },
  );
});

test("parseOjReference: already Cellar-ID-shaped form (OJ:JOL_2025_040_R), edition letter read verbatim", () => {
  assert.deepEqual(
    parseOjReference("https://eur-lex.europa.eu/legal-content/EN/TXT?uri=OJ:JOL_2025_040_R"),
    { series: "L", year: "2025", issue: "00040", edition: "R" },
  );
  assert.deepEqual(
    parseOjReference("https://eur-lex.europa.eu/legal-content/EN/TXT?uri=OJ:JOC_2025_226_C"),
    { series: "C", year: "2025", issue: "00226", edition: "C" },
  );
});

test("parseOjReference: a CELEX/ELI uri= value, or no uri= at all, is null -- the existing canonical_key_unresolved hold is untouched", () => {
  assert.equal(parseOjReference("https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=NOTACELEX"), null);
  assert.equal(parseOjReference("https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32023R1234"), null);
  assert.equal(parseOjReference("https://eur-lex.europa.eu/legal-content/EN/TXT/"), null);
});

test("cellarEndpointForOj: the Publications Office OJ-resource shape the dispatch names", () => {
  assert.equal(
    cellarEndpointForOj({ series: "L", year: "2025", issue: "00040" }, "R"),
    "https://publications.europa.eu/resource/oj/JOL_2025_00040_R",
  );
  assert.equal(
    cellarEndpointForOj({ series: "C", year: "2025", issue: "00226" }, "C"),
    "https://publications.europa.eu/resource/oj/JOC_2025_00226_C",
  );
});

test("captureItem: eur-lex OJ-issue reference (uri=OJ:L_202500040, no CELEX) -> captured from the derived Cellar OJ endpoint", async () => {
  const fetchImpl = async (url) => {
    if (String(url) === "https://publications.europa.eu/resource/oj/JOL_2025_00040_R") {
      return { ok: true, status: 200, text: async () => "<html><title>OJ L 40</title><body>" + "oj issue text ".repeat(30) + "</body></html>" };
    }
    return { ok: false, status: 404, text: async () => "not found" };
  };
  const r = await captureItem(
    { canonical_instrument_key: null, instrument_identifier: null },
    "https://eur-lex.europa.eu/legal-content/EN/TXT?uri=OJ:L_202500040",
    { fetchImpl },
  );
  assert.equal(r.status, "captured");
  assert.equal(r.url, "https://publications.europa.eu/resource/oj/JOL_2025_00040_R");
  assert.ok(r.text.length > 200);
});

test("captureCitedUrl: eur-lex OJ-issue reference, no edition given -> tries the series' own edition first, then the other letter, both recorded", async () => {
  const attempted = [];
  const fetchImpl = async (url) => {
    attempted.push(String(url));
    return { ok: false, status: 404, text: async () => "not found" }; // Cellar refuses both guesses
  };
  const r = await captureCitedUrl("https://eur-lex.europa.eu/legal-content/EN/TXT?uri=OJ:L_2025_040", { fetchImpl });
  assert.equal(r.status, "held");
  assert.equal(r.reason, "oj_reference_no_cellar_path");
  assert.deepEqual(r.evidence.oj, { series: "L", year: "2025", issue: "00040", edition: null });
  assert.equal(r.evidence.attempts.length, 2);
  assert.equal(r.evidence.attempts[0].endpoint, "https://publications.europa.eu/resource/oj/JOL_2025_00040_R");
  assert.equal(r.evidence.attempts[1].endpoint, "https://publications.europa.eu/resource/oj/JOL_2025_00040_C");
  assert.deepEqual(attempted, r.evidence.attempts.map((a) => a.endpoint)); // never chained to the archive fallback
});

// ── Wayback availability parsing (pure) ─────────────────────────────────────────────────────────────

test("waybackAvailabilityUrl: encodes the cited url as the availability API's own query param", () => {
  assert.equal(
    waybackAvailabilityUrl("https://example.com/a b?x=1"),
    "https://archive.org/wayback/available?url=" + encodeURIComponent("https://example.com/a b?x=1"),
  );
});

test("parseWaybackAvailability: a real closest/available snapshot parses to {timestamp, snapshotUrl}", () => {
  const json = {
    url: "https://example.com/x",
    archived_snapshots: { closest: { status: "200", available: true, url: "http://web.archive.org/web/20250601000000/https://example.com/x", timestamp: "20250601000000" } },
  };
  assert.deepEqual(parseWaybackAvailability(json), { timestamp: "20250601000000", snapshotUrl: "http://web.archive.org/web/20250601000000/https://example.com/x" });
});

test("parseWaybackAvailability: no snapshot, or one not marked available, or a malformed body -- all null, never thrown", () => {
  assert.equal(parseWaybackAvailability({ url: "x", archived_snapshots: {} }), null);
  assert.equal(parseWaybackAvailability({ archived_snapshots: { closest: { available: false, timestamp: "1", url: "x" } } }), null);
  assert.equal(parseWaybackAvailability(null), null);
  assert.equal(parseWaybackAvailability({}), null);
});

test("waybackSnapshotFetchUrl: the id_ raw-bytes replay url (no toolbar)", () => {
  assert.equal(waybackSnapshotFetchUrl("20250601000000", "https://example.com/x"), "https://web.archive.org/web/20250601000000id_/https://example.com/x");
});

test("buildCaptureSearchRow: full text, never truncated (ADR-016)", () => {
  const row = buildCaptureSearchRow("item-1", { url: "https://x", text: "y".repeat(5000), title: "T" }, "2026-09-03T00:00:00.000Z");
  assert.equal(row.intelligence_item_id, "item-1");
  assert.equal(row.result_content.length, 5000);
  assert.equal(row.result_title, "T");
  assert.equal(row.searched_at, "2026-09-03T00:00:00.000Z");
});

// ── GROUND ───────────────────────────────────────────────────────────────────────────────────────────

test("planGroundingForClaim: non-FACT is not_applicable", () => {
  assert.deepEqual(planGroundingForClaim({ claim_kind: "GAP", claim_text: "x" }, []), { outcome: "not_applicable" });
});

test("planGroundingForClaim: already grounded -> no plan entry needed", () => {
  const claim = { claim_kind: "FACT", claim_text: "x", source_span: "shall comply" };
  const r = planGroundingForClaim(claim, [{ id: "s1", result_content: "the parties shall comply fully" }]);
  assert.equal(r.outcome, "already_grounded");
});

test("planGroundingForClaim: healed via normalized span match in a capture", () => {
  const claim = { claim_kind: "FACT", claim_text: "[primary_deadline] «no later than 1 March 2027»", source_span: "no later than 1 March 2027" };
  const captures = [{ id: "s1", result_content: "Submissions are due no   later\nthan 1 March 2027 per Article 4." }];
  const r = planGroundingForClaim(claim, captures);
  assert.equal(r.outcome, "healed");
  assert.equal(r.searchId, "s1");
  assert.match(r.newSpan, /no\s+later\s+than\s+1 March 2027/);
});

test("planGroundingForClaim: healed via claim_text when the span itself is absent", () => {
  const claim = { claim_kind: "FACT", claim_text: "penalties may include a substantial fine for non-compliance", source_span: "a span that appears nowhere" };
  const captures = [{ id: "s1", result_content: "This regulation provides that penalties may include a substantial fine for non-compliance." }];
  const r = planGroundingForClaim(claim, captures);
  assert.equal(r.outcome, "healed");
  assert.match(r.method, /^claim_text_/);
});

test("planGroundingForClaim: ungrounded_after_capture reports the closest fuzzy match, never a span to write", () => {
  const claim = { claim_kind: "FACT", claim_text: "totally unrelated statement", source_span: "totally unrelated statement" };
  const captures = [{ id: "s1", result_content: "This document discusses shipping corridors and nothing about that statement at all." }];
  const r = planGroundingForClaim(claim, captures);
  assert.equal(r.outcome, "ungrounded_after_capture");
  assert.equal(r.newSpan, undefined);
  assert.ok("fuzzy" in r);
});

// ── SLOTS ────────────────────────────────────────────────────────────────────────────────────────────

test("buildSlotClaim: regulation-family generic slot, FACT when the trigger locates a span", () => {
  const claim = buildSlotClaim({ slotKey: "primary_deadline", itemType: "regulation", capturedText: "Member States shall submit reports no later than 1 June 2027 each year.", sourceUrl: "https://x" });
  assert.equal(claim.claim_kind, "FACT");
  assert.match(claim.claim_text, /^\[primary_deadline\]/);
});

test("buildSlotClaim: regulation-family generic slot, honest GAP when nothing is stated", () => {
  const claim = buildSlotClaim({ slotKey: "penalty_summary", itemType: "regulation", capturedText: "This act concerns shipping standards generally.", sourceUrl: "https://x" });
  assert.equal(claim.claim_kind, "GAP");
  assert.match(claim.claim_text, /^\[penalty_summary\]/);
});

test("buildSlotClaim: market_signal corridor_identity, FACT when a LOCODE pair + mode are stated together", () => {
  const claim = buildSlotClaim({ slotKey: "corridor_identity", itemType: "market_signal", capturedText: "This signal covers the CNSHA-NLRTM ocean lane pricing shift.", sourceUrl: "https://x" });
  assert.equal(claim.claim_kind, "FACT");
  assert.equal(claim.corridor_identity.origin_locode, "CNSHA");
  assert.equal(claim.corridor_identity.mode, "ocean");
});

test("buildSlotClaim: market_signal corridor_identity GAP when no lane is stated (operator ruling: honest GAP, never invented)", () => {
  const claim = buildSlotClaim({ slotKey: "corridor_identity", itemType: "market_signal", capturedText: "Freight rates rose broadly across the sector this quarter.", sourceUrl: "https://x" });
  assert.equal(claim.claim_kind, "GAP");
});

test("buildSlotClaim: research_finding required slot upgrades to FACT via the research-profile trigger", () => {
  const claim = buildSlotClaim({ slotKey: "finding", itemType: "research_finding", capturedText: "This study finds that emissions fell by twelve percent over the period studied.", sourceUrl: "https://x" });
  assert.equal(claim.claim_kind, "FACT");
});

test("buildSlotClaim: research_finding required slot with no trigger match falls to the honest generic GAP", () => {
  const claim = buildSlotClaim({ slotKey: "does_not_resolve", itemType: "research_finding", capturedText: "Nothing relevant here at all.", sourceUrl: "https://x" });
  assert.equal(claim.claim_kind, "GAP");
});

test("buildSlotClaim: research_finding ALWAYS-PRESENT slot (key_figure) FACT when a quantified figure is stated", () => {
  const claim = buildSlotClaim({ slotKey: "key_figure", itemType: "research_finding", capturedText: "Overall emissions declined by 12% across the fleet during the reporting year.", sourceUrl: "https://x" });
  assert.equal(claim.claim_kind, "FACT");
  assert.match(claim.source_span, /12%/);
});

test("buildSlotClaim: research_finding ALWAYS-PRESENT slot GAP carries the D06-2 honest-absence copy", () => {
  const claim = buildSlotClaim({ slotKey: "key_figure", itemType: "research_finding", capturedText: "No numbers here.", sourceUrl: "https://x" });
  assert.equal(claim.claim_kind, "GAP");
  assert.match(claim.claim_text, /no key figure yet/);
});

test("bestCaptureText: longest usable (>200 char) capture wins; null when none usable", () => {
  assert.equal(bestCaptureText([{ result_content: "short" }]), null);
  const long1 = "a".repeat(250);
  const long2 = "b".repeat(500);
  assert.equal(bestCaptureText([{ result_content: long1 }, { result_content: long2 }]), long2);
});

test("findSearchIdForSpan: resolves to the capture row actually containing the span", () => {
  const captures = [{ id: "s1", result_content: "alpha beta" }, { id: "s2", result_content: "gamma delta" }];
  assert.equal(findSearchIdForSpan("gamma delta", captures), "s2");
  assert.equal(findSearchIdForSpan("nowhere", captures), null);
  assert.equal(findSearchIdForSpan(null, captures), null);
});

// ── GATE A ───────────────────────────────────────────────────────────────────────────────────────────

test("planGateA: empty full_brief scans clean (zero orphans)", () => {
  const row = planGateA({ id: "item-1", full_brief: "" }, []);
  assert.equal(row.intelligence_item_id, "item-1");
  assert.equal(row.orphan_count, 0);
  assert.ok(row.scanned_hash);
  assert.ok(row.gate_a_version);
});

test("planGateA: a figure token backed by a FACT claim's own span scans clean", () => {
  const claims = [{ claim_kind: "FACT", claim_text: "[penalty_summary] a fine of up to €500,000", source_span: "a fine of up to €500,000" }];
  const row = planGateA({ id: "item-1", full_brief: "This act carries [penalty_summary] a fine of up to €500,000 for breaches." }, claims);
  assert.equal(row.orphan_count, 0);
});

test("planGateA: a figure token with NO backing claim orphans", () => {
  const row = planGateA({ id: "item-1", full_brief: "Fines of up to €500,000 apply." }, []);
  assert.ok(row.orphan_count > 0);
});

// ── RE-DERIVE ────────────────────────────────────────────────────────────────────────────────────────

test("shouldUnarchive: only archived-unreasoned selection, freshly verified, currently archived", () => {
  assert.equal(shouldUnarchive("archived-unreasoned", "verified", { is_archived: true }), true);
  assert.equal(shouldUnarchive("quarantined-live", "verified", { is_archived: true }), false);
  assert.equal(shouldUnarchive("archived-unreasoned", "quarantined", { is_archived: true }), false);
  assert.equal(shouldUnarchive("archived-unreasoned", "verified", { is_archived: false }), false);
});

// ── selection ────────────────────────────────────────────────────────────────────────────────────────

test("parseSelection: blank/default is quarantined-live", () => {
  assert.deepEqual(parseSelection(""), { ok: true, mode: "quarantined-live", ids: null, stripUnprovable: false });
  assert.deepEqual(parseSelection(undefined), { ok: true, mode: "quarantined-live", ids: null, stripUnprovable: false });
});

test("parseSelection: the other four named selections", () => {
  assert.equal(parseSelection("archived-unreasoned").mode, "archived-unreasoned");
  assert.equal(parseSelection("slots-backfill").mode, "slots-backfill");
  // KIT-BACKFILL (2026-09-05): the generalized (every item_type, archived included) sibling.
  assert.deepEqual(parseSelection("kit-backfill"), { ok: true, mode: "kit-backfill", ids: null, stripUnprovable: false });
  assert.deepEqual(parseSelection("ids: a-1, b-2"), { ok: true, mode: "ids", ids: ["a-1", "b-2"], stripUnprovable: false });
});

test("parseSelection: bad input refused, error names kit-backfill among the valid forms", () => {
  assert.equal(parseSelection("ids:").ok, false);
  const bad = parseSelection("bogus");
  assert.equal(bad.ok, false);
  assert.match(bad.error, /kit-backfill/);
});

// TENTH PASS (lane HEAL-10, Task 3) — the "+strip-unprovable" suffix on every existing selection form.
test("parseSelection: +strip-unprovable suffix sets stripUnprovable, preserves every existing form's own meaning", () => {
  assert.deepEqual(parseSelection("+strip-unprovable"), { ok: true, mode: "quarantined-live", ids: null, stripUnprovable: true });
  assert.deepEqual(parseSelection("quarantined-live+strip-unprovable"), { ok: true, mode: "quarantined-live", ids: null, stripUnprovable: true });
  assert.deepEqual(parseSelection("archived-unreasoned+strip-unprovable"), { ok: true, mode: "archived-unreasoned", ids: null, stripUnprovable: true });
  assert.deepEqual(parseSelection("slots-backfill+strip-unprovable"), { ok: true, mode: "slots-backfill", ids: null, stripUnprovable: true });
  assert.deepEqual(parseSelection("kit-backfill+strip-unprovable"), { ok: true, mode: "kit-backfill", ids: null, stripUnprovable: true });
  assert.deepEqual(
    parseSelection("ids: a-1, b-2+strip-unprovable"),
    { ok: true, mode: "ids", ids: ["a-1", "b-2"], stripUnprovable: true },
  );
  // absent -> false, on every form, unchanged from before this pass
  assert.equal(parseSelection("quarantined-live").stripUnprovable, false);
  assert.equal(parseSelection("ids:a-1").stripUnprovable, false);
});

test("resolveSlotsBackfillCandidates: narrows to items ACTUALLY missing a slot", () => {
  const map = { market_signal: ["corridor_identity"] };
  const items = [
    { id: "i1", item_type: "market_signal" },
    { id: "i2", item_type: "market_signal" },
  ];
  const claimsById = {
    i1: [], // missing corridor_identity
    i2: [{ claim_kind: "GAP", claim_text: "[corridor_identity] not stated" }], // already covered
  };
  const deps = {
    readCandidateTypeItems: async () => items,
    readClaims: async (id) => claimsById[id],
  };
  return resolveSlotsBackfillCandidates(deps, map).then((kept) => {
    assert.deepEqual(kept.map((i) => i.id), ["i1"]);
  });
});

test("resolveSlotsBackfillCandidates: still calls readCandidateTypeItems with exactly the original three types and includeArchived:false (unchanged 2026-09-05 default)", () => {
  const calls = [];
  const deps = {
    readCandidateTypeItems: async (...a) => { calls.push(a); return []; },
    readClaims: async () => [],
  };
  return resolveSlotsBackfillCandidates(deps, {}).then(() => {
    assert.deepEqual(calls, [[["market_signal", "initiative", "research_finding"], { includeArchived: false }]]);
  });
});

// ── KIT-BACKFILL (2026-09-05, lane KIT-BACKFILL, W2.3/W2.4) ─────────────────────────────────────────

test("requiredSlotItemTypes: every real item_type key, meta keys (_comment/_grade_note/_intake_note) excluded", () => {
  const map = { _comment: "x", _grade_note: "y", _intake_note: "z", regulation: ["effective_date"], market_signal: ["corridor_identity"] };
  assert.deepEqual(requiredSlotItemTypes(map), ["regulation", "market_signal"]);
  assert.deepEqual(requiredSlotItemTypes({}), []);
});

test("resolveKitBackfillCandidates: defaults itemTypes to EVERY non-meta key and includeArchived to false", () => {
  const calls = [];
  const map = { _comment: "x", regulation: ["effective_date"], market_signal: ["corridor_identity"] };
  const deps = {
    readCandidateTypeItems: async (...a) => { calls.push(a); return []; },
    readClaims: async () => [],
  };
  return resolveKitBackfillCandidates(deps, map).then(() => {
    assert.deepEqual(calls, [[["regulation", "market_signal"], { includeArchived: false }]]);
  });
});

test("resolveKitBackfillCandidates: opts.itemTypes and opts.includeArchived both pass through to readCandidateTypeItems", () => {
  const calls = [];
  const deps = {
    readCandidateTypeItems: async (...a) => { calls.push(a); return []; },
    readClaims: async () => [],
  };
  return resolveKitBackfillCandidates(deps, {}, { itemTypes: ["research_finding"], includeArchived: true }).then(() => {
    assert.deepEqual(calls, [[["research_finding"], { includeArchived: true }]]);
  });
});

test("resolveKitBackfillCandidates: narrows to items ACTUALLY missing a slot, same shape as resolveSlotsBackfillCandidates", () => {
  const map = { regulation: ["effective_date"] };
  const items = [
    { id: "r1", item_type: "regulation" },
    { id: "r2", item_type: "regulation" },
  ];
  const claimsById = {
    r1: [], // missing effective_date
    r2: [{ claim_kind: "FACT", claim_text: "[effective_date] 1 January 2026" }], // already covered
  };
  const deps = {
    readCandidateTypeItems: async () => items,
    readClaims: async (id) => claimsById[id],
  };
  return resolveKitBackfillCandidates(deps, map, { itemTypes: ["regulation"], includeArchived: true }).then((kept) => {
    assert.deepEqual(kept.map((i) => i.id), ["r1"]);
  });
});

// ── healOneItem / main — full pipeline against fake deps ────────────────────────────────────────────

function baseDeps(overrides = {}) {
  const calls = [];
  const sections = new Map();
  const gateA = new Map();
  return {
    calls,
    _sections: sections,
    _gateA: gateA,
    fetchImpl: async () => ({ ok: true, status: 200, text: async () => "should not be called" }),
    readCaptures: async () => [],
    readClaims: async () => [],
    readSections: async (id) => sections.get(id) ?? [],
    readGateAState: async (id) => gateA.get(id) ?? null,
    readSourceUrl: async () => null,
    readCapturesByUrls: async () => [],
    readAllSources: async () => [],
    readInstitutionByDomain: async () => null,
    // STEP SOURCE (EIGHTH PASS, 2026-09-04) — default stubs so every existing test above (none of which
    // drives an orphan into the registerable branch) stays byte-identical; the dedicated STEP SOURCE
    // tests below override these to exercise the real registration/read-back path.
    registerSource: async (source) => { calls.push(["registerSource", source]); return { source_id: "src-new", created: true, host: source.name }; },
    readSourceByUrl: async (url) => { calls.push(["readSourceByUrl", url]); return null; },
    insertInstitution: async (row) => { calls.push(["insertInstitution", row]); return { id: "inst-new" }; },
    updateSourceInstitution: async (sourceId, institutionId) => { calls.push(["updateSourceInstitution", sourceId, institutionId]); return { updated: 1 }; },
    validateProvenance: async () => ({ valid: true, recommended_status: "verified", failures: [] }),
    // TENTH PASS note: a unique id PER CALL (never a fixed literal) — a real insertSearch (db.mjs's own
    // guardedInsert) always returns a genuinely unique row id, and healOneItem's new capture-index cache
    // (getCaptureIndex, keyed by capture.id) relies on that uniqueness to never conflate two DIFFERENT
    // captures inserted in the SAME run; a fixed literal here previously let two distinct fresh captures
    // (e.g. a landing page and the hop page it links to) collide on the SAME cache key.
    insertSearch: async (row) => { calls.push(["insertSearch", row]); return { id: `search-new-${calls.length}`, result_url: row.result_url }; },
    insertClaim: async (row) => { calls.push(["insertClaim", row]); return { id: `claim-${calls.length}` }; },
    updateClaimSpan: async (id, patch) => { calls.push(["updateClaimSpan", id, patch]); return { updated: 1 }; },
    updateClaimKind: async (id, patch) => { calls.push(["updateClaimKind", id, patch]); return { updated: 1 }; },
    insertSection: async (row) => {
      calls.push(["insertSection", row]);
      const id = "section-new";
      const list = sections.get(row.item_id) ?? [];
      sections.set(row.item_id, [...list, { id, ...row }]);
      return { id, section_key: row.section_key };
    },
    updateSectionContent: async (id, content_md) => {
      calls.push(["updateSectionContent", id, content_md]);
      for (const [itemId, list] of sections) {
        sections.set(itemId, list.map((s) => (s.id === id ? { ...s, content_md } : s)));
      }
      return { updated: 1 };
    },
    upsertGateA: async (row, exists) => { calls.push(["upsertGateA", row, exists]); gateA.set(row.intelligence_item_id, row); return { ok: true }; },
    touchItem: async (id) => { calls.push(["touchItem", id]); return { updated: 1 }; },
    readProvenanceStatus: async () => "verified",
    unarchiveItem: async (id) => { calls.push(["unarchiveItem", id]); return { updated: 1 }; },
    // TENTH PASS (2026-09-04, lane HEAL-10) — STEP BRIEF-HONEST's own write (Task 3); only ever called
    // when apply && stripUnprovable && the plan was accepted.
    updateItemBrief: async (id, full_brief) => { calls.push(["updateItemBrief", id, full_brief]); return { updated: 1 }; },
    ...overrides,
  };
}

test("healOneItem: dry mode makes no writes/fetches, reports would_* outcomes", async () => {
  const item = { id: "item-1", item_type: "regulation", source_url: "https://example-regulator.gov/x", full_brief: "" };
  const deps = baseDeps({
    readCaptures: async () => [],
  });
  const requiredSlotsMap = { regulation: ["effective_date"] };
  const r = await healOneItem(item, { deps, apply: false, selectionMode: "quarantined-live", requiredSlotsMap });
  assert.equal(r.steps.capture.outcome, "would_fetch");
  assert.deepEqual(deps.calls, []);
  assert.ok(r.steps.slots.every((s) => s.outcome === "held_no_capture")); // no capture yet in dry mode
});

test("healOneItem: apply mode captures, fills slots, refreshes gate A, and re-derives to verified", async () => {
  const captureText = "Text: Member States shall submit reports no later than 1 June 2027 under this Regulation. " + "padding ".repeat(30);
  const item = { id: "item-1", item_type: "regulation", source_url: "https://example-regulator.gov/x", full_brief: "", source_id: "src-1" };
  const deps = baseDeps({
    fetchImpl: async () => ({ ok: true, status: 200, text: async () => captureText }),
  });
  const requiredSlotsMap = { regulation: ["primary_deadline"] };
  const r = await healOneItem(item, { deps, apply: true, selectionMode: "quarantined-live", requiredSlotsMap });

  assert.equal(r.steps.capture.outcome, "captured");
  assert.ok(deps.calls.some((c) => c[0] === "insertSearch"));

  assert.equal(r.steps.slots.length, 1);
  assert.equal(r.steps.slots[0].slot_key, "primary_deadline");
  assert.equal(r.steps.slots[0].outcome, "written");
  assert.ok(deps.calls.some((c) => c[0] === "insertClaim"));
  assert.ok(deps.calls.some((c) => c[0] === "insertSection"));
  assert.ok(deps.calls.some((c) => c[0] === "updateSectionContent"));

  assert.equal(r.steps.gate_a.outcome, "written");
  assert.ok(deps.calls.some((c) => c[0] === "upsertGateA"));

  assert.equal(r.steps.rederive.outcome, "healed_verified");
  assert.ok(deps.calls.some((c) => c[0] === "touchItem"));
});

test("healOneItem: archived-unreasoned item that re-derives verified is un-archived", async () => {
  const item = { id: "item-2", item_type: "regulation", is_archived: true, full_brief: "", source_url: null };
  const deps = baseDeps();
  const r = await healOneItem(item, { deps, apply: true, selectionMode: "archived-unreasoned", requiredSlotsMap: {} });
  assert.equal(r.steps.rederive.outcome, "healed_verified");
  assert.equal(r.steps.rederive.unarchived, true);
  assert.ok(deps.calls.some((c) => c[0] === "unarchiveItem" && c[1] === "item-2"));
});

test("healOneItem: still-failing item is left alone and reports the remaining criterion", async () => {
  const item = { id: "item-3", item_type: "regulation", full_brief: "", source_url: null };
  const deps = baseDeps({
    validateProvenance: async () => ({ valid: false, recommended_status: "quarantined", failures: [{ criterion: 3, reason: "fact_span_not_in_source" }] }),
  });
  const r = await healOneItem(item, { deps, apply: true, selectionMode: "quarantined-live", requiredSlotsMap: {} });
  assert.equal(r.steps.rederive.outcome, "still_failing");
  assert.deepEqual(r.steps.rederive.failures, [{ criterion: 3, reason: "fact_span_not_in_source" }]);
  assert.ok(!deps.calls.some((c) => c[0] === "touchItem"), "never touches an item the RPC still rejects");
});

test("healOneItem: GROUND heals an existing FACT claim's span under normalization", async () => {
  const item = { id: "item-4", item_type: "regulation", full_brief: "", source_url: null };
  const captures = [{ id: "s1", result_content: 'The rule states "member   states\nshall comply" under Article 3.' }];
  const claims = [{ id: "claim-1", claim_kind: "FACT", claim_text: "[jurisdictional_scope] «member states shall comply»", source_span: '"member states shall comply"' }];
  const deps = baseDeps({ readCaptures: async () => captures, readClaims: async () => claims });
  const r = await healOneItem(item, { deps, apply: true, selectionMode: "quarantined-live", requiredSlotsMap: {} });
  assert.equal(r.steps.ground.length, 1);
  assert.equal(r.steps.ground[0].outcome, "healed");
  assert.ok(deps.calls.some((c) => c[0] === "updateClaimSpan" && c[1] === "claim-1"));
});

test("summarizeReports: tallies every named counter", () => {
  const perItem = [
    { steps: { capture: { outcome: "held" }, ground: [], slots: [], gate_a: {}, rederive: { outcome: "still_failing", failures: [] } } },
    { steps: { capture: { outcome: "captured" }, ground: [{ outcome: "ungrounded_after_capture" }], slots: [{ outcome: "written", claim_kind: "FACT" }, { outcome: "written", claim_kind: "GAP" }], gate_a: { outcome: "written" }, rederive: { outcome: "healed_verified", unarchived: true } } },
  ];
  const s = summarizeReports(perItem);
  assert.equal(s.capture_held, 1);
  assert.equal(s.ungrounded_after_capture, 1);
  assert.equal(s.slots_written_fact, 1);
  assert.equal(s.slots_written_gap, 1);
  assert.equal(s.gate_a_written, 1);
  assert.equal(s.healed_verified, 1);
  assert.equal(s.still_failing, 1);
  assert.equal(s.unarchived, 1);
});

// ── main() ───────────────────────────────────────────────────────────────────────────────────────────

test("main: dry, quarantined-live default selection reads and plans, writes nothing", async () => {
  const item = { id: "item-1", item_type: "regulation", full_brief: "", source_url: null };
  const deps = baseDeps({ readQuarantinedLive: async () => [item] });
  const r = await main({ mode: "dry", arg: "" }, deps);
  assert.equal(r.step, "provenance-heal");
  assert.equal(r.counts.selection.mode, "quarantined-live");
  assert.equal(r.counts.candidates, 1);
  assert.equal(r.applied, 0);
  assert.deepEqual(deps.calls, []);
  assert.match(r.note, /DRY/);
});

test("main: apply, archived-unreasoned selection heals and un-archives", async () => {
  const item = { id: "item-2", item_type: "regulation", is_archived: true, full_brief: "", source_url: null };
  const deps = baseDeps({ readArchivedUnreasoned: async () => [item] });
  const r = await main({ mode: "apply", arg: "archived-unreasoned" }, deps);
  assert.equal(r.applied, 1);
  assert.equal(r.counts.unarchived, 1);
  assert.match(r.note, /Healed 1\/1/);
});

test("main: apply, ids selection targets exactly the named items", async () => {
  const item = { id: "item-9", item_type: "regulation", full_brief: "", source_url: null };
  const deps = baseDeps({ readByIds: async (ids) => { assert.deepEqual(ids, ["item-9"]); return [item]; } });
  const r = await main({ mode: "apply", arg: "ids:item-9" }, deps);
  assert.equal(r.counts.candidates, 1);
});

test("main: slots-backfill selection narrows via resolveSlotsBackfillCandidates before healing", async () => {
  const kept = { id: "item-7", item_type: "market_signal", full_brief: "", source_url: null };
  const skipped = { id: "item-8", item_type: "market_signal", full_brief: "", source_url: null };
  const deps = baseDeps({
    requiredSlotsMap: { market_signal: ["corridor_identity"] },
    readCandidateTypeItems: async () => [kept, skipped],
    readClaims: async (id) => (id === "item-8" ? [{ claim_kind: "GAP", claim_text: "[corridor_identity] not stated" }] : []),
  });
  const r = await main({ mode: "dry", arg: "slots-backfill" }, deps);
  assert.equal(r.counts.candidates, 1);
});

test("main: kit-backfill selection narrows via resolveKitBackfillCandidates, includeArchived:true reaches an archived item slots-backfill would miss", async () => {
  const archivedNeedsSlot = { id: "item-62", item_type: "initiative", full_brief: "", source_url: null, is_archived: true, archive_reason: "out_of_scope_wo26" };
  const calls = [];
  const deps = baseDeps({
    requiredSlotsMap: { initiative: ["corridor_identity"] },
    readCandidateTypeItems: async (itemTypes, opts) => { calls.push([itemTypes, opts]); return [archivedNeedsSlot]; },
    readClaims: async () => [],
  });
  const r = await main({ mode: "dry", arg: "kit-backfill" }, deps);
  assert.equal(r.counts.selection.mode, "kit-backfill");
  assert.equal(r.counts.candidates, 1);
  // requiredSlotsMap here has exactly one real key ("initiative") -- confirms the default itemTypes really
  // is derived from the map, and includeArchived:true is really threaded through (not defaulted away).
  assert.deepEqual(calls, [[["initiative"], { includeArchived: true }]]);
});

test("main: bad --arg refuses before any read, exitCode 1", async () => {
  const deps = baseDeps();
  const r = await main({ mode: "apply", arg: "bogus" }, deps);
  assert.equal(r.exitCode, 1);
  assert.match(r.note, /REFUSED/);
  assert.deepEqual(deps.calls, []);
});

// ── HEAL-BUDGET (sixth pass, 2026-09-04): time budget, checkpoint, resume, CAPTURE-CITED run cache ────

test("writeCheckpoint: temp-file-then-rename — content matches, no leftover tmp file, no-op when outDir is falsy", () => {
  assert.equal(writeCheckpoint(null, { a: 1 }), null);
  assert.equal(writeCheckpoint(undefined, { a: 1 }), null);

  const dir = mkdtempSync(resolve(tmpdir(), "heal-ckpt-"));
  const f1 = writeCheckpoint(dir, { step: "provenance-heal", n: 1 });
  assert.equal(f1, resolve(dir, "summary.json"));
  assert.equal(JSON.parse(readFileSync(f1, "utf8")).n, 1);
  assert.deepEqual(readdirSync(dir), ["summary.json"], "no leftover .tmp-* file after the first write");

  const f2 = writeCheckpoint(dir, { step: "provenance-heal", n: 2 });
  assert.equal(f2, f1);
  assert.equal(JSON.parse(readFileSync(f2, "utf8")).n, 2, "second checkpoint replaced the first atomically");
  assert.deepEqual(readdirSync(dir), ["summary.json"], "still exactly one file — the rename left nothing behind");
});

test("main: apply, out given — writes a checkpoint after EVERY item, not only at the end", async () => {
  const items = [
    { id: "ck-1", item_type: "regulation", full_brief: "", source_url: null },
    { id: "ck-2", item_type: "regulation", full_brief: "", source_url: null },
  ];
  const dir = mkdtempSync(resolve(tmpdir(), "heal-ckpt-main-"));
  const seen = [];
  const deps = baseDeps({
    readQuarantinedLive: async () => items,
    // A cheap way to observe the checkpoint growing across the loop without instrumenting main() itself:
    // read the file back inside a per-item hook that always runs (touchItem, called once per item late in
    // its own five-step sequence, by which point THAT item's own checkpoint has not yet been written —
    // this snapshot instead reads whatever the PREVIOUS item's checkpoint left, proving it exists mid-run).
    touchItem: async (id) => {
      try { seen.push(JSON.parse(readFileSync(resolve(dir, "summary.json"), "utf8")).per_item.length); }
      catch { seen.push(-1); } // no checkpoint written yet before the first item's own writes
      return { updated: 1 };
    },
  });
  const r2 = await main({ mode: "apply", arg: "", out: dir }, deps);
  assert.equal(r2.per_item.length, 2);
  const final = JSON.parse(readFileSync(resolve(dir, "summary.json"), "utf8"));
  assert.equal(final.per_item.length, 2, "the final on-disk checkpoint matches the returned summary");
  assert.ok(seen.includes(0) || seen.includes(1), "an EARLIER item's checkpoint was already on disk before the run finished");
});

test("main: TIME BUDGET — stops cleanly BEFORE starting an over-budget item, never mid-item, exits 0", async () => {
  const items = [
    { id: "b-1", item_type: "regulation", full_brief: "", source_url: null },
    { id: "b-2", item_type: "regulation", full_brief: "", source_url: null },
    { id: "b-3", item_type: "regulation", full_brief: "", source_url: null },
  ];
  // now() is called once for startedAt, then once per budget check before each item this loop reaches.
  // Sequence: startedAt=0; check before b-1: 0-0=0 (under budget, proceed); check before b-2:
  // 20000-0=20000 (>= the 10s budget) -> stop before b-2 ever starts.
  const clock = [0, 0, 20000];
  let i = 0;
  const deps = baseDeps({
    readQuarantinedLive: async () => items,
    now: () => clock[Math.min(i++, clock.length - 1)],
    timeBudgetSeconds: 10,
  });
  const r = await main({ mode: "apply", arg: "" }, deps);
  assert.equal(r.exitCode, 0, "a budget stop is an orderly completion, never a failure exit code");
  assert.equal(r.stopped_at_budget, true);
  assert.equal(r.items_processed, 1);
  assert.deepEqual(r.items_remaining, ["b-2", "b-3"]);
  assert.equal(r.per_item.length, 1);
  assert.match(r.note, /TIME BUDGET/);
});

test("main: TIME BUDGET — dry mode is budget-bound too (HEAL-9: a dry run does STEP SOURCE's lookup work; #28 ran 29 min unbounded)", async () => {
  const items = [
    { id: "d-1", item_type: "regulation", full_brief: "", source_url: null },
    { id: "d-2", item_type: "regulation", full_brief: "", source_url: null },
    { id: "d-3", item_type: "regulation", full_brief: "", source_url: null },
  ];
  const clock = [0, 0, 20000];
  let i = 0;
  const deps = baseDeps({
    readQuarantinedLive: async () => items,
    now: () => clock[Math.min(i++, clock.length - 1)],
    timeBudgetSeconds: 10,
  });
  const r = await main({ mode: "dry", arg: "" }, deps);
  assert.equal(r.exitCode, 0);
  assert.equal(r.stopped_at_budget, true);
  assert.equal(r.items_processed, 1);
  assert.deepEqual(r.items_remaining, ["d-2", "d-3"]);
  assert.equal(r.per_item.length, 1);
});

test("main: TIME BUDGET — no budget configured means the clock is never read, in either mode", async () => {
  const items = [
    { id: "n-1", item_type: "regulation", full_brief: "", source_url: null },
    { id: "n-2", item_type: "regulation", full_brief: "", source_url: null },
  ];
  for (const mode of ["dry", "apply"]) {
    const deps = baseDeps({
      readQuarantinedLive: async () => items,
      now: () => { throw new Error("an unbudgeted run must never read the clock"); },
    });
    const r = await main({ mode, arg: "" }, deps);
    assert.equal(r.stopped_at_budget, undefined);
    assert.equal(r.per_item.length, 2);
  }
});

test("main: HEAL-BUDGET resume — items_remaining from a budget-stopped run round-trips through ids: to finish the rest", async () => {
  const items = [
    { id: "r-1", item_type: "regulation", full_brief: "", source_url: null },
    { id: "r-2", item_type: "regulation", full_brief: "", source_url: null },
    { id: "r-3", item_type: "regulation", full_brief: "", source_url: null },
  ];
  const clock = [0, 0, 20000];
  let i = 0;
  const first = baseDeps({
    readQuarantinedLive: async () => items,
    now: () => clock[Math.min(i++, clock.length - 1)],
    timeBudgetSeconds: 10,
  });
  const r1 = await main({ mode: "apply", arg: "" }, first);
  assert.deepEqual(r1.items_remaining, ["r-2", "r-3"]);

  const byId = new Map(items.map((it) => [it.id, it]));
  const second = baseDeps({
    readByIds: async (ids) => { assert.deepEqual(ids, r1.items_remaining); return ids.map((id) => byId.get(id)); },
  });
  const r2 = await main({ mode: "apply", arg: `ids:${r1.items_remaining.join(",")}` }, second);
  assert.equal(r2.counts.candidates, 2);
  assert.equal(r2.per_item.length, 2);
  assert.equal(r2.stopped_at_budget, undefined, "the resumed dispatch had no budget set — it just finishes");
});

test("main: HEAL-BUDGET — CAPTURE-CITED dedups the SAME cited url across DIFFERENT items in one run", async () => {
  const items = [
    { id: "cu-1", item_type: "market_signal", full_brief: "", source_url: null },
    { id: "cu-2", item_type: "market_signal", full_brief: "", source_url: null },
  ];
  const sectionsById = {
    "cu-1": [{ id: "sec-cu-1", item_id: "cu-1", section_key: "body", section_order: 1, content_md: "See https://example.com/shared-cite for detail." }],
    "cu-2": [{ id: "sec-cu-2", item_id: "cu-2", section_key: "body", section_order: 1, content_md: "Also see https://example.com/shared-cite again." }],
  };
  let fetchCount = 0;
  const deps = baseDeps({
    fetchImpl: async () => { fetchCount += 1; return { ok: true, status: 200, text: async () => "<html><title>Shared</title><body>" + "shared cited detail ".repeat(40) + "</body></html>" }; },
    readByIds: async (ids) => items.filter((it) => ids.includes(it.id)),
    readClaims: async () => [],
    readSections: async (id) => sectionsById[id] ?? [],
  });
  const r = await main({ mode: "apply", arg: "ids:cu-1,cu-2" }, deps);
  assert.equal(fetchCount, 1, "the second item's identical cited url reused the first item's outcome — no second network call");
  const inserted = deps.calls.filter((c) => c[0] === "insertSearch" && c[1].result_url === "https://example.com/shared-cite");
  assert.equal(inserted.length, 2, "each item still gets its OWN agent_run_searches evidence row — caching removes fetches, never evidence");
  assert.equal(r.per_item[0].steps.capture_cited.results[0].cache_hit, false);
  assert.equal(r.per_item[1].steps.capture_cited.results[0].cache_hit, true);
  assert.equal(r.per_item[1].steps.capture_cited.cache_hits, 1);
});

test("buildSummaryObject: stopped_at_budget shape carries items_processed/items_remaining; an unstopped run carries neither", () => {
  const perItem = [{ id: "x-1", item_type: "regulation", steps: { rederive: { outcome: "healed_verified" } } }];
  const selection = { mode: "ids", ids: ["x-1", "x-2"] };
  const stopped = buildSummaryObject({ mode: "apply", apply: true, selection, items: [{ id: "x-1" }, { id: "x-2" }], perItem, stoppedAtBudget: true, itemsRemaining: ["x-2"] });
  assert.equal(stopped.stopped_at_budget, true);
  assert.equal(stopped.items_processed, 1);
  assert.deepEqual(stopped.items_remaining, ["x-2"]);
  assert.match(stopped.note, /TIME BUDGET/);

  const finished = buildSummaryObject({ mode: "apply", apply: true, selection, items: [{ id: "x-1" }], perItem, stoppedAtBudget: false, itemsRemaining: [] });
  assert.equal(finished.stopped_at_budget, undefined);
  assert.equal(finished.items_processed, undefined);
  assert.doesNotMatch(finished.note, /TIME BUDGET/);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// SECOND PASS (HEAL-2) — authority-floor mirror, STEP A/B/C/D/E pure functions.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

test("floorMaxFor / REG_FAMILY: reg family floor 2, research_finding 4, tech family 5, else null", () => {
  assert.ok(REG_FAMILY.has("regulation") && REG_FAMILY.has("standard"));
  assert.equal(floorMaxFor("regulation"), 2);
  assert.equal(floorMaxFor("research_finding"), 4);
  assert.equal(floorMaxFor("technology"), 5);
  assert.equal(floorMaxFor("market_signal"), null);
});

test("isFloorArmed: reg family unconditional; other types only on CRITICAL/HIGH priority", () => {
  assert.equal(isFloorArmed({ item_type: "regulation", priority: "LOW" }), true);
  assert.equal(isFloorArmed({ item_type: "market_signal", priority: "HIGH" }), true);
  assert.equal(isFloorArmed({ item_type: "market_signal", priority: "LOW" }), false);
});

test("deriveSourceTier: tier_override wins over base_tier; null for a missing source", () => {
  assert.equal(deriveSourceTier({ base_tier: 3, tier_override: 1 }), 1);
  assert.equal(deriveSourceTier({ base_tier: 3, tier_override: null }), 3);
  assert.equal(deriveSourceTier(null), null);
});

test("effectiveFloorForClaim: migration 202 standard own-body loosens to tier 4", () => {
  const item = { item_type: "standard" };
  const itemSource = { institution_id: "inst-1" };
  const sameBody = { institution_id: "inst-1" };
  const otherBody = { institution_id: "inst-2" };
  assert.equal(effectiveFloorForClaim(item, sameBody, itemSource), 4);
  assert.equal(effectiveFloorForClaim(item, otherBody, itemSource), 2);
  assert.equal(effectiveFloorForClaim({ item_type: "regulation" }, sameBody, itemSource), 2, "own-body loosening is standard-only");
});

test("buildSourcesIndex: byId and byCanonUrl lookups", () => {
  const idx = buildSourcesIndex([
    { id: "s1", url: "https://Example.com/Doc/" },
    { id: "s2", url: null },
  ]);
  assert.equal(idx.byId.get("s1").id, "s1");
  assert.equal(idx.byCanonUrl.get("https://example.com/doc").id, "s1");
  assert.equal(idx.byId.size, 2);
});

test("claimNeedsResource: NULL source_id always needs resource; floor-armed tier-above-floor needs it; floor-satisfied does not", () => {
  const item = { item_type: "regulation" };
  const idx = buildSourcesIndex([
    { id: "hi-tier", url: "https://blog.example/", base_tier: 6 },
    { id: "lo-tier", url: "https://eur-lex.europa.eu/", base_tier: 2 },
  ]);
  assert.equal(claimNeedsResource({ claim_kind: "FACT", source_id: null }, item, idx), true);
  assert.equal(claimNeedsResource({ claim_kind: "FACT", source_id: "hi-tier" }, item, idx), true);
  assert.equal(claimNeedsResource({ claim_kind: "FACT", source_id: "lo-tier" }, item, idx), false);
  assert.equal(claimNeedsResource({ claim_kind: "GAP", source_id: null }, item, idx), false, "non-FACT never needs it");
  assert.equal(claimNeedsResource({ claim_kind: "FACT", source_id: "hi-tier" }, { item_type: "market_signal" }, idx), false, "floor not armed for this type");
});

test("buildUrlVariants: http/https swap plus trailing-slash toggle, no dupes", () => {
  const vs = buildUrlVariants("https://example.com/doc");
  assert.ok(vs.includes("https://example.com/doc"));
  assert.ok(vs.includes("http://example.com/doc"));
  assert.ok(vs.includes("https://example.com/doc/"));
  assert.deepEqual(buildUrlVariants(""), []);
});

test("buildOwnCanonicalBucket: only captures whose result_url canonicalizes to item.source_url", () => {
  const item = { source_id: "src-1", source_url: "https://eur-lex.europa.eu/doc/1" };
  const captures = [
    { id: "c1", result_url: "https://eur-lex.europa.eu/doc/1", result_content: "primary text" },
    { id: "c2", result_url: "https://other.example/", result_content: "unrelated" },
  ];
  const bucket = buildOwnCanonicalBucket(item, captures);
  assert.deepEqual(bucket.map((b) => b.id), ["c1"]);
  assert.equal(bucket[0].source_id, "src-1");
  assert.equal(bucket[0].bucket, "own_canonical");
});

test("buildTierQualifyingBucket: only OTHER captures whose registered source tier <= floor", () => {
  const item = { source_url: "https://eur-lex.europa.eu/doc/1" };
  const idx = buildSourcesIndex([{ id: "src-good", url: "https://legislation.gov.uk/x", base_tier: 2 }, { id: "src-bad", url: "https://blog.example/", base_tier: 6 }]);
  const captures = [
    { id: "c1", result_url: "https://eur-lex.europa.eu/doc/1", result_content: "own canonical" },
    { id: "c2", result_url: "https://legislation.gov.uk/x", result_content: "qualifying text" },
    { id: "c3", result_url: "https://blog.example/", result_content: "unqualifying text" },
  ];
  const bucket = buildTierQualifyingBucket(item, captures, idx, 2, ["c1"]);
  assert.deepEqual(bucket.map((b) => b.id), ["c2"]);
  assert.equal(buildTierQualifyingBucket(item, captures, idx, null, []).length, 0, "no floor -> empty");
});

test("buildCorpusPoolBucket: gated on the item's OWN source already qualifying the floor; excludes the item's own rows", () => {
  const item = { id: "item-x", source_id: "src-1" };
  const corpus = [
    { id: "c1", intelligence_item_id: "item-y", result_content: "another item's full capture" },
    { id: "c2", intelligence_item_id: "item-x", result_content: "should be excluded, same item" },
  ];
  assert.deepEqual(buildCorpusPoolBucket(item, corpus, 2, 2, "item-x").map((b) => b.id), ["c1"]);
  assert.deepEqual(buildCorpusPoolBucket(item, corpus, 6, 2, "item-x"), [], "item's own tier too low to qualify -> nothing");
});

test("planResourceForClaim: first bucket with a verbatim match wins; unresourced reports the closest fuzzy match", () => {
  const claim = { claim_text: "penalties up to €500,000 apply", source_span: "€500,000" };
  const buckets = [
    { id: "b1", result_content: "no figures here at all", source_id: "s1", bucket: "own_canonical" },
    { id: "b2", result_content: "the regulation sets a maximum of €500,000 for breaches", source_id: "s2", bucket: "tier_qualifying" },
  ];
  const r = planResourceForClaim(claim, buckets);
  assert.equal(r.outcome, "resourced");
  assert.equal(r.sourceId, "s2");
  assert.equal(r.searchId, "b2");
  const none = planResourceForClaim({ claim_text: "wholly unrelated statement", source_span: "wholly unrelated statement" }, buckets);
  assert.equal(none.outcome, "unresourced");
  assert.ok("fuzzy" in none);
});

test("resolveInstitutionKeyForSource: institutionKey(url), unmodified; null for an unparseable URL", () => {
  assert.equal(resolveInstitutionKeyForSource({ url: "https://legislation.gov.uk/uksi/2021/1" }), "legislation.gov.uk");
  assert.equal(resolveInstitutionKeyForSource({ url: "not a url" }), null);
  assert.equal(resolveInstitutionKeyForSource(null), null);
});

test("findOwningSection: first section whose content_md already contains the token", () => {
  const sections = [{ id: "s1", content_md: "no figures" }, { id: "s2", content_md: "fines of up to €500,000 apply" }];
  assert.equal(findOwningSection("€500,000", sections).id, "s2");
  assert.equal(findOwningSection("€999", sections), null);
});

test("buildOrphanClaimText: names the token verbatim, truthfully minimal", () => {
  assert.match(buildOrphanClaimText({ token: "€500,000", class: "figure" }), /€500,000/);
  assert.match(buildOrphanClaimText({ token: "1 June 2027", class: "deadline" }), /1 June 2027/);
});

test("planOrphanGrounding: found across ranked buckets; unprovable reports fuzzy evidence, never a span", () => {
  const buckets = [{ id: "b1", result_content: "the notice states a fine of €500,000 will apply", source_id: "s1", bucket: "own_canonical" }];
  const found = planOrphanGrounding({ token: "€500,000", class: "figure" }, buckets);
  assert.equal(found.outcome, "found");
  assert.equal(found.sourceId, "s1");
  const missing = planOrphanGrounding({ token: "€999,999", class: "figure" }, buckets);
  assert.equal(missing.outcome, "unprovable");
});

test("splitParagraphsPreserving: blank-line-delimited, separators preserved for exact reconstruction", () => {
  const text = "First para.\n\nSecond para.\n \nThird para.";
  const { parts, seps } = splitParagraphsPreserving(text);
  assert.equal(parts.length, 3);
  assert.equal(parts[1], "Second para.");
  let rebuilt = parts[0];
  for (let i = 0; i < seps.length; i++) rebuilt += seps[i] + parts[i + 1];
  assert.equal(rebuilt, text);
});

test("planRelabelParagraph: prepends the default label to the paragraph containing claimText only", () => {
  const md = "Intro paragraph, unrelated.\n\nThe regulation requires strict reporting by operators.";
  const plan = planRelabelParagraph(md, "requires strict reporting by operators");
  assert.match(plan.content_md, /^Intro paragraph, unrelated\.\n\n\*Analytical inference:\* The regulation requires/);
  assert.equal(planRelabelParagraph(md, "nothing matches this"), null);
});

test("planRelabelParagraph: already-labeled paragraph is left alone (null, nothing safe to do)", () => {
  const md = "*Industry interpretation:* Operators generally read this as binding.";
  assert.equal(planRelabelParagraph(md, "Operators generally read this as binding"), null);
});

test("planRelabelModalParagraph: prepends to the paragraph carrying the unlabeled modal verb", () => {
  const md = "Background text.\n\nThe scheme requires operators to comply with new limits.";
  const plan = planRelabelModalParagraph(md);
  assert.match(plan.after, /^\*Analytical inference:\* The scheme requires/);
  assert.equal(planRelabelModalParagraph("Nothing modal here."), null);
});

test("sectionNeedsRelabel: modal verb, no label, no legal callout, no bound FACT claim", () => {
  const section = { id: "sec-1", content_md: "The scheme requires operators to comply." };
  assert.equal(sectionNeedsRelabel(section, []), true);
  assert.equal(sectionNeedsRelabel(section, [{ claim_kind: "FACT", section_row_id: "sec-1" }]), false, "a bound FACT clears it");
  assert.equal(sectionNeedsRelabel({ id: "sec-2", content_md: "*Analytical inference:* requires compliance." }, []), false, "already labeled");
  assert.equal(sectionNeedsRelabel({ id: "sec-3", content_md: "No modal verb here." }, []), false);
});

test("reclassifyReason: GROUND's ungrounded takes precedence, else RESOURCE's unresourced, else null", () => {
  assert.equal(reclassifyReason("ungrounded_after_capture", "resourced"), "span_not_found_anywhere");
  assert.equal(reclassifyReason(undefined, "unresourced"), "floor_unresourceable");
  assert.equal(reclassifyReason("healed", "resourced"), null);
  assert.equal(reclassifyReason(undefined, undefined), null);
});

// ── healOneItem — second-pass integration ──────────────────────────────────────────────────────────

test("healOneItem STEP A: re-points a claim's wrong low-tier source to the item's own floor-qualifying capture", async () => {
  const item = {
    id: "item-r1", item_type: "regulation", source_id: "src-primary",
    source_url: "https://eur-lex.europa.eu/doc/32021R0001", full_brief: "",
  };
  const sourcesIndex = buildSourcesIndex([
    { id: "src-primary", url: "https://eur-lex.europa.eu/doc/32021R0001", base_tier: 2 },
    { id: "src-secondary", url: "https://blog.example.com/summary", base_tier: 6 },
  ]);
  const captures = [
    { id: "cap-primary", result_url: "https://eur-lex.europa.eu/doc/32021R0001", result_content: "Article 3 sets the threshold at 500 tonnes per year." },
    { id: "cap-secondary", result_url: "https://blog.example.com/summary", result_content: "A blog restates the 500 tonnes per year threshold too." },
  ];
  const claims = [{ id: "claim-1", claim_kind: "FACT", claim_text: "[threshold] 500 tonnes per year", source_span: "500 tonnes per year", source_id: "src-secondary", section_row_id: "sec-1" }];
  const deps = baseDeps({ readCaptures: async () => captures, readClaims: async () => claims });
  const r = await healOneItem(item, { deps, apply: true, selectionMode: "quarantined-live", requiredSlotsMap: {}, sourcesIndex });
  assert.equal(r.steps.resource.length, 1);
  assert.equal(r.steps.resource[0].outcome, "resourced");
  assert.equal(r.steps.resource[0].source_id, "src-primary");
  assert.equal(r.steps.resource[0].bucket, "own_canonical");
  const call = deps.calls.find((c) => c[0] === "updateClaimSpan" && c[1] === "claim-1");
  assert.equal(call[2].source_id, "src-primary");
});

test("healOneItem STEP B: resolves and writes institution_id for the item's own source when it is NULL", async () => {
  const item = { id: "item-b1", item_type: "standard", source_id: "src-std", source_url: "https://legislation.gov.uk/x", full_brief: "" };
  const sourcesIndex = buildSourcesIndex([{ id: "src-std", url: "https://legislation.gov.uk/x", base_tier: 4, institution_id: null }]);
  const deps = baseDeps();
  const r = await healOneItem(item, { deps, apply: true, selectionMode: "quarantined-live", requiredSlotsMap: {}, sourcesIndex });
  assert.equal(r.steps.own_body.outcome, "resolved");
  assert.equal(r.steps.own_body.key, "legislation.gov.uk");
  assert.ok(deps.calls.some((c) => c[0] === "insertInstitution" && c[1].registrable_domain === "legislation.gov.uk"));
  assert.ok(deps.calls.some((c) => c[0] === "updateSourceInstitution" && c[1] === "src-std" && c[2] === "inst-new"));
});

test("healOneItem STEP B: a source that already carries institution_id is left alone", async () => {
  const item = { id: "item-b2", item_type: "standard", source_id: "src-std2", source_url: "https://legislation.gov.uk/x", full_brief: "" };
  const sourcesIndex = buildSourcesIndex([{ id: "src-std2", url: "https://legislation.gov.uk/x", base_tier: 4, institution_id: "inst-existing" }]);
  const deps = baseDeps();
  const r = await healOneItem(item, { deps, apply: true, selectionMode: "quarantined-live", requiredSlotsMap: {}, sourcesIndex });
  assert.equal(r.steps.own_body.outcome, "not_applicable");
  assert.ok(!deps.calls.some((c) => c[0] === "insertInstitution" || c[0] === "updateSourceInstitution"));
});

test("healOneItem STEP C: grounds a Gate-A orphan into a NEW FACT claim, clearing the final Gate-A scan", async () => {
  const item = {
    id: "item-c1", item_type: "market_signal", source_id: "src-c", source_url: "https://example.com/notice",
    full_brief: "The notice states rates increased by up to €500,000 this quarter.",
  };
  const sourcesIndex = buildSourcesIndex([{ id: "src-c", url: "https://example.com/notice", base_tier: 3 }]);
  const captures = [{ id: "cap-c", result_url: "https://example.com/notice", result_content: "The notice states rates increased by up to €500,000 this quarter across the board." }];
  const deps = baseDeps({ readCaptures: async () => captures, readClaims: async () => [] });
  const r = await healOneItem(item, { deps, apply: true, selectionMode: "quarantined-live", requiredSlotsMap: {}, sourcesIndex });
  assert.equal(r.steps.orphans.length, 1);
  assert.equal(r.steps.orphans[0].outcome, "grounded");
  assert.ok(deps.calls.some((c) => c[0] === "insertClaim" && c[1].claim_kind === "FACT" && c[1].source_span.includes("500,000")));
  assert.equal(r.steps.gate_a.orphan_count, 0, "the newly grounded claim clears the final Gate-A scan");
});

test("healOneItem STEP C: an orphan found nowhere is reported unprovable, never invented, brief untouched", async () => {
  const item = { id: "item-c2", item_type: "market_signal", source_url: null, full_brief: "Rates increased by up to €500,000 this quarter." };
  const deps = baseDeps({ readClaims: async () => [] });
  const r = await healOneItem(item, { deps, apply: true, selectionMode: "quarantined-live", requiredSlotsMap: {} });
  assert.equal(r.steps.orphans.length, 1);
  assert.equal(r.steps.orphans[0].outcome, "unprovable");
  assert.ok(!deps.calls.some((c) => c[0] === "insertClaim"));
});

test("healOneItem STEP D: prepends the label to an unlabeled-assertion section with no bound FACT claim", async () => {
  const item = { id: "item-d1", item_type: "initiative", full_brief: "", source_url: null };
  const deps = baseDeps({
    readSections: async (id) => (id === "item-d1" ? [{ id: "sec-d1", item_id: "item-d1", section_key: "body", section_order: 1, content_md: "The scheme requires operators to comply with new limits." }] : []),
    readClaims: async () => [],
  });
  const r = await healOneItem(item, { deps, apply: true, selectionMode: "quarantined-live", requiredSlotsMap: {} });
  const entry = r.steps.relabel.find((x) => x.section_id === "sec-d1");
  assert.ok(entry, "unlabeled_assertion section relabeled");
  assert.equal(entry.reason, "unlabeled_assertion");
  const call = deps.calls.find((c) => c[0] === "updateSectionContent" && c[1] === "sec-d1");
  assert.match(call[2], /^\*Analytical inference:\* The scheme requires/);
});

test("healOneItem STEP E + D together: an unresourceable FACT is re-kinded to ANALYSIS and then labeled", async () => {
  const item = { id: "item-e1", item_type: "regulation", full_brief: "", source_url: null };
  const claims = [{ id: "claim-e1", claim_kind: "FACT", claim_text: "the levy applies at a rate nowhere stated in any capture", source_span: "a span nowhere in any capture", source_id: "src-e", section_row_id: "sec-e1" }];
  const deps = baseDeps({
    readClaims: async () => claims,
    readSections: async (id) => (id === "item-e1" ? [{ id: "sec-e1", item_id: "item-e1", section_key: "body", section_order: 1, content_md: "According to this analysis, the levy applies at a rate nowhere stated in any capture, which merits review." }] : []),
  });
  const r = await healOneItem(item, { deps, apply: true, selectionMode: "quarantined-live", requiredSlotsMap: {} });
  assert.equal(r.steps.reclassify.length, 1);
  assert.equal(r.steps.reclassify[0].outcome, "reclassified");
  assert.equal(r.steps.reclassify[0].reason, "span_not_found_anywhere");
  assert.ok(deps.calls.some((c) => c[0] === "updateClaimKind" && c[1] === "claim-e1" && c[2].claim_kind === "ANALYSIS"));
  const relabelEntry = r.steps.relabel.find((x) => x.claim_id === "claim-e1");
  assert.ok(relabelEntry, "the re-kinded claim gets labeled in the SAME run");
  assert.equal(relabelEntry.outcome, "relabeled");
});

test("summarizeReports: tallies the second-pass counters too", () => {
  const perItem = [
    {
      steps: {
        own_body: { outcome: "resolved" },
        resource: [{ outcome: "resourced" }, { outcome: "unresourced" }],
        reclassify: [{ outcome: "reclassified" }],
        orphans: [{ outcome: "grounded" }, { outcome: "unprovable" }],
        relabel: [{ outcome: "relabeled" }],
        gate_a: {}, rederive: { outcome: "still_failing", failures: [] },
      },
    },
  ];
  const s = summarizeReports(perItem);
  assert.equal(s.own_body_resolved, 1);
  assert.equal(s.resourced, 1);
  assert.equal(s.unresourced, 1);
  assert.equal(s.refactored_to_analysis, 1);
  assert.equal(s.orphans_grounded, 1);
  assert.equal(s.orphans_unprovable, 1);
  assert.equal(s.relabeled_paragraphs, 1);
});

test("main: builds the sources index once from readAllSources and threads it into every item", async () => {
  const item = {
    id: "item-r2", item_type: "regulation", source_id: "src-primary",
    source_url: "https://eur-lex.europa.eu/doc/1", full_brief: "",
  };
  const claims = [{ id: "claim-1", claim_kind: "FACT", claim_text: "[threshold] 9 tonnes", source_span: "9 tonnes", source_id: "src-secondary", section_row_id: "sec-1" }];
  const captures = [{ id: "cap-primary", result_url: "https://eur-lex.europa.eu/doc/1", result_content: "the annual limit is 9 tonnes for this class." }];
  const deps = baseDeps({
    readByIds: async () => [item],
    readCaptures: async () => captures,
    readClaims: async () => claims,
    readAllSources: async () => [
      { id: "src-primary", url: "https://eur-lex.europa.eu/doc/1", base_tier: 2 },
      { id: "src-secondary", url: "https://blog.example/", base_tier: 6 },
    ],
  });
  const r = await main({ mode: "apply", arg: "ids:item-r2" }, deps);
  assert.equal(r.per_item[0].steps.resource[0].outcome, "resourced");
  assert.equal(r.counts.resourced, 1);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// THIRD PASS (HEAL-3, 2026-09-03) — SLOT MARKER, RELABEL normalization fix, CAPTURE-CITED.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

// ── SLOT MARKER ──────────────────────────────────────────────────────────────────────────────────────

test("extractSlotKeyFromMarker: parses the leading '[<slot_key>] ' marker; null when absent", () => {
  assert.equal(extractSlotKeyFromMarker("[primary_deadline] The captured source states, verbatim: «x»"), "primary_deadline");
  assert.equal(extractSlotKeyFromMarker("[TITLE] some identity text"), "TITLE", "case-insensitive MATCH, original case preserved in the captured group");
  assert.equal(extractSlotKeyFromMarker("no marker here at all"), null);
  assert.equal(extractSlotKeyFromMarker("the levy applies [not_a_prefix]"), null, "marker must be LEADING");
  assert.equal(extractSlotKeyFromMarker(null), null);
});

test("isRequiredSlotMarkerClaim: true only when the marker's slot_key is a member of that item_type's required-slots list", () => {
  const map = { regulation: ["primary_deadline", "effective_date"] };
  assert.equal(isRequiredSlotMarkerClaim("[primary_deadline] x", "regulation", map), true);
  assert.equal(isRequiredSlotMarkerClaim("[title] x", "regulation", map), false, "title is never a required slot");
  assert.equal(isRequiredSlotMarkerClaim("[primary_deadline] x", "market_signal", map), false, "wrong item_type");
  assert.equal(isRequiredSlotMarkerClaim("no marker", "regulation", map), false);
});

// ── CAPTURE-CITED: pure helpers ─────────────────────────────────────────────────────────────────────

test("collectCitedUrls: URLs literally in section content_md, plus each claim's resolved source url via sourcesIndex; deduplicated", () => {
  const sections = [{ content_md: "See https://example.com/a and also (https://example.com/b)." }];
  const claims = [
    { source_id: "s1" }, // resolves via sourcesIndex
    { source_id: null }, // no source_id -> contributes nothing
    { source_id: "s1" }, // duplicate source -> deduped
  ];
  const sourcesIndex = { byId: new Map([["s1", { id: "s1", url: "https://example.com/c" }]]) };
  const urls = collectCitedUrls({ sections, claims, sourcesIndex });
  assert.deepEqual(urls.sort(), ["https://example.com/a", "https://example.com/b", "https://example.com/c"].sort());
  assert.equal(new Set(urls).size, urls.length, "no duplicates despite the repeated source_id");
});

test("collectCitedUrls: intelligence_items.source_urls is never read (no such column exists, 2026-09-03 grep-confirmed) -- only sections + claim sources contribute", () => {
  const sections = [];
  const claims = [];
  const urls = collectCitedUrls({ sections, claims, sourcesIndex: { byId: new Map() } });
  assert.deepEqual(urls, []);
});

test("unfetchedCitedUrls: drops URLs already represented (canonicalized) among captures' own result_url", () => {
  const captures = [{ result_url: "https://Example.com/Doc/" }];
  const out = unfetchedCitedUrls(["https://example.com/doc", "https://example.com/other"], captures);
  assert.deepEqual(out, ["https://example.com/other"]);
});

test("unfetchedCitedUrls: dedupes candidates by canonical form too (trailing-slash equal; scheme is NOT normalized by canonicalizeCitationUrl)", () => {
  const out = unfetchedCitedUrls(["https://x.example/a", "https://x.example/a/", "http://x.example/a"], []);
  assert.equal(out.length, 2, "https://x.example/a and its trailing-slash form collapse; http:// is a distinct canonical form");
});

// ── CAPTURE-CITED: captureCitedUrl ──────────────────────────────────────────────────────────────────

test("captureCitedUrl: no url -> held no_source_url, no fetch attempted", async () => {
  let fetched = false;
  const r = await captureCitedUrl(null, { fetchImpl: async () => { fetched = true; } });
  assert.equal(r.status, "held");
  assert.equal(r.reason, "no_source_url");
  assert.equal(fetched, false);
});

test("captureCitedUrl: eurlex host, canonical key derived from the URL ITSELF (never an item's own instrument_identifier) -- unresolvable -> held, no fetch", async () => {
  let fetched = false;
  const r = await captureCitedUrl("https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=NOTACELEX", { fetchImpl: async () => { fetched = true; } });
  assert.equal(r.status, "held");
  assert.equal(r.reason, "canonical_key_unresolved");
  assert.equal(fetched, false);
});

test("captureCitedUrl: federal_register host with no resolvable document number -> held, no fetch", async () => {
  let fetched = false;
  const r = await captureCitedUrl("https://www.federalregister.gov/d/2026-00000", { fetchImpl: async () => { fetched = true; } });
  assert.equal(r.status, "held");
  assert.equal(r.reason, "fr_document_number_unresolved");
  assert.equal(fetched, false);
});

test("captureCitedUrl: plain-GET family captures on a usable response", async () => {
  const fetchImpl = async () => ({ ok: true, status: 200, text: async () => "<html><title>Cited</title><body>" + "cited content ".repeat(40) + "</body></html>" });
  const r = await captureCitedUrl("https://example-regulator.gov/other-notice", { fetchImpl });
  assert.equal(r.status, "captured");
  assert.ok(r.text.length > 200);
});

test("captureCitedUrl: plain-GET family holds capture_blocked_no_archive when both the direct fetch AND the archive fallback refuse (FIFTH PASS)", async () => {
  const fetchImpl = async () => ({ ok: false, status: 404, text: async () => "not found" });
  const r = await captureCitedUrl("https://example-regulator.gov/gone-cited", { fetchImpl });
  assert.equal(r.status, "held");
  assert.equal(r.reason, "capture_blocked_no_archive");
  assert.equal(r.evidence.direct.status, 404);
});

test("captureCitedUrl: .pdf URL, non-PDF body -> held pdf_unsupported (never mistaken for HTML)", async () => {
  const fetchImpl = async () => ({ ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode("<html>not a pdf</html>").buffer });
  const r = await captureCitedUrl("https://example.com/report.pdf", { fetchImpl });
  assert.equal(r.status, "held");
  assert.equal(r.reason, "pdf_unsupported");
});

test("captureCitedUrl: .pdf URL, fetch fails, no archive snapshot either -> held capture_blocked_no_archive, no pdf parse attempted", async () => {
  const fetchImpl = async (url) => {
    if (String(url).startsWith("https://archive.org/wayback/available")) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ archived_snapshots: {} }) };
    }
    return { ok: false, status: 503 };
  };
  const r = await captureCitedUrl("https://example.com/report.pdf", { fetchImpl });
  assert.equal(r.status, "held");
  assert.equal(r.reason, "capture_blocked_no_archive");
});

// unpdf is a runtime dependency loaded dynamically by pdf-extract.mjs; the discipline CI job runs the
// unit suite without runtime deps installed (pdf-extract.mjs's own header: "unit-tested in the depless
// discipline CI"), so this proof runs only where the codec is importable and reports itself skipped
// elsewhere, never a false red (CI run 33801582259, 2026-09-03: held !== captured for exactly this reason).
// Probed through the relative codec module (the discipline glob-portability gate forbids bare-package
// imports in test files; pdf-extract.mjs owns the dynamic unpdf import).
const UNPDF_AVAILABLE = await import("../../src/lib/sources/pdf-extract.mjs")
  .then((m) => m.pdfToText(new Uint8Array(Buffer.from("%PDF-1.4\n%%EOF", "latin1"))).then(() => true, (e) => !/Cannot find (package|module)/i.test(String(e && e.message))))
  .catch(() => false);
// Minimal xref-correct PDF, same builder as scripts/_diag/_pdf-probe.mjs's own proof. Module-scope so both
// the direct-capture PDF test below and the archive-fallback PDF test (FIFTH PASS, build item 4) share ONE
// builder rather than two copies.
function minimalPdf(text) {
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    null,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const stream = `BT /F1 24 Tf 72 700 Td (${text}) Tj ET`;
  objs[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  let body = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(body.length); body += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xrefStart = body.length;
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((off) => { body += `${String(off).padStart(10, "0")} 00000 n \n`; });
  body += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return new Uint8Array(Buffer.from(body, "latin1"));
}
test("captureCitedUrl: .pdf URL, real PDF bytes -> captured, text extracted via the existing pdf-extract.mjs codec", { skip: UNPDF_AVAILABLE ? false : "unpdf not installed in this environment (depless discipline CI)" }, async () => {
  const bytes = minimalPdf("Hello cited PDF marker");
  const fetchImpl = async () => ({ ok: true, status: 200, arrayBuffer: async () => bytes.buffer });
  const r = await captureCitedUrl("https://example.com/cited.pdf", { fetchImpl });
  assert.equal(r.status, "captured");
  assert.match(r.text, /Hello cited PDF marker/);
  assert.equal(r.evidence.pdf, true);
});

test("captureCitedUrl: .pdf URL, direct fetch fails but a PDF snapshot exists on Wayback -> captured via the SAME pdf-extract.mjs codec (build item 4)", { skip: UNPDF_AVAILABLE ? false : "unpdf not installed in this environment (depless discipline CI)" }, async () => {
  const citedUrl = "https://example.com/archived-report.pdf";
  const pdfBytes = minimalPdf("Hello archived PDF marker");
  const fetchImpl = async (url) => {
    const u = String(url);
    if (u.startsWith("https://archive.org/wayback/available")) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            archived_snapshots: {
              closest: { available: true, status: "200", timestamp: "20250701000000", url: `http://web.archive.org/web/20250701000000/${citedUrl}` },
            },
          }),
      };
    }
    if (u.startsWith("https://web.archive.org/web/20250701000000id_/")) {
      return { ok: true, status: 200, arrayBuffer: async () => pdfBytes.buffer };
    }
    return { ok: false, status: 503 };
  };
  const r = await captureCitedUrl(citedUrl, { fetchImpl });
  assert.equal(r.status, "captured");
  assert.equal(r.url, citedUrl); // result_url stays the CITED url, never the snapshot url (doctrine point)
  assert.match(r.text, /Hello archived PDF marker/);
  assert.equal(r.evidence.pdf, true);
  assert.equal(r.evidence.transport, "wayback");
  assert.equal(r.evidence.snapshot_timestamp, "20250701000000");
});

// ── healOneItem — SLOT-REPAIR, RECLASSIFY GAP branch, RELABEL normalization, CAPTURE-CITED wiring ────

test("healOneItem SLOT-REPAIR: a required-slot claim previously mis-kinded to ANALYSIS is converted back to the kit's own honest GAP (never left ANALYSIS)", async () => {
  const item = { id: "item-sr1", item_type: "regulation", full_brief: "", source_url: null };
  const claims = [{ id: "claim-sr1", claim_kind: "ANALYSIS", claim_text: "[primary_deadline] the deadline was not clearly stated", source_span: null, source_id: null, section_row_id: "sec-sr1" }];
  const requiredSlotsMap = { regulation: ["primary_deadline"] };
  const deps = baseDeps({
    readClaims: async () => claims,
    readSections: async (id) => (id === "item-sr1" ? [{ id: "sec-sr1", item_id: "item-sr1", section_key: "record_facts", section_order: 2, content_md: "[primary_deadline] the deadline was not clearly stated" }] : []),
  });
  const r = await healOneItem(item, { deps, apply: true, selectionMode: "quarantined-live", requiredSlotsMap });
  assert.equal(r.steps.slot_repair.length, 1);
  assert.equal(r.steps.slot_repair[0].outcome, "repaired_to_gap");
  assert.equal(r.steps.slot_repair[0].slot_key, "primary_deadline");
  const call = deps.calls.find((c) => c[0] === "updateClaimKind" && c[1] === "claim-sr1");
  assert.ok(call, "the guarded path was used");
  assert.equal(call[2].claim_kind, "GAP");
  assert.match(call[2].claim_text, /^\[primary_deadline\]/);
  assert.equal(call[2].source_span, null);
  // never appears in RELABEL's ANALYSIS loop once repaired
  assert.ok(!r.steps.relabel.some((x) => x.claim_id === "claim-sr1"));
});

test("healOneItem SLOT-REPAIR: dry mode reports would_repair_to_gap, writes nothing", async () => {
  const item = { id: "item-sr2", item_type: "regulation", full_brief: "", source_url: null };
  const claims = [{ id: "claim-sr2", claim_kind: "ANALYSIS", claim_text: "[primary_deadline] x", source_span: null, source_id: null }];
  const requiredSlotsMap = { regulation: ["primary_deadline"] };
  const deps = baseDeps({ readClaims: async () => claims });
  const r = await healOneItem(item, { deps, apply: false, selectionMode: "quarantined-live", requiredSlotsMap });
  assert.equal(r.steps.slot_repair[0].outcome, "would_repair_to_gap");
  assert.deepEqual(deps.calls, []);
});

test("healOneItem SLOT-REPAIR: an ANALYSIS claim's marker that is NOT a required slot for this item_type is left alone", async () => {
  const item = { id: "item-sr3", item_type: "regulation", full_brief: "", source_url: null };
  const claims = [{ id: "claim-sr3", claim_kind: "ANALYSIS", claim_text: "[title] the levy applies broadly", source_span: null }];
  const deps = baseDeps({ readClaims: async () => claims });
  const r = await healOneItem(item, { deps, apply: true, selectionMode: "quarantined-live", requiredSlotsMap: { regulation: ["primary_deadline"] } });
  assert.deepEqual(r.steps.slot_repair, []);
});

test("healOneItem STEP E (RECLASSIFY): a required-slot FACT claim's unrecoverable residue becomes GAP, never ANALYSIS", async () => {
  const item = { id: "item-e2", item_type: "regulation", full_brief: "", source_url: null };
  const claims = [{ id: "claim-e2", claim_kind: "FACT", claim_text: "[primary_deadline] a deadline nowhere stated in any capture", source_span: "a span nowhere in any capture", source_id: "src-e2", section_row_id: "sec-e2" }];
  const requiredSlotsMap = { regulation: ["primary_deadline"] };
  const deps = baseDeps({ readClaims: async () => claims });
  const r = await healOneItem(item, { deps, apply: true, selectionMode: "quarantined-live", requiredSlotsMap });
  assert.equal(r.steps.reclassify.length, 1);
  assert.equal(r.steps.reclassify[0].outcome, "reclassified_to_gap");
  assert.equal(r.steps.reclassify[0].slot_key, "primary_deadline");
  const call = deps.calls.find((c) => c[0] === "updateClaimKind" && c[1] === "claim-e2");
  assert.equal(call[2].claim_kind, "GAP");
  assert.notEqual(call[2].claim_kind, "ANALYSIS");
  // a GAP claim is never fed into RELABEL's ANALYSIS loop
  assert.ok(!r.steps.relabel.some((x) => x.claim_id === "claim-e2"));
});

test("healOneItem RELABEL: normalized matching finds the owning paragraph even when claim_text differs from the paragraph by whitespace/curly-quote drift", async () => {
  const item = { id: "item-rl1", item_type: "initiative", full_brief: "", source_url: null };
  const claims = [{ id: "claim-rl1", claim_kind: "ANALYSIS", claim_text: 'the levy "applies broadly" across the sector', source_span: null, section_row_id: "sec-rl1" }];
  const deps = baseDeps({
    readClaims: async () => claims,
    readSections: async (id) => (id === "item-rl1"
      ? [{ id: "sec-rl1", item_id: "item-rl1", section_key: "body", section_order: 1, content_md: 'Background.\n\nAccording to this reading, the levy   “applies\nbroadly” across the sector, per industry chatter.' }]
      : []),
  });
  const r = await healOneItem(item, { deps, apply: true, selectionMode: "quarantined-live", requiredSlotsMap: {} });
  const entry = r.steps.relabel.find((x) => x.claim_id === "claim-rl1");
  assert.ok(entry, "found the owning paragraph under normalization");
  assert.equal(entry.outcome, "relabeled");
});

test("healOneItem RELABEL: a claim with no owning section/paragraph anywhere is reported no_owning_section_found, never silently dropped", async () => {
  const item = { id: "item-rl2", item_type: "initiative", full_brief: "", source_url: null };
  const claims = [{ id: "claim-rl2", claim_kind: "ANALYSIS", claim_text: "this text appears nowhere in any section", source_span: null, section_row_id: null }];
  const deps = baseDeps({
    readClaims: async () => claims,
    readSections: async (id) => (id === "item-rl2" ? [{ id: "sec-rl2", item_id: "item-rl2", section_key: "body", section_order: 1, content_md: "Completely unrelated prose." }] : []),
  });
  const r = await healOneItem(item, { deps, apply: true, selectionMode: "quarantined-live", requiredSlotsMap: {} });
  const entry = r.steps.relabel.find((x) => x.claim_id === "claim-rl2");
  assert.ok(entry);
  assert.equal(entry.outcome, "no_owning_section_found");
});

test("healOneItem CAPTURE-CITED: fetches a URL cited in a section's own content_md, before RESOURCE/ORPHANS run, writing a distinguishable search_query", async () => {
  const item = { id: "item-cc1", item_type: "market_signal", source_id: "src-cc1", source_url: "https://example.com/primary", full_brief: "" };
  const sourcesIndex = buildSourcesIndex([{ id: "src-cc1", url: "https://example.com/primary", base_tier: 3 }]);
  const captures = [{ id: "cap-cc1", result_url: "https://example.com/primary", result_content: "the primary capture, thin." }];
  const sections = [{ id: "sec-cc1", item_id: "item-cc1", section_key: "body", section_order: 1, content_md: "See the cited notice at https://example.com/cited for details." }];
  const fetchImpl = async () => ({ ok: true, status: 200, text: async () => "<html><title>Cited</title><body>" + "cited detail ".repeat(40) + "</body></html>" });
  const deps = baseDeps({
    fetchImpl,
    readCaptures: async () => captures,
    readClaims: async () => [],
    readSections: async (id) => (id === "item-cc1" ? sections : []),
  });
  const r = await healOneItem(item, { deps, apply: true, selectionMode: "quarantined-live", requiredSlotsMap: {}, sourcesIndex });
  assert.equal(r.steps.capture_cited.fetched, 1);
  assert.equal(r.steps.capture_cited.results[0].outcome, "captured");
  const call = deps.calls.find((c) => c[0] === "insertSearch" && c[1].result_url === "https://example.com/cited");
  assert.ok(call, "the cited URL was captured and written");
  assert.equal(call[1].search_query, "heal-provenance:capture-cited");
});

test("healOneItem CAPTURE-CITED: a cited URL already represented among the item's captures is skipped, never re-fetched", async () => {
  const item = { id: "item-cc2", item_type: "market_signal", source_url: "https://example.com/primary", full_brief: "" };
  // >200 chars so STEP 1's own needsCapture check is already satisfied and does not itself fetch --
  // isolating this test to CAPTURE-CITED's own skip-already-captured logic.
  const captures = [{ id: "cap-cc2", result_url: "https://example.com/cited", result_content: "already captured and present. ".repeat(10) }];
  const sections = [{ id: "sec-cc2", item_id: "item-cc2", section_key: "body", section_order: 1, content_md: "See https://example.com/cited for detail." }];
  let fetched = 0;
  const deps = baseDeps({
    fetchImpl: async () => { fetched += 1; return { ok: true, status: 200, text: async () => "x".repeat(300) }; },
    readCaptures: async () => captures,
    readClaims: async () => [],
    readSections: async (id) => (id === "item-cc2" ? sections : []),
  });
  const r = await healOneItem(item, { deps, apply: true, selectionMode: "quarantined-live", requiredSlotsMap: {} });
  assert.equal(r.steps.capture_cited.to_fetch, 0);
  assert.equal(fetched, 0, "no network call for an already-captured URL");
});

test("healOneItem CAPTURE-CITED: bounded to CAPTURE_CITED_MAX_PER_ITEM fetches/item/run, overflow reported", async () => {
  const many = Array.from({ length: CAPTURE_CITED_MAX_PER_ITEM + 5 }, (_, i) => `https://example.com/doc-${i}`);
  const item = { id: "item-cc3", item_type: "market_signal", source_url: null, full_brief: "" };
  const sections = [{ id: "sec-cc3", item_id: "item-cc3", section_key: "body", section_order: 1, content_md: many.join(" ") }];
  let fetchCount = 0;
  const deps = baseDeps({
    fetchImpl: async () => { fetchCount += 1; return { ok: true, status: 200, text: async () => "x".repeat(300) }; },
    readClaims: async () => [],
    readSections: async (id) => (id === "item-cc3" ? sections : []),
  });
  const r = await healOneItem(item, { deps, apply: true, selectionMode: "quarantined-live", requiredSlotsMap: {} });
  assert.equal(r.steps.capture_cited.to_fetch, many.length);
  assert.equal(r.steps.capture_cited.fetched, CAPTURE_CITED_MAX_PER_ITEM);
  assert.equal(r.steps.capture_cited.bound_hit, true);
  assert.equal(r.steps.capture_cited.overflow, 5);
  assert.equal(fetchCount, CAPTURE_CITED_MAX_PER_ITEM, "never fetches past the bound");
});

test("healOneItem CAPTURE-CITED: dry mode reports would_fetch for every candidate, makes no fetch/write", async () => {
  const item = { id: "item-cc4", item_type: "market_signal", source_url: null, full_brief: "" };
  const sections = [{ id: "sec-cc4", item_id: "item-cc4", section_key: "body", section_order: 1, content_md: "See https://example.com/cited-dry for detail." }];
  const deps = baseDeps({ readClaims: async () => [], readSections: async (id) => (id === "item-cc4" ? sections : []) });
  const r = await healOneItem(item, { deps, apply: false, selectionMode: "quarantined-live", requiredSlotsMap: {} });
  assert.equal(r.steps.capture_cited.results[0].outcome, "would_fetch");
  assert.deepEqual(deps.calls, []);
});

test("summarizeReports: tallies the third-pass counters (slot_repaired_to_gap, reclassified_to_gap, cited_captured/held, relabel_no_owning_section)", () => {
  const perItem = [
    {
      steps: {
        slot_repair: [{ outcome: "repaired_to_gap" }],
        reclassify: [{ outcome: "reclassified_to_gap" }, { outcome: "reclassified" }],
        relabel: [{ outcome: "no_owning_section_found" }, { outcome: "relabeled" }],
        capture_cited: { bound_hit: true, results: [{ outcome: "captured" }, { outcome: "held" }] },
        gate_a: {}, rederive: { outcome: "still_failing", failures: [] },
      },
    },
  ];
  const s = summarizeReports(perItem);
  assert.equal(s.slot_repaired_to_gap, 1);
  assert.equal(s.reclassified_to_gap, 1);
  assert.equal(s.refactored_to_analysis, 1);
  assert.equal(s.relabel_no_owning_section, 1);
  assert.equal(s.relabeled_paragraphs, 1);
  assert.equal(s.cited_captured, 1);
  assert.equal(s.cited_held, 1);
  assert.equal(s.cited_bound_hit_items, 1);
});

test("main: final_failures_by_item carries each item's own remaining failures, so the coordinator can read residue without re-querying", async () => {
  const item = { id: "item-ff1", item_type: "regulation", full_brief: "", source_url: null };
  const deps = baseDeps({
    readByIds: async () => [item],
    validateProvenance: async () => ({ valid: false, recommended_status: "quarantined", failures: [{ criterion: 7, reason: "gate_a_unproven_or_stale" }] }),
  });
  const r = await main({ mode: "apply", arg: "ids:item-ff1" }, deps);
  assert.equal(r.final_failures_by_item.length, 1);
  assert.equal(r.final_failures_by_item[0].id, "item-ff1");
  assert.deepEqual(r.final_failures_by_item[0].failures, [{ criterion: 7, reason: "gate_a_unproven_or_stale" }]);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// FOURTH PASS (HEAL-4, 2026-09-03) — OWNING-PARAGRAPH REWRITE: the scorer, the sentence picker, marker
// stripping, the refusal path, RELABEL's marker-replacement, and the end-to-end STEP E / RETROFIT fixes
// for the measured defect (365 analysis_missing_label_syntax failures, 45 items, run 33804206617).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

// ── the scorer ───────────────────────────────────────────────────────────────────────────────────────

test("overlapTokens: lowercase, alphanumeric, length >= 3, stopwords excluded", () => {
  assert.deepEqual(overlapTokens("The Levy Is 4% and it applies to All operators"), new Set(["levy", "applies", "operators"]));
  assert.deepEqual(overlapTokens(""), new Set());
  assert.deepEqual(overlapTokens(null), new Set());
});

test("jaccardTokenOverlap: identical text scores 1, wholly unrelated text scores 0", () => {
  assert.equal(jaccardTokenOverlap("the levy applies broadly across operators", "the levy applies broadly across operators"), 1);
  assert.equal(jaccardTokenOverlap("shipping corridor pricing update", "container weighing port inspection schedule"), 0);
});

test("jaccardTokenOverlap: an all-stopword or empty side scores 0 (never a spurious match)", () => {
  assert.equal(jaccardTokenOverlap("the and for", "some real content about corridors"), 0);
  assert.equal(jaccardTokenOverlap("", "some real content"), 0);
  assert.equal(jaccardTokenOverlap(null, undefined), 0);
});

test("jaccardTokenOverlap: a realistic paraphrase clears OWNING_PARAGRAPH_MIN_SCORE; an unrelated paragraph in the same section does not", () => {
  const claim = "Base freight rates on this corridor are expected to rise about eight percent due to fuel surcharges";
  const paraphraseSource = "According to the notice, shippers moving cargo through the corridor will see a base rate increase of approximately eight percent effective the first of next month, driven by fuel surcharge adjustments.";
  const unrelated = "Regulators also confirmed a separate review of container weighing procedures at three major ports, unrelated to pricing.";
  assert.ok(jaccardTokenOverlap(claim, paraphraseSource) >= OWNING_PARAGRAPH_MIN_SCORE, "paraphrase clears the threshold");
  assert.equal(jaccardTokenOverlap(claim, unrelated), 0, "topically unrelated paragraph scores zero");
});

// ── findOwningParagraphByOverlap ────────────────────────────────────────────────────────────────────

test("findOwningParagraphByOverlap: picks the highest-scoring paragraph among several, ignoring unrelated ones", () => {
  const claim = "Base freight rates on this corridor are expected to rise about eight percent due to fuel surcharges";
  const contentMd = [
    "Background context about the sector overall, with no figures at all.",
    "Regulators also confirmed a separate review of container weighing procedures at three major ports, unrelated to pricing.",
    "According to the notice, shippers moving cargo through the corridor will see a base rate increase of approximately eight percent effective the first of next month, driven by fuel surcharge adjustments.",
  ].join("\n\n");
  const r = findOwningParagraphByOverlap(claim, contentMd);
  assert.equal(r.found, true);
  assert.match(r.paragraph, /base rate increase/);
});

test("findOwningParagraphByOverlap: refuses when nothing in the text clears the threshold, reporting the best score", () => {
  const claim = "Base freight rates on this corridor are expected to rise about eight percent due to fuel surcharges";
  const contentMd = "Regulators also confirmed a separate review of container weighing procedures at three major ports, unrelated to pricing.";
  const r = findOwningParagraphByOverlap(claim, contentMd);
  assert.equal(r.found, false);
  assert.equal(r.bestScore, 0);
});

test("findOwningParagraphByOverlap: empty content_md refuses with bestScore 0, never throws", () => {
  assert.deepEqual(findOwningParagraphByOverlap("anything", ""), { found: false, bestScore: 0 });
  assert.deepEqual(findOwningParagraphByOverlap("anything", "\n\n"), { found: false, bestScore: 0 });
});

// ── splitSentences / pickBestSentence (the sentence picker) ────────────────────────────────────────

test("splitSentences: splits on sentence-ending punctuation, trims, drops empties", () => {
  assert.deepEqual(
    splitSentences("First sentence. Second sentence! Third sentence?"),
    ["First sentence.", "Second sentence!", "Third sentence?"],
  );
  assert.deepEqual(splitSentences("No terminal punctuation here"), ["No terminal punctuation here"]);
  assert.deepEqual(splitSentences(""), []);
  assert.deepEqual(splitSentences("   "), []);
});

test("pickBestSentence: deterministically picks the single sentence with the highest overlap against claim_text", () => {
  const para = "Background context about the sector overall. The notice states rates will increase by roughly eight percent for the CNSHA corridor beginning next quarter, citing fuel costs. Analysts have offered mixed views on the outlook.";
  const claim = "Base freight rates on this corridor are expected to rise about eight percent due to fuel surcharges";
  const picked = pickBestSentence(para, claim);
  assert.match(picked.sentence, /CNSHA corridor beginning next quarter/);
  assert.ok(picked.score > 0);
});

test("pickBestSentence: ties keep the first (earliest) sentence at that score", () => {
  // both sentences share zero scoreable tokens with the claim -> tie at score 0, first wins
  const para = "Alpha sentence about nothing relevant. Beta sentence about nothing relevant either.";
  const picked = pickBestSentence(para, "wholly disjoint claim text");
  assert.match(picked.sentence, /^Alpha sentence/);
});

test("pickBestSentence: null for a blank paragraph", () => {
  assert.equal(pickBestSentence("", "claim"), null);
  assert.equal(pickBestSentence("   ", "claim"), null);
});

// ── stripLeadingMarker (the marker stripper) ────────────────────────────────────────────────────────

test("stripLeadingMarker: strips **FACT:**, *FACT:*, and FACT: (case-insensitive)", () => {
  assert.equal(stripLeadingMarker("**FACT:** The levy is four percent."), "The levy is four percent.");
  assert.equal(stripLeadingMarker("*FACT:* The levy is four percent."), "The levy is four percent.");
  assert.equal(stripLeadingMarker("FACT: The levy is four percent."), "The levy is four percent.");
  assert.equal(stripLeadingMarker("fact: The levy is four percent."), "The levy is four percent.");
});

test("stripLeadingMarker: strips a leading analysis label of any of the four forms", () => {
  assert.equal(stripLeadingMarker("*Per the workspace's reading:* The levy applies broadly."), "The levy applies broadly.");
  assert.equal(stripLeadingMarker("*Analytical inference:* The levy applies broadly."), "The levy applies broadly.");
  assert.equal(stripLeadingMarker("Industry interpretation: The levy applies broadly."), "The levy applies broadly.");
});

test("stripLeadingMarker: a no-op when neither marker is present", () => {
  assert.equal(stripLeadingMarker("Ordinary sentence with no marker."), "Ordinary sentence with no marker.");
  assert.equal(stripLeadingMarker(""), "");
  assert.equal(stripLeadingMarker(null), "");
});

// ── planOwningParagraphRewrite (paragraph + sentence + marker-strip, combined) ─────────────────────

test("planOwningParagraphRewrite: found -> newClaimText is a verbatim substring of the winning paragraph", () => {
  const claim = "Base freight rates on this corridor are expected to rise about eight percent due to fuel surcharges";
  const contentMd = "Background context about the sector overall. The notice states rates will increase by roughly eight percent for the CNSHA corridor beginning next quarter, citing fuel costs. Analysts have offered mixed views on the outlook.";
  const r = planOwningParagraphRewrite(claim, contentMd);
  assert.equal(r.outcome, "found");
  assert.ok(contentMd.includes(r.newClaimText), "the new claim_text is a VERBATIM substring of the paragraph");
  assert.match(r.newClaimText, /CNSHA corridor/);
});

test("planOwningParagraphRewrite: the refusal path — nothing in the text clears the threshold", () => {
  const claim = "Base freight rates on this corridor are expected to rise about eight percent due to fuel surcharges";
  const r = planOwningParagraphRewrite(claim, "Regulators also confirmed a separate review of container weighing procedures at three major ports, unrelated to pricing.");
  assert.equal(r.outcome, "no_owning_paragraph");
  assert.equal(r.bestScore, 0);
});

test("planOwningParagraphRewrite: a leading marker on the winning paragraph's chosen sentence is stripped from newClaimText", () => {
  const claim = "The levy applies broadly across the sector this quarter";
  const contentMd = "**FACT:** The levy applies broadly across the sector this quarter, per the filing.";
  const r = planOwningParagraphRewrite(claim, contentMd);
  assert.equal(r.outcome, "found");
  assert.doesNotMatch(r.newClaimText, /FACT:/i);
  assert.match(r.newClaimText, /^The levy applies broadly/);
});

// ── planRelabelParagraph: marker REPLACEMENT, not stacking (2026-09-03 FOURTH PASS) ────────────────

test("planRelabelParagraph: a leading **FACT:**/*FACT:*/FACT: marker on the winning paragraph is REPLACED by the label, never stacked in front of it", () => {
  const claimText = "The levy applies broadly across the sector this quarter.";
  for (const marker of ["**FACT:**", "*FACT:*", "FACT:"]) {
    const md = `${marker} ${claimText}`;
    const plan = planRelabelParagraph(md, claimText);
    assert.equal(plan.content_md, `*Analytical inference:* ${claimText}`, `marker form ${marker} is replaced, not stacked`);
    assert.doesNotMatch(plan.after, /FACT:/i);
  }
});

test("planRelabelParagraph: a paragraph with no leading marker keeps prior (prepend-only) behavior — no regression", () => {
  const md = "Intro paragraph, unrelated.\n\nThe regulation requires strict reporting by operators.";
  const plan = planRelabelParagraph(md, "requires strict reporting by operators");
  assert.match(plan.content_md, /^Intro paragraph, unrelated\.\n\n\*Analytical inference:\* The regulation requires/);
});

// ── healOneItem STEP E — the paraphrase-defect end-to-end fix ──────────────────────────────────────

test("healOneItem STEP E (FOURTH PASS): a FACT claim whose claim_text is a PARAPHRASE of its own section's paragraph is reclassified with claim_text REWRITTEN to a verbatim sentence, then relabeled in the SAME run", async () => {
  const item = { id: "item-e3", item_type: "regulation", full_brief: "", source_url: null };
  // claim_text is a paraphrase: not literally (nor normalized-literally) present in the section at all,
  // reproducing the measured defect exactly (a FACT claim_text was never required to be verbatim; only
  // source_span was).
  const claims = [{
    id: "claim-e3", claim_kind: "FACT",
    claim_text: "Base freight rates on this corridor are expected to rise about eight percent due to fuel surcharges",
    source_span: "a span nowhere in any capture", source_id: "src-e3", section_row_id: "sec-e3",
  }];
  const deps = baseDeps({
    readClaims: async () => claims,
    readSections: async (id) => (id === "item-e3" ? [{
      id: "sec-e3", item_id: "item-e3", section_key: "body", section_order: 1,
      content_md: "Background context about the sector overall. The notice states rates will increase by roughly eight percent for the CNSHA corridor beginning next quarter, citing fuel costs. Analysts have offered mixed views on the outlook.",
    }] : []),
  });
  const r = await healOneItem(item, { deps, apply: true, selectionMode: "quarantined-live", requiredSlotsMap: {} });

  assert.equal(r.steps.reclassify.length, 1);
  const rc = r.steps.reclassify[0];
  assert.equal(rc.outcome, "reclassified");
  assert.equal(rc.rewritten, true);
  assert.notEqual(rc.claim_text_after, rc.claim_text_before);
  const kindCall = deps.calls.find((c) => c[0] === "updateClaimKind" && c[1] === "claim-e3");
  assert.equal(kindCall[2].claim_kind, "ANALYSIS");
  assert.equal(kindCall[2].claim_text, rc.claim_text_after);

  // the SAME run's STEP D finds the (now-rewritten) claim_text in its section and labels it
  const relabelEntry = r.steps.relabel.find((x) => x.claim_id === "claim-e3");
  assert.ok(relabelEntry, "the rewritten claim was relabeled in the same run");
  assert.equal(relabelEntry.outcome, "relabeled");

  // criterion 4's OWN test, mirrored: the FINAL section content (post-relabel) must both carry a label AND
  // ILIKE-contain the FINAL claim_text — end-to-end proof this closes the measured defect.
  const sectionWrite = deps.calls.find((c) => c[0] === "updateSectionContent" && c[1] === "sec-e3");
  assert.ok(sectionWrite, "STEP D wrote the relabeled section");
  const finalContentMd = sectionWrite[2];
  assert.match(finalContentMd, /\*Analytical inference:\*/);
  assert.ok(finalContentMd.toLowerCase().includes(rc.claim_text_after.toLowerCase()), "criterion 4's ILIKE would find the final claim_text in the final section content");
});

test("healOneItem STEP E (FOURTH PASS): a FACT claim with NO plausible owning paragraph anywhere in its own section is REFUSED — left as FACT, unchanged, never forced into ANALYSIS", async () => {
  const item = { id: "item-e4", item_type: "regulation", full_brief: "", source_url: null };
  const claims = [{
    id: "claim-e4", claim_kind: "FACT",
    claim_text: "Base freight rates on this corridor are expected to rise about eight percent due to fuel surcharges",
    source_span: "a span nowhere in any capture", source_id: "src-e4", section_row_id: "sec-e4",
  }];
  const deps = baseDeps({
    readClaims: async () => claims,
    readSections: async (id) => (id === "item-e4" ? [{
      id: "sec-e4", item_id: "item-e4", section_key: "body", section_order: 1,
      content_md: "Regulators also confirmed a separate review of container weighing procedures at three major ports, unrelated to pricing.",
    }] : []),
  });
  const r = await healOneItem(item, { deps, apply: true, selectionMode: "quarantined-live", requiredSlotsMap: {} });

  assert.equal(r.steps.reclassify.length, 1);
  const rc = r.steps.reclassify[0];
  assert.equal(rc.outcome, "reclassify_refused_no_owning_paragraph");
  assert.equal(rc.best_score, 0);
  assert.equal(claims[0].claim_kind, "FACT", "left as FACT, never forced");
  assert.equal(claims[0].claim_text, "Base freight rates on this corridor are expected to rise about eight percent due to fuel surcharges", "claim_text untouched");
  assert.ok(!deps.calls.some((c) => c[0] === "updateClaimKind" && c[1] === "claim-e4"), "no write for a refused claim");
  // never fed into RELABEL's ANALYSIS loop — it is still FACT
  assert.ok(!r.steps.relabel.some((x) => x.claim_id === "claim-e4"));
});

test("healOneItem STEP E (FOURTH PASS): a claim with no section_row_id is refused (nothing to search), never crashes", async () => {
  const item = { id: "item-e5", item_type: "regulation", full_brief: "", source_url: null };
  const claims = [{ id: "claim-e5", claim_kind: "FACT", claim_text: "some paraphrased fact text", source_span: "nowhere", source_id: "src-e5", section_row_id: null }];
  const deps = baseDeps({ readClaims: async () => claims });
  const r = await healOneItem(item, { deps, apply: true, selectionMode: "quarantined-live", requiredSlotsMap: {} });
  assert.equal(r.steps.reclassify[0].outcome, "reclassify_refused_no_owning_paragraph");
  assert.equal(r.steps.reclassify[0].section_id, null);
});

// ── healOneItem RETROFIT — the 365 already-re-kinded claims from prior HEAL-2/HEAL-3 runs ──────────

test("healOneItem RETROFIT: an ANALYSIS claim already sitting in the DB (source_span non-null, claim_text a paraphrase) is retrofitted — claim_text rewritten verbatim, then relabeled", async () => {
  const item = { id: "item-rt1", item_type: "regulation", full_brief: "", source_url: null };
  const claims = [{
    id: "claim-rt1", claim_kind: "ANALYSIS",
    claim_text: "Base freight rates on this corridor are expected to rise about eight percent due to fuel surcharges",
    source_span: "a stale span from when this was still a FACT claim", source_id: "src-rt1", section_row_id: "sec-rt1",
  }];
  const deps = baseDeps({
    readClaims: async () => claims,
    readSections: async (id) => (id === "item-rt1" ? [{
      id: "sec-rt1", item_id: "item-rt1", section_key: "body", section_order: 1,
      content_md: "Background context about the sector overall. The notice states rates will increase by roughly eight percent for the CNSHA corridor beginning next quarter, citing fuel costs. Analysts have offered mixed views on the outlook.",
    }] : []),
  });
  const r = await healOneItem(item, { deps, apply: true, selectionMode: "quarantined-live", requiredSlotsMap: {} });

  assert.equal(r.steps.retrofit.length, 1);
  assert.equal(r.steps.retrofit[0].outcome, "retrofitted");
  assert.notEqual(r.steps.retrofit[0].claim_text_after, r.steps.retrofit[0].claim_text_before);
  assert.equal(claims[0].claim_kind, "ANALYSIS", "kind is never touched by retrofit");
  const call = deps.calls.find((c) => c[0] === "updateClaimKind" && c[1] === "claim-rt1");
  assert.ok(call, "the guarded path was used");
  assert.equal(call[2].claim_text, r.steps.retrofit[0].claim_text_after);
  assert.ok(!("claim_kind" in call[2]), "retrofit patches claim_text only, never claim_kind");

  const relabelEntry = r.steps.relabel.find((x) => x.claim_id === "claim-rt1");
  assert.ok(relabelEntry, "retrofitted claim gets labeled in the same run");
  assert.equal(relabelEntry.outcome, "relabeled");
});

test("healOneItem RETROFIT: an ANALYSIS claim already findable verbatim in its own section is left untouched (correct no-op on a legitimate mint-time GROUNDED ANALYSIS claim)", async () => {
  const item = { id: "item-rt2", item_type: "regulation", full_brief: "", source_url: null };
  const claims = [{
    id: "claim-rt2", claim_kind: "ANALYSIS",
    claim_text: "the levy applies broadly across the sector",
    source_span: "an intergovernmental commentary span, legitimately grounded", source_id: "src-rt2", section_row_id: "sec-rt2",
  }];
  const deps = baseDeps({
    readClaims: async () => claims,
    readSections: async (id) => (id === "item-rt2" ? [{
      id: "sec-rt2", item_id: "item-rt2", section_key: "body", section_order: 1,
      content_md: "*Analytical inference:* the levy applies broadly across the sector, per commentary.",
    }] : []),
  });
  const r = await healOneItem(item, { deps, apply: true, selectionMode: "quarantined-live", requiredSlotsMap: {} });
  assert.deepEqual(r.steps.retrofit, [], "already-findable ANALYSIS claim is a no-op, not even reported");
  assert.ok(!deps.calls.some((c) => c[0] === "updateClaimKind" && c[1] === "claim-rt2"), "no write");
  assert.equal(claims[0].claim_text, "the levy applies broadly across the sector", "untouched");
});

test("healOneItem RETROFIT: an ANALYSIS claim with source_span NULL (never was FACT) is never a retrofit candidate, even when its claim_text is not found anywhere", async () => {
  const item = { id: "item-rt3", item_type: "regulation", full_brief: "", source_url: null };
  const claims = [{
    id: "claim-rt3", claim_kind: "ANALYSIS",
    claim_text: "the workspace infers this trend will likely continue given broader patterns",
    source_span: null, section_row_id: "sec-rt3",
  }];
  const deps = baseDeps({
    readClaims: async () => claims,
    readSections: async (id) => (id === "item-rt3" ? [{ id: "sec-rt3", item_id: "item-rt3", section_key: "body", section_order: 1, content_md: "Completely unrelated prose about something else entirely." }] : []),
  });
  const r = await healOneItem(item, { deps, apply: true, selectionMode: "quarantined-live", requiredSlotsMap: {} });
  assert.deepEqual(r.steps.retrofit, [], "a genuinely-authored PURE INFERENCE ANALYSIS claim (source_span null) is never touched by retrofit");
});

test("healOneItem RETROFIT: a claim with no plausible owning paragraph anywhere is refused, claim_text left untouched", async () => {
  const item = { id: "item-rt4", item_type: "regulation", full_brief: "", source_url: null };
  const claims = [{
    id: "claim-rt4", claim_kind: "ANALYSIS",
    claim_text: "Base freight rates on this corridor are expected to rise about eight percent due to fuel surcharges",
    source_span: "a stale span", source_id: "src-rt4", section_row_id: "sec-rt4",
  }];
  const deps = baseDeps({
    readClaims: async () => claims,
    readSections: async (id) => (id === "item-rt4" ? [{ id: "sec-rt4", item_id: "item-rt4", section_key: "body", section_order: 1, content_md: "Regulators also confirmed a separate review of container weighing procedures at three major ports, unrelated to pricing." }] : []),
  });
  const r = await healOneItem(item, { deps, apply: true, selectionMode: "quarantined-live", requiredSlotsMap: {} });
  assert.equal(r.steps.retrofit.length, 1);
  assert.equal(r.steps.retrofit[0].outcome, "retrofit_refused_no_owning_paragraph");
  assert.equal(claims[0].claim_text, "Base freight rates on this corridor are expected to rise about eight percent due to fuel surcharges");
  assert.ok(!deps.calls.some((c) => c[0] === "updateClaimKind" && c[1] === "claim-rt4"));
});

test("healOneItem RETROFIT: dry mode reports would_retrofit, writes nothing", async () => {
  const item = { id: "item-rt5", item_type: "regulation", full_brief: "", source_url: null };
  const claims = [{
    id: "claim-rt5", claim_kind: "ANALYSIS",
    claim_text: "Base freight rates on this corridor are expected to rise about eight percent due to fuel surcharges",
    source_span: "a stale span", source_id: "src-rt5", section_row_id: "sec-rt5",
  }];
  const deps = baseDeps({
    readClaims: async () => claims,
    readSections: async (id) => (id === "item-rt5" ? [{
      id: "sec-rt5", item_id: "item-rt5", section_key: "body", section_order: 1,
      content_md: "Background context about the sector overall. The notice states rates will increase by roughly eight percent for the CNSHA corridor beginning next quarter, citing fuel costs. Analysts have offered mixed views on the outlook.",
    }] : []),
  });
  const r = await healOneItem(item, { deps, apply: false, selectionMode: "quarantined-live", requiredSlotsMap: {} });
  assert.equal(r.steps.retrofit[0].outcome, "would_retrofit");
  assert.deepEqual(deps.calls, []);
});

// ── summarizeReports: fourth-pass counters ──────────────────────────────────────────────────────────

test("summarizeReports: tallies the fourth-pass counters (reclassified_rewritten, reclassify_refused_no_owning_paragraph, retrofitted, retrofit_refused_no_owning_paragraph)", () => {
  const perItem = [
    {
      steps: {
        reclassify: [
          { outcome: "reclassified", rewritten: true },
          { outcome: "reclassified" }, // not rewritten (already findable) — counts toward refactored_to_analysis only
          { outcome: "reclassify_refused_no_owning_paragraph" },
        ],
        retrofit: [
          { outcome: "retrofitted" },
          { outcome: "retrofit_refused_no_owning_paragraph" },
        ],
        gate_a: {}, rederive: { outcome: "still_failing", failures: [] },
      },
    },
  ];
  const s = summarizeReports(perItem);
  assert.equal(s.refactored_to_analysis, 2);
  assert.equal(s.reclassified_rewritten, 1);
  assert.equal(s.reclassify_refused_no_owning_paragraph, 1);
  assert.equal(s.retrofitted, 1);
  assert.equal(s.retrofit_refused_no_owning_paragraph, 1);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// SEVENTH PASS (HEAL-6, 2026-09-04) — item-wide owning-paragraph search (criterion 4, 38 items/148
// claims) and Gate B wiring (criterion 7, 88 items). See this file's header SEVENTH PASS section for the
// full diagnosis. The FNTOP fixture below (OWN_MD/OTHER_MD) is the REAL content_md of two sections of a
// real live item, item 007f42b1-265a-4504-8bd1-ea1557d410ad (the dispatch's own named criterion-4 sample) —
// pulled read-only, 2026-09-04. Verified against the code in this file before being pinned into assertions
// (own-section score 0.145..., below OWNING_PARAGRAPH_MIN_SCORE; item-wide score 0.216... in the OTHER
// section) — never hand-picked to make the test pass.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

const FNTOP_CLAIM = "The Texas Freight Network Technology and Operations Plan (FNTOP) was published December 2020.";
const OWN_MD = "| # | Title | Issuing Body | Date | Type | URL |\n|---|---|---|---|---|---|\n| 1 | Freight planning | TxDOT | 2026 | Primary government programme page (Tier 2) | https://www.txdot.gov/projects/planning/freight-planning.html |\n| 2 | Texas Freight Mobility Plan | TxDOT | 2026 | Primary government programme page (Tier 2) | https://www.txdot.gov/projects/planning/freight-planning/texas-freight-mobility-plan.html |\n| 3 | Texas Freight Plan | U.S. Department of Transportation | December 6, 2023 | Federal agency plan registry (Tier 2) | https://www.transportation.gov/mission/office-secretary/office-policy/freight/freight-infrastructure-and-policy/texas-freight-plan |\n| 4 | Multimodal transportation programs | TxDOT | 2026 | Primary government programme page (Tier 2) | https://www.txdot.gov/projects/planning/utp/multimodal-programs.html |\n| 5 | Texas Freight Network Technology and Operations Plan (FNTOP) | TxDOT / TxDOT Research Library, University of Texas at Austin CTR | December 2020 | Government research document (Tier 2) | https://library.ctr.utexas.edu/Presto/content/Detail.aspx?ctID=UHVibGljYXRpb25fMTE2MTA%3D&rID=MzM1NDM%3D&ssid=c2NyZWVuSURfMjEzMjI%3D |\n\n---\n\n## New Sources Identified\n\n| Source Name | URL | Tier estimate (1–7) | Why this source matters |\n|---|---|---|---|\n| CAMPO Freight Plan Recommendations Report (2024) | https://www.campotexas.org/wp-content/uploads/2024/12/RFP_Recomendations.pdf | 4 | Capital Area MPO (Austin region) freight recommendations that feed into TxDOT TFMP stakeholder input; provides regional-level operational specifics not available in TxDOT statewide pages |\n| 49 USC 70202 (Federal State Freight Plan Requirements) | https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title49-section70202&num=0&edition=prelim | 1 | Statutory basis cited by TxDOT as the federal requirement the TFMP satisfies; verbatim plan content requirements are in this text and not reproduced in the corpus source blocks |\n| Texas Delivers 2050 (2023 TFMP full document) | https://www.transportation.gov/mission/office-secretary/office-policy/freight/freight-infrastructure-and-policy/texas-freight-plan | 2 | The operative plan document (PDF: texas-delivers-2050.pdf) referenced by USDOT; specific plan findings, project recommendations, and performance targets are in this document and not available from the USDOT landing page text alone |\n\n---";
const OTHER_MD = "## Texas Freight Mobility Plan (Current Operative Plan: 2023 / \"Texas Delivers 2050\")\n\nThe current approved Texas Freight Mobility Plan is hosted by USDOT and identified by the document filename \"texas-delivers-2050.pdf.\" *Source: Texas Freight Plan, U.S. Department of Transportation, updated December 6, 2023. https://www.transportation.gov/mission/office-secretary/office-policy/freight/freight-infrastructure-and-policy/texas-freight-plan.\n\n*Specific content sections of the 2023 TFMP are not available verbatim from the primary source blocks in this corpus. The USDOT page confirms the plan exists and is approved; the document's internal section structure and specific findings are not reproduced in the available source content.*\n\n*Analytical inference:* The 2023 plan, titled \"Texas Delivers 2050,\" established the baseline findings and recommendations that the 2027 update will extend. The 2020 Texas Freight Network Technology and Operations Plan (FNTOP) — which emerged from a major recommendation of the 2018 TFMP — illustrates the trajectory: the TFMP generates programme-level recommendations that then generate standalone operational plans.\n\n## Texas Freight Network Technology and Operations Plan (FNTOP, 2020)\n\n*Analytical inference:* *\"The 2018 Texas Freight Mobility Plan (TFMP) provided Texas with a blueprint for facilitating continued economic growth through a comprehensive, multimodal strategy for addressing freight transportation. One major recommendation from the TFMP is for the TxDOT to develop and implement a statewide, technology-based freight safety and operations program... Based on this recommendation, the Freight Planning Branch within TxDOT's (TxDOT) Transportation Planning and Programming Division developed the Texas Freight Network Technology and Operations Plan (FNTOP), which outlines 12 technology based strategies, six of which were advanced to Concept of Operations, to help improve freight transportation safety and mobility in Texas.\"* *Source: TxDOT Research Library, Texas Freight Network Technology and Operations Plan, 2020. https://library.ctr.utexas.edu/Presto/content/Detail.aspx?ctID=UHVibGljYXRpb25fMTE2MTA%3D&rID=MzM1NDM%3D&ssid=c2NyZWVuSURfMjEzMjI%3D.\n\n*Operational implication:* The FNTOP's 12 technology strategies and 6 Concepts of Operations represent TxDOT's current technology posture for freight safety and mobility. Workspaces operating on Texas corridors should assess which of these strategies — including any related to truck parking availability systems, freight information systems, or connected vehicle technology — are moving toward deployment and could affect their fleet or carrier operations.\n\n## 2027 TFMP Planned Outcomes (Per TxDOT's Published Programme Design)\n\nThe 2027 TFMP is structured to produce four categories of output:\n\n- *\"Policies: Specific courses of action that, if adopted, will shape the way Texas approaches freight.\"*\n- *\"Programs: Collection of initiatives or activities to achieve desired outcomes.\"*\n- *\"Technology & Operations: Investments that improve safety and efficiency of existing systems and prepare Texas for the future of freight mobility.\"*\n- *\"Projects: Capital investments under development, proposed, and strategic.\"*\n\n*Source: Texas Freight Mobility Plan page, TxDOT, 2026. https://www.txdot.gov/projects/planning/freight-planning/texas-freight-mobility-plan.html.\n\n*Analytical inference:* The four-category output structure means the 2027 TFMP will simultaneously produce policy recommendations (which shape regulatory and programmatic environment), program designs (which determine funding allocation), technology and operations priorities (which determine what gets deployed on Texas corridors), and project lists (which feed directly into the UTP and STIP). For workspaces with Texas infrastructure dependencies, all four categories are operationally relevant.\n\n## Multimodal Program Architecture (UTP)\n\nThe UTP funds five multimodal programme areas relevant to freight:\n\n*\"Freight, Trade and Connectivity: Integrating multimodal freight, international trade and corridor planning into TxDOT's statewide planning and project development processes.\"* *Source: Multimodal transportation programs, TxDOT, 2026. https://www.txdot.gov/projects/planning/utp/multimodal-programs.html.\n\nAdditional UTP multimodal programmes with freight relevance: Maritime (port infrastructure and waterway connectivity); Rail (freight and passenger rail system development); Aviation (airport planning and construction); Public Transportation (transit, bicycle and pedestrian). *Source: Multimodal transportation programs, TxDOT, 2026. https://www.txdot.gov/projects/planning/utp/multimodal-programs.html.\n\n---";

// ── isSubstantiveParagraph ──────────────────────────────────────────────────────────────────────────

test("isSubstantiveParagraph: a real prose paragraph (>= MIN_SUBSTANTIVE_TOKENS scoreable tokens, sentence punctuation) is substantive", () => {
  assert.equal(isSubstantiveParagraph("The notice states rates will increase by roughly eight percent for the CNSHA corridor beginning next quarter."), true);
});

test("isSubstantiveParagraph: a bare markdown heading is NOT substantive, even with several distinctive nouns (no sentence-ending punctuation) — the exact class of false-accept this guard exists to remove", () => {
  assert.equal(isSubstantiveParagraph("## Double Materiality Assessment Infrastructure Requirements Overview"), false);
});

test("isSubstantiveParagraph: a short punctuated fragment below MIN_SUBSTANTIVE_TOKENS is not substantive", () => {
  assert.equal(isSubstantiveParagraph("See above."), false);
});

test("isSubstantiveParagraph: blank/empty/null is never substantive", () => {
  assert.equal(isSubstantiveParagraph(""), false);
  assert.equal(isSubstantiveParagraph("   "), false);
  assert.equal(isSubstantiveParagraph(null), false);
});

test("MIN_SUBSTANTIVE_TOKENS is the measured constant (6) — a change here is a deliberate re-tuning, not a silent drift", () => {
  assert.equal(MIN_SUBSTANTIVE_TOKENS, 6);
});

// ── findOwningParagraphAcrossSections / planOwningParagraphRewriteAcrossSections ───────────────────

test("findOwningParagraphAcrossSections: real FNTOP shape (item 007f42b1) — own section (a sources table) refuses; item-wide search finds the owning paragraph in a DIFFERENT section", () => {
  // Confirms the premise: the claim's OWN section (a sources index table) scores BELOW threshold alone.
  const ownOnly = findOwningParagraphByOverlap(FNTOP_CLAIM, OWN_MD);
  assert.equal(ownOnly.found, false, "own section (a sources table) has no owning paragraph — matches the live 0/148 own-section measurement");

  const wide = findOwningParagraphAcrossSections(FNTOP_CLAIM, [
    { id: "sec-own", content_md: OWN_MD },
    { id: "sec-other", content_md: OTHER_MD },
  ]);
  assert.equal(wide.found, true);
  assert.equal(wide.sectionId, "sec-other");
  assert.match(wide.paragraph, /Texas Delivers 2050/);
});

test("findOwningParagraphAcrossSections: a heading-only paragraph in one section never wins over a genuine (if lower-scoring) substantive paragraph in another", () => {
  const claim = "Directly in-scope reporting entities are required to conduct a double materiality assessment covering environmental and social impacts.";
  const sections = [
    { id: "sec-heading", content_md: "## Double Materiality Assessment Infrastructure Requirements Overview" },
    {
      id: "sec-prose",
      content_md: "*Analytical inference:* Entities directly in scope are expected to conduct a double materiality assessment, covering both environmental impact and social impact, as part of the reporting infrastructure the framework requires.",
    },
  ];
  const r = findOwningParagraphAcrossSections(claim, sections);
  assert.equal(r.found, true);
  assert.equal(r.sectionId, "sec-prose", "the heading (filtered by isSubstantiveParagraph) is never even a candidate");
});

test("findOwningParagraphAcrossSections: refuses (bestScore 0) when no section anywhere carries even one substantive paragraph", () => {
  const r = findOwningParagraphAcrossSections("anything at all", [{ id: "s1", content_md: "## Just A Heading\n\n## Another Heading" }]);
  assert.deepEqual(r, { found: false, bestScore: 0 });
});

test("findOwningParagraphAcrossSections: empty/no sections refuses, never throws", () => {
  assert.deepEqual(findOwningParagraphAcrossSections("anything", []), { found: false, bestScore: 0 });
  assert.deepEqual(findOwningParagraphAcrossSections("anything", null), { found: false, bestScore: 0 });
});

test("planOwningParagraphRewriteAcrossSections: found -> newClaimText is a verbatim substring of the winning (cross-section) paragraph, sectionId names the WINNING section", () => {
  const r = planOwningParagraphRewriteAcrossSections(FNTOP_CLAIM, [
    { id: "sec-own", content_md: OWN_MD },
    { id: "sec-other", content_md: OTHER_MD },
  ]);
  assert.equal(r.outcome, "found");
  assert.equal(r.sectionId, "sec-other");
  assert.ok(OTHER_MD.includes(r.newClaimText), "the new claim_text is a VERBATIM substring of the winning section's paragraph");
  assert.match(r.newClaimText, /Texas Freight Network Technology and Operations Plan \(FNTOP\)/);
});

test("planOwningParagraphRewriteAcrossSections: refusal path carries the best score found across every section", () => {
  const r = planOwningParagraphRewriteAcrossSections("wholly unrelated claim about container weighing procedures", [{ id: "s1", content_md: "A long enough substantive paragraph about something else entirely, discussing freight corridor pricing in general terms." }]);
  assert.equal(r.outcome, "no_owning_paragraph");
  assert.equal(r.bestScore, 0);
});

// ── healOneItem STEP E / RETROFIT — item-wide widening wired end-to-end ────────────────────────────

test("healOneItem STEP E: own-section search refuses, item-wide search succeeds in a DIFFERENT section — reclassified with claim_text rewritten AND section_row_id moved to the winning section (real FNTOP shape)", async () => {
  const item = { id: "item-iw1", item_type: "regulation", full_brief: "", source_url: null };
  const claims = [{
    id: "claim-iw1", claim_kind: "FACT", claim_text: FNTOP_CLAIM,
    source_span: "a span nowhere in any capture", source_id: "src-iw1", section_row_id: "sec-own",
  }];
  const deps = baseDeps({
    readClaims: async () => claims,
    readSections: async (id) => (id === "item-iw1" ? [
      { id: "sec-own", item_id: "item-iw1", section_key: "sources", section_order: 1, content_md: OWN_MD },
      { id: "sec-other", item_id: "item-iw1", section_key: "body", section_order: 2, content_md: OTHER_MD },
    ] : []),
  });
  const r = await healOneItem(item, { deps, apply: true, selectionMode: "quarantined-live", requiredSlotsMap: {} });
  const rc = r.steps.reclassify[0];
  assert.equal(rc.outcome, "reclassified");
  assert.equal(rc.cross_section, true);
  assert.equal(rc.section_id, "sec-other");
  assert.notEqual(claims[0].claim_text, FNTOP_CLAIM, "claim_text rewritten to the item-wide winning sentence");
  assert.equal(claims[0].section_row_id, "sec-other", "section_row_id moved to the winning section");
  const call = deps.calls.find((c) => c[0] === "updateClaimKind" && c[1] === "claim-iw1");
  assert.ok(call);
  assert.equal(call[2].claim_kind, "ANALYSIS");
  assert.equal(call[2].section_row_id, "sec-other");
  // the moved claim is then found by RELABEL under its NEW section_row_id, in the same run
  const relabelEntry = r.steps.relabel.find((x) => x.claim_id === "claim-iw1");
  assert.ok(relabelEntry);
  assert.equal(relabelEntry.section_id, "sec-other");
});

test("healOneItem STEP E: when the winning section IS the claim's own section_row_id (own-section search itself succeeded), cross_section is false and section_row_id is never rewritten", async () => {
  const item = { id: "item-iw2", item_type: "regulation", full_brief: "", source_url: null };
  const claim = "Base freight rates on this corridor are expected to rise about eight percent due to fuel surcharges";
  const contentMd = "Background context about the sector overall. The notice states rates will increase by roughly eight percent for the CNSHA corridor beginning next quarter, citing fuel costs. Analysts have offered mixed views on the outlook.";
  const claims = [{ id: "claim-iw2", claim_kind: "FACT", claim_text: claim, source_span: "nowhere", source_id: "src-iw2", section_row_id: "sec-a" }];
  const deps = baseDeps({
    readClaims: async () => claims,
    readSections: async (id) => (id === "item-iw2" ? [{ id: "sec-a", item_id: "item-iw2", section_key: "body", section_order: 1, content_md: contentMd }] : []),
  });
  const r = await healOneItem(item, { deps, apply: true, selectionMode: "quarantined-live", requiredSlotsMap: {} });
  const rc = r.steps.reclassify[0];
  assert.equal(rc.outcome, "reclassified");
  assert.equal(rc.cross_section, false);
  assert.equal(claims[0].section_row_id, "sec-a", "never rewritten when the own section already won");
  const call = deps.calls.find((c) => c[0] === "updateClaimKind" && c[1] === "claim-iw2");
  assert.ok(!("section_row_id" in call[2]), "no section_row_id patch when the section never moved");
});

test("healOneItem STEP E: still refuses (never forces a claim) when NEITHER the own section NOR any other section clears threshold", async () => {
  const item = { id: "item-iw3", item_type: "regulation", full_brief: "", source_url: null };
  const claims = [{
    id: "claim-iw3", claim_kind: "FACT",
    claim_text: "Base freight rates on this corridor are expected to rise about eight percent due to fuel surcharges",
    source_span: "nowhere", source_id: "src-iw3", section_row_id: "sec-a",
  }];
  const deps = baseDeps({
    readClaims: async () => claims,
    readSections: async (id) => (id === "item-iw3" ? [
      { id: "sec-a", item_id: "item-iw3", section_key: "body", section_order: 1, content_md: "Regulators also confirmed a separate review of container weighing procedures at three major ports, unrelated to pricing." },
      { id: "sec-b", item_id: "item-iw3", section_key: "body", section_order: 2, content_md: "A wholly unrelated discussion of warehouse automation trends across the sector, with no connection to freight rates at all." },
    ] : []),
  });
  const r = await healOneItem(item, { deps, apply: true, selectionMode: "quarantined-live", requiredSlotsMap: {} });
  const rc = r.steps.reclassify[0];
  assert.equal(rc.outcome, "reclassify_refused_no_owning_paragraph");
  assert.equal(claims[0].claim_kind, "FACT", "left as FACT, never forced");
  assert.ok(!deps.calls.some((c) => c[0] === "updateClaimKind" && c[1] === "claim-iw3"));
});

test("healOneItem RETROFIT: own-section search refuses, item-wide search succeeds — claim_text AND section_row_id rewritten, claim_kind untouched (retrofit's own contract preserved)", async () => {
  const item = { id: "item-iw4", item_type: "regulation", full_brief: "", source_url: null };
  const claims = [{
    id: "claim-iw4", claim_kind: "ANALYSIS", claim_text: FNTOP_CLAIM,
    source_span: "a stale span from when this was still a FACT claim", source_id: "src-iw4", section_row_id: "sec-own",
  }];
  const deps = baseDeps({
    readClaims: async () => claims,
    readSections: async (id) => (id === "item-iw4" ? [
      { id: "sec-own", item_id: "item-iw4", section_key: "sources", section_order: 1, content_md: OWN_MD },
      { id: "sec-other", item_id: "item-iw4", section_key: "body", section_order: 2, content_md: OTHER_MD },
    ] : []),
  });
  const r = await healOneItem(item, { deps, apply: true, selectionMode: "quarantined-live", requiredSlotsMap: {} });
  const rt = r.steps.retrofit[0];
  assert.equal(rt.outcome, "retrofitted");
  assert.equal(rt.cross_section, true);
  assert.equal(rt.section_id, "sec-other");
  assert.equal(claims[0].claim_kind, "ANALYSIS", "retrofit never touches claim_kind");
  assert.equal(claims[0].section_row_id, "sec-other");
  const call = deps.calls.find((c) => c[0] === "updateClaimKind" && c[1] === "claim-iw4");
  assert.ok(call);
  assert.ok(!("claim_kind" in call[2]), "retrofit patches claim_text/section_row_id only, never claim_kind — unchanged contract");
  assert.equal(call[2].section_row_id, "sec-other");
});

// ── computeDerivedCovered — Gate B, mirrored in memory ──────────────────────────────────────────────
// Fixtures built from a REAL DERIVED/FACT claim pair + a real capture excerpt (read-only SQL, 2026-09-04,
// item family ff4064ab-... in the live DB): a DERIVED claim "31 March 2025" whose basis FACT claim's
// source_span "From 2025, companies shall submit to the administering authority responsible by 31 March of
// each year the aggregated emissions data at company level that cover the emissions in the reporting
// period of the previous year to be reported under Directive 2003/87/EC in relation to maritime transport
// activities" is verbatim in the real capture at position 3124 (confirmed live, position() query) — the
// capture text below is a trimmed excerpt built AROUND that real, verbatim span (the full live capture is
// 5602 chars; only the span's own verbatim presence is load-bearing for this function's contract).

const REAL_BASIS_SPAN = "From 2025, companies shall submit to the administering authority responsible by 31 March of each year the aggregated emissions data at company level that cover the emissions in the reporting period of the previous year to be reported under Directive 2003/87/EC in relation to maritime transport activities";
const REAL_CAPTURE_EXCERPT = `Changes to the existing ETS and MRV applying from 1 January 2024 - Climate Action. ${REAL_BASIS_SPAN}. General guidance documents are published by the European Commission for administering authorities.`;

test("computeDerivedCovered: a DERIVED claim whose basis FACT's source_span is verbatim in its capture is covered — real ETS-MRV shape", () => {
  const claims = [
    { id: "fact-1", claim_kind: "FACT", claim_text: "the March deadline", source_span: REAL_BASIS_SPAN, search_result_id: "cap-1" },
    { id: "derived-1", claim_kind: "DERIVED", claim_text: "31 March 2025", basis_claim_id: "fact-1" },
  ];
  const captures = [{ id: "cap-1", result_content: REAL_CAPTURE_EXCERPT }];
  const covered = computeDerivedCovered(claims, captures);
  assert.equal(covered.has(norm("31 March 2025")), true);
  assert.equal(covered.size, 1);
});

test("computeDerivedCovered: a basis span that no longer matches its capture (stale) is NOT covered — re-grounds-never-destroy", () => {
  const claims = [
    { id: "fact-1", claim_kind: "FACT", claim_text: "x", source_span: "a span the capture no longer contains", search_result_id: "cap-1" },
    { id: "derived-1", claim_kind: "DERIVED", claim_text: "31 March 2025", basis_claim_id: "fact-1" },
  ];
  const captures = [{ id: "cap-1", result_content: "completely different capture text now" }];
  assert.equal(computeDerivedCovered(claims, captures).size, 0);
});

test("computeDerivedCovered: a DERIVED claim missing basis_claim_id (the LIVE wrapper's current shape — basis_claim_id not yet projected by scripts/maintenance/provenance-heal.mjs's own readClaims SELECT) is never covered — the documented dormant-in-production behavior", () => {
  const claims = [
    { id: "fact-1", claim_kind: "FACT", claim_text: "x", source_span: REAL_BASIS_SPAN, search_result_id: "cap-1" },
    { id: "derived-1", claim_kind: "DERIVED", claim_text: "31 March 2025" }, // no basis_claim_id at all
  ];
  const captures = [{ id: "cap-1", result_content: REAL_CAPTURE_EXCERPT }];
  assert.equal(computeDerivedCovered(claims, captures).size, 0);
});

test("computeDerivedCovered: a basis that resolves to a non-FACT claim, or a FACT with a null source_span, is never covered", () => {
  const claims = [
    { id: "a1", claim_kind: "ANALYSIS", claim_text: "not a fact", source_span: "irrelevant", search_result_id: "cap-1", basis_claim_id: null },
    { id: "d1", claim_kind: "DERIVED", claim_text: "tok1", basis_claim_id: "a1" },
    { id: "f2", claim_kind: "FACT", claim_text: "x", source_span: null, search_result_id: "cap-1" },
    { id: "d2", claim_kind: "DERIVED", claim_text: "tok2", basis_claim_id: "f2" },
  ];
  const captures = [{ id: "cap-1", result_content: "anything" }];
  assert.equal(computeDerivedCovered(claims, captures).size, 0);
});

test("computeDerivedCovered: no DERIVED claims at all -> empty Set, no work done", () => {
  const claims = [{ id: "f1", claim_kind: "FACT", claim_text: "x", source_span: "y", search_result_id: "cap-1" }];
  assert.equal(computeDerivedCovered(claims, []).size, 0);
});

test("computeDerivedCovered: normalizes the covered token the SAME way gate-a-match.mjs's own norm does (internal whitespace runs collapsed, case-insensitive -- norm itself does NOT trim leading/trailing whitespace, matching gate-a-derived.mjs's own live behavior exactly)", () => {
  const claims = [
    { id: "fact-1", claim_kind: "FACT", claim_text: "x", source_span: REAL_BASIS_SPAN, search_result_id: "cap-1" },
    { id: "derived-1", claim_kind: "DERIVED", claim_text: "31   MARCH 2025", basis_claim_id: "fact-1" },
  ];
  const captures = [{ id: "cap-1", result_content: REAL_CAPTURE_EXCERPT }];
  const covered = computeDerivedCovered(claims, captures);
  assert.equal(covered.has(norm("31 March 2025")), true, "internal whitespace-run collapse and case-folding make the two agree");
});

// ── planGateA — derivedCovered wired through to buildGateARow (Gate B) ─────────────────────────────

test("planGateA: derivedCovered defaults to an empty Set — every existing call site/test that omits it is byte-identical to before this pass", () => {
  const item = { id: "item-ga1", full_brief: "A figure appears here: 9 tonnes." };
  const withDefault = planGateA(item, []);
  const withExplicitEmpty = planGateA(item, [], new Set());
  assert.equal(withDefault.scanned_hash, withExplicitEmpty.scanned_hash);
  assert.deepEqual(withDefault.orphans, withExplicitEmpty.orphans);
  assert.equal(withDefault.orphan_count, withExplicitEmpty.orphan_count);
  assert.ok(withDefault.orphan_count > 0, "the token is still an orphan with no coverage of either kind");
});

test("planGateA: a token covered ONLY by derivedCovered (Gate B, no matching FACT claim at all) is NOT an orphan", () => {
  // A figure token (single orphan entry) rather than a date -- the scanner emits MULTIPLE sub-token
  // granularities for a date ("31 March 2025" / "March 2025" / "2025", each its own orphan entry), which
  // would require covering all three to clear orphan_count to 0; a figure token has exactly one entry, so
  // this test isolates the derivedCovered wiring itself rather than the scanner's own tokenization.
  const item = { id: "item-ga2", full_brief: "A figure appears here: 9 tonnes." };
  const withoutDerived = planGateA(item, []);
  assert.equal(withoutDerived.orphan_count, 1, "orphan without Gate B coverage");
  const withDerived = planGateA(item, [], new Set([norm("9 tonnes")]));
  assert.equal(withDerived.orphan_count, 0, "Gate B coverage clears the orphan — the SEVENTH PASS fix this test exists to prove");
});

test("healOneItem: Gate A's final report entry carries derived_claims_seen/derived_covered_count telemetry", async () => {
  const item = { id: "item-ga3", item_type: "market_signal", full_brief: "", source_url: null };
  const claims = [
    { id: "fact-1", claim_kind: "FACT", claim_text: "x", source_span: REAL_BASIS_SPAN, search_result_id: "cap-1", section_row_id: null },
    { id: "derived-1", claim_kind: "DERIVED", claim_text: "31 March 2025", basis_claim_id: "fact-1", section_row_id: null },
  ];
  const deps = baseDeps({
    readClaims: async () => claims,
    readCaptures: async () => [{ id: "cap-1", result_url: "https://example.com/x", result_content: REAL_CAPTURE_EXCERPT }],
  });
  const r = await healOneItem(item, { deps, apply: true, selectionMode: "quarantined-live", requiredSlotsMap: {} });
  assert.equal(r.steps.gate_a.derived_claims_seen, 1);
  assert.equal(r.steps.gate_a.derived_covered_count, 1);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// STEP SOURCE (EIGHTH PASS, 2026-09-04, lane HEAL-7) — see heal-provenance.mjs's own header EIGHTH PASS
// section for the ruling this builds. Fixtures below use item_type "regulation" (REG_FAMILY, floor 2,
// armed unconditionally — isFloorArmed) so both the 179 (above-floor) and 167 (no-source-row) HEAL-6
// measured cases are reachable without a CRITICAL/HIGH priority.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

test("classifyCitedUrlForOrphan: an exact-URL match in sourcesIndex is already_registered, tier from deriveSourceTier", () => {
  const sourcesIndex = buildSourcesIndex([{ id: "src-hi", url: "https://example.com/notice", base_tier: 5, tier_override: null }]);
  const r = classifyCitedUrlForOrphan("https://example.com/notice", sourcesIndex);
  assert.deepEqual(r, { status: "already_registered", sourceId: "src-hi", tier: 5 });
});

test("classifyCitedUrlForOrphan: no existing row, a codified-gov host classifies registerable at its class tier (never a guess)", () => {
  const sourcesIndex = buildSourcesIndex([]);
  const r = classifyCitedUrlForOrphan("https://notices.example.gov/x", sourcesIndex);
  assert.deepEqual(r, { status: "registerable", host: "notices.example.gov", tier: 2 });
});

test("classifyCitedUrlForOrphan: an ambiguous host (no codified class) worklists — SC-13 never invents a tier", () => {
  const sourcesIndex = buildSourcesIndex([]);
  const r = classifyCitedUrlForOrphan("https://some-random-vendor.example/page", sourcesIndex);
  assert.equal(r.status, "worklist_ambiguous_host");
  assert.equal(r.host, "some-random-vendor.example");
});

test("candidateUrlsForOrphan: a token with an owning section is scoped to that section's own cited URLs only", () => {
  const sections = [
    { id: "sec-1", item_id: "i1", section_key: "body", section_order: 1, content_md: "Rates rose by €500,000. See https://example.com/a for detail." },
    { id: "sec-2", item_id: "i1", section_key: "other", section_order: 2, content_md: "Unrelated: https://example.com/b" },
  ];
  const urls = candidateUrlsForOrphan("€500,000", { sections, claims: [], sourcesIndex: buildSourcesIndex([]) });
  assert.deepEqual(urls, ["https://example.com/a"]);
});

test("candidateUrlsForOrphan: a token with no owning section falls back to every URL the item cites at all", () => {
  const sections = [
    { id: "sec-1", item_id: "i1", section_key: "body", section_order: 1, content_md: "https://example.com/a" },
    { id: "sec-2", item_id: "i1", section_key: "other", section_order: 2, content_md: "https://example.com/b" },
  ];
  const urls = candidateUrlsForOrphan("a token nowhere in either section", { sections, claims: [], sourcesIndex: buildSourcesIndex([]) });
  assert.deepEqual(urls, ["https://example.com/a", "https://example.com/b"]);
});

test("candidateUrlsForOrphan: bounded to SOURCE_MAX_CANDIDATE_URLS_PER_ORPHAN", () => {
  const many = Array.from({ length: SOURCE_MAX_CANDIDATE_URLS_PER_ORPHAN + 4 }, (_, i) => `https://example.com/doc-${i}`);
  const sections = [{ id: "sec-1", item_id: "i1", section_key: "body", section_order: 1, content_md: many.join(" ") }];
  const urls = candidateUrlsForOrphan("token with no owning section", { sections, claims: [], sourcesIndex: buildSourcesIndex([]) });
  assert.equal(urls.length, SOURCE_MAX_CANDIDATE_URLS_PER_ORPHAN);
});

test("healOneItem STEP SOURCE: the 167 no-source-row case — a registerable host is registered (base_tier from classTierForHost, never hand-typed), captured, and the orphan is grounded", async () => {
  const item = {
    id: "item-src1", item_type: "regulation", source_id: "src-own", source_url: "https://example-regulator.gov/x",
    full_brief: "The levy is set at €750,000 under this measure.",
  };
  const sourcesIndex = buildSourcesIndex([{ id: "src-own", url: "https://example-regulator.gov/x", base_tier: 1 }]);
  // >200 chars so STEP 1's own needsCapture check is already satisfied and this fixture's own capture is
  // never re-fetched (isolating this test to STEP SOURCE's own registration/capture path).
  const captures = [{ id: "cap-own", result_url: "https://example-regulator.gov/x", result_content: "the regulation text, no figure stated here. " + "Padding so this own capture clears the 200-char usability floor too. ".repeat(3) }];
  const sections = [{ id: "sec-src1", item_id: "item-src1", section_key: "body", section_order: 1, content_md: "See https://notices.example.gov/levy for the figure." }];
  // URL-aware: the item's own canonical URL never carries the figure (so an accidental re-fetch of it
  // could never accidentally ground the token); only the cited URL's page states it.
  const fetchImpl = async (url) => (
    String(url).includes("notices.example.gov")
      ? { ok: true, status: 200, text: async () => "The levy is set at €750,000 under this measure, per the official notice. " + "Padding text so this body clears the 200-char usability floor. ".repeat(3) }
      : { ok: true, status: 200, text: async () => "should not be re-fetched in this test" }
  );
  const deps = baseDeps({
    fetchImpl,
    readCaptures: async () => captures,
    readClaims: async () => [],
    readSections: async (id) => (id === "item-src1" ? sections : []),
    registerSource: async (source) => { deps.calls.push(["registerSource", source]); return { source_id: "src-registered", created: true, host: "notices.example.gov" }; },
    readSourceByUrl: async (url) => ({ id: "src-registered", url, base_tier: 2, tier_override: null, institution_id: null, status: "active" }),
  });
  const r = await healOneItem(item, { deps, apply: true, selectionMode: "quarantined-live", requiredSlotsMap: {}, sourcesIndex });

  const entry = r.steps.source.find((s) => s.outcome === "source_registered_and_grounded");
  assert.ok(entry, JSON.stringify(r.steps.source));
  assert.equal(entry.source_id, "src-registered");
  assert.equal(entry.source_tier, 2);

  const regCall = deps.calls.find((c) => c[0] === "registerSource");
  assert.ok(regCall, "registerSource called for the new host");
  assert.equal(regCall[1].url, "https://notices.example.gov/levy");
  assert.equal(regCall[1].base_tier, 2, "base_tier is classTierForHost's own class tier, never hand-typed");

  const claimCall = deps.calls.find((c) => c[0] === "insertClaim" && c[1].source_id === "src-registered");
  assert.ok(claimCall, "the orphan token was grounded on the newly registered source");
  assert.equal(claimCall[1].claim_kind, "FACT");
  assert.ok(claimCall[1].source_span.includes("750,000"));
  assert.equal(claimCall[1].source_tier_at_grounding, 2, "the REAL read-back tier, never the class table's predicted tier alone");

  // STEP SOURCE grounds the token before STEP C's own fresh scan runs, so it is never reported as an
  // unresolved orphan there too.
  assert.equal(r.steps.orphans.length, 0);
  assert.equal(r.steps.gate_a.orphan_count, 0);
});

test("healOneItem STEP SOURCE: the 179 above-floor case — an EXISTING source above the item's floor grounds the orphan with NO new sources row", async () => {
  const item = {
    id: "item-src2", item_type: "regulation", source_id: "src-own2", source_url: "https://example-regulator.gov/x",
    full_brief: "The levy is set at €900,000 under this measure.",
  };
  const sourcesIndex = buildSourcesIndex([
    { id: "src-own2", url: "https://example-regulator.gov/x", base_tier: 1 },
    { id: "src-above", url: "https://example.com/above-floor-notice", base_tier: 5 }, // above the reg-family floor (2)
  ]);
  // >200 chars so STEP 1's own needsCapture check is already satisfied and this fixture's own capture is
  // never re-fetched (isolating this test to STEP SOURCE's own existing-source grounding path).
  const captures = [{ id: "cap-own2", result_url: "https://example-regulator.gov/x", result_content: "the regulation text, no figure stated here. " + "Padding so this own capture clears the 200-char usability floor too. ".repeat(3) }];
  const sections = [{ id: "sec-src2", item_id: "item-src2", section_key: "body", section_order: 1, content_md: "See https://example.com/above-floor-notice for the levy figure." }];
  // URL-aware: the item's own canonical URL never carries the figure; only the above-floor URL's page does.
  const fetchImpl = async (url) => (
    String(url).includes("above-floor-notice")
      ? { ok: true, status: 200, text: async () => "The levy is set at €900,000 under this measure, per the notice. " + "Padding text so this body clears the 200-char usability floor. ".repeat(3) }
      : { ok: true, status: 200, text: async () => "should not be re-fetched in this test" }
  );
  const deps = baseDeps({
    fetchImpl,
    readCaptures: async () => captures,
    readClaims: async () => [],
    readSections: async (id) => (id === "item-src2" ? sections : []),
  });
  const r = await healOneItem(item, { deps, apply: true, selectionMode: "quarantined-live", requiredSlotsMap: {}, sourcesIndex });

  const entry = r.steps.source.find((s) => s.outcome === "grounded_on_existing_source");
  assert.ok(entry, JSON.stringify(r.steps.source));
  assert.equal(entry.source_id, "src-above");
  assert.equal(entry.source_tier, 5);
  assert.ok(!deps.calls.some((c) => c[0] === "registerSource"), "no new sources row for an already-registered host (179 case)");

  const claimCall = deps.calls.find((c) => c[0] === "insertClaim" && c[1].source_id === "src-above");
  assert.ok(claimCall);
  assert.equal(claimCall[1].source_tier_at_grounding, 5, "the rating is recorded and published, never masked — the ruling's own point");
  assert.equal(r.steps.orphans.length, 0);
});

test("healOneItem STEP SOURCE: a worklist_ambiguous_host candidate is reported and never registered — the token stays an honest orphan", async () => {
  const item = {
    id: "item-src3", item_type: "regulation", source_url: null,
    full_brief: "The levy is set at €300,000 under this measure.",
  };
  const sections = [{ id: "sec-src3", item_id: "item-src3", section_key: "body", section_order: 1, content_md: "See https://some-random-vendor.example/notice for detail." }];
  const deps = baseDeps({
    readClaims: async () => [],
    readSections: async (id) => (id === "item-src3" ? sections : []),
  });
  const r = await healOneItem(item, { deps, apply: true, selectionMode: "quarantined-live", requiredSlotsMap: {} });

  const worklisted = r.steps.source.find((s) => s.outcome === "worklist_ambiguous_host");
  assert.ok(worklisted, JSON.stringify(r.steps.source));
  assert.equal(worklisted.host, "some-random-vendor.example");
  assert.ok(!deps.calls.some((c) => c[0] === "registerSource"));
  assert.ok(!deps.calls.some((c) => c[0] === "insertClaim"));
  // never forced -- STEP C's own (unchanged) scan still names it unprovable.
  assert.equal(r.steps.orphans[0].outcome, "unprovable");
});

test("healOneItem STEP SOURCE: a fetch that fails is reported unfetchable, no source registered, token stays an honest orphan", async () => {
  const item = {
    id: "item-src4", item_type: "regulation", source_url: null,
    full_brief: "The levy is set at €400,000 under this measure.",
  };
  const sections = [{ id: "sec-src4", item_id: "item-src4", section_key: "body", section_order: 1, content_md: "See https://notices.example.gov/unreachable for detail." }];
  const fetchImpl = async () => ({ ok: false, status: 503, text: async () => "" });
  const deps = baseDeps({
    fetchImpl,
    readClaims: async () => [],
    readSections: async (id) => (id === "item-src4" ? sections : []),
  });
  const r = await healOneItem(item, { deps, apply: true, selectionMode: "quarantined-live", requiredSlotsMap: {} });

  const held = r.steps.source.find((s) => s.outcome === "unfetchable");
  assert.ok(held, JSON.stringify(r.steps.source));
  assert.ok(!deps.calls.some((c) => c[0] === "insertClaim"));
  assert.equal(r.steps.orphans[0].outcome, "unprovable");
});

test("healOneItem STEP SOURCE: a captured page that does not contain the token verbatim reports token_not_in_page, never invented", async () => {
  const item = {
    id: "item-src5", item_type: "regulation", source_url: null,
    full_brief: "The levy is set at €600,000 under this measure.",
  };
  const sections = [{ id: "sec-src5", item_id: "item-src5", section_key: "body", section_order: 1, content_md: "See https://notices.example.gov/other for detail." }];
  const fetchImpl = async () => ({ ok: true, status: 200, text: async () => "This page discusses an entirely different topic, no figures at all. " + "Padding text so this body clears the 200-char usability floor. ".repeat(3) });
  const deps = baseDeps({
    fetchImpl,
    readClaims: async () => [],
    readSections: async (id) => (id === "item-src5" ? sections : []),
  });
  const r = await healOneItem(item, { deps, apply: true, selectionMode: "quarantined-live", requiredSlotsMap: {} });

  const missed = r.steps.source.find((s) => s.outcome === "token_not_in_page");
  assert.ok(missed, JSON.stringify(r.steps.source));
  assert.ok(!deps.calls.some((c) => c[0] === "insertClaim"));
  assert.equal(r.steps.orphans[0].outcome, "unprovable");
});

test("healOneItem STEP SOURCE: dry mode plans every candidate with ZERO writes and ZERO fetches", async () => {
  const item = {
    id: "item-src6", item_type: "regulation", source_url: null,
    full_brief: "The levy is set at €200,000 under this measure.",
  };
  const sections = [{ id: "sec-src6", item_id: "item-src6", section_key: "body", section_order: 1, content_md: "See https://notices.example.gov/dry for detail." }];
  const deps = baseDeps({ readClaims: async () => [], readSections: async (id) => (id === "item-src6" ? sections : []) });
  const r = await healOneItem(item, { deps, apply: false, selectionMode: "quarantined-live", requiredSlotsMap: {} });

  const planned = r.steps.source.find((s) => s.outcome === "would_register_and_capture");
  assert.ok(planned, JSON.stringify(r.steps.source));
  assert.equal(planned.class_tier, 2);
  assert.deepEqual(deps.calls, []);
});

test("healOneItem STEP SOURCE: bounded by SOURCE_MAX_PER_ITEM, overflow reported as bound_hit, never silently dropped", async () => {
  const n = SOURCE_MAX_PER_ITEM + 3;
  const manyOrphanFigures = Array.from({ length: n }, (_, i) => `€${100 + i},000`);
  const item = {
    id: "item-src7", item_type: "regulation", source_url: null,
    full_brief: `The levy schedule states ${manyOrphanFigures.join(", then ")} across successive tranches.`,
  };
  // Every orphan figure gets its OWN owning section citing an ambiguous host — classification is a pure,
  // fast worklist decision (no network call), so this test stays deterministic while still driving
  // sourceAttempts (incremented per candidate URL TRIED, per the header's own accounting) past the bound.
  const sections = manyOrphanFigures.map((fig, i) => ({
    id: `sec-src7-${i}`, item_id: "item-src7", section_key: `body-${i}`, section_order: i,
    content_md: `The levy schedule states ${fig} for tranche ${i}. See https://vendor-${i}.example/notice for detail.`,
  }));
  const deps = baseDeps({ readClaims: async () => [], readSections: async (id) => (id === "item-src7" ? sections : []) });
  const r = await healOneItem(item, { deps, apply: true, selectionMode: "quarantined-live", requiredSlotsMap: {} });
  const boundHits = r.steps.source.filter((s) => s.outcome === "bound_hit");
  assert.ok(boundHits.length > 0, JSON.stringify(r.steps.source.map((s) => s.outcome)));
  assert.ok(!deps.calls.some((c) => c[0] === "registerSource"), "worklist_ambiguous_host candidates never register");
});

test("summarizeReports: tallies the eighth-pass STEP SOURCE counters", () => {
  const perItem = [
    {
      steps: {
        source: [
          { outcome: "source_registered_and_grounded" },
          { outcome: "grounded_on_existing_source" },
          { outcome: "unfetchable" },
          { outcome: "token_not_in_page" },
          { outcome: "worklist_ambiguous_host" },
          { outcome: "unresolved" },
          { outcome: "bound_hit" },
        ],
        gate_a: {}, rederive: { outcome: "still_failing", failures: [] },
      },
    },
  ];
  const s = summarizeReports(perItem);
  assert.equal(s.source_registered, 1);
  assert.equal(s.source_rated_tier, 2, "every grounded token (new-registration OR existing-source) is rated");
  assert.equal(s.source_grounded, 2);
  assert.equal(s.grounded_after_register, 2);
  assert.equal(s.source_unfetchable, 1);
  assert.equal(s.source_token_not_in_page, 1);
  assert.equal(s.source_worklisted, 1);
  assert.equal(s.source_unresolved, 1);
  assert.equal(s.source_bound_hit, 1);
});

// ── NINTH PASS (2026-09-04, lane HEAL-8) — numeric-tolerant matching, one-hop follow, sentence context,
//    the STEP SOURCE budget-split + thin-recapture fixes. See this file's header NINTH PASS section. ────

// buildNumericNormalizedIndex / locateSpanInText's numeric_tolerant tier ───────────────────────────────

test("buildNumericNormalizedIndex: currency SYMBOL and CODE fold to the same lowercase code, adjacency collapsed", () => {
  assert.equal(buildNumericNormalizedIndex("€1,200.50").normalized, buildNumericNormalizedIndex("EUR 1.200,50").normalized);
  assert.equal(buildNumericNormalizedIndex("€1,200.50").normalized, "eur1200.50");
});

test("buildNumericNormalizedIndex: currency codes are NEVER conflated across different currencies", () => {
  assert.notEqual(buildNumericNormalizedIndex("€44,836").normalized, buildNumericNormalizedIndex("$44,836").normalized);
});

test("buildNumericNormalizedIndex: thousands separator (3 digits) drops, any other separator run folds to decimal", () => {
  assert.equal(buildNumericNormalizedIndex("1,200").normalized, "1200");
  assert.equal(buildNumericNormalizedIndex("1 200").normalized, "1200");
  assert.equal(buildNumericNormalizedIndex("1.200").normalized, "1200");
  // NOT a thousands run (only 2 trailing digits after the separator) -> decimal, never dropped
  assert.equal(buildNumericNormalizedIndex("35.5").normalized, "35.5");
  assert.equal(buildNumericNormalizedIndex("35,5").normalized, "35.5");
});

test("buildNumericNormalizedIndex: %-spacing collapses (mirrors gate-a-match.mjs's own convention, a different site)", () => {
  assert.equal(buildNumericNormalizedIndex("35.5%").normalized, buildNumericNormalizedIndex("35,5 %").normalized);
});

test("buildNumericNormalizedIndex: superscript AND subscript digits both fold to plain digits", () => {
  assert.equal(buildNumericNormalizedIndex("gCO₂").normalized, buildNumericNormalizedIndex("gCO2").normalized, "subscript");
  assert.equal(buildNumericNormalizedIndex("2¹⁰").normalized, buildNumericNormalizedIndex("210").normalized, "superscript");
});

test("locateSpanInText: numeric_tolerant tier grounds a different surface form of the SAME figure, span stays byte-exact from the capture (ADR-016)", () => {
  const hay = "The levy is set at €1,200.50 under this measure.";
  const r = locateSpanInText("EUR 1.200,50", hay);
  assert.equal(r.method, "numeric_tolerant");
  assert.equal(r.span, "€1,200.50", "the STORED span is the capture's own verbatim substring, never the search needle's form");
  assert.ok(hay.includes(r.span));
});

test("locateSpanInText: numeric_tolerant grounds %-spacing and subscript-unit forms too", () => {
  const pct = locateSpanInText("35,5 %", "Emissions must fall by 35.5% under the target.");
  assert.equal(pct.method, "numeric_tolerant");
  assert.equal(pct.span, "35.5%");

  const unit = locateSpanInText("14 gCO2", "Average intensity of 14 gCO₂ per unit.");
  assert.equal(unit.method, "numeric_tolerant");
  assert.equal(unit.span, "14 gCO₂");
});

test("locateSpanInText: numeric_tolerant is digit-gated — never invents a match for a genuinely different figure", () => {
  assert.equal(locateSpanInText("9,000", "totally different figure of 8,000 appears here."), null);
  assert.equal(locateSpanInText("133", "the total was 233 units."), null, "numeral-boundary respected, not a substring collapse");
});

test("locateSpanInText: trailing sentence punctuation the figureTokens regex over-captures is retried once, never on the first pass", () => {
  const r1 = locateSpanInText("2030.", "The measure applies from 2030 under the schedule.");
  assert.equal(r1.span, "2030");
  assert.equal(r1.method, "exact", "retry finds the STRIPPED needle at the cheapest tier, not a fabricated 'punct_stripped' tier");

  const r2 = locateSpanInText("€200,000)", "annual cap of €200,000 was confirmed.");
  assert.equal(r2.span, "€200,000");
});

// extractHopLinks / classifyHopLink / hopLinksForToken ───────────────────────────────────────────────

test("extractHopLinks: resolves relative and protocol-relative hrefs, dedupes, skips javascript/mailto/tel/#fragment", () => {
  const html = `<html><body>
    <a href="/documents/afif-grant.pdf">Grant PDF</a>
    <a href='https://ec.europa.eu/other-page'>EC page</a>
    <a href="//cdn.example/asset">protocol-relative</a>
    <a href="#top">Top</a>
    <a href="javascript:void(0)">JS</a>
    <a href="mailto:foo@bar.com">Mail</a>
    <a href="tel:+1234">Tel</a>
    <a href="/documents/afif-grant.pdf">duplicate</a>
  </body></html>`;
  const links = extractHopLinks(html, "https://chj-eu.example/press/afif");
  assert.deepEqual(links, [
    "https://chj-eu.example/documents/afif-grant.pdf",
    "https://ec.europa.eu/other-page",
    "https://cdn.example/asset",
  ]);
});

test("extractHopLinks: no <a href> at all, null html, or an unresolvable base url -> empty, never throws", () => {
  assert.deepEqual(extractHopLinks("<p>no links here</p>", "https://x.example/"), []);
  assert.deepEqual(extractHopLinks(null, "https://x.example/"), []);
  assert.deepEqual(extractHopLinks("<a href='/relative'>bad base</a>", "not-a-valid-base-url"), []);
});

test("classifyHopLink: same non-portal host is eligible", () => {
  assert.equal(classifyHopLink("https://chj-eu.example/other", "https://chj-eu.example/press/afif"), true);
});

test("classifyHopLink: a SHARED GOVERNMENT PORTAL host is NOT eligible across two different institutions sharing the host (institutionKey, not a plain hostOf compare)", () => {
  assert.equal(classifyHopLink("https://nj.gov/other/y", "https://nj.gov/dep/x"), false);
  assert.equal(classifyHopLink("https://nj.gov/dep/y", "https://nj.gov/dep/x"), true, "same portal institution IS eligible");
});

test("classifyHopLink: two genuinely different hosts are never eligible (institutionKey cannot bridge hosts) — an unparseable url is never guessed eligible", () => {
  assert.equal(classifyHopLink("https://eur-lex.europa.eu/x", "https://ec.europa.eu/press/afif"), false);
  assert.equal(classifyHopLink("not a url", "https://ec.europa.eu/press/afif"), false);
  assert.equal(classifyHopLink("https://ec.europa.eu/press/afif", "not a url"), false);
});

test("hopLinksForToken: filters to eligible links only, bounded to SOURCE_MAX_HOP_LINKS_PER_TOKEN", () => {
  const base = "https://notices.example.gov/landing";
  const html = [
    ...Array.from({ length: SOURCE_MAX_HOP_LINKS_PER_TOKEN + 4 }, (_, i) => `<a href="/sub-${i}">sub ${i}</a>`),
    `<a href="https://third-party.example/ad">ad</a>`,
  ].join("\n");
  const links = hopLinksForToken(html, base);
  assert.equal(links.length, SOURCE_MAX_HOP_LINKS_PER_TOKEN);
  assert.ok(links.every((u) => u.startsWith("https://notices.example.gov/sub-")));
});

// extractSentenceContext ─────────────────────────────────────────────────────────────────────────────

test("extractSentenceContext: returns the token's own literal enclosing sentence, never invented", () => {
  const brief = "Intro sentence here. The levy is set at 200,000 EUR by 2030. Trailing sentence follows.";
  assert.equal(extractSentenceContext(brief, "200,000 EUR"), "The levy is set at 200,000 EUR by 2030.");
});

test("extractSentenceContext: case-insensitive first-occurrence, trimmed; null when the token is not a literal substring at all", () => {
  const brief = "First mention: The Cap Is 50%. Second mention: the cap is 50% again.";
  assert.equal(extractSentenceContext(brief, "the cap is 50%"), "First mention: The Cap Is 50%.");
  assert.equal(extractSentenceContext("Nothing relevant here.", "999 EUR"), null);
  assert.equal(extractSentenceContext("", "999 EUR"), null);
});

// summarizeReports: no_candidate_url + one-hop counters ─────────────────────────────────────────────

test("summarizeReports: tallies the ninth-pass no_candidate_url and one-hop STEP SOURCE counters", () => {
  const perItem = [
    {
      steps: {
        source: [
          { outcome: "no_candidate_url" },
          { outcome: "source_registered_and_grounded_one_hop" },
          { outcome: "grounded_on_existing_source_one_hop" },
        ],
        gate_a: {}, rederive: { outcome: "still_failing", failures: [] },
      },
    },
  ];
  const s = summarizeReports(perItem);
  assert.equal(s.source_no_candidate_url, 1);
  assert.equal(s.source_grounded_one_hop, 2);
  assert.equal(s.source_grounded, 2, "one-hop groundings are ALSO counted in the plain totals, never a separate bucket only");
  assert.equal(s.source_registered, 1);
});

// healOneItem STEP SOURCE integration: budget-split, thin-recapture, one-hop grounding ─────────────────

test("healOneItem STEP SOURCE: an already-captured, USABLE row for the exact URL is a FREE lookup — does not count against SOURCE_MAX_PER_ITEM, so more orphans ground than the bound would allow if every lookup were charged", async () => {
  const n = SOURCE_MAX_PER_ITEM + 5;
  const figures = Array.from({ length: n }, (_, i) => `€${100 + i},000`);
  // Figures are followed by a WORD, never punctuation directly (mirrors this file's own NINTH PASS finding
  // about figureTokens' trailing-punctuation over-capture) so each orphan token is exactly the bare figure
  // — the fixture stays a clean test of the budget-split fix, not an accidental exercise of the trailing-
  // punctuation retry tier (covered by its own dedicated test above).
  const item = {
    id: "item-src8", item_type: "regulation", source_url: null,
    full_brief: "The levy schedule states the following: " + figures.map((fig, i) => `${fig} for tranche ${i}`).join("; ") + ".",
  };
  // Every orphan gets its OWN owning section citing its OWN ABOVE-FLOOR-tier source (the 179 case — STEP
  // A/RESOURCE's own tier_qualifying bucket deliberately excludes it, so the orphan reaches STEP SOURCE's
  // own loop rather than being grounded for free by STEP A/STEP C's existing bucket mechanism) whose
  // capture ALREADY exists and is USABLE (>200 chars) — a pure free-lookup grounding, zero fetches.
  const sections = figures.map((fig, i) => ({
    id: `sec-src8-${i}`, item_id: "item-src8", section_key: `body-${i}`, section_order: i,
    content_md: `The levy schedule states ${fig} for tranche ${i}. See https://notices.example.gov/tranche-${i} for detail.`,
  }));
  const captures = figures.map((fig, i) => ({
    id: `cap-src8-${i}`, result_url: `https://notices.example.gov/tranche-${i}`,
    result_content: `The levy schedule states ${fig} for tranche ${i}, per the official notice. ` + "Padding so this body clears the 200-char usability floor. ".repeat(3),
  }));
  const sourcesIndex = buildSourcesIndex(
    figures.map((_, i) => ({ id: `src-src8-${i}`, url: `https://notices.example.gov/tranche-${i}`, base_tier: 5 })),
  );
  const fetchImpl = async () => { throw new Error("no fetch should ever be needed — every candidate is already captured"); };
  const deps = baseDeps({
    fetchImpl,
    readCaptures: async () => captures,
    readClaims: async () => [],
    readSections: async (id) => (id === "item-src8" ? sections : []),
  });
  const r = await healOneItem(item, { deps, apply: true, selectionMode: "quarantined-live", requiredSlotsMap: {}, sourcesIndex });

  const grounded = r.steps.source.filter((s) => s.outcome === "grounded_on_existing_source");
  const boundHits = r.steps.source.filter((s) => s.outcome === "bound_hit");
  assert.equal(grounded.length, n, `all ${n} orphans ground for free — the budget was never the bottleneck for a zero-cost lookup`);
  assert.equal(boundHits.length, 0, "no bound_hit at all: free lookups never charge SOURCE_MAX_PER_ITEM");
  assert.ok(!deps.calls.some((c) => c[0] === "registerSource"), "every host was already registered — no new sources rows");
});

test("healOneItem STEP SOURCE: worklist_ambiguous_host / unresolvable_host classification-only attempts STILL count against the bound (unchanged from the eighth pass)", async () => {
  const n = SOURCE_MAX_PER_ITEM + 3;
  const figures = Array.from({ length: n }, (_, i) => `€${100 + i},000`);
  const item = {
    id: "item-src9", item_type: "regulation", source_url: null,
    full_brief: `The levy schedule states ${figures.join(", then ")} across successive tranches.`,
  };
  const sections = figures.map((fig, i) => ({
    id: `sec-src9-${i}`, item_id: "item-src9", section_key: `body-${i}`, section_order: i,
    content_md: `The levy schedule states ${fig} for tranche ${i}. See https://vendor-${i}.example/notice for detail.`,
  }));
  const deps = baseDeps({ readClaims: async () => [], readSections: async (id) => (id === "item-src9" ? sections : []) });
  const r = await healOneItem(item, { deps, apply: true, selectionMode: "quarantined-live", requiredSlotsMap: {} });
  const boundHits = r.steps.source.filter((s) => s.outcome === "bound_hit");
  assert.ok(boundHits.length > 0, JSON.stringify(r.steps.source.map((s) => s.outcome)));
});

test("healOneItem STEP SOURCE: a THIN (<=200 usable chars) pre-existing capture is treated as NOT YET captured — a real re-fetch is attempted and can ground the token (Class C)", async () => {
  const item = {
    id: "item-src10", item_type: "regulation", source_url: null,
    full_brief: "The levy is set at €650,000 under this measure.",
  };
  const sections = [{ id: "sec-src10", item_id: "item-src10", section_key: "body", section_order: 1, content_md: "See https://notices.example.gov/thin for detail." }];
  // A pre-existing capture at the EXACT candidate URL, but thin (cookie-wall/JS-shell shaped) — under 200
  // usable chars. Before the NINTH PASS fix, this would have short-circuited the "already captured" branch
  // and the token would have been reported token_not_in_page against the THIN body, never re-fetched.
  const thinCaptures = [{ id: "cap-thin", result_url: "https://notices.example.gov/thin", result_content: "cookies required" }];
  let fetchCalls = 0;
  const fetchImpl = async () => {
    fetchCalls += 1;
    return { ok: true, status: 200, text: async () => "The levy is set at €650,000 under this measure, per the refreshed notice. " + "Padding text so this body clears the 200-char usability floor. ".repeat(3) };
  };
  const deps = baseDeps({
    fetchImpl,
    readCaptures: async () => thinCaptures,
    readClaims: async () => [],
    readSections: async (id) => (id === "item-src10" ? sections : []),
    registerSource: async (source) => ({ source_id: "src-thin-registered", created: true, host: source.name }),
    readSourceByUrl: async (url) => ({ id: "src-thin-registered", url, base_tier: 2, tier_override: null, institution_id: null, status: "active" }),
  });
  const r = await healOneItem(item, { deps, apply: true, selectionMode: "quarantined-live", requiredSlotsMap: {} });

  assert.equal(fetchCalls, 1, "the thin existing row did NOT short-circuit a real re-fetch");
  const entry = r.steps.source.find((s) => s.outcome === "source_registered_and_grounded");
  assert.ok(entry, JSON.stringify(r.steps.source));
  assert.ok(deps.calls.some((c) => c[0] === "insertSearch"), "a fresh capture row was inserted for the re-fetched page");
});

test("healOneItem STEP SOURCE: ONE-HOP FOLLOW — the direct candidate page (fetched live this run) does not itself carry the token, but a same-host sub-page it links to does; the hop is grounded with its OWN registered source", async () => {
  const item = {
    id: "item-hop1", item_type: "regulation", source_url: null,
    full_brief: "The levy is set at €750,500 under the new measure.",
  };
  const sections = [{ id: "sec-hop1", item_id: "item-hop1", section_key: "body", section_order: 1, content_md: "See https://notices.example.gov/landing for detail." }];
  const landingHtml = `<html><body>
    <p>This landing page summarizes the measure in general terms, with no figure stated here at all. ${"Padding so this body clears the 200-char usability floor. ".repeat(3)}</p>
    <a href="/notice/detail-750500">Full notice with figures</a>
  </body></html>`;
  const detailText = "The levy is set at €750,500 under the new measure, per the full notice. " + "Padding text so this body clears the 200-char usability floor. ".repeat(3);
  const fetchImpl = async (url) => {
    const u = String(url);
    if (u === "https://notices.example.gov/landing") return { ok: true, status: 200, text: async () => landingHtml };
    if (u === "https://notices.example.gov/notice/detail-750500") return { ok: true, status: 200, text: async () => detailText };
    throw new Error(`unexpected fetch: ${u}`);
  };
  const deps = baseDeps({
    fetchImpl,
    readCaptures: async () => [],
    readClaims: async () => [],
    readSections: async (id) => (id === "item-hop1" ? sections : []),
    registerSource: async (source) => ({ source_id: `src-${source.url}`, created: true, host: source.name }),
    readSourceByUrl: async (url) => ({ id: `src-${url}`, url, base_tier: 2, tier_override: null, institution_id: null, status: "active" }),
  });
  const r = await healOneItem(item, { deps, apply: true, selectionMode: "quarantined-live", requiredSlotsMap: {} });

  const hopEntry = r.steps.source.find((s) => s.outcome === "source_registered_and_grounded_one_hop");
  assert.ok(hopEntry, JSON.stringify(r.steps.source));
  assert.equal(hopEntry.url, "https://notices.example.gov/notice/detail-750500");
  assert.equal(hopEntry.hop_from, "https://notices.example.gov/landing");
  assert.equal(hopEntry.source_id, "src-https://notices.example.gov/notice/detail-750500", "the hop grounds on its OWN registered source, never inherits the landing page's source");

  const hopClaimCall = deps.calls.find((c) => c[0] === "insertClaim" && c[1].source_id === hopEntry.source_id);
  assert.ok(hopClaimCall);
  assert.ok(hopClaimCall[1].source_span.includes("750,500"));
  assert.equal(r.steps.orphans.length, 0, "grounded by STEP SOURCE before STEP C's own fresh scan runs");
});

test("healOneItem STEP SOURCE: no eligible one-hop link (third-party domain only) -> honest token_not_in_page, never a forced/invented hop", async () => {
  const item = {
    id: "item-hop2", item_type: "regulation", source_url: null,
    full_brief: "The levy is set at €820,000 under the new measure.",
  };
  const sections = [{ id: "sec-hop2", item_id: "item-hop2", section_key: "body", section_order: 1, content_md: "See https://notices.example.gov/landing2 for detail." }];
  const landingHtml = `<html><body>
    <p>General summary text, no figure stated here at all. ${"Padding so this body clears the 200-char usability floor. ".repeat(3)}</p>
    <a href="https://third-party-ad-network.example/click">sponsored</a>
  </body></html>`;
  const fetchImpl = async (url) => {
    const u = String(url);
    if (u === "https://notices.example.gov/landing2") return { ok: true, status: 200, text: async () => landingHtml };
    throw new Error(`unexpected fetch: ${u}`);
  };
  const deps = baseDeps({
    fetchImpl,
    readCaptures: async () => [],
    readClaims: async () => [],
    readSections: async (id) => (id === "item-hop2" ? sections : []),
  });
  const r = await healOneItem(item, { deps, apply: true, selectionMode: "quarantined-live", requiredSlotsMap: {} });

  const missed = r.steps.source.find((s) => s.outcome === "token_not_in_page");
  assert.ok(missed, JSON.stringify(r.steps.source));
  assert.ok(!deps.calls.some((c) => c[0] === "insertClaim"));
});

test("healOneItem STEP SOURCE: no_candidate_url and unresolved outcomes carry the orphan's own enclosing sentence, never invented", async () => {
  const item = {
    id: "item-src11", item_type: "regulation", source_url: null,
    full_brief: "Intro text. The levy is set at €911,000 under this measure. Trailing text follows.",
  };
  const deps = baseDeps({ readClaims: async () => [], readSections: async () => [] });
  const r = await healOneItem(item, { deps, apply: true, selectionMode: "quarantined-live", requiredSlotsMap: {} });

  const noCandidate = r.steps.source.find((s) => s.outcome === "no_candidate_url");
  assert.ok(noCandidate, JSON.stringify(r.steps.source));
  assert.equal(noCandidate.sentence, "The levy is set at €911,000 under this measure.");
});

test("healOneItem STEP C: an unprovable orphan carries its own enclosing sentence alongside the existing fuzzy evidence", async () => {
  const item = {
    id: "item-src12", item_type: "regulation", source_url: null,
    full_brief: "Intro text. The levy is set at €922,000 under this measure. Trailing text follows.",
  };
  const deps = baseDeps({ readClaims: async () => [], readSections: async () => [] });
  const r = await healOneItem(item, { deps, apply: true, selectionMode: "quarantined-live", requiredSlotsMap: {} });

  const unprovable = r.steps.orphans.find((o) => o.outcome === "unprovable");
  assert.ok(unprovable, JSON.stringify(r.steps.orphans));
  assert.equal(unprovable.sentence, "The levy is set at €922,000 under this measure.");
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// TENTH PASS (2026-09-04, lane HEAL-10) — Tasks 3/4/5: BRIEF-HONEST STRIP + RELABEL-from-full-brief.
// Fixtures for the sentence/clause-boundary and healOneItem-integration cases below reuse the Blue Visby
// item's OWN tokens/sentences verbatim (item 0781a8c0-5e17-4841-819c-fe9cd91eff15, run #31,
// scripts/_snapshots/heal31.json's own per_item[].steps.orphans): token "15%" ->
// "The consortium states a 15% reduction in shipping GHG emissions as the platform's target outcome." and
// token "April 2026" -> "**Technology Profile** | April 2026".
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

// ── sentenceSpans / findSentenceSpanForToken / removeSentenceSpan ──────────────────────────────────────

test("sentenceSpans: splits on the same SENTENCE_BOUNDARY_RE extractSentenceContext uses, spans reconstruct the input", () => {
  const text = "First sentence here. Second one follows. Third and last.";
  const spans = sentenceSpans(text);
  assert.equal(spans.length, 3);
  assert.equal(text.slice(spans[0].start, spans[0].end), "First sentence here.");
  assert.equal(text.slice(spans[1].start, spans[1].end), "Second one follows.");
  assert.equal(text.slice(spans[2].start, spans[2].end), "Third and last.");
});

test("sentenceSpans: a markdown table (newline-separated rows, no terminal punctuation) — Blue Visby's own April-2026 row", () => {
  const text = "**Technology Profile** | April 2026\n**Status** | Pilot phase";
  const spans = sentenceSpans(text);
  assert.equal(spans.length, 2);
  assert.equal(text.slice(spans[0].start, spans[0].end), "**Technology Profile** | April 2026");
  assert.equal(text.slice(spans[1].start, spans[1].end), "**Status** | Pilot phase");
});

test("sentenceSpans: empty input -> []", () => {
  assert.deepEqual(sentenceSpans(""), []);
  assert.deepEqual(sentenceSpans(null), []);
});

test("findSentenceSpanForToken: Blue Visby's own '15%' sentence, verbatim", () => {
  const fullBrief =
    "Intro paragraph about the initiative. The consortium states a 15% reduction in shipping GHG emissions " +
    "as the platform's target outcome. Closing remark about scope.";
  const hit = findSentenceSpanForToken(fullBrief, "15%");
  assert.ok(hit);
  assert.equal(hit.sentence, "The consortium states a 15% reduction in shipping GHG emissions as the platform's target outcome.");
  assert.equal(fullBrief.slice(hit.start, hit.end), hit.sentence);
});

test("findSentenceSpanForToken: null when token is not a literal substring at all", () => {
  assert.equal(findSentenceSpanForToken("No figures here.", "15%"), null);
});

test("removeSentenceSpan: removes a MIDDLE sentence, consuming the separator AFTER it, everything else byte-identical", () => {
  const text = "First sentence here. Second one follows. Third and last.";
  const spans = sentenceSpans(text);
  const out = removeSentenceSpan(text, spans, 1); // "Second one follows."
  assert.equal(out, "First sentence here. Third and last.");
});

test("removeSentenceSpan: removes the LAST sentence, consuming the separator BEFORE it instead", () => {
  const text = "First sentence here. Second one follows. Third and last.";
  const spans = sentenceSpans(text);
  const out = removeSentenceSpan(text, spans, 2); // "Third and last."
  assert.equal(out, "First sentence here. Second one follows.");
});

test("removeSentenceSpan: the ONLY sentence in the text -> empties it", () => {
  const text = "Just one sentence here.";
  const spans = sentenceSpans(text);
  assert.equal(removeSentenceSpan(text, spans, 0), "");
});

// ── planStripUnprovableClause (middle-clause-only carve-out) ────────────────────────────────────────

test("planStripUnprovableClause: removes a MIDDLE clause, rejoining with the separator that preceded it", () => {
  const sentence = "The report notes early progress, a 42% reduction was recorded in Q1, and full compliance is expected by 2027.";
  const plan = planStripUnprovableClause(sentence, "42%");
  assert.ok(plan);
  assert.equal(plan.removedClause, "a 42% reduction was recorded in Q1");
  assert.equal(plan.rewritten, "The report notes early progress, and full compliance is expected by 2027.");
});

test("planStripUnprovableClause: refuses the FIRST clause, never guesses", () => {
  const sentence = "A 42% figure opens this sentence, a middle clause follows, and it closes here.";
  assert.equal(planStripUnprovableClause(sentence, "42%"), null);
});

test("planStripUnprovableClause: refuses the LAST clause, never guesses", () => {
  const sentence = "It opens here, a middle clause follows, and it closes with 42% at the end.";
  assert.equal(planStripUnprovableClause(sentence, "42%"), null);
});

test("planStripUnprovableClause: fewer than 3 clauses (no middle exists) -> refuses", () => {
  assert.equal(planStripUnprovableClause("Only one clause with 42% in it.", "42%"), null);
  assert.equal(planStripUnprovableClause("Two clauses, and 42% is in the second.", "42%"), null);
});

test("planStripUnprovableClause: token not in the sentence at all -> null", () => {
  assert.equal(planStripUnprovableClause("No figure here, none at all, truly.", "42%"), null);
});

// ── planStripUnprovableSentence ──────────────────────────────────────────────────────────────────────

test("planStripUnprovableSentence: whole-sentence removal when no OTHER live token shares the sentence", () => {
  const fullBrief =
    "Intro paragraph about the initiative. The consortium states a 15% reduction in shipping GHG emissions " +
    "as the platform's target outcome. Closing remark about scope.";
  const plan = planStripUnprovableSentence(fullBrief, "15%", []);
  assert.equal(plan.outcome, "sentence_removed");
  assert.equal(
    plan.newFullBrief,
    "Intro paragraph about the initiative. Closing remark about scope.",
  );
});

test("planStripUnprovableSentence: falls back to a middle-clause carve-out when the sentence carries another live token", () => {
  const fullBrief =
    "Intro. The report notes early progress, a 42% reduction was recorded in Q1, and full compliance is " +
    "expected by 2027. Closing.";
  const plan = planStripUnprovableSentence(fullBrief, "42%", ["2027"]);
  assert.equal(plan.outcome, "clause_removed");
  assert.equal(
    plan.newFullBrief,
    "Intro. The report notes early progress, and full compliance is expected by 2027. Closing.",
  );
});

test("planStripUnprovableSentence: refuses outright when the other live token sits in the SAME (first/last) clause as the target — never guesses", () => {
  const fullBrief = "Intro. A 42% figure opens this sentence, a middle clause follows, and it closes at 2027. Closing.";
  const plan = planStripUnprovableSentence(fullBrief, "42%", ["2027"]);
  assert.equal(plan.outcome, "refused");
  assert.equal(plan.reason, "sentence_carries_other_live_token_no_isolable_clause");
});

test("planStripUnprovableSentence: refuses when the token is not in full_brief at all", () => {
  const plan = planStripUnprovableSentence("Nothing relevant here.", "15%", []);
  assert.equal(plan.outcome, "refused");
  assert.equal(plan.reason, "token_not_found_in_full_brief");
});

// ── planBriefHonest (orchestration + live Gate A re-scan acceptance) ────────────────────────────────

test("planBriefHonest: ACCEPTED — Blue Visby's own two tokens ('15%'/'April 2026'), both strip cleanly, Gate A clears", () => {
  const item = {
    id: "item-bv",
    full_brief:
      "Intro paragraph about the initiative. The consortium states a 15% reduction in shipping GHG emissions " +
      "as the platform's target outcome. Closing remark about scope.\n\n" +
      "**Technology Profile** | April 2026\n**Status** | Pilot phase",
  };
  const plan = planBriefHonest(item, ["15%", "April 2026"], [], new Set());
  assert.equal(plan.outcome, "accepted");
  assert.equal(
    plan.newFullBrief,
    "Intro paragraph about the initiative. Closing remark about scope.\n\n**Status** | Pilot phase",
  );
  assert.equal(plan.perToken.length, 2);
  assert.ok(plan.perToken.every((p) => p.outcome === "sentence_removed"));
  assert.match(plan.restore_sql, /^UPDATE intelligence_items SET full_brief = '/);
  assert.match(plan.restore_sql, /WHERE id = 'item-bv';$/);
  // the restore_sql's own quoted value round-trips back to the ORIGINAL (pre-strip) full_brief
  assert.ok(plan.restore_sql.includes(item.full_brief.replace(/'/g, "''").slice(0, 30)));
});

test("planBriefHonest: REJECTED — an UNRELATED orphan this call was never asked to touch survives the rewrite", () => {
  const item = {
    id: "item-partial",
    full_brief: "Intro. The consortium states a 15% reduction. Middle text with a separate 7% figure never touched. Closing.",
  };
  const plan = planBriefHonest(item, ["15%"], [], new Set()); // "7%" is deliberately NOT in the input list
  assert.equal(plan.outcome, "rejected");
  assert.equal(plan.reason, "gate_a_still_has_orphans_after_strip");
  assert.ok(plan.orphan_count >= 1);
});

test("planBriefHonest: NO_OP — empty token list", () => {
  assert.deepEqual(planBriefHonest({ id: "x", full_brief: "text" }, [], [], new Set()), { outcome: "no_op", perToken: [] });
});

test("planBriefHonest: NO_OP — every token refuses its own strip (nothing found), reported, never silently dropped", () => {
  const item = { id: "item-none", full_brief: "Nothing relevant to any of these tokens here." };
  const plan = planBriefHonest(item, ["15%", "April 2026"], [], new Set());
  assert.equal(plan.outcome, "no_op");
  assert.equal(plan.perToken.length, 2);
  assert.ok(plan.perToken.every((p) => p.outcome === "refused"));
});

// ── planRelabelFromFullBrief (criterion 4, Task 4 — the measured 3/159 "lives only in full_brief" case) ──

test("planRelabelFromFullBrief: null when claim_text is ALREADY resolvable in the section (not this branch's job)", () => {
  const section = { content_md: "This paragraph already states the figure directly." };
  assert.equal(planRelabelFromFullBrief(section, "already states the figure", "irrelevant full brief"), null);
});

test("planRelabelFromFullBrief: null when claim_text is nowhere, not even in full_brief (unrecoverable)", () => {
  const section = { content_md: "Unrelated section text." };
  assert.equal(planRelabelFromFullBrief(section, "A paraphrase nobody actually wrote.", "Also unrelated full brief text."), null);
});

test("planRelabelFromFullBrief: appends a labeled paragraph quoting claim_text verbatim when it's in full_brief but absent from the section", () => {
  const section = { content_md: "Existing paragraph, unrelated content." };
  const claimText = "Article 1000 requires enterprises to adopt green procurement practices.";
  const fullBrief = `Some prose. ${claimText} More prose.`;
  const plan = planRelabelFromFullBrief(section, claimText, fullBrief);
  assert.ok(plan);
  assert.equal(plan.content_md, `Existing paragraph, unrelated content.\n\n*Analytical inference:* ${claimText}`);
  assert.equal(plan.after, `*Analytical inference:* ${claimText}`);
});

test("planRelabelFromFullBrief: no leading blank-line separator when the section's own content_md is empty", () => {
  const claimText = "A standalone claim.";
  const plan = planRelabelFromFullBrief({ content_md: "" }, claimText, `Prose. ${claimText} More.`);
  assert.equal(plan.content_md, `*Analytical inference:* ${claimText}`);
});

// ── healOneItem integration: STEP BRIEF-HONEST is dry-by-default; the write fires ONLY with the
//    explicit token AND apply=true (Task 5's own "default dispatch never writes a brief" contract) ────

test("healOneItem: STEP BRIEF-HONEST plans and reports even in a normal apply-mode run, but NEVER calls updateItemBrief without the explicit token", async () => {
  const item = {
    id: "item-bh-default", item_type: "tool", source_url: null,
    full_brief: "Intro text. The consortium states a 15% reduction in this figure alone. Closing text.",
  };
  const deps = baseDeps({ readClaims: async () => [], readSections: async () => [] });
  const r = await healOneItem(item, { deps, apply: true, selectionMode: "quarantined-live", requiredSlotsMap: {} }); // no stripUnprovable

  assert.equal(r.steps.brief_honest.outcome, "accepted"); // the plan itself still computes
  assert.equal(r.steps.brief_honest.applied, false); // but is never applied without the token
  assert.equal(deps.calls.some((c) => c[0] === "updateItemBrief"), false);
  assert.equal(item.full_brief, "Intro text. The consortium states a 15% reduction in this figure alone. Closing text."); // untouched
});

test("healOneItem: STEP BRIEF-HONEST WRITES only when apply=true AND stripUnprovable=true (the explicit +strip-unprovable token)", async () => {
  const item = {
    id: "item-bh-apply", item_type: "tool", source_url: null,
    full_brief: "Intro text. The consortium states a 15% reduction in this figure alone. Closing text.",
  };
  const deps = baseDeps({ readClaims: async () => [], readSections: async () => [] });
  const r = await healOneItem(item, { deps, apply: true, selectionMode: "quarantined-live", requiredSlotsMap: {}, stripUnprovable: true });

  assert.equal(r.steps.brief_honest.outcome, "accepted");
  assert.equal(r.steps.brief_honest.applied, true);
  const call = deps.calls.find((c) => c[0] === "updateItemBrief");
  assert.ok(call, JSON.stringify(deps.calls));
  assert.equal(call[1], "item-bh-apply");
  assert.equal(call[2], "Intro text. Closing text.");
  assert.equal(item.full_brief, "Intro text. Closing text."); // in-memory item mutated so STEP 9's Gate A write reflects it
});

test("healOneItem: DRY mode never writes the brief even with stripUnprovable=true — dry stays dry regardless of the token", async () => {
  const item = {
    id: "item-bh-dry", item_type: "tool", source_url: null,
    full_brief: "Intro text. The consortium states a 15% reduction in this figure alone. Closing text.",
  };
  const deps = baseDeps({ readClaims: async () => [], readSections: async () => [] });
  const r = await healOneItem(item, { deps, apply: false, selectionMode: "quarantined-live", requiredSlotsMap: {}, stripUnprovable: true });

  assert.equal(r.steps.brief_honest.outcome, "accepted");
  assert.equal(r.steps.brief_honest.applied, false);
  assert.deepEqual(deps.calls, []); // dry mode makes NO writes at all, this one included
});

// ── healOneItem integration: RELABEL-from-full-brief (Task 4) — same dry-by-default/explicit-token gate ──

test("healOneItem STEP D: RELABEL-from-full-brief plans (dry) and only writes with the explicit token", async () => {
  const claimText = "Article 1000 requires enterprises to adopt green procurement practices.";
  const item = {
    id: "item-relabel-fb", item_type: "regulation", source_url: null,
    full_brief: `Some prose. ${claimText} More prose, no gate-A figures or dates here.`,
  };
  const sectionsByItem = new Map([[item.id, [{ id: "sec-1", item_id: item.id, content_md: "This section covers scope only." }]]]);
  const claims = [{ id: "claim-existing", claim_kind: "ANALYSIS", claim_text: claimText, section_row_id: "sec-1" }];
  const deps = baseDeps({ readClaims: async () => claims, readSections: async (id) => sectionsByItem.get(id) ?? [] });

  const dryReport = await healOneItem(item, { deps, apply: true, selectionMode: "quarantined-live", requiredSlotsMap: {} }); // no token
  const dryEntry = dryReport.steps.relabel.find((r) => r.claim_id === "claim-existing");
  assert.ok(dryEntry, JSON.stringify(dryReport.steps.relabel));
  assert.equal(dryEntry.outcome, "would_relabel_from_full_brief");
  assert.equal(deps.calls.some((c) => c[0] === "updateSectionContent"), false);

  const deps2 = baseDeps({ readClaims: async () => claims, readSections: async (id) => sectionsByItem.get(id) ?? [] });
  const applyReport = await healOneItem(item, { deps: deps2, apply: true, selectionMode: "quarantined-live", requiredSlotsMap: {}, stripUnprovable: true });
  const applyEntry = applyReport.steps.relabel.find((r) => r.claim_id === "claim-existing");
  assert.equal(applyEntry.outcome, "relabeled_from_full_brief");
  const call = deps2.calls.find((c) => c[0] === "updateSectionContent");
  assert.ok(call, JSON.stringify(deps2.calls));
  assert.equal(call[2], `This section covers scope only.\n\n*Analytical inference:* ${claimText}`);
});
