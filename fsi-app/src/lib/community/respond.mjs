// respond.mjs — pure validation/decision logic for POST /api/community/benchmarks/[key]/respond
// (spec 05 §1, §3, required components 3, 4; docs/dispatches lane COMMUNITY-C). PURE — no database, no
// fetch, no Date.now() read internally. The route composes this module's evaluateResponseSubmission()
// with organisation-key.mjs's deriveOrganisationKey() and benchmark.mjs's
// isOpenForResponses()/aggregateBenchmarkResponses(), never re-implementing any of those three checks
// itself (COMMON lane contract, "no duplication of an existing module").

/** Sane bounds per field_key (spec 05 §1: "value validated per field_key... in a data table"), matching
 * migration 294's field_key CHECK and scripts/community/seed-benchmark-instruments.mjs
 * CALENDAR_TEMPLATES' own units for the three live instruments (saf_premium_pct, rate_per_feu,
 * capacity_teu). A bound this generous is a fat-finger guard, not a plausibility model: refusing
 * $2,000,000/FEU catches a misplaced decimal or a unit mix-up, it does not second-guess a genuine
 * outlier rate. wage_per_hour/pricing carry no seeded instrument yet (no CALENDAR_TEMPLATES entry names
 * them) but are included because migration 294's field_key CHECK already allows them — a future
 * instrument using one of these two degrades to this module's own registered bound rather than the
 * unregistered-field refusal below. */
export const FIELD_BOUNDS = Object.freeze({
  saf_premium_pct: { min: 0, max: 100, label: "%" },
  rate_per_feu: { min: 0, max: 200_000, label: "USD" },
  wage_per_hour: { min: 0, max: 500, label: "USD/hour" },
  capacity_teu: { min: 0, max: 2_000_000, label: "TEU" },
  pricing: { min: 0, max: 10_000_000, label: "" },
});

/**
 * @param {number} value
 * @param {string} fieldKey
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function validateResponseValue(value, fieldKey) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { ok: false, error: "value_numeric must be a finite number" };
  }
  if (value < 0) {
    return { ok: false, error: "value_numeric must be non-negative" };
  }
  const bounds = FIELD_BOUNDS[fieldKey];
  if (!bounds) {
    return { ok: false, error: `"${fieldKey}" has no registered value bounds` };
  }
  if (value < bounds.min || value > bounds.max) {
    return {
      ok: false,
      error:
        `value_numeric for "${fieldKey}" must be between ${bounds.min} and ${bounds.max}` +
        (bounds.label ? ` ${bounds.label}` : ""),
    };
  }
  return { ok: true };
}

/**
 * The full write-time decision for a response submission, composing three independent gates
 * (verification/org-key, open window, value bounds) into one refusal-or-accept shape the route
 * translates directly into an HTTP response. Does not itself call deriveOrganisationKey() or
 * isOpenForResponses() — the caller supplies their already-computed results, keeping this function pure
 * and testable without touching org-key derivation or the system clock. Checked in this order because
 * each earlier refusal is cheaper to explain and more likely to be the one the member needs fixed first
 * (spec 05 §1: "Refusals carry a plain reason").
 *
 * @param {{
 *   organisationKeyResult: { organisationKey: string|null, refused: boolean, reason: string|null },
 *   instrumentOpen: boolean,
 *   instrumentStatus: string,
 *   value: number,
 *   fieldKey: string,
 * }} input
 * @returns {{ accepted: true } | { accepted: false, reason: string }}
 */
export function evaluateResponseSubmission({
  organisationKeyResult,
  instrumentOpen,
  instrumentStatus,
  value,
  fieldKey,
}) {
  if (!organisationKeyResult || organisationKeyResult.refused || !organisationKeyResult.organisationKey) {
    const why = organisationKeyResult?.reason ?? "no organisation_key on file";
    return { accepted: false, reason: `unverified: ${why}` };
  }
  if (!instrumentOpen) {
    return {
      accepted: false,
      reason: `closed: this instrument is not open for responses (status: ${instrumentStatus ?? "unknown"})`,
    };
  }
  const valueCheck = validateResponseValue(value, fieldKey);
  if (!valueCheck.ok) {
    return { accepted: false, reason: `out of bounds: ${valueCheck.error}` };
  }
  return { accepted: true };
}
