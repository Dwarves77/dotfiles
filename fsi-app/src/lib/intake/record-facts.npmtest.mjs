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
    "agency's website at http://www.dft.gov.uk/mca which also has details of any amendments or replacements.";
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
    "has details of any amendments or replacements.";
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
