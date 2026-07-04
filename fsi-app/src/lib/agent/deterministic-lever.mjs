// @ts-check
// DETERMINISTIC-FIRST GATE (spend-routing correction, operator ruling 2026-07-04). The generation-side
// analog of dedup-before-ground: before ANY per-item generation spend, enumerate the item's $0 deterministic
// levers; an item with an UNEXERCISED $0 lever is REJECTED from the paid queue with a named reason, so the
// free operation runs first and the paid path only handles the genuine residual. Pure (no I/O) so the gate
// is red-then-green unit-testable; the impure evidence (which levers are exercisable for THIS item) is
// computed by the caller from stored provenance + pool and passed in.
//
// ROOT CAUSE THIS CLOSES: the $52.97 full-set quote priced full re-synthesis for all 66 items without first
// enumerating deterministic resolution from existing stored data. Generation spend had no mechanical gate.
// This is that gate — the operator never has to be the one who asks "did you check the free lever first?".
//
// WHICH CLASSES CARRY A $0 DATA LEVER (established from validate_item_provenance, migration 145):
//  - fact_below_authority_floor (criterion 3): 4b standalone re-home — re-point source_id/tier/search_result_id
//    on the EXISTING row WHEN a walling FACT's source_span verbatim-matches a floor-qualifying pool source.
//    Exercisable ONLY when such a match exists (reattributeToFloor != null); otherwise no $0 lever (the span
//    is a corroborator paraphrase, needs 4c relabel / re-ground = generation).
//  - fact_span_not_in_source (criterion 3): re-point the span to another POOL source whose content contains
//    it verbatim (any tier). Exercisable only when such a source exists.
// GENERATION-ONLY (no $0 data lever — the label/prose is baked into intelligence_item_sections.content_md,
// or the required content is absent): unlabeled_assertion (criterion 4 line 278 — label in markdown),
// missing_required_slot / no_section_content (criterion 5 — content absent), analysis_missing_label_syntax,
// legal_not_routed_to_callout, legal_claim_mislabeled_analysis. ungrounded_url is CONDITIONAL (register a
// real source = $0 data write, but a hallucinated URL needs a prose edit) — treated as NON-auto-$0 here:
// registration is a per-URL judgment, never a blanket lever, so it does not gate the paid path by itself.

/** Failure classes that CAN carry a $0 deterministic data lever (subject to per-item exercisability). */
export const DETERMINISTIC_LEVER_CLASSES = new Set([
  "fact_below_authority_floor",
  "fact_span_not_in_source",
]);

/** Failure classes with NO $0 data lever — the fix is generation (prose in content_md, or absent content). */
export const GENERATION_ONLY_CLASSES = new Set([
  "unlabeled_assertion",
  "missing_required_slot",
  "no_section_content",
  "analysis_missing_label_syntax",
  "legal_not_routed_to_callout",
  "legal_claim_mislabeled_analysis",
]);

/**
 * @typedef {{ rehomableFacts?: number, repointableSpans?: number }} LeverEvidence
 * rehomableFacts     — # of fact_below_authority_floor walling FACTs whose span verbatim-matches a floor pool
 *                      source (reattributeToFloor != null). Computed by the caller via floor-attribution.mjs.
 * repointableSpans   — # of fact_span_not_in_source FACTs whose span is verbatim in another pool source.
 */

/**
 * Enumerate the item's UNEXERCISED $0 deterministic levers, given its failure classes + evidence. A lever is
 * listed only when its class is present AND the evidence shows it is exercisable now (count > 0). Pure.
 * @param {string[]} failureClasses  distinct failure reasons from validate_item_provenance
 * @param {LeverEvidence} evidence
 * @returns {{ class: string, lever: string, count: number }[]}
 */
export function unexercisedLevers(failureClasses, evidence) {
  const fc = new Set(failureClasses || []);
  const ev = evidence || {};
  const out = [];
  if (fc.has("fact_below_authority_floor") && (ev.rehomableFacts || 0) > 0)
    out.push({ class: "fact_below_authority_floor", lever: "4b-re-home", count: ev.rehomableFacts || 0 });
  if (fc.has("fact_span_not_in_source") && (ev.repointableSpans || 0) > 0)
    out.push({ class: "fact_span_not_in_source", lever: "span-re-point", count: ev.repointableSpans || 0 });
  return out;
}

/**
 * The GATE. An item with ANY unexercised $0 lever is INELIGIBLE for the paid (generation) queue — the free
 * lever must run first. An item with no exercisable $0 lever (all failures generation-only, or a
 * deterministic class with 0 exercisable matches) is eligible: the paid path is genuinely warranted. Pure.
 * @param {string[]} failureClasses
 * @param {LeverEvidence} evidence
 * @returns {{ eligible: boolean, reason: string, levers: {class:string,lever:string,count:number}[] }}
 */
export function paidQueueVerdict(failureClasses, evidence) {
  const levers = unexercisedLevers(failureClasses, evidence);
  if (levers.length) {
    return {
      eligible: false,
      reason: `REJECTED from paid queue — unexercised $0 lever(s): ${levers.map((l) => `${l.class}→${l.lever}(${l.count})`).join(", ")}. Resolve deterministically first (dedup-before-ground analog).`,
      levers,
    };
  }
  return { eligible: true, reason: "no unexercised $0 lever; paid generation pass warranted", levers: [] };
}
