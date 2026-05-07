/**
 * tier1-us-south-execute.mjs — Tier 1 Wave A writes for US South region
 * (AL, GA, FL, TN, KY, NC, SC, VA, WV) + TN nashville-building-energy-programs
 * retag.
 *
 * Cloned from pr-a2-execute.mjs and follows the PR-A1/A2 pattern: each
 * step has its own read-back verification check. Halts on any failure.
 * Idempotent (existence-checked inserts; conditional retag with read-back).
 *
 * Authorized scope per Tier 1 Wave A dispatch (2026-05-07):
 *
 * Per-state source inserts (state environmental body + state legislature
 * where missing) — 7 inserts expected:
 *   AL  | ADEM (Alabama Dept of Environmental Mgmt) + AL Legislature
 *   GA  | (none — 3 existing, complete)
 *   FL  | (none — 2 existing, complete)
 *   TN  | TN Legislature (env body already exists)
 *   KY  | KY Legislature (env body already exists)
 *   NC  | (none — 3 existing, complete)
 *   SC  | DHEC + SC Legislature
 *   VA  | VA Legislature (DEQ already exists; VDOT freight stays suspended)
 *   WV  | (none — 2 existing, complete)
 *
 * Item retags — 1:
 *   TN intelligence_items.legacy_id='nashville-building-energy-programs'
 *      jurisdiction_iso ['US'] -> ['US-TN']
 *
 * No source code edits, no migrations, no cross-region writes.
 *
 * Halt conditions:
 *   - Any URL collision at unexpected tier or admin_only=true
 *   - > 9 inserts attempted (hard cap; expected 7)
 *   - TN retag legacy_id not found (data drift)
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
const HARD_INSERT_CAP = 9;

function logEntry(name, ok, detail) {
  const line = `[${ok ? "OK" : "FAIL"}] ${name} — ${detail}`;
  console.log(line);
  log.push({ name, ok, detail, at: new Date().toISOString() });
}

function step(name, ok, detail) {
  logEntry(name, ok, detail);
  if (!ok) {
    writeFileSync(
      resolve("..", "docs", "tier1-us-south-execute-log.json"),
      JSON.stringify({ aborted_at: name, log }, null, 2),
      "utf8"
    );
    process.exit(1);
  }
}

/**
 * Insert-or-detect a state legislature / env body source row.
 *
 * Halts via step() on:
 *   - existing row at unexpected tier (anything other than 1) — surfaces
 *     for review before proceeding
 *   - existing row with admin_only=true — surfaces collision
 *   - cap exceeded
 *
 * Returns { id, inserted: boolean }.
 */
async function insertSourceIfMissing({ stepKey, name, url, urlMatchPatterns, jurisdictionIso, description, notes }) {
  // existence check (broader URL pattern match to catch any prior variant)
  const orClauses = urlMatchPatterns.map((p) => `url.ilike.${p}`).join(",");
  const { data: existingRows, error: existErr } = await supabase
    .from("sources")
    .select("id, tier, name, status, admin_only, url")
    .or(orClauses);
  if (existErr) {
    step(`${stepKey}_lookup`, false, existErr.message);
  }
  if (Array.isArray(existingRows) && existingRows.length > 0) {
    const hit = existingRows[0];
    if (hit.admin_only === true) {
      step(
        `${stepKey}_collision_admin_only`,
        false,
        `existing source admin_only=true id=${hit.id} url=${hit.url}; halting`
      );
    }
    if (hit.tier !== 1) {
      step(
        `${stepKey}_collision_unexpected_tier`,
        false,
        `existing source tier=${hit.tier} id=${hit.id} url=${hit.url}; halting`
      );
    }
    logEntry(
      `${stepKey}_already_exists`,
      true,
      `id=${hit.id} tier=${hit.tier} name=${hit.name}`
    );
    return { id: hit.id, inserted: false };
  }

  // pre-insert cap check
  if (insertCount >= HARD_INSERT_CAP) {
    step(
      `${stepKey}_cap_exceeded`,
      false,
      `attempted insert #${insertCount + 1} exceeds cap ${HARD_INSERT_CAP}`
    );
  }

  const { data: inserted, error: insertErr } = await supabase
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
      jurisdiction_iso: [jurisdictionIso],
      intelligence_types: ["legislation"],
      domains: [1],
      access_method: "scrape",
      update_frequency: "weekly",
      notes,
    })
    .select("id, tier, name")
    .maybeSingle();
  if (insertErr || !inserted) {
    step(`${stepKey}_insert`, false, insertErr?.message ?? "no row returned");
  }
  insertCount++;
  logEntry(
    `${stepKey}_insert`,
    true,
    `id=${inserted.id} tier=${inserted.tier} name=${inserted.name}`
  );
  return { id: inserted.id, inserted: true };
}

async function verifySource(stepKey, id, expectedIso) {
  const { data: r } = await supabase
    .from("sources")
    .select("id, tier, jurisdiction_iso, status, admin_only, name")
    .eq("id", id)
    .maybeSingle();
  const ok =
    r &&
    r.tier === 1 &&
    r.status === "active" &&
    r.admin_only === false &&
    Array.isArray(r.jurisdiction_iso) &&
    r.jurisdiction_iso.includes(expectedIso);
  step(
    `${stepKey}_verify`,
    ok,
    `tier=${r?.tier} status=${r?.status} admin_only=${r?.admin_only} jurisdiction_iso=${JSON.stringify(r?.jurisdiction_iso)} name=${r?.name}`
  );
}

// ──────────────────────────────────────────────────────────────────────
// AL — ADEM (state env body) + AL Legislature
// ──────────────────────────────────────────────────────────────────────
const al_adem = await insertSourceIfMissing({
  stepKey: "al_adem",
  name: "Alabama Department of Environmental Management (ADEM)",
  url: "https://www.adem.alabama.gov/",
  urlMatchPatterns: ["%adem.alabama.gov%"],
  jurisdictionIso: "US-AL",
  description:
    "Alabama's state environmental regulator. Authoritative for Alabama air, water, land, and waste regulations affecting freight terminals, drayage, port operations (Mobile), and industrial facilities. Parallel role to CARB (CA), NYSDEC (NY), Ecology (WA), TCEQ (TX) at tier 1.",
  notes:
    "Tier 1 state environmental regulator. Inserted as part of Tier 1 Wave A US South region buildout.",
});
await verifySource("al_adem", al_adem.id, "US-AL");

const al_leg = await insertSourceIfMissing({
  stepKey: "al_leg",
  name: "Alabama State Legislature",
  url: "https://www.legislature.state.al.us/",
  urlMatchPatterns: ["%legislature.state.al.us%", "%alison.legislature.state.al.us%"],
  jurisdictionIso: "US-AL",
  description:
    "Alabama State Legislature's official public access to bills, statutes, and the Alabama Code. Authoritative for state legislation affecting freight, ports (Mobile), industrial facilities, and corporate disclosure at the state level.",
  notes:
    "Tier 1 official state legislative portal. Parallels PR-A1's California Leginfo at tier 1.",
});
await verifySource("al_leg", al_leg.id, "US-AL");

// ──────────────────────────────────────────────────────────────────────
// TN — Legislature only (env body already exists per investigation)
// ──────────────────────────────────────────────────────────────────────
const tn_leg = await insertSourceIfMissing({
  stepKey: "tn_leg",
  name: "Tennessee General Assembly",
  url: "https://www.capitol.tn.gov/",
  urlMatchPatterns: ["%capitol.tn.gov%", "%legislature.state.tn.us%"],
  jurisdictionIso: "US-TN",
  description:
    "Tennessee General Assembly's official public access to bills, statutes, and the Tennessee Code Annotated. Authoritative for state legislation affecting freight, distribution centers (Memphis FedEx hub, Nashville logistics corridor), and corporate disclosure at the state level.",
  notes:
    "Tier 1 official state legislative portal. Parallels PR-A1's California Leginfo at tier 1.",
});
await verifySource("tn_leg", tn_leg.id, "US-TN");

// ──────────────────────────────────────────────────────────────────────
// KY — Legislature only (env body already exists per investigation)
// ──────────────────────────────────────────────────────────────────────
const ky_leg = await insertSourceIfMissing({
  stepKey: "ky_leg",
  name: "Kentucky General Assembly (Legislative Research Commission)",
  url: "https://legislature.ky.gov/",
  urlMatchPatterns: ["%legislature.ky.gov%", "%lrc.ky.gov%"],
  jurisdictionIso: "US-KY",
  description:
    "Kentucky General Assembly's official public access to bills, statutes, and the Kentucky Revised Statutes. Authoritative for state legislation affecting freight, the Louisville UPS Worldport hub, manufacturing, and corporate disclosure at the state level.",
  notes:
    "Tier 1 official state legislative portal. Parallels PR-A1's California Leginfo at tier 1.",
});
await verifySource("ky_leg", ky_leg.id, "US-KY");

// ──────────────────────────────────────────────────────────────────────
// SC — DHEC (state env body) + SC Legislature
// ──────────────────────────────────────────────────────────────────────
const sc_dhec = await insertSourceIfMissing({
  stepKey: "sc_dhec",
  name: "South Carolina Department of Health and Environmental Control (DHEC)",
  url: "https://scdhec.gov/",
  urlMatchPatterns: ["%scdhec.gov%"],
  jurisdictionIso: "US-SC",
  description:
    "South Carolina's state environmental regulator. Authoritative for SC air, water, land, and waste regulations affecting freight terminals, drayage, port operations (Charleston), and industrial facilities. Parallel role to CARB (CA), NYSDEC (NY), Ecology (WA), TCEQ (TX) at tier 1.",
  notes:
    "Tier 1 state environmental regulator. Inserted as part of Tier 1 Wave A US South region buildout.",
});
await verifySource("sc_dhec", sc_dhec.id, "US-SC");

const sc_leg = await insertSourceIfMissing({
  stepKey: "sc_leg",
  name: "South Carolina General Assembly (SC Statehouse)",
  url: "https://www.scstatehouse.gov/",
  urlMatchPatterns: ["%scstatehouse.gov%"],
  jurisdictionIso: "US-SC",
  description:
    "South Carolina General Assembly's official public access to bills, statutes, and the South Carolina Code of Laws. Authoritative for state legislation affecting freight, the Port of Charleston, manufacturing, and corporate disclosure at the state level.",
  notes:
    "Tier 1 official state legislative portal. Parallels PR-A1's California Leginfo at tier 1.",
});
await verifySource("sc_leg", sc_leg.id, "US-SC");

// ──────────────────────────────────────────────────────────────────────
// VA — Legislature only (DEQ already exists per investigation;
// VDOT freight page stays at status='suspended' — not touched here)
// ──────────────────────────────────────────────────────────────────────
const va_leg = await insertSourceIfMissing({
  stepKey: "va_leg",
  name: "Virginia Legislative Information System (LIS)",
  url: "https://lis.virginia.gov/",
  urlMatchPatterns: ["%lis.virginia.gov%"],
  jurisdictionIso: "US-VA",
  description:
    "Virginia's official Legislative Information System. Authoritative public access to bills, statutes, and the Code of Virginia for state legislation affecting freight, the Port of Virginia (Norfolk), Northern Virginia data center / logistics corridor, and corporate disclosure at the state level.",
  notes:
    "Tier 1 official state legislative portal. Parallels PR-A1's California Leginfo at tier 1.",
});
await verifySource("va_leg", va_leg.id, "US-VA");

// ──────────────────────────────────────────────────────────────────────
// TN retag: nashville-building-energy-programs jurisdiction_iso
//   ['US'] -> ['US-TN']
// ──────────────────────────────────────────────────────────────────────
{
  // pre-state read
  const { data: pre, error: preErr } = await supabase
    .from("intelligence_items")
    .select("legacy_id, jurisdiction_iso, source_id, title")
    .eq("legacy_id", "nashville-building-energy-programs")
    .maybeSingle();
  if (preErr) {
    step("tn_nashville_pre_read", false, preErr.message);
  }
  if (!pre) {
    step(
      "tn_nashville_pre_read",
      false,
      "row not found at legacy_id='nashville-building-energy-programs' — data drift, halting per dispatch"
    );
  }
  logEntry(
    "tn_nashville_pre_read",
    true,
    `pre jurisdiction_iso=${JSON.stringify(pre.jurisdiction_iso)} title=${pre.title}`
  );

  const { error: updErr } = await supabase
    .from("intelligence_items")
    .update({ jurisdiction_iso: ["US-TN"] })
    .eq("legacy_id", "nashville-building-energy-programs");
  step("tn_nashville_retag_update", !updErr, updErr?.message ?? "set ['US-TN']");

  const { data: post } = await supabase
    .from("intelligence_items")
    .select("legacy_id, jurisdiction_iso")
    .eq("legacy_id", "nashville-building-energy-programs")
    .maybeSingle();
  const ok =
    Array.isArray(post?.jurisdiction_iso) &&
    post.jurisdiction_iso.length === 1 &&
    post.jurisdiction_iso[0] === "US-TN";
  step(
    "tn_nashville_retag_verify",
    ok,
    `pre=${JSON.stringify(pre.jurisdiction_iso)} post=${JSON.stringify(post?.jurisdiction_iso)}`
  );
}

// ──────────────────────────────────────────────────────────────────────
// Final state snapshot — all 9 South states
// ──────────────────────────────────────────────────────────────────────
{
  const { data: southSources } = await supabase
    .from("sources")
    .select("id, name, tier, jurisdiction_iso, status, admin_only, url")
    .or(
      "jurisdiction_iso.cs.{US-AL}," +
      "jurisdiction_iso.cs.{US-GA}," +
      "jurisdiction_iso.cs.{US-FL}," +
      "jurisdiction_iso.cs.{US-TN}," +
      "jurisdiction_iso.cs.{US-KY}," +
      "jurisdiction_iso.cs.{US-NC}," +
      "jurisdiction_iso.cs.{US-SC}," +
      "jurisdiction_iso.cs.{US-VA}," +
      "jurisdiction_iso.cs.{US-WV}"
    )
    .order("jurisdiction_iso", { ascending: true });
  const { data: nashville } = await supabase
    .from("intelligence_items")
    .select("legacy_id, jurisdiction_iso, title")
    .eq("legacy_id", "nashville-building-energy-programs")
    .maybeSingle();

  console.log(
    "\nFinal US South state source snapshot:\n",
    JSON.stringify(
      {
        total_inserts_this_run: insertCount,
        sources: southSources,
        tn_nashville_retag: nashville,
      },
      null,
      2
    )
  );
}

writeFileSync(
  resolve("..", "docs", "tier1-us-south-execute-log.json"),
  JSON.stringify({ completed: true, total_inserts: insertCount, log }, null, 2),
  "utf8"
);
console.log(
  `\n[OK] Tier 1 US South writes complete. Inserts: ${insertCount}. Log: docs/tier1-us-south-execute-log.json`
);
