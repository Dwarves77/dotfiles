// unlocode-names.mjs — human-readable place names for the UN/LOCODE codes the entity spine actually
// holds. Lane SCOPE-READER, 2026-09-06 (operator ruling, same date: "keep spec 08's scoping table,
// build the reader, and make every customer-facing corridor reference human-readable, because nobody
// knows what CNSHA-NLRTM means").
//
// SOURCE OF TRUTH FOR EVERY NAME BELOW: UN/LOCODE — Code List for Trade and Transport Locations,
// maintained by UNECE (UN Economic Commission for Europe), https://unece.org/trade/uncefact/unlocode
// (current edition at authoring time: 2025-1). Each entry cites the code's country + place-name pair
// from that published list, transcribed verbatim — never guessed, never machine-translated, never
// inferred from the code string itself. A code with no entry here renders the RAW CODE, never a
// fabricated name (this module's own `nameForLocode()` returns null on a miss — the caller decides how
// to render that, per the "never guessed" rule; see corridor-scope.ts's own `formatCorridorLabel()`).
//
// ONLY THE CODES THE SPINE ACTUALLY HOLDS (per this lane's brief — not a full UN/LOCODE mirror, which
// would be tens of thousands of entries the product never needs and could drift from the published list
// unnoticed). Live check, 2026-09-06 (Supabase project kwrsbpiseruzbfwjpvsp, `SELECT DISTINCT
// canonical_name FROM entities WHERE kind='corridor'`): four corridors, five distinct UN/LOCODE
// endpoints — CNSHA, NLRTM, USNYC, USLAX, ITGOA (all origin CNSHA per ADR-024's worked example plus the
// three named WCI destinations seed-corridors.mjs falls back to). unlocode-names.test.mjs asserts every
// one of them resolves here, so a fifth corridor whose endpoint this file does not yet name FAILS the
// test rather than silently rendering a raw code in production with nobody noticing until a support
// ticket — the message names exactly which code is missing and where to add it.
//
// PLAIN ESM, ZERO DEPENDENCIES.

/**
 * @typedef {object} LocodeEntry
 * @property {string} place       The place name (city/port), UN/LOCODE column "Name".
 * @property {string} countryIso  ISO 3166-1 alpha-2 (UN/LOCODE's own country-code prefix, per UN/ECE
 *                                 Recommendation 16 §I.4.b — the same convention write-entity-scope.mjs
 *                                 relies on to derive a corridor's jurisdictions from its UN/LOCODE pair).
 * @property {string} countryName Full country name (ISO 3166-1 short name, English).
 */

/** UN/LOCODE -> {place, countryIso, countryName}. Cite: UNECE UN/LOCODE 2025-1 edition. */
export const UNLOCODE_NAMES = Object.freeze({
  CNSHA: Object.freeze({ place: "Shanghai", countryIso: "CN", countryName: "China" }),
  NLRTM: Object.freeze({ place: "Rotterdam", countryIso: "NL", countryName: "Netherlands" }),
  USNYC: Object.freeze({ place: "New York", countryIso: "US", countryName: "United States" }),
  USLAX: Object.freeze({ place: "Los Angeles", countryIso: "US", countryName: "United States" }),
  ITGOA: Object.freeze({ place: "Genoa", countryIso: "IT", countryName: "Italy" }),
});

/** ISO 3166-1 alpha-2 -> full country name, English short name. Same source as UNLOCODE_NAMES
 *  (UNECE UN/LOCODE's own country-code column doubles as ISO 3166-1); kept as a separate lookup so a
 *  jurisdiction entity (canonical_name = bare ISO code, no UN/LOCODE place attached) can still render a
 *  full country name via entity_scope, without inventing a fifth "jurisdiction name" source. Derived
 *  from UNLOCODE_NAMES above (never hand-typed a second time) plus nothing else — a jurisdiction touched
 *  by a corridor is, by construction, one of the countryIso values already present above. */
export const JURISDICTION_NAMES = Object.freeze(
  Object.fromEntries(
    Object.values(UNLOCODE_NAMES).map((e) => [e.countryIso, e.countryName]),
  ),
);

/** UN/LOCODE -> place name, or null when this file has no entry (never guessed — see header). Pure. */
export function nameForLocode(code) {
  const key = String(code ?? "").trim().toUpperCase();
  return UNLOCODE_NAMES[key]?.place ?? null;
}

/** ISO 3166-1 alpha-2 -> country name, or null when this file has no entry. Pure. */
export function nameForJurisdiction(iso) {
  const key = String(iso ?? "").trim().toUpperCase();
  return JURISDICTION_NAMES[key] ?? null;
}

/**
 * Build a customer-facing corridor label from its UN/LOCODE pair + mode, e.g.
 * "Shanghai (CN) → Rotterdam (NL), ocean" — the exact style ADR-024 §4 itself argues for ("A customer
 * can be shown 'Shanghai–Rotterdam, ocean' and immediately understand what the number describes").
 * A code with no entry in UNLOCODE_NAMES renders as the RAW CODE (never a fabricated name) — the label
 * degrades gracefully rather than throwing, since a corridor entity always deserves SOME label even
 * before this file is updated for a newly seeded endpoint.
 * @param {{ origin: string, dest: string, mode: string }} corridor
 * @returns {string}
 */
export function formatCorridorLabel({ origin, dest, mode }) {
  const o = UNLOCODE_NAMES[String(origin ?? "").toUpperCase()];
  const d = UNLOCODE_NAMES[String(dest ?? "").toUpperCase()];
  const originLabel = o ? `${o.place} (${o.countryIso})` : String(origin ?? "");
  const destLabel = d ? `${d.place} (${d.countryIso})` : String(dest ?? "");
  const modeLabel = String(mode ?? "").trim();
  return `${originLabel} → ${destLabel}${modeLabel ? `, ${modeLabel}` : ""}`;
}
