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
