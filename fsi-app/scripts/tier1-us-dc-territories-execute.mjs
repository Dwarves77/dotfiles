/**
 * tier1-us-dc-territories-execute.mjs — Tier 1 Wave A writes for
 * District of Columbia + 5 US Territories (PR, VI, GU, AS, MP).
 *
 * Authorized scope per Jason's batch authorization (2026-05-07):
 *
 * The investigation phase confirmed for each jurisdiction:
 *   - 0 retag candidates total
 *   - 10 source inserts needed (state environmental body +
 *     state legislature where missing)
 *   - DPNR-USVI is the only existing-but-suspended row; it must be
 *     left alone (status=suspended, tier=2, processing_paused=true)
 *
 * Per-jurisdiction inserts:
 *   DC:  DOEE                                          (1)
 *   PR:  DRNA + Legislative Assembly of PR             (2)
 *   VI:  VI Legislature only (DPNR suspended, leave)   (1)
 *   GU:  GEPA + Guam Legislature                       (2)
 *   AS:  AS-EPA + Fono                                 (2)
 *   MP:  BECQ + CNMI Legislature                       (2)
 *
 * Pre-flight findings (2026-05-07):
 *   - DPNR-USVI: id=3cab0b63-605b-47ef-9e4c-6af94680c10c,
 *     status=suspended, processing_paused=true, tier=2,
 *     jurisdiction_iso=['US-VI'] — matches expectations exactly
 *   - DC has 2 pre-existing tier 1 rows (DC Council Law Library
 *     and DC Municipal Regulations); neither collides with DOEE
 *   - 0 URL collisions for any of the 10 planned inserts
 *
 * Each insert is existence-checked then verified post-write.
 * Halts on URL collision, DPNR drift, or any failure.
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

const LOG_PATH = resolve("..", "docs", "tier1-us-dc-territories-execute-log.json");

function flushLog(extra = {}) {
  writeFileSync(
    LOG_PATH,
    JSON.stringify({ ...extra, log, insertedIds }, null, 2),
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

const DPNR_ID = "3cab0b63-605b-47ef-9e4c-6af94680c10c";

// ─── Step 0: DPNR sanity check (HALT if changed) ───────────────────────
{
  const { data: r } = await supabase
    .from("sources")
    .select("id, name, status, processing_paused, tier, jurisdiction_iso")
    .eq("id", DPNR_ID)
    .maybeSingle();
  const ok =
    r &&
    r.status === "suspended" &&
    r.processing_paused === true &&
    r.tier === 2 &&
    Array.isArray(r.jurisdiction_iso) &&
    r.jurisdiction_iso.includes("US-VI");
  step(
    "dpnr_sanity_check",
    ok,
    r
      ? `status=${r.status} processing_paused=${r.processing_paused} tier=${r.tier} jurisdiction_iso=${JSON.stringify(r.jurisdiction_iso)}`
      : "DPNR row not found"
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

// ─── Step 1: DC — DOEE ─────────────────────────────────────────────────
await insertSource({
  name: "DC Department of Energy & Environment (DOEE)",
  url: "https://doee.dc.gov/",
  description:
    "District of Columbia's principal environmental regulator. Administers DC climate programs, air/water quality, and the Clean Energy DC Omnibus Act including BEPS (Building Energy Performance Standards), key for DC-area logistics warehousing and freight emissions reporting.",
  jurisdictionIso: ["US-DC"],
  intelligenceTypes: ["regulation", "guidance"],
  notes:
    "Tier 1 official DC environmental regulator. Authoritative for DOEE rulemaking, BEPS compliance, and DC climate program documents. Parallels CARB/state-DEC role for the District of Columbia.",
  collisionUrlSubstring: "doee.dc.gov",
  stepKey: "dc_doee",
});

// ─── Step 2: PR — DRNA ─────────────────────────────────────────────────
await insertSource({
  name: "Puerto Rico Department of Natural and Environmental Resources (DRNA)",
  url: "https://www.drna.pr.gov/",
  description:
    "Puerto Rico's principal environmental regulator. Administers Commonwealth environmental statutes, coastal zone management, and territorial climate program implementation, relevant to San Juan port operations and Caribbean freight movements.",
  jurisdictionIso: ["US-PR"],
  intelligenceTypes: ["regulation", "guidance"],
  notes:
    "Tier 1 official Puerto Rico environmental regulator. Authoritative for DRNA rulemaking, coastal/maritime environmental compliance, and Commonwealth climate program documents.",
  collisionUrlSubstring: "drna.pr.gov",
  stepKey: "pr_drna",
});

// ─── Step 3: PR — Legislative Assembly ─────────────────────────────────
await insertSource({
  name: "Legislative Assembly of Puerto Rico (Oficina de Servicios Legislativos)",
  url: "https://www.oslpr.org/",
  description:
    "Puerto Rico's official legislative information service. Authoritative source for Commonwealth statutes, bills, and resolutions including PR's energy public policy act and climate-related legislation affecting freight, ports, and supply chain operations.",
  jurisdictionIso: ["US-PR"],
  intelligenceTypes: ["legislation"],
  notes:
    "Tier 1 official Puerto Rico legislative portal. Authoritative for Commonwealth statute text and bill status. Parallels NY/TX state legislature inserts in PR-A2.",
  collisionUrlSubstring: "oslpr.org",
  stepKey: "pr_legislature",
});

// ─── Step 4: VI — Legislature (DPNR suspended, leave alone) ────────────
await insertSource({
  name: "Legislature of the Virgin Islands",
  url: "https://www.legvi.org/",
  description:
    "U.S. Virgin Islands' official legislative body. Authoritative source for territorial statutes, bills, and resolutions including environmental and energy legislation affecting St. Thomas/St. Croix port operations and Caribbean freight.",
  jurisdictionIso: ["US-VI"],
  intelligenceTypes: ["legislation"],
  notes:
    "Tier 1 official USVI legislative portal. Authoritative for territorial statute text and bill status. Note: DPNR (USVI environmental regulator) is currently suspended pending verification — Legislature is the active intake source for USVI.",
  collisionUrlSubstring: "legvi.org",
  stepKey: "vi_legislature",
});

// ─── Step 5: GU — GEPA ─────────────────────────────────────────────────
await insertSource({
  name: "Guam Environmental Protection Agency (GEPA)",
  url: "https://epa.guam.gov/",
  description:
    "Guam's principal environmental regulator. Administers territorial environmental statutes, air/water quality, and climate-related programs relevant to Guam port and military logistics, Asia-Pacific freight transit, and trans-Pacific shipping.",
  jurisdictionIso: ["US-GU"],
  intelligenceTypes: ["regulation", "guidance"],
  notes:
    "Tier 1 official Guam environmental regulator. Authoritative for GEPA rulemaking and territorial climate program documents.",
  collisionUrlSubstring: "epa.guam.gov",
  stepKey: "gu_gepa",
});

// ─── Step 6: GU — Legislature ──────────────────────────────────────────
await insertSource({
  name: "Guam Legislature (I Liheslaturan Guåhan)",
  url: "https://www.guamlegislature.com/",
  description:
    "Guam's unicameral legislature. Authoritative source for territorial statutes, bills, and resolutions including environmental and energy legislation affecting Apra Harbor freight and trans-Pacific supply chain operations.",
  jurisdictionIso: ["US-GU"],
  intelligenceTypes: ["legislation"],
  notes:
    "Tier 1 official Guam legislative portal. Authoritative for territorial statute text and bill status.",
  collisionUrlSubstring: "guamlegislature.com",
  stepKey: "gu_legislature",
});

// ─── Step 7: AS — AS-EPA ───────────────────────────────────────────────
await insertSource({
  name: "American Samoa Environmental Protection Agency (AS-EPA)",
  url: "https://www.epa.as.gov/",
  description:
    "American Samoa's principal environmental regulator. Administers territorial environmental statutes, air/water/coastal quality, and climate-related programs relevant to Pago Pago port operations and Pacific freight transit.",
  jurisdictionIso: ["US-AS"],
  intelligenceTypes: ["regulation", "guidance"],
  notes:
    "Tier 1 official American Samoa environmental regulator. Authoritative for AS-EPA rulemaking and territorial climate program documents.",
  collisionUrlSubstring: "epa.as.gov",
  stepKey: "as_epa",
});

// ─── Step 8: AS — Fono ─────────────────────────────────────────────────
await insertSource({
  name: "American Samoa Fono (Legislature)",
  url: "https://www.americansamoa.gov/legislature",
  description:
    "American Samoa's bicameral legislature (Fono). Authoritative source for territorial statutes, bills, and resolutions including environmental and energy legislation affecting Pago Pago port and Pacific supply chain operations.",
  jurisdictionIso: ["US-AS"],
  intelligenceTypes: ["legislation"],
  notes:
    "Tier 1 official American Samoa legislative portal. Authoritative for territorial statute text and bill status.",
  collisionUrlSubstring: "americansamoa.gov",
  stepKey: "as_fono",
});

// ─── Step 9: MP — BECQ ─────────────────────────────────────────────────
await insertSource({
  name: "CNMI Bureau of Environmental and Coastal Quality (BECQ)",
  url: "https://becq.cnmi.gov/",
  description:
    "Commonwealth of the Northern Mariana Islands' principal environmental regulator. Administers territorial environmental statutes, coastal zone management, and climate-related programs relevant to Saipan/Tinian/Rota port operations and Western Pacific freight transit.",
  jurisdictionIso: ["US-MP"],
  intelligenceTypes: ["regulation", "guidance"],
  notes:
    "Tier 1 official CNMI environmental regulator. Authoritative for BECQ rulemaking, coastal compliance, and territorial climate program documents.",
  collisionUrlSubstring: "becq.cnmi.gov",
  stepKey: "mp_becq",
});

// ─── Step 10: MP — CNMI Legislature ────────────────────────────────────
await insertSource({
  name: "Commonwealth of the Northern Mariana Islands Legislature",
  url: "https://www.cnmileg.gov.mp/",
  description:
    "CNMI's bicameral legislature. Authoritative source for territorial statutes, bills, and resolutions including environmental and energy legislation affecting CNMI port and Pacific supply chain operations.",
  jurisdictionIso: ["US-MP"],
  intelligenceTypes: ["legislation"],
  notes:
    "Tier 1 official CNMI legislative portal. Authoritative for territorial statute text and bill status.",
  collisionUrlSubstring: "cnmileg.gov.mp",
  stepKey: "mp_legislature",
});

// ─── Cap check: must be exactly 10 inserts ─────────────────────────────
step(
  "insert_count_cap",
  insertedIds.length === 10,
  `inserted ${insertedIds.length} rows (expected 10)`
);

// ─── Final DPNR re-verification ────────────────────────────────────────
{
  const { data: r } = await supabase
    .from("sources")
    .select("id, name, status, processing_paused, tier, jurisdiction_iso")
    .eq("id", DPNR_ID)
    .maybeSingle();
  const ok =
    r &&
    r.status === "suspended" &&
    r.processing_paused === true &&
    r.tier === 2 &&
    Array.isArray(r.jurisdiction_iso) &&
    r.jurisdiction_iso.includes("US-VI");
  step(
    "dpnr_post_state_check",
    ok,
    r
      ? `status=${r.status} processing_paused=${r.processing_paused} tier=${r.tier} jurisdiction_iso=${JSON.stringify(r.jurisdiction_iso)}`
      : "DPNR row not found"
  );
}

// ─── Final state snapshot per jurisdiction ─────────────────────────────
const finalSnapshot = {};
for (const j of ["US-DC", "US-PR", "US-VI", "US-GU", "US-AS", "US-MP"]) {
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
  `\n[OK] Tier 1 US DC + Territories writes complete. Log: docs/tier1-us-dc-territories-execute-log.json`
);
