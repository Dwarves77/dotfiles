/**
 * tier1-us-cities-execute.mjs — Tier 1 Wave C writes for US major cities.
 *
 * 10 cities: New York City, Los Angeles, Chicago, Houston, San Francisco,
 * Boston, Seattle, Miami, Philadelphia, Atlanta.
 *
 * ─── ISO 3166-2 custom-code rationale ──────────────────────────────────
 * US cities have NO official ISO 3166-2 codes (the standard only defines
 * codes down to state/territory level: e.g., US-NY, US-CA). To preserve
 * the schema's `jurisdiction_iso text[]` shape and let the app filter by
 * city, this script adopts custom codes prefixed `US-` plus a 3-letter
 * city abbreviation:
 *
 *   US-NYC  New York City     (parent state US-NY)
 *   US-LAX  Los Angeles       (parent state US-CA)  -- airport code; "US-LA" collides with Louisiana ISO 3166-2
 *   US-CHI  Chicago           (parent state US-IL)
 *   US-HOU  Houston           (parent state US-TX)
 *   US-SF   San Francisco     (parent state US-CA)
 *   US-BOS  Boston            (parent state US-MA)
 *   US-SEA  Seattle           (parent state US-WA)
 *   US-MIA  Miami             (parent state US-FL)
 *   US-PHI  Philadelphia      (parent state US-PA)
 *   US-ATL  Atlanta           (parent state US-GA)
 *
 * These codes are NOT in ISO 3166 — they're internal tags. Documented
 * here so future maintainers don't mistake them for ISO-standard codes.
 *
 * NOTE on US-LAX: dispatch suggested "LAX→LA" — but US-LA is the official
 * ISO 3166-2 code for the State of Louisiana and 3 existing Louisiana
 * sources are already tagged with it (LDEQ, LA DOTD Freight, LA State
 * Legislature). To avoid silent ambiguity, this script uses `US-LAX`
 * (matching the airport code Jason cited) for the city of Los Angeles.
 *
 * ─── Authorized scope (Tier 1 Wave C dispatch, 2026-05-07) ─────────────
 *
 * (a) 20 source inserts — one city environmental body + one city
 *     legislative body per city. All tier 1, status=active, admin_only=false.
 * (b) 2 jurisdiction retags:
 *       - NYC LL97 (legacy_id=nyc-local-law-97-building-carbon-emissions-caps)
 *         currently ['US-NY']  ->  ['US-NY','US-NYC']  (multi-tag, preserve state)
 *       - r31 (Port of Los Angeles Green) currently ['US']
 *         ->  ['US-CA','US-LAX'] (multi-tag, preserve state context; LAX
 *         avoids ISO 3166-2 collision with Louisiana state code)
 * (c) Nothing else.
 *
 * ─── Pre-flight findings (2026-05-07, read-only investigation) ─────────
 *
 *   - 0 existing city-URL-scoped sources for any of the 10 cities
 *   - 0 URL collisions across 20 planned inserts (full host-substring scan)
 *   - intelligence_items:
 *       * NYC LL97 confirmed at jurisdiction_iso=['US-NY']
 *       * r31 (Port of LA) confirmed at jurisdiction_iso=['US']
 *       * 0 other items match any of the 10 cities
 *
 * Per-step verification with halt-on-mismatch.
 */
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { writeFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
process.chdir(resolve(__dirname, ".."));
process.loadEnvFile(".env.local");

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const log = [];
const insertedIds = [];
const retagsApplied = [];

const LOG_PATH = resolve("..", "docs", "tier1-us-cities-execute-log.json");

function flushLog(extra = {}) {
  writeFileSync(
    LOG_PATH,
    JSON.stringify({ ...extra, log, insertedIds, retagsApplied }, null, 2),
    "utf8"
  );
}

function step(name, ok, detail) {
  const line = `[${ok ? "OK" : "FAIL"}] ${name} — ${detail}`;
  console.log(line);
  log.push({ name, ok, detail, at: new Date().toISOString() });
  if (!ok) {
    flushLog({ aborted_at: name });
    process.exit(1);
  }
}

// ─── Insert spec ───────────────────────────────────────────────────────
// 20 rows: env body + city council per city. All tier 1.
const INSERTS = [
  // NYC
  {
    label: "nyc_climate",
    iso: ["US-NY", "US-NYC"],
    name: "NYC Mayor's Office of Climate & Environmental Justice (Sustainability)",
    url: "https://www.nyc.gov/site/sustainability/index.page",
    description:
      "New York City's principal sustainability and climate office. Coordinates LL97 building emissions implementation, OneNYC climate plan, and citywide environmental-justice programs affecting NYC port operations, last-mile freight, and warehousing.",
    intelligence_types: ["regulation", "guidance"],
    collisionUrlSubstring: "nyc.gov/site/sustainability",
  },
  {
    label: "nyc_council",
    iso: ["US-NY", "US-NYC"],
    name: "New York City Council",
    url: "https://council.nyc.gov/",
    description:
      "NYC's legislative body. Authoritative source for Local Laws (including LL97 and successor building-emissions legislation), council resolutions, and NYC-specific climate and freight ordinances.",
    intelligence_types: ["legislation"],
    collisionUrlSubstring: "council.nyc.gov",
  },

  // Los Angeles  (US-LAX — airport code; "US-LA" collides with Louisiana ISO 3166-2)
  {
    label: "la_departments",
    iso: ["US-CA", "US-LAX"],
    name: "City of Los Angeles — Departments & Bureaus",
    url: "https://www.lacity.gov/government/departments-bureaus",
    description:
      "Directory and primary entry point for City of Los Angeles departments including LADWP, Bureau of Sanitation & Environment, and Office of Sustainability. Authoritative for LA municipal sustainability programs, drayage policy at LA/LB ports, and municipal building/energy rules.",
    intelligence_types: ["regulation", "guidance"],
    collisionUrlSubstring: "lacity.gov/government/departments-bureaus",
  },
  {
    label: "la_council",
    iso: ["US-CA", "US-LAX"],
    name: "Los Angeles City Council",
    url: "https://lacity.gov/government/about-us/elected-officials/los-angeles-city-council",
    description:
      "Los Angeles' legislative body. Authoritative source for LA municipal ordinances and council motions affecting Port of LA operations, drayage, sustainability requirements, and warehousing zones.",
    intelligence_types: ["legislation"],
    collisionUrlSubstring: "lacity.gov/government/about-us/elected-officials",
  },

  // Chicago
  {
    label: "chi_cdph_env",
    iso: ["US-IL", "US-CHI"],
    name: "Chicago Department of Public Health — Environmental Health",
    url: "https://www.chicago.gov/city/en/depts/cdph/provdrs/environmental_health.html",
    description:
      "City of Chicago's environmental-health regulator within CDPH. Administers municipal air, water, and environmental-quality programs relevant to Chicago intermodal freight, distribution centers, and last-mile logistics.",
    intelligence_types: ["regulation", "guidance"],
    collisionUrlSubstring: "chicago.gov/city/en/depts/cdph",
  },
  {
    label: "chi_clerk",
    iso: ["US-IL", "US-CHI"],
    name: "Office of the City Clerk of Chicago",
    url: "https://chicityclerk.com/",
    description:
      "Chicago's official repository for City Council ordinances, resolutions, and the Municipal Code of Chicago. Authoritative for Chicago Climate Action Plan implementing ordinances and freight/warehousing-relevant municipal code changes.",
    intelligence_types: ["legislation"],
    collisionUrlSubstring: "chicityclerk.com",
  },

  // Houston
  {
    label: "hou_health_env",
    iso: ["US-TX", "US-HOU"],
    name: "City of Houston Health Department — Environmental Services",
    url: "https://www.houstontx.gov/health/environmental.html",
    description:
      "City of Houston's environmental-services bureau. Administers municipal air-quality, environmental-permitting, and pollution-control programs affecting Port of Houston/Gulf freight, petrochemical-corridor logistics, and warehousing.",
    intelligence_types: ["regulation", "guidance"],
    collisionUrlSubstring: "houstontx.gov/health/environmental",
  },
  {
    label: "hou_council",
    iso: ["US-TX", "US-HOU"],
    name: "Houston City Council",
    url: "https://houstontx.gov/council/",
    description:
      "Houston's legislative body. Authoritative source for City of Houston ordinances and council actions including Houston Climate Action Plan implementation and Gulf-port-related municipal regulation.",
    intelligence_types: ["legislation"],
    collisionUrlSubstring: "houstontx.gov/council",
  },

  // San Francisco
  {
    label: "sf_environment",
    iso: ["US-CA", "US-SF"],
    name: "San Francisco Department of the Environment (SF Environment)",
    url: "https://sfenvironment.org/",
    description:
      "San Francisco's principal environmental and sustainability agency. Administers SF climate action strategy, building energy programs, zero-waste rules, and sustainable transportation programs relevant to SF municipal freight and last-mile delivery.",
    intelligence_types: ["regulation", "guidance"],
    collisionUrlSubstring: "sfenvironment.org",
  },
  {
    label: "sf_bos",
    iso: ["US-CA", "US-SF"],
    name: "San Francisco Board of Supervisors",
    url: "https://sfbos.org/",
    description:
      "San Francisco's legislative body. Authoritative source for SF municipal ordinances, board resolutions, and the SF Municipal Code, including SF Environment Code provisions affecting freight, warehousing, and sustainable procurement.",
    intelligence_types: ["legislation"],
    collisionUrlSubstring: "sfbos.org",
  },

  // Boston
  {
    label: "bos_environment",
    iso: ["US-MA", "US-BOS"],
    name: "City of Boston — Environment Department",
    url: "https://www.boston.gov/departments/environment",
    description:
      "Boston's environmental and climate-resilience agency. Administers BERDO (Building Emissions Reduction & Disclosure Ordinance) and Boston Climate Action Plan, key for Northeast warehousing and Boston port-area logistics emissions reporting.",
    intelligence_types: ["regulation", "guidance"],
    collisionUrlSubstring: "boston.gov/departments/environment",
  },
  {
    label: "bos_council",
    iso: ["US-MA", "US-BOS"],
    name: "Boston City Council",
    url: "https://www.boston.gov/departments/city-council",
    description:
      "Boston's legislative body. Authoritative source for Boston municipal ordinances and council resolutions, including BERDO amendments and freight/warehousing-relevant local regulation.",
    intelligence_types: ["legislation"],
    collisionUrlSubstring: "boston.gov/departments/city-council",
  },

  // Seattle
  {
    label: "sea_environment",
    iso: ["US-WA", "US-SEA"],
    name: "City of Seattle — Environment & Sustainability",
    url: "https://www.seattle.gov/environment",
    description:
      "Seattle's environmental and climate program portal. Coordinates Seattle Climate Action Plan, Building Emissions Performance Standard, and Drive Clean Seattle EV programs relevant to West Coast port logistics and last-mile delivery.",
    intelligence_types: ["regulation", "guidance"],
    collisionUrlSubstring: "seattle.gov/environment",
  },
  {
    label: "sea_council",
    iso: ["US-WA", "US-SEA"],
    name: "Seattle City Council",
    url: "https://www.seattle.gov/council",
    description:
      "Seattle's legislative body. Authoritative source for Seattle municipal ordinances, council bills, and the Seattle Municipal Code, including freight and warehousing-relevant local regulation.",
    intelligence_types: ["legislation"],
    collisionUrlSubstring: "seattle.gov/council",
  },

  // Miami
  {
    label: "mia_resilience",
    iso: ["US-FL", "US-MIA"],
    name: "City of Miami — Office of Resilience & Sustainability",
    url: "https://www.miamigov.com/Government/Departments-Organizations/Resilience-Sustainability",
    description:
      "Miami's climate-resilience and sustainability office. Administers Miami Forever climate plan, sea-level-rise adaptation programs, and municipal sustainability rules relevant to PortMiami operations and South Florida freight.",
    intelligence_types: ["regulation", "guidance"],
    collisionUrlSubstring: "miamigov.com/Government/Departments-Organizations/Resilience-Sustainability",
  },
  {
    label: "mia_commission",
    iso: ["US-FL", "US-MIA"],
    name: "Miami City Commission",
    url: "https://www.miamigov.com/Government/City-Officials/City-Commission",
    description:
      "Miami's legislative body. Authoritative source for City of Miami ordinances and resolutions, including resilience-fee and climate-related municipal regulation affecting freight and warehousing.",
    intelligence_types: ["legislation"],
    collisionUrlSubstring: "miamigov.com/Government/City-Officials/City-Commission",
  },

  // Philadelphia
  {
    label: "phi_sustainability",
    iso: ["US-PA", "US-PHI"],
    name: "City of Philadelphia — Office of Sustainability",
    url: "https://www.phila.gov/departments/office-of-sustainability/",
    description:
      "Philadelphia's principal sustainability office. Administers Greenworks plan, Building Energy Performance Program, and citywide climate strategy relevant to Port of Philadelphia operations, Northeast distribution, and Pennsylvania freight corridors.",
    intelligence_types: ["regulation", "guidance"],
    collisionUrlSubstring: "phila.gov/departments/office-of-sustainability",
  },
  {
    label: "phi_council",
    iso: ["US-PA", "US-PHI"],
    name: "Philadelphia City Council",
    url: "https://phlcouncil.com/",
    description:
      "Philadelphia's legislative body. Authoritative source for Philadelphia municipal ordinances and council resolutions, including building energy performance and freight-relevant local regulation.",
    intelligence_types: ["legislation"],
    collisionUrlSubstring: "phlcouncil.com",
  },

  // Atlanta
  {
    label: "atl_sustainability",
    iso: ["US-GA", "US-ATL"],
    name: "City of Atlanta — Mayor's Office of Sustainability & Resilience",
    url: "https://www.atlantaga.gov/government/departments/sustainability",
    description:
      "Atlanta's principal sustainability office. Administers Atlanta Climate Action Plan, building energy efficiency ordinance, and citywide environmental policy relevant to Southeast intermodal freight, Atlanta-area distribution, and warehousing.",
    intelligence_types: ["regulation", "guidance"],
    collisionUrlSubstring: "atlantaga.gov/government/departments/sustainability",
  },
  {
    label: "atl_council",
    iso: ["US-GA", "US-ATL"],
    name: "Atlanta City Council",
    url: "https://citycouncil.atlantaga.gov/",
    description:
      "Atlanta's legislative body. Authoritative source for City of Atlanta ordinances and council resolutions, including the Commercial Buildings Energy Efficiency Ordinance and freight/warehousing-relevant local regulation.",
    intelligence_types: ["legislation"],
    collisionUrlSubstring: "citycouncil.atlantaga.gov",
  },
];

// ─── Step 0: pre-flight invariants ─────────────────────────────────────
{
  // LL97 must be at ['US-NY'] before retag
  const { data: ll97 } = await supabase
    .from("intelligence_items")
    .select("legacy_id, jurisdiction_iso")
    .eq("legacy_id", "nyc-local-law-97-building-carbon-emissions-caps")
    .maybeSingle();
  step(
    "preflight_ll97_state",
    Array.isArray(ll97?.jurisdiction_iso) &&
      ll97.jurisdiction_iso.length === 1 &&
      ll97.jurisdiction_iso[0] === "US-NY",
    `jurisdiction_iso=${JSON.stringify(ll97?.jurisdiction_iso)}`
  );

  const { data: r31 } = await supabase
    .from("intelligence_items")
    .select("legacy_id, jurisdiction_iso")
    .eq("legacy_id", "r31")
    .maybeSingle();
  step(
    "preflight_r31_state",
    Array.isArray(r31?.jurisdiction_iso) &&
      r31.jurisdiction_iso.length === 1 &&
      r31.jurisdiction_iso[0] === "US",
    `jurisdiction_iso=${JSON.stringify(r31?.jurisdiction_iso)}`
  );
}

// ─── Step 1: 20 source inserts ─────────────────────────────────────────
async function insertSource(ins) {
  // Collision check (substring on URL host) — should be 0 hits per pre-flight.
  {
    const { data: existing } = await supabase
      .from("sources")
      .select("id, name, url, tier")
      .ilike("url", `%${ins.collisionUrlSubstring}%`);
    if (existing && existing.length > 0) {
      step(
        `${ins.label}_collision_check`,
        false,
        `URL collision: ${JSON.stringify(existing)}`
      );
    } else {
      step(`${ins.label}_collision_check`, true, "no collision");
    }
  }

  const { data: inserted, error: e } = await supabase
    .from("sources")
    .insert({
      name: ins.name,
      url: ins.url,
      description: ins.description,
      tier: 1,
      tier_at_creation: 1,
      status: "active",
      admin_only: false,
      jurisdictions: [],
      jurisdiction_iso: ins.iso,
      intelligence_types: ins.intelligence_types,
      domains: [1],
      access_method: "scrape",
      update_frequency: "weekly",
      notes:
        "Tier 1 Wave C — US major cities. Inserted per Tier 1 region authorization. Multi-tagged with parent state ISO + custom city ISO (US-{CITY}).",
    })
    .select("id, tier, name")
    .maybeSingle();
  if (e || !inserted) {
    step(`${ins.label}_insert`, false, e?.message ?? "no row returned");
  }
  insertedIds.push({ label: ins.label, id: inserted.id, name: inserted.name });
  step(
    `${ins.label}_insert`,
    true,
    `id=${inserted.id} tier=${inserted.tier} name=${inserted.name}`
  );

  // Verify
  const { data: r } = await supabase
    .from("sources")
    .select("id, tier, jurisdiction_iso, status, admin_only, url")
    .eq("id", inserted.id)
    .maybeSingle();
  const ok =
    r &&
    r.tier === 1 &&
    r.status === "active" &&
    r.admin_only === false &&
    r.url === ins.url &&
    Array.isArray(r.jurisdiction_iso) &&
    ins.iso.every((j) => r.jurisdiction_iso.includes(j));
  step(
    `${ins.label}_verify`,
    ok,
    `tier=${r?.tier} status=${r?.status} jurisdiction_iso=${JSON.stringify(r?.jurisdiction_iso)} url=${r?.url}`
  );
}

for (const ins of INSERTS) {
  await insertSource(ins);
}

// Cap check — exactly 20 inserts expected
step(
  "insert_count_cap",
  insertedIds.length === 20,
  `inserted ${insertedIds.length} rows (expected 20)`
);

// ─── Step 2: NYC LL97 retag ['US-NY'] -> ['US-NY','US-NYC'] ────────────
{
  const { error: e } = await supabase
    .from("intelligence_items")
    .update({ jurisdiction_iso: ["US-NY", "US-NYC"] })
    .eq("legacy_id", "nyc-local-law-97-building-carbon-emissions-caps");
  step("ll97_retag_update", !e, e?.message ?? "set ['US-NY','US-NYC']");
}
{
  const { data: r } = await supabase
    .from("intelligence_items")
    .select("legacy_id, jurisdiction_iso")
    .eq("legacy_id", "nyc-local-law-97-building-carbon-emissions-caps")
    .maybeSingle();
  const ok =
    Array.isArray(r?.jurisdiction_iso) &&
    r.jurisdiction_iso.length === 2 &&
    r.jurisdiction_iso.includes("US-NY") &&
    r.jurisdiction_iso.includes("US-NYC");
  step(
    "ll97_retag_verify",
    ok,
    `jurisdiction_iso=${JSON.stringify(r?.jurisdiction_iso)}`
  );
  retagsApplied.push({
    legacy_id: "nyc-local-law-97-building-carbon-emissions-caps",
    from: ["US-NY"],
    to: r?.jurisdiction_iso,
  });
}

// ─── Step 3: r31 (Port of LA) retag ['US'] -> ['US-CA','US-LAX'] ───────
{
  const { error: e } = await supabase
    .from("intelligence_items")
    .update({ jurisdiction_iso: ["US-CA", "US-LAX"] })
    .eq("legacy_id", "r31");
  step("r31_retag_update", !e, e?.message ?? "set ['US-CA','US-LAX']");
}
{
  const { data: r } = await supabase
    .from("intelligence_items")
    .select("legacy_id, jurisdiction_iso")
    .eq("legacy_id", "r31")
    .maybeSingle();
  const ok =
    Array.isArray(r?.jurisdiction_iso) &&
    r.jurisdiction_iso.length === 2 &&
    r.jurisdiction_iso.includes("US-CA") &&
    r.jurisdiction_iso.includes("US-LAX");
  step(
    "r31_retag_verify",
    ok,
    `jurisdiction_iso=${JSON.stringify(r?.jurisdiction_iso)}`
  );
  retagsApplied.push({
    legacy_id: "r31",
    from: ["US"],
    to: r?.jurisdiction_iso,
  });
}

// ─── Final state snapshot per city ─────────────────────────────────────
const finalSnapshot = {};
const CITY_ISOS = [
  "US-NYC",
  "US-LAX",
  "US-CHI",
  "US-HOU",
  "US-SF",
  "US-BOS",
  "US-SEA",
  "US-MIA",
  "US-PHI",
  "US-ATL",
];
for (const iso of CITY_ISOS) {
  const { data: srcs } = await supabase
    .from("sources")
    .select("id, name, url, tier, status")
    .contains("jurisdiction_iso", [iso])
    .order("created_at", { ascending: true });
  const { data: items } = await supabase
    .from("intelligence_items")
    .select("legacy_id, title, jurisdiction_iso")
    .contains("jurisdiction_iso", [iso]);
  finalSnapshot[iso] = { sources: srcs, items };
}
console.log("\nFinal per-city snapshot:");
console.log(JSON.stringify(finalSnapshot, null, 2));

flushLog({ completed: true, finalSnapshot });
console.log(
  `\n[OK] Tier 1 US Cities writes complete. Log: docs/tier1-us-cities-execute-log.json`
);
