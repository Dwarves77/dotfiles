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
  hasOnlyBareDomainUrls,
  RECORD_FACTS_VERSION,
  assertVerbatim,
  findSlotSpan,
  extractIdentityFact,
  extractSlotFact,
  buildRecordFacts,
  buildRecordFullBrief,
  buildRecordPayload,
  findBindingPositionMatch,
  extractBindingPositionFact,
  inferDatePrecision,
  findDueDateMatch,
  extractDueDateFact,
  findCorridorMatch,
  extractCorridorFact,
  isEurlexHost,
  findInForceStatusMatch,
  extractInForceStatusFact,
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

// lane URL-GUIL (2026-09-03, population run #16, mint-run-018, row 429c85d2). Before this lane's fix,
// jurisdictional_scope's "...the european union..." trigger's plain `[^.;\n]{0,90}` continuation stopped
// at a URL's OWN domain dot (indistinguishable from a sentence-ending period to that class), truncating a
// located span mid-domain. The window is now URL-safe (a whole `\S+` URL run is consumed atomically before
// falling back to the terminator-excluding class) -- proven here with a URL that carries a real path/query
// (a genuine document citation, not a bare "see the website" pointer -- see the bare-domain-URL guard test
// below, which covers the ACTUAL row 429c85d2/a980a0b9 text, where the URL-GUIL fix's own fixture turned
// out to still be a boilerplate pointer the lane URL-BOILER guard now correctly rejects for a different
// reason; both fixes are real and independent, see that file's header).
test("findSlotSpan: a URL inside the matched window is never truncated at its own domain dot", () => {
  const text =
    "A copy of the Directives referred to in this Explanatory Note may be viewed in the Official " +
    "Journal of the European Union via the EUR-lex website at " +
    "http://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32013R0575 . Merchant " +
    "Shipping Notices are published by the Maritime and Coastguard Agency.";
  const span = findSlotSpan("jurisdictional_scope", text);
  assert.ok(span, "must find a span");
  assert.ok(
    span.includes("http://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32013R0575"),
    `span must carry the FULL url, not a domain-dot truncation: ${JSON.stringify(span)}`,
  );
  assert.ok(!span.endsWith("http://eur-lex"), `span must not stop mid-domain: ${JSON.stringify(span)}`);
  assert.ok(text.toLowerCase().includes(span.toLowerCase()), "still verbatim-by-construction");
});

// lane URL-BOILER (2026-09-04, population runs #17/#18, mint-run-020/021, rows 429c85d2 (UK SI 2013/816)
// and a980a0b9 (UK SI 2012/2567)). Once URL-GUIL's truncation fix let the URL through WHOLE, both rows
// still failed criterion 2 with `ungrounded_url: http://eur-lex.europa.eu` -- because the ONLY url in the
// matched span is a bare EUR-Lex root with no path, and canonicalize_citation_url never normalizes
// http-vs-https, so it grounds against nothing (confirmed live: the one registered EUR-Lex source is
// `https://eur-lex.europa.eu/`, a different scheme). The real defect is upstream of grounding: this exact
// boilerplate sentence -- "may be viewed in the Official Journal of the European Union via the EUR-Lex
// website at <bare url>" -- tells the reader where to go look up EU law in general; it is not a statement
// of this instrument's own jurisdictional scope and should never have been accepted as a FACT span.
test("findSlotSpan: a span whose only URL is a bare-domain pointer is rejected, not accepted as a FACT (row 429c85d2's real boilerplate)", () => {
  const text =
    "A copy of the Directives referred to in this Explanatory Note may be viewed in the Official " +
    "Journal of the European Union via the EUR-lex website at http://eur-lex.europa.eu . Merchant " +
    "Shipping Notices are published by the Maritime and Coastguard Agency.";
  assert.equal(
    findSlotSpan("jurisdictional_scope", text),
    null,
    "the bare-domain 'see the website' sentence carries no scope fact and must fall through to GAP",
  );
});

test("hasOnlyBareDomainUrls: true for a bare root (with or without trailing slash), false for a URL with a real path/query or no URL at all", () => {
  assert.equal(hasOnlyBareDomainUrls("see http://eur-lex.europa.eu"), true);
  assert.equal(hasOnlyBareDomainUrls("see http://eur-lex.europa.eu/"), true);
  assert.equal(hasOnlyBareDomainUrls("see https://EUR-LEX.europa.eu"), true, "scheme/case do not matter -- only path/query/hash do");
  assert.equal(
    hasOnlyBareDomainUrls("see http://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32013R0575"),
    false,
    "a real document path disqualifies the guard -- this is a genuine citation",
  );
  assert.equal(hasOnlyBareDomainUrls("applies to lighting products placed on the market"), false, "no URL at all -- not disqualified by this guard");
  assert.equal(isProseSpan("see http://eur-lex.europa.eu"), false, "wired into isProseSpan, the shared guard every extractor above uses");
});

test("findDueDateMatch / findBindingPositionMatch: the same URL-safe continuation applies to every SLOT_TRIGGERS-style trigger family", () => {
  const dueDateText =
    "Compliance is due by 1 January 2027 as confirmed at http://example.gov/notice.pdf . Further guidance follows.";
  const dueSpan = findDueDateMatch(dueDateText);
  assert.ok(dueSpan && dueSpan.includes("http://example.gov/notice.pdf"), JSON.stringify(dueSpan));
  assert.ok(!dueSpan.endsWith("http://example.gov/notice"), `must not truncate mid-domain: ${JSON.stringify(dueSpan)}`);

  const bindingText =
    "The operator shall comply as set out at http://example.gov/rule.pdf . Nothing further applies.";
  const bindingMatch = findBindingPositionMatch(bindingText);
  assert.ok(bindingMatch && bindingMatch.span.includes("http://example.gov/rule.pdf"), JSON.stringify(bindingMatch));
});


test("record payload whose span opens with a curly quote clears the validator's unicode-integrity scan (run #9: straight-quote delimiters collided with the source's own “ ”)", () => {
  const capturedText = "In regulation 3, for “Member States”, in each place where the words occur, there is substituted “the Secretary of State”. These Regulations apply to England.";
  const payload = buildRecordPayload({
    rowId: "r1", title: "The National Emission Ceilings Regulations 2018", sourceUrl: "https://www.legislation.gov.uk/uksi/2018/129",
    itemType: "regulation", jurisdictionIso: "GB", priority: "MODERATE", capturedText: "The National Emission Ceilings Regulations 2018. " + capturedText,
    source: { id: "s", url: "https://legislation.gov.uk/", base_tier: 1, tier_override: null, status: "active", institution_id: null },
    requiredSlots: ["jurisdictional_scope", "effective_date", "penalty_summary", "primary_deadline"],
  });
  const scope = payload.claims.find((c) => c.slot_key === "jurisdictional_scope");
  assert.equal(scope.claim_kind, "FACT");
  assert.match(scope.claim_text, /«/);
  const r = validateMintPayload(payload);
  assert.deepEqual(r.failures.filter((f) => f.reason === "prose_unicode_substitution"), [], JSON.stringify(r.failures));
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
    // Lane WSEQ (2026-09-02): validate-mint-payload.mjs's kit check now requires a grade='record' payload
    // to carry its own screen verdict (screen_verdict_missing otherwise) — see that module's own header.
    screen: { verdict: "on_vertical", provenance: "rule", basis: "EU framework decision, core vertical" },
  });

  assert.equal(payload.item.grade, "record");
  assert.deepEqual(payload.screen, { verdict: "on_vertical", provenance: "rule", basis: "EU framework decision, core vertical" });
  assert.equal(payload.claims.every((c) => ["FACT", "GAP"].includes(c.claim_kind)), true);

  const result = validateMintPayload(payload, { baseDir: process.cwd() });
  assert.deepEqual(result.failures, [], `record payload must clear validate-mint-payload.mjs with zero failures: ${JSON.stringify(result.failures, null, 2)}`);
  assert.equal(result.valid, true);
  assert.equal(result.recommended_status, "verified");
});

// ── Lane INTAKE (2026-09-02): binding_position, due_date/date_precision, corridor_identity, research
//    credibility signals — the five fields OBLIG/CORR/DASH read on every record-grade item minted after
//    this wave. ──

test("findBindingPositionMatch: locates a direct_duty phrase verbatim, real vocab code, returns null when absent", () => {
  const text = "The freight forwarder shall register with the competent authority within 30 days of this Regulation entering into force.";
  const m = findBindingPositionMatch(text);
  assert.ok(m, "must find a match");
  assert.equal(m.code, "direct_duty");
  assert.ok(text.toLowerCase().includes(m.span.toLowerCase()));
  assert.equal(findBindingPositionMatch("No relevant applicability language here at all."), null);
});

test("findBindingPositionMatch: priority order — direct_duty wins over a later monitoring_only phrase in the same text", () => {
  const text =
    "The freight forwarder shall submit an annual report to the competent authority. " +
    "This provision does not currently apply to non-EU operators.";
  const m = findBindingPositionMatch(text);
  assert.equal(m.code, "direct_duty");
});

test("extractBindingPositionFact: FACT carries the resolved code and a verbatim span; GAP when nothing matches", () => {
  const withMatch = extractBindingPositionFact({
    capturedText: "The carrier shall ensure the vessel meets the emission intensity target for the reporting period.",
    sourceUrl: "https://example.eu/x",
  });
  assert.equal(withMatch.claim_kind, "FACT");
  assert.equal(withMatch.binding_position, "carrier_passthrough");
  assert.match(withMatch.claim_text, /\[binding_position\]/);
  assert.match(withMatch.claim_text, /carrier_passthrough/);

  const noMatch = extractBindingPositionFact({ capturedText: "Nothing relevant here.", sourceUrl: "x" });
  assert.equal(noMatch.claim_kind, "GAP");
  assert.equal(noMatch.binding_position, null);
  assert.equal(noMatch.source_span, null);
});

test("inferDatePrecision: classifies day/month/quarter/year from the span's own shape; day wins over the bare-year fallback", () => {
  assert.equal(inferDatePrecision("no later than 1 January 2027"), "day");
  assert.equal(inferDatePrecision("no later than 2027-01-01"), "day");
  assert.equal(inferDatePrecision("by the end of the first quarter of 2027"), "quarter");
  assert.equal(inferDatePrecision("due by Q1 2027"), "quarter");
  assert.equal(inferDatePrecision("due by January 2027"), "month");
  assert.equal(inferDatePrecision("due by 2027"), "year");
  assert.equal(inferDatePrecision("within 30 days of publication"), null, "a duration carries no calendar-date shape");
});

test("findDueDateMatch / extractDueDateFact: locates a verbatim due-date span with its precision; honest GAP otherwise", () => {
  const text = "Operators shall comply no later than 1 January 2027 with the reporting obligation.";
  const span = findDueDateMatch(text);
  assert.ok(span && text.toLowerCase().includes(span.toLowerCase()));

  const fact = extractDueDateFact({ capturedText: text, sourceUrl: "https://example.eu/x" });
  assert.equal(fact.claim_kind, "FACT");
  assert.equal(fact.date_precision, "day");
  assert.match(fact.claim_text, /\[due_date\]/);
  assert.match(fact.claim_text, /date_precision: day/);

  const gap = extractDueDateFact({ capturedText: "No date language here.", sourceUrl: "x" });
  assert.equal(gap.claim_kind, "GAP");
  assert.equal(gap.date_precision, null);
});

test("findCorridorMatch / extractCorridorFact: both ends + mode stated -> FACT with the ORIGIN-DEST:mode seed; one end missing -> honest GAP", () => {
  const text = "Ocean freight rates on the CNSHA-NLRTM lane rose 12% this quarter amid Red Sea diversions.";
  const match = findCorridorMatch(text);
  assert.ok(match, "must find a corridor match");
  assert.equal(match.origin, "CNSHA");
  assert.equal(match.dest, "NLRTM");
  assert.equal(match.mode, "ocean");

  const fact = extractCorridorFact({ capturedText: text, sourceUrl: "https://example.com/x" });
  assert.equal(fact.claim_kind, "FACT");
  assert.equal(fact.corridor_identity.origin_locode, "CNSHA");
  assert.equal(fact.corridor_identity.dest_locode, "NLRTM");
  assert.equal(fact.corridor_identity.mode, "ocean");
  assert.equal(fact.corridor_identity.seed, "CNSHA-NLRTM:ocean");
  assert.match(fact.claim_text, /\[corridor_identity\]/);

  // "sea" is an input alias for the canonical "ocean" token (vocabularies.mjs MODE_ALIASES) -- proves
  // normaliseMode is actually wired through, not a private re-implementation.
  const aliasFact = extractCorridorFact({
    capturedText: "The CNSHA-NLRTM sea lane is the busiest route this quarter.",
    sourceUrl: "x",
  });
  assert.equal(aliasFact.corridor_identity.mode, "ocean");

  const gap = extractCorridorFact({ capturedText: "The CNSHA port saw record volumes this quarter.", sourceUrl: "x" });
  assert.equal(gap.claim_kind, "GAP");
  assert.equal(gap.corridor_identity, null);
});

test("buildRecordFacts: itemType threading is backward compatible -- omitting it adds none of the optional family claims", () => {
  const text = "The freight forwarder shall register no later than 1 January 2027. This Regulation applies to Member States.";
  const withoutItemType = buildRecordFacts({ title: "T", sourceUrl: "https://x", capturedText: text, requiredSlots: ["effective_date"] });
  assert.equal(withoutItemType.some((c) => c.slot_key === "binding_position"), false);
  assert.equal(withoutItemType.some((c) => c.slot_key === "due_date"), false);

  const withRegulationType = buildRecordFacts({ title: "T", sourceUrl: "https://x", capturedText: text, requiredSlots: ["effective_date"], itemType: "regulation" });
  const binding = withRegulationType.find((c) => c.slot_key === "binding_position");
  const due = withRegulationType.find((c) => c.slot_key === "due_date");
  assert.ok(binding, "regulation-family itemType adds an optional binding_position claim even though it is not in requiredSlots");
  assert.equal(binding.claim_kind, "FACT");
  assert.ok(due, "regulation-family itemType adds an optional due_date claim even though it is not in requiredSlots");

  // Outside every family (e.g. technology): neither optional addition fires.
  const withTechnologyType = buildRecordFacts({ title: "T", sourceUrl: "https://x", capturedText: text, requiredSlots: [], itemType: "technology" });
  assert.equal(withTechnologyType.some((c) => c.slot_key === "binding_position"), false);
  assert.equal(withTechnologyType.some((c) => c.slot_key === "corridor_identity"), false);
});

test("buildRecordFacts: a slot already in requiredSlots is never duplicated by the optional-family addition", () => {
  const claims = buildRecordFacts({
    title: "T",
    sourceUrl: "https://x",
    capturedText: "The freight forwarder shall register no later than 1 January 2027.",
    requiredSlots: ["binding_position", "due_date"],
    itemType: "guidance",
  });
  assert.equal(claims.filter((c) => c.slot_key === "binding_position").length, 1);
  assert.equal(claims.filter((c) => c.slot_key === "due_date").length, 1);
});

test("buildRecordPayload: regulation family lifts binding_position/due_date/date_precision onto item, clears the REAL validator, and does not disturb the existing 4-slot required coverage", () => {
  const capturedText =
    "COMMISSION REGULATION 2026/1234 of 1 April 2026. " +
    "This Regulation shall enter into force on the 20th day following its publication. " +
    "This Regulation applies to Member States. " +
    "The freight forwarder shall register with the competent authority no later than 1 January 2027. " +
    "Member States shall lay down rules on penalties applicable to infringements.";
  const payload = buildRecordPayload({
    sourceUrl: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32026R1234",
    itemType: "regulation",
    title: "COMMISSION REGULATION 2026/1234 of 1 April 2026",
    source: {
      id: "src-1",
      url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32026R1234",
      base_tier: 1,
      tier_override: null,
      status: "active",
      institution_id: null,
    },
    capturedText,
    requiredSlots: ["effective_date", "jurisdictional_scope", "penalty_summary", "primary_deadline"],
    screen: { verdict: "on_vertical", provenance: "rule", basis: "EU regulation, core vertical" },
  });

  assert.equal(payload.item.binding_position, "direct_duty");
  assert.equal(payload.item.date_precision, "day");
  assert.ok(payload.item.due_date && payload.item.due_date.toLowerCase().includes("1 january 2027"));
  assert.equal(payload.item.corridor_identity, null, "not a market item -- no corridor extraction attempted");
  assert.equal(payload.item.research_credibility, null, "not a research item -- no credibility extraction attempted");

  const result = validateMintPayload(payload, { baseDir: process.cwd() });
  assert.deepEqual(result.failures, [], `regulation-family record payload with the optional additions must still clear validate-mint-payload.mjs: ${JSON.stringify(result.failures, null, 2)}`);
  assert.equal(result.valid, true);
});


test("buildRecordPayload: market_signal item_type lifts corridor_identity onto item and clears the real validator", () => {
  const capturedText =
    "MARKET UPDATE: ocean freight rates on the CNSHA-NLRTM lane rose sharply this quarter. " +
    "Shippers should book capacity now to avoid the surcharge. " +
    "Carriers are adding blank sailings in response to demand. " +
    "This shift was triggered by Red Sea diversions announced last week.";
  const payload = buildRecordPayload({
    sourceUrl: "https://example.com/market-update",
    itemType: "market_signal",
    title: "MARKET UPDATE: ocean freight rates on the CNSHA-NLRTM lane rose sharply this quarter",
    source: {
      id: "src-market",
      url: "https://example.com/market-update",
      base_tier: 3,
      tier_override: null,
      status: "active",
      institution_id: null,
    },
    capturedText,
    requiredSlots: ["action_now", "conversion_trigger", "driving_parties", "signal_event", "corridor_identity"],
    screen: { verdict: "on_vertical", provenance: "rule", basis: "freight market signal, core vertical" },
  });

  assert.deepEqual(payload.item.corridor_identity, {
    origin_locode: "CNSHA",
    dest_locode: "NLRTM",
    mode: "ocean",
    seed: "CNSHA-NLRTM:ocean",
    scheme_basis: "UN/LOCODE port-pair + mode",
  });

  const result = validateMintPayload(payload, { baseDir: process.cwd() });
  assert.deepEqual(result.failures, [], `market_signal record payload must clear validate-mint-payload.mjs: ${JSON.stringify(result.failures, null, 2)}`);
});

test("buildRecordPayload: research_finding item_type lifts research_credibility onto item and clears the real validator", () => {
  const capturedText =
    "This finding was published by a national laboratory and has been independently confirmed by two follow-up studies. " +
    "The methodology does not resolve the geographic scope question. " +
    "Practitioners should treat this as decision-relevant for near-term planning. " +
    "The finding itself concerns battery cell cost trajectories through 2030.";
  const payload = buildRecordPayload({
    sourceUrl: "https://example.org/paper",
    itemType: "research_finding",
    title: "This finding was published by a national laboratory",
    source: {
      id: "src-research",
      url: "https://example.org/",
      base_tier: 2,
      tier_override: null,
      status: "active",
      institution_id: null,
    },
    capturedText,
    requiredSlots: ["decision_relevance", "does_not_resolve", "finding", "methodology_limits", "evidence_agreement_signal", "source_authority_signal"],
    screen: { verdict: "on_vertical", provenance: "rule", basis: "research finding, core vertical" },
  });

  assert.ok(payload.item.research_credibility.evidence_agreement_signal);
  assert.ok(payload.item.research_credibility.source_authority_signal);

  const result = validateMintPayload(payload, { baseDir: process.cwd() });
  assert.deepEqual(result.failures, [], `research_finding record payload must clear validate-mint-payload.mjs: ${JSON.stringify(result.failures, null, 2)}`);
});

// lane URL-BOILER (2026-09-04) — the two named rows' real shape, end to end. `capturedText` reproduces
// each row's actual boilerplate sentence (population-33823467586 / population-33821410389 snapshots,
// read via `git show origin/population/<run>:.../census-rows.json`) plus a minimal instrument opening so
// `extractIdentityFact` still resolves; both rows clear the REAL validator with zero failures once
// jurisdictional_scope honestly falls to GAP instead of citing the bare EUR-Lex root.
test("buildRecordPayload: row 429c85d2 (UK SI 2013/816) — the boilerplate sentence never grounds a bad jurisdictional_scope FACT; payload still clears the real validator", () => {
  const capturedText =
    "The Renewable Transport Fuel Obligations (Amendment) Order 2013. " +
    "A copy of the Directives referred to in this Explanatory Note may be viewed in the Official " +
    "Journal of the European Union via the EUR-lex website at http://eur-lex.europa.eu . Merchant " +
    "Shipping Notices are published by the Maritime and Coastguard Agency and can be viewed on the " +
    "agency's website at http://www.dft.gov.uk/mca which also has details of any amendments or replacements. " +
    // Lane HOLLOW-GATE (2026-09-04): the original fixture isolated ONLY the boilerplate sentence this
    // test is about and, once record_hollow exists, that made it an accidentally-hollow payload (title
    // FACT plus four GAPs, nothing else) -- a fixture artefact, not evidence the real item is hollow (the
    // real Explanatory Note continues with the instrument's own substantive commencement text). One
    // genuine primary_deadline-shaped sentence restores the fixture to "real item, narrow slice" without
    // touching the jurisdictional_scope assertion this test exists to prove.
    "Compliance with the transitional arrangements is required no later than 1 January 2015.";
  const payload = buildRecordPayload({
    sourceUrl: "https://www.legislation.gov.uk/uksi/2013/816",
    itemType: "regulation",
    title: "The Renewable Transport Fuel Obligations (Amendment) Order 2013",
    instrumentIdentifier: "UK uksi 2013/816",
    jurisdictionIso: "GB",
    source: { id: "s-legislation-gov-uk", url: "https://legislation.gov.uk/", base_tier: 1, tier_override: null, status: "active", institution_id: "inst-1" },
    capturedText,
    requiredSlots: ["effective_date", "jurisdictional_scope", "penalty_summary", "primary_deadline"],
    screen: { verdict: "on_vertical", provenance: "rule", basis: "UK statutory instrument, core vertical" },
  });

  const scope = payload.claims.find((c) => c.slot_key === "jurisdictional_scope");
  assert.equal(scope.claim_kind, "GAP", "the bare-EUR-Lex-root boilerplate is not a scope statement");
  assert.equal(scope.source_span, null);
  assert.ok(!String(payload.item.full_brief).includes("http://eur-lex.europa.eu"), "the ungrounded bare URL never reaches full_brief");

  const result = validateMintPayload(payload, { baseDir: process.cwd() });
  assert.deepEqual(result.failures, [], `row 429c85d2's shape must clear validate-mint-payload.mjs with zero failures: ${JSON.stringify(result.failures, null, 2)}`);
  assert.equal(result.valid, true);
  assert.equal(result.recommended_status, "verified");
});

test("buildRecordPayload: row a980a0b9 (UK SI 2012/2567) — same boilerplate class, same honest GAP, same clean validator pass", () => {
  const capturedText =
    "The Motor Fuel (Composition and Content) (Amendment) Regulations 2012. " +
    "A copy of the Directives referred to in this Explanatory Note may be obtained from the Office of " +
    "Public Sector Information or viewed in the Official Journal of the European Union via the EUR-Lex " +
    "website at http://eur-lex.europa.eu/ . Merchant Shipping Notices are published by the Maritime and " +
    "Coastguard Agency and can be viewed on the Agency's website at http://www.dft.gov.uk/mca/ which also " +
    "has details of any amendments or replacements. " +
    // Lane HOLLOW-GATE (2026-09-04): see the sibling 429c85d2 test's own comment -- same fixture-artefact
    // fix, same reason.
    "Compliance with the transitional arrangements is required no later than 1 January 2015.";
  const payload = buildRecordPayload({
    sourceUrl: "https://www.legislation.gov.uk/uksi/2012/2567",
    itemType: "regulation",
    title: "The Motor Fuel (Composition and Content) (Amendment) Regulations 2012",
    instrumentIdentifier: "UK uksi 2012/2567",
    jurisdictionIso: "GB",
    source: { id: "s-legislation-gov-uk", url: "https://legislation.gov.uk/", base_tier: 1, tier_override: null, status: "active", institution_id: "inst-1" },
    capturedText,
    requiredSlots: ["effective_date", "jurisdictional_scope", "penalty_summary", "primary_deadline"],
    screen: { verdict: "on_vertical", provenance: "rule", basis: "UK statutory instrument, core vertical" },
  });

  const scope = payload.claims.find((c) => c.slot_key === "jurisdictional_scope");
  assert.equal(scope.claim_kind, "GAP");
  assert.equal(scope.source_span, null);

  const result = validateMintPayload(payload, { baseDir: process.cwd() });
  assert.deepEqual(result.failures, [], `row a980a0b9's shape must clear validate-mint-payload.mjs with zero failures: ${JSON.stringify(result.failures, null, 2)}`);
  assert.equal(result.valid, true);
  assert.equal(result.recommended_status, "verified");
});

// ── Lane HOLLOW-GATE (2026-09-04): EU-act self-description extractors ──────────────────────────────
// operative_provision / addressee / confirmed_measure / in_force_status. Fixtures below reproduce REAL
// captured text read live via Supabase (`agent_run_searches.result_content`), not invented shapes:
//   - 31999D0823 (item 8670d8bf-9847-4da6-8724-0d52308b008e, the traced hollow example, item_type
//     "initiative" -- CELEX sector-3 'D'): "HAS ADOPTED THIS DECISION: Article 1 The measures notified by
//     the Netherlands which exceed the maximum recycling target laid down in Article 6(1)(b) of Directive
//     94/62/EC are hereby confirmed. Article 2 This Decision is addressed to the Kingdom of the
//     Netherlands." -- verbatim.
//   - 32020R0893 (a live, currently-in-force EUR-Lex regulation): the force-indicator's own markup,
//     `<p class="forceIndicator"><span><img class="forceIndicatorBullet" src="./../../../images/
//     green-on.png" alt="Legal status of the document"/></span>In force</p>`, plus (same page) a body
//     sentence using the phrase "no longer in force" about a DIFFERENT, unrelated regulation -- the exact
//     false-positive this extractor's structural anchor exists to reject (see findInForceStatusMatch's
//     own header).
//   - a synthetic red/not-in-force markup variant is used ONLY where noted -- [HYPOTHESIS, not confirmed
//     against a real row]: zero rows in this corpus carry an off-state indicator (measured live,
//     2026-09-04), so this shape is inferred from EUR-Lex's own on/off asset-naming convention
//     (green-on.png), never asserted as observed.

test("isEurlexHost: true for eur-lex.europa.eu and its subdomains, false for anything else", () => {
  assert.equal(isEurlexHost("https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:31999D0823"), true);
  assert.equal(isEurlexHost("https://new.eur-lex.europa.eu/x"), true);
  assert.equal(isEurlexHost("https://www.legislation.gov.uk/uksi/2013/816"), false);
  assert.equal(isEurlexHost("https://publications.europa.eu/resource/celex/31999D0823"), false, "Cellar is a different host -- captures via Cellar still carry item.source_url = the eur-lex.europa.eu URL, so this narrower check is deliberate, not a gap");
  assert.equal(isEurlexHost("not a url"), false);
  assert.equal(isEurlexHost(null), false);
});

test("findSlotSpan('operative_provision'/'addressee'/'confirmed_measure'): locates the REAL 31999D0823 enacting clauses verbatim (the traced hollow example's own text)", () => {
  const text =
    "HAS ADOPTED THIS DECISION: Article 1 The measures notified by the Netherlands which exceed the " +
    "maximum recycling target laid down in Article 6(1)(b) of Directive 94/62/EC are hereby confirmed. " +
    "Article 2 This Decision is addressed to the Kingdom of the Netherlands.";

  const operative = findSlotSpan("operative_provision", text);
  assert.ok(operative, "must find the enacting formula + Article 1");
  assert.match(operative, /HAS ADOPTED THIS DECISION:/i);
  assert.match(operative, /Article 1 The measures notified by the Netherlands/i);
  assert.ok(text.toLowerCase().includes(operative.toLowerCase()));

  const addressee = findSlotSpan("addressee", text);
  assert.ok(addressee, "must find the addressee clause");
  assert.match(addressee, /This Decision is addressed to the Kingdom of the Netherlands/i);

  const measure = findSlotSpan("confirmed_measure", text);
  assert.ok(measure, "must find the confirmed-measure clause");
  assert.match(measure, /measures notified by the Netherlands/i);

  // A recommendation's own enacting formula ("HEREBY RECOMMENDS TO THE MEMBER STATES:") is deliberately
  // NOT matched by operative_provision -- confirmed against the real 31976H0495 shape (Supabase); an
  // honest GAP, never a stretched pattern.
  assert.equal(findSlotSpan("operative_provision", "HEREBY RECOMMENDS TO THE MEMBER STATES: 1. that authorities encourage frequent transport services."), null);
});

// Lane HOLLOW-GATE, second real-capture sample (2026-09-04): 12 fresh title-only-hollow "initiative" rows
// pulled at random via Supabase found "HAS DECIDED AS FOLLOWS:" in 6/12 real captures -- the SAME
// enacting-formula role as "HAS ADOPTED THIS DECISION:" above, not a rare variant. Text below is CELEX
// 32004D0575's own real captured body (Council Decision, Barcelona Convention protocol), verbatim.
test("findSlotSpan('operative_provision'): the REAL 32004D0575 'HAS DECIDED AS FOLLOWS:' formula (a Decision's OTHER real enacting-formula shape, 6/12 in the second real-capture sample) locates verbatim, item_type-independent", () => {
  const text =
    "(7) The Protocol, not affecting the right of Parties to adopt relevant stricter measures in conformity " +
    "with international law, contains the measures needed to avoid there being any incoherence with " +
    "Community legislation already in force in the areas covered by the Protocol. (8) The Community should " +
    "therefore approve the Protocol, HAS DECIDED AS FOLLOWS: Article 1 The Protocol to the Barcelona " +
    "Convention for the Protection of the Mediterranean Sea against Pollution concerning cooperation in " +
    "preventing pollution from ships, hereinafter referred to as «the Protocol», is hereby approved on behalf of the Community.";
  const operative = findSlotSpan("operative_provision", text);
  assert.ok(operative, "'HAS DECIDED AS FOLLOWS:' must locate the operative provision just as 'HAS ADOPTED THIS DECISION:' does");
  assert.match(operative, /HAS DECIDED AS FOLLOWS:/);
  assert.match(operative, /Article 1 The Protocol to the Barcelona Convention/);
});

// CELEX 32021D0136's own real captured text (Commission Implementing Decision correcting an earlier one).
test("findSlotSpan('effective_date'): a REAL EU-act 'shall enter into force' sentence locates verbatim -- this slot key is now attempted for item_type='initiative' too via EU_ACT_SLOT_KEYS (build requirement 2's 'entry-into-force/application dates')", () => {
  const text =
    "Article 3 Entry into force This Decision shall enter into force on the twentieth day following that of " +
    "its publication in the Official Journal of the European Union.";
  const effectiveDate = findSlotSpan("effective_date", text);
  assert.ok(effectiveDate);
  assert.match(effectiveDate, /shall enter into force on the twentieth day/i);
});

test("findSlotSpan('operative_provision'): a raw-HTML capture (the enacting formula split across <p> tags, real 32011L0015 shape) never yields a tag-polluted span -- honest GAP instead", () => {
  // Real captured shape (Supabase, agent_run_searches, eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32011L0015):
  // the Article 1 text sits in a SEPARATE <p> from "HAS ADOPTED THIS DIRECTIVE:", so a window-based
  // trigger applied to un-stripped HTML would otherwise swallow the intervening tag markup verbatim.
  const rawHtml =
    '<p class="oj-normal">HAS ADOPTED THIS DIRECTIVE:</p>\n' +
    '<div class="eli-subdivision" id="enc_1">\n' +
    '<div class="eli-subdivision" id="art_1">\n' +
    '<p id="d1e104-33-1" class="oj-ti-art">Article 1</p>\n' +
    '<div class="eli-title">Scope</div>';
  assert.equal(findSlotSpan("operative_provision", rawHtml), null, "a tag-polluted match must be rejected, not returned as a 'verbatim' span");
  assert.equal(isProseSpan('HAS ADOPTED THIS DIRECTIVE:</p>\n<div class="eli-subdivision"'), false, "the HTML-tag-fragment guard rejects it directly");
});

test("findInForceStatusMatch: the REAL 32020R0893 force-indicator markup -> notInForce=false ('In force', green)", () => {
  const html =
    '<p xmlns="http://www.w3.org/1999/xhtml" class="forceIndicator">\n' +
    '         <span>\n' +
    '            <img class="forceIndicatorBullet" src="./../../../images/green-on.png"\n' +
    '                 alt="Legal status of the document"/>\n' +
    '         </span>In force</p>\n' +
    '      <p>ELI: <a class="underlineLink" href="http://data.europa.eu/eli/reg_impl/2020/893/oj">http://data.europa.eu/eli/reg_impl/2020/893/oj</a></p>';
  const m = findInForceStatusMatch(html);
  assert.ok(m, "must find the indicator");
  assert.equal(m.statusText, "In force");
  assert.equal(m.notInForce, false);
  assert.ok(html.includes(m.span), "span must be verbatim-by-construction");
});

test("findInForceStatusMatch: the SAME real 32020R0893 page ALSO carries the literal phrase 'no longer in force' elsewhere (its own recital text, about a DIFFERENT regulation) -- proves a bare substring scan would misfire and this extractor does not", () => {
  const bodyText =
    "It was therefore invalid. Regulations (EEC) No 2913/92 and (EEC) No 2454/93 are no longer in force, " +
    "but point (c) of Article 132 of Implementing Regulation (EU) 2015/2447 also establishes a one-year " +
    "limitation for adjusting the customs value of defective goods.";
  const forceIndicatorHtml =
    '<p class="forceIndicator"><span><img class="forceIndicatorBullet" src="green-on.png" alt="x"/></span>In force</p>';
  const wholePage = forceIndicatorHtml + " " + bodyText;
  const m = findInForceStatusMatch(wholePage);
  assert.equal(m.notInForce, false, "the indicator itself says In force; the unrelated body-text phrase must never override it");
  assert.equal(findSlotSpan("operative_provision", wholePage), null, "and this body text must never be mistaken for this document's own operative provision either");
});

test("findInForceStatusMatch: a red/off-state variant reads notInForce=true [HYPOTHESIS: EUR-Lex's own on/off asset-naming convention inferred, not observed live -- zero rows in this corpus carry it]", () => {
  const html =
    '<p class="forceIndicator"><span><img class="forceIndicatorBullet" src="./../../../images/red-off.png" ' +
    'alt="Legal status of the document"/></span>No longer in force</p>';
  const m = findInForceStatusMatch(html);
  assert.ok(m);
  assert.equal(m.statusText, "No longer in force");
  assert.equal(m.notInForce, true);
});

test("findInForceStatusMatch: no force-indicator markup at all (the common case -- the deterministic capture pipeline's own Cellar/clean-text endpoints never carry this widget) -> null", () => {
  assert.equal(findInForceStatusMatch("Plain stripped act text with no indicator markup at all."), null);
  assert.equal(findInForceStatusMatch(""), null);
  assert.equal(findInForceStatusMatch(null), null);
});

test("extractInForceStatusFact: FACT when the indicator is present, honest GAP otherwise", () => {
  const html = '<p class="forceIndicator"><span><img class="forceIndicatorBullet" src="green-on.png" alt="x"/></span>In force</p>';
  const fact = extractInForceStatusFact({ capturedText: html, sourceUrl: "https://eur-lex.europa.eu/x" });
  assert.equal(fact.claim_kind, "FACT");
  assert.equal(fact.slot_key, "in_force_status");
  assert.equal(fact.in_force_status, "In force");
  assert.equal(fact.not_in_force, false);
  assert.match(fact.claim_text, /\[in_force_status\]/);

  const gap = extractInForceStatusFact({ capturedText: "No indicator here.", sourceUrl: "https://eur-lex.europa.eu/x" });
  assert.equal(gap.claim_kind, "GAP");
  assert.equal(gap.in_force_status, null);
  assert.equal(gap.not_in_force, null);
});

test("buildRecordFacts: the five EU-act slots attach ONLY for a eur-lex.europa.eu sourceUrl, item_type-independent (fixes the 390 'initiative'-typed hollow items, whose required-slots list has no matching triggers at all)", () => {
  const text =
    "HAS ADOPTED THIS DECISION: Article 1 The measures notified by the Netherlands which exceed the " +
    "maximum recycling target laid down in Article 6(1)(b) of Directive 94/62/EC are hereby confirmed. " +
    "Article 2 This Decision is addressed to the Kingdom of the Netherlands. Article 3 This Decision shall " +
    "enter into force on the day of its notification.";

  const eurlexInitiative = buildRecordFacts({
    title: "T", sourceUrl: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:31999D0823",
    capturedText: text, requiredSlots: ["action_now", "conversion_trigger", "driving_parties", "signal_event"],
    itemType: "initiative", // the actual mis-bucketed, market-signal-shaped item_type this population carries
  });
  const operative = eurlexInitiative.find((c) => c.slot_key === "operative_provision");
  const addressee = eurlexInitiative.find((c) => c.slot_key === "addressee");
  const measure = eurlexInitiative.find((c) => c.slot_key === "confirmed_measure");
  const status = eurlexInitiative.find((c) => c.slot_key === "in_force_status");
  const effectiveDate = eurlexInitiative.find((c) => c.slot_key === "effective_date");
  assert.ok(operative && operative.claim_kind === "FACT", "operative_provision must attach and resolve to a FACT even though item_type='initiative' never requests it");
  assert.ok(addressee && addressee.claim_kind === "FACT");
  assert.ok(measure && measure.claim_kind === "FACT");
  assert.ok(status && status.claim_kind === "GAP", "no indicator markup in this plain-text fixture -- honest GAP, not a fabricated status");
  assert.ok(effectiveDate && effectiveDate.claim_kind === "FACT", "effective_date must attach for an EU-act item_type='initiative' too, even though 'initiative' never requires it (Lane HOLLOW-GATE, second real-capture sample: 4/12 real decisions carried this exact 'shall enter into force' shape)");

  const nonEurlex = buildRecordFacts({
    title: "T", sourceUrl: "https://www.federalregister.gov/documents/x", capturedText: text,
    requiredSlots: [], itemType: "initiative",
  });
  assert.equal(nonEurlex.some((c) => c.slot_key === "operative_provision"), false, "a non-EUR-Lex source never gets the EU-act additions");
});

test("buildRecordFacts: a slot already in requiredSlots is never duplicated by the EU-act addition", () => {
  const text = "HAS ADOPTED THIS DECISION: Article 1 Something happens. Article 2 This Decision is addressed to Germany.";
  const claims = buildRecordFacts({
    title: "T", sourceUrl: "https://eur-lex.europa.eu/x", capturedText: text,
    requiredSlots: ["operative_provision", "addressee"], itemType: "initiative",
  });
  assert.equal(claims.filter((c) => c.slot_key === "operative_provision").length, 1);
  assert.equal(claims.filter((c) => c.slot_key === "addressee").length, 1);
});

test("buildRecordPayload: item 8670d8bf's REAL 31999D0823 shape — the traced hollow example — now clears record_hollow AND the full validator (before this lane: title FACT + four GAPs only, exactly the reported defect)", () => {
  const capturedText =
    "1999/823/EC: Commission Decision of 22 November 1999 confirming the measures notified by the " +
    "Netherlands pursuant to Article 6(6) of Directive 94/62/EC of the European Parliament and of the " +
    "Council on packaging and packaging waste (notified under document number C(1999) 3818). " +
    "HAS ADOPTED THIS DECISION: Article 1 The measures notified by the Netherlands which exceed the " +
    "maximum recycling target laid down in Article 6(1)(b) of Directive 94/62/EC are hereby confirmed. " +
    "Article 2 This Decision is addressed to the Kingdom of the Netherlands.";
  const title =
    "1999/823/EC: Commission Decision of 22 November 1999 confirming the measures notified by the " +
    "Netherlands pursuant to Article 6(6) of Directive 94/62/EC of the European Parliament and of the " +
    "Council on packaging and packaging waste (notified under document number C(1999) 3818)";

  const payload = buildRecordPayload({
    sourceUrl: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:31999D0823",
    itemType: "initiative", // the LIVE item_type this row actually carries (classifyItemTypeFromCelexKey, sector 3 'D')
    title,
    canonicalInstrumentKey: "31999D0823",
    jurisdictionIso: "EU",
    source: {
      id: "src-eurlex", url: "https://eur-lex.europa.eu/", base_tier: 1, tier_override: null,
      status: "active", institution_id: null,
    },
    capturedText,
    // the LIVE required-slots list for item_type "initiative" (item-type-required-slots.json) -- the
    // market-signal shape that never matched this document's own text.
    requiredSlots: ["action_now", "conversion_trigger", "driving_parties", "signal_event", "corridor_identity"],
    screen: { verdict: "on_vertical", provenance: "rule", basis: "EU packaging-waste derogation decision, core vertical" },
  });

  const substantiveFacts = payload.claims.filter((c) => c.claim_kind === "FACT" && c.slot_key !== "title");
  assert.ok(substantiveFacts.length >= 3, `expected operative_provision/addressee/confirmed_measure at minimum: ${JSON.stringify(payload.claims.map((c) => [c.slot_key, c.claim_kind]))}`);
  assert.ok(substantiveFacts.some((c) => c.slot_key === "operative_provision"));
  assert.ok(substantiveFacts.some((c) => c.slot_key === "addressee"));
  assert.ok(substantiveFacts.some((c) => c.slot_key === "confirmed_measure"));

  const result = validateMintPayload(payload, { baseDir: process.cwd() });
  assert.ok(!result.failures.some((f) => f.reason === "record_hollow"), `must not be hollow any more: ${JSON.stringify(result.failures, null, 2)}`);
  assert.deepEqual(result.failures, [], `the real 31999D0823 shape must clear validate-mint-payload.mjs with zero failures: ${JSON.stringify(result.failures, null, 2)}`);
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
