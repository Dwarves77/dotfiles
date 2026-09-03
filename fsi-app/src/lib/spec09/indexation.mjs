// indexation.mjs — spec 09 §1.3's dynamic carbon contract indexation: MECHANICS AND ARITHMETIC ONLY.
// Spec 09 §5 open decision 2, taken with its own stated conservative default: "drafted text reads as
// legal advice however it is captioned" — this module computes an indexed value and returns the inputs
// that would go into a worked example; it never returns clause TEXT, and draftClauseText() below exists
// only to throw, the same "refuse loudly, don't silently compose" shape surcharge-audit.mjs's
// formatAccusationStatement() uses for its own disallowed output.
//
// Pure functions; no I/O, no fs (F34).

import { labelled, missing } from "./label.mjs";

/**
 * The indexed value at a review point: base_value scaled by the index's movement since base_date, passed
 * through at passthrough_pct, then clamped to [floor_pct, cap_pct] of base_value (spec 09 §1.3's own
 * column set — index_id, base_value/base_date frozen at signature, passthrough_pct, cap_pct, floor_pct).
 *
 * indexMovementPct = (indexCurrent - indexBaseline) / indexBaseline
 * rawAdjustedValue  = baseValue * (1 + indexMovementPct * (passthroughPct / 100))
 * clamped to baseValue * [1 + floorPct/100, 1 + capPct/100] when those are set.
 *
 * `derivation: 'calculated'` — "deterministic function of other observed values under OUR named method...
 * not law" (envelope.mjs's own DERIVATION.calculated note) — an indexation clause is a COMMERCIAL term,
 * never a statutory formula, even though the arithmetic is just as deterministic.
 */
export function computeIndexedValue({ baseValue, indexBaseline, indexCurrent, passthroughPct, capPct = null, floorPct = null }) {
  for (const [name, v] of Object.entries({ baseValue, indexBaseline, indexCurrent, passthroughPct })) {
    if (typeof v !== "number" || !Number.isFinite(v)) {
      return missing(`${name} must be a finite number to compute an indexed value.`);
    }
  }
  if (indexBaseline === 0) return missing("indexBaseline must be non-zero (division by zero).");
  if (passthroughPct < 0 || passthroughPct > 100) return missing("passthroughPct must be between 0 and 100.");

  const indexMovementPct = (indexCurrent - indexBaseline) / indexBaseline;
  const rawMultiplier = 1 + indexMovementPct * (passthroughPct / 100);

  let loMultiplier = -Infinity;
  let hiMultiplier = Infinity;
  if (floorPct !== null && floorPct !== undefined) loMultiplier = 1 + floorPct / 100;
  if (capPct !== null && capPct !== undefined) hiMultiplier = 1 + capPct / 100;
  if (loMultiplier > hiMultiplier) return missing("floorPct exceeds capPct — an inverted band cannot be applied.");

  const clampedMultiplier = Math.min(Math.max(rawMultiplier, loMultiplier), hiMultiplier);
  const wasClamped = clampedMultiplier !== rawMultiplier;
  const value = Math.round(baseValue * clampedMultiplier * 100) / 100;

  return labelled(value, "calculated", {
    indexMovementPct,
    rawValue: Math.round(baseValue * rawMultiplier * 100) / 100,
    wasClamped,
    clampedBy: wasClamped ? (clampedMultiplier === loMultiplier ? "floor" : "cap") : null,
  });
}

/**
 * Exists only to THROW. Spec 09 §5 open decision 2's conservative default: this product supplies the
 * obligation, the index and the computation; the customer's counsel supplies the contract (spec text).
 */
export function draftClauseText() {
  throw new Error(
    "indexation.mjs draftClauseText: refusing. Spec 09 §1.3/§5 decision 2: this module computes clause " +
    "MECHANICS AND ARITHMETIC only — drafted clause text reads as legal advice however it is captioned. " +
    "Use computeIndexedValue() for the worked-example numbers instead."
  );
}
