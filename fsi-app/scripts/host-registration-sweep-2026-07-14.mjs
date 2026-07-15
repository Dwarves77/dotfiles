/** HOST-REGISTRATION SWEEP ($0, operator RULING 2026-07-14). Registers the census's ruled hosts at their
 *  deterministic/ruled tiers so a FACT span sitting in them resolves to a real institutional tier instead of
 *  null. 17 deterministic PRIMARIES (law.cornell.edu + korea.net PULLED per ruling) + 12 ruled-ambiguous.
 *  registration-does-not-unlock: a registered tier NEVER confers reg-fact eligibility — only attribution to a
 *  floor-qualifying source that CONTAINS the span unlocks (SC-11/SC-14 / moat). This sweep records honest tiers;
 *  Step 2 (floor-first re-attribution) is what re-stamps spans to the primaries.
 *  Guarded + idempotent (skips a host already registered active). Usage: node scripts/host-registration-sweep-2026-07-14.mjs [--apply]
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { guardedInsertMany } from "./lib/db.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const APPLY = process.argv.includes("--apply");
const cite = { skill: "source-credibility-model", reason: "host-registration sweep 2026-07-14 (census null-tier primaries + ruled-ambiguous, deterministic tiers)" };
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// host | base_tier | name | class. Ruled by operator 2026-07-14.
const HOSTS = [
  // — 17 deterministic PRIMARIES (official law / gazette / regulator) —
  ["in.gov.br", 1, "Imprensa Nacional (Brazil — Diário Oficial da União)", "primary"],
  ["mainelegislature.org", 1, "Maine State Legislature", "primary"],
  ["fsc.go.kr", 2, "Korea Financial Services Commission", "primary"],
  ["ato.gov.au", 2, "Australian Taxation Office", "primary"],
  ["fws.gov", 2, "US Fish and Wildlife Service", "primary"],
  ["irs.gov", 2, "US Internal Revenue Service", "primary"],
  ["cer-rec.gc.ca", 2, "Canada Energy Regulator", "primary"],
  ["darrp.noaa.gov", 2, "NOAA Damage Assessment, Remediation and Restoration Program", "primary"],
  ["consult.defra.gov.uk", 2, "UK DEFRA — public consultations", "primary"],
  ["pollution-waste.canada.ca", 2, "Environment and Climate Change Canada (pollution & waste)", "primary"],
  ["international.canada.ca", 2, "Government of Canada (international)", "primary"],
  ["manitoba.ca", 2, "Government of Manitoba", "primary"],
  ["doa.nc.gov", 2, "North Carolina Department of Administration", "primary"],
  ["prsregister.beis.gov.uk", 2, "UK BEIS — PRS Exemptions Register", "primary"],
  ["catalog.data.gov", 2, "US Government open-data catalog (data.gov)", "primary"],
  ["whc.unesco.org", 3, "UNESCO World Heritage Centre", "primary"],
  ["unep.org", 3, "UN Environment Programme", "primary"],
  // — 12 ruled-ambiguous —
  ["decarbonization.unido.org", 3, "UNIDO — Industrial Decarbonization", "igo"],
  ["ers.usda.gov", 3, "USDA Economic Research Service (analysis arm)", "govt-analysis"],
  ["now-gmbh.de", 3, "NOW GmbH (German federally-owned mobility/hydrogen agency)", "govt-agency"],
  ["international-climate-initiative.com", 3, "International Climate Initiative (IKI) — govt-funded programme", "govt-programme"],
  ["biofin.org", 3, "UNDP BIOFIN", "igo"],
  ["hydrogencouncil.com", 4, "Hydrogen Council (industry body)", "industry-body"],
  ["ieta.org", 4, "International Emissions Trading Association", "industry-body"],
  ["goldstandard.org", 4, "Gold Standard (carbon-standard body — SC-14: certifies only its OWN standard)", "standards-body"],
  ["data-basis.org", 4, "data-basis (standards body — SC-14: certifies only its OWN standard)", "standards-body"],
  ["bsr.org", 6, "BSR (sustainability advocacy nonprofit — analysis-class)", "advocacy"],
  ["c2es.org", 6, "Center for Climate and Energy Solutions (think-tank)", "think-tank"],
  ["climatecatalyst.org", 6, "Climate Catalyst (advocacy)", "advocacy"],
];

async function main() {
  console.log(`\n=== HOST-REGISTRATION SWEEP (${APPLY ? "APPLY" : "DRY-RUN"}) — ${HOSTS.length} ruled hosts ===`);
  // idempotency: which are already registered?
  const rows = [];
  const skipped = [];
  for (const [host, tier, name, cls] of HOSTS) {
    const { data: ex } = await sb.from("sources").select("id").ilike("url", `%${host}%`).eq("status", "active").limit(1);
    if (ex && ex.length) { skipped.push(host); continue; }
    rows.push({
      name, url: `https://${host}`, base_tier: tier, tier_at_creation: tier,
      intelligence_types: [], status: "active",
      notes: `host-registration sweep 2026-07-14 (census null-tier ${cls}); registration-does-not-unlock: tier is honest provenance, not reg-fact eligibility (SC-11/SC-14/moat).`,
    });
  }
  console.log(`to register: ${rows.length}${skipped.length ? ` | already-registered (skip): ${skipped.join(", ")}` : ""}`);
  for (const r of rows) console.log(`  T${r.base_tier}  ${r.url}`);
  if (!APPLY) { console.log("\ndry-run — re-run --apply to register."); return; }
  if (rows.length) {
    const res = await guardedInsertMany("sources", rows, { cite });
    console.log(`\nregistered ${res.inserted?.length ?? rows.length} sources (snapshot ${res.snapshot}).`);
    // read-back
    for (const [host, tier] of HOSTS) {
      const { data } = await sb.from("sources").select("base_tier").ilike("url", `%${host}%`).eq("status", "active").limit(1);
      const got = data?.[0]?.base_tier;
      if (got !== tier && !skipped.includes(host)) console.log(`  ⚠ ${host}: expected T${tier}, read T${got}`);
    }
    console.log("read-back verified (mismatches flagged above, none = clean).");
  }
  console.log("\n=== done ===");
}
main().catch((e) => { console.error(e); process.exit(1); });
