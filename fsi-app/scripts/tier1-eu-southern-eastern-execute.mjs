/**
 * tier1-eu-southern-eastern-execute.mjs — authorized writes for Tier 1 Wave B
 * (EU Southern + Eastern member states: 17 states, greenfield).
 *
 * Cloned from tier1-us-west-execute.mjs per CLAUDE.md
 * reuse-before-construction principle. Per-step verification on
 * every write — failure halts.
 *
 * Authorized scope per investigation findings on 2026-05-07
 * (run scripts/tmp/tier1-eu-southern-eastern-investigate.mjs to reproduce):
 *
 *   - 0 existing source rows for any of the 17 ISO codes (greenfield).
 *   - 0 URL-hint domain matches across investigated hints.
 *   - 34 source inserts authorized (2 per state × 17 states):
 *       Per state: state environmental ministry + national legislature.
 *
 * States (17):
 *   Southern (6): ES, IT, PT, GR, MT, CY
 *   Eastern (11): PL, CZ, SK, HU, RO, BG, HR, SI, LT, LV, EE
 *
 * Halt conditions checked per step:
 *   - URL collision against UNRELATED state -> halt
 *   - Insert returns no row -> halt
 *   - Read-back tier !=1 OR status !=active OR admin_only !=false OR
 *     jurisdiction_iso doesn't include the expected ISO -> halt
 *
 * Each step has its own read-back verification check before moving on.
 * Idempotent: if a row already exists at the canonical URL with the
 * correct ISO, the step records a skip and continues.
 *
 * Pre-authorized retag false positives (left at current state):
 *   - eu-core-markets-regional-operations-profile (multi-country, stays ["EU"])
 *   - r14 Reuters Sustainable Business (market_signal, stays GLOBAL)
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

const LOG_PATH = resolve("..", "docs", "tier1-eu-southern-eastern-execute-log.json");
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
 *   trailing-slash variation). If found, validates that the existing
 *   row's jurisdiction_iso matches the expected ISO; cross-region
 *   collisions halt.
 * - On insert, asserts the returned row's tier/status/admin_only/iso.
 */
async function insertSourceWithVerify({ stepKey, urlIlike, payload, expectedIso }) {
  // 1. Existence check (handles trailing slash + http/https variants)
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
    return { id: row.id, inserted: false };
  }

  // 2. Insert
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

  // 3. Read-back verification
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
  return { id: inserted.id, inserted: true };
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

// State definitions: 2 sources per state (env body + legislature).
const STATES = [
  // ─── Southern (6) ─────────────────────────────────────────────────
  {
    iso: "ES",
    label: "Spain",
    env: {
      stepKey: "es_miteco",
      urlIlike: "%miteco.gob.es%",
      payload: {
        ...COMMON,
        name: "Ministerio para la Transición Ecológica y el Reto Demográfico (MITECO)",
        url: "https://www.miteco.gob.es/",
        description:
          "Spain's primary environmental and energy-transition ministry. Administers national climate policy, air quality, water, biodiversity, and just-transition programs that intersect with freight (Algeciras, Barcelona, Valencia, Bilbao port operations and EU ETS implementation in Spain).",
        jurisdiction_iso: ["ES"],
        intelligence_types: ["regulation"],
        notes:
          "Tier 1 national environmental ministry. Authoritative for Spanish climate, energy and environmental regulation transposing EU directives.",
      },
    },
    leg: {
      stepKey: "es_cortes",
      urlIlike: "%congreso.es%",
      payload: {
        ...COMMON,
        name: "Cortes Generales – Congreso de los Diputados",
        url: "https://www.congreso.es/",
        description:
          "Spain's official public access to national legislation, bills, and parliamentary records. Authoritative for Spanish legislation affecting freight, transport, fuel taxation, port concessions, and corporate climate disclosure.",
        jurisdiction_iso: ["ES"],
        intelligence_types: ["legislation"],
        notes:
          "Tier 1 national legislative portal.",
      },
    },
  },
  {
    iso: "IT",
    label: "Italy",
    env: {
      stepKey: "it_mase",
      urlIlike: "%mase.gov.it%",
      payload: {
        ...COMMON,
        name: "Ministero dell'Ambiente e della Sicurezza Energetica (MASE)",
        url: "https://www.mase.gov.it/",
        description:
          "Italy's primary environmental and energy-security ministry. Administers national climate, air quality, and energy programs intersecting with freight at Genoa, Trieste, Gioia Tauro, La Spezia, and Livorno; key for EU ETS implementation in Italy.",
        jurisdiction_iso: ["IT"],
        intelligence_types: ["regulation"],
        notes:
          "Tier 1 national environmental ministry.",
      },
    },
    leg: {
      stepKey: "it_camera",
      urlIlike: "%camera.it%",
      payload: {
        ...COMMON,
        name: "Camera dei Deputati – Italian Chamber of Deputies",
        url: "https://www.camera.it/",
        description:
          "Italy's official public access to national legislation, bills, and parliamentary records. Authoritative for Italian legislation affecting freight, transport, fuel taxation, port concessions, and corporate climate disclosure.",
        jurisdiction_iso: ["IT"],
        intelligence_types: ["legislation"],
        notes:
          "Tier 1 national legislative portal.",
      },
    },
  },
  {
    iso: "PT",
    label: "Portugal",
    env: {
      stepKey: "pt_apa",
      urlIlike: "%apambiente.pt%",
      payload: {
        ...COMMON,
        name: "Agência Portuguesa do Ambiente (APA)",
        url: "https://apambiente.pt/",
        description:
          "Portugal's primary environmental agency. Administers national climate, air, water, and waste programs intersecting with freight at Sines, Lisbon, Leixões, and Setúbal; lead authority for EU ETS implementation in Portugal.",
        jurisdiction_iso: ["PT"],
        intelligence_types: ["regulation"],
        notes:
          "Tier 1 national environmental agency.",
      },
    },
    leg: {
      stepKey: "pt_assembleia",
      urlIlike: "%parlamento.pt%",
      payload: {
        ...COMMON,
        name: "Assembleia da República",
        url: "https://www.parlamento.pt/",
        description:
          "Portugal's official public access to national legislation, bills, and parliamentary records. Authoritative for Portuguese legislation affecting freight, transport, fuel taxation, port concessions, and corporate climate disclosure.",
        jurisdiction_iso: ["PT"],
        intelligence_types: ["legislation"],
        notes:
          "Tier 1 national legislative portal.",
      },
    },
  },
  {
    iso: "GR",
    label: "Greece",
    env: {
      stepKey: "gr_ypen",
      urlIlike: "%ypen.gov.gr%",
      payload: {
        ...COMMON,
        name: "Ministry of Environment and Energy (YPEN)",
        url: "https://ypen.gov.gr/",
        description:
          "Greece's primary environmental and energy ministry. Administers national climate, air, water, and energy programs intersecting with freight at Piraeus, Thessaloniki, and the Greek shipping registry; lead authority for EU ETS implementation in Greece (highly relevant given Greek-flag fleet exposure to maritime ETS).",
        jurisdiction_iso: ["GR"],
        intelligence_types: ["regulation"],
        notes:
          "Tier 1 national environmental ministry.",
      },
    },
    leg: {
      stepKey: "gr_hellenic_parliament",
      urlIlike: "%hellenicparliament.gr%",
      payload: {
        ...COMMON,
        name: "Hellenic Parliament",
        url: "https://www.hellenicparliament.gr/",
        description:
          "Greece's official public access to national legislation, bills, and parliamentary records. Authoritative for Greek legislation affecting freight, shipping, transport, fuel taxation, port concessions, and corporate climate disclosure.",
        jurisdiction_iso: ["GR"],
        intelligence_types: ["legislation"],
        notes:
          "Tier 1 national legislative portal.",
      },
    },
  },
  {
    iso: "MT",
    label: "Malta",
    env: {
      stepKey: "mt_era",
      urlIlike: "%era.org.mt%",
      payload: {
        ...COMMON,
        name: "Environment and Resources Authority (ERA)",
        url: "https://era.org.mt/",
        description:
          "Malta's primary environmental regulator. Administers national environmental permitting, air quality, water, and waste programs intersecting with freight at the Malta Freeport (Marsaxlokk) and the Maltese ship registry — material for EU ETS maritime exposure given Malta's flag-state base.",
        jurisdiction_iso: ["MT"],
        intelligence_types: ["regulation"],
        notes:
          "Tier 1 national environmental regulator.",
      },
    },
    leg: {
      stepKey: "mt_parliament",
      urlIlike: "%parlament.mt%",
      payload: {
        ...COMMON,
        name: "Parliament of Malta",
        url: "https://parlament.mt/",
        description:
          "Malta's official public access to national legislation, bills, and parliamentary records. Authoritative for Maltese legislation affecting freight, shipping registry, fuel taxation, port concessions, and corporate climate disclosure.",
        jurisdiction_iso: ["MT"],
        intelligence_types: ["legislation"],
        notes:
          "Tier 1 national legislative portal.",
      },
    },
  },
  {
    iso: "CY",
    label: "Cyprus",
    env: {
      stepKey: "cy_doe",
      urlIlike: "%moa.gov.cy%",
      payload: {
        ...COMMON,
        name: "Department of Environment – Ministry of Agriculture, Rural Development and Environment",
        url: "https://www.moa.gov.cy/",
        description:
          "Cyprus's primary environmental authority (housed within the Ministry of Agriculture, Rural Development and Environment). Administers environmental permitting, air, water, and waste programs intersecting with freight at Limassol and Larnaca and with the Cypriot ship registry under EU ETS maritime scope.",
        jurisdiction_iso: ["CY"],
        intelligence_types: ["regulation"],
        notes:
          "Tier 1 national environmental authority.",
      },
    },
    leg: {
      stepKey: "cy_parliament",
      urlIlike: "%parliament.cy%",
      payload: {
        ...COMMON,
        name: "House of Representatives of Cyprus",
        url: "https://www.parliament.cy/",
        description:
          "Cyprus's official public access to national legislation, bills, and parliamentary records. Authoritative for Cypriot legislation affecting freight, shipping registry, fuel taxation, port concessions, and corporate climate disclosure.",
        jurisdiction_iso: ["CY"],
        intelligence_types: ["legislation"],
        notes:
          "Tier 1 national legislative portal.",
      },
    },
  },

  // ─── Eastern (11) ─────────────────────────────────────────────────
  {
    iso: "PL",
    label: "Poland",
    env: {
      stepKey: "pl_gios",
      urlIlike: "%gov.pl/web/gios%",
      payload: {
        ...COMMON,
        name: "Główny Inspektorat Ochrony Środowiska (GIOŚ)",
        url: "https://www.gov.pl/web/gios",
        description:
          "Poland's chief inspectorate for environmental protection. Administers national environmental monitoring, air quality, and inspection programs intersecting with freight on the A2/A4 corridors, Gdańsk and Gdynia ports, and EU ETS coal-economy compliance pressure.",
        jurisdiction_iso: ["PL"],
        intelligence_types: ["regulation"],
        notes:
          "Tier 1 national environmental inspectorate.",
      },
    },
    leg: {
      stepKey: "pl_sejm",
      urlIlike: "%sejm.gov.pl%",
      payload: {
        ...COMMON,
        name: "Sejm of the Republic of Poland",
        url: "https://www.sejm.gov.pl/",
        description:
          "Poland's official public access to national legislation, bills, and parliamentary records. Authoritative for Polish legislation affecting freight, road transport, fuel taxation, port concessions, and corporate climate disclosure.",
        jurisdiction_iso: ["PL"],
        intelligence_types: ["legislation"],
        notes:
          "Tier 1 national legislative portal.",
      },
    },
  },
  {
    iso: "CZ",
    label: "Czech Republic",
    env: {
      stepKey: "cz_mzp",
      urlIlike: "%mzp.cz%",
      payload: {
        ...COMMON,
        name: "Ministerstvo životního prostředí (MZP)",
        url: "https://www.mzp.cz/",
        description:
          "Czech Republic's primary environmental ministry. Administers national climate, air, water, and waste programs intersecting with freight on Central European road and rail corridors and EU ETS implementation in Czechia.",
        jurisdiction_iso: ["CZ"],
        intelligence_types: ["regulation"],
        notes:
          "Tier 1 national environmental ministry.",
      },
    },
    leg: {
      stepKey: "cz_psp",
      urlIlike: "%psp.cz%",
      payload: {
        ...COMMON,
        name: "Poslanecká sněmovna Parlamentu České republiky",
        url: "https://www.psp.cz/",
        description:
          "Czech Republic's official public access to national legislation, bills, and parliamentary records. Authoritative for Czech legislation affecting freight, road and rail transport, fuel taxation, and corporate climate disclosure.",
        jurisdiction_iso: ["CZ"],
        intelligence_types: ["legislation"],
        notes:
          "Tier 1 national legislative portal.",
      },
    },
  },
  {
    iso: "SK",
    label: "Slovakia",
    env: {
      stepKey: "sk_minzp",
      urlIlike: "%minzp.sk%",
      payload: {
        ...COMMON,
        name: "Ministerstvo životného prostredia Slovenskej republiky (MŽP SR)",
        url: "https://www.minzp.sk/",
        description:
          "Slovakia's primary environmental ministry. Administers national climate, air, water, and waste programs intersecting with freight on Central European corridors and EU ETS implementation in Slovakia.",
        jurisdiction_iso: ["SK"],
        intelligence_types: ["regulation"],
        notes:
          "Tier 1 national environmental ministry.",
      },
    },
    leg: {
      stepKey: "sk_nrsr",
      urlIlike: "%nrsr.sk%",
      payload: {
        ...COMMON,
        name: "Národná rada Slovenskej republiky",
        url: "https://www.nrsr.sk/",
        description:
          "Slovakia's official public access to national legislation, bills, and parliamentary records. Authoritative for Slovak legislation affecting freight, road transport, fuel taxation, and corporate climate disclosure.",
        jurisdiction_iso: ["SK"],
        intelligence_types: ["legislation"],
        notes:
          "Tier 1 national legislative portal.",
      },
    },
  },
  {
    iso: "HU",
    label: "Hungary",
    env: {
      stepKey: "hu_kormany",
      urlIlike: "%kormany.hu%",
      payload: {
        ...COMMON,
        name: "Hungarian Government Environment & Energy Ministry portal (kormany.hu)",
        url: "https://www.kormany.hu/",
        description:
          "Hungary's central government portal for the ministry handling environmental and energy policy (responsibility allocated within the Ministry of Energy / Ministry of Agriculture depending on cycle). Administers national climate, air, water, and waste programs intersecting with freight on the M0/M1/M5 corridors and EU ETS implementation in Hungary.",
        jurisdiction_iso: ["HU"],
        intelligence_types: ["regulation"],
        notes:
          "Tier 1 national environmental ministry portal. Hungary's environment portfolio has shifted across ministries; kormany.hu is the canonical government-wide portal for those publications.",
      },
    },
    leg: {
      stepKey: "hu_orszaggyules",
      urlIlike: "%parlament.hu%",
      payload: {
        ...COMMON,
        name: "Országgyűlés – National Assembly of Hungary",
        url: "https://www.parlament.hu/",
        description:
          "Hungary's official public access to national legislation, bills, and parliamentary records. Authoritative for Hungarian legislation affecting freight, road transport, fuel taxation, and corporate climate disclosure.",
        jurisdiction_iso: ["HU"],
        intelligence_types: ["legislation"],
        notes:
          "Tier 1 national legislative portal.",
      },
    },
  },
  {
    iso: "RO",
    label: "Romania",
    env: {
      stepKey: "ro_mmap",
      urlIlike: "%mmediu.ro%",
      payload: {
        ...COMMON,
        name: "Ministerul Mediului, Apelor și Pădurilor (MMAP)",
        url: "https://www.mmediu.ro/",
        description:
          "Romania's primary environmental ministry. Administers national climate, air, water, and waste programs intersecting with freight at Constanța port (largest Black Sea port), the Lower Danube corridor, and EU ETS implementation in Romania.",
        jurisdiction_iso: ["RO"],
        intelligence_types: ["regulation"],
        notes:
          "Tier 1 national environmental ministry.",
      },
    },
    leg: {
      stepKey: "ro_cdep",
      urlIlike: "%cdep.ro%",
      payload: {
        ...COMMON,
        name: "Camera Deputaților – Chamber of Deputies of Romania",
        url: "https://www.cdep.ro/",
        description:
          "Romania's official public access to national legislation, bills, and parliamentary records. Authoritative for Romanian legislation affecting freight, transport, fuel taxation, port concessions, and corporate climate disclosure.",
        jurisdiction_iso: ["RO"],
        intelligence_types: ["legislation"],
        notes:
          "Tier 1 national legislative portal.",
      },
    },
  },
  {
    iso: "BG",
    label: "Bulgaria",
    env: {
      stepKey: "bg_moew",
      urlIlike: "%moew.government.bg%",
      payload: {
        ...COMMON,
        name: "Ministry of Environment and Water (MOEW)",
        url: "https://www.moew.government.bg/",
        description:
          "Bulgaria's primary environmental ministry. Administers national climate, air, water, and waste programs intersecting with freight at Burgas and Varna ports, the Black Sea / Danube corridors, and EU ETS implementation in Bulgaria.",
        jurisdiction_iso: ["BG"],
        intelligence_types: ["regulation"],
        notes:
          "Tier 1 national environmental ministry.",
      },
    },
    leg: {
      stepKey: "bg_parliament",
      urlIlike: "%parliament.bg%",
      payload: {
        ...COMMON,
        name: "National Assembly of the Republic of Bulgaria",
        url: "https://www.parliament.bg/",
        description:
          "Bulgaria's official public access to national legislation, bills, and parliamentary records. Authoritative for Bulgarian legislation affecting freight, transport, fuel taxation, port concessions, and corporate climate disclosure.",
        jurisdiction_iso: ["BG"],
        intelligence_types: ["legislation"],
        notes:
          "Tier 1 national legislative portal.",
      },
    },
  },
  {
    iso: "HR",
    label: "Croatia",
    env: {
      stepKey: "hr_mingor",
      urlIlike: "%mingor.gov.hr%",
      payload: {
        ...COMMON,
        name: "Ministarstvo gospodarstva i održivog razvoja (Ministry of Economy and Sustainable Development)",
        url: "https://mingor.gov.hr/",
        description:
          "Croatia's primary ministry handling environment and sustainable development. Administers national climate, air, water, and waste programs intersecting with freight at Rijeka and Ploče ports, Adriatic shipping, and EU ETS implementation in Croatia.",
        jurisdiction_iso: ["HR"],
        intelligence_types: ["regulation"],
        notes:
          "Tier 1 national environmental ministry. Note: Croatian portfolio is hosted within the Ministry of Economy and Sustainable Development at mingor.gov.hr (formerly MZOIP).",
      },
    },
    leg: {
      stepKey: "hr_sabor",
      urlIlike: "%sabor.hr%",
      payload: {
        ...COMMON,
        name: "Hrvatski sabor – Croatian Parliament",
        url: "https://www.sabor.hr/",
        description:
          "Croatia's official public access to national legislation, bills, and parliamentary records. Authoritative for Croatian legislation affecting freight, transport, shipping, fuel taxation, port concessions, and corporate climate disclosure.",
        jurisdiction_iso: ["HR"],
        intelligence_types: ["legislation"],
        notes:
          "Tier 1 national legislative portal.",
      },
    },
  },
  {
    iso: "SI",
    label: "Slovenia",
    env: {
      stepKey: "si_mope",
      urlIlike:
        "%gov.si/drzavni-organi/ministrstva/ministrstvo-za-okolje-podnebje-in-energijo%",
      payload: {
        ...COMMON,
        name: "Ministrstvo za okolje, podnebje in energijo (MOPE)",
        url: "https://www.gov.si/drzavni-organi/ministrstva/ministrstvo-za-okolje-podnebje-in-energijo/",
        description:
          "Slovenia's combined environment, climate and energy ministry. Administers national climate, air, water, and energy programs intersecting with freight at Koper port, Central European corridors, and EU ETS implementation in Slovenia.",
        jurisdiction_iso: ["SI"],
        intelligence_types: ["regulation"],
        notes:
          "Tier 1 national environmental + climate + energy ministry.",
      },
    },
    leg: {
      stepKey: "si_dz",
      urlIlike: "%dz-rs.si%",
      payload: {
        ...COMMON,
        name: "Državni zbor Republike Slovenije",
        url: "https://www.dz-rs.si/",
        description:
          "Slovenia's official public access to national legislation, bills, and parliamentary records. Authoritative for Slovenian legislation affecting freight, transport, fuel taxation, port concessions, and corporate climate disclosure.",
        jurisdiction_iso: ["SI"],
        intelligence_types: ["legislation"],
        notes:
          "Tier 1 national legislative portal.",
      },
    },
  },
  {
    iso: "LT",
    label: "Lithuania",
    env: {
      stepKey: "lt_aaa",
      urlIlike: "%aaa.lrv.lt%",
      payload: {
        ...COMMON,
        name: "Aplinkos apsaugos agentūra (AAA – Environmental Protection Agency)",
        url: "https://aaa.lrv.lt/",
        description:
          "Lithuania's environmental protection agency. Administers national environmental monitoring, air, water, and permitting programs intersecting with freight at Klaipėda port, Baltic shipping, and EU ETS implementation in Lithuania.",
        jurisdiction_iso: ["LT"],
        intelligence_types: ["regulation"],
        notes:
          "Tier 1 national environmental agency.",
      },
    },
    leg: {
      stepKey: "lt_seimas",
      urlIlike: "%lrs.lt%",
      payload: {
        ...COMMON,
        name: "Seimas of the Republic of Lithuania",
        url: "https://www.lrs.lt/",
        description:
          "Lithuania's official public access to national legislation, bills, and parliamentary records. Authoritative for Lithuanian legislation affecting freight, transport, fuel taxation, port concessions, and corporate climate disclosure.",
        jurisdiction_iso: ["LT"],
        intelligence_types: ["legislation"],
        notes:
          "Tier 1 national legislative portal.",
      },
    },
  },
  {
    iso: "LV",
    label: "Latvia",
    env: {
      stepKey: "lv_varam",
      urlIlike: "%varam.gov.lv%",
      payload: {
        ...COMMON,
        name: "Vides aizsardzības un reģionālās attīstības ministrija (VARAM)",
        url: "https://www.varam.gov.lv/",
        description:
          "Latvia's environmental protection and regional development ministry. Administers national climate, air, water, and waste programs intersecting with freight at Riga and Ventspils ports, Baltic shipping, and EU ETS implementation in Latvia.",
        jurisdiction_iso: ["LV"],
        intelligence_types: ["regulation"],
        notes:
          "Tier 1 national environmental ministry.",
      },
    },
    leg: {
      stepKey: "lv_saeima",
      urlIlike: "%saeima.lv%",
      payload: {
        ...COMMON,
        name: "Saeima of the Republic of Latvia",
        url: "https://www.saeima.lv/",
        description:
          "Latvia's official public access to national legislation, bills, and parliamentary records. Authoritative for Latvian legislation affecting freight, transport, fuel taxation, port concessions, and corporate climate disclosure.",
        jurisdiction_iso: ["LV"],
        intelligence_types: ["legislation"],
        notes:
          "Tier 1 national legislative portal.",
      },
    },
  },
  {
    iso: "EE",
    label: "Estonia",
    env: {
      stepKey: "ee_kkm",
      urlIlike: "%envir.ee%",
      payload: {
        ...COMMON,
        name: "Keskkonnaministeerium (KKM – Estonian Ministry of Climate / Environment)",
        url: "https://www.envir.ee/",
        description:
          "Estonia's environmental / climate ministry. Administers national climate, air, water, and waste programs intersecting with freight at Tallinn (Muuga, Paldiski) ports, Baltic shipping, and EU ETS implementation in Estonia.",
        jurisdiction_iso: ["EE"],
        intelligence_types: ["regulation"],
        notes:
          "Tier 1 national environmental ministry.",
      },
    },
    leg: {
      stepKey: "ee_riigikogu",
      urlIlike: "%riigikogu.ee%",
      payload: {
        ...COMMON,
        name: "Riigikogu – Parliament of Estonia",
        url: "https://www.riigikogu.ee/",
        description:
          "Estonia's official public access to national legislation, bills, and parliamentary records. Authoritative for Estonian legislation affecting freight, transport, fuel taxation, port concessions, and corporate climate disclosure.",
        jurisdiction_iso: ["EE"],
        intelligence_types: ["legislation"],
        notes:
          "Tier 1 national legislative portal.",
      },
    },
  },
];

// Halt-guard: cap on insert count above estimate.
const ESTIMATED_INSERTS = 34;
const HARD_INSERT_CAP = 38;
let plannedInserts = STATES.length * 2;
if (plannedInserts > HARD_INSERT_CAP) {
  step(
    "halt_guard_insert_cap",
    false,
    `planned inserts (${plannedInserts}) > hard cap (${HARD_INSERT_CAP}); halting`
  );
}
console.log(
  `[plan] ${STATES.length} states × 2 sources = ${plannedInserts} planned (estimate ${ESTIMATED_INSERTS}, cap ${HARD_INSERT_CAP})`
);

// Per-state result table
const results = {};
let totalInserted = 0;
let totalSkipped = 0;

for (const s of STATES) {
  const r = { iso: s.iso, label: s.label, env: null, leg: null };
  const env = await insertSourceWithVerify({ ...s.env, expectedIso: s.iso });
  if (!env) {
    // fail already halted
    break;
  }
  r.env = env;
  if (env.inserted) totalInserted += 1;
  else totalSkipped += 1;

  const leg = await insertSourceWithVerify({ ...s.leg, expectedIso: s.iso });
  if (!leg) break;
  r.leg = leg;
  if (leg.inserted) totalInserted += 1;
  else totalSkipped += 1;

  results[s.iso] = r;
}

// Final state snapshot
{
  const { data: snapshot } = await supabase
    .from("sources")
    .select("id, name, url, tier, jurisdiction_iso, status")
    .or(
      STATES.flatMap((s) => [
        `url.ilike.${s.env.urlIlike}`,
        `url.ilike.${s.leg.urlIlike}`,
      ]).join(",")
    )
    .order("jurisdiction_iso", { ascending: true });
  console.log(
    "\nFinal EU Southern + Eastern source snapshot (post-execute):\n",
    JSON.stringify(snapshot, null, 2)
  );
  log.push({
    name: "final_snapshot",
    ok: true,
    detail: `${snapshot?.length ?? 0} rows in scope`,
    rows: snapshot,
    at: new Date().toISOString(),
  });

  // Per-ISO post-counts
  const perIso = {};
  for (const row of snapshot ?? []) {
    for (const iso of row.jurisdiction_iso ?? []) {
      perIso[iso] = (perIso[iso] ?? 0) + 1;
    }
  }
  log.push({ name: "per_iso_post_counts", ok: true, detail: JSON.stringify(perIso) });
  console.log("\nPer-ISO post counts:", JSON.stringify(perIso));
}

console.log(
  `\nSummary: inserted=${totalInserted}, skipped (already-exists)=${totalSkipped}, planned=${plannedInserts}`
);
log.push({
  name: "summary",
  ok: true,
  detail: `inserted=${totalInserted} skipped=${totalSkipped} planned=${plannedInserts}`,
  at: new Date().toISOString(),
});

writeFileSync(
  LOG_PATH,
  JSON.stringify(
    { completed: true, planned: plannedInserts, inserted: totalInserted, skipped: totalSkipped, results, log },
    null,
    2
  ),
  "utf8"
);
console.log("\n[OK] Tier 1 EU Southern + Eastern writes complete. Log:", LOG_PATH);
