// label.mjs — the coarse {statutory | estimate | M} label every spec09 calculator attaches to a derived
// value (lane brief: "every derived value carries a label {statutory|estimate|M}; M where the source
// discloses nothing"). NOT a new vocabulary: this module classifies the EXISTING, canonical `derivation`
// vocabulary (src/lib/contracts/envelope.mjs DERIVATION, 9 values) into the brief's own three-bucket
// scheme, and separately exposes `missing()` for the "source discloses nothing" case (SDMX `M`,
// src/lib/contracts/vocabularies.mjs OBS_STATUS.M — "Missing, reason unknown").
//
// WHY A SEPARATE COARSE LABEL RATHER THAN JUST USING DERIVATION DIRECTLY. Every value this module labels
// ALSO carries its precise `derivation` (statutory_formula, modelled, calculated, ...) — nothing here
// replaces that. The coarse label exists because spec 09's own text repeatedly reasons at exactly this
// two-way split ("STATUTORY / ESTIMATE" is the worked-contrast heading in spec 08 §4's own example) plus
// the explicit missing case, and every spec09 component needs the SAME three-way switch to pick a render
// treatment (StatutoryFigure-style vs EstimatedFigure-style vs the empty state) without re-deriving it
// per call site.
//
// PLAIN ESM, ZERO DEPENDENCIES beyond the two canonical vocabulary modules — importable by node --test
// with no bundler, matching every other file in src/lib/contracts/.

import { DERIVATION } from "../contracts/envelope.mjs";

export const SPEC09_LABELS = Object.freeze(["statutory", "estimate", "M"]);

/**
 * Classify a `derivation` value (from the canonical DERIVATION vocabulary) into the coarse
 * {statutory|estimate} bucket. An unrecognised or absent derivation is never guessed into either bucket
 * — it returns "M", the same way a genuinely missing value would, because a value with no known
 * derivation is exactly as unusable as one with no value.
 */
export function spec09Label(derivation) {
  const entry = derivation == null ? null : DERIVATION[derivation];
  if (!entry) return "M";
  return entry.statutory === true ? "statutory" : "estimate";
}

/** True when `derivation` classifies as the "statutory" bucket. */
export function isStatutoryLabel(derivation) {
  return spec09Label(derivation) === "statutory";
}

/**
 * Build a labelled value. `reason` is required when value is null/undefined (the "M" case) — a missing
 * value with no stated reason is exactly the silent-absence failure mode spec 00 §4 names ("never one
 * grey dash"), so this constructor refuses to build one.
 *
 * @template {Record<string, unknown>} [E=Record<string, never>]
 * @param {*} value
 * @param {string|null} derivation
 * @param {E} [extra]
 * @returns {Readonly<{ label: "statutory"|"estimate"|"M", derivation: string|null, value: * } & E>}
 * JSDoc generic (not enforced — checkJs is off — but consumed by every .tsx caller via allowJs, so this
 * is what lets TypeScript see the caller-supplied `extra` fields (e.g. deltaPct, exceedsLeg) on the
 * returned object rather than widening them away to `{}`.
 */
export function labelled(value, derivation, extra = {}) {
  if (value === null || value === undefined) {
    throw new TypeError("label.mjs labelled(): a null/undefined value must go through missing(reason), not labelled() — a coarse M needs a stated reason.");
  }
  return Object.freeze({ label: spec09Label(derivation), derivation, value, ...extra });
}

/** The explicit "M" (missing, reason unknown unless stated) result. `reason` is required and non-empty —
 *  see spec 00 §4: "never zero-fill... a missing emission factor is M, never 0." */
export function missing(reason, extra = {}) {
  if (!reason || typeof reason !== "string" || !reason.trim()) {
    throw new TypeError("label.mjs missing(): a reason string is required — an unexplained M is the silent-absence failure this module exists to prevent.");
  }
  return Object.freeze({ label: "M", derivation: null, value: null, reason, ...extra });
}
