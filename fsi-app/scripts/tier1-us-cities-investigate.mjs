/**
 * tier1-us-cities-investigate.mjs — read-only investigation for Tier 1 Wave C
 * (US major cities: NYC, LA, Chicago, Houston, SF, Boston, Seattle, Miami,
 * Philadelphia, Atlanta).
 *
 * For each city:
 *   1) Search intelligence_items for content matching city/regulator names
 *      to identify retag candidates currently broader than city level
 *   2) Search sources for existing city-specific rows
 *   3) Surface URL pre-collisions for canonical city URLs
 */
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { writeFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
process.chdir(resolve(__dirname, ".."));
process.loadEnvFile(".env.local");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

// City profiles: search terms (case-insensitive) for content + canonical URLs
const CITIES = [
  {
    iso: "US-NYC",
    state_iso: "US-NY",
    label: "New York City",
    contentTerms: ["nyc", "new york city", "ll97", "local law 97", "nyc dob", "nyc mayor"],
    titleTerms: ["nyc", "new york city", "local law 97"],
    cityUrls: ["nyc.gov/site/sustainability", "council.nyc.gov", "nyc.gov/dob", "nyc.gov/dep", "climate.cityofnewyork"],
    plannedSources: [
      { url: "https://www.nyc.gov/site/sustainability/index.page", host: "nyc.gov/site/sustainability" },
      { url: "https://council.nyc.gov/", host: "council.nyc.gov" },
    ],
  },
  {
    // NOTE: dispatch suggested "US-LA" for Los Angeles, but US-LA is the
    // official ISO 3166-2 code for Louisiana state. Final canonical code
    // applied in tier1-us-cities-execute.mjs is `US-LAX` (airport code).
    iso: "US-LAX",
    state_iso: "US-CA",
    label: "Los Angeles",
    contentTerms: ["los angeles", "la city", "lacity", "ladwp", "port of los angeles", "polb", "long beach", "drayage", "la sustainability"],
    titleTerms: ["los angeles", "la city", "ladwp"],
    cityUrls: ["lacity.gov", "ladwp.com", "portoflosangeles.org"],
    plannedSources: [
      { url: "https://www.lacity.gov/government/departments-bureaus", host: "lacity.gov/government" },
      { url: "https://lacity.gov/government/about-us/elected-officials/los-angeles-city-council", host: "lacity.gov/government/about-us/elected-officials" },
    ],
  },
  {
    iso: "US-CHI",
    state_iso: "US-IL",
    label: "Chicago",
    contentTerms: ["chicago", "city of chicago", "chicago climate action", "chicago department of public health"],
    titleTerms: ["chicago"],
    cityUrls: ["chicago.gov", "chicityclerk.com"],
    plannedSources: [
      { url: "https://www.chicago.gov/city/en/depts/cdph/provdrs/environmental_health.html", host: "chicago.gov/city/en/depts/cdph" },
      { url: "https://chicityclerk.com/", host: "chicityclerk.com" },
    ],
  },
  {
    iso: "US-HOU",
    state_iso: "US-TX",
    label: "Houston",
    contentTerms: ["houston", "city of houston", "port of houston", "porthouston"],
    titleTerms: ["houston"],
    cityUrls: ["houstontx.gov", "porthouston.com"],
    plannedSources: [
      { url: "https://www.houstontx.gov/health/environmental.html", host: "houstontx.gov/health/environmental" },
      { url: "https://houstontx.gov/council/", host: "houstontx.gov/council" },
    ],
  },
  {
    iso: "US-SF",
    state_iso: "US-CA",
    label: "San Francisco",
    contentTerms: ["san francisco", "sf environment", "sfenvironment", "sf board of supervisors", "sfbos"],
    titleTerms: ["san francisco"],
    cityUrls: ["sfenvironment.org", "sfbos.org", "sfgov.org"],
    plannedSources: [
      { url: "https://sfenvironment.org/", host: "sfenvironment.org" },
      { url: "https://sfbos.org/", host: "sfbos.org" },
    ],
  },
  {
    iso: "US-BOS",
    state_iso: "US-MA",
    label: "Boston",
    contentTerms: ["city of boston", "boston department", "boston city council", "berdo", "boston building"],
    titleTerms: ["boston"],
    cityUrls: ["boston.gov"],
    plannedSources: [
      { url: "https://www.boston.gov/departments/environment", host: "boston.gov/departments/environment" },
      { url: "https://www.boston.gov/departments/city-council", host: "boston.gov/departments/city-council" },
    ],
  },
  {
    iso: "US-SEA",
    state_iso: "US-WA",
    label: "Seattle",
    contentTerms: ["city of seattle", "seattle.gov", "seattle department", "seattle city council", "port of seattle"],
    titleTerms: ["seattle"],
    cityUrls: ["seattle.gov"],
    plannedSources: [
      { url: "https://www.seattle.gov/environment", host: "seattle.gov/environment" },
      { url: "https://www.seattle.gov/council", host: "seattle.gov/council" },
    ],
  },
  {
    iso: "US-MIA",
    state_iso: "US-FL",
    label: "Miami",
    contentTerms: ["city of miami", "miamigov", "miami resilience", "portmiami", "port of miami"],
    titleTerms: ["miami"],
    cityUrls: ["miamigov.com", "miamidade.gov"],
    plannedSources: [
      { url: "https://www.miamigov.com/Government/Departments-Organizations/Resilience-Sustainability", host: "miamigov.com/Government/Departments-Organizations/Resilience-Sustainability" },
      { url: "https://www.miamigov.com/Government/City-Officials/City-Commission", host: "miamigov.com/Government/City-Officials/City-Commission" },
    ],
  },
  {
    iso: "US-PHI",
    state_iso: "US-PA",
    label: "Philadelphia",
    contentTerms: ["philadelphia", "phila.gov", "phlcouncil", "philly", "port of philadelphia"],
    titleTerms: ["philadelphia"],
    cityUrls: ["phila.gov", "phlcouncil.com"],
    plannedSources: [
      { url: "https://www.phila.gov/departments/office-of-sustainability/", host: "phila.gov/departments/office-of-sustainability" },
      { url: "https://phlcouncil.com/", host: "phlcouncil.com" },
    ],
  },
  {
    iso: "US-ATL",
    state_iso: "US-GA",
    label: "Atlanta",
    contentTerms: ["atlanta", "atlantaga.gov", "city of atlanta", "atlanta city council"],
    titleTerms: ["atlanta"],
    cityUrls: ["atlantaga.gov", "citycouncil.atlantaga.gov"],
    plannedSources: [
      { url: "https://www.atlantaga.gov/government/departments/sustainability", host: "atlantaga.gov/government/departments/sustainability" },
      { url: "https://citycouncil.atlantaga.gov/", host: "citycouncil.atlantaga.gov" },
    ],
  },
];

const report = {};

for (const c of CITIES) {
  console.log(`\n=== ${c.label} (${c.iso}) ===`);
  const cityReport = {
    label: c.label,
    iso: c.iso,
    state_iso: c.state_iso,
    matchingItems: [],
    existingSources: [],
    plannedSourceCollisions: [],
  };

  // 1. Find intelligence_items potentially relevant to this city
  // Search title, note, what_is_it, why_matters for any city term
  const orParts = [];
  for (const t of c.titleTerms) {
    const safe = t.replace(/,/g, "");
    orParts.push(`title.ilike.%${safe}%`);
    orParts.push(`summary.ilike.%${safe}%`);
    orParts.push(`what_is_it.ilike.%${safe}%`);
  }
  const { data: items, error: e1 } = await supabase
    .from("intelligence_items")
    .select("id, legacy_id, title, jurisdiction_iso, source_id, priority")
    .or(orParts.join(","));
  if (e1) {
    console.error(`  items search error: ${e1.message}`);
  } else {
    cityReport.matchingItems = items || [];
    console.log(`  matching items: ${items?.length ?? 0}`);
    for (const it of items || []) {
      console.log(
        `    ${it.legacy_id || it.id} — jurisdiction=${JSON.stringify(it.jurisdiction_iso)} title="${(it.title || "").slice(0, 80)}"`
      );
    }
  }

  // 2. Existing sources tagged for this city's ISO (city or state)
  const { data: bySrcIso } = await supabase
    .from("sources")
    .select("id, name, url, tier, status, admin_only, jurisdiction_iso")
    .or(`jurisdiction_iso.cs.{${c.iso}},jurisdiction_iso.cs.{${c.state_iso}}`);
  const cityScoped = (bySrcIso || []).filter((s) =>
    c.cityUrls.some((u) => (s.url || "").toLowerCase().includes(u.toLowerCase()))
  );
  cityReport.existingSources = cityScoped;
  console.log(`  existing city-URL-scoped sources: ${cityScoped.length}`);
  for (const s of cityScoped) {
    console.log(
      `    ${s.id} — tier=${s.tier} status=${s.status} admin_only=${s.admin_only} url=${s.url}`
    );
  }

  // 3. Pre-collision check on planned URLs (substring match)
  for (const planned of c.plannedSources) {
    const { data: hit } = await supabase
      .from("sources")
      .select("id, name, url, tier, status")
      .ilike("url", `%${planned.host}%`);
    if (hit && hit.length > 0) {
      cityReport.plannedSourceCollisions.push({ planned: planned.url, hits: hit });
      console.log(`  COLLISION on planned ${planned.url}: ${JSON.stringify(hit)}`);
    }
  }

  report[c.iso] = cityReport;
}

// LL97 specific check
const { data: ll97 } = await supabase
  .from("intelligence_items")
  .select("id, legacy_id, title, jurisdiction_iso")
  .eq("legacy_id", "nyc-local-law-97-building-carbon-emissions-caps")
  .maybeSingle();
report._ll97 = ll97;
console.log("\nLL97:", JSON.stringify(ll97, null, 2));

writeFileSync(
  resolve("..", "docs", "tier1-us-cities-investigate.json"),
  JSON.stringify(report, null, 2),
  "utf8"
);
console.log("\nReport: docs/tier1-us-cities-investigate.json");
