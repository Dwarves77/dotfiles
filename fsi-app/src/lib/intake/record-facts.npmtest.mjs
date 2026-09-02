// @ts-check
// record-facts.mjs coverage (Lane POP, 2026-09-01). Proves: verbatim spans located from real trigger
// phrases, honest GAP fallback when nothing is found, the assertVerbatim guard actually throws on a
// non-verbatim span, record-purity (FACT/GAP only), Gate-A safety by construction (every figure/date
// token in full_brief is present in the same FACT-claim corpus Gate A scans against), and a full
// buildRecordPayload run validated against the REAL validate-mint-payload.mjs gate (not a re-derived
// approximation of it).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isProseSpan,
  RECORD_FACTS_VERSION,
  assertVerbatim,
  findSlotSpan,
  extractIdentityFact,
  extractSlotFact,
  buildRecordFacts,
  buildRecordFullBrief,
  buildRecordPayload,
} from "./record-facts.mjs";
import { validateMintPayload } from "../../../scripts/mint/validate-mint-payload.mjs";
import { extractFactualTokens } from "../../../scripts/mint/lib/gate-a-scan.mjs";
import { containsToken } from "../../../scripts/mint/lib/gate-a-match.mjs";

test("RECORD_FACTS_VERSION is a non-empty string", () => {
  assert.equal(typeof RECORD_FACTS_VERSION, "string");
  assert.ok(RECORD_FACTS_VERSION.length > 0);
});

test("assertVerbatim: accepts a case-insensitive substring, rejects anything else", () => {
  assert.equal(assertVerbatim("The Rule enters into Force on 1 January 2027.", "enters into force"), "enters into force");
  assert.throws(() => assertVerbatim("abc", "xyz"), /not a verbatim/);
  assert.throws(() => assertVerbatim("abc", ""), /empty source_span/);
  assert.throws(() => assertVerbatim("abc", null), /empty source_span/);
});

test("findSlotSpan: locates a real trigger phrase verbatim, returns null when absent", () => {
  const text = "This Regulation shall enter into force on the 20th day following its publication.";
  const span = findSlotSpan("effective_date", text);
  assert.ok(span, "must find a span");
  assert.ok(text.toLowerCase().includes(span.toLowerCase()));
  assert.equal(findSlotSpan("effective_date", "No relevant language here."), null);
  assert.equal(findSlotSpan("nonexistent_slot_key", text), null, "a slot with no trigger entry always falls back to null (-> GAP)");
});

test("findSlotSpan: skips page chrome and returns the first PROSE match — mint-run-008's legislation.gov.uk menu line", () => {
  const menu = "Browse Legislation\nEuropean Union Treaties -------------------------------------\nUK Statutory Instruments\n";
  const body = "These Regulations apply to lighting products placed on the market in Great Britain. Member States may not refuse EEC type approval for vehicles which conform.";
  assert.equal(findSlotSpan("jurisdictional_scope", menu), null);
  const span = findSlotSpan("jurisdictional_scope", menu + body);
  assert.ok(span && !/-{4}/.test(span), span);
  assert.ok(/member states may not refuse/i.test(span), span);
  assert.equal(isProseSpan("European Union Treaties -------------"), false);
  assert.equal(isProseSpan("European Union"), false);
  assert.equal(isProseSpan("applies to lighting products placed on the market"), true);
});

test("extractIdentityFact: title located verbatim -> FACT with slot_key 'title'; absent -> null (never fabricated)", () => {
  const capturedText = "COUNCIL DECISION of 30 March 2009 endorsing the SESAR Master Plan. Full text follows.";
  const fact = extractIdentityFact({
    title: "COUNCIL DECISION of 30 March 2009 endorsing the SESAR Master Plan",
    capturedText,
    sourceUrl: "https://example.eu/x",
  });
  assert.equal(fact.claim_kind, "FACT");
  assert.equal(fact.slot_key, "title");
  assert.ok(capturedText.toLowerCase().includes(fact.source_span.toLowerCase()));

  const missing = extractIdentityFact({ title: "A title nowhere in the text", capturedText, sourceUrl: "x" });
  assert.equal(missing, null);
  assert.equal(extractIdentityFact({ title: null, capturedText, sourceUrl: "x" }), null);
});

test("extractSlotFact: FACT when the trigger matches, honest templated GAP when it does not", () => {
  const withMatch = extractSlotFact({
    slotKey: "penalty_summary",
    capturedText: "Member States shall lay down rules on penalties applicable to infringements.",
    sourceUrl: "https://example.eu/x",
  });
  assert.equal(withMatch.claim_kind, "FACT");
  assert.equal(withMatch.slot_key, "penalty_summary");
  assert.match(withMatch.claim_text, /\[penalty_summary\]/);

  const noMatch = extractSlotFact({ slotKey: "penalty_summary", capturedText: "Nothing relevant here.", sourceUrl: "x" });
  assert.equal(noMatch.claim_kind, "GAP");
  assert.equal(noMatch.source_span, null);
  assert.equal(noMatch.source_url, null);
  assert.match(noMatch.claim_text, /No verbatim penalty summary statement/);
});

test("buildRecordFacts: record-purity — every emitted claim is FACT or GAP, never ANALYSIS/LEGAL/DERIVED", () => {
  const capturedText =
    "COUNCIL DECISION of 30 March 2009. This Decision shall enter into force on 1 April 2009. " +
    "Member States shall lay down rules on penalties. No later than 1 January 2011, a report is due. Applies to all operators.";
  const claims = buildRecordFacts({
    title: "COUNCIL DECISION of 30 March 2009",
    sourceUrl: "https://example.eu/x",
    capturedText,
    requiredSlots: ["effective_date", "jurisdictional_scope", "penalty_summary", "primary_deadline"],
  });
  assert.ok(claims.length >= 4);
  for (const c of claims) {
    assert.ok(["FACT", "GAP"].includes(c.claim_kind), `record-purity violated by claim_kind=${c.claim_kind}`);
  }
});

test("buildRecordFullBrief: Gate-A safety by construction — every figure/date token is backed by the same FACT-claim corpus", () => {
  const capturedText =
    "This Regulation shall enter into force on 1 January 2027. Fees of EUR 50 apply. " +
    "No later than 1 January 2030, Member States shall submit a report. 33% of vessels are affected.";
  const claims = buildRecordFacts({
    title: "Test Regulation",
    sourceUrl: "https://example.eu/x",
    capturedText,
    requiredSlots: ["effective_date", "primary_deadline"],
  });
  const fullBrief = buildRecordFullBrief({ sourceUrl: "https://example.eu/x", claims });
  assert.match(fullBrief, /Catalogue record: extracted facts only, full brief pending/);

  const factClaims = claims.filter((c) => c.claim_kind === "FACT").map((c) => ({ claim_text: c.claim_text, source_span: c.source_span }));
  const corpus = factClaims.map((c) => `${c.claim_text} ${c.source_span}`).join(" ");
  const { figures, deadlines } = extractFactualTokens(fullBrief);
  for (const tk of [...figures, ...deadlines]) {
    assert.ok(containsToken(corpus, tk), `Gate-A token "${tk}" in full_brief must be backed by the FACT-claim corpus`);
  }
});

test("buildRecordPayload: end-to-end payload clears the REAL validate-mint-payload.mjs gate (C1-C7 + kit checks)", () => {
  const capturedText =
    "COUNCIL DECISION 2009/320/EC of 30 March 2009 endorsing the SESAR Master Plan. " +
    "This Decision shall enter into force on the 20th day following its publication in the Official Journal. " +
    "This Decision is addressed to the Member States. " +
    "No later than 31 December 2011, the Commission shall submit a report. " +
    "Member States shall lay down rules on penalties applicable to infringements.";
  const payload = buildRecordPayload({
    sourceUrl: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32009D0320",
    itemType: "framework",
    title: "COUNCIL DECISION 2009/320/EC of 30 March 2009 endorsing the SESAR Master Plan",
    instrumentIdentifier: "2009/320/EC",
    canonicalInstrumentKey: "CELEX:32009D0320",
    jurisdictionIso: "EU",
    source: {
      id: "src-1",
      url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32009D0320",
      base_tier: 1,
      tier_override: null,
      status: "active",
      institution_id: null,
    },
    capturedText,
    requiredSlots: ["effective_date", "jurisdictional_scope", "penalty_summary", "primary_deadline"],
  });

  assert.equal(payload.item.grade, "record");
  assert.equal(payload.claims.every((c) => ["FACT", "GAP"].includes(c.claim_kind)), true);

  const result = validateMintPayload(payload, { baseDir: process.cwd() });
  assert.deepEqual(result.failures, [], `record payload must clear validate-mint-payload.mjs with zero failures: ${JSON.stringify(result.failures, null, 2)}`);
  assert.equal(result.valid, true);
  assert.equal(result.recommended_status, "verified");
});

test("buildRecordPayload: throws on missing required inputs rather than minting a hollow payload", () => {
  const good = {
    sourceUrl: "https://example.eu/x",
    itemType: "framework",
    title: "T",
    source: { id: "s1", url: "https://example.eu/x", base_tier: 1, tier_override: null, status: "active" },
    capturedText: "Some captured text.",
    requiredSlots: [],
  };
  assert.throws(() => buildRecordPayload({ ...good, sourceUrl: undefined }), /requires sourceUrl/);
  assert.throws(() => buildRecordPayload({ ...good, itemType: undefined }), /requires itemType/);
  assert.throws(() => buildRecordPayload({ ...good, title: undefined }), /requires title/);
  assert.throws(() => buildRecordPayload({ ...good, source: undefined }), /requires a registered source/);
  assert.throws(() => buildRecordPayload({ ...good, capturedText: "" }), /requires non-empty capturedText/);
});
