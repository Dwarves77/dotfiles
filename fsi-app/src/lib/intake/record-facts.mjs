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

export const RECORD_FACTS_VERSION = "rf1-2026-09-01.1";

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
const SLOT_TRIGGERS = Object.freeze({
  effective_date: [
    /entered? into force[^.;\n]{0,90}/i,
    /shall enter into force[^.;\n]{0,90}/i,
    /shall apply from[^.;\n]{0,90}/i,
    /applicable since[^.;\n]{0,90}/i,
  ],
  primary_deadline: [
    /no later than[^.;\n]{0,90}/i,
    /\bby\s+\d{1,2}\s+\w+\s+\d{4}[^.;\n]{0,70}/i,
    /\bdeadline\b[^.;\n]{0,90}/i,
  ],
  jurisdictional_scope: [
    /member states?[^.;\n]{0,90}/i,
    /european union[^.;\n]{0,90}/i,
    /\bapplies to\b[^.;\n]{0,90}/i,
    /addressed to[^.;\n]{0,90}/i,
  ],
  penalty_summary: [
    /penalt(?:y|ies)[^.;\n]{0,110}/i,
    /\bfine[sd]?\b[^.;\n]{0,110}/i,
    /sanctions?[^.;\n]{0,110}/i,
  ],
});

/** Find the first triggered, verbatim span for `slotKey` in `capturedText`, or null. Pure. */
export function findSlotSpan(slotKey, capturedText) {
  const text = String(capturedText ?? "");
  const triggers = SLOT_TRIGGERS[slotKey] || [];
  for (const re of triggers) {
    const m = text.match(re);
    if (m && m[0] && m[0].trim()) return m[0].trim();
  }
  return null;
}

function humanizeSlotKey(slotKey) {
  return String(slotKey ?? "").replace(/_/g, " ");
}

// ---------------------------------------------------------------------------
// Claim builders — each returns one claim object (payload-schema.json's `claims[]` shape) or null.
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
    claim_text: `[title] The captured source's own text carries this item's title verbatim: "${span}"`,
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
      claim_text: `[${slotKey}] The captured source states, verbatim: "${span}"`,
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

/**
 * Build every claim a record-grade payload needs: the identity FACT (when locatable) plus one claim per
 * entry in `requiredSlots` (FACT when found, GAP otherwise). Pure; no I/O. `requiredSlots` is the
 * caller-supplied list for this item's item_type (scripts/mint/item-type-required-slots.json) — this
 * module never reads that file itself (see this file's header: no I/O).
 */
export function buildRecordFacts({ title, sourceUrl, capturedText, requiredSlots = [] }) {
  const claims = [];
  const identity = extractIdentityFact({ title, capturedText, sourceUrl });
  if (identity) claims.push(identity);
  for (const slotKey of requiredSlots) {
    claims.push(extractSlotFact({ slotKey, capturedText, sourceUrl }));
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
 * @param {string} input.itemType           -- one of item-type-required-slots.json's keys
 * @param {string} input.title
 * @param {string} [input.instrumentIdentifier]
 * @param {string} [input.canonicalInstrumentKey]
 * @param {string} [input.jurisdictionIso]
 * @param {string} [input.priority]         -- default "MODERATE"
 * @param {object} input.source             -- the registered `sources` row (payload-schema.json shape)
 * @param {string} input.capturedText       -- the FULL fetched document text
 * @param {number} [input.fetchedLength]    -- defaults to capturedText.length (Wave MH-3 capture-completeness)
 * @param {string[]} [input.requiredSlots]  -- item-type-required-slots.json[itemType], caller-supplied
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
}) {
  if (!sourceUrl) throw new Error("record-facts: buildRecordPayload requires sourceUrl");
  if (!itemType) throw new Error("record-facts: buildRecordPayload requires itemType");
  if (!title) throw new Error("record-facts: buildRecordPayload requires title");
  if (!source || !source.id) throw new Error("record-facts: buildRecordPayload requires a registered source (source.id)");
  if (typeof capturedText !== "string" || capturedText.trim() === "") {
    throw new Error("record-facts: buildRecordPayload requires non-empty capturedText");
  }

  const claims = buildRecordFacts({ title, sourceUrl, capturedText, requiredSlots });
  const fullBrief = buildRecordFullBrief({ sourceUrl, claims });

  const identityClaims = claims.filter((c) => c.section_key === "identity");
  const slotClaims = claims.filter((c) => c.section_key === "record_facts");

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
    },
    source,
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
