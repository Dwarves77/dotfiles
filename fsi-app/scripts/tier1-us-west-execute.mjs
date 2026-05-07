/**
 * tier1-us-west-execute.mjs — authorized writes for Tier 1 Wave A
 * (US West region: OR, NV, AZ, ID, MT, WY, CO, UT, NM, AK, HI;
 * US-WA carved out per PR-A2 and excluded from this wave).
 *
 * Cloned from pr-a1-execute.mjs / pr-a2-execute.mjs per CLAUDE.md
 * reuse-before-construction principle. Per-step verification on
 * every write — failure halts.
 *
 * Authorized scope per investigation findings on 2026-05-07
 * (run scripts/tmp/tier1-us-west-investigate.mjs to reproduce):
 *
 *   - Existing source rows confirmed across 9 of 11 states (13 rows
 *     total). US-OR, US-MT, US-NM each already have BOTH the state
 *     environmental body and the state legislature; no inserts.
 *   - 0 retag candidates (no state-specific intelligence_items
 *     mistagged ["US"] in the West region).
 *   - 11 source inserts needed: state legislatures (NV, WY, UT) and
 *     full pairs (AZ, ID, AK, HI) where neither the env body nor the
 *     legislature is yet in the registry.
 *   - 2 exact-URL collisions (US-MT DEQ + US-NM legislature) — both
 *     are already on URLs we'd otherwise insert at; the script
 *     short-circuits via existence checks rather than touching them.
 *
 * Authorized writes (11 inserts, all idempotent via existence check):
 *   1. NV Legislature
 *   2. AZ ADEQ
 *   3. AZ Legislature
 *   4. ID DEQ
 *   5. ID Legislature
 *   6. WY Legislature
 *   7. UT Legislature
 *   8. AK DEC
 *   9. AK Legislature
 *  10. HI Department of Health (Clean Air Branch)
 *  11. HI State Legislature
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

const LOG_PATH = resolve("..", "docs", "tier1-us-west-execute-log.json");
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
    return row.id;
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
  return inserted.id;
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

// ─── Step 1: NV Legislature ────────────────────────────────────────────
await insertSourceWithVerify({
  stepKey: "nv_leg",
  urlIlike: "%leg.state.nv.us%",
  expectedIso: "US-NV",
  payload: {
    ...COMMON,
    name: "Nevada Legislature – Nevada Revised Statutes (NRS) & Legislative Counsel Bureau",
    url: "https://www.leg.state.nv.us/",
    description:
      "Nevada's official public access to state legislation, bills, and the Nevada Revised Statutes. Hosts statute text and bill status for legislation affecting freight, ports of entry, fuel taxes, and corporate climate disclosure at the state level.",
    jurisdiction_iso: ["US-NV"],
    intelligence_types: ["legislation"],
    notes:
      "Tier 1 official state legislative portal. Authoritative for Nevada state statute text and bill status. Parallels PR-A1's California Leginfo at tier 1.",
  },
});

// ─── Step 2: AZ ADEQ ───────────────────────────────────────────────────
await insertSourceWithVerify({
  stepKey: "az_adeq",
  urlIlike: "%azdeq.gov%",
  expectedIso: "US-AZ",
  payload: {
    ...COMMON,
    name: "Arizona Department of Environmental Quality (ADEQ)",
    url: "https://azdeq.gov/",
    description:
      "Arizona's primary environmental regulator. Administers state air quality programs (including PM10 nonattainment for Phoenix metro), surface water, and waste programs that intersect with freight operations, drayage, and warehousing in Maricopa and Pinal counties.",
    jurisdiction_iso: ["US-AZ"],
    intelligence_types: ["regulation"],
    notes:
      "Tier 1 state environmental regulator. Parallels PR-A1's CARB tier 1 designation as the authoritative state environmental body.",
  },
});

// ─── Step 3: AZ Legislature ────────────────────────────────────────────
await insertSourceWithVerify({
  stepKey: "az_leg",
  urlIlike: "%azleg.gov%",
  expectedIso: "US-AZ",
  payload: {
    ...COMMON,
    name: "Arizona State Legislature",
    url: "https://www.azleg.gov/",
    description:
      "Arizona's official public access to state legislation, bills, and the Arizona Revised Statutes (ARS). Authoritative for state legislation affecting freight, transportation, ports of entry, and corporate disclosure at the state level.",
    jurisdiction_iso: ["US-AZ"],
    intelligence_types: ["legislation"],
    notes:
      "Tier 1 official state legislative portal. Parallels PR-A1's California Leginfo at tier 1.",
  },
});

// ─── Step 4: ID DEQ ────────────────────────────────────────────────────
await insertSourceWithVerify({
  stepKey: "id_deq",
  urlIlike: "%deq.idaho.gov%",
  expectedIso: "US-ID",
  payload: {
    ...COMMON,
    name: "Idaho Department of Environmental Quality (DEQ)",
    url: "https://www.deq.idaho.gov/",
    description:
      "Idaho's primary environmental regulator. Administers state air quality programs, water quality, waste, and Treasure Valley/Boise metro PM-2.5 nonattainment management. Relevant to freight operations crossing I-84/I-15 corridors and Boise warehousing.",
    jurisdiction_iso: ["US-ID"],
    intelligence_types: ["regulation"],
    notes:
      "Tier 1 state environmental regulator. Parallels PR-A1's CARB tier 1 designation as the authoritative state environmental body.",
  },
});

// ─── Step 5: ID Legislature ────────────────────────────────────────────
await insertSourceWithVerify({
  stepKey: "id_leg",
  urlIlike: "%legislature.idaho.gov%",
  expectedIso: "US-ID",
  payload: {
    ...COMMON,
    name: "Idaho Legislature – Idaho Statutes & Idaho Administrative Code",
    url: "https://legislature.idaho.gov/",
    description:
      "Idaho's official public access to state legislation, bills, statutes, and the Idaho Administrative Code. Authoritative for state legislation affecting freight, fuel taxes, transportation, and corporate disclosure at the state level.",
    jurisdiction_iso: ["US-ID"],
    intelligence_types: ["legislation"],
    notes:
      "Tier 1 official state legislative portal. Parallels PR-A1's California Leginfo at tier 1.",
  },
});

// ─── Step 6: WY Legislature ────────────────────────────────────────────
await insertSourceWithVerify({
  stepKey: "wy_leg",
  urlIlike: "%wyoleg.gov%",
  expectedIso: "US-WY",
  payload: {
    ...COMMON,
    name: "Wyoming Legislature – Wyoming Statutes",
    url: "https://www.wyoleg.gov/",
    description:
      "Wyoming's official public access to state legislation, bills, and the Wyoming Statutes. Authoritative for state legislation affecting freight on I-80/I-25 corridors, mineral extraction logistics, and corporate disclosure at the state level.",
    jurisdiction_iso: ["US-WY"],
    intelligence_types: ["legislation"],
    notes:
      "Tier 1 official state legislative portal. Parallels PR-A1's California Leginfo at tier 1.",
  },
});

// ─── Step 7: UT Legislature ────────────────────────────────────────────
await insertSourceWithVerify({
  stepKey: "ut_leg",
  urlIlike: "%le.utah.gov%",
  expectedIso: "US-UT",
  payload: {
    ...COMMON,
    name: "Utah State Legislature – Utah Code & Utah Administrative Code",
    url: "https://le.utah.gov/",
    description:
      "Utah's official public access to state legislation, bills, the Utah Code, and the Utah Administrative Code. Authoritative for state legislation affecting freight along I-15/I-80, Salt Lake City warehousing, inland port operations, and corporate disclosure at the state level.",
    jurisdiction_iso: ["US-UT"],
    intelligence_types: ["legislation"],
    notes:
      "Tier 1 official state legislative portal. Parallels PR-A1's California Leginfo at tier 1.",
  },
});

// ─── Step 8: AK DEC ────────────────────────────────────────────────────
await insertSourceWithVerify({
  stepKey: "ak_dec",
  urlIlike: "%dec.alaska.gov%",
  expectedIso: "US-AK",
  payload: {
    ...COMMON,
    name: "Alaska Department of Environmental Conservation (DEC)",
    url: "https://dec.alaska.gov/",
    description:
      "Alaska's primary environmental regulator. Administers state air, water, contaminated sites, and spill prevention/response programs that intersect with marine freight, North Slope logistics, and Anchorage/Fairbanks operations. ULSD and marine fuel oversight is particularly relevant given Alaska's marine-dependent freight base.",
    jurisdiction_iso: ["US-AK"],
    intelligence_types: ["regulation"],
    notes:
      "Tier 1 state environmental regulator. Parallels PR-A1's CARB tier 1 designation as the authoritative state environmental body.",
  },
});

// ─── Step 9: AK Legislature ────────────────────────────────────────────
await insertSourceWithVerify({
  stepKey: "ak_leg",
  urlIlike: "%akleg.gov%",
  expectedIso: "US-AK",
  payload: {
    ...COMMON,
    name: "Alaska State Legislature – Alaska Statutes",
    url: "https://www.akleg.gov/",
    description:
      "Alaska's official public access to state legislation, bills, and the Alaska Statutes. Authoritative for state legislation affecting marine freight, oil/gas logistics, North Slope operations, and corporate disclosure at the state level.",
    jurisdiction_iso: ["US-AK"],
    intelligence_types: ["legislation"],
    notes:
      "Tier 1 official state legislative portal. Parallels PR-A1's California Leginfo at tier 1.",
  },
});

// ─── Step 10: HI Department of Health (Clean Air Branch) ───────────────
await insertSourceWithVerify({
  stepKey: "hi_doh",
  urlIlike: "%health.hawaii.gov%",
  expectedIso: "US-HI",
  payload: {
    ...COMMON,
    name: "Hawai‘i Department of Health – Clean Air Branch & Environmental Health Administration",
    url: "https://health.hawaii.gov/",
    description:
      "Hawai'i's primary environmental regulator (housed in the state Department of Health). Administers Clean Air Branch permitting, surface water, and solid/hazardous waste programs that intersect with island freight operations, marine fuel handling, and Honolulu/Hilo/Kahului port logistics.",
    jurisdiction_iso: ["US-HI"],
    intelligence_types: ["regulation"],
    notes:
      "Tier 1 state environmental regulator. Hawai'i delegates environmental authority to the Department of Health rather than a standalone DEQ/DEC. Parallels PR-A1's CARB tier 1 designation as the authoritative state environmental body.",
  },
});

// ─── Step 11: HI State Legislature ─────────────────────────────────────
await insertSourceWithVerify({
  stepKey: "hi_leg",
  urlIlike: "%capitol.hawaii.gov%",
  expectedIso: "US-HI",
  payload: {
    ...COMMON,
    name: "Hawai‘i State Legislature – Hawai‘i Revised Statutes",
    url: "https://www.capitol.hawaii.gov/",
    description:
      "Hawai'i's official public access to state legislation, bills, and the Hawai'i Revised Statutes. Authoritative for state legislation affecting marine freight, port operations, ground transportation, sustainable aviation fuel mandates, and corporate disclosure at the state level.",
    jurisdiction_iso: ["US-HI"],
    intelligence_types: ["legislation"],
    notes:
      "Tier 1 official state legislative portal. Parallels PR-A1's California Leginfo at tier 1.",
  },
});

// ─── Final state snapshot ──────────────────────────────────────────────
{
  const { data: snapshot } = await supabase
    .from("sources")
    .select("id, name, url, tier, jurisdiction_iso, status")
    .or(
      [
        // env bodies
        "url.ilike.%oregon.gov/deq%",
        "url.ilike.%ndep.nv.gov%",
        "url.ilike.%azdeq.gov%",
        "url.ilike.%deq.idaho.gov%",
        "url.ilike.%deq.mt.gov%",
        "url.ilike.%deq.wyoming.gov%",
        "url.ilike.%cdphe.colorado.gov%",
        "url.ilike.%codot.gov%",
        "url.ilike.%deq.utah.gov%",
        "url.ilike.%env.nm.gov%",
        "url.ilike.%dec.alaska.gov%",
        "url.ilike.%dot.alaska.gov%",
        "url.ilike.%health.hawaii.gov%",
        // legislatures
        "url.ilike.%oregonlegislature.gov%",
        "url.ilike.%leg.state.nv.us%",
        "url.ilike.%azleg.gov%",
        "url.ilike.%legislature.idaho.gov%",
        "url.ilike.%leg.mt.gov%",
        "url.ilike.%wyoleg.gov%",
        "url.ilike.%leg.colorado.gov%",
        "url.ilike.%le.utah.gov%",
        "url.ilike.%nmlegis.gov%",
        "url.ilike.%akleg.gov%",
        "url.ilike.%capitol.hawaii.gov%",
        // additional AZ row already present
        "url.ilike.%azdot.gov%",
      ].join(",")
    )
    .order("jurisdiction_iso", { ascending: true });
  console.log(
    "\nFinal US-West state source snapshot (post-execute):\n",
    JSON.stringify(snapshot, null, 2)
  );
  log.push({
    name: "final_snapshot",
    ok: true,
    detail: `${snapshot?.length ?? 0} rows in West region scope`,
    rows: snapshot,
    at: new Date().toISOString(),
  });
}

writeFileSync(
  LOG_PATH,
  JSON.stringify({ completed: true, log }, null, 2),
  "utf8"
);
console.log("\n[OK] Tier 1 US West writes complete. Log:", LOG_PATH);
