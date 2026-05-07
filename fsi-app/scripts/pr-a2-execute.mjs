/**
 * pr-a2-execute.mjs — authorized writes for PR-A2 (Tier 1 US states
 * batch: NY + WA + TX). Cloned from pr-a1-execute.mjs.
 *
 * Authorized scope per investigation findings on 2026-05-07:
 *
 * The investigation surfaced that the dispatch's premises were largely
 * wrong, exactly as PR-A1 did. Findings:
 *   - NYSDEC, WA Ecology, TCEQ all already exist (at tier 2)
 *   - WA legislature (WSR/WAC) already exists at tier 1
 *   - 0 retag candidates across NY/WA/TX after full title+summary+
 *     full_brief content scan of 184 active items
 *
 * Authorized writes (matching PR-A1's CARB tier 1 + Leginfo tier 1
 * pattern):
 *   (a) NYSDEC tier 2 -> 1 (state DEC, parallels CARB)
 *   (b) WA Ecology tier 2 -> 1 (state DEC, parallels CARB)
 *   (c) TCEQ tier 2 -> 1 (state DEC, parallels CARB)
 *   (d) Insert NY State Senate / Assembly Legislative Information
 *       at tier 1 (parallels PR-A1's Leginfo insert)
 *   (e) Insert Texas Legislature Online at tier 1 (parallels Leginfo)
 *   (f) No item retags (0 genuine candidates exist)
 *   (g) Nothing else
 *
 * WA needs no source inserts — both state DEC (Ecology) and state
 * legislature (WSR/WAC) already exist; only WA Ecology tier bump.
 *
 * Each step has its own read-back verification check before moving on.
 * Idempotent where possible (existence-checked inserts; conditional
 * tier updates).
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
      resolve("..", "docs", "pr-a2-execute-log.json"),
      JSON.stringify({ aborted_at: name, log }, null, 2),
      "utf8"
    );
    process.exit(1);
  }
}

// IDs from investigation
const NYSDEC_ID = "8ea87818-aec3-4402-8df1-3a67f9903e69";
const WA_ECOLOGY_ID = "d57b213b-01d7-443b-817d-9f03943aa3a9";
const TCEQ_ID = "be57a794-e82a-4c91-b182-6a1ad1cccab2";

// ─── Step 1: NYSDEC tier 2 -> 1 ────────────────────────────────────────
{
  const { error: e } = await supabase
    .from("sources")
    .update({ tier: 1 })
    .eq("id", NYSDEC_ID);
  step("nysdec_tier_update", !e, e?.message ?? "tier set to 1");
}
{
  const { data: r } = await supabase
    .from("sources")
    .select("id, tier, name, status")
    .eq("id", NYSDEC_ID)
    .maybeSingle();
  step(
    "nysdec_tier_verify",
    r?.tier === 1 && r?.status === "active",
    `tier=${r?.tier} status=${r?.status} name=${r?.name}`
  );
}

// ─── Step 2: WA Ecology tier 2 -> 1 ────────────────────────────────────
{
  const { error: e } = await supabase
    .from("sources")
    .update({ tier: 1 })
    .eq("id", WA_ECOLOGY_ID);
  step("wa_ecology_tier_update", !e, e?.message ?? "tier set to 1");
}
{
  const { data: r } = await supabase
    .from("sources")
    .select("id, tier, name, status")
    .eq("id", WA_ECOLOGY_ID)
    .maybeSingle();
  step(
    "wa_ecology_tier_verify",
    r?.tier === 1 && r?.status === "active",
    `tier=${r?.tier} status=${r?.status} name=${r?.name}`
  );
}

// ─── Step 3: TCEQ tier 2 -> 1 ──────────────────────────────────────────
{
  const { error: e } = await supabase
    .from("sources")
    .update({ tier: 1 })
    .eq("id", TCEQ_ID);
  step("tceq_tier_update", !e, e?.message ?? "tier set to 1");
}
{
  const { data: r } = await supabase
    .from("sources")
    .select("id, tier, name, status")
    .eq("id", TCEQ_ID)
    .maybeSingle();
  step(
    "tceq_tier_verify",
    r?.tier === 1 && r?.status === "active",
    `tier=${r?.tier} status=${r?.status} name=${r?.name}`
  );
}

// ─── Step 4: Insert NY State Legislature ───────────────────────────────
let nyLegId = null;
{
  const { data: existing } = await supabase
    .from("sources")
    .select("id, tier")
    .or("url.ilike.%nysenate.gov%,url.ilike.%assembly.state.ny.us%,url.ilike.%nyassembly.gov%")
    .maybeSingle();
  if (existing) {
    nyLegId = existing.id;
    step("ny_leg_already_exists", true, `id=${nyLegId} tier=${existing.tier}`);
  } else {
    const { data: inserted, error: e } = await supabase
      .from("sources")
      .insert({
        name: "New York State Senate / Assembly Legislative Information",
        url: "https://www.nysenate.gov/legislation",
        description:
          "New York State's official public access to legislation, bills, and statutes. Hosts NY State Climate Leadership and Community Protection Act (CLCPA), bills affecting freight, supply chain, and corporate climate disclosure at the state level.",
        tier: 1,
        tier_at_creation: 1,
        status: "active",
        admin_only: false,
        jurisdictions: [],
        jurisdiction_iso: ["US-NY"],
        intelligence_types: ["legislation"],
        domains: [1],
        access_method: "scrape",
        update_frequency: "weekly",
        notes:
          "Tier 1 official state legislative portal. Authoritative for New York State statute text and bill status. Parallels PR-A1's California Leginfo at tier 1.",
      })
      .select("id, tier, name")
      .maybeSingle();
    if (e || !inserted) {
      step("ny_leg_insert", false, e?.message ?? "no row returned");
    }
    nyLegId = inserted.id;
    step(
      "ny_leg_insert",
      true,
      `id=${nyLegId} tier=${inserted.tier} name=${inserted.name}`
    );
  }
}
{
  const { data: r } = await supabase
    .from("sources")
    .select("id, tier, jurisdiction_iso, status, admin_only")
    .eq("id", nyLegId)
    .maybeSingle();
  const ok =
    r &&
    r.tier === 1 &&
    r.status === "active" &&
    r.admin_only === false &&
    Array.isArray(r.jurisdiction_iso) &&
    r.jurisdiction_iso.includes("US-NY");
  step(
    "ny_leg_verify",
    ok,
    `tier=${r?.tier} status=${r?.status} jurisdiction_iso=${JSON.stringify(r?.jurisdiction_iso)}`
  );
}

// ─── Step 5: Insert Texas Legislature Online ───────────────────────────
let txLegId = null;
{
  const { data: existing } = await supabase
    .from("sources")
    .select("id, tier")
    .ilike("url", "%capitol.texas.gov%")
    .maybeSingle();
  if (existing) {
    txLegId = existing.id;
    step("tx_leg_already_exists", true, `id=${txLegId} tier=${existing.tier}`);
  } else {
    const { data: inserted, error: e } = await supabase
      .from("sources")
      .insert({
        name: "Texas Legislature Online",
        url: "https://capitol.texas.gov",
        description:
          "Texas Legislature's official public access to bills, statutes, and the Texas Administrative Code. Authoritative for Texas state legislation affecting freight, ports (Houston, Galveston), Gulf Coast operations, and corporate disclosure requirements at the state level.",
        tier: 1,
        tier_at_creation: 1,
        status: "active",
        admin_only: false,
        jurisdictions: [],
        jurisdiction_iso: ["US-TX"],
        intelligence_types: ["legislation"],
        domains: [1],
        access_method: "scrape",
        update_frequency: "weekly",
        notes:
          "Tier 1 official state legislative portal. Authoritative for Texas state statute text and bill status. Parallels PR-A1's California Leginfo at tier 1.",
      })
      .select("id, tier, name")
      .maybeSingle();
    if (e || !inserted) {
      step("tx_leg_insert", false, e?.message ?? "no row returned");
    }
    txLegId = inserted.id;
    step(
      "tx_leg_insert",
      true,
      `id=${txLegId} tier=${inserted.tier} name=${inserted.name}`
    );
  }
}
{
  const { data: r } = await supabase
    .from("sources")
    .select("id, tier, jurisdiction_iso, status, admin_only")
    .eq("id", txLegId)
    .maybeSingle();
  const ok =
    r &&
    r.tier === 1 &&
    r.status === "active" &&
    r.admin_only === false &&
    Array.isArray(r.jurisdiction_iso) &&
    r.jurisdiction_iso.includes("US-TX");
  step(
    "tx_leg_verify",
    ok,
    `tier=${r?.tier} status=${r?.status} jurisdiction_iso=${JSON.stringify(r?.jurisdiction_iso)}`
  );
}

// ─── Final state snapshot ──────────────────────────────────────────────
{
  const stateDecsAndLegs = await supabase
    .from("sources")
    .select("id, name, tier, jurisdiction_iso, status")
    .or(
      "url.ilike.%dec.ny.gov%," +
      "url.ilike.%nysenate.gov%," +
      "url.ilike.%ecology.wa.gov%," +
      "url.ilike.%leg.wa.gov%," +
      "url.ilike.%tceq.texas.gov%," +
      "url.ilike.%capitol.texas.gov%"
    );
  console.log(
    "\nFinal NY/WA/TX state source snapshot:\n",
    JSON.stringify(stateDecsAndLegs.data, null, 2)
  );
}

writeFileSync(
  resolve("..", "docs", "pr-a2-execute-log.json"),
  JSON.stringify({ completed: true, log }, null, 2),
  "utf8"
);
console.log("\n[OK] PR-A2 writes complete. Log: docs/pr-a2-execute-log.json");
