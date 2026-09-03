// heal-provenance.test.mjs — node --test scripts/mint/heal-provenance.test.mjs. No DB, no network: every
// I/O-touching function here is exercised with injected deps/fetchImpl stubs, per the lane contract.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, mkdtempSync } from "node:fs";
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
} from "./heal-provenance.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

test("HEAL_VERSION is a stamped string", () => {
  assert.match(HEAL_VERSION, /^hp3-/);
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

test("captureItem: plain-GET family holds capture_blocked with evidence on a short/failed response", async () => {
  const fetchImpl = async () => ({ ok: false, status: 404, text: async () => "not found" });
  const r = await captureItem({}, "https://example-regulator.gov/gone", { fetchImpl });
  assert.equal(r.status, "held");
  assert.equal(r.reason, "capture_blocked");
  assert.equal(r.evidence.status, 404);
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
  assert.deepEqual(parseSelection(""), { ok: true, mode: "quarantined-live", ids: null });
  assert.deepEqual(parseSelection(undefined), { ok: true, mode: "quarantined-live", ids: null });
});

test("parseSelection: the other three named selections", () => {
  assert.equal(parseSelection("archived-unreasoned").mode, "archived-unreasoned");
  assert.equal(parseSelection("slots-backfill").mode, "slots-backfill");
  assert.deepEqual(parseSelection("ids: a-1, b-2"), { ok: true, mode: "ids", ids: ["a-1", "b-2"] });
});

test("parseSelection: bad input refused", () => {
  assert.equal(parseSelection("ids:").ok, false);
  assert.equal(parseSelection("bogus").ok, false);
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
    insertInstitution: async (row) => { calls.push(["insertInstitution", row]); return { id: "inst-new" }; },
    updateSourceInstitution: async (sourceId, institutionId) => { calls.push(["updateSourceInstitution", sourceId, institutionId]); return { updated: 1 }; },
    validateProvenance: async () => ({ valid: true, recommended_status: "verified", failures: [] }),
    insertSearch: async (row) => { calls.push(["insertSearch", row]); return { id: "search-new", result_url: row.result_url }; },
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

test("main: bad --arg refuses before any read, exitCode 1", async () => {
  const deps = baseDeps();
  const r = await main({ mode: "apply", arg: "bogus" }, deps);
  assert.equal(r.exitCode, 1);
  assert.match(r.note, /REFUSED/);
  assert.deepEqual(deps.calls, []);
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

test("captureCitedUrl: plain-GET family holds capture_blocked with evidence on a failed response", async () => {
  const fetchImpl = async () => ({ ok: false, status: 404, text: async () => "not found" });
  const r = await captureCitedUrl("https://example-regulator.gov/gone-cited", { fetchImpl });
  assert.equal(r.status, "held");
  assert.equal(r.reason, "capture_blocked");
  assert.equal(r.evidence.status, 404);
});

test("captureCitedUrl: .pdf URL, non-PDF body -> held pdf_unsupported (never mistaken for HTML)", async () => {
  const fetchImpl = async () => ({ ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode("<html>not a pdf</html>").buffer });
  const r = await captureCitedUrl("https://example.com/report.pdf", { fetchImpl });
  assert.equal(r.status, "held");
  assert.equal(r.reason, "pdf_unsupported");
});

test("captureCitedUrl: .pdf URL, fetch fails -> held capture_blocked, no pdf parse attempted", async () => {
  const fetchImpl = async () => ({ ok: false, status: 503 });
  const r = await captureCitedUrl("https://example.com/report.pdf", { fetchImpl });
  assert.equal(r.status, "held");
  assert.equal(r.reason, "capture_blocked");
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
test("captureCitedUrl: .pdf URL, real PDF bytes -> captured, text extracted via the existing pdf-extract.mjs codec", { skip: UNPDF_AVAILABLE ? false : "unpdf not installed in this environment (depless discipline CI)" }, async () => {
  // Minimal xref-correct PDF, same builder as scripts/_diag/_pdf-probe.mjs's own proof.
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
  const bytes = minimalPdf("Hello cited PDF marker");
  const fetchImpl = async () => ({ ok: true, status: 200, arrayBuffer: async () => bytes.buffer });
  const r = await captureCitedUrl("https://example.com/cited.pdf", { fetchImpl });
  assert.equal(r.status, "captured");
  assert.match(r.text, /Hello cited PDF marker/);
  assert.equal(r.evidence.pdf, true);
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
