// ══════════════════════════════════════════════════════════════
// Jurisdiction tiers (W2.D)
// ══════════════════════════════════════════════════════════════
//
// Tier 1 = "must cover" — every Caro's Ledge workspace, regardless of
//   sector profile, expects intelligence and active sources for these.
//   Coverage gaps here are the loudest signal in the admin matrix.
//
// Tier 2 = "should cover" — high-value secondary jurisdictions with
//   non-trivial freight or regulatory weight. Gaps are surfaced but
//   carry less urgency.
//
// Tier 3 = "long tail" — populate on customer demand. Not enumerated.
//   `jurisdictionTier(iso)` returns 3 if the code parses as ISO but
//   isn't in tiers 1 or 2; returns null for completely unknown codes.
//
// City handling: ISO 3166-2 reserves the second component for first-
// level subdivisions (states, provinces, regions). Cities are not
// canonical ISO codes, so we map them to the most-canonical-state
// code that contains them. This is a Tier 1 placeholder until the
// platform adopts a richer city schema.
//   NYC → US-NY      San Francisco → US-CA       Los Angeles → US-CA
//   Boston → US-MA   Chicago → US-IL              Seattle → US-WA
//   Denver → US-CO   London → GB-ENG             Tokyo → JP-13
//   (JP-13 is the ISO 3166-2 code for Tokyo Metropolis.)
// Each city is collapsed onto its parent ISO code in this list — a
// future Tier 1 expansion can add explicit US-NY-NYC-style codes if
// the schema starts emitting them.
// ══════════════════════════════════════════════════════════════

import { extractCountryFromIso, isIsoCode } from "./iso";

// ── Tier 1 ────────────────────────────────────────────────────

// All US states + DC + 5 inhabited territories.
const TIER_1_US: ReadonlyArray<string> = [
  "US",
  "US-AL", "US-AK", "US-AZ", "US-AR", "US-CA", "US-CO", "US-CT", "US-DE",
  "US-FL", "US-GA", "US-HI", "US-ID", "US-IL", "US-IN", "US-IA", "US-KS",
  "US-KY", "US-LA", "US-ME", "US-MD", "US-MA", "US-MI", "US-MN", "US-MS",
  "US-MO", "US-MT", "US-NE", "US-NV", "US-NH", "US-NJ", "US-NM", "US-NY",
  "US-NC", "US-ND", "US-OH", "US-OK", "US-OR", "US-PA", "US-RI", "US-SC",
  "US-SD", "US-TN", "US-TX", "US-UT", "US-VT", "US-VA", "US-WA", "US-WV",
  "US-WI", "US-WY",
  "US-DC",
  // Territories: Puerto Rico, US Virgin Islands, Guam, Northern Mariana
  // Islands, American Samoa.
  "US-PR", "US-VI", "US-GU", "US-MP", "US-AS",
];

// EU 27 — alpha-2 codes for each member state, plus the EU itself.
const TIER_1_EU: ReadonlyArray<string> = [
  "EU",
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR",
  "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK",
  "SI", "ES", "SE",
];

// United Kingdom — country + 4 devolved nations.
const TIER_1_UK: ReadonlyArray<string> = [
  "GB",
  "GB-ENG", "GB-SCT", "GB-WLS", "GB-NIR",
];

// Canada — federal + 10 provinces + 3 territories.
const TIER_1_CA: ReadonlyArray<string> = [
  "CA",
  "CA-ON", "CA-QC", "CA-BC", "CA-AB", "CA-MB", "CA-SK", "CA-NS", "CA-NB",
  "CA-NL", "CA-PE",
  "CA-YT", "CA-NT", "CA-NU",
];

// Australia — federal + 6 states + 2 territories.
const TIER_1_AU: ReadonlyArray<string> = [
  "AU",
  "AU-NSW", "AU-VIC", "AU-QLD", "AU-WA", "AU-SA", "AU-TAS",
  "AU-ACT", "AU-NT",
];

// Singletons + Asia anchors.
const TIER_1_OTHER: ReadonlyArray<string> = [
  "SG",
  "HK",
  "JP",
  "KR",
];

// Major cities mapped to canonical ISO 3166-2 parents (see header note).
// JP-13 is Tokyo Metropolis. Each entry is also (effectively) a member
// of one of the country blocks above; we list them here only to make
// the city → ISO mapping visible. They're deduped via `Set` below.
const TIER_1_CITIES_AS_ISO: ReadonlyArray<string> = [
  "US-NY", // New York City
  "US-CA", // San Francisco + Los Angeles
  "US-MA", // Boston
  "US-IL", // Chicago
  "US-WA", // Seattle
  "US-CO", // Denver
  "GB-ENG", // City of London
  "JP-13", // Tokyo
];

export const TIER_1_JURISDICTIONS: ReadonlyArray<string> = Array.from(
  new Set([
    ...TIER_1_US,
    ...TIER_1_EU,
    ...TIER_1_UK,
    ...TIER_1_CA,
    ...TIER_1_AU,
    ...TIER_1_OTHER,
    ...TIER_1_CITIES_AS_ISO,
  ])
);

// ── Tier 2 ────────────────────────────────────────────────────

const TIER_2_EUROPE: ReadonlyArray<string> = ["CH", "NO", "IS"];

const TIER_2_MIDDLE_EAST: ReadonlyArray<string> = [
  "AE", "AE-DU", "AE-AZ",
  "SA",
  "IL",
  "TR",
];

const TIER_2_CHINA: ReadonlyArray<string> = [
  "CN",
  "CN-44", // Guangdong
  "CN-31", // Shanghai
  "CN-11", // Beijing
  "CN-33", // Zhejiang
  "CN-32", // Jiangsu
  "MO",    // Macau
];

const TIER_2_INDIA: ReadonlyArray<string> = [
  "IN",
  "IN-MH", "IN-TN", "IN-GJ", "IN-KA", "IN-DL",
];

const TIER_2_BRAZIL: ReadonlyArray<string> = [
  "BR",
  "BR-SP", "BR-RJ", "BR-MG",
];

const TIER_2_MEXICO: ReadonlyArray<string> = [
  "MX",
  // "Key states" without a more specific brief — list the largest by
  // GDP / freight throughput. Documented in the spec.
  "MX-CMX", // Ciudad de México
  "MX-NLE", // Nuevo León
  "MX-JAL", // Jalisco
  "MX-MEX", // Estado de México
];

const TIER_2_LATAM_OTHER: ReadonlyArray<string> = ["AR", "CL", "CO", "PE"];

const TIER_2_AFRICA: ReadonlyArray<string> = ["ZA", "EG", "MA"];

const TIER_2_OCEANIA: ReadonlyArray<string> = ["NZ"];

const TIER_2_SOUTHEAST_ASIA: ReadonlyArray<string> = [
  "ID", "TH", "MY", "VN", "PH",
];

export const TIER_2_JURISDICTIONS: ReadonlyArray<string> = Array.from(
  new Set([
    ...TIER_2_EUROPE,
    ...TIER_2_MIDDLE_EAST,
    ...TIER_2_CHINA,
    ...TIER_2_INDIA,
    ...TIER_2_BRAZIL,
    ...TIER_2_MEXICO,
    ...TIER_2_LATAM_OTHER,
    ...TIER_2_AFRICA,
    ...TIER_2_OCEANIA,
    ...TIER_2_SOUTHEAST_ASIA,
  ])
);

// ── Lookup sets (O(1) membership) ──

const TIER_1_SET: ReadonlySet<string> = new Set(TIER_1_JURISDICTIONS);
const TIER_2_SET: ReadonlySet<string> = new Set(TIER_2_JURISDICTIONS);

// ══════════════════════════════════════════════════════════════
// Public API
// ══════════════════════════════════════════════════════════════

/**
 * Return the tier of a jurisdiction code:
 *   1 — must cover (TIER_1_JURISDICTIONS)
 *   2 — should cover (TIER_2_JURISDICTIONS)
 *   3 — long tail (parses as a known ISO shape but isn't in 1 or 2)
 *   null — does not parse as a known ISO code at all
 *
 * Promotion / demotion is a code-edit only: tiers are static lists,
 * not data-driven. A jurisdiction moves between tiers exclusively via
 * a code change to this module.
 */
export function jurisdictionTier(iso: string): 1 | 2 | 3 | null {
  if (typeof iso !== "string" || iso.length === 0) return null;
  if (TIER_1_SET.has(iso)) return 1;
  if (TIER_2_SET.has(iso)) return 2;
  if (isIsoCode(iso)) return 3;
  return null;
}

/**
 * True when the code is sub-national (an ISO 3166-2 entry like
 * "US-CA" or a free-text supranational code does NOT count).
 *
 *   "US"     → false
 *   "US-CA"  → true
 *   "GB-ENG" → true
 *   "EU"     → false
 *   "GLOBAL" → false
 */
export function isSubnational(iso: string): boolean {
  if (typeof iso !== "string") return false;
  // The hyphen check is a sufficient discriminator because the legal
  // ISO shapes the platform accepts are alpha-2 (no hyphen), alpha-2
  // with sub-region (one hyphen), and a tiny set of free-text codes
  // (no hyphen — see KNOWN_FREE_TEXT_JURISDICTIONS in iso.ts).
  return iso.includes("-");
}

/**
 * Pull the "country" segment out of a code for grouping purposes.
 * Mirrors `extractCountryFromIso` but falls back to the raw code for
 * supranational entries (EU, GLOBAL, IMO, ICAO) so the coverage matrix
 * has something to group those rows under.
 *
 *   "US"     → "US"
 *   "US-CA"  → "US"
 *   "EU"     → "EU"
 *   "GLOBAL" → "GLOBAL"
 */
export function countryGroupForIso(iso: string): string {
  const country = extractCountryFromIso(iso);
  if (country) return country;
  return iso;
}
