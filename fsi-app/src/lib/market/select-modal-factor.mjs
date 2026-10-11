/**
 * @typedef {object} EmissionFactorCandidate
 * @property {string} mode              e.g. "road", "rail" — must match emission_factors.mode verbatim.
 * @property {string|null} jurisdiction ISO 3166-1 alpha-2, or 'EU'/'GLOBAL' — must match
 *                                       emission_factors.jurisdiction verbatim (this module compares
 *                                       case-insensitively, but never mutates the stored value). The
 *                                       column is nullable (migration 258); a null-jurisdiction row
 *                                       simply never matches any normalized token, same as any other
 *                                       non-match.
 * @property {number|null} [ttw_co2e]
 * @property {number|null} [wtt_co2e]
 * @property {number|null} [wtw_co2e]
 * (any other emission_factors columns are passed through untouched on the winning row)
 */
/**
 * Normalize a single jurisdiction token for comparison: trim, uppercase. Never mutates stored data —
 * this is a comparison key only, and the caller-facing states below always echo back what was GIVEN
 * (see `no_factor`'s `jurisdiction` and `ambiguous`'s `jurisdictions`), not this normalized form.
 * @param {unknown} raw
 * @returns {string} "" for anything that is not a non-empty string once trimmed.
 */

function normalizeToken(raw) {
  return typeof raw === "string" ? raw.trim().toUpperCase() : "";
}

/**
 * Select the modal-default emission factor for a market signal's jurisdiction array, per the ruling in
 * this file's header. Pure — no I/O.
 *
 * @param {object} input
 * @param {unknown} input.jurisdictionIso   The signal's raw `jurisdiction_iso` value — expected to be a
 *   string array, but this function tolerates `null`/`undefined`/non-array input by treating it as `[]`
 *   rather than throwing, since a malformed column value is exactly the kind of thing that must fail into
 *   an honest pending state, never a crash.
 * @param {EmissionFactorCandidate[]} [input.factors] Candidate emission_factors rows to select among.
 *   Expected to already be scoped to an eligible set by the caller (e.g. `tier = 'modal_default'`,
 *   `superseded_by IS NULL`) — see MODE above.
 * @param {string|null} [input.mode] Optional exact-match mode filter (e.g. "road"). Never inferred here.
 * @returns {
 *   | { state: "resolved", factor: EmissionFactorCandidate }
 *   | { state: "ambiguous", jurisdictions: string[] }
 *   | { state: "no_factor", jurisdiction: string|null, reason: "empty"|"global"|"no_match"|"no_mode_basis" }
 * }
 */
export function selectModalFactor({ jurisdictionIso, factors, mode = null } = {}) {
  const arr = Array.isArray(jurisdictionIso) ? jurisdictionIso : [];
  const candidates = Array.isArray(factors) ? factors : [];

  // ── AMBIGUOUS: more than one jurisdiction element, full stop ──────────────────────────────────────
  // Checked on the RAW array length before any normalization, and returned even if one element of the
  // array has a matching row (see header). `jurisdictions` echoes the array as given.
  if (arr.length > 1) {
    return { state: "ambiguous", jurisdictions: arr.slice() };
  }

  // ── Zero elements: no basis at all ─────────────────────────────────────────────────────────────────
  if (arr.length === 0) {
    return { state: "no_factor", jurisdiction: null, reason: "empty" };
  }

  // ── Exactly one element ─────────────────────────────────────────────────────────────────────────────
  const raw = arr[0];
  const norm = normalizeToken(raw);

  if (!norm) {
    // e.g. [""], [null], [undefined], [42] — a single slot with nothing usable in it.
    return { state: "no_factor", jurisdiction: null, reason: "empty" };
  }

  // "GLOBAL" (any case/whitespace) is explicitly not a jurisdiction that can key a national modal
  // default — see header. Never resolves, regardless of what factor rows exist.
  if (norm === "GLOBAL") {
    return { state: "no_factor", jurisdiction: raw, reason: "global" };
  }

  const normMode = typeof mode === "string" && mode.trim() ? mode.trim().toLowerCase() : null;

  const byJurisdiction = candidates.filter((f) => normalizeToken(f && f.jurisdiction) === norm);
  const byJurisdictionAndMode = normMode
    ? byJurisdiction.filter((f) => typeof f?.mode === "string" && f.mode.trim().toLowerCase() === normMode)
    : byJurisdiction;

  if (byJurisdiction.length === 0) {
    return { state: "no_factor", jurisdiction: raw, reason: "no_match" };
  }

  // Mode was given and filtered the set — resolve only on an exact single survivor.
  if (normMode) {
    if (byJurisdictionAndMode.length === 1) {
      return { state: "resolved", factor: byJurisdictionAndMode[0] };
    }
    return { state: "no_factor", jurisdiction: raw, reason: "no_match" };
  }

  // No mode given: resolve only if the jurisdiction alone was unambiguous (a single candidate row,
  // mode moot). More than one candidate row for the same jurisdiction (today's live case: US road vs
  // US rail) means there IS a factor, just not a single one to serve without a mode to choose by —
  // "no basis to pick a mode" (see header MODE section) — so this is `no_factor`, never a guess.
  if (byJurisdiction.length === 1) {
    return { state: "resolved", factor: byJurisdiction[0] };
  }
  return { state: "no_factor", jurisdiction: raw, reason: "no_mode_basis" };
}
