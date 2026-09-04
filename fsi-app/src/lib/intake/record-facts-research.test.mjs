// record-facts-research.test.mjs — proves the research-profile slot upgrade over record-facts.mjs's own
// GAP floor, the always-present key_figure/evidence_agreement_signal/source_authority_signal claims,
// verbatim-by-construction, and that the resulting payload clears validate-mint-payload.mjs (the real
// gate this payload must eventually pass) end to end.
import test from "node:test";
import assert from "node:assert/strict";
import {
  findResearchSlotSpan,
  extractResearchSlotFact,
  extractAlwaysPresentResearchFact,
  buildResearchRecordPayload,
  RESEARCH_FINDING_REQUIRED_SLOTS,
  RESEARCH_ALWAYS_PRESENT_SLOTS,
  RECORD_FACTS_RESEARCH_VERSION,
} from "./record-facts-research.mjs";
import { validateMintPayload } from "../../../scripts/mint/validate-mint-payload.mjs";

const SOURCE = { id: "src-1", url: "https://example-think-tank.org/reports/x", base_tier: 4, tier_override: null, status: "active" };
const SCREEN = { verdict: "on_vertical", provenance: "rule", basis: "registry category=research" };

const RICH_TEXT = `
Freight Decarbonisation Outlook 2026

This report finds that electric truck adoption in the EU grew 18% year over year in 2026, driven by
depot charging incentives.

Limitations of this study include a sample restricted to fleets over 50 vehicles and self-reported
utilisation data; further research is needed to confirm findings for smaller operators.

Policymakers should treat the 2029 depot-power bottleneck as the binding constraint on the current
adoption curve.

This report does not resolve whether hydrogen refuelling will reach cost parity before 2032.

Total abatement across the sampled fleets reached 2.4 MtCO2e in 2026.

This report was peer-reviewed by an independent editorial board and is consistent with prior research
on depot electrification published by national transport ministries.

This study was funded by the European Climate Foundation, a public grant body, and the authors declare
no conflicts of interest in the preparation of this report.
`;

const SPARSE_TEXT = `
Freight Decarbonisation Outlook 2026

A general survey of the sector with no specific findings stated in this excerpt.
`;

test("findResearchSlotSpan: locates each of the four required slots in rich prose", () => {
  assert.match(findResearchSlotSpan("finding", RICH_TEXT), /electric truck adoption/i);
  assert.match(findResearchSlotSpan("methodology_limits", RICH_TEXT), /limitations of this study/i);
  assert.match(findResearchSlotSpan("decision_relevance", RICH_TEXT), /policymakers should/i);
  assert.match(findResearchSlotSpan("does_not_resolve", RICH_TEXT), /does not resolve/i);
});

test("findResearchSlotSpan: key_figure requires a quantified span (digit + unit/%/currency)", () => {
  const span = findResearchSlotSpan("key_figure", RICH_TEXT);
  assert.ok(span, "expected a key_figure span");
  assert.match(span, /\d/);
});

test("findResearchSlotSpan: locates the two spec-03-§4 credibility signals in rich prose", () => {
  assert.match(findResearchSlotSpan("evidence_agreement_signal", RICH_TEXT), /peer-reviewed/i);
  assert.match(findResearchSlotSpan("source_authority_signal", RICH_TEXT), /funded by/i);
});

test("findResearchSlotSpan: returns null when nothing matches (honest absence, never invented)", () => {
  assert.equal(findResearchSlotSpan("finding", SPARSE_TEXT), null);
  assert.equal(findResearchSlotSpan("methodology_limits", SPARSE_TEXT), null);
  assert.equal(findResearchSlotSpan("key_figure", SPARSE_TEXT), null);
  assert.equal(findResearchSlotSpan("evidence_agreement_signal", SPARSE_TEXT), null);
  assert.equal(findResearchSlotSpan("source_authority_signal", SPARSE_TEXT), null);
});

test("extractResearchSlotFact: FACT's source_span is a verbatim substring of the captured text", () => {
  const fact = extractResearchSlotFact({ slotKey: "finding", capturedText: RICH_TEXT, sourceUrl: SOURCE.url });
  assert.equal(fact.claim_kind, "FACT");
  assert.equal(fact.slot_key, "finding");
  assert.ok(RICH_TEXT.toLowerCase().includes(fact.source_span.toLowerCase()));
});

test("extractResearchSlotFact: returns null (never a GAP) when no trigger matches", () => {
  assert.equal(extractResearchSlotFact({ slotKey: "finding", capturedText: SPARSE_TEXT, sourceUrl: SOURCE.url }), null);
});

test("extractAlwaysPresentResearchFact: FACT when a span is found, custom GAP text when not", () => {
  const fact = extractAlwaysPresentResearchFact({
    slotKey: "key_figure", capturedText: RICH_TEXT, sourceUrl: SOURCE.url, gapText: "no key figure yet",
  });
  assert.equal(fact.claim_kind, "FACT");
  assert.ok(RICH_TEXT.toLowerCase().includes(fact.source_span.toLowerCase()));

  const gap = extractAlwaysPresentResearchFact({
    slotKey: "key_figure", capturedText: SPARSE_TEXT, sourceUrl: SOURCE.url, gapText: "no key figure yet",
  });
  assert.equal(gap.claim_kind, "GAP");
  assert.equal(gap.source_span, null);
  assert.match(gap.claim_text, /no key figure yet/);
});

test("buildResearchRecordPayload: rich text upgrades all four required slots to FACT + the three always-present slots to FACT", () => {
  const payload = buildResearchRecordPayload({
    sourceUrl: SOURCE.url,
    title: "Freight Decarbonisation Outlook 2026",
    source: SOURCE,
    capturedText: RICH_TEXT,
    screen: SCREEN,
  });
  assert.equal(payload.item.item_type, "research_finding");
  assert.equal(payload.item.grade, "record");
  assert.deepEqual(payload.screen, SCREEN);

  const bySlot = Object.fromEntries(payload.claims.filter((c) => c.slot_key).map((c) => [c.slot_key, c]));
  for (const slot of RESEARCH_FINDING_REQUIRED_SLOTS) {
    assert.equal(bySlot[slot].claim_kind, "FACT", `${slot} should be upgraded to FACT`);
  }
  for (const slot of RESEARCH_ALWAYS_PRESENT_SLOTS) {
    assert.ok(bySlot[slot], `expected a ${slot} claim`);
    assert.equal(bySlot[slot].claim_kind, "FACT", `${slot} should be a FACT on rich text`);
  }

  // every FACT's source_span is embedded verbatim in full_brief (record-facts.mjs's own invariant,
  // preserved through the rebuild)
  const briefLower = payload.item.full_brief.toLowerCase();
  for (const c of payload.claims) {
    if (c.claim_kind === "FACT" && c.source_span) {
      assert.ok(briefLower.includes(c.source_span.trim().toLowerCase()), `full_brief missing span for ${c.slot_key}`);
    }
  }
  assert.match(payload._proof_note, new RegExp(RECORD_FACTS_RESEARCH_VERSION.replace(/\./g, "\\.")));
});

test("buildResearchRecordPayload: sparse text falls back to honest GAP claims for every slot, including the three always-present ones", () => {
  const payload = buildResearchRecordPayload({
    sourceUrl: SOURCE.url,
    title: "Freight Decarbonisation Outlook 2026",
    source: SOURCE,
    capturedText: SPARSE_TEXT,
    screen: SCREEN,
  });
  const bySlot = Object.fromEntries(payload.claims.filter((c) => c.slot_key).map((c) => [c.slot_key, c]));
  for (const slot of RESEARCH_FINDING_REQUIRED_SLOTS) {
    assert.equal(bySlot[slot].claim_kind, "GAP", `${slot} should stay an honest GAP`);
  }
  for (const slot of RESEARCH_ALWAYS_PRESENT_SLOTS) {
    assert.ok(bySlot[slot], `expected a ${slot} claim even when absent from the text (always present)`);
    assert.equal(bySlot[slot].claim_kind, "GAP", `${slot} should be an honest GAP on sparse text`);
    assert.equal(bySlot[slot].source_span, null);
  }
  assert.match(bySlot.key_figure.claim_text, /no key figure yet/);
});

test("buildResearchRecordPayload: only FACT/GAP claim kinds ever appear (record purity)", () => {
  const payload = buildResearchRecordPayload({
    sourceUrl: SOURCE.url, title: "T", source: SOURCE, capturedText: RICH_TEXT, screen: SCREEN,
  });
  for (const c of payload.claims) assert.ok(["FACT", "GAP"].includes(c.claim_kind));
});

test("buildResearchRecordPayload: rich-text payload clears validate-mint-payload.mjs end to end", () => {
  const payload = buildResearchRecordPayload({
    sourceUrl: SOURCE.url,
    title: "Freight Decarbonisation Outlook 2026",
    source: SOURCE,
    capturedText: RICH_TEXT,
    fetchedLength: RICH_TEXT.length,
    screen: SCREEN,
  });
  const result = validateMintPayload(payload);
  assert.deepEqual(result.failures, []);
  assert.equal(result.valid, true);
  assert.equal(result.recommended_status, "verified");
});

test("buildResearchRecordPayload: sparse (all-GAP) payload is REFUSED by the validator as record_hollow (operator ruling 2026-09-04: an item with no details is pointless; the builder's GAPs stay honest, the kit holds the row for re-extraction)", () => {
  const payload = buildResearchRecordPayload({
    sourceUrl: SOURCE.url,
    title: "Freight Decarbonisation Outlook 2026",
    source: SOURCE,
    capturedText: SPARSE_TEXT,
    fetchedLength: SPARSE_TEXT.length,
    screen: SCREEN,
  });
  const result = validateMintPayload(payload);
  assert.equal(result.valid, false);
  assert.deepEqual(result.failures.map((f) => [f.criterion, f.reason]), [[5, "record_hollow"]]);
});

test("buildResearchRecordPayload: missing/off-vertical screen is rejected by the validator's kit check", () => {
  const noScreen = buildResearchRecordPayload({
    sourceUrl: SOURCE.url, title: "T", source: SOURCE, capturedText: RICH_TEXT, screen: null,
  });
  const r1 = validateMintPayload(noScreen);
  assert.equal(r1.valid, false);
  assert.ok(r1.failures.some((f) => f.reason === "screen_verdict_missing"));

  const offVertical = buildResearchRecordPayload({
    sourceUrl: SOURCE.url, title: "T", source: SOURCE, capturedText: RICH_TEXT,
    screen: { verdict: "off_vertical", provenance: "rule", basis: "x" },
  });
  const r2 = validateMintPayload(offVertical);
  assert.equal(r2.valid, false);
  assert.ok(r2.failures.some((f) => f.reason === "screen_verdict_not_on_vertical"));
});

// KNOWN KIT-CHECK GAP (see RESEARCH-SWEEP.md and this lane's report): research-sweep.mjs's own
// screenForSource() stamps `provenance: "registry"` (docs/plans/wave2-lanes-2026-09-02.md's exact
// contract for research sources), but validate-mint-payload.mjs's screen kit check currently only
// accepts `provenance` "rule" or "reviewed" (that file, hasProvenance). This test pins the CURRENT,
// documented behavior — a "registry"-provenance payload is quarantined by screen_verdict_missing until
// the coordinator adds "registry" to that allowlist — so a future validator fix flips this test loudly
// rather than the gap going unnoticed.
test('buildResearchRecordPayload: provenance "registry" (research-sweep.mjs\'s own screen contract) is accepted by validate-mint-payload.mjs (coordinator allowlist change, 2026-09-03)', () => {
  const payload = buildResearchRecordPayload({
    sourceUrl: SOURCE.url, title: "T", source: SOURCE, capturedText: RICH_TEXT,
    screen: { verdict: "on_vertical", provenance: "registry", basis: "academic_research" },
  });
  const result = validateMintPayload(payload);
  assert.ok(!result.failures.some((f) => f.reason === "screen_verdict_missing"), JSON.stringify(result.failures));
});
