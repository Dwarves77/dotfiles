// ══════════════════════════════════════════════════════════════
// Tier 1 priority jurisdictions — region-grouped configuration
// (Wave 4 AGENT 4 / Coverage gaps data-driven)
// ══════════════════════════════════════════════════════════════
//
// Hand-curated config-as-code listing all Tier 1 priority jurisdictions
// per FINISHING-DISPATCH-2026-05-06.md, broken out by region for the
// Coverage gaps card and (future) Research / Admin coverage surfaces.
//
// SOURCE-OF-TRUTH NOTE
// --------------------
// The dispatch document lists these regions and per-region scopes:
//   - US sub-national (50 states + DC + 5 territories = 56)
//   - EU member states (27)
//   - UK nations (4)
//   - CA provinces+territories (13)
//   - AU + states + territories (9)
//   - APAC priority (SG, HK, JP, KR = 4)
//   - MENA priority (UAE/AE, SA, IL, etc.)
//   - Latam priority (BR, MX, AR, CL, etc.)
//   - Africa priority (ZA, EG, KE, NG, etc.)
//
// `lib/jurisdictions/tiers.ts` holds the canonical Tier 1 list (a flat
// `TIER_1_JURISDICTIONS` array) and treats MENA / Latam / Africa as
// Tier 2. The dispatch promotes select MENA/Latam/Africa codes to "Tier
// 1 priority" for coverage-gap reporting purposes. Both views are kept
// in sync by composing this region grouping from the same ISO codes;
// we do NOT duplicate the source-of-truth membership lists. If a future
// edit promotes/demotes a code, both files must be updated together.
//
// Updates are code-edits — see `tiers.ts` header for the policy.
// ══════════════════════════════════════════════════════════════

export interface PriorityJurisdiction {
  iso: string;
  name: string;
}

export interface Region {
  id: string;
  name: string;
  jurisdictions: PriorityJurisdiction[];
}

// ── US sub-national (50 states + DC + 5 inhabited territories = 56) ──

const US_SUBNATIONAL: PriorityJurisdiction[] = [
  { iso: "US-AL", name: "Alabama" },
  { iso: "US-AK", name: "Alaska" },
  { iso: "US-AZ", name: "Arizona" },
  { iso: "US-AR", name: "Arkansas" },
  { iso: "US-CA", name: "California" },
  { iso: "US-CO", name: "Colorado" },
  { iso: "US-CT", name: "Connecticut" },
  { iso: "US-DE", name: "Delaware" },
  { iso: "US-FL", name: "Florida" },
  { iso: "US-GA", name: "Georgia" },
  { iso: "US-HI", name: "Hawaii" },
  { iso: "US-ID", name: "Idaho" },
  { iso: "US-IL", name: "Illinois" },
  { iso: "US-IN", name: "Indiana" },
  { iso: "US-IA", name: "Iowa" },
  { iso: "US-KS", name: "Kansas" },
  { iso: "US-KY", name: "Kentucky" },
  { iso: "US-LA", name: "Louisiana" },
  { iso: "US-ME", name: "Maine" },
  { iso: "US-MD", name: "Maryland" },
  { iso: "US-MA", name: "Massachusetts" },
  { iso: "US-MI", name: "Michigan" },
  { iso: "US-MN", name: "Minnesota" },
  { iso: "US-MS", name: "Mississippi" },
  { iso: "US-MO", name: "Missouri" },
  { iso: "US-MT", name: "Montana" },
  { iso: "US-NE", name: "Nebraska" },
  { iso: "US-NV", name: "Nevada" },
  { iso: "US-NH", name: "New Hampshire" },
  { iso: "US-NJ", name: "New Jersey" },
  { iso: "US-NM", name: "New Mexico" },
  { iso: "US-NY", name: "New York" },
  { iso: "US-NC", name: "North Carolina" },
  { iso: "US-ND", name: "North Dakota" },
  { iso: "US-OH", name: "Ohio" },
  { iso: "US-OK", name: "Oklahoma" },
  { iso: "US-OR", name: "Oregon" },
  { iso: "US-PA", name: "Pennsylvania" },
  { iso: "US-RI", name: "Rhode Island" },
  { iso: "US-SC", name: "South Carolina" },
  { iso: "US-SD", name: "South Dakota" },
  { iso: "US-TN", name: "Tennessee" },
  { iso: "US-TX", name: "Texas" },
  { iso: "US-UT", name: "Utah" },
  { iso: "US-VT", name: "Vermont" },
  { iso: "US-VA", name: "Virginia" },
  { iso: "US-WA", name: "Washington" },
  { iso: "US-WV", name: "West Virginia" },
  { iso: "US-WI", name: "Wisconsin" },
  { iso: "US-WY", name: "Wyoming" },
  { iso: "US-DC", name: "District of Columbia" },
  // Inhabited territories
  { iso: "US-PR", name: "Puerto Rico" },
  { iso: "US-VI", name: "US Virgin Islands" },
  { iso: "US-GU", name: "Guam" },
  { iso: "US-MP", name: "Northern Mariana Islands" },
  { iso: "US-AS", name: "American Samoa" },
];

// ── EU member states (27) ──

const EU_MEMBERS: PriorityJurisdiction[] = [
  { iso: "AT", name: "Austria" },
  { iso: "BE", name: "Belgium" },
  { iso: "BG", name: "Bulgaria" },
  { iso: "HR", name: "Croatia" },
  { iso: "CY", name: "Cyprus" },
  { iso: "CZ", name: "Czechia" },
  { iso: "DK", name: "Denmark" },
  { iso: "EE", name: "Estonia" },
  { iso: "FI", name: "Finland" },
  { iso: "FR", name: "France" },
  { iso: "DE", name: "Germany" },
  { iso: "GR", name: "Greece" },
  { iso: "HU", name: "Hungary" },
  { iso: "IE", name: "Ireland" },
  { iso: "IT", name: "Italy" },
  { iso: "LV", name: "Latvia" },
  { iso: "LT", name: "Lithuania" },
  { iso: "LU", name: "Luxembourg" },
  { iso: "MT", name: "Malta" },
  { iso: "NL", name: "Netherlands" },
  { iso: "PL", name: "Poland" },
  { iso: "PT", name: "Portugal" },
  { iso: "RO", name: "Romania" },
  { iso: "SK", name: "Slovakia" },
  { iso: "SI", name: "Slovenia" },
  { iso: "ES", name: "Spain" },
  { iso: "SE", name: "Sweden" },
];

// ── UK nations (3) ──
//
// GB-ENG is intentionally OMITTED from this list. UK Parliament + Defra +
// DfT etc. are tagged `GB` (UK-wide) in `sources.jurisdictions`, NOT
// `GB-ENG` — England effectively inherits all UK-wide source rows since
// no separate English government regulator exists. Treating GB-ENG as a
// distinct priority jurisdiction created a structural false-gap in the
// monitoring rollup (the only UK-nation hard-gap in
// docs/MONITORING-STATUS-2026-05-08.md). Coverage for England is captured
// by the GB-tagged UK-wide source rows; the devolved nations (Scotland,
// Wales, Northern Ireland) keep their own ISO entries because they DO
// have distinct devolved regulators (e.g. SEPA, Natural Resources Wales,
// NIEA) that justify separate coverage tracking.

const UK_NATIONS: PriorityJurisdiction[] = [
  { iso: "GB-SCT", name: "Scotland" },
  { iso: "GB-WLS", name: "Wales" },
  { iso: "GB-NIR", name: "Northern Ireland" },
];

// ── Canada provinces + territories (13) ──

const CA_PROVINCES: PriorityJurisdiction[] = [
  { iso: "CA-ON", name: "Ontario" },
  { iso: "CA-QC", name: "Quebec" },
  { iso: "CA-BC", name: "British Columbia" },
  { iso: "CA-AB", name: "Alberta" },
  { iso: "CA-MB", name: "Manitoba" },
  { iso: "CA-SK", name: "Saskatchewan" },
  { iso: "CA-NS", name: "Nova Scotia" },
  { iso: "CA-NB", name: "New Brunswick" },
  { iso: "CA-NL", name: "Newfoundland and Labrador" },
  { iso: "CA-PE", name: "Prince Edward Island" },
  { iso: "CA-YT", name: "Yukon" },
  { iso: "CA-NT", name: "Northwest Territories" },
  { iso: "CA-NU", name: "Nunavut" },
];

// ── Australia + 8 (federal + 6 states + 2 territories = 9) ──

const AU_FEDERATION: PriorityJurisdiction[] = [
  { iso: "AU", name: "Australia (federal)" },
  { iso: "AU-NSW", name: "New South Wales" },
  { iso: "AU-VIC", name: "Victoria" },
  { iso: "AU-QLD", name: "Queensland" },
  { iso: "AU-WA", name: "Western Australia" },
  { iso: "AU-SA", name: "South Australia" },
  { iso: "AU-TAS", name: "Tasmania" },
  { iso: "AU-ACT", name: "Australian Capital Territory" },
  { iso: "AU-NT", name: "Northern Territory" },
];

// ── APAC priority (SG, HK, JP, KR = 4) ──

const APAC_PRIORITY: PriorityJurisdiction[] = [
  { iso: "SG", name: "Singapore" },
  { iso: "HK", name: "Hong Kong" },
  { iso: "JP", name: "Japan" },
  { iso: "KR", name: "South Korea" },
];

// ── MENA priority ──
// Per dispatch: UAE/AE, SA, IL, etc.
// Note: `tiers.ts` places MENA in Tier 2; this region exists in
// the priority surface for coverage-gap reporting per dispatch scope.

const MENA_PRIORITY: PriorityJurisdiction[] = [
  { iso: "AE", name: "United Arab Emirates" },
  { iso: "SA", name: "Saudi Arabia" },
  { iso: "IL", name: "Israel" },
  { iso: "TR", name: "Turkey" },
  { iso: "QA", name: "Qatar" },
];

// ── Latam priority ──
// Per dispatch: BR, MX, AR, CL, etc.
// Note: `tiers.ts` places Latam in Tier 2; this region exists in the
// priority surface for coverage-gap reporting per dispatch scope.

const LATAM_PRIORITY: PriorityJurisdiction[] = [
  { iso: "BR", name: "Brazil" },
  { iso: "MX", name: "Mexico" },
  { iso: "AR", name: "Argentina" },
  { iso: "CL", name: "Chile" },
  { iso: "CO", name: "Colombia" },
  { iso: "PE", name: "Peru" },
];

// ── Africa priority ──
// Per dispatch: ZA, EG, KE, NG, etc.
// Note: `tiers.ts` places Africa in Tier 2; this region exists in the
// priority surface for coverage-gap reporting per dispatch scope.

const AFRICA_PRIORITY: PriorityJurisdiction[] = [
  { iso: "ZA", name: "South Africa" },
  { iso: "EG", name: "Egypt" },
  { iso: "KE", name: "Kenya" },
  { iso: "NG", name: "Nigeria" },
  { iso: "MA", name: "Morocco" },
];

// ── Region grouping ──
// Regions are intentionally disjoint — US sub-national is its own region
// (NOT rolled up into "Americas"); Latam covers other Americas separately.
// UK is separate from EU. AU is separate from APAC. This avoids the
// double-counting trap flagged in the dispatch.

export const TIER1_PRIORITY_REGIONS: ReadonlyArray<Region> = [
  { id: "us-subnational", name: "United States (sub-national)", jurisdictions: US_SUBNATIONAL },
  { id: "eu-members", name: "EU member states", jurisdictions: EU_MEMBERS },
  { id: "uk-nations", name: "United Kingdom (nations)", jurisdictions: UK_NATIONS },
  { id: "ca-provinces", name: "Canada (provinces & territories)", jurisdictions: CA_PROVINCES },
  { id: "au-federation", name: "Australia (federal & states)", jurisdictions: AU_FEDERATION },
  { id: "apac-priority", name: "APAC priority", jurisdictions: APAC_PRIORITY },
  { id: "mena-priority", name: "MENA priority", jurisdictions: MENA_PRIORITY },
  { id: "latam-priority", name: "Latin America priority", jurisdictions: LATAM_PRIORITY },
  { id: "africa-priority", name: "Africa priority", jurisdictions: AFRICA_PRIORITY },
];

/** O(1) ISO → region lookup. Built once at module load. */
const ISO_TO_REGION: ReadonlyMap<string, Region> = (() => {
  const map = new Map<string, Region>();
  for (const region of TIER1_PRIORITY_REGIONS) {
    for (const j of region.jurisdictions) {
      map.set(j.iso, region);
    }
  }
  return map;
})();

export function regionForIso(iso: string): Region | undefined {
  return ISO_TO_REGION.get(iso);
}

/** Flat set of all priority ISO codes — mirrors `TIER_1_JURISDICTIONS`
 *  shape in `tiers.ts` but covers the dispatch's wider scope. */
export const TIER1_PRIORITY_ISOS: ReadonlySet<string> = new Set(
  TIER1_PRIORITY_REGIONS.flatMap((r) => r.jurisdictions.map((j) => j.iso))
);
