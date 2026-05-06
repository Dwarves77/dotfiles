// W3 — Tier 1 jurisdiction population runner.
//
// Forks supabase/seed/california-pilot.mjs, but:
//   - Loops a region's jurisdiction list (US / EU / UK / CA / APAC / AU / CITIES).
//   - Writes results to the live Supabase database (not a dry-run).
//       Tier H → INSERT INTO sources (status='active', admin_only=false).
//       Tier M → INSERT INTO provisional_sources (status='pending_review',
//                discovered_for_jurisdiction = the iso, discovered_via='worker_search').
//       All  → INSERT INTO source_verifications (audit log).
//   - Idempotent: skips a candidate if its eTLD+1 already lives in either
//     sources or provisional_sources. Duplicates still write a
//     source_verifications row (action='rejected', reason='duplicate') so
//     forensics see the rejection, but no new sources/provisional row.
//   - Resilient: a discovery failure on one jurisdiction logs and continues.
//   - Sequential within region. Multiple regions run in parallel as separate
//     process invocations (the orchestrator handles that).
//
// The Sonnet discovery prompt and the Haiku verification prompt are copied
// VERBATIM from california-pilot.mjs (which is itself verbatim from
// src/lib/sources/{discovery,verification}.ts on the run date). The
// 57-pattern KNOWN_AUTHORITATIVE_PATTERNS list is also verbatim. Tier
// thresholds (relevance 70/50, freight 50/25) are the calibrated values
// from the pilot.
//
// Usage (from fsi-app/):
//   node supabase/seed/tier1-population-runner.mjs --region=US
//   node supabase/seed/tier1-population-runner.mjs --region=EU --depth=normal
//   node supabase/seed/tier1-population-runner.mjs --region=CITIES   # no-op
//
// Env (read from fsi-app/.env.local):
//   ANTHROPIC_API_KEY            required
//   NEXT_PUBLIC_SUPABASE_URL     required
//   SUPABASE_SERVICE_ROLE_KEY    required (bypasses RLS)
//   MAX_COST_USD                 optional cost cap; runner exits cleanly when exceeded
//
// Output:
//   docs/W3-tier1-{REGION}-results.json   per-jurisdiction summary
//
// Cost (depth=normal, default):
//   - 1 Sonnet 4.6 call with web_search (5 max uses) ≈ $0.10
//   - up to 12 Haiku 4.5 candidate calls ≈ $0.001 each ≈ $0.012
//   - Total ≈ $0.11 / jurisdiction.

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ────────────────────────────────────────────────────────────────────────────
// Argument parsing
// ────────────────────────────────────────────────────────────────────────────

const VALID_REGIONS = ["US", "EU", "UK", "CA", "APAC", "AU", "CITIES"];
const VALID_DEPTHS = ["shallow", "normal", "deep"];

function parseArgs(argv) {
  const out = { region: null, depth: "normal" };
  for (const arg of argv.slice(2)) {
    if (arg.startsWith("--region=")) {
      out.region = arg.slice("--region=".length).toUpperCase();
    } else if (arg.startsWith("--depth=")) {
      out.depth = arg.slice("--depth=".length).toLowerCase();
    } else if (arg === "--help" || arg === "-h") {
      out.help = true;
    }
  }
  return out;
}

const ARGS = parseArgs(process.argv);

if (ARGS.help) {
  console.log(`Usage: node supabase/seed/tier1-population-runner.mjs --region=<REGION> [--depth=<DEPTH>]
  --region=US|EU|UK|CA|APAC|AU|CITIES   (required)
  --depth=shallow|normal|deep            (optional, default normal)
Env:
  MAX_COST_USD                           optional cost cap`);
  process.exit(0);
}

if (!ARGS.region || !VALID_REGIONS.includes(ARGS.region)) {
  console.error(
    `ERROR: --region=<REGION> required. One of: ${VALID_REGIONS.join(", ")}.`
  );
  process.exit(1);
}

if (!VALID_DEPTHS.includes(ARGS.depth)) {
  console.error(
    `ERROR: --depth invalid. One of: ${VALID_DEPTHS.join(", ")}.`
  );
  process.exit(1);
}

// ────────────────────────────────────────────────────────────────────────────
// Resolve paths
// ────────────────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// fsi-app/supabase/seed/tier1-population-runner.mjs → fsi-app/.env.local
const ENV_PATH = resolve(__dirname, "..", "..", ".env.local");
// fsi-app/supabase/seed/tier1-population-runner.mjs → docs/
const DOCS_DIR = resolve(__dirname, "..", "..", "..", "docs");
const REPORT_JSON_PATH = resolve(
  DOCS_DIR,
  `W3-tier1-${ARGS.region}-results.json`
);

// ────────────────────────────────────────────────────────────────────────────
// Env loading (manual parse — no dotenv dep needed)
// ────────────────────────────────────────────────────────────────────────────

function loadEnv(path) {
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (e) {
    throw new Error(
      `Could not read env file at ${path}. Make sure fsi-app/.env.local exists. Error: ${e.message}`
    );
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnv(ENV_PATH);

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!ANTHROPIC_API_KEY) {
  console.error("ERROR: ANTHROPIC_API_KEY missing from fsi-app/.env.local.");
  process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    "ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for live writes."
  );
  process.exit(1);
}

const MAX_COST_USD =
  process.env.MAX_COST_USD && process.env.MAX_COST_USD.length > 0
    ? Number(process.env.MAX_COST_USD)
    : null;
if (MAX_COST_USD !== null && !Number.isFinite(MAX_COST_USD)) {
  console.error(`ERROR: MAX_COST_USD is not a number: ${process.env.MAX_COST_USD}`);
  process.exit(1);
}

// ────────────────────────────────────────────────────────────────────────────
// Region jurisdiction lists — mirrors fsi-app/src/lib/jurisdictions/tiers.ts
//
// IMPORTANT: tiers.ts uses the project's exact ISO codes — EU member states
// are alpha-2 (DE, FR, IT, …), NOT EU-prefixed. CITIES collapses to state
// codes already covered by the US block, so it's a no-op region by design.
// ────────────────────────────────────────────────────────────────────────────

const REGIONS = {
  US: [
    "US",
    "US-AL", "US-AK", "US-AZ", "US-AR", "US-CA", "US-CO", "US-CT", "US-DE",
    "US-FL", "US-GA", "US-HI", "US-ID", "US-IL", "US-IN", "US-IA", "US-KS",
    "US-KY", "US-LA", "US-ME", "US-MD", "US-MA", "US-MI", "US-MN", "US-MS",
    "US-MO", "US-MT", "US-NE", "US-NV", "US-NH", "US-NJ", "US-NM", "US-NY",
    "US-NC", "US-ND", "US-OH", "US-OK", "US-OR", "US-PA", "US-RI", "US-SC",
    "US-SD", "US-TN", "US-TX", "US-UT", "US-VT", "US-VA", "US-WA", "US-WV",
    "US-WI", "US-WY",
    "US-DC",
    "US-PR", "US-VI", "US-GU", "US-MP", "US-AS",
  ],
  EU: [
    "EU",
    "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR",
    "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK",
    "SI", "ES", "SE",
  ],
  UK: ["GB", "GB-ENG", "GB-SCT", "GB-WLS", "GB-NIR"],
  CA: [
    "CA",
    "CA-ON", "CA-QC", "CA-BC", "CA-AB", "CA-MB", "CA-SK", "CA-NS", "CA-NB",
    "CA-NL", "CA-PE",
    "CA-YT", "CA-NT", "CA-NU",
  ],
  APAC: ["SG", "HK", "JP", "KR", "JP-13"],
  AU: [
    "AU",
    "AU-NSW", "AU-VIC", "AU-QLD", "AU-WA", "AU-SA", "AU-TAS",
    "AU-ACT", "AU-NT",
  ],
  // CITIES collapses onto existing state ISO codes per W2.D — empty by design.
  CITIES: [],
};

// ────────────────────────────────────────────────────────────────────────────
// Display labels — mirrors a subset of isoToDisplayLabel() for the codes
// covered by the Tier 1 lists. Codes outside this map fall through to
// the raw ISO code; the Sonnet prompt handles them with the country
// segment as an additional hint.
// ────────────────────────────────────────────────────────────────────────────

const COUNTRY_LABELS = {
  US: "United States", GB: "United Kingdom", CA: "Canada", AU: "Australia",
  SG: "Singapore", HK: "Hong Kong", JP: "Japan", KR: "South Korea",
  CN: "China", DE: "Germany", FR: "France", IT: "Italy", ES: "Spain",
  NL: "Netherlands", BE: "Belgium", CH: "Switzerland", SE: "Sweden",
  NO: "Norway", DK: "Denmark", FI: "Finland", IE: "Ireland",
  PT: "Portugal", AT: "Austria", PL: "Poland", IN: "India", BR: "Brazil",
  MX: "Mexico", AR: "Argentina", CL: "Chile", ZA: "South Africa",
  AE: "United Arab Emirates", SA: "Saudi Arabia", TR: "Turkey",
  ID: "Indonesia", TH: "Thailand", VN: "Vietnam", MY: "Malaysia",
  PH: "Philippines", NZ: "New Zealand",
  // EU member-state extensions (not in the canonical iso.ts COUNTRY_LABELS
  // map yet — surfaced here for prompt clarity).
  BG: "Bulgaria", HR: "Croatia", CY: "Cyprus", CZ: "Czechia", EE: "Estonia",
  GR: "Greece", HU: "Hungary", LV: "Latvia", LT: "Lithuania",
  LU: "Luxembourg", MT: "Malta", RO: "Romania", SK: "Slovakia", SI: "Slovenia",
};

const SUBDIVISION_LABELS = {
  // United States
  "US-AL": "Alabama", "US-AK": "Alaska", "US-AZ": "Arizona", "US-AR": "Arkansas",
  "US-CA": "California", "US-CO": "Colorado", "US-CT": "Connecticut",
  "US-DE": "Delaware", "US-FL": "Florida", "US-GA": "Georgia",
  "US-HI": "Hawaii", "US-ID": "Idaho", "US-IL": "Illinois", "US-IN": "Indiana",
  "US-IA": "Iowa", "US-KS": "Kansas", "US-KY": "Kentucky", "US-LA": "Louisiana",
  "US-ME": "Maine", "US-MD": "Maryland", "US-MA": "Massachusetts",
  "US-MI": "Michigan", "US-MN": "Minnesota", "US-MS": "Mississippi",
  "US-MO": "Missouri", "US-MT": "Montana", "US-NE": "Nebraska",
  "US-NV": "Nevada", "US-NH": "New Hampshire", "US-NJ": "New Jersey",
  "US-NM": "New Mexico", "US-NY": "New York", "US-NC": "North Carolina",
  "US-ND": "North Dakota", "US-OH": "Ohio", "US-OK": "Oklahoma",
  "US-OR": "Oregon", "US-PA": "Pennsylvania", "US-RI": "Rhode Island",
  "US-SC": "South Carolina", "US-SD": "South Dakota", "US-TN": "Tennessee",
  "US-TX": "Texas", "US-UT": "Utah", "US-VT": "Vermont", "US-VA": "Virginia",
  "US-WA": "Washington", "US-WV": "West Virginia", "US-WI": "Wisconsin",
  "US-WY": "Wyoming", "US-DC": "District of Columbia",
  "US-PR": "Puerto Rico", "US-VI": "US Virgin Islands", "US-GU": "Guam",
  "US-MP": "Northern Mariana Islands", "US-AS": "American Samoa",
  // United Kingdom
  "GB-ENG": "England", "GB-SCT": "Scotland", "GB-WLS": "Wales", "GB-NIR": "Northern Ireland",
  // Canada
  "CA-ON": "Ontario", "CA-QC": "Quebec", "CA-BC": "British Columbia",
  "CA-AB": "Alberta", "CA-MB": "Manitoba", "CA-SK": "Saskatchewan",
  "CA-NS": "Nova Scotia", "CA-NB": "New Brunswick",
  "CA-NL": "Newfoundland and Labrador", "CA-PE": "Prince Edward Island",
  "CA-YT": "Yukon", "CA-NT": "Northwest Territories", "CA-NU": "Nunavut",
  // Australia
  "AU-NSW": "New South Wales", "AU-VIC": "Victoria", "AU-QLD": "Queensland",
  "AU-WA": "Western Australia", "AU-SA": "South Australia", "AU-TAS": "Tasmania",
  "AU-ACT": "Australian Capital Territory", "AU-NT": "Northern Territory",
  // Asia
  "JP-13": "Tokyo Metropolis",
};

const FREE_TEXT_LABELS = {
  EU: "European Union",
  GLOBAL: "Global",
  IMO: "International Maritime Organization",
  ICAO: "International Civil Aviation Organization",
};

function isoToLabel(code) {
  if (typeof code !== "string" || code.length === 0) return code;
  if (code in FREE_TEXT_LABELS) return FREE_TEXT_LABELS[code];
  if (/^[A-Z]{2}$/.test(code)) return COUNTRY_LABELS[code] ?? code;
  if (/^[A-Z]{2}-[A-Z0-9]{1,3}$/.test(code)) {
    const enumerated = SUBDIVISION_LABELS[code];
    const country = code.slice(0, 2);
    const countryLabel = COUNTRY_LABELS[country];
    if (enumerated && countryLabel) return `${enumerated}, ${countryLabel}`;
    if (enumerated) return enumerated;
    if (countryLabel) return `${code}, ${countryLabel}`;
    return code;
  }
  return code;
}

// ────────────────────────────────────────────────────────────────────────────
// Models + constants (verbatim from california-pilot.mjs)
// ────────────────────────────────────────────────────────────────────────────

const SONNET_MODEL = "claude-sonnet-4-6";
const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const ANTHROPIC_VERSION = "2023-06-01";
const WEB_SEARCH_BETA = "web-search-2025-03-05";
const WEB_SEARCH_TOOL_NAME = "web_search_20250305";

const DEPTH_CONFIGS = {
  shallow: {
    maxCandidates: 8,
    webSearchMaxUses: 3,
    sonnetCostUsd: 0.05,
    guidance:
      "Return up to 8 candidates (5-8 for shallow mode). Limit web searches to the top canonical regulators only.",
  },
  normal: {
    maxCandidates: 12,
    webSearchMaxUses: 5,
    sonnetCostUsd: 0.10,
    guidance:
      "Return up to 12 candidates. Run a few web searches to surface canonical regulators and one or two adjacent agencies. Skip rare sub-portals.",
  },
  deep: {
    maxCandidates: 20,
    webSearchMaxUses: 10,
    sonnetCostUsd: 0.15,
    guidance:
      "Return up to 20 candidates (15-20 for deep mode). Run multiple web searches to surface sub-agencies and adjacent regulators. Include sub-portals where they are the canonical regulatory publisher.",
  },
};

const DEPTH_CFG = DEPTH_CONFIGS[ARGS.depth];

// Cost estimates (USD). Sonnet 4.6: $3/M input, $15/M output. Haiku 4.5: $1/M input, $5/M output.
const HAIKU_COST_PER_CALL_USD = 0.001;

// ────────────────────────────────────────────────────────────────────────────
// DISCOVERY_SYSTEM_PROMPT — verbatim from california-pilot.mjs
// (which is verbatim from src/lib/sources/discovery.ts on the run date).
// ────────────────────────────────────────────────────────────────────────────

const DISCOVERY_SYSTEM_PROMPT = `You are a regulatory source discovery agent for a freight-sustainability
intelligence platform. Given a jurisdiction code, identify the government
bodies, regulatory agencies, official gazettes, and standards bodies in
that jurisdiction that publish content affecting:

- Climate / carbon / emissions regulation
- Sustainable freight / transport / shipping policy
- Customs and trade rules with sustainability dimensions
- Energy / fuel mandates affecting transport
- Labor/safety/environmental rules affecting freight operations

CRITICAL: Tier reflects canonicalness, not jurisdictional level.
A US state agency that issues primary regulation (CARB, NYSDEC) is T2,
the same as the federal-level EPA. Do not under-rate sub-national
publishers when they are the canonical source.

Return STRICT JSON ONLY:
{
  "jurisdiction_label": "full human-readable jurisdiction name",
  "candidates": [
    {
      "name": "Agency/body full name",
      "url": "primary public-facing URL where regulations live",
      "type": "regulator|gazette|standards-body|industry-association|court|court-tracker|aggregator",
      "language": "ISO 639-1 code",
      "freight_relevance_score": 0-100,
      "rationale": "<=200 char justification"
    }
  ]
}

Rules:
- Up to 20 candidates per call (aim for 10-15 typical, 5-8 for sparse jurisdictions, 15-20 for deep mode).
- Include sub-agency portals when they are the canonical regulatory publisher (e.g., CARB instead of just ca.gov).
- Skip pure news aggregators unless explicitly requested.
- Use web_search to verify each URL is reachable and currently active.
- Score freight_relevance_score conservatively. 100 = pure freight regulator. 50 = some freight overlap. 30 = freight is a small fraction of their content.
- For sub-national jurisdictions (ISO 3166-2 codes), include both the sub-national agencies AND a pointer back to relevant national agencies. Do not duplicate national entries that the parent country discovery would already produce.`;

// ────────────────────────────────────────────────────────────────────────────
// VERIFICATION_HAIKU_SYSTEM_PROMPT — verbatim from california-pilot.mjs.
// ────────────────────────────────────────────────────────────────────────────

const VERIFICATION_HAIKU_SYSTEM_PROMPT = `You are a source verification classifier for a freight-sustainability intelligence platform.

Given a candidate source URL and a content excerpt, return STRICT JSON:
{
  "ai_relevance_score": 0-100,
  "ai_freight_score": 0-100,
  "ai_trust_tier": "T1"|"T2"|"T3",
  "rationale": "<=150 char summary"
}

Scoring guidance:

ai_relevance_score — sustainability / climate / environmental / energy / transport regulatory content. Government regulators with mandates covering ANY of: emissions, air quality, water, waste, energy, climate, fuel, building codes, vehicle standards, public utilities, transport planning, customs, trade. Canonical state-level publishers (CARB, CalEPA, CEC, CPUC, leginfo.legislature.ca.gov, NYDEC, etc.) score 80-95 even when their mandate is broader than just sustainability — they ARE the canonical place where sustainability regulations live. Only score below 60 when the source is unambiguously off-topic (tourism, museums, sports, entertainment, retail not regulated for sustainability).

ai_freight_score — does this jurisdiction's regulatory output operationally affect freight, cargo, shipping, transport, supply chain, or the operations that support them (warehouses, ports, distribution centers, fleets, logistics labor)? This includes INDIRECTLY freight-affecting domains:
- Air quality / emissions standards (truck fleets, port operations)
- Energy / fuel / alternative-fuel regulation (fuel costs, EV charging, hydrogen, SAF)
- Public utility regulation (electric trucks, port electrification, charging infrastructure)
- Vehicle registration / safety / inspection (commercial fleet operations)
- Building / facility codes (warehouses, distribution centers, cold-chain)
- Labor regulation (drivers, dock workers, warehouse staff)
- Customs / trade / sanctions / dangerous goods
- Transport planning / freight corridors / port master plans
- Legislative archives where freight-affecting bills are published (e.g., leginfo.legislature.ca.gov hosts SB 253, SB 261, AB 1305 — all freight-affecting)

State-level umbrella regulators (CalEPA), legislative-archive sites where regulations are codified (leginfo, ecfr), and major regulator portals (CARB, CPUC, CEC) score 60-90 freight even when not pure-freight agencies.

Score below 30 ONLY when the source has no plausible operational impact on freight — tourism, recreation, cultural institutions, off-topic news.

ai_trust_tier — reflects canonicalness, NOT jurisdictional level:
- T1: canonical primary regulatory publication (Federal Register, EUR-Lex, IMO, ICAO, gazettes, official legislative archives like leginfo.legislature.ca.gov)
- T2: canonical regulator (EPA, CARB, EMSA, CPUC, CEC, CalEPA, NYDEC, state-level primary regulators)
- T3: reputable secondary (industry associations, standards bodies, think tanks, academic centers)

Sub-state and state agencies issuing primary regulation are T2 — same as EPA. Air-quality management districts (AQMDs) issuing district rules are T2. Regional boards under state umbrellas are T2.

Output JSON only, no prose, no markdown, no code fences.`;

// ────────────────────────────────────────────────────────────────────────────
// KNOWN_AUTHORITATIVE_PATTERNS — verbatim from california-pilot.mjs.
// 57 patterns covering national TLDs, US/EU/IGO/standards bodies.
// ────────────────────────────────────────────────────────────────────────────

const KNOWN_AUTHORITATIVE_PATTERNS = [
  // ── National government TLDs ──
  { pattern: /(^|\.)gov$/i,                       confidence: "high",   label: "us-gov" },
  { pattern: /(^|\.)gov\.uk$/i,                   confidence: "high",   label: "uk-gov" },
  { pattern: /(^|\.)gc\.ca$/i,                    confidence: "high",   label: "ca-gov" },
  { pattern: /(^|\.)canada\.ca$/i,                confidence: "high",   label: "ca-canada" },
  { pattern: /(^|\.)gov\.au$/i,                   confidence: "high",   label: "au-gov" },
  { pattern: /(^|\.)govt\.nz$/i,                  confidence: "high",   label: "nz-gov" },
  { pattern: /(^|\.)gov\.in$/i,                   confidence: "high",   label: "in-gov" },
  { pattern: /(^|\.)gov\.sg$/i,                   confidence: "high",   label: "sg-gov" },
  { pattern: /(^|\.)gov\.br$/i,                   confidence: "high",   label: "br-gov" },
  { pattern: /(^|\.)go\.kr$/i,                    confidence: "high",   label: "kr-gov" },
  { pattern: /(^|\.)go\.jp$/i,                    confidence: "high",   label: "jp-gov" },
  { pattern: /(^|\.)gob\.cl$/i,                   confidence: "high",   label: "cl-gob" },
  { pattern: /(^|\.)bcn\.cl$/i,                   confidence: "high",   label: "cl-bcn" },
  { pattern: /(^|\.)gob\.mx$/i,                   confidence: "high",   label: "mx-gob" },
  { pattern: /(^|\.)gov\.cn$/i,                   confidence: "high",   label: "cn-gov" },
  { pattern: /(^|\.)npc\.gov\.cn$/i,              confidence: "high",   label: "cn-npc" },

  // ── EU institutions ──
  { pattern: /(^|\.)europa\.eu$/i,                confidence: "high",   label: "eu-europa" },
  { pattern: /(^|\.)eur-lex\.europa\.eu$/i,       confidence: "high",   label: "eu-eurlex" },
  { pattern: /(^|\.)consilium\.europa\.eu$/i,     confidence: "high",   label: "eu-consilium" },
  { pattern: /(^|\.)ec\.europa\.eu$/i,            confidence: "high",   label: "eu-commission" },
  { pattern: /(^|\.)emsa\.europa\.eu$/i,          confidence: "high",   label: "eu-emsa" },

  // ── US Federal regulators ──
  { pattern: /(^|\.)federalregister\.gov$/i,      confidence: "high",   label: "us-fr" },
  { pattern: /(^|\.)regulations\.gov$/i,          confidence: "high",   label: "us-reg" },
  { pattern: /(^|\.)epa\.gov$/i,                  confidence: "high",   label: "us-epa" },
  { pattern: /(^|\.)dot\.gov$/i,                  confidence: "high",   label: "us-dot" },
  { pattern: /(^|\.)cbp\.gov$/i,                  confidence: "high",   label: "us-cbp" },
  { pattern: /(^|\.)faa\.gov$/i,                  confidence: "high",   label: "us-faa" },
  { pattern: /(^|\.)fmcsa\.dot\.gov$/i,           confidence: "high",   label: "us-fmcsa" },

  // ── US State agencies ──
  { pattern: /(^|\.)ca\.gov$/i,                   confidence: "high",   label: "us-ca" },
  { pattern: /(^|\.)arb\.ca\.gov$/i,              confidence: "high",   label: "us-carb" },
  { pattern: /(^|\.)ny\.gov$/i,                   confidence: "high",   label: "us-ny" },
  { pattern: /(^|\.)wa\.gov$/i,                   confidence: "high",   label: "us-wa" },
  { pattern: /(^|\.)oregon\.gov$/i,               confidence: "high",   label: "us-or" },
  { pattern: /(^|\.)mass\.gov$/i,                 confidence: "high",   label: "us-ma" },

  // ── Intergovernmental organizations ──
  { pattern: /(^|\.)un\.org$/i,                   confidence: "high",   label: "un" },
  { pattern: /(^|\.)unfccc\.int$/i,               confidence: "high",   label: "unfccc" },
  { pattern: /(^|\.)imo\.org$/i,                  confidence: "high",   label: "imo" },
  { pattern: /(^|\.)icao\.int$/i,                 confidence: "high",   label: "icao" },
  { pattern: /(^|\.)iea\.org$/i,                  confidence: "high",   label: "iea" },
  { pattern: /(^|\.)worldbank\.org$/i,            confidence: "high",   label: "worldbank" },
  { pattern: /(^|\.)oecd\.org$/i,                 confidence: "high",   label: "oecd" },
  { pattern: /(^|\.)wto\.org$/i,                  confidence: "high",   label: "wto" },
  { pattern: /(^|\.)wcoomd\.org$/i,               confidence: "high",   label: "wco" },

  // ── Standards bodies and recognized industry/research authorities ──
  { pattern: /(^|\.)iso\.org$/i,                  confidence: "high",   label: "iso" },
  { pattern: /(^|\.)ifrs\.org$/i,                 confidence: "high",   label: "ifrs" },
  { pattern: /(^|\.)ghgprotocol\.org$/i,          confidence: "medium", label: "ghg-protocol" },
  { pattern: /(^|\.)sciencebasedtargets\.org$/i,  confidence: "medium", label: "sbti" },
  { pattern: /(^|\.)cdp\.net$/i,                  confidence: "medium", label: "cdp" },
  { pattern: /(^|\.)smartfreightcentre\.org$/i,   confidence: "medium", label: "sfc-glec" },
  { pattern: /(^|\.)theicct\.org$/i,              confidence: "medium", label: "icct" },
  { pattern: /(^|\.)itf-oecd\.org$/i,             confidence: "medium", label: "itf" },
  { pattern: /(^|\.)fiata\.org$/i,                confidence: "medium", label: "fiata" },
  { pattern: /(^|\.)clecat\.org$/i,               confidence: "medium", label: "clecat" },
  { pattern: /(^|\.)iru\.org$/i,                  confidence: "medium", label: "iru" },
  { pattern: /(^|\.)eea\.europa\.eu$/i,           confidence: "high",   label: "eu-eea" },
  { pattern: /(^|\.)climate-laws\.org$/i,         confidence: "medium", label: "climate-laws" },
  { pattern: /(^|\.)ecolex\.org$/i,               confidence: "medium", label: "ecolex" },
];

// ────────────────────────────────────────────────────────────────────────────
// Calibrated thresholds — relevance 70/50, freight 50/25.
// Match src/lib/sources/verification.ts THRESHOLDS exactly.
// ────────────────────────────────────────────────────────────────────────────

const THRESHOLDS = {
  AI_RELEVANCE_H: 70,
  AI_RELEVANCE_M: 50,
  AI_FREIGHT_H: 50,
  AI_FREIGHT_M: 25,
};

// ────────────────────────────────────────────────────────────────────────────
// eTLD+1 extraction — mirrors audit-source-attribution.mjs heuristic.
// Used for host-level idempotency check against existing sources +
// provisional_sources.
// ────────────────────────────────────────────────────────────────────────────

const MULTI_PART_SUFFIXES = [
  // sub-state US agencies
  "ca.gov", "ny.gov", "tx.gov", "fl.gov", "wa.gov", "or.gov", "il.gov",
  "ma.gov", "pa.gov", "mi.gov", "nj.gov", "co.gov", "ga.gov", "nc.gov",
  // common ccTLD multi-parts
  "gov.uk", "ac.uk", "org.uk", "co.uk",
  "gov.au", "com.au", "org.au", "edu.au",
  "gov.br", "com.br", "org.br",
  "gov.in", "co.in", "org.in", "ac.in",
  "co.jp", "or.jp", "ac.jp", "go.jp",
  "gov.cn", "com.cn", "org.cn",
  "gov.sg", "com.sg", "edu.sg",
  "gov.kr", "co.kr", "or.kr",
  "gov.za", "co.za", "org.za",
  "gob.cl", "gob.mx", "gob.ar",
  "gov.it", "gov.es", "gov.fr", "gov.de",
];

function extractHost(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  let s = rawUrl.trim();
  if (!s) return null;
  if (!/^[a-z]+:\/\//i.test(s)) s = "https://" + s;
  try {
    const u = new URL(s);
    let h = u.hostname.toLowerCase();
    if (h.endsWith(".")) h = h.slice(0, -1);
    if (h.startsWith("www.")) h = h.slice(4);
    return h || null;
  } catch {
    return null;
  }
}

function eTLDPlus1(host) {
  if (!host) return null;
  const parts = host.split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".") || null;
  const sorted = [...MULTI_PART_SUFFIXES].sort((a, b) => b.length - a.length);
  for (const suf of sorted) {
    if (host === suf) return host;
    if (host.endsWith("." + suf)) {
      const sufParts = suf.split(".").length;
      return parts.slice(-1 - sufParts).join(".");
    }
  }
  return parts.slice(-2).join(".");
}

// ────────────────────────────────────────────────────────────────────────────
// JSON parse — 3-tier fallback (mirrors discovery.ts)
// ────────────────────────────────────────────────────────────────────────────

function tryParseJson(text) {
  const attempts = [];

  try {
    const parsed = JSON.parse(text);
    attempts.push({ ok: true, parsed, tier: 1 });
    return attempts;
  } catch (e) {
    attempts.push({ ok: false, tier: 1, error: e.message });
  }

  const fenced = text
    .replace(/^[\s\S]*?```(?:json)?\s*/i, "")
    .replace(/\s*```[\s\S]*$/i, "")
    .trim();
  if (fenced && fenced !== text) {
    try {
      const parsed = JSON.parse(fenced);
      attempts.push({ ok: true, parsed, tier: 2 });
      return attempts;
    } catch (e) {
      attempts.push({ ok: false, tier: 2, error: e.message });
    }
  }

  const m = text.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const parsed = JSON.parse(m[0]);
      attempts.push({ ok: true, parsed, tier: 3 });
      return attempts;
    } catch (e) {
      attempts.push({ ok: false, tier: 3, error: e.message });
    }
  }

  return attempts;
}

// ────────────────────────────────────────────────────────────────────────────
// Candidate validation
// ────────────────────────────────────────────────────────────────────────────

const CANDIDATE_TYPES = new Set([
  "regulator", "gazette", "standards-body", "industry-association",
  "court", "court-tracker", "aggregator",
]);

function isPlainObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function validateCandidate(raw, fallbackLanguage) {
  if (!isPlainObject(raw)) return null;

  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const url = typeof raw.url === "string" ? raw.url.trim() : "";
  const typeStr = typeof raw.type === "string" ? raw.type.trim() : "";
  const languageStr =
    typeof raw.language === "string" && raw.language.trim().length > 0
      ? raw.language.trim().toLowerCase()
      : fallbackLanguage;
  const scoreRaw = raw.freight_relevance_score;
  const rationale =
    typeof raw.rationale === "string" ? raw.rationale.trim().slice(0, 200) : "";

  if (!name) return null;
  if (!url || !/^https?:\/\//i.test(url)) return null;
  if (!CANDIDATE_TYPES.has(typeStr)) return null;

  let score;
  if (typeof scoreRaw === "number" && Number.isFinite(scoreRaw)) {
    score = scoreRaw;
  } else if (typeof scoreRaw === "string" && scoreRaw.trim().length > 0) {
    const parsed = Number(scoreRaw);
    if (!Number.isFinite(parsed)) return null;
    score = parsed;
  } else {
    return null;
  }
  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    name, url, type: typeStr, language: languageStr,
    freight_relevance_score: score, rationale,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Sonnet discovery call (one Sonnet call per jurisdiction)
// ────────────────────────────────────────────────────────────────────────────

async function runDiscovery(jurisdictionIso, jurisdictionLabel) {
  const fallbackLanguage = "en";
  const userMessage = `Jurisdiction code: ${jurisdictionIso}
Jurisdiction label: ${jurisdictionLabel}
Depth mode: ${ARGS.depth}
Discovery language preference: ${fallbackLanguage}

Depth guidance: ${DEPTH_CFG.guidance}

Identify the canonical regulatory publishers for this jurisdiction relevant to freight sustainability. Output JSON only (no prose, no markdown, no code fences). The "jurisdiction_label" field must echo the human-readable label. The "candidates" array must conform to the schema in the system prompt.`;

  const t0 = Date.now();

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": ANTHROPIC_VERSION,
      "anthropic-beta": WEB_SEARCH_BETA,
    },
    body: JSON.stringify({
      model: SONNET_MODEL,
      max_tokens: 6000,
      tools: [
        {
          type: WEB_SEARCH_TOOL_NAME,
          name: "web_search",
          max_uses: DEPTH_CFG.webSearchMaxUses,
        },
      ],
      system: DISCOVERY_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Sonnet API ${response.status}: ${body.slice(0, 600)}`
    );
  }

  const data = await response.json();
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  const rawAssistantText =
    (data.content || [])
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text)
      .join("") || "";

  const webSearchCalls =
    (data.content || []).filter(
      (b) => b.type === "server_tool_use" && b.name === "web_search"
    ).length;

  const attempts = tryParseJson(rawAssistantText);
  const winning = attempts.find((a) => a.ok);
  if (!winning) {
    const errorTrace = attempts
      .map((a) => `tier${a.tier}:${a.error ?? "ok"}`)
      .join(" | ");
    throw new Error(
      `Could not extract JSON from Sonnet output. Attempts: ${errorTrace}\n--- raw ---\n${rawAssistantText.slice(0, 2000)}`
    );
  }

  const parsed = winning.parsed;
  if (!isPlainObject(parsed)) {
    throw new Error("Sonnet output parsed but is not a JSON object");
  }

  const labelOut =
    typeof parsed.jurisdiction_label === "string" &&
    parsed.jurisdiction_label.trim().length > 0
      ? parsed.jurisdiction_label.trim()
      : jurisdictionLabel;

  const candidatesRaw = Array.isArray(parsed.candidates) ? parsed.candidates : [];
  const candidates = [];
  const seenUrls = new Set();
  for (const raw of candidatesRaw) {
    const v = validateCandidate(raw, fallbackLanguage);
    if (!v) continue;
    const key = v.url.toLowerCase();
    if (seenUrls.has(key)) continue;
    seenUrls.add(key);
    candidates.push(v);
    if (candidates.length >= DEPTH_CFG.maxCandidates) break;
  }

  return {
    jurisdiction_label: labelOut,
    candidates,
    rawAssistantText,
    webSearchCalls,
    elapsedSeconds: Number(elapsed),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Verification helpers (mirror california-pilot.mjs / verification.ts)
// ────────────────────────────────────────────────────────────────────────────

const HEAD_TIMEOUT_MS = 8_000;
const HEAD_BACKOFF_MS = [200, 800, 3200];
const CONTENT_TIMEOUT_MS = 10_000;
const CONTENT_MAX_CHARS = 6_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkReachability(url) {
  const redirects = [];
  let finalStatus = null;
  let finalUrl = null;
  let lastError;

  for (let attempt = 1; attempt <= 3; attempt++) {
    if (attempt > 1) {
      await sleep(HEAD_BACKOFF_MS[attempt - 1]);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HEAD_TIMEOUT_MS);
    try {
      let current = url;
      let resp = null;
      for (let hop = 0; hop <= 3; hop++) {
        resp = await fetch(current, {
          method: "HEAD",
          redirect: "manual",
          signal: controller.signal,
          headers: {
            "User-Agent": "CarosLedge-Verifier/1.0 (+https://carosledge.com)",
          },
        });
        if (resp.status >= 300 && resp.status < 400) {
          const loc = resp.headers.get("location");
          if (!loc) break;
          const next = new URL(loc, current).toString();
          redirects.push(next);
          current = next;
          continue;
        }
        break;
      }
      clearTimeout(timer);
      finalStatus = resp?.status ?? null;
      finalUrl = current;
      if (finalStatus !== null && finalStatus >= 200 && finalStatus < 300) {
        return { ok: true, finalStatus, finalUrl, attempts: attempt, redirects };
      }
      if (finalStatus === 405) {
        return { ok: true, finalStatus, finalUrl, attempts: attempt, redirects };
      }
      if (finalStatus !== null && finalStatus >= 400 && finalStatus < 500) {
        return {
          ok: false, finalStatus, finalUrl, attempts: attempt, redirects,
          error: `HTTP ${finalStatus}`,
        };
      }
      lastError = `HTTP ${finalStatus}`;
    } catch (e) {
      clearTimeout(timer);
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
  return {
    ok: false, finalStatus, finalUrl, attempts: 3, redirects,
    error: lastError ?? "exhausted retries",
  };
}

async function fetchContent(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONTENT_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "CarosLedge-Verifier/1.0 (+https://carosledge.com)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    clearTimeout(timer);
    if (!resp.ok) {
      return { fetched: false, httpStatus: resp.status, error: `HTTP ${resp.status}` };
    }
    const html = await resp.text();
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, CONTENT_MAX_CHARS);
    return { fetched: true, httpStatus: resp.status, text };
  } catch (e) {
    clearTimeout(timer);
    return { fetched: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function checkDomainAuthority(url) {
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return { pattern: null, confidence: "low", matchedHost: null };
  }
  for (const dp of KNOWN_AUTHORITATIVE_PATTERNS) {
    if (dp.pattern.test(host)) {
      return { pattern: dp.label, confidence: dp.confidence, matchedHost: host };
    }
  }
  return { pattern: null, confidence: "low", matchedHost: host };
}

const ENGLISH_STOPWORDS = new Set([
  "the", "and", "of", "to", "in", "is", "it", "for", "on", "with",
  "as", "by", "this", "that", "from", "or", "be", "are", "an", "at",
]);

function detectLanguage(text) {
  if (!text || text.length < 100) {
    return { language: null, method: "fallback" };
  }
  const sample = text.slice(0, 4000);
  const asciiLetters = (sample.match(/[a-zA-Z]/g) ?? []).length;
  const totalNonSpace = (sample.match(/\S/g) ?? []).length;
  if (totalNonSpace === 0) return { language: null, method: "fallback" };
  const asciiRatio = asciiLetters / totalNonSpace;
  if (asciiRatio < 0.5) {
    return { language: "non-english", method: "heuristic" };
  }
  const words = sample.toLowerCase().split(/\s+/).filter(Boolean);
  let stopwordHits = 0;
  for (const w of words) {
    if (ENGLISH_STOPWORDS.has(w)) stopwordHits++;
  }
  if (stopwordHits >= 8) return { language: "en", method: "heuristic" };
  return { language: "non-english", method: "heuristic" };
}

async function classifyWithHaiku(candidate, contentText) {
  const userMessage = `Candidate URL: ${candidate.url}
Candidate name: ${candidate.name ?? "(unknown)"}
Discovered for jurisdiction: ${candidate.discoveredFor ?? "(unspecified)"}

Content excerpt (truncated to ~6000 chars):
---
${contentText.slice(0, CONTENT_MAX_CHARS)}
---

Output the JSON object only.`;

  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  try {
    const resp = await client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 600,
      system: VERIFICATION_HAIKU_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });
    const text = resp.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return { ok: false, error: "No JSON object in model output" };
    const parsed = JSON.parse(m[0]);
    if (
      typeof parsed.ai_relevance_score !== "number" ||
      typeof parsed.ai_freight_score !== "number" ||
      typeof parsed.ai_trust_tier !== "string" ||
      !["T1", "T2", "T3"].includes(parsed.ai_trust_tier) ||
      typeof parsed.rationale !== "string"
    ) {
      return { ok: false, error: "Malformed classification shape" };
    }
    const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
    return {
      ok: true,
      result: {
        ai_relevance_score: clamp(parsed.ai_relevance_score),
        ai_freight_score: clamp(parsed.ai_freight_score),
        ai_trust_tier: parsed.ai_trust_tier,
        rationale: String(parsed.rationale).slice(0, 200),
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function aggregateTier(input) {
  const triggers = [];

  if (!input.reachable) {
    triggers.push("reachability_fail");
    return { tier: "L", triggers, rejection_reason: "reachability" };
  }
  if (input.duplicate) {
    triggers.push("duplicate");
    return { tier: "L", triggers, rejection_reason: "duplicate" };
  }
  if (input.ai && input.ai.ai_relevance_score < THRESHOLDS.AI_RELEVANCE_M) {
    triggers.push(`ai_relevance_low(${input.ai.ai_relevance_score})`);
    return { tier: "L", triggers, rejection_reason: "ai_relevance_low" };
  }
  if (input.ai && input.ai.ai_freight_score < THRESHOLDS.AI_FREIGHT_M) {
    triggers.push(`ai_freight_low(${input.ai.ai_freight_score})`);
    return { tier: "L", triggers, rejection_reason: "not_freight_relevant" };
  }
  if (!input.ai) {
    triggers.push("ai_call_failed");
    return { tier: "M", triggers, rejection_reason: "ai_call_failed" };
  }
  if (input.language !== "en") {
    triggers.push(`language_${input.language ?? "unknown"}`);
    return { tier: "M", triggers, rejection_reason: "language_non_english" };
  }
  if (input.domainConfidence === "low") {
    triggers.push("domain_unknown");
    return { tier: "M", triggers, rejection_reason: "domain_unknown" };
  }

  const hRelevance = input.ai.ai_relevance_score >= THRESHOLDS.AI_RELEVANCE_H;
  const hFreight = input.ai.ai_freight_score >= THRESHOLDS.AI_FREIGHT_H;
  if (hRelevance && hFreight && input.domainConfidence === "high") {
    triggers.push(
      `H_clear(rel=${input.ai.ai_relevance_score},frt=${input.ai.ai_freight_score},dom=high)`
    );
    return { tier: "H", triggers };
  }

  triggers.push(
    `M_default(rel=${input.ai.ai_relevance_score},frt=${input.ai.ai_freight_score},dom=${input.domainConfidence})`
  );
  return { tier: "M", triggers };
}

function tierToAction(tier) {
  return tier === "H"
    ? "auto-approved"
    : tier === "M"
    ? "queued-provisional"
    : "rejected";
}

// ────────────────────────────────────────────────────────────────────────────
// Idempotency check — eTLD+1 host match against existing sources +
// provisional_sources. Loads both tables once at the top of the run and
// keeps an in-memory set; new INSERTs during the run also extend the set
// so the same host doesn't get inserted twice within a single run.
// ────────────────────────────────────────────────────────────────────────────

async function loadExistingHosts(supabase) {
  const set = new Set();

  // Sources — paginate to clear the default 1000-row cap.
  let from = 0;
  const PAGE = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from("sources")
      .select("url")
      .range(from, from + PAGE - 1);
    if (error) {
      throw new Error(`sources query failed: ${error.message}`);
    }
    if (!data || data.length === 0) break;
    for (const row of data) {
      const e = eTLDPlus1(extractHost(row.url));
      if (e) set.add(e);
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }

  // Provisional sources.
  from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("provisional_sources")
      .select("url")
      .range(from, from + PAGE - 1);
    if (error) {
      throw new Error(`provisional_sources query failed: ${error.message}`);
    }
    if (!data || data.length === 0) break;
    for (const row of data) {
      const e = eTLDPlus1(extractHost(row.url));
      if (e) set.add(e);
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return set;
}

function isDuplicateHost(url, hostsSet) {
  const e = eTLDPlus1(extractHost(url));
  if (!e) return { duplicate: false, etld: null };
  return { duplicate: hostsSet.has(e), etld: e };
}

// ────────────────────────────────────────────────────────────────────────────
// Database writes — sources / provisional_sources / source_verifications
// ────────────────────────────────────────────────────────────────────────────
//
// sources.tier and provisional_sources.recommended_tier use the project's
// numeric tier scheme (1-7), NOT the AI string tier (T1/T2/T3). Mapping:
//   T1 → 1   (canonical primary regulatory publication)
//   T2 → 2   (canonical regulator)
//   T3 → 4   (industry / standards body — matches verification.ts)
//
// discovered_via on provisional_sources must satisfy the CHECK constraint
// in migration 004:
//   ('skill_recommendation', 'citation_detection', 'worker_search', 'manual_add').
// We use 'worker_search' (the discovery-agent channel).

function aiTierToNumeric(aiTier) {
  if (aiTier === "T1") return 1;
  if (aiTier === "T2") return 2;
  if (aiTier === "T3") return 4;
  return null;
}

async function insertSource(supabase, candidate, ai, jurisdictionIso) {
  const numericTier = aiTierToNumeric(ai?.ai_trust_tier);
  // sources.tier has a NOT NULL CHECK BETWEEN 1 AND 7. ai must be present
  // for tier H by aggregation rules, so numericTier should be non-null
  // here. If for any reason ai is missing we default to tier 4 (least
  // restrictive that still passes the CHECK) so the insert doesn't fail.
  const finalTier = numericTier ?? 4;

  const newSource = {
    name: candidate.name || candidate.url,
    url: candidate.url,
    description: ai?.rationale ?? "",
    tier: finalTier,
    tier_at_creation: finalTier,
    domains: [1], // Regulatory & Legislative — refined later by spot-check.
    jurisdictions: [], // legacy; W4 backfill agent populates.
    jurisdiction_iso: [jurisdictionIso],
    transport_modes: [],
    access_method: "scrape",
    status: "active",
    admin_only: false,
    processing_paused: false,
    update_frequency: "weekly",
    intelligence_types: ["GUIDE"],
    notes:
      `Auto-approved via W3 Tier 1 population runner ${new Date().toISOString().slice(0, 10)} ` +
      `for jurisdiction ${jurisdictionIso}. ` +
      `AI scores: rel=${ai?.ai_relevance_score ?? "?"}, frt=${ai?.ai_freight_score ?? "?"}, trust=${ai?.ai_trust_tier ?? "?"}. ` +
      `Awaiting platform-admin spot-check.`,
  };

  const { data, error } = await supabase
    .from("sources")
    .insert(newSource)
    .select("id")
    .single();
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true, id: data.id };
}

async function insertProvisional(supabase, candidate, ai, jurisdictionIso, rejectionReason) {
  const recommended = aiTierToNumeric(ai?.ai_trust_tier);
  const newProv = {
    name: candidate.name || candidate.url,
    url: candidate.url,
    description:
      ai?.rationale ??
      `Queued by W3 Tier 1 population runner. Reason: ${rejectionReason ?? "uncertain"}.`,
    discovered_via: "worker_search",
    discovered_for_jurisdiction: jurisdictionIso,
    status: "pending_review",
    provisional_tier: 7,
    recommended_tier: recommended,
    jurisdictions: [jurisdictionIso],
    reviewer_notes:
      `Auto-queued ${new Date().toISOString().slice(0, 10)} ` +
      `(jurisdiction ${jurisdictionIso}): ${rejectionReason ?? "uncertain"}. ` +
      `ai_rel=${ai?.ai_relevance_score ?? "?"}, ai_frt=${ai?.ai_freight_score ?? "?"}.`,
  };

  const { data, error } = await supabase
    .from("provisional_sources")
    .insert(newProv)
    .select("id")
    .single();

  if (error) {
    // UNIQUE(url) is the safety net for an exact-URL duplicate that slipped
    // past the eTLD+1 check (e.g. exotic multi-part suffixes). Treat as
    // non-failure and let the caller record action='rejected' duplicate.
    if (
      (error.message && error.message.toLowerCase().includes("unique")) ||
      error.code === "23505"
    ) {
      return { ok: false, error: "duplicate_url_unique_violation", duplicate: true };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true, id: data.id };
}

async function writeAuditRow(
  supabase,
  candidate,
  jurisdictionIso,
  language,
  ai,
  tier,
  actionTaken,
  rejectionReason,
  verificationLog,
  resultingSourceId,
  resultingProvisionalId
) {
  const row = {
    candidate_url: candidate.url,
    candidate_name: candidate.name ?? null,
    jurisdiction_iso: [jurisdictionIso],
    language: language ?? null,
    ai_relevance_score: ai?.ai_relevance_score ?? null,
    ai_freight_score: ai?.ai_freight_score ?? null,
    ai_trust_tier: ai?.ai_trust_tier ?? null,
    verification_tier: tier,
    action_taken: actionTaken,
    rejection_reason: rejectionReason ?? null,
    verification_log: verificationLog,
    resulting_source_id: resultingSourceId ?? null,
    resulting_provisional_id: resultingProvisionalId ?? null,
  };
  const { error } = await supabase.from("source_verifications").insert(row);
  if (error) {
    // Audit-log failure is logged but not fatal. The pipeline shouldn't
    // grind to a halt because the audit table choked.
    console.warn(
      `  [audit] write failed for ${candidate.url}: ${error.message}`
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// verifyOne — full verification pipeline + write actions
// ────────────────────────────────────────────────────────────────────────────

async function verifyOne(candidate, jurisdictionIso, supabase, hostsSet) {
  const startedAt = Date.now();
  const log = {
    candidate_url: candidate.url,
    candidate_name: candidate.name,
    discoveredFor: jurisdictionIso,
    reachability: { attempts: 0, finalStatus: null, finalUrl: null, redirects: [] },
    content: { fetched: false },
    domain: { pattern: null, confidence: "low", matchedHost: null },
    duplicate: { skipped: false, matched: false, method: undefined, matchedHost: null },
    language: { detected: null, method: "skipped" },
    ai: { called: false },
    aggregation: { triggers: [], decision: "L" },
    action: { taken: "rejected" },
    timing: { totalMs: 0 },
  };

  let aiResult = null;
  let language = null;

  // Step 1 — reachability
  const reach = await checkReachability(candidate.url);
  log.reachability = {
    attempts: reach.attempts,
    finalStatus: reach.finalStatus,
    finalUrl: reach.finalUrl,
    redirects: reach.redirects,
    error: reach.error,
  };

  // Reachability failure → tier L immediately, write audit row, exit.
  if (!reach.ok) {
    const agg = aggregateTier({
      reachable: false, duplicate: false,
      domainConfidence: "low", language: null, ai: null,
    });
    log.aggregation = { triggers: agg.triggers, decision: agg.tier };
    log.action.taken = "rejected";
    log.timing.totalMs = Date.now() - startedAt;

    await writeAuditRow(
      supabase, candidate, jurisdictionIso, null, null,
      "L", "rejected", agg.rejection_reason, log, null, null
    );

    return {
      tier: "L",
      action: "rejected",
      ai_relevance_score: null,
      ai_freight_score: null,
      ai_trust_tier: null,
      rationale: null,
      head_status: reach.finalStatus,
      domain_confidence: "low",
      domain_pattern: null,
      rejection_reason: agg.rejection_reason,
      duplicate: false,
      haiku_called: false,
    };
  }

  const resolvedUrl = reach.finalUrl ?? candidate.url;

  // Step 3 — domain authority (cheap, do before content)
  const domain = checkDomainAuthority(resolvedUrl);
  log.domain = domain;

  // Step 4 — duplicate check (host-level eTLD+1 against in-memory set)
  const dup = isDuplicateHost(resolvedUrl, hostsSet);
  log.duplicate = {
    skipped: false,
    matched: dup.duplicate,
    method: dup.duplicate ? "host" : undefined,
    matchedHost: dup.etld,
  };

  if (dup.duplicate) {
    const agg = aggregateTier({
      reachable: true, duplicate: true,
      domainConfidence: domain.confidence, language: null, ai: null,
    });
    log.aggregation = { triggers: agg.triggers, decision: agg.tier };
    log.action.taken = "rejected";
    log.timing.totalMs = Date.now() - startedAt;

    await writeAuditRow(
      supabase, candidate, jurisdictionIso, null, null,
      "L", "rejected", "duplicate", log, null, null
    );

    return {
      tier: "L",
      action: "rejected",
      ai_relevance_score: null,
      ai_freight_score: null,
      ai_trust_tier: null,
      rationale: null,
      head_status: reach.finalStatus,
      domain_confidence: domain.confidence,
      domain_pattern: domain.pattern,
      rejection_reason: "duplicate",
      duplicate: true,
      haiku_called: false,
    };
  }

  // Step 2 — content fetch
  const content = await fetchContent(resolvedUrl);
  log.content = {
    fetched: content.fetched,
    httpStatus: content.httpStatus,
    textLength: content.text?.length,
    error: content.error,
  };
  const contentText = content.text ?? "";

  // Step 5 — language
  const lang = detectLanguage(contentText);
  log.language = { detected: lang.language, method: lang.method };
  language = lang.language;

  // Step 6 — Haiku
  let haikuCalled = false;
  if (!contentText) {
    log.ai = { called: false, error: "no content to classify" };
  } else {
    haikuCalled = true;
    const aiCall = await classifyWithHaiku(
      { ...candidate, discoveredFor: jurisdictionIso },
      contentText
    );
    if (aiCall.ok) {
      aiResult = aiCall.result;
      log.ai = { called: true, rationale: aiCall.result.rationale };
    } else {
      log.ai = { called: true, error: aiCall.error };
    }
  }

  // Step 7 — aggregate
  const agg = aggregateTier({
    reachable: true,
    duplicate: false,
    domainConfidence: domain.confidence,
    language,
    ai: aiResult,
  });
  log.aggregation = { triggers: agg.triggers, decision: agg.tier };

  // Step 8 — execute action (insert into sources OR provisional_sources)
  let action = tierToAction(agg.tier);
  let resultingSourceId = null;
  let resultingProvisionalId = null;

  if (agg.tier === "H") {
    const ins = await insertSource(supabase, candidate, aiResult, jurisdictionIso);
    if (ins.ok) {
      resultingSourceId = ins.id;
      // Add the eTLD+1 to the in-memory set so subsequent candidates
      // within the same run dedupe against this newly-inserted host.
      const e = eTLDPlus1(extractHost(candidate.url));
      if (e) hostsSet.add(e);
    } else {
      action = "rejected";
      log.action.error = `H insert failed: ${ins.error}`;
    }
  } else if (agg.tier === "M") {
    const ins = await insertProvisional(
      supabase, candidate, aiResult, jurisdictionIso, agg.rejection_reason
    );
    if (ins.ok) {
      resultingProvisionalId = ins.id;
      const e = eTLDPlus1(extractHost(candidate.url));
      if (e) hostsSet.add(e);
    } else if (ins.duplicate) {
      // Exact-URL duplicate slipped past eTLD+1 check — treat as a
      // duplicate-rejection in the audit log.
      action = "rejected";
      log.action.error = "duplicate_url_unique_violation";
    } else {
      action = "rejected";
      log.action.error = `M insert failed: ${ins.error}`;
    }
  }

  log.action.taken = action;
  log.timing.totalMs = Date.now() - startedAt;

  await writeAuditRow(
    supabase, candidate, jurisdictionIso, language, aiResult,
    agg.tier, action, agg.rejection_reason, log,
    resultingSourceId, resultingProvisionalId
  );

  return {
    tier: agg.tier,
    action,
    ai_relevance_score: aiResult?.ai_relevance_score ?? null,
    ai_freight_score: aiResult?.ai_freight_score ?? null,
    ai_trust_tier: aiResult?.ai_trust_tier ?? null,
    rationale: aiResult?.rationale ?? null,
    head_status: reach.finalStatus,
    domain_confidence: domain.confidence,
    domain_pattern: domain.pattern,
    rejection_reason: agg.rejection_reason ?? null,
    duplicate: false,
    haiku_called: haikuCalled,
    resulting_source_id: resultingSourceId,
    resulting_provisional_id: resultingProvisionalId,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Per-jurisdiction runner
// ────────────────────────────────────────────────────────────────────────────

async function runOneJurisdiction(jurisdictionIso, supabase, hostsSet, costAccumulator) {
  const label = isoToLabel(jurisdictionIso);
  const t0 = Date.now();

  console.log(`\n══════════════════════════════════════════════════════════════`);
  console.log(`Jurisdiction: ${jurisdictionIso} (${label})`);
  console.log(`Depth: ${ARGS.depth}`);
  console.log(`Running discovery (Sonnet ${SONNET_MODEL})...`);

  let discovery;
  try {
    discovery = await runDiscovery(jurisdictionIso, label);
  } catch (e) {
    console.error(`  ERROR: discovery failed: ${e.message}`);
    return {
      jurisdiction_iso: jurisdictionIso,
      jurisdiction_label: label,
      ok: false,
      error: e.message,
      candidate_count: 0,
      tier_distribution: { H: 0, M: 0, L: 0 },
      duplicates: 0,
      web_search_calls: 0,
      sonnet_cost_usd: DEPTH_CFG.sonnetCostUsd,
      haiku_calls: 0,
      haiku_cost_usd: 0,
      elapsed_seconds: (Date.now() - t0) / 1000,
      results: [],
    };
  }

  costAccumulator.sonnet += DEPTH_CFG.sonnetCostUsd;

  console.log(
    `  ${discovery.candidates.length} valid candidates, ${discovery.webSearchCalls} web_search calls, ${discovery.elapsedSeconds}s`
  );

  // Verify each candidate sequentially.
  const results = [];
  let haikuCalls = 0;
  let duplicates = 0;
  const tierDistribution = { H: 0, M: 0, L: 0 };

  for (let i = 0; i < discovery.candidates.length; i++) {
    const c = discovery.candidates[i];
    process.stdout.write(`  [${i + 1}/${discovery.candidates.length}] ${c.url} ... `);

    let v;
    try {
      v = await verifyOne(c, jurisdictionIso, supabase, hostsSet);
    } catch (e) {
      console.log(`ERROR: ${e.message}`);
      results.push({
        url: c.url, name: c.name,
        tier: "L", action: "rejected",
        ai_relevance_score: null, ai_freight_score: null,
        ai_trust_tier: null, rationale: null,
        head_status: null, domain_confidence: null,
        domain_pattern: null, rejection_reason: `error:${e.message}`,
        duplicate: false, haiku_called: false,
      });
      tierDistribution.L++;
      continue;
    }

    if (v.haiku_called) {
      haikuCalls++;
      costAccumulator.haiku += HAIKU_COST_PER_CALL_USD;
    }
    if (v.duplicate) duplicates++;
    tierDistribution[v.tier]++;

    process.stdout.write(
      `tier=${v.tier} ` +
      `rel=${v.ai_relevance_score ?? "-"} frt=${v.ai_freight_score ?? "-"} ` +
      `${v.duplicate ? "DUP " : ""}` +
      `→ ${v.action}\n`
    );

    results.push({ url: c.url, name: c.name, ...v });

    // Cost cap mid-jurisdiction guard.
    const total = costAccumulator.sonnet + costAccumulator.haiku;
    if (MAX_COST_USD !== null && total > MAX_COST_USD) {
      console.log(
        `\n  COST CAP REACHED ($${total.toFixed(4)} > $${MAX_COST_USD.toFixed(4)}). ` +
        `Stopping mid-jurisdiction.`
      );
      break;
    }
  }

  const elapsed = (Date.now() - t0) / 1000;

  console.log(
    `  Tier H: ${tierDistribution.H}  M: ${tierDistribution.M}  L: ${tierDistribution.L} ` +
    `(${duplicates} duplicates) — ${elapsed.toFixed(1)}s`
  );

  return {
    jurisdiction_iso: jurisdictionIso,
    jurisdiction_label: label,
    ok: true,
    candidate_count: discovery.candidates.length,
    tier_distribution: tierDistribution,
    duplicates,
    web_search_calls: discovery.webSearchCalls,
    sonnet_cost_usd: DEPTH_CFG.sonnetCostUsd,
    haiku_calls: haikuCalls,
    haiku_cost_usd: haikuCalls * HAIKU_COST_PER_CALL_USD,
    elapsed_seconds: elapsed,
    results: results.map((r) => ({
      url: r.url,
      name: r.name,
      tier: r.tier,
      action: r.action,
      ai_relevance_score: r.ai_relevance_score,
      ai_freight_score: r.ai_freight_score,
      ai_trust_tier: r.ai_trust_tier,
      rationale: r.rationale,
      head_status: r.head_status,
      domain_confidence: r.domain_confidence,
      domain_pattern: r.domain_pattern,
      rejection_reason: r.rejection_reason,
      duplicate: r.duplicate ?? false,
      haiku_called: r.haiku_called ?? false,
      resulting_source_id: r.resulting_source_id ?? null,
      resulting_provisional_id: r.resulting_provisional_id ?? null,
    })),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Report writer + interrupt handler
// ────────────────────────────────────────────────────────────────────────────

let RUN_STATE = null;

function writeReport(state) {
  try {
    mkdirSync(DOCS_DIR, { recursive: true });
  } catch {}
  const totalCost = state.costAccumulator.sonnet + state.costAccumulator.haiku;
  const totals = state.jurisdictionResults.reduce(
    (acc, j) => {
      acc.candidate_count += j.candidate_count;
      acc.tier_H += j.tier_distribution.H;
      acc.tier_M += j.tier_distribution.M;
      acc.tier_L += j.tier_distribution.L;
      acc.duplicates += j.duplicates;
      acc.haiku_calls += j.haiku_calls;
      acc.elapsed_seconds += j.elapsed_seconds;
      return acc;
    },
    {
      candidate_count: 0, tier_H: 0, tier_M: 0, tier_L: 0,
      duplicates: 0, haiku_calls: 0, elapsed_seconds: 0,
    }
  );

  const report = {
    ran_at: state.ranAt,
    region: state.region,
    depth: state.depth,
    interrupted: state.interrupted,
    jurisdiction_count_total: state.jurisdictionsAll.length,
    jurisdiction_count_processed: state.jurisdictionResults.length,
    cost_usd: {
      sonnet: Number(state.costAccumulator.sonnet.toFixed(4)),
      haiku: Number(state.costAccumulator.haiku.toFixed(4)),
      total: Number(totalCost.toFixed(4)),
      cap: MAX_COST_USD,
    },
    totals,
    jurisdictions: state.jurisdictionResults,
  };

  writeFileSync(REPORT_JSON_PATH, JSON.stringify(report, null, 2), "utf8");
  return report;
}

process.on("SIGINT", () => {
  console.log("\n\nSIGINT received — writing partial report and exiting.");
  if (RUN_STATE) {
    RUN_STATE.interrupted = true;
    try {
      const r = writeReport(RUN_STATE);
      console.log(`Wrote ${REPORT_JSON_PATH}`);
      console.log(
        `Total cost so far: $${r.cost_usd.total.toFixed(4)} ` +
        `(processed ${r.jurisdiction_count_processed}/${r.jurisdiction_count_total} jurisdictions)`
      );
    } catch (e) {
      console.error(`  ERROR writing report: ${e.message}`);
    }
  }
  process.exit(130);
});

// ────────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────────

async function main() {
  const ranAt = new Date().toISOString();
  const jurisdictionsAll = REGIONS[ARGS.region];

  console.log(`══════════════════════════════════════════════════════════════`);
  console.log(`W3 Tier 1 population runner`);
  console.log(`Region:            ${ARGS.region}`);
  console.log(`Depth:             ${ARGS.depth}`);
  console.log(`Jurisdictions:     ${jurisdictionsAll.length}`);
  console.log(`Cost cap:          ${MAX_COST_USD === null ? "(none)" : `$${MAX_COST_USD.toFixed(2)}`}`);
  console.log(`Output:            ${REPORT_JSON_PATH}`);
  console.log(`Started:           ${ranAt}`);
  console.log(`══════════════════════════════════════════════════════════════`);

  // No-op region (CITIES) — exit gracefully with zero exit code.
  if (jurisdictionsAll.length === 0) {
    console.log(
      `\nRegion ${ARGS.region} is empty — Tier 1 cities collapse onto state codes ` +
      `already covered by US block. No-op exit.`
    );
    try {
      mkdirSync(DOCS_DIR, { recursive: true });
    } catch {}
    writeFileSync(
      REPORT_JSON_PATH,
      JSON.stringify(
        {
          ran_at: ranAt,
          region: ARGS.region,
          depth: ARGS.depth,
          interrupted: false,
          jurisdiction_count_total: 0,
          jurisdiction_count_processed: 0,
          cost_usd: { sonnet: 0, haiku: 0, total: 0, cap: MAX_COST_USD },
          totals: {
            candidate_count: 0, tier_H: 0, tier_M: 0, tier_L: 0,
            duplicates: 0, haiku_calls: 0, elapsed_seconds: 0,
          },
          jurisdictions: [],
          note: "no-op region (cities collapse onto state codes)",
        },
        null,
        2
      ),
      "utf8"
    );
    console.log(`Wrote ${REPORT_JSON_PATH}`);
    process.exit(0);
  }

  // Boot Supabase service-role client (bypasses RLS).
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  console.log(`\nLoading existing source URLs for idempotency...`);
  const hostsSet = await loadExistingHosts(supabase);
  console.log(`  ${hostsSet.size} existing eTLD+1 hosts loaded.`);

  const costAccumulator = { sonnet: 0, haiku: 0 };
  const jurisdictionResults = [];

  RUN_STATE = {
    ranAt,
    region: ARGS.region,
    depth: ARGS.depth,
    jurisdictionsAll,
    jurisdictionResults,
    costAccumulator,
    interrupted: false,
  };

  for (let idx = 0; idx < jurisdictionsAll.length; idx++) {
    const iso = jurisdictionsAll[idx];

    // Cost cap check before starting another jurisdiction.
    const total = costAccumulator.sonnet + costAccumulator.haiku;
    if (MAX_COST_USD !== null && total > MAX_COST_USD) {
      console.log(
        `\nCOST CAP REACHED ($${total.toFixed(4)} > $${MAX_COST_USD.toFixed(4)}). ` +
        `Skipping remaining ${jurisdictionsAll.length - idx} jurisdictions.`
      );
      break;
    }

    const result = await runOneJurisdiction(iso, supabase, hostsSet, costAccumulator);
    jurisdictionResults.push(result);

    // Per-jurisdiction cost printout — important since this scales.
    const runningTotal = costAccumulator.sonnet + costAccumulator.haiku;
    console.log(
      `  Running cost: Sonnet $${costAccumulator.sonnet.toFixed(4)} + ` +
      `Haiku $${costAccumulator.haiku.toFixed(4)} = $${runningTotal.toFixed(4)} ` +
      `(${idx + 1}/${jurisdictionsAll.length} done)`
    );
  }

  // Final report.
  const report = writeReport(RUN_STATE);

  console.log(`\n══════════════════════════════════════════════════════════════`);
  console.log(`Region ${ARGS.region} complete.`);
  console.log(`Processed:    ${report.jurisdiction_count_processed}/${report.jurisdiction_count_total}`);
  console.log(`Candidates:   ${report.totals.candidate_count}`);
  console.log(`Tier H:       ${report.totals.tier_H}`);
  console.log(`Tier M:       ${report.totals.tier_M}`);
  console.log(`Tier L:       ${report.totals.tier_L}`);
  console.log(`Duplicates:   ${report.totals.duplicates}`);
  console.log(`Haiku calls:  ${report.totals.haiku_calls}`);
  console.log(`Wall time:    ${report.totals.elapsed_seconds.toFixed(1)}s`);
  console.log(`Total cost:   $${report.cost_usd.total.toFixed(4)} ` +
    `(Sonnet $${report.cost_usd.sonnet.toFixed(4)} + Haiku $${report.cost_usd.haiku.toFixed(4)})`);
  console.log(`Wrote:        ${REPORT_JSON_PATH}`);
  console.log(`══════════════════════════════════════════════════════════════`);
}

main().catch((e) => {
  console.error("FATAL:", e?.stack || e?.message || e);
  // Try to flush a partial report so the operator has something to inspect.
  if (RUN_STATE) {
    try {
      RUN_STATE.interrupted = true;
      writeReport(RUN_STATE);
      console.error(`Wrote partial report to ${REPORT_JSON_PATH}`);
    } catch {}
  }
  process.exit(1);
});
