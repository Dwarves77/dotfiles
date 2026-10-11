import { buildRecordPayload, assertVerbatim, isProseSpan, buildRecordFullBrief } from "./record-facts.mjs";

export const RECORD_FACTS_RESEARCH_VERSION = "rfr2-2026-09-02.1";

/** Mirrors record-facts.mjs's own (unexported) humanizeSlotKey -- a small, deliberate duplication of one
 *  line, not of any decision (record-facts.mjs is read-only for this lane; see this file's header). */
function humanizeSlotKey(slotKey) {
  return String(slotKey ?? "").replace(/_/g, " ");
}

// Slots this module always emits a FACT-or-GAP claim for, independent of item-type-required-slots.json's
// research_finding row (which covers only the four base slots record-facts.mjs's generic builder already
// produces a GAP floor for). See this file's header, "THE FIFTH/SIXTH/SEVENTH SLOTS".
export const RESEARCH_ALWAYS_PRESENT_SLOTS = Object.freeze([
  "key_figure",
  "evidence_agreement_signal",
  "source_authority_signal",
]);

// mirror of scripts/mint/item-type-required-slots.json: kept, F34 forbids a filesystem read under src/lib/intake/** even inside a function.
// Mirrors scripts/mint/item-type-required-slots.json's "research_finding" row exactly (a literal, not a
// read: this module lives under src/lib/intake/**, where a filesystem call at module scope fails the F34
// fitness check even inside a function -- record-facts.mjs's own "no I/O" discipline, restated here for
// the same structural reason). A caller that already has the live JSON (research-sweep.mjs, under
// scripts/, is free to read it) may pass its own `requiredSlots` array instead; this is only the default.
export const RESEARCH_FINDING_REQUIRED_SLOTS = Object.freeze([
  "decision_relevance",
  "does_not_resolve",
  "finding",
  "methodology_limits",
]);

// ---------------------------------------------------------------------------
// Slot triggers — LOCATE a span already in the text, never generate one. Deliberately conservative:
// research/analytical prose ("this report finds", "the study's limitations include") rather than legal
// prose. A slot with no match honestly falls back to the GAP claim buildRecordPayload already produced —
// this module never widens what counts as "found," only what it looks for.
// ---------------------------------------------------------------------------
const SLOT_TRIGGERS_RESEARCH = Object.freeze({
  finding: [
    /\b(?:this |the )?(?:study|report|analysis|research|paper|survey|review)\s+finds?\s+that[^.;\n]{0,140}/i,
    /\bwe found that[^.;\n]{0,140}/i,
    /\bfound that[^.;\n]{0,140}/i,
    /\bresults? (?:show|shows|showed|indicate|indicates|indicated)[^.;\n]{0,140}/i,
    /\b(?:study|report|analysis) concludes? that[^.;\n]{0,140}/i,
    /\banalysis shows? that[^.;\n]{0,140}/i,
  ],
  methodology_limits: [
    /\blimitations? of (?:this|the) (?:study|analysis|report|research)[^.;\n]{0,140}/i,
    /\b(?:key |main )?limitations? include[^.;\n]{0,140}/i,
    /\bthis (?:study|analysis|report) (?:is limited|does not account for)[^.;\n]{0,140}/i,
    /\bmethodology[^.;\n]{0,140}/i,
    /\bsample size (?:of|was|is)[^.;\n]{0,110}/i,
    /\bfurther research is needed[^.;\n]{0,140}/i,
  ],
  decision_relevance: [
    /\b(?:policymakers|operators|forwarders|businesses|firms|shippers|carriers) should[^.;\n]{0,140}/i,
    /\bimplications? for[^.;\n]{0,140}/i,
    /\b(?:we |the (?:study|report|authors) )?recommends? that[^.;\n]{0,140}/i,
    /\bfor decision[- ]makers[^.;\n]{0,140}/i,
    /\brelevant to[^.;\n]{0,140}/i,
  ],
  does_not_resolve: [
    /\bdoes not (?:resolve|address|answer|determine|settle)[^.;\n]{0,140}/i,
    /\bremains? unresolved[^.;\n]{0,140}/i,
    /\boutside the scope of (?:this|the)[^.;\n]{0,140}/i,
    /\bfuture (?:work|research) (?:should|will|is needed to)[^.;\n]{0,140}/i,
    /\bdoes not (?:cover|include)[^.;\n]{0,140}/i,
  ],
  // Quantified figures only — a bare noun phrase is not a "key figure." Requires a digit plus a unit,
  // percentage, or currency marker in the matched span (isProseSpan below still guards against chrome).
  key_figure: [
    /[$€£]\s?\d[\d,]*(?:\.\d+)?\s?(?:million|billion|trillion|bn|m|k)?[^.;\n]{0,90}/i,
    /\b\d+(?:\.\d+)?\s?%[^.;\n]{0,90}/,
    /\b\d[\d,]*(?:\.\d+)?\s?(?:tonnes?|tons?|mtco2e?|mt co2e?|kg|kwh|mwh|gwh|gw|mw|km|miles?|litres?|gallons?)\b[^.;\n]{0,90}/i,
  ],
  // Spec 03 §4 "Score 1, evidence base": peer review / replication / systematic-review-or-meta-analysis
  // language, plus the agreement dimension (consensus vs. dissent, consistent-with/contradicts prior
  // research). A statement ABOUT the evidence base, never a computed score (no OpenAlex/ROR call here).
  evidence_agreement_signal: [
    /\bpeer[- ]review(?:ed)?\b[^.;\n]{0,120}/i,
    /\bsystematic review\b[^.;\n]{0,120}/i,
    /\bmeta-analysis\b[^.;\n]{0,120}/i,
    /\bindependently (?:replicated|verified|corroborated|confirmed)\b[^.;\n]{0,120}/i,
    /\bconsistent with (?:prior|previous|other|earlier) (?:research|studies|findings|literature)\b[^.;\n]{0,120}/i,
    /\bcontradicts?[\s-](?:prior|previous|other|earlier) (?:research|studies|findings|literature)\b[^.;\n]{0,120}/i,
    /\bin agreement with[^.;\n]{0,120}/i,
    /\bconsensus (?:among|is|exists|has emerged)\b[^.;\n]{0,120}/i,
    /\b(?:mixed|conflicting|inconclusive) evidence\b[^.;\n]{0,120}/i,
    /\bbased on \d+ (?:studies|papers|sources|datasets|independent)[^.;\n]{0,120}/i,
  ],
  // Spec 03 §4 "Score 2, source authority": role class / institutional mandate / funder independence
  // language the document states about itself -- never a role-class computed from ROR/OpenAlex (no
  // network call here; a deterministic registry-derived reading of `source.source_role` is a SEPARATE,
  // non-fabricated signal the sweep driver already carries in `screen.basis`, see research-sweep.mjs).
  source_authority_signal: [
    /\b(?:this )?(?:study|report|research|analysis) was (?:funded|commissioned|sponsored) by[^.;\n]{0,140}/i,
    /\bindependently (?:funded|conducted)\b[^.;\n]{0,120}/i,
    /\bno (?:conflicts? of interest|competing interests?)\b[^.;\n]{0,120}/i,
    /\bdeclares? no funding\b[^.;\n]{0,120}/i,
    /\bfunded by (?:the )?(?:manufacturer|vendor|industry)\b[^.;\n]{0,140}/i,
    /\ban? (?:university|national laborator(?:y|ies)|standards body|intergovernmental (?:organi[sz]ation|body)|peer-reviewed journal|research institute|non-governmental organi[sz]ation|industry association|think tank)\b[^.;\n]{0,140}/i,
  ],
});

/** Find the first triggered, verbatim, prose-like span for `slotKey`, or null. Pure — same contract as
 *  record-facts.mjs's own (private) findSlotSpan, reusing its exported `isProseSpan` guard so a page-chrome
 *  or markup match (a table border, an `&#xD;` entity) is rejected the same way there, not by a weaker
 *  local rule. */
export function findResearchSlotSpan(slotKey, capturedText) {
  const text = String(capturedText ?? "");
  const triggers = SLOT_TRIGGERS_RESEARCH[slotKey] || [];
  for (const re of triggers) {
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    for (const m of text.matchAll(g)) {
      const span = (m[0] || "").trim();
      if (span && isProseSpan(span)) return span;
    }
  }
  return null;
}

/**
 * One research-slot claim: a FACT when `findResearchSlotSpan` locates a verbatim span, else `null` (the
 * caller keeps whatever GAP claim buildRecordPayload already produced for this slot — this function never
 * itself emits a GAP, so it never duplicates or contradicts the base builder's honest floor).
 */
export function extractResearchSlotFact({ slotKey, capturedText, sourceUrl }) {
  const span = findResearchSlotSpan(slotKey, capturedText);
  if (!span) return null;
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

/**
 * One ALWAYS-PRESENT research-profile claim for `slotKey` (see RESEARCH_ALWAYS_PRESENT_SLOTS): a FACT
 * when `findResearchSlotSpan` locates a verbatim span, else an explicit GAP claim (`gapText` — the
 * caller-supplied honest-absence copy; e.g. key_figure's own "no key figure yet"). Unlike
 * `extractResearchSlotFact` (which returns `null` on no match, letting the caller keep an existing GAP),
 * this ALWAYS returns a claim — used for the three slots that have no base-builder GAP floor to fall back
 * on (item-type-required-slots.json's research_finding row does not name them).
 */
export function extractAlwaysPresentResearchFact({ slotKey, capturedText, sourceUrl, gapText }) {
  const span = findResearchSlotSpan(slotKey, capturedText);
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
    claim_text: `[${slotKey}] ${gapText}`,
    source_span: null,
    source_url: null,
    slot_key: slotKey,
  };
}

/**
 * Build a complete research-grade record payload (payload-schema.json shape, `item.grade = "record"`,
 * `item.item_type = "research_finding"`) from one already-captured source document. Pure; no I/O.
 *
 * SEQUENCE: (1) call the shared, unmodified `buildRecordPayload` for the base shape — identity claim,
 * record purity, `screen` plumbing, and one FACT-or-honest-GAP claim per `requiredSlots` entry using its
 * own generic triggers (which have no research_finding entries, so every required slot starts as a GAP —
 * see record-facts.mjs's own header). (2) For each of THIS module's slot triggers that finds a real
 * verbatim span, REPLACE that slot's GAP claim with a FACT. (3) Append three ALWAYS-PRESENT FACT-or-GAP
 * claims — `key_figure`, `evidence_agreement_signal`, `source_authority_signal` (see this file's header,
 * "THE FIFTH/SIXTH/SEVENTH SLOTS") — each a FACT when the source states one, else an explicit, honest GAP
 * (never simply omitted). (4) Rebuild the `record_facts` section content and `item.full_brief` from
 * the final claim set via record-facts.mjs's own exported `buildRecordFullBrief`, so the
 * "every FACT source_span appears in full_brief" invariant validate-mint-payload.mjs's record-purity check
 * enforces stays true by construction, exactly as it does for the base builder's own claims.
 *
 * @param {object} input — same shape as buildRecordPayload's, minus `itemType` (always "research_finding")
 * @param {string[]} [input.requiredSlots] — defaults to RESEARCH_FINDING_REQUIRED_SLOTS
 * @returns {object} a payload-schema.json-shaped mint payload
 */
export function buildResearchRecordPayload({
  sourceUrl,
  title,
  instrumentIdentifier = null,
  canonicalInstrumentKey = null,
  jurisdictionIso = null,
  priority = "MODERATE",
  source,
  capturedText,
  fetchedLength,
  requiredSlots = RESEARCH_FINDING_REQUIRED_SLOTS,
  screen = null,
}) {
  const base = buildRecordPayload({
    sourceUrl,
    itemType: "research_finding",
    title,
    instrumentIdentifier,
    canonicalInstrumentKey,
    jurisdictionIso,
    priority,
    source,
    capturedText,
    fetchedLength,
    requiredSlots,
    screen,
  });

  // Upgrade any GAP this module's own triggers can verbatim-locate — never touch a non-GAP claim, and
  // never touch a GAP outside the record_facts section (record-facts.mjs's identity claim is always FACT
  // or absent, so this guard is defensive, not load-bearing today).
  const upgradedClaims = base.claims.map((c) => {
    if (c.section_key !== "record_facts" || c.claim_kind !== "GAP" || !c.slot_key) return c;
    const fact = extractResearchSlotFact({ slotKey: c.slot_key, capturedText, sourceUrl });
    return fact ?? c;
  });

  // ALWAYS-PRESENT slots — key_figure plus the two spec-03-§4 credibility inputs (see this file's header,
  // "THE FIFTH/SIXTH/SEVENTH SLOTS"). Each is a FACT (verbatim span) or an explicit, honest GAP — never
  // simply absent, so the claim set always names these three even when the source states none of them.
  upgradedClaims.push(
    extractAlwaysPresentResearchFact({
      slotKey: "key_figure",
      capturedText,
      sourceUrl,
      gapText:
        "No verbatim quantified figure (digit plus a unit/%/currency marker) was located in the " +
        "captured source text — no key figure yet, matching the Research surface's own honest em-dash " +
        "state (docs/design/redesign/DESIGN-DEVIATIONS.md D06-2) until the source itself carries one.",
    }),
  );
  for (const slotKey of ["evidence_agreement_signal", "source_authority_signal"]) {
    upgradedClaims.push(
      extractAlwaysPresentResearchFact({
        slotKey,
        capturedText,
        sourceUrl,
        gapText:
          `No verbatim ${humanizeSlotKey(slotKey)} statement (docs/specs/03-research.md §4 credibility ` +
          "input) was located in the captured source text for this record-grade item. Neither the " +
          "evidence-base/agreement signal nor the source-authority signal is ever inferred or computed " +
          "here (that needs OpenAlex/ROR, out of scope for a no-cost lane) — an honest GAP when the " +
          "document does not itself say so, re-examined when this item upgrades from record to brief.",
      }),
    );
  }

  const slotClaims = upgradedClaims.filter((c) => c.section_key === "record_facts");
  const sections = base.sections.map((s) =>
    s.section_key === "record_facts" ? { ...s, content_md: slotClaims.map((c) => c.claim_text).join("\n") } : s
  );
  const fullBrief = buildRecordFullBrief({ sourceUrl, claims: upgradedClaims });

  return {
    ...base,
    item: { ...base.item, full_brief: fullBrief },
    sections,
    claims: upgradedClaims,
    _proof_note:
      `${base._proof_note} Layered with record-facts-research.mjs ${RECORD_FACTS_RESEARCH_VERSION} — ` +
      `research-profile slot extraction (finding/methodology_limits/decision_relevance/does_not_resolve) ` +
      `over the base record-facts.mjs GAP floor, plus three always-present FACT-or-GAP claims: ` +
      `key_figure, evidence_agreement_signal, source_authority_signal (docs/specs/03-research.md §4).`,
  };
}

export default buildResearchRecordPayload;
