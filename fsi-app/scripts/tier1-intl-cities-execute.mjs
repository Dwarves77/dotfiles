/**
 * tier1-intl-cities-execute.mjs — Tier 1 Wave C writes for international
 * major cities (city-level granularity above the country/region level).
 *
 * Authorized scope (Jason, 2026-05-07):
 *
 * 10 cities — mix of ISO 3166-2 official codes and custom city codes where
 * ISO does not provide one. Per Wave A/B pattern, international city-level
 * corpus is sparse, so insert volume is modest and retag volume is small.
 *
 * ISO code rationale:
 *   Official ISO 3166-2 codes used:
 *     DE-BE (Berlin Land), JP-13 (Tokyo Metropolis),
 *     CN-31 (Shanghai municipality), AE-DU (Dubai emirate),
 *     FR-IDF (Île-de-France region — covers Paris commune).
 *   Custom city codes used (no ISO 3166-2 city-level code exists):
 *     GB-LON (London — Greater London Authority area),
 *     AU-SYD (Sydney), CA-TOR (Toronto), CA-MTL (Montreal).
 *   HK: dispatch notes Hong Kong is already country-level in our taxonomy
 *     and city-level is largely covered by HK country tagging — no
 *     additional inserts; included here only for completeness.
 *
 *   For Paris, FR-IDF (Île-de-France region) was chosen over a custom
 *   FR-PAR commune code. Rationale: Île-de-France is the official ISO
 *   3166-2 region containing Paris, the City of Paris (Mairie de Paris)
 *   shares administrative scope with the metropole, and many freight-
 *   relevant policies (low-emission zone, ZFE, port operations, regional
 *   transit) are administered at IDF region or Paris commune level
 *   simultaneously. Both Mairie de Paris and Région IDF are tagged
 *   FR-IDF here. If finer commune-vs-region split is needed later, the
 *   custom FR-PAR code can be introduced as a refinement.
 *
 * Scope:
 *   Inserts (city-authority + city-legislative-body where applicable):
 *     GB-LON: 2 — Greater London Authority + Transport for London
 *     FR-IDF: 2 — Mairie de Paris + Région Île-de-France
 *     DE-BE:  2 — Senate Dept for Environment + Abgeordnetenhaus
 *     JP-13:  2 — TMG Bureau of Environment + Tokyo Metro Assembly
 *     CN-31:  2 — Shanghai Ecology & Environment Bureau + Shanghai
 *                 Municipal Government portal
 *     AE-DU:  2 — Dubai Municipality + Dubai Government portal
 *     AU-SYD: 1 — City of Sydney
 *     CA-TOR: 2 — City of Toronto Environment + Toronto City Council
 *     CA-MTL: 2 — Ville de Montréal Environment + Montréal City Council
 *     HK:     0 — already covered at HK country level (dispatch)
 *   Total: 17 inserts.
 *
 *   Retags (jurisdiction_iso=[] → ["AE-DU"]) for 3 pre-existing DEWA rows:
 *     - DEWA Shams Dubai (consumer/solar-community/shams-dubai), tier 2
 *     - DEWA MBR Solar Park (about-us/strategic-initiatives/mbr-solar-park), tier 3
 *     - DEWA Shams Dubai Program (consumers/innovation/shams-dubai), tier 1 provisional
 *   Mirrors Wave 2 cleanup retag-in-place pattern (jurisdiction_iso only —
 *   never touches status, tier, processing_paused, admin_only, or any
 *   other field).
 *
 * Halt thresholds (per dispatch):
 *   - Insert count > 28
 *   - Any city > 5 retag candidates (broader fix needed) — current is 3 (Dubai)
 *   - Pre-existing city sources at unexpected tier or admin_only=true
 *   - ISO code conflicts
 *   - Per-step verification failure on any single write
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
const retaggedRows = [];

const LOG_PATH = resolve("..", "docs", "tier1-intl-cities-execute-log.json");

function flushLog(extra = {}) {
  writeFileSync(
    LOG_PATH,
    JSON.stringify({ ...extra, log, insertedIds, retaggedRows }, null, 2),
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

// ─── Step 0: Pre-existing Dubai sanity checks ─────────────────────────
// Confirm 3 DEWA rows match expected tier/admin_only state.
const dubaiPreExisting = [];
{
  const { data } = await supabase
    .from("sources")
    .select("id, name, url, tier, status, admin_only, jurisdiction_iso")
    .ilike("url", "%dewa.gov.ae%");

  for (const r of data ?? []) {
    if (Array.isArray(r.jurisdiction_iso) && r.jurisdiction_iso.length === 0) {
      dubaiPreExisting.push(r);
    }
  }

  console.log(
    `\nDubai DEWA retag candidates (jurisdiction_iso=[]): ${dubaiPreExisting.length}`
  );
  for (const r of dubaiPreExisting) {
    console.log(
      `  ${r.id} tier=${r.tier} status=${r.status} admin_only=${r.admin_only}\n    name=${r.name}\n    url=${r.url}`
    );
  }

  // Halt: any unexpected admin_only=true
  const adminViolation = dubaiPreExisting.some((r) => r.admin_only === true);
  step(
    "dubai_pre_existing_admin_only_check",
    !adminViolation,
    `${dubaiPreExisting.length} DEWA candidates, none admin_only=true`
  );

  // Halt: more than 5 retag candidates per city (per dispatch threshold)
  step(
    "dubai_retag_count_gate",
    dubaiPreExisting.length <= 5,
    `${dubaiPreExisting.length} candidates (halt threshold > 5)`
  );

  // Sanity: confirm baseline 3 rows; |Δ|<=2 acceptable
  const diverges = Math.abs(dubaiPreExisting.length - 3) > 2;
  step(
    "dubai_retag_drift_check",
    !diverges,
    `${dubaiPreExisting.length} candidates (expected 3, |Δ|>2 halts)`
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

// ─── GB-LON: Greater London Authority + Transport for London ──────────
await insertSource({
  name: "Greater London Authority (GLA)",
  url: "https://www.london.gov.uk/",
  description:
    "London's city-region government led by the Mayor of London and London Assembly. Authoritative for the London Environment Strategy, the Ultra Low Emission Zone (ULEZ) policy, the London Plan (spatial development including freight/logistics policy), and city-wide air-quality and net-zero programs directly affecting freight forwarders operating in Greater London.",
  jurisdictionIso: ["GB-LON"],
  intelligenceTypes: ["regulation", "guidance"],
  notes:
    "Tier 1 official Greater London Authority portal. Authoritative for Mayor's strategies, London Plan policy, and Assembly committee output. Custom code GB-LON: ISO 3166-2 has no London-level code; we use GB-LON for the GLA jurisdiction (Greater London).",
  collisionUrlSubstring: "london.gov.uk",
  stepKey: "lon_gla",
});

await insertSource({
  name: "Transport for London (TfL)",
  url: "https://tfl.gov.uk/",
  description:
    "Greater London's integrated transport authority. Operates and regulates the London Low Emission Zone (LEZ), Ultra Low Emission Zone (ULEZ), the Direct Vision Standard for HGVs, the Congestion Charge, and the Safer Lorry Scheme — all directly relevant to freight forwarders moving cargo into and through Greater London.",
  jurisdictionIso: ["GB-LON"],
  intelligenceTypes: ["regulation", "guidance"],
  notes:
    "Tier 1 official Transport for London portal. Authoritative for LEZ/ULEZ scheme rules, Direct Vision Standard for HGVs, Congestion Charge zones, and goods-vehicle compliance guidance. Critical for any client operating road freight in Greater London.",
  collisionUrlSubstring: "tfl.gov.uk",
  stepKey: "lon_tfl",
});

// ─── FR-IDF: Mairie de Paris + Région Île-de-France ────────────────────
await insertSource({
  name: "Ville de Paris (Mairie de Paris)",
  url: "https://www.paris.fr/",
  description:
    "City of Paris commune government. Authoritative for the Paris Climate Action Plan (Plan Climat), the Paris Low-Emission Zone (ZFE-m Métropole du Grand Paris) implementing rules at the commune level, freight-delivery curfews, and air-quality regulations directly affecting last-mile freight and high-value cargo movements within Paris.",
  jurisdictionIso: ["FR-IDF"],
  intelligenceTypes: ["regulation", "guidance"],
  notes:
    "Tier 1 official Paris commune portal. Authoritative for Paris-level climate, ZFE/Crit'Air, and freight-delivery policy. Tagged FR-IDF (Île-de-France region) per ISO 3166-2 — see header note for region-vs-commune rationale.",
  collisionUrlSubstring: "paris.fr",
  stepKey: "par_mairie",
});

await insertSource({
  name: "Région Île-de-France",
  url: "https://www.iledefrance.fr/",
  description:
    "Île-de-France regional council government. Authoritative for the regional climate-air-energy plan (SRADDET / SRCAE), regional transport authority (Île-de-France Mobilités) policy, and regional freight-and-logistics master planning that overlays Paris and the surrounding metropolitan area.",
  jurisdictionIso: ["FR-IDF"],
  intelligenceTypes: ["regulation", "guidance"],
  notes:
    "Tier 1 official Île-de-France region portal. Authoritative for regional climate-air-energy plan, regional transport authority strategy, and regional freight-master-plan deliverables. ISO 3166-2 region code FR-IDF.",
  collisionUrlSubstring: "iledefrance.fr",
  stepKey: "par_region",
});

// ─── DE-BE: Senate Dept Environment + Abgeordnetenhaus ─────────────────
await insertSource({
  name: "Senatsverwaltung für Mobilität, Verkehr, Klimaschutz und Umwelt (Berlin)",
  url: "https://www.berlin.de/sen/uvk/",
  description:
    "Berlin's Senate Department for Mobility, Transport, Climate Protection and the Environment. Authoritative for Berlin's Energy and Climate Protection Programme (BEK), the Berlin Climate Protection Act (Berliner Klimaschutz- und Energiewendegesetz, EWG Bln), the Berlin Umweltzone (low-emission zone), and freight-and-logistics climate measures relevant to Berlin port-of-Berlin barge operations and metropolitan road freight.",
  jurisdictionIso: ["DE-BE"],
  intelligenceTypes: ["regulation", "guidance"],
  notes:
    "Tier 1 official Berlin Senate Department portal. Authoritative for Berlin Land climate, environment, and mobility policy. ISO 3166-2 code DE-BE.",
  collisionUrlSubstring: "berlin.de/sen/uvk",
  stepKey: "ber_senate",
});

await insertSource({
  name: "Abgeordnetenhaus von Berlin",
  url: "https://www.parlament-berlin.de/",
  description:
    "Berlin's Land parliament (Abgeordnetenhaus). Authoritative source for Berlin Land statutes, bills, and committee reports including the Berlin Climate Protection and Energy Transition Act (EWG Bln) and freight/logistics-relevant Land legislation affecting metropolitan Berlin operations.",
  jurisdictionIso: ["DE-BE"],
  intelligenceTypes: ["legislation"],
  notes:
    "Tier 1 official Abgeordnetenhaus von Berlin legislative portal. Authoritative for Berlin Land statute text, bill status, and committee proceedings.",
  collisionUrlSubstring: "parlament-berlin.de",
  stepKey: "ber_parliament",
});

// ─── JP-13: TMG Bureau of Environment + Tokyo Metro Assembly ──────────
await insertSource({
  name: "Tokyo Metropolitan Government Bureau of Environment (東京都環境局)",
  url: "https://www.kankyo.metro.tokyo.lg.jp/",
  description:
    "Tokyo Metropolitan Government Bureau of Environment. Authoritative for the Tokyo Cap-and-Trade Program (the world's first sub-national mandatory cap-and-trade for large facilities), the Tokyo Zero Emission Tokyo Strategy, freight-electrification measures, and metropolitan air-quality and climate policies affecting Tokyo port and Haneda air cargo operations.",
  jurisdictionIso: ["JP-13"],
  intelligenceTypes: ["regulation", "guidance"],
  notes:
    "Tier 1 official Tokyo Metropolitan Government Bureau of Environment portal. Authoritative for Tokyo Cap-and-Trade rulemaking and metropolitan climate program documents. ISO 3166-2 code JP-13 (Tokyo Metropolis). Primary content is Japanese-language; English translations available for major instruments.",
  collisionUrlSubstring: "kankyo.metro.tokyo.lg.jp",
  stepKey: "tok_bureau",
});

await insertSource({
  name: "Tokyo Metropolitan Assembly (東京都議会)",
  url: "https://www.gikai.metro.tokyo.jp/",
  description:
    "Tokyo Metropolitan Assembly. Authoritative source for Tokyo Metropolis ordinances, bills, and committee reports including the Tokyo Cap-and-Trade enabling ordinance and freight/logistics-relevant metropolitan legislation affecting Tokyo port, Haneda air cargo, and the Tokyo metropolitan area supply chain.",
  jurisdictionIso: ["JP-13"],
  intelligenceTypes: ["legislation"],
  notes:
    "Tier 1 official Tokyo Metropolitan Assembly portal. Authoritative for Tokyo Metropolis ordinance text, bill status, and committee proceedings.",
  collisionUrlSubstring: "gikai.metro.tokyo.jp",
  stepKey: "tok_assembly",
});

// ─── CN-31: Shanghai EE Bureau + Shanghai Government portal ───────────
await insertSource({
  name: "Shanghai Municipal Bureau of Ecology and Environment (上海市生态环境局)",
  url: "https://sthj.sh.gov.cn/",
  description:
    "Shanghai's principal municipal environmental regulator. Administers the Shanghai pilot emissions trading scheme (one of the original Chinese ETS pilots, now operating alongside the national ETS), municipal air-quality regulations, and pollution-discharge permitting affecting the Port of Shanghai (world's largest container port) and Pudong air cargo operations.",
  jurisdictionIso: ["CN-31"],
  intelligenceTypes: ["regulation", "guidance"],
  notes:
    "Tier 1 official Shanghai municipal ecology and environment regulator portal. Authoritative for Shanghai ETS pilot rulemaking, pollution-discharge permits, and municipal climate program documents. ISO 3166-2 code CN-31 (Shanghai municipality). Primary content is Chinese-language.",
  collisionUrlSubstring: "sthj.sh.gov.cn",
  stepKey: "sha_eeb",
});

await insertSource({
  name: "Shanghai Municipal People's Government (上海市人民政府)",
  url: "https://www.shanghai.gov.cn/",
  description:
    "Shanghai's municipal government portal. Authoritative for municipal regulations, normative documents, and government work reports including the Shanghai Carbon Peaking Action Plan, port-and-shipping decarbonization measures, and freight/logistics policy directly affecting the Port of Shanghai and Yangshan deep-water terminals.",
  jurisdictionIso: ["CN-31"],
  intelligenceTypes: ["regulation", "guidance"],
  notes:
    "Tier 1 official Shanghai Municipal People's Government portal. Authoritative for Shanghai municipal regulations and government work reports. ISO 3166-2 code CN-31. Primary content is Chinese-language.",
  collisionUrlSubstring: "www.shanghai.gov.cn",
  stepKey: "sha_gov",
});

// ─── AE-DU: Dubai Municipality + Dubai Government portal ──────────────
await insertSource({
  name: "Dubai Municipality (بلدية دبي)",
  url: "https://www.dm.gov.ae/",
  description:
    "Dubai's municipal authority. Administers Dubai's environmental, waste, building-sustainability (Al Sa'fat Dubai Green Building System), and climate-program implementation alongside the Dubai Carbon Abatement Strategy. Affects warehousing, free zone construction, and freight/logistics infrastructure within the Emirate of Dubai including Jebel Ali port and DXB/DWC air cargo operations.",
  jurisdictionIso: ["AE-DU"],
  intelligenceTypes: ["regulation", "guidance"],
  notes:
    "Tier 1 official Dubai Municipality portal. Authoritative for Dubai municipal environmental, waste, and building-sustainability rulemaking. ISO 3166-2 code AE-DU (Dubai emirate).",
  collisionUrlSubstring: "dm.gov.ae",
  stepKey: "dxb_municipality",
});

await insertSource({
  name: "Government of Dubai Portal",
  url: "https://www.dubai.gov.ae/",
  description:
    "Government of Dubai unified portal aggregating Dubai entities including DEWA, RTA, Dubai Customs, Dubai Carbon, and other emirate-level authorities. Authoritative for Dubai government strategy publications, the Dubai Clean Energy Strategy 2050, the Dubai Net Zero 2050 Strategy, and cross-entity policy releases relevant to freight, ports, and logistics.",
  jurisdictionIso: ["AE-DU"],
  intelligenceTypes: ["regulation", "guidance"],
  notes:
    "Tier 1 official Dubai Government portal aggregating emirate-level entities. ISO 3166-2 code AE-DU.",
  collisionUrlSubstring: "www.dubai.gov.ae",
  stepKey: "dxb_govportal",
});

// ─── AU-SYD: City of Sydney ───────────────────────────────────────────
await insertSource({
  name: "City of Sydney",
  url: "https://www.cityofsydney.nsw.gov.au/",
  description:
    "City of Sydney local government area. Authoritative for the Sustainable Sydney 2030–2050 Continuing the Vision strategy, the City's net-zero-by-2035 commitment for community emissions, low-emission delivery vehicle zone rulemaking, and freight/logistics policy within the City of Sydney LGA — distinct from broader NSW state and Greater Sydney metropolitan policy.",
  jurisdictionIso: ["AU-SYD"],
  intelligenceTypes: ["regulation", "guidance"],
  notes:
    "Tier 1 official City of Sydney LGA portal. Custom code AU-SYD: ISO 3166-2 has no Sydney-level code; we use AU-SYD for the City of Sydney LGA jurisdiction. Companion to Tier 1 NSW Parliament + Tier 2 EPA NSW state-level sources.",
  collisionUrlSubstring: "cityofsydney.nsw.gov.au",
  stepKey: "syd_city",
});

// ─── CA-TOR: City of Toronto Environment + Toronto City Council ───────
await insertSource({
  name: "City of Toronto — Environment & Climate",
  url: "https://www.toronto.ca/services-payments/water-environment/",
  description:
    "City of Toronto's environmental services and climate division. Authoritative for the TransformTO Net Zero Strategy (city-wide net-zero by 2040), the Toronto Green Standard (mandatory sustainability requirements for new development), and waste/recycling/air-quality programs directly affecting freight, warehousing, and last-mile delivery operations within the City of Toronto.",
  jurisdictionIso: ["CA-TOR"],
  intelligenceTypes: ["regulation", "guidance"],
  notes:
    "Tier 1 official City of Toronto environment & climate portal. Custom code CA-TOR: ISO 3166-2 has no Toronto-level code; we use CA-TOR for the City of Toronto jurisdiction. Companion to existing Ontario provincial sources.",
  collisionUrlSubstring: "toronto.ca/services-payments/water-environment",
  stepKey: "tor_env",
});

await insertSource({
  name: "City of Toronto — City Council",
  url: "https://www.toronto.ca/city-government/council/",
  description:
    "City of Toronto's elected City Council. Authoritative for City of Toronto by-laws, council decisions, and committee reports including TransformTO climate policy adoptions, Toronto Green Standard updates, and freight/logistics-relevant municipal regulation.",
  jurisdictionIso: ["CA-TOR"],
  intelligenceTypes: ["legislation"],
  notes:
    "Tier 1 official City of Toronto City Council portal. Authoritative for Toronto by-law text, council motions, and committee reports.",
  collisionUrlSubstring: "toronto.ca/city-government/council",
  stepKey: "tor_council",
});

// ─── CA-MTL: Ville de Montréal Environment + Montreal City Council ────
await insertSource({
  name: "Ville de Montréal — Environnement",
  url: "https://montreal.ca/en/topics/environment",
  description:
    "City of Montreal's environment portfolio. Authoritative for the Montreal Climate Plan 2020–2030 (carbon-neutral by 2050), the Montreal Sustainable Development Plan, the city's heavy-vehicle anti-idling by-law, and freight/logistics measures affecting the Port of Montreal and Montréal–Trudeau air cargo.",
  jurisdictionIso: ["CA-MTL"],
  intelligenceTypes: ["regulation", "guidance"],
  notes:
    "Tier 1 official Ville de Montréal environment portal. Custom code CA-MTL: ISO 3166-2 has no Montreal-level code; we use CA-MTL for the City of Montreal jurisdiction. Companion to existing Quebec provincial sources.",
  collisionUrlSubstring: "montreal.ca/en/topics/environment",
  stepKey: "mtl_env",
});

await insertSource({
  name: "Ville de Montréal — Conseil municipal",
  url: "https://montreal.ca/en/topics/city-council",
  description:
    "Ville de Montréal's elected City Council. Authoritative for Montreal by-laws, council decisions, and committee reports including the Montreal Climate Plan adoptions, anti-idling by-law amendments, and freight/logistics-relevant municipal regulation.",
  jurisdictionIso: ["CA-MTL"],
  intelligenceTypes: ["legislation"],
  notes:
    "Tier 1 official Ville de Montréal City Council portal. Authoritative for Montreal by-law text, council motions, and committee reports.",
  collisionUrlSubstring: "montreal.ca/en/topics/city-council",
  stepKey: "mtl_council",
});

// ─── HK city-level: 0 inserts (covered at HK country level) ───────────
// Per dispatch: "Hong Kong (HK is already country-level) — city-level
// largely covered by HK country". No additional inserts; HK country-level
// EPD + LegCo from Wave B remain canonical.

// ─── Cap check: must be exactly 17 inserts (hard halt at >28) ──────────
step(
  "insert_count_cap",
  insertedIds.length === 17 && insertedIds.length <= 28,
  `inserted ${insertedIds.length} rows (expected 17, hard cap 28)`
);

// ─── Dubai retag-in-place pass ────────────────────────────────────────
console.log("\n=== AE-DU RETAG-IN-PLACE (3 DEWA rows) ===\n");

for (const candidate of dubaiPreExisting) {
  const id = candidate.id;
  const beforeStatus = candidate.status;
  const beforeTier = candidate.tier;
  const beforeAdminOnly = candidate.admin_only;
  const beforeIso = candidate.jurisdiction_iso;

  // Update jurisdiction_iso only
  const { error: updErr } = await supabase
    .from("sources")
    .update({ jurisdiction_iso: ["AE-DU"] })
    .eq("id", id);
  step(
    `dxb_retag_update_${id.slice(0, 8)}`,
    !updErr,
    updErr?.message ?? `${candidate.name} → ["AE-DU"]`
  );

  // Verify: jurisdiction_iso=["AE-DU"] AND status/tier/admin_only unchanged
  const { data: after } = await supabase
    .from("sources")
    .select("id, name, url, status, tier, admin_only, jurisdiction_iso")
    .eq("id", id)
    .maybeSingle();

  const ok =
    after &&
    Array.isArray(after.jurisdiction_iso) &&
    after.jurisdiction_iso.length === 1 &&
    after.jurisdiction_iso[0] === "AE-DU" &&
    after.status === beforeStatus &&
    after.tier === beforeTier &&
    after.admin_only === beforeAdminOnly;

  step(
    `dxb_retag_verify_${id.slice(0, 8)}`,
    ok,
    `name=${after?.name} jurisdiction_iso=${JSON.stringify(after?.jurisdiction_iso)} status=${after?.status} (was ${beforeStatus}) tier=${after?.tier} (was ${beforeTier}) admin_only=${after?.admin_only} (was ${beforeAdminOnly})`
  );
  retaggedRows.push({
    id,
    name: candidate.name,
    url: candidate.url,
    pre: {
      jurisdiction_iso: beforeIso,
      status: beforeStatus,
      tier: beforeTier,
      admin_only: beforeAdminOnly,
    },
    post: {
      jurisdiction_iso: after?.jurisdiction_iso,
      status: after?.status,
      tier: after?.tier,
      admin_only: after?.admin_only,
    },
  });
}

// ─── Final per-jurisdiction snapshot ───────────────────────────────────
const finalSnapshot = {};
for (const j of [
  "GB-LON",
  "FR-IDF",
  "DE-BE",
  "JP-13",
  "CN-31",
  "AE-DU",
  "AU-SYD",
  "CA-TOR",
  "CA-MTL",
  "HK",
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
  `\n[OK] Tier 1 international cities writes complete. ${insertedIds.length} inserts, ${retaggedRows.length} AE-DU retags. Log: docs/tier1-intl-cities-execute-log.json`
);
