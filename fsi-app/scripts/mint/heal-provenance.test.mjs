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
} from "./heal-provenance.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

test("HEAL_VERSION is a stamped string", () => {
  assert.match(HEAL_VERSION, /^hp1-/);
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
    validateProvenance: async () => ({ valid: true, recommended_status: "verified", failures: [] }),
    insertSearch: async (row) => { calls.push(["insertSearch", row]); return { id: "search-new", result_url: row.result_url }; },
    insertClaim: async (row) => { calls.push(["insertClaim", row]); return { id: `claim-${calls.length}` }; },
    updateClaimSpan: async (id, patch) => { calls.push(["updateClaimSpan", id, patch]); return { updated: 1 }; },
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
