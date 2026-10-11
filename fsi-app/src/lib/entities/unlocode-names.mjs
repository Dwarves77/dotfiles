/**
 * @typedef {object} LocodeEntry
 * @property {string} place       The place name (city/port), UN/LOCODE column "Name".
 * @property {string} countryIso  ISO 3166-1 alpha-2 (UN/LOCODE's own country-code prefix, per UN/ECE
 *                                 Recommendation 16 §I.4.b — the same convention write-entity-scope.mjs
 *                                 relies on to derive a corridor's jurisdictions from its UN/LOCODE pair).
 * @property {string} countryName Full country name (ISO 3166-1 short name, English).
 */

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

/**
 * The COMPACT corridor label artboard 04 (`id="p4"`) draws in the rail's CARBON COST PER FEU card,
 * e.g. "Shanghai – Rotterdam · ocean" — the same UN/LOCODE pair and mode `formatCorridorLabel`
 * renders, in the artboard's own separators and without the country parentheticals.
 *
 * WHY A SECOND FORM (lane market63, 2026-09-08). The rail is 300px wide and the card's content box
 * is 266px. Measured in chromium: the full label ("Shanghai (CN) → Rotterdam (NL), ocean") needs
 * three lines in that card and the artboard's own compact string needs two, which is the wrap the
 * operator ruled out ("corridor name on one line, not two"). This form is what the artboard itself
 * prints, so the rail row carries it and the FULL label stays on the row's `title`. Nothing else in
 * the product changes form: `formatCorridorLabel` is still the one label for the overlay section,
 * the detail surfaces and the spine.
 *
 * Pure, and it invents nothing: a code with no UNLOCODE_NAMES entry renders as the RAW CODE, the
 * same graceful degradation `formatCorridorLabel` makes.
 * @param {{ origin: string, dest: string, mode: string }} corridor
 * @returns {string}
 */
export function formatCorridorLabelCompact({ origin, dest, mode }) {
  const o = UNLOCODE_NAMES[String(origin ?? "").toUpperCase()];
  const d = UNLOCODE_NAMES[String(dest ?? "").toUpperCase()];
  const originLabel = o ? o.place : String(origin ?? "");
  const destLabel = d ? d.place : String(dest ?? "");
  const modeLabel = String(mode ?? "").trim();
  return `${originLabel} – ${destLabel}${modeLabel ? ` · ${modeLabel}` : ""}`;
}
