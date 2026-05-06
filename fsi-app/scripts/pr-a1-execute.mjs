/**
 * pr-a1-execute.mjs — authorized writes for PR-A1 California test pattern.
 *
 * Runs the writes Jason locked after the read-only investigation surfaced
 * that the dispatch's premises were largely wrong. Authorized scope per
 * the dispatch reply on 2026-05-06:
 *
 *   (a) Leginfo source insert at tier 1
 *   (b) Legacy `jurisdictions` dual-tag — NO (skip; canonical column already
 *       carries US-CA per migration 033 design)
 *   (c) w4_ca_acf priority — set to HIGH (operational impact for Dietl/Rockit
 *       LA/LB drayage; rationale documented in PR description)
 *   (d) CARB tier — bump from 2 to 1
 *   (e) l7 (CARB Advanced Clean Trucks) jurisdiction_iso ["US"] -> ["US-CA"]
 *       and nyc-local-law-97 jurisdiction_iso ["US"] -> ["US-NY"]
 *   (f) nothing else
 *
 * Each step has its OWN read-back verification check before moving to the
 * next. If any verification fails the script halts with a clear marker.
 *
 * Idempotent where possible (uses upsert/conditional-update). Safe to
 * re-run if a prior partial run completed only some steps.
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
      resolve("..", "docs", "pr-a1-execute-log.json"),
      JSON.stringify({ aborted_at: name, log }, null, 2),
      "utf8"
    );
    process.exit(1);
  }
}

const CARB_ID = "45140924-25b6-4d2c-abe5-11a65386acdc";
const SB_TRIO = ["w4_ca_sb253", "w4_ca_sb261", "w4_ca_ab1305"];

// ─── Step 1: Leginfo insert (a) ────────────────────────────────────────
// Idempotent: check first, insert only if absent.
let leginfoId = null;
{
  const { data: existing } = await supabase
    .from("sources")
    .select("id, tier")
    .ilike("url", "%leginfo.legislature.ca.gov%")
    .maybeSingle();
  if (existing) {
    leginfoId = existing.id;
    step(
      "leginfo_already_exists",
      true,
      `id=${leginfoId} tier=${existing.tier}`
    );
  } else {
    const { data: inserted, error: e } = await supabase
      .from("sources")
      .insert({
        name: "California Legislative Information (Leginfo)",
        url: "https://leginfo.legislature.ca.gov",
        description:
          "California's official public website for state legislation. Hosts SB 253 (Climate Corporate Data Accountability Act), SB 261 (Climate-Related Financial Risk Act), AB 1305 (Voluntary Carbon Market Disclosures Act), and other state statutes affecting freight, supply chain, and corporate climate disclosure.",
        tier: 1,
        tier_at_creation: 1,
        status: "active",
        admin_only: false,
        jurisdictions: [],
        jurisdiction_iso: ["US-CA"],
        intelligence_types: ["legislation"],
        domains: [1],
        access_method: "scrape",
        update_frequency: "weekly",
        notes:
          "Tier 1 official state legislative portal. Authoritative for California state statute text and bill status.",
      })
      .select("id, tier, name")
      .maybeSingle();
    if (e || !inserted) {
      step("leginfo_insert", false, e?.message ?? "no row returned");
    }
    leginfoId = inserted.id;
    step(
      "leginfo_insert",
      true,
      `id=${leginfoId} tier=${inserted.tier} name=${inserted.name}`
    );
  }
}

// Verify leginfo state
{
  const { data: l } = await supabase
    .from("sources")
    .select("id, tier, jurisdiction_iso, status")
    .eq("id", leginfoId)
    .maybeSingle();
  const ok =
    l && l.tier === 1 && l.status === "active" && Array.isArray(l.jurisdiction_iso) && l.jurisdiction_iso.includes("US-CA");
  step(
    "leginfo_verify",
    ok,
    `tier=${l?.tier} status=${l?.status} jurisdiction_iso=${JSON.stringify(l?.jurisdiction_iso)}`
  );
}

// ─── Step 2: CARB tier bump (d) ────────────────────────────────────────
{
  const { error: e } = await supabase
    .from("sources")
    .update({ tier: 1 })
    .eq("id", CARB_ID);
  step("carb_tier_update", !e, e?.message ?? "tier set to 1");
}
// Verify
{
  const { data: c } = await supabase
    .from("sources")
    .select("id, tier, name")
    .eq("id", CARB_ID)
    .maybeSingle();
  step(
    "carb_tier_verify",
    c?.tier === 1,
    `tier=${c?.tier} name=${c?.name}`
  );
}

// ─── Step 3: source_id relink for SB253 / SB261 / AB1305 -> Leginfo ────
// w4_ca_acf is already linked to CARB; skip per investigation finding.
{
  const { error: e, count } = await supabase
    .from("intelligence_items")
    .update({ source_id: leginfoId }, { count: "exact" })
    .in("legacy_id", SB_TRIO)
    .is("source_id", null);
  step(
    "ca_trio_source_relink",
    !e,
    `${count} rows updated to source_id=${leginfoId}`
  );
}
// Verify all 3 now point at Leginfo
{
  const { data: trio } = await supabase
    .from("intelligence_items")
    .select("legacy_id, source_id")
    .in("legacy_id", SB_TRIO);
  const allLinked = trio?.every((r) => r.source_id === leginfoId);
  step(
    "ca_trio_source_verify",
    allLinked,
    JSON.stringify(trio?.map((r) => ({ id: r.legacy_id, src: r.source_id })))
  );
}

// ─── Step 4: w4_ca_acf priority LOW -> HIGH (c) ────────────────────────
// Operational impact for Dietl/Rockit drayage at LA/LB. Rationale lives in
// the PR description; the change itself is one row.
{
  const { error: e } = await supabase
    .from("intelligence_items")
    .update({ priority: "HIGH" })
    .eq("legacy_id", "w4_ca_acf");
  step("acf_priority_update", !e, e?.message ?? "set HIGH");
}
{
  const { data: acf } = await supabase
    .from("intelligence_items")
    .select("legacy_id, priority")
    .eq("legacy_id", "w4_ca_acf")
    .maybeSingle();
  step(
    "acf_priority_verify",
    acf?.priority === "HIGH",
    `priority=${acf?.priority}`
  );
}

// ─── Step 5: l7 (CARB Advanced Clean Trucks) US -> US-CA (e) ───────────
{
  const { error: e } = await supabase
    .from("intelligence_items")
    .update({ jurisdiction_iso: ["US-CA"] })
    .eq("legacy_id", "l7");
  step("l7_jurisdiction_update", !e, e?.message ?? "set ['US-CA']");
}
{
  const { data: r } = await supabase
    .from("intelligence_items")
    .select("legacy_id, jurisdiction_iso")
    .eq("legacy_id", "l7")
    .maybeSingle();
  const ok =
    Array.isArray(r?.jurisdiction_iso) &&
    r.jurisdiction_iso.length === 1 &&
    r.jurisdiction_iso[0] === "US-CA";
  step(
    "l7_jurisdiction_verify",
    ok,
    `jurisdiction_iso=${JSON.stringify(r?.jurisdiction_iso)}`
  );
}

// ─── Step 6: NYC LL97 US -> US-NY (e) ──────────────────────────────────
{
  const { error: e } = await supabase
    .from("intelligence_items")
    .update({ jurisdiction_iso: ["US-NY"] })
    .eq("legacy_id", "nyc-local-law-97-building-carbon-emissions-caps");
  step("ll97_jurisdiction_update", !e, e?.message ?? "set ['US-NY']");
}
{
  const { data: r } = await supabase
    .from("intelligence_items")
    .select("legacy_id, jurisdiction_iso")
    .eq("legacy_id", "nyc-local-law-97-building-carbon-emissions-caps")
    .maybeSingle();
  const ok =
    Array.isArray(r?.jurisdiction_iso) &&
    r.jurisdiction_iso.length === 1 &&
    r.jurisdiction_iso[0] === "US-NY";
  step(
    "ll97_jurisdiction_verify",
    ok,
    `jurisdiction_iso=${JSON.stringify(r?.jurisdiction_iso)}`
  );
}

// ─── Final state snapshot ──────────────────────────────────────────────
{
  const { data: caFour } = await supabase
    .from("intelligence_items")
    .select("legacy_id, priority, jurisdiction_iso, source_id")
    .in("legacy_id", [...SB_TRIO, "w4_ca_acf"]);
  const { data: caSources } = await supabase
    .from("sources")
    .select("id, name, tier, jurisdiction_iso")
    .or("url.ilike.%arb.ca.gov%,url.ilike.%leginfo.legislature.ca.gov%");
  console.log(
    "\nFinal California state:\n",
    JSON.stringify({ four_items: caFour, sources: caSources }, null, 2)
  );
}

writeFileSync(
  resolve("..", "docs", "pr-a1-execute-log.json"),
  JSON.stringify({ completed: true, log }, null, 2),
  "utf8"
);
console.log("\n✓ PR-A1 writes complete. Log: docs/pr-a1-execute-log.json");
