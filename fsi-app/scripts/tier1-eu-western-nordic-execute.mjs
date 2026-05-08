/**
 * tier1-eu-western-nordic-execute.mjs — authorized writes for Tier 1
 * Wave B (EU Western + Nordic).
 *
 * 10 EU member states: DE, FR, NL, BE, LU, AT, DK, SE, FI, IE.
 *
 * Cloned from tier1-us-west-execute.mjs / pr-a1-execute.mjs per CLAUDE.md
 * reuse-before-construction principle. Per-step verification on every
 * write — failure halts.
 *
 * Authorized scope per investigation findings on 2026-05-07
 * (run scripts/tmp/tier1-eu-western-nordic-investigate.mjs to reproduce):
 *
 *   - All 24 source rows below are MISSING in the registry. None exist
 *     under their canonical URL hosts. No cross-region collisions.
 *   - 2 retag candidates (g7 Germany BMDV → DE, r5 Stockholm Env Institute → SE)
 *     have row content that matches the target country.
 *   - eu-core-markets-regional-operations-profile is explicitly multi-state
 *     (DE/NL/BE/FR/IT) per its summary; LEFT at ['EU'] per dispatch.
 *   - BE structure confirmed: federal SPF Santé + 3 regional (BRU/VLG/WAL)
 *     + federal Chamber = 5 sources for BE. Sub-national jurisdiction_iso
 *     codes BE-BRU / BE-VLG / BE-WAL on the regional rows; ['BE'] on the
 *     federal rows.
 *
 * Authorized writes (24 inserts + 2 retags, all idempotent via existence check):
 *   DE: Umweltbundesamt + Bundestag (2)
 *   FR: MITECO + Assemblée Nationale + Sénat (3)
 *   NL: RIVM + Tweede Kamer (2)
 *   BE: SPF Santé (federal) + Brussels Environment + VMM + AwAC + Chamber (5)
 *   LU: MECDD + Chambre des Députés (2)
 *   AT: Umweltbundesamt AT + Nationalrat (2)
 *   DK: Miljøministeriet + Folketinget (2)
 *   SE: Naturvårdsverket + Riksdag (2)
 *   FI: Ympäristöministeriö + Eduskunta (2)
 *   IE: EPA Ireland + Oireachtas (2)
 *   Retag: g7 (BMDV) ['EU'] → ['DE']
 *   Retag: r5 (SEI) ['EU'] → ['SE']
 *
 * Halt conditions checked per step:
 *   - URL collision against UNRELATED jurisdiction_iso → halt
 *   - Insert returns no row → halt
 *   - Read-back tier !=1 OR status !=active OR admin_only !=false OR
 *     jurisdiction_iso doesn't include the expected ISO → halt
 *   - Retag pre-state doesn't show ['EU'] alone → halt (premise check)
 *
 * Idempotent: if a row already exists at the canonical URL with the
 * correct ISO, the step records a skip and continues.
 */

import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";

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

const LOG_PATH = resolve("..", "docs", "tier1-eu-western-nordic-execute-log.json");
mkdirSync(dirname(LOG_PATH), { recursive: true });
const log = [];
function step(name, ok, detail) {
  const line = `[${ok ? "OK" : "FAIL"}] ${name} — ${detail}`;
  console.log(line);
  log.push({ name, ok, detail, at: new Date().toISOString() });
  if (!ok) {
    writeFileSync(
      LOG_PATH,
      JSON.stringify({ aborted_at: name, log }, null, 2),
      "utf8"
    );
    process.exit(1);
  }
}

/**
 * Insert a source row idempotently with read-back verification.
 *
 * - First checks for existence at the canonical URL via ilike (handles
 *   trailing-slash + http/https variation). If found, validates that the
 *   existing row's jurisdiction_iso includes the expected ISO; cross-region
 *   collisions halt.
 * - On insert, asserts the returned row's tier/status/admin_only/iso.
 */
async function insertSourceWithVerify({ stepKey, urlIlike, payload, expectedIso }) {
  const { data: existing, error: ee } = await supabase
    .from("sources")
    .select("id, name, url, tier, status, admin_only, jurisdiction_iso")
    .ilike("url", urlIlike);
  if (ee) {
    step(`${stepKey}_existence_check`, false, ee.message);
    return null;
  }
  if (existing && existing.length > 0) {
    const row = existing[0];
    const isoArr = Array.isArray(row.jurisdiction_iso) ? row.jurisdiction_iso : [];
    if (!isoArr.includes(expectedIso)) {
      step(
        `${stepKey}_collision_unexpected`,
        false,
        `existing row id=${row.id} jurisdiction_iso=${JSON.stringify(isoArr)} does NOT include ${expectedIso} — cross-region collision, halting`
      );
      return null;
    }
    step(
      `${stepKey}_already_exists`,
      true,
      `id=${row.id} tier=${row.tier} status=${row.status} skipping insert`
    );
    return row.id;
  }

  const { data: inserted, error: ie } = await supabase
    .from("sources")
    .insert(payload)
    .select("id, tier, status, admin_only, jurisdiction_iso, name, url")
    .maybeSingle();
  if (ie || !inserted) {
    step(`${stepKey}_insert`, false, ie?.message ?? "no row returned");
    return null;
  }
  step(
    `${stepKey}_insert`,
    true,
    `id=${inserted.id} tier=${inserted.tier} name=${inserted.name}`
  );

  const { data: readback } = await supabase
    .from("sources")
    .select("id, tier, status, admin_only, jurisdiction_iso, name, url")
    .eq("id", inserted.id)
    .maybeSingle();
  const ok =
    readback &&
    readback.tier === 1 &&
    readback.status === "active" &&
    readback.admin_only === false &&
    Array.isArray(readback.jurisdiction_iso) &&
    readback.jurisdiction_iso.includes(expectedIso);
  step(
    `${stepKey}_verify`,
    ok,
    `tier=${readback?.tier} status=${readback?.status} admin_only=${readback?.admin_only} iso=${JSON.stringify(readback?.jurisdiction_iso)}`
  );
  return inserted.id;
}

/**
 * Retag an intelligence_items row's jurisdiction_iso, with pre-state
 * verification (premise = current value is the legacy ['EU']) and
 * post-state verification (read-back equals desired value).
 */
async function retagWithVerify({ stepKey, legacyId, expectedPreIso, newIso }) {
  const { data: pre, error: pre_err } = await supabase
    .from("intelligence_items")
    .select("id, legacy_id, title, jurisdiction_iso")
    .eq("legacy_id", legacyId)
    .maybeSingle();
  if (pre_err) {
    step(`${stepKey}_pre`, false, pre_err.message);
    return;
  }
  if (!pre) {
    step(`${stepKey}_pre`, false, `legacy_id=${legacyId} not found`);
    return;
  }
  const preIso = Array.isArray(pre.jurisdiction_iso) ? pre.jurisdiction_iso : [];
  const matchesExpectedPre =
    preIso.length === expectedPreIso.length &&
    expectedPreIso.every((v) => preIso.includes(v));
  if (!matchesExpectedPre) {
    // If already at desired post-state, treat as already-applied and skip
    const matchesNew =
      preIso.length === newIso.length && newIso.every((v) => preIso.includes(v));
    if (matchesNew) {
      step(
        `${stepKey}_already_retagged`,
        true,
        `id=${pre.id} jurisdiction_iso already=${JSON.stringify(preIso)}`
      );
      return;
    }
    step(
      `${stepKey}_pre_mismatch`,
      false,
      `id=${pre.id} jurisdiction_iso=${JSON.stringify(preIso)} expected=${JSON.stringify(expectedPreIso)}`
    );
    return;
  }
  const { error: ue } = await supabase
    .from("intelligence_items")
    .update({ jurisdiction_iso: newIso })
    .eq("id", pre.id);
  if (ue) {
    step(`${stepKey}_update`, false, ue.message);
    return;
  }
  const { data: post } = await supabase
    .from("intelligence_items")
    .select("id, legacy_id, jurisdiction_iso")
    .eq("id", pre.id)
    .maybeSingle();
  const postIso = Array.isArray(post?.jurisdiction_iso) ? post.jurisdiction_iso : [];
  const ok =
    postIso.length === newIso.length && newIso.every((v) => postIso.includes(v));
  step(
    `${stepKey}_verify`,
    ok,
    `id=${pre.id} jurisdiction_iso=${JSON.stringify(postIso)}`
  );
}

const COMMON = {
  tier: 1,
  tier_at_creation: 1,
  status: "active",
  admin_only: false,
  jurisdictions: [],
  domains: [1],
  access_method: "scrape",
  update_frequency: "weekly",
};

// ─── DE: Germany ───────────────────────────────────────────────────────
await insertSourceWithVerify({
  stepKey: "de_uba",
  urlIlike: "%umweltbundesamt.de%",
  expectedIso: "DE",
  payload: {
    ...COMMON,
    name: "Umweltbundesamt (UBA) — German Environment Agency",
    url: "https://www.umweltbundesamt.de/",
    description:
      "Germany's federal environment agency. Authoritative for German air quality, emissions inventories, transport-emissions reporting methodologies, and federal regulatory implementation guidance touching freight forwarders operating Hamburg/Bremerhaven, Frankfurt air cargo, and inland road/rail networks.",
    jurisdiction_iso: ["DE"],
    intelligence_types: ["regulation"],
    notes:
      "Tier 1 federal environmental regulator. Counterpart to the EU's EEA at the German member-state level.",
  },
});

await insertSourceWithVerify({
  stepKey: "de_bundestag",
  urlIlike: "%bundestag.de%",
  expectedIso: "DE",
  payload: {
    ...COMMON,
    name: "Deutscher Bundestag",
    url: "https://www.bundestag.de/",
    description:
      "Germany's federal parliament. Authoritative for federal legislation affecting freight, including the Climate Protection Act (Klimaschutzgesetz), Heavy Vehicle Toll (Maut), Supply Chain Due Diligence Act (Lieferkettensorgfaltspflichtengesetz), and CBAM transposition where relevant.",
    jurisdiction_iso: ["DE"],
    intelligence_types: ["legislation"],
    notes:
      "Tier 1 federal legislative portal. Authoritative for German federal statute text and bill status.",
  },
});

// ─── FR: France ────────────────────────────────────────────────────────
await insertSourceWithVerify({
  stepKey: "fr_miteco",
  urlIlike: "%ecologie.gouv.fr%",
  expectedIso: "FR",
  payload: {
    ...COMMON,
    name: "Ministère de la Transition écologique et de la Cohésion des territoires (MITECO)",
    url: "https://www.ecologie.gouv.fr/",
    description:
      "France's primary environmental ministry. Administers the French climate and energy framework (Loi Climat et Résilience), road transport decarbonisation, ZFE-m low-emission zones, and freight-relevant regulatory implementation across Le Havre, Marseille-Fos, Roissy CDG, and inland networks.",
    jurisdiction_iso: ["FR"],
    intelligence_types: ["regulation"],
    notes:
      "Tier 1 French environmental ministry. Authoritative for national environmental and transport-decarbonisation policy.",
  },
});

await insertSourceWithVerify({
  stepKey: "fr_an",
  urlIlike: "%assemblee-nationale.fr%",
  expectedIso: "FR",
  payload: {
    ...COMMON,
    name: "Assemblée nationale",
    url: "https://www.assemblee-nationale.fr/",
    description:
      "France's lower house of parliament. Authoritative for French national legislation including the Loi Climat et Résilience, Loi d'orientation des mobilités (LOM), and EU directive transposition affecting freight, road transport, and corporate climate disclosure.",
    jurisdiction_iso: ["FR"],
    intelligence_types: ["legislation"],
    notes:
      "Tier 1 French legislative portal (lower chamber).",
  },
});

await insertSourceWithVerify({
  stepKey: "fr_senat",
  urlIlike: "%senat.fr%",
  expectedIso: "FR",
  payload: {
    ...COMMON,
    name: "Sénat (France)",
    url: "https://www.senat.fr/",
    description:
      "France's upper house of parliament. Authoritative for French national legislation, with particular weight on territorial-impact reports affecting freight infrastructure, ports, and rail.",
    jurisdiction_iso: ["FR"],
    intelligence_types: ["legislation"],
    notes:
      "Tier 1 French legislative portal (upper chamber).",
  },
});

// ─── NL: Netherlands ───────────────────────────────────────────────────
await insertSourceWithVerify({
  stepKey: "nl_rivm",
  urlIlike: "%rivm.nl%",
  expectedIso: "NL",
  payload: {
    ...COMMON,
    name: "Rijksinstituut voor Volksgezondheid en Milieu (RIVM)",
    url: "https://www.rivm.nl/",
    description:
      "Netherlands' National Institute for Public Health and the Environment. Authoritative for Dutch air quality (NSL/PM/NOx monitoring), emissions inventories, and freight-relevant environmental data covering Rotterdam, Amsterdam Schiphol, and inland barge networks.",
    jurisdiction_iso: ["NL"],
    intelligence_types: ["regulation"],
    notes:
      "Tier 1 Dutch environmental and public health regulator.",
  },
});

await insertSourceWithVerify({
  stepKey: "nl_tk",
  urlIlike: "%tweedekamer.nl%",
  expectedIso: "NL",
  payload: {
    ...COMMON,
    name: "Tweede Kamer der Staten-Generaal",
    url: "https://www.tweedekamer.nl/",
    description:
      "Netherlands' lower house of parliament. Authoritative for Dutch national legislation, EU directive transposition, and freight-relevant policy debate (Rotterdam port emissions, road transport ZE zones, nitrogen-deposition policy affecting infrastructure).",
    jurisdiction_iso: ["NL"],
    intelligence_types: ["legislation"],
    notes:
      "Tier 1 Dutch legislative portal (lower chamber).",
  },
});

// ─── BE: Belgium (federal + 3 regional + federal Chamber) ──────────────
await insertSourceWithVerify({
  stepKey: "be_fed_spf",
  urlIlike: "%health.belgium.be%",
  expectedIso: "BE",
  payload: {
    ...COMMON,
    name: "SPF Santé publique, Sécurité de la chaîne alimentaire et Environnement (FPS Health)",
    url: "https://www.health.belgium.be/",
    description:
      "Belgium's federal public service for public health, food chain safety, and environment. Coordinates federal climate policy (DG Environnement), CBAM implementation, and federal-regional climate-policy interfacing where freight intersects with port-of-entry environmental regulation.",
    jurisdiction_iso: ["BE"],
    intelligence_types: ["regulation"],
    notes:
      "Tier 1 Belgian federal environmental authority. Federal level — regional environmental authorities are separately registered (Brussels Environment, VMM, AwAC).",
  },
});

await insertSourceWithVerify({
  stepKey: "be_reg_brussels",
  urlIlike: "%environnement.brussels%",
  expectedIso: "BE-BRU",
  payload: {
    ...COMMON,
    name: "Brussels Environment / Leefmilieu Brussel (Bruxelles Environnement)",
    url: "https://environnement.brussels/",
    description:
      "Brussels-Capital Region's environmental administration. Authoritative for Brussels-Capital air quality (LEZ Bruxelles low-emission zone, expanding to ZE by 2035), urban freight emissions policy, and regional environmental permitting affecting Brussels-area logistics operations.",
    jurisdiction_iso: ["BE-BRU"],
    intelligence_types: ["regulation"],
    notes:
      "Tier 1 Brussels-Capital Region environmental regulator. Sub-national (BE-BRU) per Belgium's federal structure.",
  },
});

await insertSourceWithVerify({
  stepKey: "be_reg_vmm",
  urlIlike: "%vmm.be%",
  expectedIso: "BE-VLG",
  payload: {
    ...COMMON,
    name: "Vlaamse Milieumaatschappij (VMM) — Flanders Environment Agency",
    url: "https://www.vmm.be/",
    description:
      "Flanders region's environmental agency. Authoritative for Flemish air quality (Antwerp port-area NO2 monitoring), emissions reporting, and regional climate policy affecting Antwerp, Zeebrugge, Ghent ports and Flanders road/rail freight networks.",
    jurisdiction_iso: ["BE-VLG"],
    intelligence_types: ["regulation"],
    notes:
      "Tier 1 Flanders Region environmental regulator. Sub-national (BE-VLG) per Belgium's federal structure.",
  },
});

await insertSourceWithVerify({
  stepKey: "be_reg_awac",
  urlIlike: "%awac.be%",
  expectedIso: "BE-WAL",
  payload: {
    ...COMMON,
    name: "Agence wallonne de l'Air et du Climat (AwAC)",
    url: "https://www.awac.be/",
    description:
      "Wallonia region's air and climate agency. Authoritative for Walloon air quality, regional climate plan (PACE), and environmental policy affecting Liège air cargo, inland waterways (Meuse/Sambre), and Walloon road freight networks.",
    jurisdiction_iso: ["BE-WAL"],
    intelligence_types: ["regulation"],
    notes:
      "Tier 1 Wallonia Region air and climate regulator. Sub-national (BE-WAL) per Belgium's federal structure.",
  },
});

await insertSourceWithVerify({
  stepKey: "be_fed_chamber",
  urlIlike: "%lachambre.be%",
  expectedIso: "BE",
  payload: {
    ...COMMON,
    name: "La Chambre des représentants de Belgique / Belgische Kamer van volksvertegenwoordigers",
    url: "https://www.lachambre.be/",
    description:
      "Belgium's federal Chamber of Representatives. Authoritative for federal legislation, EU directive transposition, and federal-level climate, transport, and trade policy affecting freight forwarders operating across Belgium's federal-regional structure.",
    jurisdiction_iso: ["BE"],
    intelligence_types: ["legislation"],
    notes:
      "Tier 1 Belgian federal legislative portal. Federal level — regional parliaments (Brussels, Flemish, Walloon) are out of scope for this wave.",
  },
});

// ─── LU: Luxembourg ────────────────────────────────────────────────────
await insertSourceWithVerify({
  stepKey: "lu_mecdd",
  urlIlike: "%environnement.public.lu%",
  expectedIso: "LU",
  payload: {
    ...COMMON,
    name: "Ministère de l'Environnement, du Climat et de la Biodiversité (MECDD) — Luxembourg",
    url: "https://environnement.public.lu/",
    description:
      "Luxembourg's environment, climate and biodiversity ministry. Authoritative for Luxembourg's national climate plan (PNEC), road transport (Luxembourg Findel air cargo, transit corridors), and CBAM implementation guidance.",
    jurisdiction_iso: ["LU"],
    intelligence_types: ["regulation"],
    notes:
      "Tier 1 Luxembourg environmental ministry.",
  },
});

await insertSourceWithVerify({
  stepKey: "lu_chd",
  urlIlike: "%chd.lu%",
  expectedIso: "LU",
  payload: {
    ...COMMON,
    name: "Chambre des Députés du Grand-Duché de Luxembourg",
    url: "https://www.chd.lu/",
    description:
      "Luxembourg's parliament. Authoritative for Luxembourgish legislation, EU directive transposition, and freight-relevant policy (transit fuel taxation, Findel air cargo, cross-border road transport regulation).",
    jurisdiction_iso: ["LU"],
    intelligence_types: ["legislation"],
    notes:
      "Tier 1 Luxembourg legislative portal.",
  },
});

// ─── AT: Austria ───────────────────────────────────────────────────────
await insertSourceWithVerify({
  stepKey: "at_uba",
  urlIlike: "%umweltbundesamt.at%",
  expectedIso: "AT",
  payload: {
    ...COMMON,
    name: "Umweltbundesamt — Austrian Environment Agency",
    url: "https://www.umweltbundesamt.at/",
    description:
      "Austria's federal environment agency. Authoritative for Austrian air quality, emissions inventories, transport-emissions reporting, and freight-relevant policy (Brenner corridor, Vienna logistics, sectoral driving bans).",
    jurisdiction_iso: ["AT"],
    intelligence_types: ["regulation"],
    notes:
      "Tier 1 Austrian federal environmental regulator. Distinct from Germany's UBA — same name, different jurisdiction.",
  },
});

await insertSourceWithVerify({
  stepKey: "at_parlament",
  urlIlike: "%parlament.gv.at%",
  expectedIso: "AT",
  payload: {
    ...COMMON,
    name: "Österreichisches Parlament (Nationalrat & Bundesrat)",
    url: "https://www.parlament.gv.at/",
    description:
      "Austria's federal parliament (Nationalrat and Bundesrat). Authoritative for Austrian federal legislation, EU directive transposition, and freight-relevant policy (Brenner sectoral driving bans, Klimaschutzgesetz Austria, EuroVignette).",
    jurisdiction_iso: ["AT"],
    intelligence_types: ["legislation"],
    notes:
      "Tier 1 Austrian federal legislative portal.",
  },
});

// ─── DK: Denmark ───────────────────────────────────────────────────────
await insertSourceWithVerify({
  stepKey: "dk_mim",
  urlIlike: "%mim.dk%",
  expectedIso: "DK",
  payload: {
    ...COMMON,
    name: "Miljøministeriet (Ministry of Environment of Denmark)",
    url: "https://mim.dk/",
    description:
      "Denmark's Ministry of Environment. Authoritative for Danish climate and environmental policy, including the Climate Act (Klimaloven), maritime emissions policy (Copenhagen, Aarhus, Esbjerg ports), and freight-relevant regulatory implementation.",
    jurisdiction_iso: ["DK"],
    intelligence_types: ["regulation"],
    notes:
      "Tier 1 Danish environmental ministry. Miljøstyrelsen (Danish EPA) is the executive agency under MIM and may be added as a separate row in a follow-up wave if needed.",
  },
});

await insertSourceWithVerify({
  stepKey: "dk_ft",
  urlIlike: "%ft.dk%",
  expectedIso: "DK",
  payload: {
    ...COMMON,
    name: "Folketinget (Danish Parliament)",
    url: "https://www.ft.dk/",
    description:
      "Denmark's parliament. Authoritative for Danish legislation including the Climate Act, Maritime Action Plan, and EU directive transposition affecting freight, ports, and corporate climate disclosure.",
    jurisdiction_iso: ["DK"],
    intelligence_types: ["legislation"],
    notes:
      "Tier 1 Danish legislative portal.",
  },
});

// ─── SE: Sweden ────────────────────────────────────────────────────────
await insertSourceWithVerify({
  stepKey: "se_naturvardsverket",
  urlIlike: "%naturvardsverket.se%",
  expectedIso: "SE",
  payload: {
    ...COMMON,
    name: "Naturvårdsverket — Swedish Environmental Protection Agency",
    url: "https://www.naturvardsverket.se/",
    description:
      "Sweden's environmental protection agency. Authoritative for Swedish climate policy (climate framework, Klimatlagen), emissions reporting, and freight-relevant policy (Gothenburg/Stockholm/Malmö port emissions, road transport CO2 reduction obligation, environmental zones).",
    jurisdiction_iso: ["SE"],
    intelligence_types: ["regulation"],
    notes:
      "Tier 1 Swedish environmental regulator.",
  },
});

await insertSourceWithVerify({
  stepKey: "se_riksdagen",
  urlIlike: "%riksdagen.se%",
  expectedIso: "SE",
  payload: {
    ...COMMON,
    name: "Sveriges Riksdag (Swedish Parliament)",
    url: "https://www.riksdagen.se/",
    description:
      "Sweden's parliament. Authoritative for Swedish national legislation including Klimatlagen (Climate Act), the Reduction Obligation (reduktionsplikt) on transport fuels, and EU directive transposition.",
    jurisdiction_iso: ["SE"],
    intelligence_types: ["legislation"],
    notes:
      "Tier 1 Swedish legislative portal.",
  },
});

// ─── FI: Finland ───────────────────────────────────────────────────────
await insertSourceWithVerify({
  stepKey: "fi_ym",
  urlIlike: "%ym.fi%",
  expectedIso: "FI",
  payload: {
    ...COMMON,
    name: "Ympäristöministeriö (Ministry of the Environment of Finland)",
    url: "https://ym.fi/",
    description:
      "Finland's Ministry of the Environment. Authoritative for Finnish climate policy (Climate Act), maritime emissions (Helsinki, HaminaKotka, Rauma ports), and freight-relevant regulatory implementation.",
    jurisdiction_iso: ["FI"],
    intelligence_types: ["regulation"],
    notes:
      "Tier 1 Finnish environmental ministry.",
  },
});

await insertSourceWithVerify({
  stepKey: "fi_eduskunta",
  urlIlike: "%eduskunta.fi%",
  expectedIso: "FI",
  payload: {
    ...COMMON,
    name: "Eduskunta (Parliament of Finland)",
    url: "https://www.eduskunta.fi/",
    description:
      "Finland's parliament. Authoritative for Finnish national legislation, EU directive transposition, and freight-relevant policy (Climate Act 2022, transport fuel distribution obligation, Arctic shipping policy).",
    jurisdiction_iso: ["FI"],
    intelligence_types: ["legislation"],
    notes:
      "Tier 1 Finnish legislative portal.",
  },
});

// ─── IE: Ireland ───────────────────────────────────────────────────────
await insertSourceWithVerify({
  stepKey: "ie_epa",
  urlIlike: "%epa.ie%",
  expectedIso: "IE",
  payload: {
    ...COMMON,
    name: "Environmental Protection Agency (EPA) — Ireland",
    url: "https://www.epa.ie/",
    description:
      "Ireland's Environmental Protection Agency. Authoritative for Irish air quality, emissions inventories, climate reporting, and freight-relevant policy (Dublin/Cork port emissions, Shannon air cargo, road transport policy).",
    jurisdiction_iso: ["IE"],
    intelligence_types: ["regulation"],
    notes:
      "Tier 1 Irish environmental regulator. Distinct from US EPA — same name, different jurisdiction.",
  },
});

await insertSourceWithVerify({
  stepKey: "ie_oireachtas",
  urlIlike: "%oireachtas.ie%",
  expectedIso: "IE",
  payload: {
    ...COMMON,
    name: "Houses of the Oireachtas (Irish Parliament)",
    url: "https://www.oireachtas.ie/",
    description:
      "Ireland's parliament (Dáil and Seanad). Authoritative for Irish legislation including the Climate Action and Low Carbon Development Acts, EU directive transposition, and freight-relevant policy (Dublin/Cork ports, Shannon air cargo, ZE zones).",
    jurisdiction_iso: ["IE"],
    intelligence_types: ["legislation"],
    notes:
      "Tier 1 Irish legislative portal.",
  },
});

// ─── Retag: g7 (Germany BMDV) ['EU'] → ['DE'] ──────────────────────────
await retagWithVerify({
  stepKey: "retag_g7_de",
  legacyId: "g7",
  expectedPreIso: ["EU"],
  newIso: ["DE"],
});

// ─── Retag: r5 (Stockholm Environment Institute) ['EU'] → ['SE'] ───────
await retagWithVerify({
  stepKey: "retag_r5_se",
  legacyId: "r5",
  expectedPreIso: ["EU"],
  newIso: ["SE"],
});

// ─── Final state snapshot ──────────────────────────────────────────────
{
  const { data: snapshot } = await supabase
    .from("sources")
    .select("id, name, url, tier, jurisdiction_iso, status")
    .or(
      [
        // DE
        "url.ilike.%umweltbundesamt.de%",
        "url.ilike.%bundestag.de%",
        // FR
        "url.ilike.%ecologie.gouv.fr%",
        "url.ilike.%assemblee-nationale.fr%",
        "url.ilike.%senat.fr%",
        // NL
        "url.ilike.%rivm.nl%",
        "url.ilike.%tweedekamer.nl%",
        // BE
        "url.ilike.%health.belgium.be%",
        "url.ilike.%environnement.brussels%",
        "url.ilike.%vmm.be%",
        "url.ilike.%awac.be%",
        "url.ilike.%lachambre.be%",
        // LU
        "url.ilike.%environnement.public.lu%",
        "url.ilike.%chd.lu%",
        // AT
        "url.ilike.%umweltbundesamt.at%",
        "url.ilike.%parlament.gv.at%",
        // DK
        "url.ilike.%mim.dk%",
        "url.ilike.%ft.dk%",
        // SE
        "url.ilike.%naturvardsverket.se%",
        "url.ilike.%riksdagen.se%",
        // FI
        "url.ilike.%ym.fi%",
        "url.ilike.%eduskunta.fi%",
        // IE
        "url.ilike.%epa.ie%",
        "url.ilike.%oireachtas.ie%",
      ].join(",")
    )
    .order("jurisdiction_iso", { ascending: true });
  console.log(
    "\nFinal EU Western+Nordic source snapshot (post-execute):\n",
    JSON.stringify(snapshot, null, 2)
  );
  log.push({
    name: "final_snapshot",
    ok: true,
    detail: `${snapshot?.length ?? 0} rows in EU Western+Nordic scope`,
    rows: snapshot,
    at: new Date().toISOString(),
  });

  // Retag snapshot
  const { data: retag_snapshot } = await supabase
    .from("intelligence_items")
    .select("id, legacy_id, title, jurisdiction_iso")
    .in("legacy_id", ["g7", "r5"]);
  console.log(
    "\nFinal retag snapshot:\n",
    JSON.stringify(retag_snapshot, null, 2)
  );
  log.push({
    name: "retag_snapshot",
    ok: true,
    detail: `${retag_snapshot?.length ?? 0} retag rows`,
    rows: retag_snapshot,
    at: new Date().toISOString(),
  });
}

writeFileSync(
  LOG_PATH,
  JSON.stringify({ completed: true, log }, null, 2),
  "utf8"
);
console.log("\n[OK] Tier 1 EU Western+Nordic writes complete. Log:", LOG_PATH);
