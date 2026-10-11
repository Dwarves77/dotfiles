// @ts-check

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
 * The GATE. An item is INELIGIBLE for the paid (generation) queue when EITHER (i) its standing disposition is
 * DELETE — a held dup-loser awaiting deletion on survivor release must never be paid to regenerate — OR
 * (ii) it has ANY unexercised $0 lever (the free lever must run first). Otherwise eligible: the paid path is
 * genuinely warranted. Pure.
 * @param {string[]} failureClasses
 * @param {LeverEvidence} evidence
 * @param {string | null | undefined} [disposition]  standing disposition ("DELETE" = held loser, reject)
 * @returns {{ eligible: boolean, reason: string, levers: {class:string,lever:string,count:number}[] }}
 */
export function paidQueueVerdict(failureClasses, evidence, disposition) {
  if (String(disposition || "").toUpperCase() === "DELETE") {
    return {
      eligible: false,
      reason: "REJECTED from paid queue — standing disposition is DELETE (held dup-loser; delete on survivor release, never pay to regenerate).",
      levers: [],
    };
  }
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
