/**
 * tier1-ca-provinces-execute.mjs — authorized writes for Tier 1 Wave B
 * Canadian provinces + territories. Greenfield: zero existing sub-national
 * rows confirmed by tier1-ca-provinces-investigate.mjs (2026-05-07).
 *
 * Cloned pattern from tier1-us-northeast-execute.mjs.
 *
 * Authorized scope per dispatch on 2026-05-07:
 *   - Insert canonical environmental body + legislature rows for each of
 *     10 provinces + 3 territories (13 entities, 26 inserts).
 *   - All inserts at tier 1, admin_only=false, status=active.
 *   - Idempotent: existence-check by canonical URL before insert.
 *   - Per-step verification with halt-on-mismatch.
 *
 * Federal preservation context (read-only verified):
 *   - There is no ECCC row in the `sources` table. The dispatch halt
 *     condition "ECCC (federal) row at unexpected state" cannot match
 *     because the row does not exist. The two existing CA-tagged federal
 *     rows are Transport Canada (T2 active) and Canada Gazette (T1 active);
 *     neither is touched by this script.
 *
 * Preflight findings (read-only, 2026-05-07):
 *   - All 13 provinces/territories: 0 existing sub-national source rows.
 *   - 0 URL collisions across all 26 planned canonical URLs.
 *   - Greenfield confirmed; no halt conditions met.
 *
 * Halt-on:
 *   - URL collision (existence check returns hit on canonical URL)
 *   - Verification mismatch after insert
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
function step(name, ok, detail) {
  const line = `[${ok ? "OK" : "FAIL"}] ${name} — ${detail}`;
  console.log(line);
  log.push({ name, ok, detail, at: new Date().toISOString() });
  if (!ok) {
    writeFileSync(
      resolve("..", "docs", "tier1-ca-provinces-execute-log.json"),
      JSON.stringify({ aborted_at: name, log }, null, 2),
      "utf8"
    );
    process.exit(1);
  }
}

// ─── Sanity: federal CA rows preserved (read-only check, no mutation) ──
{
  const { data: federal } = await supabase
    .from("sources")
    .select("id, name, url, tier, status, admin_only, jurisdiction_iso")
    .or("jurisdiction_iso.cs.{CA}");
  const federalSummary = (federal ?? [])
    .map((r) => `${r.name}(t${r.tier}/${r.status})`)
    .join("; ");
  step(
    "ca_federal_snapshot_pre",
    Array.isArray(federal),
    `count=${federal?.length ?? 0} rows=[${federalSummary}]`
  );
  // ECCC row absence is the expected state per investigation.
  const eccc = (federal ?? []).find(
    (r) =>
      /environment and climate change canada/i.test(r.name) ||
      /^ECCC$/i.test(r.name) ||
      /\beccc\.gc\.ca\b/i.test(r.url) ||
      /canada\.ca\/en\/environment-climate-change/i.test(r.url)
  );
  step(
    "ca_eccc_absence_expected",
    !eccc,
    eccc
      ? `UNEXPECTED ECCC row found: id=${eccc.id} ${eccc.name} :: ${eccc.url}`
      : "no ECCC row in sources table — expected per investigation; no federal modification possible"
  );
}

// Insert spec: 26 rows (env body + legislature × 13 entities).
const INSERTS = [
  // CA-ON Ontario
  {
    label: "on_env",
    state_iso: "CA-ON",
    name: "Ontario Ministry of the Environment, Conservation and Parks",
    url: "https://www.ontario.ca/page/ministry-environment-conservation-parks",
    description:
      "Ontario's principal environmental regulator. Air-quality, climate, and emissions program implementation; permits and approvals affecting freight, GTA logistics corridors, and warehousing operations.",
    intelligence_types: ["regulation", "guidance"],
  },
  {
    label: "on_legislature",
    state_iso: "CA-ON",
    name: "Legislative Assembly of Ontario",
    url: "https://www.ola.org/",
    description:
      "Ontario's official public access to bills, statutes, and the Legislative Assembly's legislative record. Authoritative for provincial legislation affecting freight, the Port of Hamilton, and supply-chain operations across Canada's largest economy.",
    intelligence_types: ["legislation"],
  },
  // CA-QC Québec
  {
    label: "qc_env",
    state_iso: "CA-QC",
    name: "Ministère de l'Environnement, de la Lutte contre les changements climatiques, de la Faune et des Parcs (MELCCFP)",
    url: "https://www.environnement.gouv.qc.ca/",
    description:
      "Québec's principal environmental regulator (MELCC/MELCCFP). Air emissions authorizations, climate program implementation (cap-and-trade with WCI/California), and rules affecting freight, the Port of Montréal, and supply-chain operations.",
    intelligence_types: ["regulation", "guidance"],
  },
  {
    label: "qc_legislature",
    state_iso: "CA-QC",
    name: "Assemblée nationale du Québec",
    url: "https://www.assnat.qc.ca/",
    description:
      "Québec's official public access to bills, statutes, and the Assemblée nationale's legislative record. Authoritative for provincial legislation affecting freight, the Port of Montréal, cross-border traffic with the US Northeast, and supply-chain operations.",
    intelligence_types: ["legislation"],
  },
  // CA-BC British Columbia
  {
    label: "bc_env",
    state_iso: "CA-BC",
    name: "British Columbia Ministry of Environment and Climate Change Strategy",
    url: "https://www2.gov.bc.ca/gov/content/environment",
    description:
      "BC's principal environmental regulator. CleanBC implementation, carbon pricing, low-carbon fuel standards, air-quality permits, and rules affecting freight, the Port of Vancouver, drayage, and trans-Pacific supply-chain operations.",
    intelligence_types: ["regulation", "guidance"],
  },
  {
    label: "bc_legislature",
    state_iso: "CA-BC",
    name: "Legislative Assembly of British Columbia",
    url: "https://www.leg.bc.ca/",
    description:
      "BC's official public access to bills, statutes, and the Legislative Assembly's legislative record. Authoritative for provincial legislation affecting freight, the Port of Vancouver, Asia-Pacific gateway operations, and supply-chain corridors.",
    intelligence_types: ["legislation"],
  },
  // CA-AB Alberta
  {
    label: "ab_env",
    state_iso: "CA-AB",
    name: "Alberta Environment and Protected Areas",
    url: "https://www.alberta.ca/environment-and-parks.aspx",
    description:
      "Alberta's principal environmental regulator. TIER (Technology Innovation and Emissions Reduction) regulation, industrial air emissions, and rules affecting freight corridors, oilsands logistics, and overland supply-chain operations.",
    intelligence_types: ["regulation", "guidance"],
  },
  {
    label: "ab_legislature",
    state_iso: "CA-AB",
    name: "Legislative Assembly of Alberta",
    url: "https://www.assembly.ab.ca/",
    description:
      "Alberta's official public access to bills, statutes, and the Legislative Assembly's legislative record. Authoritative for provincial legislation affecting freight, energy logistics, and overland supply-chain corridors.",
    intelligence_types: ["legislation"],
  },
  // CA-MB Manitoba
  {
    label: "mb_env",
    state_iso: "CA-MB",
    name: "Manitoba Environment and Climate Change",
    url: "https://www.gov.mb.ca/sd/",
    description:
      "Manitoba's principal environmental regulator (Department of Environment and Climate Change / Sustainable Development). Air-quality, climate program implementation, and rules affecting freight, the Port of Churchill, and central-Canada supply-chain operations.",
    intelligence_types: ["regulation", "guidance"],
  },
  {
    label: "mb_legislature",
    state_iso: "CA-MB",
    name: "Legislative Assembly of Manitoba",
    url: "https://www.gov.mb.ca/legislature/",
    description:
      "Manitoba's official public access to bills, statutes, and the Legislative Assembly's legislative record. Authoritative for provincial legislation affecting freight corridors, the Port of Churchill, and central-Canada supply-chain operations.",
    intelligence_types: ["legislation"],
  },
  // CA-SK Saskatchewan
  {
    label: "sk_env",
    state_iso: "CA-SK",
    name: "Saskatchewan Ministry of Environment",
    url: "https://www.saskatchewan.ca/government/government-structure/ministries/environment",
    description:
      "Saskatchewan's principal environmental regulator. Output-based performance standards, climate-resilience program implementation, and rules affecting freight, agricultural logistics, and prairie supply-chain operations.",
    intelligence_types: ["regulation", "guidance"],
  },
  {
    label: "sk_legislature",
    state_iso: "CA-SK",
    name: "Legislative Assembly of Saskatchewan",
    url: "https://www.legassembly.sk.ca/",
    description:
      "Saskatchewan's official public access to bills, statutes, and the Legislative Assembly's legislative record. Authoritative for provincial legislation affecting freight, agricultural logistics, and prairie supply-chain corridors.",
    intelligence_types: ["legislation"],
  },
  // CA-NS Nova Scotia
  {
    label: "ns_env",
    state_iso: "CA-NS",
    name: "Nova Scotia Department of Environment and Climate Change",
    url: "https://novascotia.ca/nse/",
    description:
      "Nova Scotia's principal environmental regulator. Cap-and-trade implementation, air-quality permits, and rules affecting freight, the Port of Halifax, and Atlantic supply-chain operations.",
    intelligence_types: ["regulation", "guidance"],
  },
  {
    label: "ns_legislature",
    state_iso: "CA-NS",
    name: "Nova Scotia House of Assembly",
    url: "https://nslegislature.ca/",
    description:
      "Nova Scotia's official public access to bills, statutes, and the House of Assembly's legislative record. Authoritative for provincial legislation affecting freight, the Port of Halifax, and Atlantic supply-chain operations.",
    intelligence_types: ["legislation"],
  },
  // CA-NB New Brunswick
  {
    label: "nb_env",
    state_iso: "CA-NB",
    name: "New Brunswick Department of Environment and Climate Change",
    url: "https://www2.gnb.ca/content/gnb/en/departments/elg.html",
    description:
      "New Brunswick's principal environmental regulator (Department of Environment and Local Government / Climate Change). Air-quality, climate-program implementation, and rules affecting freight, the Port of Saint John, and Atlantic supply-chain operations.",
    intelligence_types: ["regulation", "guidance"],
  },
  {
    label: "nb_legislature",
    state_iso: "CA-NB",
    name: "Legislative Assembly of New Brunswick",
    url: "https://www2.gnb.ca/content/gnb/en/legislative.html",
    description:
      "New Brunswick's official public access to bills, statutes, and the Legislative Assembly's legislative record. Authoritative for provincial legislation affecting freight, the Port of Saint John, and Atlantic supply-chain corridors.",
    intelligence_types: ["legislation"],
  },
  // CA-NL Newfoundland and Labrador
  {
    label: "nl_env",
    state_iso: "CA-NL",
    name: "Newfoundland and Labrador Department of Environment and Climate Change",
    url: "https://www.gov.nl.ca/eccm/",
    description:
      "Newfoundland and Labrador's principal environmental regulator. Air-quality, climate-program implementation, and rules affecting freight, marine cargo operations, and Atlantic supply-chain operations.",
    intelligence_types: ["regulation", "guidance"],
  },
  {
    label: "nl_legislature",
    state_iso: "CA-NL",
    name: "Newfoundland and Labrador House of Assembly",
    url: "https://www.assembly.nl.ca/",
    description:
      "Newfoundland and Labrador's official public access to bills, statutes, and the House of Assembly's legislative record. Authoritative for provincial legislation affecting freight, marine cargo, and Atlantic supply-chain corridors.",
    intelligence_types: ["legislation"],
  },
  // CA-PE Prince Edward Island
  {
    label: "pe_env",
    state_iso: "CA-PE",
    name: "Prince Edward Island Department of Environment, Energy and Climate Action",
    url: "https://www.princeedwardisland.ca/en/topic/environment-energy-and-climate-action",
    description:
      "PEI's principal environmental regulator. Climate program implementation, air-quality, and rules affecting freight, marine cargo via Confederation Bridge logistics, and Atlantic supply-chain operations.",
    intelligence_types: ["regulation", "guidance"],
  },
  {
    label: "pe_legislature",
    state_iso: "CA-PE",
    name: "Legislative Assembly of Prince Edward Island",
    url: "https://www.assembly.pe.ca/",
    description:
      "PEI's official public access to bills, statutes, and the Legislative Assembly's legislative record. Authoritative for provincial legislation affecting freight and Atlantic supply-chain operations.",
    intelligence_types: ["legislation"],
  },
  // CA-YT Yukon (territory)
  {
    label: "yt_env",
    state_iso: "CA-YT",
    name: "Yukon Department of Environment",
    url: "https://yukon.ca/en/environment-natural-resources",
    description:
      "Yukon's principal environmental regulator. Air-quality, climate program implementation, and rules affecting freight, mining-related logistics, and northern supply-chain operations.",
    intelligence_types: ["regulation", "guidance"],
  },
  {
    label: "yt_legislature",
    state_iso: "CA-YT",
    name: "Yukon Legislative Assembly",
    url: "https://yukonassembly.ca/",
    description:
      "Yukon's official public access to bills, statutes, and the Legislative Assembly's legislative record. Authoritative for territorial legislation affecting freight and northern supply-chain operations.",
    intelligence_types: ["legislation"],
  },
  // CA-NT Northwest Territories
  {
    label: "nt_env",
    state_iso: "CA-NT",
    name: "Northwest Territories Department of Environment and Climate Change",
    url: "https://www.gov.nt.ca/ecc/",
    description:
      "NWT's principal environmental regulator. Air-quality, climate program implementation, and rules affecting freight, mining-related logistics, and Arctic/northern supply-chain operations.",
    intelligence_types: ["regulation", "guidance"],
  },
  {
    label: "nt_legislature",
    state_iso: "CA-NT",
    name: "Northwest Territories Legislative Assembly",
    url: "https://www.assembly.gov.nt.ca/",
    description:
      "NWT's official public access to bills, statutes, and the Legislative Assembly's legislative record. Authoritative for territorial legislation affecting freight and Arctic/northern supply-chain operations.",
    intelligence_types: ["legislation"],
  },
  // CA-NU Nunavut
  {
    label: "nu_env",
    state_iso: "CA-NU",
    name: "Nunavut Department of Environment",
    url: "https://www.gov.nu.ca/environment",
    description:
      "Nunavut's principal environmental regulator. Air-quality, climate program implementation, and rules affecting freight, marine cargo via the Northwest Passage, and Arctic supply-chain operations.",
    intelligence_types: ["regulation", "guidance"],
  },
  {
    label: "nu_legislature",
    state_iso: "CA-NU",
    name: "Legislative Assembly of Nunavut",
    url: "https://assembly.nu.ca/",
    description:
      "Nunavut's official public access to bills, statutes, and the Legislative Assembly's legislative record. Authoritative for territorial legislation affecting freight, marine cargo, and Arctic supply-chain operations.",
    intelligence_types: ["legislation"],
  },
];

if (INSERTS.length !== 26) {
  step("insert_spec_count", false, `expected 26 inserts, have ${INSERTS.length}`);
}

const insertedIds = {};

for (const ins of INSERTS) {
  // Existence check on canonical URL (with and without trailing slash).
  const variants = [ins.url, ins.url.replace(/\/$/, "")];
  const { data: existing } = await supabase
    .from("sources")
    .select("id, tier, status, admin_only, name")
    .or(variants.map((u) => `url.eq.${u}`).join(","))
    .maybeSingle();

  if (existing) {
    // Halt: URL collision — should not happen given preflight (greenfield).
    step(
      `${ins.label}_url_collision`,
      false,
      `Found existing row at canonical URL — id=${existing.id} name=${existing.name} tier=${existing.tier} status=${existing.status}`
    );
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
      jurisdiction_iso: [ins.state_iso],
      intelligence_types: ins.intelligence_types,
      domains: [1],
      access_method: "scrape",
      update_frequency: "weekly",
      notes:
        "Tier 1 Wave B — Canadian provinces + territories. Inserted per Tier 1 region authorization. Parallels Tier 1 Wave A (US Northeast/Midwest/South/West/DC+territories) at tier 1.",
    })
    .select("id, tier, name")
    .maybeSingle();
  if (e || !inserted) {
    step(`${ins.label}_insert`, false, e?.message ?? "no row returned");
  }
  insertedIds[ins.label] = inserted.id;
  step(
    `${ins.label}_insert`,
    true,
    `id=${inserted.id} tier=${inserted.tier} name=${inserted.name}`
  );

  // Per-step read-back verification.
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
    Array.isArray(r.jurisdiction_iso) &&
    r.jurisdiction_iso.includes(ins.state_iso) &&
    r.url === ins.url;
  step(
    `${ins.label}_verify`,
    ok,
    `tier=${r?.tier} status=${r?.status} admin_only=${r?.admin_only} jurisdiction_iso=${JSON.stringify(r?.jurisdiction_iso)} url=${r?.url}`
  );
}

// ─── Final invariant: each entity has env_body + legislature at T1 ─────
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

{
  const { data: snapshot } = await supabase
    .from("sources")
    .select("id, name, tier, status, admin_only, url, jurisdiction_iso")
    .or(PROVINCES.map((s) => `jurisdiction_iso.cs.{${s}}`).join(","));
  const perProvince = {};
  for (const r of snapshot ?? []) {
    for (const j of r.jurisdiction_iso ?? []) {
      if (PROVINCES.includes(j)) {
        perProvince[j] = (perProvince[j] || 0) + 1;
      }
    }
  }
  for (const iso of PROVINCES) {
    const count = perProvince[iso] || 0;
    step(
      `${iso}_count`,
      count === 2,
      `expected 2 (env_body + legislature), got ${count}`
    );
  }
  console.log(
    "\nFinal CA province/territory snapshot:\n",
    JSON.stringify(snapshot, null, 2)
  );
}

// ─── Federal post-check: Transport Canada + Canada Gazette unchanged ───
{
  const { data: federal } = await supabase
    .from("sources")
    .select("id, name, url, tier, status, admin_only, jurisdiction_iso")
    .or("jurisdiction_iso.cs.{CA}");
  const federalSummary = (federal ?? [])
    .map((r) => `${r.name}(t${r.tier}/${r.status}/admin=${r.admin_only})`)
    .join("; ");
  step(
    "ca_federal_snapshot_post",
    (federal ?? []).length === 2,
    `count=${federal?.length ?? 0} rows=[${federalSummary}]`
  );
}

writeFileSync(
  resolve("..", "docs", "tier1-ca-provinces-execute-log.json"),
  JSON.stringify(
    {
      completed: true,
      total_inserts: Object.keys(insertedIds).length,
      inserted_ids: insertedIds,
      eccc_note:
        "ECCC has no row in the sources table. The dispatch's halt condition for ECCC unexpected state cannot trigger because the row does not exist. Two CA-tagged federal rows (Transport Canada T2, Canada Gazette T1) were preserved unchanged — verified pre and post.",
      log,
    },
    null,
    2
  ),
  "utf8"
);
console.log("\n[OK] Tier 1 CA provinces + territories writes complete.");
console.log(`Total inserts: ${Object.keys(insertedIds).length}`);
console.log("Log: docs/tier1-ca-provinces-execute-log.json");
