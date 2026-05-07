/**
 * Tier 1 Wave B — EU Western + Nordic investigation (read-only).
 *
 * Surveys existing source rows for the 10 target member states:
 *   DE, FR, NL, BE, LU, AT, DK, SE, FI, IE
 *
 * For each state, looks up canonical regulator + parliament URL
 * patterns to determine: existing rows, current tier, jurisdiction_iso,
 * status, admin_only. Surfaces any premise mismatches.
 *
 * Also probes retag candidates flagged by prior dispatch:
 *   - g7 (Germany BMDV)
 *   - r5 (Stockholm Environment Institute)
 *   - eu-core-markets-regional-operations-profile (multi-state, leave alone)
 *
 * Read-only. No writes.
 */

import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
process.chdir(resolve(__dirname, "..", ".."));
process.loadEnvFile(".env.local");

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// Per-state URL patterns to probe. Each entry: name + ilike pattern.
// Patterns chosen from official primary regulator + parliament hosts.
const STATE_PROBES = {
  DE: [
    { kind: "env", host: "umweltbundesamt.de", name_hint: "Umweltbundesamt" },
    { kind: "parl", host: "bundestag.de", name_hint: "Bundestag" },
  ],
  FR: [
    { kind: "env", host: "ecologie.gouv.fr", name_hint: "MITECO/Ministère Transition Écologique" },
    { kind: "env_alt", host: "ademe.fr", name_hint: "ADEME (alt)" },
    { kind: "parl_an", host: "assemblee-nationale.fr", name_hint: "Assemblée Nationale" },
    { kind: "parl_se", host: "senat.fr", name_hint: "Sénat" },
  ],
  NL: [
    { kind: "env", host: "rivm.nl", name_hint: "RIVM" },
    { kind: "parl", host: "tweedekamer.nl", name_hint: "Tweede Kamer" },
  ],
  BE: [
    { kind: "fed_env", host: "health.belgium.be", name_hint: "SPF Santé Publique (federal)" },
    { kind: "fed_env_alt", host: "klimaat.be", name_hint: "Klimaat (federal alt)" },
    { kind: "reg_bru", host: "environnement.brussels", name_hint: "Brussels Environment" },
    { kind: "reg_bru_alt", host: "leefmilieu.brussels", name_hint: "Brussels Environment (NL)" },
    { kind: "reg_vlg", host: "vmm.be", name_hint: "VMM (Flanders)" },
    { kind: "reg_wal", host: "awac.be", name_hint: "AwAC (Wallonia)" },
    { kind: "fed_parl", host: "lachambre.be", name_hint: "Belgian Chamber" },
    { kind: "fed_parl_alt", host: "dekamer.be", name_hint: "Belgian Chamber (NL)" },
  ],
  LU: [
    { kind: "env", host: "environnement.public.lu", name_hint: "MECDD" },
    { kind: "parl", host: "chd.lu", name_hint: "Chambre des Députés" },
  ],
  AT: [
    { kind: "env", host: "umweltbundesamt.at", name_hint: "Umweltbundesamt AT" },
    { kind: "parl", host: "parlament.gv.at", name_hint: "Nationalrat" },
  ],
  DK: [
    { kind: "env", host: "mim.dk", name_hint: "Miljøministeriet" },
    { kind: "env_alt", host: "mst.dk", name_hint: "Miljøstyrelsen (alt)" },
    { kind: "parl", host: "ft.dk", name_hint: "Folketinget" },
  ],
  SE: [
    { kind: "env", host: "naturvardsverket.se", name_hint: "Naturvårdsverket" },
    { kind: "parl", host: "riksdagen.se", name_hint: "Riksdag" },
  ],
  FI: [
    { kind: "env", host: "ym.fi", name_hint: "Ympäristöministeriö" },
    { kind: "parl", host: "eduskunta.fi", name_hint: "Eduskunta" },
  ],
  IE: [
    { kind: "env", host: "epa.ie", name_hint: "EPA Ireland" },
    { kind: "parl", host: "oireachtas.ie", name_hint: "Oireachtas" },
  ],
};

const RETAG_CANDIDATES = [
  { legacy_id: "g7", expected_iso: "DE", note: "Germany BMDV per dispatch" },
  { legacy_id: "r5", expected_iso: "SE", note: "Stockholm Environment Institute per dispatch" },
  {
    legacy_id: "eu-core-markets-regional-operations-profile",
    expected_iso: null,
    note: "Multi-state — leave at ['EU'], do NOT retag",
  },
];

const findings = {
  generated_at: new Date().toISOString(),
  by_state: {},
  retag_candidates: [],
  warnings: [],
};

console.log("EU Western + Nordic Tier 1 investigation");
console.log("=".repeat(70));

for (const [iso2, probes] of Object.entries(STATE_PROBES)) {
  const expected_iso = `${iso2}`;
  console.log(`\n[${iso2}]`);
  const stateFinding = {
    iso: expected_iso,
    probes: [],
    inserts_needed: 0,
    existing_count: 0,
  };
  for (const probe of probes) {
    const { data, error } = await supabase
      .from("sources")
      .select("id, name, url, tier, status, admin_only, jurisdiction_iso, intelligence_types, domains")
      .ilike("url", `%${probe.host}%`);
    if (error) {
      stateFinding.probes.push({ ...probe, error: error.message });
      console.log(`  [err] ${probe.host}: ${error.message}`);
      continue;
    }
    const rows = data || [];
    stateFinding.probes.push({
      ...probe,
      rows: rows.map((r) => ({
        id: r.id,
        name: r.name,
        url: r.url,
        tier: r.tier,
        status: r.status,
        admin_only: r.admin_only,
        jurisdiction_iso: r.jurisdiction_iso,
      })),
      count: rows.length,
    });
    if (rows.length === 0) {
      console.log(`  [missing] ${probe.kind}: ${probe.host} (${probe.name_hint})`);
    } else {
      stateFinding.existing_count += 1;
      for (const r of rows) {
        const isoArr = Array.isArray(r.jurisdiction_iso) ? r.jurisdiction_iso : [];
        const isoOk = isoArr.includes(expected_iso) || expected_iso === "BE"; // BE allows sub-national
        const tierOk = r.tier === 1;
        const adminOk = r.admin_only === false;
        const flag = !isoOk || !tierOk || !adminOk ? " [!]" : "";
        console.log(
          `  [exists${flag}] ${probe.kind}: id=${r.id} tier=${r.tier} status=${r.status} admin_only=${r.admin_only} iso=${JSON.stringify(isoArr)} url=${r.url}`
        );
        if (!isoOk)
          findings.warnings.push(`${iso2} ${probe.host}: jurisdiction_iso=${JSON.stringify(isoArr)} missing ${expected_iso}`);
        if (!tierOk)
          findings.warnings.push(`${iso2} ${probe.host}: tier=${r.tier}, expected 1`);
        if (!adminOk)
          findings.warnings.push(`${iso2} ${probe.host}: admin_only=${r.admin_only}, expected false`);
      }
    }
  }
  findings.by_state[iso2] = stateFinding;
}

// Retag candidates
console.log("\n[Retag candidate inspection]");
console.log("=".repeat(70));
for (const cand of RETAG_CANDIDATES) {
  const { data, error } = await supabase
    .from("intelligence_items")
    .select("id, legacy_id, title, jurisdiction_iso, jurisdictions, summary")
    .eq("legacy_id", cand.legacy_id)
    .maybeSingle();
  const result = { ...cand };
  if (error) {
    result.error = error.message;
    console.log(`  [err] ${cand.legacy_id}: ${error.message}`);
  } else if (!data) {
    result.found = false;
    console.log(`  [missing] ${cand.legacy_id}: not found`);
  } else {
    result.found = true;
    result.row = {
      id: data.id,
      title: data.title,
      jurisdiction_iso: data.jurisdiction_iso,
      jurisdictions: data.jurisdictions,
      summary: data.summary?.slice(0, 200),
    };
    console.log(
      `  [found] ${cand.legacy_id}: title="${data.title}" iso=${JSON.stringify(data.jurisdiction_iso)}`
    );
    if (data.summary) console.log(`           summary: ${data.summary.slice(0, 180)}`);
  }
  findings.retag_candidates.push(result);
}

const out = resolve("..", "docs", "tier1-eu-western-nordic-investigation.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(findings, null, 2), "utf8");
console.log(`\nLog written: ${out}`);
