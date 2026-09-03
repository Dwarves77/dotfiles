// surcharge-audit.mjs — spec 09 §1.2's carrier surcharge audit, built FIRST per spec §4 ("the only
// [Market Intel component] with an immediate cash payback to the user"). Pure functions; no I/O, no fs
// (F34), no DB access — every function here takes plain numbers/strings and returns a labelled result
// (src/lib/spec09/label.mjs).
//
// THE ISOLATION DISCIPLINE THIS FILE ENFORCES IN CODE, NOT ONLY IN A COMMENT (spec text, verbatim
// intent): "your billed surcharge exceeds the statutory liability by €X" is DEFENSIBLE — billed (observed,
// the customer's own invoice) against statutory (statutory_formula, citable) — and is the only sentence
// this module ever formats. "Your carrier is overcharging you by €Y" requires the MODELLED pool position
// (carrier_compliance_pools) and is an accusation this product cannot support; spec 09 §5 open decision 1
// is taken with its own conservative default ("hold it internally and publish only the statutory
// variance"), so poolAdjustedGuard() below always refuses to surface it, and formatAccusationStatement()
// exists only to THROW — a caller that reaches for the disallowed sentence gets a loud refusal, not a
// silently-composed string.

import { labelled, missing } from "./label.mjs";

function round2(n) {
  return Math.round(n * 100) / 100;
}

const CURRENCY_SYMBOL = Object.freeze({ EUR: "€", USD: "$", GBP: "£" });

function formatMoney(amount, currency) {
  const symbol = CURRENCY_SYMBOL[currency] ?? `${currency} `;
  return `${symbol}${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * billed_eur - statutory_eur. The database already stores this as a GENERATED column
 * (surcharge_audits.variance_eur); this function exists so the same arithmetic is available to a caller
 * that has not yet written the row (a producer computing what it is ABOUT to insert) without duplicating
 * the formula by hand. Labelled 'statutory_formula': the number's defensibility rests on the statutory
 * side of the subtraction, which is what makes the resulting sentence citable.
 */
export function computeVariance({ billedEur, statutoryEur }) {
  if (typeof billedEur !== "number" || !Number.isFinite(billedEur)) {
    return missing("billedEur must be a finite number (the customer's own invoice line)");
  }
  if (typeof statutoryEur !== "number" || !Number.isFinite(statutoryEur)) {
    return missing("statutoryEur must be a finite number (the statutory_formula liability)");
  }
  return labelled(round2(billedEur - statutoryEur), "statutory_formula", { billedEur, statutoryEur });
}

/**
 * The ONE sentence this table is allowed to put in front of a customer: billed vs statutory, defensible,
 * observed against statutory_formula. `statutoryBasis` is the provision cited (surcharge_audits.
 * statutory_basis, NOT NULL at the DB layer) and is always included — a variance number with no cited
 * basis is not defensible, it is just a number.
 */
export function formatDefensibleStatement({ varianceEur, statutoryBasis, currency = "EUR" }) {
  if (typeof varianceEur !== "number" || !Number.isFinite(varianceEur)) {
    throw new TypeError("surcharge-audit.mjs formatDefensibleStatement: varianceEur must be a finite number.");
  }
  if (!statutoryBasis || !String(statutoryBasis).trim()) {
    throw new TypeError("surcharge-audit.mjs formatDefensibleStatement: statutoryBasis (the cited provision) is required.");
  }
  if (varianceEur === 0) {
    return `Your billed surcharge matches the statutory liability (${statutoryBasis}).`;
  }
  const direction = varianceEur > 0 ? "exceeds" : "is below";
  return `Your billed surcharge ${direction} the statutory liability by ${formatMoney(Math.abs(varianceEur), currency)} (${statutoryBasis}).`;
}

/**
 * Spec 09 §5 open decision 1, taken with its own stated conservative default: pool-position inference
 * (carrier_compliance_pools) stays internal; a customer-facing accusation about the carrier's actual
 * commercial position is never surfaced by this product. ALWAYS returns allowed:false — this is not a
 * conditional gate a caller can satisfy, it is a standing refusal that documents WHY, so a future
 * operator ruling to publish it has exactly one place to change (and a test that will need updating,
 * which is the point).
 */
export function poolAdjustedGuard({ poolAdjustedEur = null, poolId = null } = {}) {
  return Object.freeze({
    allowed: false,
    reason:
      "pool-position inference is held internal per spec 09 §5 open decision 1 (the spec's own " +
      "conservative default: 'hold it internally and publish only the statutory variance'). Publishing " +
      "it is a commercial risk call for the operator to make, not a technical one — unmade here.",
    internalValue: poolAdjustedEur,
    poolId,
  });
}

/**
 * Exists only to THROW. A caller reaching for "your carrier is overcharging you by €Y" — the accusation
 * sentence spec text explicitly names as unsupportable — gets a loud refusal naming why, rather than a
 * silently composed string a render layer could accidentally ship. Mirrors the "mandatory refusal state"
 * spec 08 §4 requires of a forecasting method that cannot decline (same discipline, applied here).
 */
export function formatAccusationStatement() {
  throw new Error(
    "surcharge-audit.mjs formatAccusationStatement: refusing. 'Your carrier is overcharging you by €Y' " +
    "requires the modelled pool position and is an accusation this product does not support (spec 09 §1.2, " +
    "§5 decision 1). Use formatDefensibleStatement() — billed vs statutory — instead."
  );
}
