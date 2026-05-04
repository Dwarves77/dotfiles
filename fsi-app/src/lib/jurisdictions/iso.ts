// ══════════════════════════════════════════════════════════════
// Jurisdiction ISO helpers
// ══════════════════════════════════════════════════════════════
//
// Pure utilities for the jurisdiction_iso column introduced in
// migration 033. Accepts:
//   - ISO 3166-1 alpha-2 country codes ("US", "GB", "SG", "JP")
//   - ISO 3166-2 sub-national codes ("US-CA", "GB-SCT", "CN-31")
//   - Free-text supranational / IGO codes ("EU", "GLOBAL",
//     "IMO", "ICAO")
//
// The legacy `jurisdictions` column (lower-case free text like
// "us", "eu", "singapore") coexists for the 60-day dual-write
// window. Use `legacyToIso()` at write sites to populate the
// new column from the old one.
// ══════════════════════════════════════════════════════════════

// ── Free-text codes the platform treats as jurisdictions ──
// These are not ISO codes but the system handles them as
// first-class entries (supranational bodies, IGOs, "all").

export const KNOWN_FREE_TEXT_JURISDICTIONS = [
  "EU",
  "GLOBAL",
  "IMO",
  "ICAO",
] as const;

export type KnownFreeTextJurisdiction =
  (typeof KNOWN_FREE_TEXT_JURISDICTIONS)[number];

// ── Legacy → ISO mapping ──
// Mirrors the UPDATE statements in migration 033 exactly. Keep
// these in sync if the migration mapping is ever expanded.
//
// Keys are lower-cased to match the legacy column convention.

const LEGACY_TO_ISO_MAP: Readonly<Record<string, string>> = {
  us: "US",
  eu: "EU",
  uk: "GB",
  global: "GLOBAL",
  singapore: "SG",
  "hong kong": "HK",
  japan: "JP",
  "south korea": "KR",
  china: "CN",
  canada: "CA",
  australia: "AU",
  imo: "IMO",
  icao: "ICAO",
};

// ── ISO 3166-1 alpha-2 country code regex ──
// Two uppercase ASCII letters. Validates shape, not membership.

const ISO_3166_1_PATTERN = /^[A-Z]{2}$/;

// ── ISO 3166-2 sub-national code regex ──
// "<country>-<subdivision>" where subdivision is 1-3 alphanumerics.
// Examples: US-CA, US-NY, GB-SCT, CN-31, JP-13.

const ISO_3166_2_PATTERN = /^[A-Z]{2}-[A-Z0-9]{1,3}$/;

// ══════════════════════════════════════════════════════════════
// Public API
// ══════════════════════════════════════════════════════════════

/**
 * Map an array of legacy free-text jurisdiction strings (e.g.
 * ["us", "eu"]) to the canonical ISO codes used by the new
 * jurisdiction_iso column (e.g. ["US", "EU"]).
 *
 * Strings that do not match the known mapping are dropped — the
 * caller is responsible for the fallback path. The W4 backfill
 * agent uses content inference for unmapped legacy values.
 */
export function legacyToIso(jurisdictionStrings: string[]): string[] {
  if (!Array.isArray(jurisdictionStrings)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of jurisdictionStrings) {
    if (typeof raw !== "string") continue;
    const key = raw.trim().toLowerCase();
    if (!key) continue;
    const mapped = LEGACY_TO_ISO_MAP[key];
    if (mapped && !seen.has(mapped)) {
      seen.add(mapped);
      out.push(mapped);
    }
  }
  return out;
}

/**
 * Type-guard for valid jurisdiction_iso entries. Accepts
 * ISO 3166-1 alpha-2, ISO 3166-2, or one of the known
 * free-text supranational / IGO codes.
 */
export function isIsoCode(code: string): boolean {
  if (typeof code !== "string") return false;
  if ((KNOWN_FREE_TEXT_JURISDICTIONS as readonly string[]).includes(code)) {
    return true;
  }
  return ISO_3166_1_PATTERN.test(code) || ISO_3166_2_PATTERN.test(code);
}

/**
 * Pull the ISO 3166-1 alpha-2 country part out of a code, if
 * any. Returns null for free-text supranational entries.
 *
 *   "US"     → "US"
 *   "US-CA"  → "US"
 *   "GB-SCT" → "GB"
 *   "EU"     → null
 *   "GLOBAL" → null
 */
export function extractCountryFromIso(code: string): string | null {
  if (typeof code !== "string") return null;
  if ((KNOWN_FREE_TEXT_JURISDICTIONS as readonly string[]).includes(code)) {
    return null;
  }
  if (ISO_3166_1_PATTERN.test(code)) return code;
  if (ISO_3166_2_PATTERN.test(code)) return code.slice(0, 2);
  return null;
}

// ── Display labels ──
// Country labels for the alpha-2 codes the platform routinely
// emits. Sub-national codes fall back to their raw string when
// not enumerated; expand SUBDIVISION_LABELS as UI surfaces start
// rendering specific regions.

const COUNTRY_LABELS: Readonly<Record<string, string>> = {
  US: "United States",
  GB: "United Kingdom",
  CA: "Canada",
  AU: "Australia",
  SG: "Singapore",
  HK: "Hong Kong",
  JP: "Japan",
  KR: "South Korea",
  CN: "China",
  DE: "Germany",
  FR: "France",
  IT: "Italy",
  ES: "Spain",
  NL: "Netherlands",
  BE: "Belgium",
  CH: "Switzerland",
  SE: "Sweden",
  NO: "Norway",
  DK: "Denmark",
  FI: "Finland",
  IE: "Ireland",
  PT: "Portugal",
  AT: "Austria",
  PL: "Poland",
  IN: "India",
  BR: "Brazil",
  MX: "Mexico",
  AR: "Argentina",
  CL: "Chile",
  ZA: "South Africa",
  AE: "United Arab Emirates",
  SA: "Saudi Arabia",
  TR: "Turkey",
  ID: "Indonesia",
  TH: "Thailand",
  VN: "Vietnam",
  MY: "Malaysia",
  PH: "Philippines",
  NZ: "New Zealand",
};

const SUBDIVISION_LABELS: Readonly<Record<string, string>> = {
  // United States — common cargo / regulatory states
  "US-CA": "California",
  "US-NY": "New York",
  "US-TX": "Texas",
  "US-FL": "Florida",
  "US-WA": "Washington",
  "US-OR": "Oregon",
  "US-IL": "Illinois",
  "US-NJ": "New Jersey",
  "US-MA": "Massachusetts",
  "US-PA": "Pennsylvania",
  "US-GA": "Georgia",
  "US-MI": "Michigan",
  "US-OH": "Ohio",
  "US-NV": "Nevada",
  "US-AZ": "Arizona",
  // United Kingdom — devolved nations
  "GB-ENG": "England",
  "GB-SCT": "Scotland",
  "GB-WLS": "Wales",
  "GB-NIR": "Northern Ireland",
  // Canada — major provinces
  "CA-ON": "Ontario",
  "CA-QC": "Quebec",
  "CA-BC": "British Columbia",
  "CA-AB": "Alberta",
  // China — major provinces / municipalities (numeric subdivisions)
  "CN-11": "Beijing",
  "CN-31": "Shanghai",
  "CN-44": "Guangdong",
  "CN-33": "Zhejiang",
  // Australia — common states
  "AU-NSW": "New South Wales",
  "AU-VIC": "Victoria",
  "AU-QLD": "Queensland",
  "AU-WA": "Western Australia",
};

const FREE_TEXT_LABELS: Readonly<
  Record<KnownFreeTextJurisdiction, string>
> = {
  EU: "European Union",
  GLOBAL: "Global",
  IMO: "International Maritime Organization",
  ICAO: "International Civil Aviation Organization",
};

/**
 * Render a human-readable label for a jurisdiction_iso entry.
 *
 * Behavior:
 *   - "US"     → "United States"
 *   - "US-CA"  → "California, United States"
 *   - "EU"     → "European Union"
 *   - "GLOBAL" → "Global"
 *   - Unknown sub-national codes → falls back to raw code
 *   - Unknown alpha-2 → falls back to raw code
 *
 * Unknown ISO 3166-2 codes return "<raw>, <country-label>" if
 * the country part is recognized, otherwise the raw code.
 */
export function isoToDisplayLabel(code: string): string {
  if (typeof code !== "string" || code.length === 0) return "";

  if ((KNOWN_FREE_TEXT_JURISDICTIONS as readonly string[]).includes(code)) {
    return FREE_TEXT_LABELS[code as KnownFreeTextJurisdiction];
  }

  if (ISO_3166_1_PATTERN.test(code)) {
    return COUNTRY_LABELS[code] ?? code;
  }

  if (ISO_3166_2_PATTERN.test(code)) {
    const enumerated = SUBDIVISION_LABELS[code];
    const country = code.slice(0, 2);
    const countryLabel = COUNTRY_LABELS[country];
    if (enumerated && countryLabel) return `${enumerated}, ${countryLabel}`;
    if (enumerated) return enumerated;
    if (countryLabel) return `${code}, ${countryLabel}`;
    return code;
  }

  // Unknown shape — return the raw value so display surfaces
  // surface the data instead of dropping it silently.
  return code;
}
