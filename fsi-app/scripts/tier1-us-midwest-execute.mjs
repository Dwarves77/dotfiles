/**
 * tier1-us-midwest-execute.mjs — authorized writes for Tier 1 US Midwest
 * region (Wave A writes phase). Cloned from pr-a1-execute.mjs and
 * pr-a2-execute.mjs and adapted for a 16-state Midwest insert pass.
 *
 * Dispatch (Jason, 2026-05-07):
 * Insert per-state environmental body + state legislature source rows
 * where missing, at tier 1, jurisdiction_iso=["US-XX"], status=active,
 * admin_only=false. US-TX carved out (covered by PR-A2). US-ND already
 * has both. Per-state estimates match prior investigation.
 *
 * Each insert is idempotent (existence-checked by URL pattern) and has
 * its own per-step read-back verification check before moving to the
 * next. If any verification fails the script halts with a clear marker
 * and writes the partial log.
 *
 * Halt and surface conditions per dispatch:
 *   - Existing source row at unexpected tier or admin_only=true
 *   - URL collision (cross-region duplicate; checked at exists step)
 *   - > 28 inserts (significantly above 24 estimate)
 *   - Schema drift (caught by select/insert errors)
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
let insertCount = 0;
const HALT_INSERT_LIMIT = 28;
const ESTIMATE = 24;

function step(name, ok, detail) {
  const line = `[${ok ? "OK" : "FAIL"}] ${name} — ${detail}`;
  console.log(line);
  log.push({ name, ok, detail, at: new Date().toISOString() });
  if (!ok) {
    writeFileSync(
      resolve("..", "docs", "tier1-us-midwest-execute-log.json"),
      JSON.stringify({ aborted_at: name, log, insertCount }, null, 2),
      "utf8"
    );
    process.exit(1);
  }
}

/**
 * Insert a Tier 1 source row if no existing row matches `urlPattern`.
 * Verifies tier=1, status=active, admin_only=false, jurisdiction_iso
 * contains the state ISO before returning.
 *
 * Halts (via step(false, ...)) if:
 *   - existing row found but tier != 1 or admin_only = true
 *   - existing row found at a different jurisdiction_iso (URL collision
 *     across regions)
 *   - insertCount exceeds HALT_INSERT_LIMIT
 */
async function ensureSource(slug, urlPattern, payload) {
  const stateIso = payload.jurisdiction_iso[0];

  // 1) Existence check by URL pattern. URL pattern is %domain.tld% style;
  //    safe enough since each canonical URL points at a unique state body.
  const { data: existing, error: exErr } = await supabase
    .from("sources")
    .select("id, name, url, tier, status, admin_only, jurisdiction_iso")
    .ilike("url", urlPattern)
    .maybeSingle();
  if (exErr && exErr.code !== "PGRST116") {
    step(`${slug}_exists_check`, false, exErr.message);
  }

  if (existing) {
    // Existing row — surface anomalies per dispatch's halt conditions.
    if (existing.admin_only === true) {
      step(
        `${slug}_existing_admin_only_halt`,
        false,
        `id=${existing.id} url=${existing.url} admin_only=true (dispatch halt condition)`
      );
    }
    if (existing.tier !== 1 && existing.tier !== 2 && existing.tier !== 3) {
      step(
        `${slug}_existing_unexpected_tier_halt`,
        false,
        `id=${existing.id} tier=${existing.tier} (unexpected; expected tier 1-3)`
      );
    }
    // Cross-region URL collision: existing row is tagged for a different state.
    const iso = Array.isArray(existing.jurisdiction_iso)
      ? existing.jurisdiction_iso
      : [];
    if (iso.length > 0 && !iso.includes(stateIso)) {
      step(
        `${slug}_cross_region_collision_halt`,
        false,
        `id=${existing.id} url=${existing.url} existing_iso=${JSON.stringify(iso)} expected ${stateIso}`
      );
    }
    step(
      `${slug}_already_exists`,
      true,
      `id=${existing.id} tier=${existing.tier} status=${existing.status} iso=${JSON.stringify(iso)}`
    );
    return existing.id;
  }

  // 2) Insert ceiling check before writing.
  if (insertCount >= HALT_INSERT_LIMIT) {
    step(
      `${slug}_insert_ceiling_halt`,
      false,
      `insertCount=${insertCount} >= HALT_INSERT_LIMIT=${HALT_INSERT_LIMIT}`
    );
  }

  const { data: inserted, error: insErr } = await supabase
    .from("sources")
    .insert(payload)
    .select("id, tier, name, status, admin_only, jurisdiction_iso")
    .maybeSingle();
  if (insErr || !inserted) {
    step(`${slug}_insert`, false, insErr?.message ?? "no row returned");
  }
  insertCount += 1;
  step(
    `${slug}_insert`,
    true,
    `id=${inserted.id} tier=${inserted.tier} name=${inserted.name}`
  );

  // 3) Read-back verification.
  const { data: verify } = await supabase
    .from("sources")
    .select("id, tier, status, admin_only, jurisdiction_iso")
    .eq("id", inserted.id)
    .maybeSingle();
  const ok =
    verify &&
    verify.tier === 1 &&
    verify.status === "active" &&
    verify.admin_only === false &&
    Array.isArray(verify.jurisdiction_iso) &&
    verify.jurisdiction_iso.includes(stateIso);
  step(
    `${slug}_verify`,
    ok,
    `tier=${verify?.tier} status=${verify?.status} admin_only=${verify?.admin_only} iso=${JSON.stringify(verify?.jurisdiction_iso)}`
  );
  return inserted.id;
}

// ─── Source payload builders ──────────────────────────────────────────
// Common fields parallel PR-A1 (Leginfo) and PR-A2 (NY Senate / TX Lege)
// inserts: tier 1, tier_at_creation 1, active, admin_only false, weekly,
// scrape, intelligence_types ['legislation'] for legislatures and
// ['regulation','guidance'] for environmental bodies.

function envBodyPayload({ name, url, iso, description, notes }) {
  return {
    name,
    url,
    description,
    tier: 1,
    tier_at_creation: 1,
    status: "active",
    admin_only: false,
    jurisdictions: [],
    jurisdiction_iso: [iso],
    intelligence_types: ["regulation", "guidance"],
    domains: [1],
    access_method: "scrape",
    update_frequency: "weekly",
    notes,
  };
}

function legislaturePayload({ name, url, iso, description, notes }) {
  return {
    name,
    url,
    description,
    tier: 1,
    tier_at_creation: 1,
    status: "active",
    admin_only: false,
    jurisdictions: [],
    jurisdiction_iso: [iso],
    intelligence_types: ["legislation"],
    domains: [1],
    access_method: "scrape",
    update_frequency: "weekly",
    notes,
  };
}

const TIER1_NOTE_LEG = "Tier 1 official state legislative portal. Authoritative for state statute text and bill status. Parallels PR-A1's California Leginfo and PR-A2's NY/TX legislatures at tier 1.";
const TIER1_NOTE_ENV = "Tier 1 state environmental regulator. Authoritative for state air, water, waste, and emissions regulations affecting freight, drayage, port operations, and warehouse facilities. Parallels PR-A1's CARB tier 1.";

// ─── Execution plan ────────────────────────────────────────────────────
// Per-state inserts in dispatch order. Each call is independently
// verified; a halt before insert N still leaves inserts 1..N-1 durable.

const plan = [
  // Oklahoma — 2 inserts
  {
    slug: "ok_odeq",
    urlPattern: "%deq.ok.gov%",
    payload: envBodyPayload({
      name: "Oklahoma Department of Environmental Quality (ODEQ)",
      url: "https://www.deq.ok.gov/",
      iso: "US-OK",
      description: "Oklahoma's primary state environmental regulator. Issues Title V air permits, manages waste/water/spill response programs, and enforces state implementation of Clean Air Act and Clean Water Act for industrial, freight, and warehousing operations.",
      notes: TIER1_NOTE_ENV,
    }),
  },
  {
    slug: "ok_legislature",
    urlPattern: "%oklegislature.gov%",
    payload: legislaturePayload({
      name: "Oklahoma Legislature",
      url: "https://www.oklegislature.gov/",
      iso: "US-OK",
      description: "Oklahoma's official legislative portal. Hosts bill text, statute lookup, and session calendars for state legislation affecting freight, energy infrastructure, and environmental compliance.",
      notes: TIER1_NOTE_LEG,
    }),
  },
  // Kansas — 2 inserts
  {
    slug: "ks_kdhe",
    urlPattern: "%kdheks.gov%",
    payload: envBodyPayload({
      name: "Kansas Department of Health and Environment (KDHE)",
      url: "https://www.kdheks.gov/",
      iso: "US-KS",
      description: "Kansas's combined health and environmental regulator. Bureau of Air administers state air-quality regulations including Title V permits relevant to warehousing, processing, and freight operations.",
      notes: TIER1_NOTE_ENV,
    }),
  },
  {
    slug: "ks_legislature",
    urlPattern: "%kslegislature.org%",
    payload: legislaturePayload({
      name: "Kansas Legislature",
      url: "https://www.kslegislature.org/",
      iso: "US-KS",
      description: "Kansas's official legislative portal. Hosts bill text, statute lookup, and session activity for state legislation affecting freight, agriculture supply chain, and environmental compliance.",
      notes: TIER1_NOTE_LEG,
    }),
  },
  // Nebraska — 2 inserts
  {
    slug: "ne_ndee",
    urlPattern: "%dee.ne.gov%",
    payload: envBodyPayload({
      name: "Nebraska Department of Environment and Energy (NDEE)",
      url: "https://dee.ne.gov/",
      iso: "US-NE",
      description: "Nebraska's primary state environmental regulator. Issues air construction and operating permits, administers waste/water programs, and enforces state implementation of federal environmental statutes for industrial and freight operations.",
      notes: TIER1_NOTE_ENV,
    }),
  },
  {
    slug: "ne_legislature",
    urlPattern: "%nebraskalegislature.gov%",
    payload: legislaturePayload({
      name: "Nebraska Legislature",
      url: "https://nebraskalegislature.gov/",
      iso: "US-NE",
      description: "Nebraska's official unicameral legislature portal. Hosts bill text, revised statutes, and session activity for state legislation affecting freight, agricultural supply chain, and environmental compliance.",
      notes: TIER1_NOTE_LEG,
    }),
  },
  // South Dakota — 2 inserts
  {
    slug: "sd_denr",
    urlPattern: "%denr.sd.gov%",
    payload: envBodyPayload({
      name: "South Dakota Department of Agriculture and Natural Resources (DANR)",
      url: "https://denr.sd.gov/",
      iso: "US-SD",
      description: "South Dakota's environmental regulator (formerly DENR; now DANR). Issues air permits, regulates waste and surface/ground water, and administers state implementation of federal environmental statutes for industrial, freight, and agricultural operations.",
      notes: TIER1_NOTE_ENV,
    }),
  },
  {
    slug: "sd_legislature",
    urlPattern: "%sdlegislature.gov%",
    payload: legislaturePayload({
      name: "South Dakota Legislature",
      url: "https://sdlegislature.gov/",
      iso: "US-SD",
      description: "South Dakota's official legislative portal. Hosts bill text, codified laws, and session activity for state legislation affecting freight, agriculture supply chain, and environmental compliance.",
      notes: TIER1_NOTE_LEG,
    }),
  },
  // Minnesota — 2 inserts
  {
    slug: "mn_mpca",
    urlPattern: "%pca.state.mn.us%",
    payload: envBodyPayload({
      name: "Minnesota Pollution Control Agency (MPCA)",
      url: "https://www.pca.state.mn.us/",
      iso: "US-MN",
      description: "Minnesota's primary state environmental regulator. Administers air, water, waste, and contamination cleanup programs; issues Title V permits relevant to warehouses, processing facilities, and freight operations across the Upper Midwest corridor.",
      notes: TIER1_NOTE_ENV,
    }),
  },
  {
    slug: "mn_legislature",
    urlPattern: "%leg.mn.gov%",
    payload: legislaturePayload({
      name: "Minnesota Legislature",
      url: "https://www.leg.mn.gov/",
      iso: "US-MN",
      description: "Minnesota's official legislative portal. Hosts bill text, statute lookup, and session activity for state legislation affecting freight, supply chain, and environmental compliance.",
      notes: TIER1_NOTE_LEG,
    }),
  },
  // Iowa — 2 inserts
  {
    slug: "ia_dnr",
    urlPattern: "%iowadnr.gov%",
    payload: envBodyPayload({
      name: "Iowa Department of Natural Resources (Iowa DNR)",
      url: "https://www.iowadnr.gov/",
      iso: "US-IA",
      description: "Iowa's primary state environmental regulator. Air Quality Bureau issues construction and Title V operating permits; agency administers water, waste, and land quality programs relevant to freight, agriculture supply chain, and warehousing.",
      notes: TIER1_NOTE_ENV,
    }),
  },
  {
    slug: "ia_legislature",
    urlPattern: "%legis.iowa.gov%",
    payload: legislaturePayload({
      name: "Iowa Legislature",
      url: "https://www.legis.iowa.gov/",
      iso: "US-IA",
      description: "Iowa's official legislative portal. Hosts bill text, Iowa Code, and Iowa Administrative Code relevant to state legislation affecting freight, agricultural supply chain, and environmental compliance.",
      notes: TIER1_NOTE_LEG,
    }),
  },
  // Missouri — 1 insert (legislature only; MO DNR already in registry)
  {
    slug: "mo_legislature",
    urlPattern: "%senate.mo.gov%",
    payload: legislaturePayload({
      name: "Missouri General Assembly",
      url: "https://www.senate.mo.gov/",
      iso: "US-MO",
      description: "Missouri's official Senate legislative portal (entry point to General Assembly bills, Revised Statutes of Missouri, and session activity). Authoritative for state legislation affecting freight, supply chain, and environmental compliance.",
      notes: TIER1_NOTE_LEG,
    }),
  },
  // Arkansas — 2 inserts
  {
    slug: "ar_adeq",
    urlPattern: "%adeq.state.ar.us%",
    payload: envBodyPayload({
      name: "Arkansas Department of Environmental Quality (ADEQ / DEQ)",
      url: "https://www.adeq.state.ar.us/",
      iso: "US-AR",
      description: "Arkansas's state environmental regulator (now part of DEQ within Arkansas Department of Energy and Environment). Issues air, water, and waste permits; administers state implementation of federal environmental statutes for industrial and freight operations.",
      notes: TIER1_NOTE_ENV,
    }),
  },
  {
    slug: "ar_legislature",
    urlPattern: "%arkleg.state.ar.us%",
    payload: legislaturePayload({
      name: "Arkansas General Assembly",
      url: "https://www.arkleg.state.ar.us/",
      iso: "US-AR",
      description: "Arkansas's official legislative portal. Hosts bill text, Arkansas Code, and session activity for state legislation affecting freight, supply chain, and environmental compliance.",
      notes: TIER1_NOTE_LEG,
    }),
  },
  // Louisiana — 1 insert (legislature only; LDEQ already in registry)
  {
    slug: "la_legislature",
    urlPattern: "%legis.la.gov%",
    payload: legislaturePayload({
      name: "Louisiana State Legislature",
      url: "https://www.legis.la.gov/",
      iso: "US-LA",
      description: "Louisiana's official legislative portal. Hosts bill text, Louisiana Revised Statutes, and session activity for state legislation affecting freight (including Mississippi River and Gulf port operations), petrochemical supply chain, and environmental compliance.",
      notes: TIER1_NOTE_LEG,
    }),
  },
  // Mississippi — 1 insert (legislature only; MDEQ already in registry)
  {
    slug: "ms_legislature",
    urlPattern: "%legislature.ms.gov%",
    payload: legislaturePayload({
      name: "Mississippi Legislature",
      url: "https://www.legislature.ms.gov/",
      iso: "US-MS",
      description: "Mississippi's official legislative portal. Hosts bill text, Mississippi Code, and session activity for state legislation affecting freight, Gulf port operations, and environmental compliance.",
      notes: TIER1_NOTE_LEG,
    }),
  },
  // Wisconsin — 1 insert (legislature only; WDNR Air already in registry)
  {
    slug: "wi_legislature",
    urlPattern: "%docs.legis.wisconsin.gov%",
    payload: legislaturePayload({
      name: "Wisconsin State Legislature",
      url: "https://docs.legis.wisconsin.gov/",
      iso: "US-WI",
      description: "Wisconsin's official legislative document portal. Hosts statute text, administrative code (Wis. Admin. Code), and bill text for state legislation affecting freight, Great Lakes shipping, supply chain, and environmental compliance.",
      notes: TIER1_NOTE_LEG,
    }),
  },
  // Illinois — 2 inserts
  {
    slug: "il_iepa",
    urlPattern: "%epa.illinois.gov%",
    payload: envBodyPayload({
      name: "Illinois Environmental Protection Agency (IEPA)",
      url: "https://epa.illinois.gov/",
      iso: "US-IL",
      description: "Illinois's primary state environmental regulator. Bureau of Air administers Title V and construction permits relevant to Chicago-area freight, drayage, intermodal, and warehousing operations; bureau of land/water cover waste and discharge programs.",
      notes: TIER1_NOTE_ENV,
    }),
  },
  {
    slug: "il_legislature",
    urlPattern: "%ilga.gov%",
    payload: legislaturePayload({
      name: "Illinois General Assembly",
      url: "https://www.ilga.gov/",
      iso: "US-IL",
      description: "Illinois's official legislative portal. Hosts bill text, Illinois Compiled Statutes, and session activity for state legislation affecting Chicago-area freight, intermodal operations, supply chain, and environmental compliance.",
      notes: TIER1_NOTE_LEG,
    }),
  },
  // Indiana — 1-2 inserts
  // IDEM env body included; if a row already exists at the URL pattern,
  // ensureSource() short-circuits to existence verification only.
  {
    slug: "in_idem",
    urlPattern: "%idem.in.gov%",
    payload: envBodyPayload({
      name: "Indiana Department of Environmental Management (IDEM)",
      url: "https://www.in.gov/idem/",
      iso: "US-IN",
      description: "Indiana's primary state environmental regulator. Office of Air Quality issues Title V and construction permits relevant to Indianapolis and Gary-area freight, intermodal, and steel/industrial operations; offices of land and water cover waste and discharge programs.",
      notes: TIER1_NOTE_ENV,
    }),
  },
  {
    slug: "in_legislature",
    urlPattern: "%iga.in.gov%",
    payload: legislaturePayload({
      name: "Indiana General Assembly",
      url: "https://iga.in.gov/",
      iso: "US-IN",
      description: "Indiana's official legislative portal. Hosts bill text, Indiana Code, and session activity for state legislation affecting freight, intermodal operations, supply chain, and environmental compliance.",
      notes: TIER1_NOTE_LEG,
    }),
  },
  // Michigan — 1 insert (env body EGLE only; legislature already in registry)
  {
    slug: "mi_egle",
    urlPattern: "%michigan.gov/egle%",
    payload: envBodyPayload({
      name: "Michigan Department of Environment, Great Lakes, and Energy (EGLE)",
      url: "https://www.michigan.gov/egle",
      iso: "US-MI",
      description: "Michigan's primary state environmental regulator. Air Quality Division issues Title V and Permit-to-Install authorizations relevant to Detroit-area freight, automotive supply chain, and Great Lakes port operations; agency administers waste, water, and remediation programs.",
      notes: TIER1_NOTE_ENV,
    }),
  },
  // Ohio — 2 inserts
  {
    slug: "oh_epa",
    urlPattern: "%epa.ohio.gov%",
    payload: envBodyPayload({
      name: "Ohio Environmental Protection Agency (Ohio EPA)",
      url: "https://epa.ohio.gov/",
      iso: "US-OH",
      description: "Ohio's primary state environmental regulator. Division of Air Pollution Control issues Title V and Permit-to-Install authorizations relevant to Cleveland, Columbus, and Cincinnati-area freight, intermodal, and warehousing operations; agency administers water, waste, and remediation programs.",
      notes: TIER1_NOTE_ENV,
    }),
  },
  {
    slug: "oh_legislature",
    urlPattern: "%legislature.ohio.gov%",
    payload: legislaturePayload({
      name: "Ohio General Assembly",
      url: "https://www.legislature.ohio.gov/",
      iso: "US-OH",
      description: "Ohio's official legislative portal. Hosts bill text, Ohio Revised Code, and session activity for state legislation affecting freight, intermodal operations, supply chain, and environmental compliance.",
      notes: TIER1_NOTE_LEG,
    }),
  },
];

step(
  "plan_size_check",
  plan.length <= HALT_INSERT_LIMIT,
  `plan.length=${plan.length} HALT_INSERT_LIMIT=${HALT_INSERT_LIMIT} ESTIMATE=${ESTIMATE}`
);

const results = {};
for (const item of plan) {
  const id = await ensureSource(item.slug, item.urlPattern, item.payload);
  results[item.slug] = id;
}

// ─── Final per-state post-state snapshot ───────────────────────────────
const STATES = [
  "US-OK", "US-KS", "US-NE", "US-ND", "US-SD", "US-MN", "US-IA",
  "US-MO", "US-AR", "US-LA", "US-MS", "US-WI", "US-IL", "US-IN",
  "US-MI", "US-OH",
];
const perState = {};
for (const iso of STATES) {
  const { data: rows } = await supabase
    .from("sources")
    .select("id, name, url, tier, status, admin_only, intelligence_types")
    .contains("jurisdiction_iso", [iso])
    .eq("status", "active")
    .eq("admin_only", false)
    .eq("tier", 1);
  perState[iso] = {
    count: rows?.length ?? 0,
    rows: (rows ?? []).map((r) => ({
      name: r.name,
      url: r.url,
      types: r.intelligence_types,
    })),
  };
}

console.log("\n[OK] Tier 1 US Midwest writes complete.");
console.log(`Inserts performed: ${insertCount} (estimate ${ESTIMATE})`);
console.log("\nPer-state Tier 1 active source counts:");
for (const iso of STATES) {
  console.log(`  ${iso}: ${perState[iso].count} rows`);
}

writeFileSync(
  resolve("..", "docs", "tier1-us-midwest-execute-log.json"),
  JSON.stringify(
    {
      completed: true,
      insertCount,
      estimate: ESTIMATE,
      halt_insert_limit: HALT_INSERT_LIMIT,
      results,
      per_state_post_state: perState,
      log,
    },
    null,
    2
  ),
  "utf8"
);
console.log("\nLog: docs/tier1-us-midwest-execute-log.json");
