/**
 * tier1-us-cities-precheck.mjs — pre-flight URL collision check
 * for all 20 planned city source inserts.
 */
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
process.chdir(resolve(__dirname, ".."));
process.loadEnvFile(".env.local");

const s = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const PLANNED = [
  // NYC
  ["US-NYC", "NYC Mayor's Office of Climate & Environmental Justice", "https://www.nyc.gov/site/sustainability/index.page", "nyc.gov/site/sustainability"],
  ["US-NYC", "New York City Council", "https://council.nyc.gov/", "council.nyc.gov"],
  // LA  (NOTE: dispatch said "US-LA" but US-LA is ISO 3166-2 for Louisiana
  // state. Final canonical code applied is `US-LAX`.)
  ["US-LAX", "City of Los Angeles Departments & Bureaus", "https://www.lacity.gov/government/departments-bureaus", "lacity.gov/government/departments-bureaus"],
  ["US-LAX", "Los Angeles City Council", "https://lacity.gov/government/about-us/elected-officials/los-angeles-city-council", "lacity.gov/government/about-us/elected-officials"],
  // Chicago
  ["US-CHI", "Chicago Department of Public Health — Environmental Health", "https://www.chicago.gov/city/en/depts/cdph/provdrs/environmental_health.html", "chicago.gov/city/en/depts/cdph"],
  ["US-CHI", "Office of the City Clerk of Chicago", "https://chicityclerk.com/", "chicityclerk.com"],
  // Houston
  ["US-HOU", "City of Houston Health Department — Environmental Services", "https://www.houstontx.gov/health/environmental.html", "houstontx.gov/health/environmental"],
  ["US-HOU", "Houston City Council", "https://houstontx.gov/council/", "houstontx.gov/council"],
  // SF
  ["US-SF", "San Francisco Department of the Environment (SF Environment)", "https://sfenvironment.org/", "sfenvironment.org"],
  ["US-SF", "San Francisco Board of Supervisors", "https://sfbos.org/", "sfbos.org"],
  // Boston
  ["US-BOS", "City of Boston Environment Department", "https://www.boston.gov/departments/environment", "boston.gov/departments/environment"],
  ["US-BOS", "Boston City Council", "https://www.boston.gov/departments/city-council", "boston.gov/departments/city-council"],
  // Seattle
  ["US-SEA", "City of Seattle — Environment", "https://www.seattle.gov/environment", "seattle.gov/environment"],
  ["US-SEA", "Seattle City Council", "https://www.seattle.gov/council", "seattle.gov/council"],
  // Miami
  ["US-MIA", "City of Miami Office of Resilience & Sustainability", "https://www.miamigov.com/Government/Departments-Organizations/Resilience-Sustainability", "miamigov.com/Government/Departments-Organizations/Resilience-Sustainability"],
  ["US-MIA", "Miami City Commission", "https://www.miamigov.com/Government/City-Officials/City-Commission", "miamigov.com/Government/City-Officials/City-Commission"],
  // Philly
  ["US-PHI", "City of Philadelphia Office of Sustainability", "https://www.phila.gov/departments/office-of-sustainability/", "phila.gov/departments/office-of-sustainability"],
  ["US-PHI", "Philadelphia City Council", "https://phlcouncil.com/", "phlcouncil.com"],
  // Atlanta
  ["US-ATL", "City of Atlanta Office of Sustainability", "https://www.atlantaga.gov/government/departments/sustainability", "atlantaga.gov/government/departments/sustainability"],
  ["US-ATL", "Atlanta City Council", "https://citycouncil.atlantaga.gov/", "citycouncil.atlantaga.gov"],
];

let collisions = 0;
for (const [iso, name, url, host] of PLANNED) {
  const { data } = await s
    .from("sources")
    .select("id, name, url, tier, status, admin_only")
    .ilike("url", `%${host}%`);
  const tag = data && data.length > 0 ? "COLLISION" : "ok";
  if (tag === "COLLISION") collisions++;
  console.log(`[${tag}] ${iso} ${name}\n        ${url}\n        host=${host}\n        hits=${JSON.stringify(data)}`);
}
console.log(`\nTOTAL planned: ${PLANNED.length}, collisions: ${collisions}`);
