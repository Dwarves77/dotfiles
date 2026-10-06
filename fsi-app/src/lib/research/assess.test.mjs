// assess.test.mjs -- fixture coverage for every rule in assess.mjs's ladder (R1-R4), the maturity
// corridors, the split credibility reads, and the mandatory refusal state (spec-03 section 6). Plain
// `node --test`, zero dependencies, mirrors taxonomy.npmtest.mjs's own run style but this module has no
// npm import, so it runs under the no-npm discipline glob directly (no `.npmtest.mjs` suffix needed).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assessTechnicalMaturity,
  assessCommercialMaturity,
  assessHorizon,
  assessEvidenceScore,
  assessAuthorityScore,
  assessItem,
  extractDoiCandidate,
  resolveAuthoritySources,
  assessSignposts,
} from "./assess.mjs";

function baseInput(overrides = {}) {
  return {
    id: "item-1",
    itemType: "research_finding",
    addedDate: "2026-01-01T00:00:00Z",
    text: "",
    sourceTier: null,
    citationCount: null,
    biasTags: [],
    forwardEvents: [],
    ...overrides,
  };
}

// ── Technical maturity (TRL) ──────────────────────────────────────────────────────────────────────────

test("assessTechnicalMaturity reads TRL 10-11 from 'integrated into value chain'", () => {
  const input = baseInput({ text: "SAF is now integrated into the value chain for long-haul routes." });
  const m = assessTechnicalMaturity(input);
  assert.deepEqual([m.low, m.high], [10, 11]);
  assert.ok(m.evidenceIds.includes("item-1"));
});

test("assessTechnicalMaturity reads TRL 4-5 from 'lab-scale'", () => {
  const input = baseInput({ text: "The electrolyser remains at lab-scale testing." });
  const m = assessTechnicalMaturity(input);
  assert.deepEqual([m.low, m.high], [4, 5]);
});

test("assessTechnicalMaturity returns null (honest absence) when text names no maturity state", () => {
  const input = baseInput({ text: "A general discussion of freight decarbonisation policy." });
  assert.equal(assessTechnicalMaturity(input), null);
});

test("assessTechnicalMaturity never averages across the item text and a forward event -- first ladder match on the item's own text wins", () => {
  const input = baseInput({
    text: "Pilot fleet operating successfully.",
    forwardEvents: [{ id: "fe-1", kind: "x", event_date: null, obligation_text: "basic research phase only.", source_citation: null }],
  });
  const m = assessTechnicalMaturity(input);
  assert.deepEqual([m.low, m.high], [8, 9]); // from "Pilot fleet", never blended with the forward event's lower reading
  assert.deepEqual(m.evidenceIds, ["item-1"]); // the forward event's text matched a DIFFERENT band, so it is not corroborating evidence
});

// ── Commercial maturity (CRI) ─────────────────────────────────────────────────────────────────────────

test("assessCommercialMaturity reads CRI 6 from 'bankable asset class'", () => {
  const input = baseInput({ text: "Battery storage is now a bankable asset class in this market." });
  const m = assessCommercialMaturity(input);
  assert.deepEqual([m.low, m.high], [6, 6]);
});

test("assessCommercialMaturity reads CRI 3-4 from 'mandated'", () => {
  const input = baseInput({ text: "Deployment is mandated under the national policy." });
  const m = assessCommercialMaturity(input);
  assert.deepEqual([m.low, m.high], [3, 4]);
});

test("assessCommercialMaturity returns null when text names no commercial-maturity state", () => {
  assert.equal(assessCommercialMaturity(baseInput({ text: "An academic review of the literature." })), null);
});

// ── Horizon: R1 (dated statutory instrument) ──────────────────────────────────────────────────────────

test("assessHorizon R1 fires on a dated statutory instrument, band NOW, confidence high", () => {
  const now = new Date("2026-10-01T00:00:00Z");
  const input = baseInput({
    text: "ReFuelEU SAF blending steps apply to this route.",
    forwardEvents: [{ id: "fe-1", kind: "obligation", event_date: "2027-01-01", obligation_text: "ReFuelEU SAF blending mandate takes effect.", source_citation: null }],
  });
  const h = assessHorizon(input, null, now);
  assert.equal(h.rule, "R1");
  assert.equal(h.kind, "obligation");
  assert.equal(h.band, "NOW");
  assert.equal(h.confidence, "high");
  assert.match(h.triggerNote, /2027-01-01/);
});

test("assessHorizon R1 bands FAR for a statutory date more than 10 years out", () => {
  const now = new Date("2026-10-01T00:00:00Z");
  const input = baseInput({
    text: "EU ETS maritime phase-in reaches full scope eventually.",
    forwardEvents: [{ id: "fe-1", kind: "obligation", event_date: "2040-01-01", obligation_text: "EU ETS maritime full-scope phase-in.", source_citation: null }],
  });
  const h = assessHorizon(input, null, now);
  assert.equal(h.rule, "R1");
  assert.equal(h.band, "FAR");
});

// ── Horizon: R3 (named institutional roadmap) ─────────────────────────────────────────────────────────

test("assessHorizon R3 fires on a named roadmap body with a date, confidence medium", () => {
  const now = new Date("2026-10-01T00:00:00Z");
  const input = baseInput({
    text: "Hydrogen bunkering infrastructure is discussed in general terms.",
    forwardEvents: [{ id: "fe-1", kind: "milestone", event_date: "2030-06-01", obligation_text: null, source_citation: "IEA World Energy Outlook" }],
  });
  const h = assessHorizon(input, null, now);
  assert.equal(h.rule, "R3");
  assert.equal(h.kind, "availability");
  assert.equal(h.band, "NEAR");
  assert.equal(h.confidence, "medium");
  assert.match(h.triggerNote, /IEA/);
});

test("assessHorizon prefers R1 over R3 when both could fire", () => {
  const now = new Date("2026-10-01T00:00:00Z");
  const input = baseInput({
    text: "CBAM compliance date applies, per IEA commentary.",
    forwardEvents: [{ id: "fe-1", kind: "obligation", event_date: "2028-01-01", obligation_text: "CBAM compliance date.", source_citation: "IEA" }],
  });
  const h = assessHorizon(input, null, now);
  assert.equal(h.rule, "R1");
});

// ── Horizon: R4 (maturity-to-horizon prior, forced low confidence) ───────────────────────────────────

test("assessHorizon R4 fires from the technical-maturity prior when no dated evidence exists, confidence forced low", () => {
  const now = new Date("2026-10-01T00:00:00Z");
  const input = baseInput({ text: "The technology remains at bench-scale testing." });
  const technicalMaturity = assessTechnicalMaturity(input); // {low:4, high:5}
  const h = assessHorizon(input, technicalMaturity, now);
  assert.equal(h.rule, "R4");
  assert.equal(h.confidence, "low");
  assert.equal(h.band, "FAR"); // TRL low 4 -> FAR per the prior table
  assert.match(h.triggerNote, /inferred from maturity, no dated evidence/);
});

test("assessHorizon R4 prior maps TRL low>=10 to NOW, 8-9 to NEAR, 5-7 to MID, 1-4 to FAR", () => {
  const now = new Date("2026-10-01T00:00:00Z");
  const cases = [
    ["SAF is now integrated into the value chain for long-haul routes.", "NOW"],
    ["Pilot fleet operating successfully.", "NEAR"],
    ["A prototype is undergoing field trial.", "MID"],
    ["The electrolyser remains at lab-scale testing.", "FAR"],
  ];
  for (const [text, expectedBand] of cases) {
    const input = baseInput({ text });
    const tm = assessTechnicalMaturity(input);
    const h = assessHorizon(input, tm, now);
    assert.equal(h.band, expectedBand, `text=${text}`);
    assert.equal(h.rule, "R4");
  }
});

// ── Horizon: the mandatory refusal state (spec-03 section 6) ─────────────────────────────────────────

test("assessHorizon returns null (refusal) when R1/R3/R4 all decline", () => {
  const now = new Date("2026-10-01T00:00:00Z");
  const input = baseInput({ text: "General market commentary with no maturity or dated signal." });
  const h = assessHorizon(input, null, now);
  assert.equal(h, null);
});

test("assessItem surfaces the refusal as a first-class reason, never as a silently-omitted field", () => {
  const input = baseInput({ text: "General market commentary with no maturity or dated signal." });
  const a = assessItem(input, { now: new Date("2026-10-01T00:00:00Z") });
  assert.equal(a.horizon, null);
  assert.ok(a.refusalReason && a.refusalReason.length > 0);
  assert.match(a.refusalReason, /not forecastable/);
  assert.equal(a.statusToken, "HYPOTHESIS");
});

// ── Credibility: evidence score ───────────────────────────────────────────────────────────────────────

test("assessEvidenceScore: null citationCount -> null (not scored, never a guessed level)", () => {
  assert.equal(assessEvidenceScore(baseInput({ citationCount: null })), null);
});

test("assessEvidenceScore: 0 -> limited, 1-4 -> medium, 5+ -> robust", () => {
  assert.equal(assessEvidenceScore(baseInput({ citationCount: 0 })), "limited");
  assert.equal(assessEvidenceScore(baseInput({ citationCount: 3 })), "medium");
  assert.equal(assessEvidenceScore(baseInput({ citationCount: 9 })), "robust");
});

// ── Credibility: authority score (distribution, never a mean) ────────────────────────────────────────

test("assessAuthorityScore: null tier -> null (honest absence, never a guessed tier)", () => {
  assert.equal(assessAuthorityScore(baseInput({ sourceTier: null })), null);
});

test("assessAuthorityScore: tier 1-2 -> high-authority, 3-5 -> medium, 6-7 -> vendor-flagged (never excluded)", () => {
  assert.deepEqual(assessAuthorityScore(baseInput({ sourceTier: 1 })), { highAuthorityIndependent: 1, medium: 0, vendorFlagged: 0 });
  assert.deepEqual(assessAuthorityScore(baseInput({ sourceTier: 4 })), { highAuthorityIndependent: 0, medium: 1, vendorFlagged: 0 });
  assert.deepEqual(assessAuthorityScore(baseInput({ sourceTier: 7 })), { highAuthorityIndependent: 0, medium: 0, vendorFlagged: 1 });
});

// ── Credibility: authority score, the REAL wiring (lane L3, 2026-10-02) ─────────────────────────────

test("extractDoiCandidate finds a DOI-shaped substring in free text and strips trailing punctuation", () => {
  assert.equal(extractDoiCandidate("see DOI 10.1038/nature12373 for primary evidence."), "10.1038/nature12373");
  assert.equal(extractDoiCandidate("no identifier here at all"), null);
  assert.equal(extractDoiCandidate(""), null);
  assert.equal(extractDoiCandidate(null), null);
});

test("resolveAuthoritySources passes through well-formed input.sourceRecords and drops malformed entries", () => {
  const input = baseInput({ sourceRecords: [{ sourceId: "doi:x", kind: "openalex" }, { kind: "openalex" }, null] });
  const resolved = resolveAuthoritySources(input);
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].sourceId, "doi:x");
});

test("resolveAuthoritySources builds a grey-literature record from a forward event naming a roadmap body (reuses R3's own match, zero network)", () => {
  const input = baseInput({
    forwardEvents: [{ id: "fe-1", kind: "milestone", event_date: "2030-01-01", obligation_text: null, source_citation: "IEA World Energy Outlook" }],
  });
  const resolved = resolveAuthoritySources(input);
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].kind, "grey_literature");
  assert.match(resolved[0].displayName, /IEA/);
  assert.equal(resolved[0].institutionalMandate, undefined, "never asserts the stronger institutional-mandate claim from a bare citation");
});

test("assessAuthorityScore computes the REAL multi-component distribution from a producer-resolved OpenAlex record, not the degenerate tier fallback", () => {
  const input = baseInput({
    sourceTier: 7, // a vendor-tier source on the item itself -- must NOT be what drives the result once a real record resolves
    sourceRecords: [
      {
        sourceId: "doi:10.1038/nature12373",
        kind: "openalex",
        institution: { displayName: "Harvard University", type: "education" },
        work: { publicationDate: "2013-07-30", fwci: 48.9515, citedByCount: 1983, isRetracted: false },
        funding: null,
      },
    ],
  });
  const result = assessAuthorityScore(input);
  // funding is null/unresolved -> 'unknown', which caps a university-role source at 'medium', never
  // 'highAuthorityIndependent' on an unverified funding state (the three-state rule, never collapsed).
  assert.deepEqual(result, { highAuthorityIndependent: 0, medium: 1, vendorFlagged: 0, unknown: 0, integrityFlagged: 0, sources: result.sources });
  assert.equal(result.sources[0].roleClass, "university");
  // Never a mean, and never equal to the degenerate tier-7 vendor-flagged shape that would have fired
  // had this lane not wired the real computation in.
  assert.notEqual(result.vendorFlagged, 1);
});

test("assessAuthorityScore falls back to the ORIGINAL degenerate tier read when nothing resolves (no DOI record, no named roadmap body) -- unchanged for every existing caller", () => {
  const input = baseInput({ sourceTier: 2, text: "No DOI and no roadmap body named anywhere in this text." });
  assert.deepEqual(assessAuthorityScore(input), { highAuthorityIndependent: 1, medium: 0, vendorFlagged: 0 });
});

test("assessAuthorityScore combines a resolved OpenAlex record AND a named-roadmap grey-literature record into one distribution, never a mean", () => {
  const input = baseInput({
    sourceRecords: [{ sourceId: "doi:x", kind: "openalex", institution: { displayName: "Acme Corp", type: "company" }, work: null, funding: null }],
    forwardEvents: [{ id: "fe-1", kind: "milestone", event_date: "2030-01-01", obligation_text: null, source_citation: "IMO" }],
  });
  const result = assessAuthorityScore(input);
  assert.equal(result.vendorFlagged, 1); // the OpenAlex vendor record
  assert.equal(result.medium, 1); // the IMO grey-literature record (intergovernmental role, funding unknown -> capped at medium)
  assert.equal(result.sources.length, 2);
});

// ── assessItem: full assembly, status-token discipline (CLAUDE.md rule 14) ──────────────────────────

test("assessItem labels an R1-anchored read CONFIRMED", () => {
  const input = baseInput({
    text: "ReFuelEU SAF blending steps apply.",
    forwardEvents: [{ id: "fe-1", kind: "obligation", event_date: "2027-01-01", obligation_text: "ReFuelEU mandate.", source_citation: null }],
  });
  const a = assessItem(input, { now: new Date("2026-10-01T00:00:00Z") });
  assert.equal(a.horizon.rule, "R1");
  assert.equal(a.statusToken, "CONFIRMED");
});

test("assessItem labels an R4-anchored (inferred) read HYPOTHESIS, never CONFIRMED", () => {
  const input = baseInput({ text: "The electrolyser remains at lab-scale testing." });
  const a = assessItem(input, { now: new Date("2026-10-01T00:00:00Z") });
  assert.equal(a.horizon.rule, "R4");
  assert.equal(a.statusToken, "HYPOTHESIS");
});

test("assessItem never fabricates a maturity corridor, horizon, or credibility score absent supporting data", () => {
  const input = baseInput({ text: "A one-line note with no classifiable content." });
  const a = assessItem(input, { now: new Date("2026-10-01T00:00:00Z") });
  assert.equal(a.technicalMaturity, null);
  assert.equal(a.commercialMaturity, null);
  assert.equal(a.horizon, null);
  assert.ok(a.refusalReason);
  assert.equal(a.credibilityEvidenceScore, null);
  assert.equal(a.credibilityAuthorityScore, null);
});

// ── assessSignposts: the dated expectation an assessment states, as machine-watchable signposts (L4-D) ──

const SIGNPOST_NOW = new Date("2026-10-01T00:00:00Z");
const datedItem = (over = {}) =>
  baseInput({
    entityId: "cl:instrument:00000000000000aa",
    text: "ReFuelEU SAF blending steps apply to this route.",
    forwardEvents: [{ id: "fe-1", kind: "obligation", event_date: "2027-01-01", obligation_text: "ReFuelEU SAF blending mandate takes effect.", source_citation: null }],
    ...over,
  });

test("assessHorizon R1 and R3 name the forward event they anchored on; R4 names none", () => {
  const r1 = assessHorizon(datedItem(), null, SIGNPOST_NOW);
  assert.deepEqual(r1.anchor, { eventId: "fe-1", eventDate: "2027-01-01" });
  const r3 = assessHorizon(
    baseInput({ forwardEvents: [{ id: "fe-9", kind: "milestone", event_date: "2030-06-01", obligation_text: null, source_citation: "IEA World Energy Outlook" }] }),
    null,
    SIGNPOST_NOW,
  );
  assert.deepEqual(r3.anchor, { eventId: "fe-9", eventDate: "2030-06-01" });
  const r4 = assessHorizon(baseInput({ text: "lab-scale electrolyser" }), { low: 4, high: 5 }, SIGNPOST_NOW);
  assert.equal(r4.anchor, undefined);
});

test("one dated expectation about an entity yields exactly one signpost: watches the entity, movement by the date, direction confirms", () => {
  const a = assessItem(datedItem(), { now: SIGNPOST_NOW });
  assert.equal(a.signposts.length, 1);
  const sp = a.signposts[0];
  assert.equal(sp.watches, "cl:instrument:00000000000000aa");
  assert.equal(sp.direction, "confirms");
  assert.equal(sp.forwardEventId, "fe-1");
  assert.equal(sp.itemId, "item-1");
  assert.deepEqual(sp.predicate, {
    op: "date_passed", field: "occurred_at", by: "2027-01-01", basis: "movement_by_date", horizon_rule: "R1", forward_event_id: "fe-1",
  });
  assert.match(sp.seed, /item-1/);
  assert.match(sp.seed, /fe-1/);
});

test("the signpost seed is stable across runs (idempotent identity) and differs per forward event", () => {
  const a = assessSignposts(datedItem(), assessHorizon(datedItem(), null, SIGNPOST_NOW), SIGNPOST_NOW);
  const b = assessSignposts(datedItem(), assessHorizon(datedItem(), null, SIGNPOST_NOW), SIGNPOST_NOW);
  assert.equal(a[0].seed, b[0].seed);
  const other = datedItem({ forwardEvents: [{ id: "fe-2", kind: "obligation", event_date: "2027-01-01", obligation_text: "ReFuelEU SAF blending mandate takes effect.", source_citation: null }] });
  assert.notEqual(assessSignposts(other, assessHorizon(other, null, SIGNPOST_NOW), SIGNPOST_NOW)[0].seed, a[0].seed);
});

test("no signpost without an entity to watch, without a dated anchor (R4), or for a date already past", () => {
  assert.deepEqual(assessItem(datedItem({ entityId: null }), { now: SIGNPOST_NOW }).signposts, []);
  assert.deepEqual(assessItem(baseInput({ entityId: "cl:instrument:00000000000000aa", text: "lab-scale electrolyser" }), { now: SIGNPOST_NOW }).signposts, []);
  assert.deepEqual(assessItem(datedItem(), { now: new Date("2027-06-01T00:00:00Z") }).signposts, []);
});

test("a refusal (nothing to band) carries no signposts", () => {
  const a = assessItem(baseInput({ entityId: "cl:instrument:00000000000000aa", text: "A one-line note." }), { now: SIGNPOST_NOW });
  assert.equal(a.horizon, null);
  assert.deepEqual(a.signposts, []);
});
