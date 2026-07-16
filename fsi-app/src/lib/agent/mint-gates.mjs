// mint-gates.mjs — the mint-time accuracy/provenance gate evaluator (hardening A1, seams 2+4).
// PURE (no DB, no I/O) so both the report-only pipeline wiring AND the read-only calibration script apply the
// SAME logic (one implementation, two callers). A gate result is HOLD-not-reject / would-have-held: a hit
// flags a FACT for review, never a fabrication verdict, never a certification input.
//
// Four gates (per the operator's calibration spec):
//   - genericSource   (per FACT): the FACT resolved to NO valid specific source — null source_id, or a
//                     source that is SUSPENDED (generic/dead junk-drawer). The nothing-generic rule at mint.
//   - authorityFloor  (per FACT): the FACT's stored grounding tier is BELOW the item's per-type floor.
//   - spanNumeric     (per FACT): S-NUMERIC — a significant figure in the claim absent from its span.
//   - identityCongruence (per ITEM): S-CONFLATE — one span reused across >=3 FACTs naming >=2 instruments,
//                     at least one absent from the span. Runs over the item's FACT set (detectConflate).
//
// The per-FACT gates are perFactGates(); the per-ITEM identity gate is detectConflate (re-exported from the
// shared matcher module). authorityFloorFor gives the per-type floor (reused from source-blocks).

import { detectNumeric, detectConflate } from "./defect-signatures.mjs";

export { detectConflate };

/** Per-FACT gates. Returns null for a non-FACT (gates apply to FACT claims only), else
 *  { genericSource, authorityFloor, spanNumeric } booleans (true = would-have-held).
 *  @param fact {claim_kind, claim_text, source_span, source_id, source_tier_at_grounding, id?}
 *  @param ctx  {itemFloor:number|null, suspendedSourceIds:Set<string>|Iterable<string>} */
export function perFactGates(fact, ctx = {}) {
  if (!fact || String(fact.claim_kind).toUpperCase() !== "FACT") return null;
  const susp = ctx.suspendedSourceIds instanceof Set ? ctx.suspendedSourceIds : new Set(ctx.suspendedSourceIds || []);
  const itemFloor = ctx.itemFloor;
  return {
    // no valid specific source: unregistered (null) OR resolved to a suspended/generic/dead row
    genericSource: fact.source_id == null || susp.has(fact.source_id),
    // below the per-type authority floor (a lower authority tier is a HIGHER number, so > floor = below it)
    authorityFloor: itemFloor != null && fact.source_tier_at_grounding != null && fact.source_tier_at_grounding > itemFloor,
    // a significant numeric figure in the claim that does not appear in its supporting span
    spanNumeric: !!detectNumeric({ idx: 0, id: fact.id ?? null, claim_text: fact.claim_text, source_span: fact.source_span }),
  };
}

/** Would this FACT be held at mint by ANY per-FACT gate? (identity-congruence is per-ITEM, checked separately.) */
export function perFactWouldHold(fact, ctx = {}) {
  const g = perFactGates(fact, ctx);
  return !!g && (g.genericSource || g.authorityFloor || g.spanNumeric);
}

/** Item-level: the set of FACT ids the identity-congruence (S-CONFLATE) gate would hold. Returns a Set<id>. */
export function identityCongruenceHolds(itemFacts) {
  const facts = (itemFacts || []).filter((f) => String(f.claim_kind).toUpperCase() === "FACT")
    .map((f, i) => ({ idx: i + 1, id: f.id ?? i + 1, claim_text: f.claim_text, source_span: f.source_span }));
  return new Set(detectConflate(facts).map((h) => h.id));
}
