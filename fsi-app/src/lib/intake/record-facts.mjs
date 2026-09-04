// src/lib/intake/record-facts.mjs
//
// RECORD-GRADE FACT EXTRACTOR (Lane POP, 2026-09-01)
// ===================================================
// Pure, deterministic, $0, no-LLM, no-I/O module. Builds the claims + full_brief for a RECORD-GRADE
// mint payload (`item.grade = "record"`, migration 278) out of ONE already-captured source document —
// never invents a fact, never calls a model, never fetches anything itself.
//
// WHY THIS EXISTS. docs/audits/system-review-2026-09-01.md §10 ("Lane POP"): 3,661 census_worklist rows
// are marked `would_mint` against 322 live verified items, and every item today requires a synthesized,
// grounded BRIEF. A record-grade item is the cheaper tier: identity + dates + forward events + tags + a
// short extracted description made ONLY of verbatim FACT/GAP spans from the captured source. This
// module is the "extracted description" half — the identity/date/scope FACT spans plus the templated
// GAP claims that cover an item_type's required slots (`item-type-required-slots.json`) when the
// captured text does not state them. Forward events and connection-discovery tags are NOT this
// module's job: they are rule 16's post-insert participation (mint-item.ts, unconditional on grade —
// see that file's header) and Lane TAG's signature-tag derivation (out of this lane's write set)
// respectively; this module supplies only what a mint PAYLOAD needs before either of those can run.
//
// SAME SHAPE AS THE FORWARD-EVENTS EXTRACTOR (src/lib/forward-events/extract-forward-events.mjs), NOT
// THE SAME CODE. That module's own header states the contract this one follows: never invent a fact,
// locate one that is already present in the text, bind a `source_span` by literal substring so it is
// verbatim BY CONSTRUCTION, and re-check every span with an `assertVerbatim` guard before it is ever
// emitted — a violation throws, it is never silently dropped. This module is a small, independent
// sibling (title/identity/slot facts, not dated obligations) rather than an import, so record-facts.mjs
// stays a single, minimal, from-scratch file a reviewer can read in one pass; the two modules may only
// ever DIVERGE from each other's exact regex choices, never from the shared verbatim-by-construction
// discipline.
//
// VERBATIM, NOT VERIFIED-TRUE. Every FACT claim's `source_span` is checked to be a literal
// (case-insensitive) substring of the captured text this module was given — the same check
// `validate-mint-payload.mjs` criterion 3 runs. It says nothing about whether the source itself is
// correct; it only guarantees the claim quotes the source rather than paraphrasing or inventing it.
//
// EXTENDED (Lane INTAKE, 2026-09-02, wave2 "build the tools before populating" ruling). Every new UI
// surface this wave adds (OBLIG's obligation register, CORR's corridor overlay, DASH's research
// credibility chips) reads fields no record-grade payload carried before this lane: `binding_position`
// and `due_date`/`date_precision` for the regulation family (spec 01 §1/§3.2-3.3), `corridor_identity`
// for market items that name a lane (ADR-024 decision 4), and the two research credibility signals of
// spec 03 §4 for research_finding. Same discipline as everything else in this file: span-proven from
// `capturedText`, GAP when the source does not state it, never invented. Two of these five slots are
// OPTIONAL, ALWAYS-ATTEMPTED additions rather than entries in item-type-required-slots.json's five
// long-registered regulation-family item_types (regulation/directive/standard/guidance/framework) --
// that file "mirrors the live public.item_type_required_slots table" (its own header) and hand-crafted
// fixture payloads elsewhere in this repo (validate-mint-payload.test.mjs's basePayload,
// scripts/mint/example-payload.json) already assert an EXACT 4-claim/0-failure shape for those five
// item_types; adding a 5th/6th REQUIRED slot there would fail those payloads' own criterion-5 check
// without ever touching those coordinator-owned files. `buildRecordFacts` below instead adds
// binding_position/due_date for the WHOLE regulation family (including the two brand-new FR item_types
// (the coordinator withdrew the two FR types `notice`/`presidential_document` INTAKE had registered:
// zero evidence rows, and the live item_type CHECK, validator floor, surface rules and required-slots
// table would all have needed extending for no document; HELD's dossier names them if one ever appears) --
// nothing existing depends on their slot count) by ITEM_TYPE membership, independent of what
// item-type-required-slots.json requires for that exact type -- always a FACT-or-GAP claim, so criterion
// 5 (which only checks slots that ARE required) is never affected either way. See MINT-RUNBOOK.md's kept
// checklist and this lane's own report for the exact validate-mint-payload.mjs kit-check text a future
// coordinator commit would add (REG_FAMILY membership for the two new item_types; vocabulary-membership
// checks on the new item fields) -- validate-mint-payload.mjs itself is out of this lane's write set.
//
// GATE-A SAFETY BY CONSTRUCTION. `buildRecordFullBrief` assembles `full_brief` ONLY by concatenating
// FACT/GAP claims' own `claim_text` (which already embeds each FACT's `source_span` as a quoted
// substring) plus digit-free boilerplate (headings, labels, the `Source:` line). Every figure/date
// token Gate A (scripts/mint/lib/gate-a-scan.mjs) can find in `full_brief` is therefore already present,
// verbatim, inside the same claim_text it scans as the FACT-claim "corpus" — Gate A's coverage check
// (`containsToken`) passes by construction, not by a parallel weaker rule. Never add free-standing prose
// to `full_brief` outside a claim's own `claim_text` (e.g. never interpolate a raw `title` that itself
// contains a date into a heading) — doing so can introduce an ungrounded figure/date Gate A will
// correctly reject.
//
// RECORD-PURITY. Every claim this module emits is `claim_kind` FACT or GAP — never ANALYSIS, LEGAL, or
// DERIVED. That is not a stylistic choice: ANALYSIS/LEGAL claims are how a synthesized brief's own
// interpretation enters a payload (validate-mint-payload.mjs criterion 4's label-syntax checks exist
// for exactly that content), and a record-grade item carries none of it by design ("no synthesis").
// `validate-mint-payload.mjs`'s grade discriminator (this lane, same commit) enforces this as a
// kit-level check on any payload declaring `item.grade === "record"`, independent of which builder
// produced it — this module satisfies that check by construction, the validator is the backstop.

// Lane INTAKE (2026-09-02): the two shared, published vocabularies this extension adopts rather than
// invents (this file's own header discipline, and vocabularies.mjs's own "ADOPT, DO NOT INVENT" rule).
// Both modules are plain ESM, zero dependencies, no I/O -- static imports, not the runtime fetch this
// file's "no-I/O" rule forbids.
import { BINDING_POSITION, normaliseMode } from "../contracts/vocabularies.mjs";
import { CORRIDOR_ID_SCHEME } from "../entities/decisions.mjs";

export const RECORD_FACTS_VERSION = "rf1-2026-09-04.1"; // lane URL-BOILER: bare-domain-URL span guard

// ---------------------------------------------------------------------------
// Verbatim-span guard (same contract as extract-forward-events.mjs's assertVerbatim — see that file's
// header — re-implemented locally rather than imported so this module stays a single, from-scratch,
// zero-dependency file; case-insensitive substring, matching validate-mint-payload.mjs criterion 3's own
// `haystack.toLowerCase().includes(span.toLowerCase())` check exactly, so a span this guard accepts is
// guaranteed to also clear the real gate).
// ---------------------------------------------------------------------------
export function assertVerbatim(sourceText, span) {
  if (typeof span !== "string" || span.trim() === "") {
    throw new Error("record-facts: empty source_span");
  }
  const hay = String(sourceText ?? "").toLowerCase();
  if (!hay.includes(span.trim().toLowerCase())) {
    throw new Error(
      `record-facts: source_span is not a verbatim (case-insensitive) substring of the captured source text: ${JSON.stringify(span)}`
    );
  }
  return span;
}

// ---------------------------------------------------------------------------
// Slot triggers — used ONLY to LOCATE a span already in the text, never to generate one. A slot with no
// trigger match (either because the item_type's required slots have no entry here, or because the
// pattern genuinely does not occur in this document) honestly falls back to a templated GAP claim — a
// true "not stated" finding, not an invented fact. This is a coverage FLOOR, not a synthesis engine:
// deliberately small, covering the regulation/directive/standard/guidance/framework family's four
// required slots (item-type-required-slots.json), which is the item_type distribution census_worklist's
// EUR-Lex-heavy `would_mint` population actually has (see docs/plans/record-tier-population-plan-2026-09-01.md).
// Other item_types' required slots (market_signal/technology/research_finding/regional_data/...) have no
// entry below and always resolve to an honest GAP claim — extending this map is additive and safe; it
// never needs to become exhaustive for the extractor to be correct.
//
// CONTINUATION IS URL-SAFE (lane URL-GUIL, 2026-09-03, population runs #15/#16, mint-run-017/018).
// Every trigger's continuation window below reads `(?:https?:\/\/\S+|[^.;\n]){0,N}`, never the plain
// `[^.;\n]{0,N}` this file used before. `[^.;\n]` excludes a literal '.' so the window stops at a
// sentence's real full stop — but a URL's own domain dots (`eur-lex.europa.eu`) look IDENTICAL to that
// regex, so a trigger whose match window happened to reach a URL truncated it at the URL's FIRST internal
// period. Row `429c85d2` (CELEX-free UK SI 2013/816, "The Renewable Transport Fuel Obligations
// (Amendment) Order 2013") is the measured case: jurisdictional_scope's `...the european union...`
// trigger matched "of the European Union via the EUR-lex website at http://eur-lex" and stopped there —
// one character short of the '.' in "eur-lex.europa.eu" — even though the captured source's own sentence
// continues past the URL to a real ' . ' three words later. The alternation tries to consume a whole
// non-whitespace URL run FIRST at each position (so the URL's internal dots are swallowed atomically,
// never seen as a stopping point) and only falls back to matching one non-terminator character when the
// text at that position is not a URL — a real sentence-ending '.' (not preceded by an in-progress URL
// match) still stops the window exactly as before. See docs/ops/session-log.md Addendum 85 for the
// full write-up and migration 300 for the companion fix (the truncated span's own guillemet delimiter
// then swallowed by criterion 2's URL-extraction regex, `ungrounded_url`).
const SLOT_TRIGGERS = Object.freeze({
  effective_date: [
    /entered? into force(?:https?:\/\/\S+|[^.;\n]){0,90}/i,
    /shall enter into force(?:https?:\/\/\S+|[^.;\n]){0,90}/i,
    /shall apply from(?:https?:\/\/\S+|[^.;\n]){0,90}/i,
    /applicable since(?:https?:\/\/\S+|[^.;\n]){0,90}/i,
  ],
  primary_deadline: [
    /no later than(?:https?:\/\/\S+|[^.;\n]){0,90}/i,
    /\bby\s+\d{1,2}\s+\w+\s+\d{4}(?:https?:\/\/\S+|[^.;\n]){0,70}/i,
    /\bdeadline\b(?:https?:\/\/\S+|[^.;\n]){0,90}/i,
  ],
  jurisdictional_scope: [
    // Clause-shaped triggers first; the bare institution name last and only as the object of a
    // preposition. On legislation.gov.uk "European Union" is the first word of Act titles ("European
    // Union (Future Relationship) Act 2020") and subject tags ("European Union Climate Change ..."),
    // none of which state a scope (mint-run-008, 2026-09-02).
    /\bapplies to\b(?:https?:\/\/\S+|[^.;\n]){0,90}/i,
    /addressed to(?:https?:\/\/\S+|[^.;\n]){0,90}/i,
    /member states?(?:https?:\/\/\S+|[^.;\n]){0,90}/i,
    /\b(?:in|within|throughout|across|of|into) the european union(?!\s*\()(?!\s+act\b)(?:https?:\/\/\S+|[^.;\n]){0,90}/i,
  ],
  penalty_summary: [
    /penalt(?:y|ies)(?:https?:\/\/\S+|[^.;\n]){0,110}/i,
    /\bfine[sd]?\b(?:https?:\/\/\S+|[^.;\n]){0,110}/i,
    /sanctions?(?:https?:\/\/\S+|[^.;\n]){0,110}/i,
  ],
  // Research credibility (Lane INTAKE, 2026-09-02, spec 03 §4's "two scores, never merged"). Generic
  // phrase-locate, same as every other entry above -- a coverage floor over the language a source uses
  // to describe its own evidentiary strength or authority, never a computed IPCC/GRADE score (this
  // module has no I/O to fetch the OpenAlex/ROR inputs spec 03 §4 names; that computation belongs to a
  // later, DB-credentialed pass -- see this lane's report).
  evidence_agreement_signal: [
    /peer[- ]reviewed(?:https?:\/\/\S+|[^.;\n]){0,90}/i,
    /independently (?:confirmed|corroborated|replicated)(?:https?:\/\/\S+|[^.;\n]){0,90}/i,
    /widely (?:accepted|confirmed)(?:https?:\/\/\S+|[^.;\n]){0,90}/i,
    /reaches? (?:a )?consensus(?:https?:\/\/\S+|[^.;\n]){0,90}/i,
    /systematic review(?:https?:\/\/\S+|[^.;\n]){0,90}/i,
    /meta-analysis(?:https?:\/\/\S+|[^.;\n]){0,90}/i,
    /\bpreliminary\b(?:https?:\/\/\S+|[^.;\n]){0,90}/i,
    /\bdisputed\b(?:https?:\/\/\S+|[^.;\n]){0,90}/i,
    /\bunconfirmed\b(?:https?:\/\/\S+|[^.;\n]){0,90}/i,
    /not yet (?:been )?replicated(?:https?:\/\/\S+|[^.;\n]){0,90}/i,
  ],
  source_authority_signal: [
    /published by(?:https?:\/\/\S+|[^.;\n]){0,90}/i,
    /peer[- ]reviewed journal(?:https?:\/\/\S+|[^.;\n]){0,90}/i,
    /working paper(?:https?:\/\/\S+|[^.;\n]){0,90}/i,
    /\bpreprint\b(?:https?:\/\/\S+|[^.;\n]){0,90}/i,
    /\bin press\b(?:https?:\/\/\S+|[^.;\n]){0,90}/i,
    /issued by(?:https?:\/\/\S+|[^.;\n]){0,90}/i,
    /commissioned by(?:https?:\/\/\S+|[^.;\n]){0,90}/i,
    /\buniversity\b(?:https?:\/\/\S+|[^.;\n]){0,90}/i,
    /national laboratory(?:https?:\/\/\S+|[^.;\n]){0,90}/i,
    /standards body(?:https?:\/\/\S+|[^.;\n]){0,90}/i,
    /intergovernmental organi[sz]ation(?:https?:\/\/\S+|[^.;\n]){0,90}/i,
    /research institute(?:https?:\/\/\S+|[^.;\n]){0,90}/i,
    /industry association(?:https?:\/\/\S+|[^.;\n]){0,90}/i,
  ],
});

// PROSE GUARD (2026-09-02, population run #4). A trigger is a keyword, and a captured page is not only
// the instrument's text: legislation.gov.uk's every page carries a browse menu whose line "European
// Union Treaties ------" is the first place "european union" occurs, and mint-run-008 emitted it as the
// jurisdictional_scope FACT of a UK statutory instrument. The span was verbatim (criterion 3 was
// satisfied) and still wrong, because verbatim-ness says nothing about whether the matched characters
// are a sentence. This guard names what a slot FACT must look like before it is accepted, and
// findSlotSpan walks EVERY match of every trigger (not the first match of the first trigger) until one
// qualifies — the menu line is skipped, the instrument's own "applies to ..." clause further down is
// found. A page with no qualifying match still resolves to an honest GAP claim.
//
// A span is prose when it carries at least MIN_SPAN_WORDS alphabetic words AND no run of RUN_LIMIT or
// more identical punctuation characters (rules, separators, table borders — chrome, never a clause), AND
// no HTML character reference (`&#xD;`, `&amp;`): a span carrying one is quoting markup, not the text.
const MIN_SPAN_WORDS = 4;
const RUN_LIMIT = 4;
const HTML_ENTITY = /&(?:#\d+|#x[0-9a-f]+|[a-z]+);?/i;
const PUNCT_RUN = new RegExp(`([^\\p{L}\\p{N}\\s])\\1{${RUN_LIMIT - 1},}`, "u");

// BARE-DOMAIN URL GUARD (lane URL-BOILER, 2026-09-04, population runs #17/#18, mint-run-020/021, rows
// 429c85d2 and a980a0b9 — both "The [X] (Amendment) Regulations/Order 20XX", UK legislation.gov.uk).
// Lane URL-GUIL (postscript 18) fixed the truncation that cut a matched URL off mid-domain; once the URL
// was captured WHOLE, a different, previously-masked defect surfaced: both rows' jurisdictional_scope
// trigger matched the exact same UK Explanatory Note boilerplate — "...viewed in the Official Journal of
// the European Union via the EUR-Lex website at http://eur-lex.europa.eu ." — a sentence that tells the
// reader WHERE to go look up EU legislation in general, not a statement of which entities THIS instrument
// binds. Its only URL is the bare EUR-Lex root with no path (`http://eur-lex.europa.eu`, confirmed via
// Supabase MCP against the live `sources` table: no row's `url` canonicalizes to this exact string — the
// one registered EUR-Lex source is `https://eur-lex.europa.eu/`, a DIFFERENT scheme, and
// canonicalize_citation_url — migration 150, confirmed by reading it — never normalizes http vs https, so
// this citation is honestly, correctly ungrounded by both the live SQL and this kit's JS mirror; that
// function's own contract (lowercase / strip `www.` / strip trailing junk) was never meant to paper over a
// literal http-vs-https scheme mismatch, and widening it now would be a much bigger, unrequested change
// than this narrow case needs). The honest fix is upstream of grounding entirely: a "see the website at
// http://example.org" sentence whose only URL is a bare domain root is not a citation of anything specific
// and states no fact this slot needs — it should never have been accepted as a FACT span in the first
// place, the same posture PROSE GUARD above already takes toward page chrome. A span disqualified this way
// is skipped exactly like a menu line: findSlotSpan/findBindingPositionMatch/findDueDateMatch keep walking
// every remaining match, and a document with no other qualifying match honestly falls to GAP (both rows
// have no other jurisdictional_scope trigger match at all — measured against the real captured_text — so
// GAP is the correct, not merely convenient, outcome). A span whose URL carries a real path/query (an
// actual document citation, e.g. a CELEX `legal-content` URL) is untouched by this guard.
const BARE_URL_RE = /https?:\/\/\S+/g;

/** True when every `https?://` URL found in `span` resolves (via the WHATWG URL parser) to a bare host with
 *  no path/query/hash — i.e. the span cites nothing more specific than "the website", never a document. A
 *  span with NO url at all is not affected (returns false: nothing to disqualify it here). An unparsable
 *  URL-shaped substring is treated conservatively as NOT bare (never disqualifies a span this guard cannot
 *  actually confirm is empty-path). Pure. */
export function hasOnlyBareDomainUrls(span) {
  const matches = String(span ?? "").match(BARE_URL_RE);
  if (!matches || matches.length === 0) return false;
  return matches.every((raw) => {
    try {
      const u = new URL(raw);
      return (u.pathname === "" || u.pathname === "/") && u.search === "" && u.hash === "";
    } catch {
      return false;
    }
  });
}

/** True when `span` reads as a clause of prose rather than page chrome or a bare "see the website" pointer. Pure. */
export function isProseSpan(span) {
  const s = String(span ?? "");
  if (PUNCT_RUN.test(s)) return false;
  if (HTML_ENTITY.test(s)) return false; // an unescaped entity means the capture is markup, not the text
  if (hasOnlyBareDomainUrls(s)) return false; // a bare-domain-only URL is a pointer, not a citation

  const words = s.match(/\p{L}{2,}/gu) || [];
  return words.length >= MIN_SPAN_WORDS;
}

/** Find the first triggered, verbatim, prose-like span for `slotKey` in `capturedText`, or null. Pure. */
export function findSlotSpan(slotKey, capturedText) {
  const text = String(capturedText ?? "");
  const triggers = SLOT_TRIGGERS[slotKey] || [];
  for (const re of triggers) {
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    for (const m of text.matchAll(g)) {
      const span = (m[0] || "").trim();
      if (span && isProseSpan(span)) return span;
    }
  }
  return null;
}

function humanizeSlotKey(slotKey) {
  return String(slotKey ?? "").replace(/_/g, " ");
}

// ---------------------------------------------------------------------------
// Claim builders — each returns one claim object (payload-schema.json's `claims[]` shape) or null.
//
// SPAN DELIMITERS ARE GUILLEMETS («…»), NOT STRAIGHT QUOTES. The validator's unicode-integrity scan
// (validate-mint-payload.mjs, Wave MH-3) flags any substitution-class character in prose whose local
// context fuzzy-matches the source but does not strictly match it — straight vs curly quotes being one
// class. A template that wraps a verbatim span in `"…"` puts a straight quote directly against a span
// that itself opens with a curly one («“Member States”, in each place…», UK SI 2018/129, population-turn
// run #9), and the scan read the template's delimiter as a transcription slip. Guillemets belong to no
// substitution class, so the delimiter can never collide with the source's own punctuation.
// ---------------------------------------------------------------------------

/**
 * Identity FACT claim: the item's own title, located verbatim in the captured text. Returns null when
 * `title` or `capturedText` is absent, or when the title cannot be found (case-insensitively) in the
 * text — a title supplied out-of-band (e.g. from census_worklist metadata) that the captured document
 * does not itself literally carry is honestly NOT a FACT claim here (no identity section is emitted for
 * it; see buildRecordPayload), never a fabricated one.
 */
export function extractIdentityFact({ title, capturedText, sourceUrl }) {
  if (!title || !capturedText) return null;
  const hay = String(capturedText).toLowerCase();
  const idx = hay.indexOf(String(title).toLowerCase());
  if (idx === -1) return null;
  // Slice the ORIGINAL captured text (not the caller-supplied title) so the span's exact casing and
  // whitespace come from the source itself — verbatim-by-construction, per this file's header.
  const span = capturedText.slice(idx, idx + title.length);
  assertVerbatim(capturedText, span);
  return {
    section_key: "identity",
    claim_kind: "FACT",
    claim_text: `[title] The captured source's own text carries this item's title verbatim: «${span}»`,
    source_span: span,
    source_url: sourceUrl ?? null,
    slot_key: "title",
  };
}

/**
 * One required-slot claim: a FACT (verbatim span located via SLOT_TRIGGERS) when the captured text
 * states it, else a templated GAP claim naming the slot and the honest absence. Every FACT source_span
 * is re-verified verbatim (assertVerbatim) before being returned — never trust a regex match alone.
 */
export function extractSlotFact({ slotKey, capturedText, sourceUrl }) {
  const span = findSlotSpan(slotKey, capturedText);
  if (span) {
    assertVerbatim(capturedText, span);
    return {
      section_key: "record_facts",
      claim_kind: "FACT",
      claim_text: `[${slotKey}] The captured source states, verbatim: «${span}»`,
      source_span: span,
      source_url: sourceUrl ?? null,
      slot_key: slotKey,
    };
  }
  return {
    section_key: "record_facts",
    claim_kind: "GAP",
    claim_text:
      `[${slotKey}] No verbatim ${humanizeSlotKey(slotKey)} statement was located in the captured ` +
      `source text for this record-grade item. A full-brief regrounding will re-examine this gap when ` +
      `this item upgrades from record to brief.`,
    source_span: null,
    source_url: null,
    slot_key: slotKey,
  };
}

// ---------------------------------------------------------------------------
// BINDING POSITION (Lane INTAKE, 2026-09-02). Spec 01 §1/§3.2: "the single most important new field on
// this surface" -- direct_duty / carrier_passthrough / customer_contract / monitoring_only, the ONE
// shared vocabulary (src/lib/contracts/vocabularies.mjs's BINDING_POSITION), never a private copy of the
// four codes. Located the same way every SLOT_TRIGGERS entry is: a trigger phrase that names WHO the
// applicability language actually binds, walked in priority order (direct_duty first -- a document
// naming both a direct duty-holder phrase and a weaker one elsewhere should report the strongest true
// statement -- monitoring_only last), verbatim-checked, honest GAP when nothing in the captured text
// names a duty-holder class this way. NOT a general legal-NLP classifier -- a coverage floor over the
// phrasing this repo's own corpus (EU/UK/US regulatory instruments) actually uses, exactly the posture
// SLOT_TRIGGERS' own header already documents for the other four slots.
// ---------------------------------------------------------------------------
const BINDING_POSITION_TRIGGERS = Object.freeze({
  direct_duty: [
    /(?:freight forwarders?|forwarding agents?|the forwarder|customs representatives?|indirect customs representatives?|the operator|the undertaking)(?:https?:\/\/\S+|[^.;\n]){0,60}(?:shall|must|is required to|are required to|is obliged to|are obliged to)(?:https?:\/\/\S+|[^.;\n]){0,90}/i,
  ],
  carrier_passthrough: [
    /(?:the carrier|carriers|the shipowners?|the shipping compan(?:y|ies)|the vessel operators?)(?:https?:\/\/\S+|[^.;\n]){0,60}(?:shall|must|is required to|are required to)(?:https?:\/\/\S+|[^.;\n]){0,90}/i,
  ],
  customer_contract: [
    /(?:the customers?|the shippers?|the consignors?)(?:https?:\/\/\S+|[^.;\n]){0,60}(?:shall|must|is required to|are required to|may request|may require)(?:https?:\/\/\S+|[^.;\n]){0,90}/i,
    /contractual (?:clause|obligation|requirement)(?:https?:\/\/\S+|[^.;\n]){0,90}/i,
  ],
  monitoring_only: [
    /not yet (?:in force|applicable|binding)(?:https?:\/\/\S+|[^.;\n]){0,90}/i,
    /does not (?:currently )?appl(?:y|ies) to(?:https?:\/\/\S+|[^.;\n]){0,90}/i,
  ],
});
const BINDING_POSITION_PRIORITY = Object.freeze(["direct_duty", "carrier_passthrough", "customer_contract", "monitoring_only"]);

/**
 * Find the first triggered, verbatim, prose-like binding-position match, walked in priority order.
 * Returns `{code, span}` (code is always a real `BINDING_POSITION` member — adopted, never invented) or
 * null when the captured text names no duty-holder class this way. Pure.
 */
export function findBindingPositionMatch(capturedText) {
  const text = String(capturedText ?? "");
  for (const code of BINDING_POSITION_PRIORITY) {
    if (!BINDING_POSITION[code]) continue; // defensive: only ever walk a real vocabulary member
    for (const re of BINDING_POSITION_TRIGGERS[code] || []) {
      const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
      for (const m of text.matchAll(g)) {
        const span = (m[0] || "").trim();
        if (span && isProseSpan(span)) return { code, span };
      }
    }
  }
  return null;
}

/** binding_position claim: a FACT naming the resolved vocab code plus the verbatim applicability span it
 *  came from, or an honest GAP. The claim itself also carries `binding_position` (the resolved code, or
 *  null) so buildRecordPayload can lift it onto `item.binding_position` without re-deriving it. */
export function extractBindingPositionFact({ capturedText, sourceUrl }) {
  const match = findBindingPositionMatch(capturedText);
  if (match) {
    assertVerbatim(capturedText, match.span);
    return {
      section_key: "record_facts",
      claim_kind: "FACT",
      claim_text:
        `[binding_position] The captured source's own applicability language places this item at ` +
        `«${match.code}» (${BINDING_POSITION[match.code].label}), from the passage: «${match.span}»`,
      source_span: match.span,
      source_url: sourceUrl ?? null,
      slot_key: "binding_position",
      binding_position: match.code,
    };
  }
  return {
    section_key: "record_facts",
    claim_kind: "GAP",
    claim_text:
      "[binding_position] No verbatim applicability language naming a duty-holder class was located in " +
      "the captured source text for this record-grade item. A full-brief regrounding will re-examine " +
      "this gap when this item upgrades from record to brief.",
    source_span: null,
    source_url: null,
    slot_key: "binding_position",
    binding_position: null,
  };
}

// ---------------------------------------------------------------------------
// DUE DATE + PRECISION (Lane INTAKE, 2026-09-02). Spec 01 §3.3's "four dates, never one" names the
// product failure of collapsing entry-into-force / date-of-application / first-deadline / enforcement
// into a single field; this extractor does NOT attempt to say which of the four a located date is (that
// judgement needs surrounding legal structure this $0 extractor does not model) — it locates ONE
// verbatim due-date-shaped span (deliberately close to primary_deadline's own triggers, since "when must
// something be done" is what both ask) and classifies its PRECISION from the matched text's own shape —
// day / month / quarter / year — honest GAP when no due-date-shaped span is found at all.
// ---------------------------------------------------------------------------
const DUE_DATE_TRIGGERS = Object.freeze([
  /due (?:date|by)(?:https?:\/\/\S+|[^.;\n]){0,90}/i,
  /no later than(?:https?:\/\/\S+|[^.;\n]){0,90}/i,
  /\bby\s+\d{1,2}\s+\w+\s+\d{4}(?:https?:\/\/\S+|[^.;\n]){0,70}/i,
  /\bwithin\s+\d+\s+(?:days?|months?|years?)(?:\s+of|\s+from|\s+after)?(?:https?:\/\/\S+|[^.;\n]){0,90}/i,
]);
const DATE_PRECISION_PATTERNS = Object.freeze([
  { precision: "day", re: /\b\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/i },
  { precision: "day", re: /\b\d{4}-\d{2}-\d{2}\b/ },
  { precision: "quarter", re: /\bQ[1-4]\s?\d{4}\b/i },
  { precision: "quarter", re: /\b(?:first|second|third|fourth)\s+quarter\s+of\s+\d{4}\b/i },
  { precision: "month", re: /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/i },
  { precision: "year", re: /\b(?:19|20)\d{2}\b/ },
]);

/**
 * Classify a located due-date span's precision from its own text shape — day/month/quarter checked
 * before the bare-year fallback, so "1 January 2027" resolves to "day", not "year". Returns null when
 * the span carries no recognisable calendar-date shape at all (e.g. "within 30 days" — a duration, not a
 * date). Pure.
 */
export function inferDatePrecision(span) {
  const s = String(span ?? "");
  for (const { precision, re } of DATE_PRECISION_PATTERNS) {
    if (re.test(s)) return precision;
  }
  return null;
}

/** Find the first triggered, verbatim, prose-like due-date span, or null. Pure. */
export function findDueDateMatch(capturedText) {
  const text = String(capturedText ?? "");
  for (const re of DUE_DATE_TRIGGERS) {
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    for (const m of text.matchAll(g)) {
      const span = (m[0] || "").trim();
      if (span && isProseSpan(span)) return span;
    }
  }
  return null;
}

/** due_date claim: a FACT carrying the verbatim span plus its inferred `date_precision`, or an honest GAP. */
export function extractDueDateFact({ capturedText, sourceUrl }) {
  const span = findDueDateMatch(capturedText);
  if (span) {
    assertVerbatim(capturedText, span);
    const precision = inferDatePrecision(span);
    return {
      section_key: "record_facts",
      claim_kind: "FACT",
      claim_text:
        `[due_date] The captured source states a due date` +
        (precision ? ` (date_precision: ${precision})` : "") +
        `, verbatim: «${span}»`,
      source_span: span,
      source_url: sourceUrl ?? null,
      slot_key: "due_date",
      date_precision: precision,
    };
  }
  return {
    section_key: "record_facts",
    claim_kind: "GAP",
    claim_text:
      "[due_date] No verbatim due-date statement was located in the captured source text for this " +
      "record-grade item. A full-brief regrounding will re-examine this gap when this item upgrades " +
      "from record to brief.",
    source_span: null,
    source_url: null,
    slot_key: "due_date",
    date_precision: null,
  };
}

// ---------------------------------------------------------------------------
// CORRIDOR IDENTITY (Lane INTAKE, 2026-09-02). ADR-024 decision 4 / CORRIDOR_ID_SCHEME
// (src/lib/entities/decisions.mjs, read-only): a corridor's identity is a UN/LOCODE port-pair + mode.
// This extractor locates a LITERAL UN/LOCODE pair (two 5-character codes, e.g. "CNSHA-NLRTM") joined by
// a lane-shaped separator, then looks for a transport-mode word in the same neighbourhood
// (src/lib/contracts/vocabularies.mjs's `normaliseMode`, which already accepts the standards' own
// wording — "sea"/"maritime" alongside the canonical "ocean"). ONLY WHEN BOTH ENDS AND A MODE ARE STATED
// does this emit a FACT — this module never geocodes a port NAME into a LOCODE (that would be invention,
// not extraction) and never mints the `cl:corridor:*` entity id itself (CORR lane's entity-id.mjs owns
// that hash function; this module only supplies the SEED the scheme documents, `ORIGIN-DEST:mode`, so a
// later pass can mint the id without re-deriving the components).
// ---------------------------------------------------------------------------
const LOCODE_PAIR_RE = /\b([A-Z]{2}[A-Z0-9]{3})\s?(?:[-–—]|to|>)\s?([A-Z]{2}[A-Z0-9]{3})\b/g;
const CORRIDOR_WINDOW_CHARS = 80;
const MODE_WORD_RE = /\b(ocean|sea|maritime|water|vessel|marine|road|truck|lorry|hgv|rail|air|freighter|airfreight|inland[- ]waterway|barge|iww)\b/i;

/**
 * Find a verbatim UN/LOCODE pair with a mode word in its immediate neighbourhood. Returns
 * `{origin, dest, mode, span}` (mode already canonicalised via `normaliseMode`) or null when no pair
 * carries a recognisable mode nearby. Pure.
 */
export function findCorridorMatch(capturedText) {
  const text = String(capturedText ?? "");
  for (const m of text.matchAll(LOCODE_PAIR_RE)) {
    const [full, origin, dest] = m;
    const start = Math.max(0, m.index - CORRIDOR_WINDOW_CHARS);
    const end = Math.min(text.length, m.index + full.length + CORRIDOR_WINDOW_CHARS);
    const window = text.slice(start, end);
    const modeMatch = window.match(MODE_WORD_RE);
    if (!modeMatch) continue;
    const mode = normaliseMode(modeMatch[0]);
    if (!mode) continue;
    return { origin: origin.toUpperCase(), dest: dest.toUpperCase(), mode, span: window.trim() };
  }
  return null;
}

/**
 * corridor_identity claim: a FACT carrying the origin/dest UN/LOCODE pair, the canonical mode, and the
 * `ORIGIN-DEST:mode` seed CORRIDOR_ID_SCHEME documents (never the minted `cl:corridor:*` id itself — see
 * this section's header), or an honest GAP when both ends and a mode are not stated together.
 */
export function extractCorridorFact({ capturedText, sourceUrl }) {
  const match = findCorridorMatch(capturedText);
  if (match) {
    assertVerbatim(capturedText, match.span);
    const seed = `${match.origin}-${match.dest}:${match.mode}`;
    return {
      section_key: "record_facts",
      claim_kind: "FACT",
      claim_text:
        `[corridor_identity] The captured source names a lane between «${match.origin}» and «${match.dest}» ` +
        `by ${match.mode}, verbatim: «${match.span}»`,
      source_span: match.span,
      source_url: sourceUrl ?? null,
      slot_key: "corridor_identity",
      corridor_identity: {
        origin_locode: match.origin,
        dest_locode: match.dest,
        mode: match.mode,
        seed,
        scheme_basis: CORRIDOR_ID_SCHEME.basis,
      },
    };
  }
  return {
    section_key: "record_facts",
    claim_kind: "GAP",
    // NOT "corridor identity requires both ends stated" -- a bare "requires" in an all-GAP section (no
    // FACT claim tied to it) trips validate-mint-payload.mjs criterion 4's unlabeled-assertion scan
    // (UNLABELED_MODAL_RE), a real regression this exact wording caused (scripts/producers/market/
    // propose-series-items.test.mjs, caught by this lane's own gate run, 2026-09-02) -- fixed by never
    // spelling a bare modal word into GAP boilerplate, the same posture every other GAP template here
    // already keeps.
    claim_text:
      "[corridor_identity] No verbatim UN/LOCODE port-pair and mode were located together in the " +
      "captured source text for this record-grade item — corridor identity is only stated when both " +
      "ends are named together. A full-brief regrounding will re-examine this gap when this item " +
      "upgrades from record to brief.",
    source_span: null,
    source_url: null,
    slot_key: "corridor_identity",
    corridor_identity: null,
  };
}

/** Route a required-slot key to its specialised extractor when one exists, else the generic
 *  SLOT_TRIGGERS path (extractSlotFact). Keeps buildRecordFacts' loop uniform regardless of which slots
 *  a given item_type's required-slots list names. */
function buildRecordSlotClaim(slotKey, { capturedText, sourceUrl }) {
  if (slotKey === "binding_position") return extractBindingPositionFact({ capturedText, sourceUrl });
  if (slotKey === "due_date") return extractDueDateFact({ capturedText, sourceUrl });
  if (slotKey === "corridor_identity") return extractCorridorFact({ capturedText, sourceUrl });
  return extractSlotFact({ slotKey, capturedText, sourceUrl });
}

// item_type families the OPTIONAL, always-attempted additions below apply to (this file's own header
// explains why these two are additive-by-item_type rather than entries in item-type-required-slots.json
// for the five pre-existing regulation-family item_types).
const REGULATION_FAMILY_TYPES = new Set([
  "regulation", "directive", "standard", "guidance", "framework",
]);
const MARKET_FAMILY_TYPES = new Set(["market_signal", "initiative"]);

/**
 * Build every claim a record-grade payload needs: the identity FACT (when locatable), one claim per
 * entry in `requiredSlots` (FACT when found, GAP otherwise, routed through `buildRecordSlotClaim` so
 * binding_position/due_date/corridor_identity get their specialised extractor even when a caller's
 * required-slots list already names them — the two new FR item_types, or a future coordinator sync of
 * the live table), PLUS the OPTIONAL, always-attempted family additions this lane adds (Lane INTAKE,
 * 2026-09-02 — see this file's header): binding_position + due_date for the whole regulation family,
 * corridor_identity for the market family, and the two research-credibility signals for
 * research_finding — each guarded by `requiredSlots.includes(...)` so a slot already produced by the
 * required-slots loop above is never duplicated. Pure; no I/O. `requiredSlots` is the caller-supplied
 * list for this item's item_type (scripts/mint/item-type-required-slots.json) — this module never reads
 * that file itself (see this file's header: no I/O). `itemType` is optional and BACKWARD COMPATIBLE: a
 * caller that omits it (as every caller predating this lane does) gets none of the optional family
 * additions, byte-identical to this function's pre-2026-09-02 behaviour.
 */
export function buildRecordFacts({ title, sourceUrl, capturedText, requiredSlots = [], itemType = null }) {
  const claims = [];
  const identity = extractIdentityFact({ title, capturedText, sourceUrl });
  if (identity) claims.push(identity);
  for (const slotKey of requiredSlots) {
    claims.push(buildRecordSlotClaim(slotKey, { capturedText, sourceUrl }));
  }

  if (REGULATION_FAMILY_TYPES.has(itemType)) {
    if (!requiredSlots.includes("binding_position")) claims.push(extractBindingPositionFact({ capturedText, sourceUrl }));
    if (!requiredSlots.includes("due_date")) claims.push(extractDueDateFact({ capturedText, sourceUrl }));
  }
  if (MARKET_FAMILY_TYPES.has(itemType) && !requiredSlots.includes("corridor_identity")) {
    claims.push(extractCorridorFact({ capturedText, sourceUrl }));
  }
  if (itemType === "research_finding") {
    if (!requiredSlots.includes("evidence_agreement_signal")) {
      claims.push(extractSlotFact({ slotKey: "evidence_agreement_signal", capturedText, sourceUrl }));
    }
    if (!requiredSlots.includes("source_authority_signal")) {
      claims.push(extractSlotFact({ slotKey: "source_authority_signal", capturedText, sourceUrl }));
    }
  }

  return claims;
}

/**
 * Assemble `item.full_brief` for a record-grade payload: boilerplate (digit-free, so it can never
 * introduce an ungrounded Gate-A token — see this file's header) plus each claim's own `claim_text`,
 * verbatim, grouped FACT-then-GAP. Every figure/date token in the result is therefore also present in
 * the FACT-claim corpus Gate A scans against, by construction.
 */
export function buildRecordFullBrief({ sourceUrl, claims }) {
  const factLines = claims.filter((c) => c.claim_kind === "FACT").map((c) => `- ${c.claim_text}`);
  const gapLines = claims.filter((c) => c.claim_kind === "GAP").map((c) => `- ${c.claim_text}`);
  const parts = ["*Catalogue record: extracted facts only, full brief pending.*"];
  if (factLines.length) parts.push("", "## Verbatim facts", "", ...factLines);
  if (gapLines.length) parts.push("", "## Not stated in the captured source", "", ...gapLines);
  parts.push("", `Source: ${sourceUrl}`);
  return parts.join("\n");
}

/**
 * Build a complete record-grade mint payload (payload-schema.json shape, `item.grade = "record"`) from
 * one already-captured source document. Pure; no I/O, no DB, no network — `capturedText`/`fetchedLength`
 * must already be resolved by the caller (run-mint-batch.mjs's --census-rows path reads the file; a
 * future runtime caller would pass an already-fetched agent_run_searches row).
 *
 * @param {object} input
 * @param {string} input.sourceUrl          -- becomes item.source_url and search_results[0].result_url
 * @param {string} input.itemType           -- one of item-type-required-slots.json's keys. ALSO (Lane
 *   INTAKE, 2026-09-02) selects the optional, always-attempted family additions this function now runs
 *   through buildRecordFacts: the regulation family (regulation/directive/standard/guidance/framework/
 *   ) gets item.binding_position + item.due_date/date_precision; the market
 *   family (market_signal/initiative) gets item.corridor_identity; research_finding gets
 *   item.research_credibility — every one of these lands on `item` as FACT-derived data or an honest
 *   null (GAP), never invented. An item_type outside every family gets null for all five.
 * @param {string} input.title
 * @param {string} [input.instrumentIdentifier]
 * @param {string} [input.canonicalInstrumentKey]
 * @param {string} [input.jurisdictionIso]
 * @param {string} [input.priority]         -- default "MODERATE"
 * @param {object} input.source             -- the registered `sources` row (payload-schema.json shape)
 * @param {string} input.capturedText       -- the FULL fetched document text
 * @param {number} [input.fetchedLength]    -- defaults to capturedText.length (Wave MH-3 capture-completeness)
 * @param {string[]} [input.requiredSlots]  -- item-type-required-slots.json[itemType], caller-supplied
 * @param {{verdict: string, provenance: string, basis: string}|null} [input.screen] -- Lane WSEQ
 *   (2026-09-02). The relevance-screen verdict (scripts/mint/lib/screen-verdict.mjs) the census row this
 *   payload was built from cleared at export -- carried straight through, never recomputed here (this
 *   module has no I/O and does not know the row's title/surface_tags to re-derive it). Becomes
 *   `payload.screen` so validate-mint-payload.mjs's kit check can enforce it structurally. A caller that
 *   omits it (or passes null) gets a payload the validator correctly quarantines
 *   (`screen_verdict_missing`) rather than one that silently skips the screen -- see that check's own
 *   header for the incident this closes.
 * @returns {object} a payload-schema.json-shaped mint payload
 */
export function buildRecordPayload({
  sourceUrl,
  itemType,
  title,
  instrumentIdentifier = null,
  canonicalInstrumentKey = null,
  jurisdictionIso = null,
  priority = "MODERATE",
  source,
  capturedText,
  fetchedLength,
  requiredSlots = [],
  screen = null,
}) {
  if (!sourceUrl) throw new Error("record-facts: buildRecordPayload requires sourceUrl");
  if (!itemType) throw new Error("record-facts: buildRecordPayload requires itemType");
  if (!title) throw new Error("record-facts: buildRecordPayload requires title");
  if (!source || !source.id) throw new Error("record-facts: buildRecordPayload requires a registered source (source.id)");
  if (typeof capturedText !== "string" || capturedText.trim() === "") {
    throw new Error("record-facts: buildRecordPayload requires non-empty capturedText");
  }

  const claims = buildRecordFacts({ title, sourceUrl, capturedText, requiredSlots, itemType });
  const fullBrief = buildRecordFullBrief({ sourceUrl, claims });

  const identityClaims = claims.filter((c) => c.section_key === "identity");
  const slotClaims = claims.filter((c) => c.section_key === "record_facts");

  // Lane INTAKE (2026-09-02): lift the structured facts the new claim builders already computed onto
  // `item` as payload fields — never re-derived, always read back from the SAME claim object the
  // extractor returned, so a field here can never disagree with its own claim_text/source_span.
  const bindingClaim = claims.find((c) => c.slot_key === "binding_position");
  const dueDateClaim = claims.find((c) => c.slot_key === "due_date");
  const corridorClaim = claims.find((c) => c.slot_key === "corridor_identity");
  const evidenceClaim = claims.find((c) => c.slot_key === "evidence_agreement_signal");
  const authorityClaim = claims.find((c) => c.slot_key === "source_authority_signal");
  const researchCredibility =
    evidenceClaim || authorityClaim
      ? {
          evidence_agreement_signal: evidenceClaim?.claim_kind === "FACT" ? evidenceClaim.source_span : null,
          source_authority_signal: authorityClaim?.claim_kind === "FACT" ? authorityClaim.source_span : null,
        }
      : null;

  const sections = [];
  if (identityClaims.length) {
    sections.push({
      section_key: "identity",
      section_order: 1,
      content_md: identityClaims.map((c) => c.claim_text).join("\n"),
    });
  }
  sections.push({
    section_key: "record_facts",
    section_order: 2,
    content_md: slotClaims.map((c) => c.claim_text).join("\n"),
  });
  sections.push({
    section_key: "sources_and_citations",
    section_order: 3,
    content_md: `Source: ${sourceUrl}`,
  });

  return {
    _proof_note:
      `record-facts.mjs ${RECORD_FACTS_VERSION} — deterministic, no-LLM, $0 extraction from the captured ` +
      `source text. Every FACT source_span is a verbatim (case-insensitive) substring of search_results[0].result_content, ` +
      `re-checked by assertVerbatim before emission.`,
    item: {
      source_url: sourceUrl,
      item_type: itemType,
      priority,
      title,
      instrument_identifier: instrumentIdentifier,
      canonical_instrument_key: canonicalInstrumentKey,
      jurisdiction_iso: jurisdictionIso,
      full_brief: fullBrief,
      grade: "record",
      // Lane INTAKE (2026-09-02): null whenever the item_type's family didn't trigger the extractor
      // (e.g. a market_signal item has no binding_position) OR the family did trigger but the source
      // didn't state it — GAP, never invented, per this file's header discipline.
      binding_position: bindingClaim?.binding_position ?? null,
      due_date: dueDateClaim?.claim_kind === "FACT" ? dueDateClaim.source_span : null,
      date_precision: dueDateClaim?.date_precision ?? null,
      corridor_identity: corridorClaim?.corridor_identity ?? null,
      research_credibility: researchCredibility,
    },
    source,
    // Lane WSEQ (2026-09-02): the relevance-screen verdict this row cleared at export, carried through
    // unmodified. Top-level (not under `item`), alongside `_proof_note` -- see this function's own
    // screen doc above and validate-mint-payload.mjs's kit check.
    screen,
    registry_sources: [],
    sections,
    search_results: [
      {
        result_url: sourceUrl,
        result_title: title,
        search_query: "canonical:record-grade",
        result_index: 0,
        result_content: capturedText,
        fetched_length: typeof fetchedLength === "number" ? fetchedLength : capturedText.length,
      },
    ],
    claims,
  };
}

export default buildRecordPayload;
