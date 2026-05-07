/**
 * tier1-au-apac-execute.mjs — Tier 1 Wave B writes for Australia + APAC.
 *
 * Authorized scope per Jason's dispatch (2026-05-07):
 *
 *   25 source inserts (9 AU + 4 APAC entity-blocks):
 *     AU federal:  DCCEEW + Parliament of Australia                  (2)
 *     AU-NSW:      NSW Parliament                                    (1)
 *     AU-VIC:      EPA Victoria + Parliament of Victoria             (2)
 *     AU-QLD:      DES QLD + Queensland Parliament                   (2)
 *     AU-WA:       DWER + Parliament of WA                           (2)
 *     AU-SA:       EPA SA + Parliament of SA                         (2)
 *     AU-TAS:      EPA Tasmania + Tasmanian Parliament               (2)
 *     AU-ACT:      Environment ACT + ACT Legislative Assembly        (2)
 *     AU-NT:       NT EPA + Legislative Assembly of NT               (2)
 *     SG:          Parliament of Singapore                           (1)
 *     HK:          EPD + Legislative Council                         (2)
 *     JP:          MoE JP + Sangiin + Shugiin                        (3)
 *     KR:          MoE KR + National Assembly                        (2)
 *
 *   PLUS SG retag-in-place on existing rows with jurisdiction_iso=[].
 *   Per dispatch the expected count is ~5 (4 MPA + 1 MOT), with NEA-carbon-tax
 *   as a conditional 6th if untagged. Halt threshold: |actual - 5| > 2.
 *
 *   Mirrors Wave 2 cleanup retag-in-place pattern (jurisdiction_iso only —
 *   never touches status, tier, processing_paused, or any other field).
 *
 * Investigation findings (2026-05-07, docs/tier1-au-apac-investigate.json):
 *   - 0 URL collisions across all 25 planned inserts
 *   - 9 SG-content rows missing jurisdiction_iso (vs expected 5)
 *     -> HALT condition triggered: 9 differs from 5 by 4 > 2
 *   - Pre-existing AU/APAC rows all match expected tier/admin_only
 *   - NEA carbon-tax: status=provisional, tier=1, jurisdiction_iso=[] (matches)
 *
 * Per per-step verification contract (PR-A1 / Wave 2 / Wave A pattern), every
 * insert and retag is verified post-write. The SG-count gate halts the entire
 * run if dispatch's premise diverges from observed state.
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
const retaggedIds = [];

const LOG_PATH = resolve("..", "docs", "tier1-au-apac-execute-log.json");

function flushLog(extra = {}) {
  writeFileSync(
    LOG_PATH,
    JSON.stringify({ ...extra, log, insertedIds, retaggedIds }, null, 2),
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

// ─── Step 0: Pre-existing AU/APAC sanity checks ───────────────────────
// Verify dispatch's premise that pre-existing rows match expected state.
{
  const PRE_EXISTING = [
    { url: "epa.nsw.gov.au", expectTier: 2, label: "EPA NSW" },
    { url: "legislation.qld.gov.au", expectTier: 1, label: "QLD legislation" },
    { url: "legislation.wa.gov.au", expectTier: 1, label: "WA legislation" },
    { url: "recfit", expectTier: 2, label: "ReCFIT TAS" },
    { url: "legislation.act.gov.au", expectTier: 1, label: "ACT legislation" },
    { url: "legislation.nt.gov.au", expectTier: 1, label: "NT legislation" },
    { url: "sso.agc.gov.sg", expectTier: 1, label: "SSO Singapore" },
    { url: "bca.gov.sg", expectTier: 2, label: "BCA Singapore" },
  ];
  for (const e of PRE_EXISTING) {
    const { data } = await supabase
      .from("sources")
      .select("id, tier, admin_only")
      .ilike("url", `%${e.url}%`);
    const ok =
      data &&
      data.length >= 1 &&
      data.some((r) => r.tier === e.expectTier && r.admin_only === false);
    step(
      `pre_existing_${e.url.replace(/[^a-z0-9]/gi, "_")}`,
      ok,
      `${e.label}: ${data?.length ?? 0} hit(s), tiers=${JSON.stringify(data?.map((r) => r.tier))}, admin_only=${JSON.stringify(data?.map((r) => r.admin_only))}`
    );
  }
}

// ─── Step 0.5: NEA carbon-tax sanity (status=provisional, ISO empty) ──
const NEA_CARBON_TAX_URL =
  "https://www.nea.gov.sg/our-services/climate-change-energy-efficiency/climate-change/carbon-tax";
let neaRowId = null;
let neaInitialStatus = null;
{
  const { data } = await supabase
    .from("sources")
    .select("id, name, tier, status, admin_only, jurisdiction_iso")
    .eq("url", NEA_CARBON_TAX_URL)
    .maybeSingle();
  const ok =
    data &&
    data.status === "provisional" &&
    data.tier === 1 &&
    data.admin_only === false &&
    Array.isArray(data.jurisdiction_iso) &&
    data.jurisdiction_iso.length === 0;
  step(
    "nea_carbon_tax_initial_state",
    ok,
    data
      ? `id=${data.id} status=${data.status} tier=${data.tier} jurisdiction_iso=${JSON.stringify(data.jurisdiction_iso)}`
      : "NEA carbon-tax row not found"
  );
  neaRowId = data.id;
  neaInitialStatus = data.status;
}

// ─── Step 0.7: SG retag-candidate enumeration + count gate ────────────
// Enumerate SG-content source rows where jurisdiction_iso=[]. Halt if the
// count diverges from 5 by more than 2 (per dispatch threshold).
//
// SG-content predicate: hostname ends with .sg (covers .gov.sg, .com.sg)
// OR the URL is an unambiguous SG-domiciled regulator (mpa.gov.sg, mse.gov.sg,
// nea.gov.sg, mot.gov.sg, etc.). Pulling broadly via .sg suffix and then
// filtering rows that already have jurisdiction_iso=[] is safest.
const sgRetagCandidates = [];
{
  const { data: allEmpty, error } = await supabase
    .from("sources")
    .select("id, name, url, tier, status, admin_only, jurisdiction_iso")
    .eq("jurisdiction_iso", "{}");
  if (error) step("sg_empty_iso_query", false, error.message);
  // The eq('jurisdiction_iso', '{}') predicate may not work on text[]; use
  // a safer approach: pull all SG-domain rows and filter empty ISO.
  const { data: sgDomain } = await supabase
    .from("sources")
    .select("id, name, url, tier, status, admin_only, jurisdiction_iso")
    .ilike("url", "%.sg/%")
    .or("url.ilike.%.sg,url.ilike.%.gov.sg/%,url.ilike.%.gov.sg");

  // Plus explicit SG hostname patterns (broader catch)
  const { data: sgBroad } = await supabase
    .from("sources")
    .select("id, name, url, tier, status, admin_only, jurisdiction_iso")
    .or(
      "url.ilike.%mpa.gov.sg%,url.ilike.%mse.gov.sg%,url.ilike.%mot.gov.sg%,url.ilike.%nea.gov.sg%,url.ilike.%bca.gov.sg%,url.ilike.%customs.gov.sg%,url.ilike.%greenplan.gov.sg%,url.ilike.%agc.gov.sg%,url.ilike.%parliament.gov.sg%"
    );

  const dedup = new Map();
  for (const r of [...(sgDomain ?? []), ...(sgBroad ?? [])]) {
    dedup.set(r.id, r);
  }
  for (const r of dedup.values()) {
    if (Array.isArray(r.jurisdiction_iso) && r.jurisdiction_iso.length === 0) {
      sgRetagCandidates.push(r);
    }
  }

  const count = sgRetagCandidates.length;
  console.log(`\nSG retag candidates (jurisdiction_iso=[]): ${count}`);
  for (const r of sgRetagCandidates) {
    console.log(
      `  ${r.id}\n    name=${r.name}\n    url=${r.url}\n    tier=${r.tier} status=${r.status}`
    );
  }

  // Halt gate: |count - 5| > 2 ⇒ HALT
  const diverges = Math.abs(count - 5) > 2;
  step(
    "sg_retag_count_gate",
    !diverges,
    `${count} candidates (expected ~5, halt-threshold |Δ|>2). Candidates: ${JSON.stringify(sgRetagCandidates.map((r) => ({ id: r.id, name: r.name, status: r.status, tier: r.tier })))}`
  );
}

// ─── Insert helper ─────────────────────────────────────────────────────
async function insertSource({
  name,
  url,
  description,
  jurisdictionIso,
  intelligenceTypes,
  notes,
  collisionUrlSubstring,
  stepKey,
}) {
  // Collision check on URL host
  {
    const { data: existing } = await supabase
      .from("sources")
      .select("id, name, url, tier")
      .ilike("url", `%${collisionUrlSubstring}%`);
    if (existing && existing.length > 0) {
      step(
        `${stepKey}_collision_check`,
        false,
        `URL collision: ${JSON.stringify(existing)}`
      );
    } else {
      step(`${stepKey}_collision_check`, true, "no collision");
    }
  }

  // Insert
  const { data: inserted, error: e } = await supabase
    .from("sources")
    .insert({
      name,
      url,
      description,
      tier: 1,
      tier_at_creation: 1,
      status: "active",
      admin_only: false,
      jurisdictions: [],
      jurisdiction_iso: jurisdictionIso,
      intelligence_types: intelligenceTypes,
      domains: [1],
      access_method: "scrape",
      update_frequency: "weekly",
      notes,
    })
    .select("id, tier, name")
    .maybeSingle();
  if (e || !inserted) {
    step(`${stepKey}_insert`, false, e?.message ?? "no row returned");
  }
  insertedIds.push(inserted.id);
  step(
    `${stepKey}_insert`,
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
    r.url === url &&
    Array.isArray(r.jurisdiction_iso) &&
    jurisdictionIso.every((j) => r.jurisdiction_iso.includes(j));
  step(
    `${stepKey}_verify`,
    ok,
    `tier=${r?.tier} status=${r?.status} jurisdiction_iso=${JSON.stringify(r?.jurisdiction_iso)} url=${r?.url}`
  );
  return inserted.id;
}

// ─── AU FEDERAL ────────────────────────────────────────────────────────
await insertSource({
  name: "Department of Climate Change, Energy, the Environment and Water (DCCEEW)",
  url: "https://www.dcceew.gov.au/",
  description:
    "Australia's principal federal climate, energy, and environment department. Administers the National Greenhouse and Energy Reporting Scheme (NGERS), the Safeguard Mechanism (mandatory emissions baseline reductions for large facilities), Climate Active certification, and the Australian Carbon Credit Unit (ACCU) Scheme. Highly relevant to freight forwarders with Australian operations and carriers covered by the Safeguard Mechanism.",
  jurisdictionIso: ["AU"],
  intelligenceTypes: ["regulation", "guidance"],
  notes:
    "Tier 1 federal climate/environment regulator. Authoritative for NGERS, Safeguard Mechanism baselines, and federal climate program documents. Parallels CARB/EPA-state-level role at the Australian Commonwealth.",
  collisionUrlSubstring: "dcceew.gov.au",
  stepKey: "au_dcceew",
});

await insertSource({
  name: "Parliament of Australia",
  url: "https://www.aph.gov.au/",
  description:
    "Australia's official federal parliamentary information service. Authoritative source for Commonwealth statutes, bills, and committee reports including the Climate Change Act 2022, the Safeguard Mechanism (Crediting) Amendment Act 2023, and federal legislation affecting freight, ports, aviation, and supply chain emissions.",
  jurisdictionIso: ["AU"],
  intelligenceTypes: ["legislation"],
  notes:
    "Tier 1 official federal legislative portal. Authoritative for Commonwealth statute text and bill status.",
  collisionUrlSubstring: "aph.gov.au",
  stepKey: "au_parliament",
});

// ─── AU-NSW ────────────────────────────────────────────────────────────
await insertSource({
  name: "Parliament of New South Wales",
  url: "https://www.parliament.nsw.gov.au/",
  description:
    "New South Wales' official state parliamentary body. Authoritative source for NSW statutes, bills, and resolutions including the Climate Change (Net Zero Future) Act 2023, environmental planning legislation, and freight/logistics statutes affecting Port Botany, Newcastle, and NSW road/rail freight.",
  jurisdictionIso: ["AU-NSW"],
  intelligenceTypes: ["legislation"],
  notes:
    "Tier 1 official NSW state legislative portal. Authoritative for NSW statute text and bill status. Companion to existing tier-2 EPA NSW source.",
  collisionUrlSubstring: "parliament.nsw.gov.au",
  stepKey: "au_nsw_parliament",
});

// ─── AU-VIC ────────────────────────────────────────────────────────────
await insertSource({
  name: "Environment Protection Authority Victoria (EPA Victoria)",
  url: "https://www.epa.vic.gov.au/",
  description:
    "Victoria's principal state environmental regulator. Administers the Environment Protection Act 2017 (general environmental duty), waste/contaminated-land/air-quality regulations, and climate-adjacent statutory instruments relevant to Port of Melbourne logistics and Victorian road freight operations.",
  jurisdictionIso: ["AU-VIC"],
  intelligenceTypes: ["regulation", "guidance"],
  notes:
    "Tier 1 official Victorian state environmental regulator. Authoritative for EPA Victoria rulemaking and Victorian environment program documents.",
  collisionUrlSubstring: "epa.vic.gov.au",
  stepKey: "au_vic_epa",
});

await insertSource({
  name: "Parliament of Victoria",
  url: "https://www.parliament.vic.gov.au/",
  description:
    "Victoria's official state parliamentary body. Authoritative source for Victorian statutes, bills, and resolutions including the Climate Change Act 2017, Environment Protection Act 2017, and freight/logistics legislation affecting the Port of Melbourne and Victorian supply chain operations.",
  jurisdictionIso: ["AU-VIC"],
  intelligenceTypes: ["legislation"],
  notes:
    "Tier 1 official Victorian state legislative portal. Authoritative for Victorian statute text and bill status.",
  collisionUrlSubstring: "parliament.vic.gov.au",
  stepKey: "au_vic_parliament",
});

// ─── AU-QLD ────────────────────────────────────────────────────────────
await insertSource({
  name: "Queensland Department of Environment, Tourism, Science and Innovation (DETSI / DES)",
  url: "https://environment.des.qld.gov.au/",
  description:
    "Queensland's principal state environmental department. Administers the Environmental Protection Act 1994, the Queensland Climate Action Plan, and state climate-and-environment programs relevant to the ports of Brisbane, Gladstone, and Townsville and Queensland mining/freight supply chains.",
  jurisdictionIso: ["AU-QLD"],
  intelligenceTypes: ["regulation", "guidance"],
  notes:
    "Tier 1 official Queensland state environmental regulator. Authoritative for QLD environment program documents. Companion to existing tier-1 legislation.qld.gov.au statutory portal.",
  collisionUrlSubstring: "environment.des.qld.gov.au",
  stepKey: "au_qld_des",
});

await insertSource({
  name: "Queensland Parliament",
  url: "https://www.parliament.qld.gov.au/",
  description:
    "Queensland's unicameral state parliament. Authoritative source for Queensland statutes, bills, and resolutions including environmental, energy, and freight legislation affecting Queensland ports and supply chain operations.",
  jurisdictionIso: ["AU-QLD"],
  intelligenceTypes: ["legislation"],
  notes:
    "Tier 1 official Queensland state legislative portal. Authoritative for QLD bill status and Hansard. Complement to legislation.qld.gov.au (statutory text).",
  collisionUrlSubstring: "parliament.qld.gov.au",
  stepKey: "au_qld_parliament",
});

// ─── AU-WA ─────────────────────────────────────────────────────────────
await insertSource({
  name: "Western Australia Department of Water and Environmental Regulation (DWER)",
  url: "https://www.wa.gov.au/organisation/department-of-water-and-environmental-regulation",
  description:
    "Western Australia's principal state environmental and water regulator. Administers the Environmental Protection Act 1986, climate policy implementation, air/water/waste licensing, and statutory instruments relevant to Port Hedland, Fremantle, and WA mining/freight logistics.",
  jurisdictionIso: ["AU-WA"],
  intelligenceTypes: ["regulation", "guidance"],
  notes:
    "Tier 1 official WA state environmental regulator. Authoritative for DWER rulemaking and WA environment program documents. Companion to existing tier-1 legislation.wa.gov.au gazette source.",
  collisionUrlSubstring: "department-of-water-and-environmental-regulation",
  stepKey: "au_wa_dwer",
});

await insertSource({
  name: "Parliament of Western Australia",
  url: "https://www.parliament.wa.gov.au/",
  description:
    "Western Australia's bicameral state parliament. Authoritative source for WA statutes, bills, and resolutions including environmental, energy, and freight legislation affecting WA ports and supply chain operations.",
  jurisdictionIso: ["AU-WA"],
  intelligenceTypes: ["legislation"],
  notes:
    "Tier 1 official WA state legislative portal. Authoritative for WA bill status and Hansard.",
  collisionUrlSubstring: "parliament.wa.gov.au",
  stepKey: "au_wa_parliament",
});

// ─── AU-SA ─────────────────────────────────────────────────────────────
await insertSource({
  name: "Environment Protection Authority South Australia (EPA SA)",
  url: "https://www.epa.sa.gov.au/",
  description:
    "South Australia's principal state environmental regulator. Administers the Environment Protection Act 1993, air/water/waste licensing, and climate-related statutory instruments relevant to Port Adelaide and SA freight/logistics operations.",
  jurisdictionIso: ["AU-SA"],
  intelligenceTypes: ["regulation", "guidance"],
  notes:
    "Tier 1 official SA state environmental regulator. Authoritative for EPA SA rulemaking and South Australian environment program documents.",
  collisionUrlSubstring: "epa.sa.gov.au",
  stepKey: "au_sa_epa",
});

await insertSource({
  name: "Parliament of South Australia",
  url: "https://www.parliament.sa.gov.au/",
  description:
    "South Australia's bicameral state parliament. Authoritative source for SA statutes, bills, and resolutions including the Climate Change and Greenhouse Emissions Reduction Act 2007 and freight/logistics legislation affecting Port Adelaide and SA supply chain operations.",
  jurisdictionIso: ["AU-SA"],
  intelligenceTypes: ["legislation"],
  notes:
    "Tier 1 official SA state legislative portal. Authoritative for SA statute text, bill status, and Hansard.",
  collisionUrlSubstring: "parliament.sa.gov.au",
  stepKey: "au_sa_parliament",
});

// ─── AU-TAS ────────────────────────────────────────────────────────────
await insertSource({
  name: "Environment Protection Authority Tasmania (EPA Tasmania)",
  url: "https://epa.tas.gov.au/",
  description:
    "Tasmania's principal state environmental regulator. Administers the Environmental Management and Pollution Control Act 1994, environmental licensing, and statutory instruments relevant to the Port of Hobart, Bell Bay, and Tasmanian freight/logistics operations.",
  jurisdictionIso: ["AU-TAS"],
  intelligenceTypes: ["regulation", "guidance"],
  notes:
    "Tier 1 official Tasmanian state environmental regulator. Authoritative for EPA Tasmania rulemaking and statutory environment instruments. Companion to existing tier-2 ReCFIT (Renewables, Climate and Future Industries Tasmania).",
  collisionUrlSubstring: "epa.tas.gov.au",
  stepKey: "au_tas_epa",
});

await insertSource({
  name: "Parliament of Tasmania",
  url: "https://www.parliament.tas.gov.au/",
  description:
    "Tasmania's bicameral state parliament. Authoritative source for Tasmanian statutes, bills, and resolutions including the Climate Change (State Action) Act 2008 and freight/logistics legislation affecting Tasmanian ports and supply chains.",
  jurisdictionIso: ["AU-TAS"],
  intelligenceTypes: ["legislation"],
  notes:
    "Tier 1 official Tasmanian state legislative portal. Authoritative for Tasmanian statute text, bill status, and Hansard.",
  collisionUrlSubstring: "parliament.tas.gov.au",
  stepKey: "au_tas_parliament",
});

// ─── AU-ACT ────────────────────────────────────────────────────────────
await insertSource({
  name: "Environment ACT (Environment, Planning and Sustainable Development Directorate)",
  url: "https://www.environment.act.gov.au/",
  description:
    "ACT's principal territorial environmental department. Administers the Climate Change and Greenhouse Gas Reduction Act 2010 (ACT's net-zero-by-2045 framework), the ACT Climate Change Strategy, and statutory environment programs relevant to Canberra-area logistics and warehousing.",
  jurisdictionIso: ["AU-ACT"],
  intelligenceTypes: ["regulation", "guidance"],
  notes:
    "Tier 1 official ACT territorial environment regulator. Authoritative for ACT environment/climate program documents. Companion to existing tier-1 legislation.act.gov.au statutory register.",
  collisionUrlSubstring: "environment.act.gov.au",
  stepKey: "au_act_env",
});

await insertSource({
  name: "ACT Legislative Assembly",
  url: "https://www.parliament.act.gov.au/",
  description:
    "Australian Capital Territory's unicameral legislative assembly. Authoritative source for ACT statutes, bills, and resolutions including the Climate Change and Greenhouse Gas Reduction Act 2010 and territorial freight/logistics legislation.",
  jurisdictionIso: ["AU-ACT"],
  intelligenceTypes: ["legislation"],
  notes:
    "Tier 1 official ACT legislative portal. Authoritative for ACT bill status and Hansard. Complement to legislation.act.gov.au (statutory text).",
  collisionUrlSubstring: "parliament.act.gov.au",
  stepKey: "au_act_parliament",
});

// ─── AU-NT ─────────────────────────────────────────────────────────────
await insertSource({
  name: "Northern Territory Environment Protection Authority (NT EPA)",
  url: "https://ntepa.nt.gov.au/",
  description:
    "Northern Territory's principal territorial environmental regulator. Administers the Environment Protection Act 2019, environmental impact assessment, and statutory instruments relevant to the Port of Darwin, Australian-Asia trade corridor freight, and NT mining/logistics operations.",
  jurisdictionIso: ["AU-NT"],
  intelligenceTypes: ["regulation", "guidance"],
  notes:
    "Tier 1 official NT territorial environmental regulator. Authoritative for NT EPA rulemaking and environmental impact assessment documents. Companion to existing tier-1 legislation.nt.gov.au statutory register.",
  collisionUrlSubstring: "ntepa.nt.gov.au",
  stepKey: "au_nt_epa",
});

await insertSource({
  name: "Legislative Assembly of the Northern Territory",
  url: "https://parliament.nt.gov.au/",
  description:
    "Northern Territory's unicameral legislative assembly. Authoritative source for NT statutes, bills, and resolutions including territorial environmental and energy legislation affecting the Port of Darwin and NT freight operations.",
  jurisdictionIso: ["AU-NT"],
  intelligenceTypes: ["legislation"],
  notes:
    "Tier 1 official NT legislative portal. Authoritative for NT bill status and Hansard. Complement to legislation.nt.gov.au (statutory text).",
  collisionUrlSubstring: "parliament.nt.gov.au",
  stepKey: "au_nt_parliament",
});

// ─── SG: Parliament of Singapore ───────────────────────────────────────
await insertSource({
  name: "Parliament of Singapore",
  url: "https://www.parliament.gov.sg/",
  description:
    "Singapore's official unicameral parliament. Authoritative source for Singaporean statutes, bills, and parliamentary debates including the Carbon Pricing Act 2018 (and 2022 amendment), Resource Sustainability Act, and freight/logistics-relevant legislation affecting the Port of Singapore and Changi air cargo.",
  jurisdictionIso: ["SG"],
  intelligenceTypes: ["legislation"],
  notes:
    "Tier 1 official Singapore parliamentary portal. Authoritative for Singapore bill status and Hansard. Complement to existing tier-1 Singapore Statutes Online (sso.agc.gov.sg) for statutory text.",
  collisionUrlSubstring: "parliament.gov.sg",
  stepKey: "sg_parliament",
});

// ─── HK: EPD ──────────────────────────────────────────────────────────
await insertSource({
  name: "Environmental Protection Department (EPD), Hong Kong SAR",
  url: "https://www.epd.gov.hk/",
  description:
    "Hong Kong SAR's principal environmental regulator. Administers the Air Pollution Control Ordinance, the Hong Kong Climate Action Plan 2050, and air/water/waste statutory programs relevant to Kwai Tsing port operations, HKIA cargo, and PRD freight movements.",
  jurisdictionIso: ["HK"],
  intelligenceTypes: ["regulation", "guidance"],
  notes:
    "Tier 1 official Hong Kong SAR environmental regulator. Authoritative for EPD rulemaking and Hong Kong climate program documents.",
  collisionUrlSubstring: "epd.gov.hk",
  stepKey: "hk_epd",
});

await insertSource({
  name: "Legislative Council of the Hong Kong SAR (LegCo)",
  url: "https://www.legco.gov.hk/",
  description:
    "Hong Kong SAR's official Legislative Council. Authoritative source for Hong Kong ordinances, bills, and committee reports including environmental, energy, and freight/logistics legislation affecting Kwai Tsing container terminals and HKIA air cargo.",
  jurisdictionIso: ["HK"],
  intelligenceTypes: ["legislation"],
  notes:
    "Tier 1 official Hong Kong SAR legislative portal. Authoritative for HK ordinance text, bill status, and committee reports.",
  collisionUrlSubstring: "legco.gov.hk",
  stepKey: "hk_legco",
});

// ─── JP: Ministry of the Environment + Sangiin + Shugiin ──────────────
await insertSource({
  name: "Ministry of the Environment of Japan (環境省 / MOEJ)",
  url: "https://www.env.go.jp/",
  description:
    "Japan's principal national environmental ministry. Administers the Act on Promotion of Global Warming Countermeasures, the Act on Rationalizing Energy Use (energy-saving law), GX League framework operations, and statutory environment programs relevant to Japan port operations (Tokyo, Yokohama, Kobe) and Trans-Pacific air freight.",
  jurisdictionIso: ["JP"],
  intelligenceTypes: ["regulation", "guidance"],
  notes:
    "Tier 1 official Japan national environmental ministry. Authoritative for MOEJ rulemaking, GX-related guidance, and Japanese climate program documents. Primary source is Japanese-language; English translations available for major instruments.",
  collisionUrlSubstring: "env.go.jp",
  stepKey: "jp_moe",
});

await insertSource({
  name: "House of Councillors of Japan (Sangiin / 参議院)",
  url: "https://www.sangiin.go.jp/",
  description:
    "Japan's upper house of the National Diet. Authoritative source for Japanese statutes and bills passed through the upper chamber including environmental, energy, and freight/logistics legislation affecting Japanese ports, aviation, and supply chain operations.",
  jurisdictionIso: ["JP"],
  intelligenceTypes: ["legislation"],
  notes:
    "Tier 1 official Japan upper-house legislative portal. Authoritative for Sangiin bill status and committee proceedings.",
  collisionUrlSubstring: "sangiin.go.jp",
  stepKey: "jp_sangiin",
});

await insertSource({
  name: "House of Representatives of Japan (Shugiin / 衆議院)",
  url: "https://www.shugiin.go.jp/",
  description:
    "Japan's lower house of the National Diet. Authoritative source for Japanese statutes and bills originating in the lower chamber including environmental, energy, and freight/logistics legislation affecting Japanese ports, aviation, and supply chain operations.",
  jurisdictionIso: ["JP"],
  intelligenceTypes: ["legislation"],
  notes:
    "Tier 1 official Japan lower-house legislative portal. Authoritative for Shugiin bill status and committee proceedings.",
  collisionUrlSubstring: "shugiin.go.jp",
  stepKey: "jp_shugiin",
});

// ─── KR: Ministry of Environment + National Assembly ──────────────────
await insertSource({
  name: "Ministry of Environment of the Republic of Korea (환경부 / ME)",
  url: "https://www.me.go.kr/",
  description:
    "South Korea's principal national environmental ministry. Administers the Framework Act on Carbon Neutrality and Green Growth, the K-ETS (Korean Emissions Trading Scheme) regulatory operations, and statutory environment programs relevant to Busan port operations and Trans-Pacific freight.",
  jurisdictionIso: ["KR"],
  intelligenceTypes: ["regulation", "guidance"],
  notes:
    "Tier 1 official South Korea national environmental ministry. Authoritative for ME rulemaking and Korean climate program documents.",
  collisionUrlSubstring: "me.go.kr",
  stepKey: "kr_moe",
});

await insertSource({
  name: "National Assembly of the Republic of Korea (대한민국 국회)",
  url: "https://www.assembly.go.kr/",
  description:
    "South Korea's unicameral national legislature. Authoritative source for Korean statutes, bills, and committee reports including the Framework Act on Carbon Neutrality and Green Growth and freight/logistics-relevant legislation affecting Busan and Korean supply chain operations.",
  jurisdictionIso: ["KR"],
  intelligenceTypes: ["legislation"],
  notes:
    "Tier 1 official South Korea legislative portal. Authoritative for Korean statute text, bill status, and committee proceedings.",
  collisionUrlSubstring: "assembly.go.kr",
  stepKey: "kr_assembly",
});

// ─── Cap check: must be exactly 25 inserts ─────────────────────────────
step(
  "insert_count_cap",
  insertedIds.length === 25,
  `inserted ${insertedIds.length} rows (expected 25)`
);

// ─── SG retag-in-place pass ────────────────────────────────────────────
// Apply jurisdiction_iso=["SG"] to each candidate row identified earlier.
// Per Wave 2 retag-in-place pattern: only jurisdiction_iso changes; status,
// tier, admin_only, and all other fields are preserved unchanged.
console.log("\n=== SG RETAG-IN-PLACE ===\n");

for (const candidate of sgRetagCandidates) {
  const id = candidate.id;
  const beforeStatus = candidate.status;
  const beforeTier = candidate.tier;
  const beforeAdminOnly = candidate.admin_only;

  // Update jurisdiction_iso only
  const { error: updErr } = await supabase
    .from("sources")
    .update({ jurisdiction_iso: ["SG"] })
    .eq("id", id);
  step(
    `sg_retag_update_${id.slice(0, 8)}`,
    !updErr,
    updErr?.message ?? `${candidate.name} → ["SG"]`
  );

  // Verify: jurisdiction_iso=["SG"] AND status/tier/admin_only unchanged
  const { data: after } = await supabase
    .from("sources")
    .select("id, name, status, tier, admin_only, jurisdiction_iso, url")
    .eq("id", id)
    .maybeSingle();

  const ok =
    after &&
    Array.isArray(after.jurisdiction_iso) &&
    after.jurisdiction_iso.length === 1 &&
    after.jurisdiction_iso[0] === "SG" &&
    after.status === beforeStatus &&
    after.tier === beforeTier &&
    after.admin_only === beforeAdminOnly;

  step(
    `sg_retag_verify_${id.slice(0, 8)}`,
    ok,
    `name=${after?.name} jurisdiction_iso=${JSON.stringify(after?.jurisdiction_iso)} status=${after?.status} (was ${beforeStatus}) tier=${after?.tier} (was ${beforeTier}) admin_only=${after?.admin_only} (was ${beforeAdminOnly})`
  );
  retaggedIds.push({
    id,
    name: candidate.name,
    url: candidate.url,
    pre: { jurisdiction_iso: candidate.jurisdiction_iso, status: beforeStatus, tier: beforeTier },
    post: {
      jurisdiction_iso: after?.jurisdiction_iso,
      status: after?.status,
      tier: after?.tier,
    },
  });
}

// ─── Final NEA carbon-tax preservation check ───────────────────────────
{
  const { data: r } = await supabase
    .from("sources")
    .select("id, name, status, tier, admin_only, jurisdiction_iso")
    .eq("id", neaRowId)
    .maybeSingle();
  const ok =
    r &&
    r.status === neaInitialStatus && // status MUST be unchanged ('provisional')
    r.tier === 1 &&
    r.admin_only === false;
  step(
    "nea_carbon_tax_post_state_check",
    ok,
    r
      ? `status=${r.status} (initial=${neaInitialStatus}) tier=${r.tier} jurisdiction_iso=${JSON.stringify(r.jurisdiction_iso)}`
      : "NEA carbon-tax row not found"
  );
}

// ─── Final per-jurisdiction snapshot ───────────────────────────────────
const finalSnapshot = {};
for (const j of [
  "AU",
  "AU-NSW",
  "AU-VIC",
  "AU-QLD",
  "AU-WA",
  "AU-SA",
  "AU-TAS",
  "AU-ACT",
  "AU-NT",
  "SG",
  "HK",
  "JP",
  "KR",
]) {
  const { data } = await supabase
    .from("sources")
    .select("id, name, url, tier, status")
    .contains("jurisdiction_iso", [j])
    .order("created_at", { ascending: true });
  finalSnapshot[j] = data;
}
console.log("\nFinal per-jurisdiction snapshot:");
console.log(JSON.stringify(finalSnapshot, null, 2));

flushLog({ completed: true, finalSnapshot });
console.log(
  `\n[OK] Tier 1 AU + APAC writes complete. ${insertedIds.length} inserts, ${retaggedIds.length} SG retags. Log: docs/tier1-au-apac-execute-log.json`
);
