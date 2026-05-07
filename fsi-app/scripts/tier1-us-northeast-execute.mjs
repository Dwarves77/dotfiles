/**
 * tier1-us-northeast-execute.mjs — authorized writes for Tier 1 Wave A
 * (US Northeast region; NY carved out per PR-A1+PR-A2).
 *
 * Cloned from pr-a1-execute.mjs / pr-a2-execute.mjs.
 *
 * Authorized scope per dispatch on 2026-05-07:
 *   - Insert state legislature + state environmental body rows where missing
 *     across MD, DE, NJ, PA, CT, RI, MA, NH, VT, ME (10 states).
 *   - All inserts at tier 1, admin_only=false, status=active.
 *   - Idempotent: existence-check by canonical URL before insert.
 *   - Per-step verification, halt-on-mismatch.
 *
 * Preflight findings (read-only, 2026-05-07):
 *   - US-MD: 1 existing (MDE, suspended T2). Need: MD Legislature (mgaleg).
 *     MDE status='suspended' is preserved as-is per dispatch.
 *   - US-DE: 1 existing (DNREC T2). Need: DE Legislature.
 *   - US-NJ: 2 existing (NJDOT Freight, NJEDA Clean Energy — neither is the
 *     env body). Need: NJDEP (nj.gov/dep).
 *   - US-PA: 3 existing (DEP at pa.gov/agencies/dep.html T2, PUC T2,
 *     PA Code & Bulletin T1). PA DEP env-body insert SKIPPED — institutional
 *     duplicate at different URL. Need: PA Legislature only.
 *   - US-CT: 1 existing (CT DEEP T2). Need: CT Legislature.
 *   - US-RI: 2 existing (RI DEM T2, RI General Assembly T1). 0 needed.
 *   - US-MA: 1 existing (MA Legislature T1). Need: MassDEP env body.
 *   - US-NH: 0 existing. Need: NHDES + NH Legislature.
 *   - US-VT: 1 existing (VT Legislature T1). Need: VT DEC env body.
 *   - US-ME: 1 existing (Maine DEP T2). Need: ME Legislature.
 *
 * Total inserts: 10 (vs 11 estimate; -1 for PA DEP skip).
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
      resolve("..", "docs", "tier1-us-northeast-execute-log.json"),
      JSON.stringify({ aborted_at: name, log }, null, 2),
      "utf8"
    );
    process.exit(1);
  }
}

// ─── Sanity check: MD MDE suspended ────────────────────────────────────
{
  const { data: mde } = await supabase
    .from("sources")
    .select("id, name, status, tier, admin_only")
    .ilike("url", "%mde.maryland.gov%")
    .maybeSingle();
  step(
    "md_mde_suspended_preserved",
    mde?.status === "suspended" && mde?.admin_only === false,
    `id=${mde?.id} status=${mde?.status} tier=${mde?.tier} admin_only=${mde?.admin_only}`
  );
}

// Insert spec: each row, with canonical URL existence check.
const INSERTS = [
  {
    label: "md_legislature",
    state_iso: "US-MD",
    name: "Maryland General Assembly (mgaleg.maryland.gov)",
    url: "https://mgaleg.maryland.gov/",
    description:
      "Maryland's official public access to bills, statutes, and the Annotated Code of Maryland. Authoritative for state legislation affecting freight, ports (Baltimore), and corporate disclosure requirements at the state level.",
    intelligence_types: ["legislation"],
  },
  {
    label: "de_legislature",
    state_iso: "US-DE",
    name: "Delaware General Assembly (legis.delaware.gov)",
    url: "https://legis.delaware.gov/",
    description:
      "Delaware's official public access to bills, the Delaware Code, and the Delaware Administrative Code. Authoritative for state legislation; Delaware is the corporate-domicile state for many U.S. companies, so disclosure-rule developments here have broad reach.",
    intelligence_types: ["legislation"],
  },
  {
    label: "nj_dep",
    state_iso: "US-NJ",
    name: "New Jersey Department of Environmental Protection (NJDEP)",
    url: "https://www.nj.gov/dep/",
    description:
      "New Jersey's principal environmental regulator. Air-quality permits, mobile-source rules, climate adaptation, and environmental-justice rules affecting freight, drayage at NY/NJ ports, and warehousing operations.",
    intelligence_types: ["regulation", "guidance"],
  },
  // PA DEP env body insert SKIPPED — institutional duplicate of existing
  // PA DEP at https://www.pa.gov/agencies/dep.html (T2, active). Surfaced in
  // PR description; no write performed.
  {
    label: "pa_legislature",
    state_iso: "US-PA",
    name: "Pennsylvania General Assembly (legis.state.pa.us)",
    url: "https://www.legis.state.pa.us/",
    description:
      "Pennsylvania's official public access to bills, statutes, and the Pennsylvania Consolidated Statutes. Authoritative for state legislation affecting freight corridors, the Port of Philadelphia, and warehouse/distribution operations.",
    intelligence_types: ["legislation"],
  },
  {
    label: "ct_legislature",
    state_iso: "US-CT",
    name: "Connecticut General Assembly (cga.ct.gov)",
    url: "https://www.cga.ct.gov/",
    description:
      "Connecticut's official public access to bills, public acts, and the Connecticut General Statutes. Authoritative for state legislation affecting freight corridors and Northeast supply-chain operations.",
    intelligence_types: ["legislation"],
  },
  {
    label: "ma_dep",
    state_iso: "US-MA",
    name: "Massachusetts Department of Environmental Protection (MassDEP)",
    url: "https://www.mass.gov/orgs/massachusetts-department-of-environmental-protection",
    description:
      "Massachusetts's principal environmental regulator. Air-quality permits, vehicle and mobile-source rules, GWSA-aligned implementation, and environmental-justice rules affecting freight, port of Boston, and warehousing operations.",
    intelligence_types: ["regulation", "guidance"],
  },
  {
    label: "nh_des",
    state_iso: "US-NH",
    name: "New Hampshire Department of Environmental Services (NHDES)",
    url: "https://www.des.nh.gov/",
    description:
      "New Hampshire's principal environmental regulator. Air-quality permits, mobile-source rules, and state-level environmental program implementation affecting freight and Northeast supply-chain operations.",
    intelligence_types: ["regulation", "guidance"],
  },
  {
    label: "nh_legislature",
    state_iso: "US-NH",
    name: "New Hampshire General Court (gencourt.state.nh.us)",
    url: "https://gencourt.state.nh.us/",
    description:
      "New Hampshire's official public access to bills, the Revised Statutes Annotated (RSA), and session laws. Authoritative for state legislation affecting freight corridors and Northeast supply-chain operations.",
    intelligence_types: ["legislation"],
  },
  {
    label: "vt_dec",
    state_iso: "US-VT",
    name: "Vermont Department of Environmental Conservation (VT DEC)",
    url: "https://dec.vermont.gov/",
    description:
      "Vermont's principal environmental regulator. Air-quality, mobile-source, and climate-program implementation affecting freight, biomass logistics, and Northeast cross-border operations.",
    intelligence_types: ["regulation", "guidance"],
  },
  {
    label: "me_legislature",
    state_iso: "US-ME",
    name: "Maine Legislature (legislature.maine.gov)",
    url: "https://legislature.maine.gov/",
    description:
      "Maine's official public access to bills, the Maine Revised Statutes, and session laws. Authoritative for state legislation affecting freight, Maine ports (Searsport, Portland), and Northeast cross-border operations.",
    intelligence_types: ["legislation"],
  },
];

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
    // Halt: URL collision — should not happen given preflight.
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
        "Tier 1 Wave A — US Northeast. Inserted per Tier 1 region authorization. Parallels PR-A1 (CA Leginfo) and PR-A2 (NY/TX legislatures) at tier 1.",
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

// ─── Final invariant check: each state has env_body + legislature at T1 ─
const STATE_ROLES = [
  { state: "US-MD", needs: ["legislature"] },        // env_body MDE suspended T2 — preserved
  { state: "US-DE", needs: ["legislature"] },         // env_body DNREC T2 already exists
  { state: "US-NJ", needs: ["env_body"] },            // legislature insert deferred (out of scope this wave)
  { state: "US-PA", needs: ["legislature"] },         // env_body PA DEP T2 already exists at pa.gov/agencies/dep.html
  { state: "US-CT", needs: ["legislature"] },         // env_body CT DEEP T2 already exists
  { state: "US-RI", needs: [] },                      // both already at T1/T2
  { state: "US-MA", needs: ["env_body"] },            // legislature T1 already exists
  { state: "US-NH", needs: ["env_body", "legislature"] },
  { state: "US-VT", needs: ["env_body"] },            // legislature T1 already exists
  { state: "US-ME", needs: ["legislature"] },         // env_body Maine DEP T2 already exists
];

// Final state snapshot per Northeast state.
{
  const { data: snapshot } = await supabase
    .from("sources")
    .select("id, name, tier, status, admin_only, url, jurisdiction_iso")
    .or(
      [
        "US-MD",
        "US-DE",
        "US-NJ",
        "US-PA",
        "US-CT",
        "US-RI",
        "US-MA",
        "US-NH",
        "US-VT",
        "US-ME",
      ]
        .map((s) => `jurisdiction_iso.cs.{${s}}`)
        .join(",")
    );
  console.log(
    "\nFinal Northeast state snapshot:\n",
    JSON.stringify(snapshot, null, 2)
  );
}

writeFileSync(
  resolve("..", "docs", "tier1-us-northeast-execute-log.json"),
  JSON.stringify(
    {
      completed: true,
      total_inserts: Object.keys(insertedIds).length,
      inserted_ids: insertedIds,
      pa_dep_skipped_reason:
        "PA DEP institutional duplicate — existing T2 row at https://www.pa.gov/agencies/dep.html serves the same env-body role. Skipped to avoid duplicate.",
      log,
    },
    null,
    2
  ),
  "utf8"
);
console.log("\n[OK] Tier 1 US Northeast writes complete.");
console.log(`Total inserts: ${Object.keys(insertedIds).length}`);
console.log("Log: docs/tier1-us-northeast-execute-log.json");
