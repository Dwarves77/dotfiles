// @ts-check
// LEDGER DOMINANCE GUARD (operator ruling 2026-07-14, doctrine "re-grounds-never-destroy"). A re-ground's new
// claim ledger REPLACES the prior one ONLY when it is not WEAKER than the prior on any dominance axis. A worse
// answer is a DIAGNOSTIC, not a replacement — a regressing re-ground retains the prior ledger, records the
// regression as a finding, and leaves the item state unchanged. This is the ONE HOME for "is this re-ground a
// regression?" (supersedes the count-only thinning-guard; no shadow — a single predicate, one place).
//
// WHY THE COUNT-ONLY GUARD WAS BLIND (Brazil Lei 12.305, 55 FACT -> 2 GAP, the red fixture): two defects.
//   (a) SEQUENCING — the section step's blanket delete CASCADE-wiped section_claim_provenance (section_row_id
//       FK ON DELETE CASCADE) BEFORE groundBrief could snapshot the prior ledger, so priorCount read 0 and the
//       guard had nothing to protect. (Cured at the write site: sectionBrief now reconciles by section_key, so a
//       non-verified item's ledger survives into groundBrief's snapshot — see canonical-pipeline.sectionBrief.)
//   (b) WEAK RULE — the guard compared TOTAL count only, so a 55 FACT -> 55 GAP re-ground (facts destroyed,
//       count preserved) would slip through. The dominance rule below adds the FACT and FLOOR-QUALIFYING axes.
//
// THE THREE DOMINANCE AXES (operator-named): FACT count, FLOOR-QUALIFYING count, VERIFIED-eligibility. Pure
// predicates here so the rule is red-then-green goldened; the caller supplies the summaries + the would-verify
// booleans (grounding computes them from the prior snapshot and the freshly-built ledger).

// Don't guard tiny prior grounding (a 3 -> 1 fact drop is noise, not a regression); only guard real grounding.
export const FACT_FLOOR = 4;
// Back-compat alias for the legacy name (the count axis is the old thinning threshold).
export const THINNING_FLOOR = FACT_FLOOR;

/**
 * Summarize a claim ledger into the dominance axes. Pure.
 * @param {Array<{claim_kind?:string|null, source_tier_at_grounding?:number|null}>} claims
 * @param {number|null} [itemFloor]  the item's authority-floor tier (null = floor-EXEMPT item type)
 * @returns {{ total:number, facts:number, floorQualifying:number }}
 */
export function summarizeLedger(claims, itemFloor = null) {
  const rows = Array.isArray(claims) ? claims : [];
  let facts = 0, floorQualifying = 0;
  for (const c of rows) {
    if (c && c.claim_kind === "FACT") {
      facts += 1;
      const t = c.source_tier_at_grounding;
      if (itemFloor != null && typeof t === "number" && t <= itemFloor) floorQualifying += 1;
    }
  }
  return { total: rows.length, facts, floorQualifying };
}

/** collapse = the candidate dropped BELOW HALF a non-trivial (>= floor) prior. Pure.
 *  @param {number} prior @param {number} next @param {number} [floor] @returns {boolean} */
function collapsed(prior, next, floor = FACT_FLOOR) {
  const p = Number(prior) || 0, n = Number(next) || 0;
  if (p < floor) return false;              // tiny prior — a drop is not a meaningful regression
  return n < Math.ceil(p / 2);              // collapsed to below half the prior (N.facts===0 is caught here too)
}

/**
 * Would committing `next` over `prior` be a coverage/attribution REGRESSION? True when the candidate is weaker
 * on ANY dominance axis:
 *   - total            — total count collapsed below half a non-trivial prior (the legacy thinning axis, kept),
 *   - facts            — FACT count collapsed below half a non-trivial prior (fall-to-zero is a collapse),
 *   - floor_qualifying — floor-qualifying FACT count fell to ZERO from a non-zero prior (lost all floor grounding),
 *   - verified_eligibility — prior would verify, candidate would not.
 * Pure. In the canonical pipeline verified items short-circuit before re-ground, so the verified axis is
 * belt-and-suspenders there (protected upstream by the skip-if-verified guards); the axis exists for the rule's
 * completeness and any other caller. Returns the axes so the finding names WHY.
 * @param {{total:number,facts:number,floorQualifying:number,wouldVerify?:boolean}} prior
 * @param {{total:number,facts:number,floorQualifying:number,wouldVerify?:boolean}} next
 * @param {{floor?:number}} [opts]
 * @returns {{regression:boolean, axes:string[]}}
 */
export function ledgerRegression(prior, next, opts = {}) {
  const floor = opts.floor ?? FACT_FLOOR;
  const P = prior || { total: 0, facts: 0, floorQualifying: 0 };
  const N = next || { total: 0, facts: 0, floorQualifying: 0 };
  const axes = [];
  if (collapsed(P.total, N.total, floor)) axes.push("total");
  if (collapsed(P.facts, N.facts, floor)) axes.push("facts");
  // floor-qualifying axis: lost ALL floor-grounded facts — guarded only for a non-trivial prior (>= floor
  // facts), so losing 1 floor-qualifying fact on a tiny 3-fact ledger stays exempt like the count axes.
  if ((Number(P.facts) || 0) >= floor && (Number(P.floorQualifying) || 0) > 0 && (Number(N.floorQualifying) || 0) === 0) axes.push("floor_qualifying");
  if (P.wouldVerify === true && N.wouldVerify === false) axes.push("verified_eligibility");
  return { regression: axes.length > 0, axes };
}

/**
 * Legacy count-only predicate, preserved so existing call sites and goldens keep working. Expressed via the
 * total axis of the dominance rule.
 * @param {number} priorCount @param {number} newCount @param {number} [floor] @returns {boolean}
 */
export function isThinningRegression(priorCount, newCount, floor = FACT_FLOOR) {
  return collapsed(priorCount, newCount, floor);
}
