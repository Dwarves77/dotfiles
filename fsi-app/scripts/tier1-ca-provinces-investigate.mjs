/**
 * tier1-ca-provinces-investigate.mjs — read-only preflight for Tier 1 Wave B
 * Canadian provinces + territories. Confirms greenfield assumption and
 * captures ECCC federal row state for preservation.
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
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const PROVINCES = [
  "CA-ON",
  "CA-QC",
  "CA-BC",
  "CA-AB",
  "CA-MB",
  "CA-SK",
  "CA-NS",
  "CA-NB",
  "CA-NL",
  "CA-PE",
  "CA-YT",
  "CA-NT",
  "CA-NU",
];

const URLS_TO_CHECK = [
  "https://www.ontario.ca/page/ministry-environment-conservation-parks",
  "https://www.ola.org/",
  "https://www.environnement.gouv.qc.ca/",
  "https://www.assnat.qc.ca/",
  "https://www2.gov.bc.ca/gov/content/environment",
  "https://www.leg.bc.ca/",
  "https://www.alberta.ca/environment-and-parks.aspx",
  "https://www.assembly.ab.ca/",
  "https://www.gov.mb.ca/sd/",
  "https://www.gov.mb.ca/legislature/",
  "https://www.saskatchewan.ca/government/government-structure/ministries/environment",
  "https://www.legassembly.sk.ca/",
  "https://novascotia.ca/nse/",
  "https://nslegislature.ca/",
  "https://www2.gnb.ca/content/gnb/en/departments/elg.html",
  "https://www2.gnb.ca/content/gnb/en/legislative.html",
  "https://www.gov.nl.ca/eccm/",
  "https://www.assembly.nl.ca/",
  "https://www.princeedwardisland.ca/en/topic/environment-energy-and-climate-action",
  "https://www.assembly.pe.ca/",
  "https://yukon.ca/en/environment-natural-resources",
  "https://yukonassembly.ca/",
  "https://www.gov.nt.ca/ecc/",
  "https://www.assembly.gov.nt.ca/",
  "https://www.gov.nu.ca/environment",
  "https://assembly.nu.ca/",
];

const out = { investigated_at: new Date().toISOString(), per_province: {}, url_collisions: [], eccc_state: null, all_ca_rows: [] };

// 1) Per-province sub-national row counts.
for (const iso of PROVINCES) {
  const { data, error } = await supabase
    .from("sources")
    .select("id, name, url, tier, status, admin_only, jurisdiction_iso")
    .contains("jurisdiction_iso", [iso]);
  if (error) {
    out.per_province[iso] = { error: error.message };
    continue;
  }
  out.per_province[iso] = { count: data.length, rows: data };
}

// 2) URL collision check — variants with/without trailing slash.
for (const u of URLS_TO_CHECK) {
  const variants = [u, u.replace(/\/$/, "")];
  const { data } = await supabase
    .from("sources")
    .select("id, name, url, tier, status, admin_only, jurisdiction_iso")
    .or(variants.map((v) => `url.eq.${v}`).join(","));
  if (data && data.length > 0) {
    out.url_collisions.push({ planned_url: u, hits: data });
  }
}

// 3) ECCC federal row state — preservation sanity.
{
  const { data } = await supabase
    .from("sources")
    .select("id, name, url, tier, status, admin_only, jurisdiction_iso")
    .or(
      [
        "url.ilike.%canada.ca/en/environment-climate-change%",
        "url.ilike.%ec.gc.ca%",
        "name.ilike.%Environment and Climate Change Canada%",
        "name.ilike.%ECCC%",
      ].join(",")
    );
  out.eccc_state = data ?? [];
}

// 4) Snapshot ALL rows that include any CA-* code in jurisdiction_iso (incl federal CA).
{
  const { data } = await supabase
    .from("sources")
    .select("id, name, url, tier, status, admin_only, jurisdiction_iso")
    .or(
      ["CA", ...PROVINCES]
        .map((c) => `jurisdiction_iso.cs.{${c}}`)
        .join(",")
    );
  out.all_ca_rows = data ?? [];
}

writeFileSync(
  resolve("..", "docs", "tier1-ca-provinces-investigate.json"),
  JSON.stringify(out, null, 2),
  "utf8"
);

console.log("=== Per-province existing row counts ===");
for (const iso of PROVINCES) {
  const v = out.per_province[iso];
  console.log(`${iso}: count=${v.count ?? "ERR"}`);
  if (v.rows && v.rows.length) {
    for (const r of v.rows) console.log(`   - id=${r.id} tier=${r.tier} ${r.name} :: ${r.url}`);
  }
}
console.log(`\n=== URL collisions: ${out.url_collisions.length} ===`);
for (const c of out.url_collisions) {
  console.log(`PLAN: ${c.planned_url}`);
  for (const h of c.hits) console.log(`  HIT: id=${h.id} tier=${h.tier} ${h.name} :: ${h.url} :: ${JSON.stringify(h.jurisdiction_iso)}`);
}
console.log(`\n=== ECCC federal row state (${out.eccc_state.length} match) ===`);
for (const r of out.eccc_state) {
  console.log(`  id=${r.id} tier=${r.tier} status=${r.status} admin_only=${r.admin_only} ${r.name} :: ${r.url} :: ${JSON.stringify(r.jurisdiction_iso)}`);
}
console.log(`\n=== Total CA-tagged rows (federal + sub-national): ${out.all_ca_rows.length} ===`);
console.log("\nWrote: docs/tier1-ca-provinces-investigate.json");
