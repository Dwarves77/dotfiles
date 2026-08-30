// select-modal-factor.mjs — WO-24, re-scoped 2026-08-30 per the ruling in
// docs/plans/unblocking-the-five-2026-08-30.md §2 ("WO-24 — no `%corridor%` join path exists").
//
// THE RULING THIS MODULE IMPLEMENTS. WO-24's original design wanted a carbon-cost overlay keyed on
// CORRIDOR (origin-destination pair). No corridor identity exists anywhere on a Market item today:
// zero columns matching `%corridor%` on `intelligence_items`, zero corridor table, and
// `emission_factors.corridor_id` has nothing to join against. That gap is Gate 2 and it is DEFERRED to
// its own future WO — this module does NOT build corridor identity and does NOT invent a `cl:corridor:`
// id for a live item. What it does instead: key off `intelligence_items.jurisdiction_iso`, a column that
// already exists and is already populated on every Market signal, against the `modal_default` tier of
// `emission_factors` (mode + vehicle class + jurisdiction, no corridor required — see
// src/lib/contracts/factor-tier.mjs's `SCOPE_KINDS.modal`).
//
// THREE STATES, NOT TWO. This is the single most important part of the ruling and the reason this module
// exists rather than a two-line `.find()`. `jurisdiction_iso` is a TEXT ARRAY, and it is NOT uniformly
// one country: of the 77 live `market_signal` rows measured 2026-08-30, 20 carry `["US"]`, 19 carry
// `["GLOBAL"]`, 9 carry `[]`, and roughly a dozen carry MULTI-COUNTRY arrays such as
// `["CN","IR","SG","US"]` or `["ES","FI","GB","NO","PT","SG"]`. Collapsing a multi-country array to "pick
// the first element" or "pick the one with a factor row" is fabricating a corridor out of a jurisdiction
// list — exactly the class of invented claim CLAUDE.md rule 2 forbids. So:
//
//   - `resolved`   — the array has EXACTLY ONE element, it is a real jurisdiction (not "GLOBAL", not
//                    empty), AND a modal-default factor row exists for it (see MODE below). Only this
//                    state may carry a number.
//   - `ambiguous`  — the array has MORE THAN ONE element. Returned even when one or more of those
//                    elements DOES have a matching factor row — picking one element out of
//                    `["CN","IR","SG","US"]` because it happens to be the one we have data for is still a
//                    fabricated corridor; the signal itself never named a single jurisdiction to begin
//                    with, and a partial coincidental match doesn't fix that.
//   - `no_factor`  — a single element (or zero/empty, or "GLOBAL") with no usable factor row.
//                    "GLOBAL" is explicitly NOT a jurisdiction that can key a national modal default: it
//                    names no country, so `emission_factors.jurisdiction` (an ISO 3166-1 alpha-2 code, or
//                    'EU'/'GLOBAL' as a literal factor-scope value — see migration 258) cannot resolve it
//                    to a real published number without picking one arbitrarily. An empty array carries
//                    no basis at all and resolves the same way.
//
// MODE — the second selection axis this module owns, and the second place a wrong guess would fabricate
// a claim. `emission_factors` keys a modal_default row on (mode, vehicle_class, jurisdiction), not on
// jurisdiction alone (see migration 258's `emission_factors_scope_modal` CHECK). The two live rows
// (2026-08-30) are BOTH jurisdiction 'US' and differ only by mode: road (`medium_heavy_duty_truck`) and
// rail (`freight_rail_average`). That means "single jurisdiction, factor exists" is not sufficient by
// itself when more than one mode's factor row shares that jurisdiction — the module must not silently
// pick road over rail (or vice versa) with no basis. Handling, decided and documented here rather than
// left implicit:
//   - An optional `mode` may be passed in. It is used ONLY as an exact-match filter against
//     `factor.mode` (e.g. "road", "rail") — never translated, mapped, or guessed from anything else.
//     Passing a signal's own recorded transport mode (a real field) is fine; inventing one is not this
//     module's job and it will not attempt it.
//   - After filtering candidates to the resolved jurisdiction (and to `mode`, when given), EXACTLY ONE
//     surviving row resolves. ZERO resolves to `no_factor`. MORE THAN ONE — whether because `mode` was
//     omitted and multiple modes exist for that jurisdiction (today's live case for "US"), or because
//     `mode` was given but multiple rows still match — also resolves to `no_factor`, never a guess.
//     Picking among duplicates by recency or tier rank is `factor-tier.mjs`'s `resolveActiveFactor()` job
//     (tier rank, then scope specificity, then recency) and is deliberately NOT reimplemented here: this
//     module owns SELECTION BY JURISDICTION AND MODE ONLY, mirroring the SQL-owns-eligibility /
//     JS-owns-selection split that module's own header documents. Callers are expected to pass an
//     already-eligible candidate set (e.g. `tier = 'modal_default'`, not superseded) — this module does
//     not re-check licence or supersession, the same way it does not re-rank tiers.
//
// WHY THIS IS NOT COLLAPSED TO TWO STATES. A cruder design would return `resolved | not_resolved`. That
// throws away the ONE distinction that matters for the copy a reader sees: "this signal spans multiple
// countries, so no single number applies" is a completely different, more honest claim than "we don't
// have a number for this one country yet" — and conflating them would make the ambiguous case read like a
// simple data gap instead of what it actually is (picking one would be inventing a corridor). Both
// non-resolved states render an honest pending frame; the state discriminant exists so the frame can say
// which honest thing is true.
//
// PLAIN ESM, ZERO DEPENDENCIES, PURE — no I/O, no clock, no Supabase import. Callers own fetching
// `factors` and, if they have one, a real `mode` value.

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
