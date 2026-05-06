#!/usr/bin/env node
/**
 * Backfill missing provisional_sources rows for the 385 tier-M
 * source_verifications entries where the W3 tier1-population-runner
 * silently dropped the insert.
 *
 * Root cause: tier1-population-runner.mjs:insertProvisional referenced
 * a non-existent `jurisdictions` column on provisional_sources. The
 * insert failed with "Could not find the 'jurisdictions' column"; the
 * runner caught the error, set action_taken='rejected', wrote the audit
 * row, and continued. 385 candidates were dropped silently.
 *
 * Pattern: "audit logs without write verification" — captured for Phase D.
 * Documented in commit 's body. Going forward, the runner has the bad
 * line removed; the verification.ts API-path was always correct.
 *
 * This script is one-shot + idempotent:
 *   1. SELECT source_verifications WHERE verification_tier='M' AND
 *      resulting_provisional_id IS NULL
 *   2. For each, insert into provisional_sources matching the schema
 *      (no `jurisdictions` field).
 *   3. UPDATE source_verifications SET resulting_provisional_id=<id>,
 *      action_taken='queued-provisional' for each successful insert.
 *   4. Skip entries whose URL already exists in provisional_sources
 *      (the UNIQUE(url) constraint is the safety net).
 *
 * No LLM cost. No fresh classification. Re-uses the AI scores from the
 * original audit row.
 *
 * Run via:
 *   node supabase/seed/backfill-missing-provisionals.mjs
 */

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

// Load .env.local
const envPath = path.resolve("C:/Users/jason/dotfiles/fsi-app/.env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    if (!line.includes("=") || line.startsWith("#")) continue;
    const [k, ...v] = line.split("=");
    process.env[k.trim()] = v.join("=").trim().replace(/^"|"$/g, "");
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

function aiTierToNumeric(t) {
  if (t === "T1") return 1;
  if (t === "T2") return 2;
  if (t === "T3") return 4;
  return null;
}

console.log("Backfill missing provisional_sources from W3 tier-M audit log");
console.log("=".repeat(70));

// Pull the orphaned audit rows. Most rows have action_taken='rejected'
// because that's how the runner recorded the M-insert failure; a few
// might be 'queued-provisional' if they slipped through. Filter on
// resulting_provisional_id IS NULL to catch both.
const { data: orphans, error: selErr } = await supabase
  .from("source_verifications")
  .select(
    "id, candidate_url, candidate_name, jurisdiction_iso, language, ai_relevance_score, ai_freight_score, ai_trust_tier, rejection_reason, verification_log"
  )
  .eq("verification_tier", "M")
  .is("resulting_provisional_id", null);

if (selErr) {
  console.error("Audit-log select failed:", selErr.message);
  process.exit(1);
}

console.log(`Found ${orphans.length} orphan tier-M audit rows to backfill\n`);

// Pre-fetch existing provisional_sources URLs for dedupe check.
const existingUrls = new Set();
{
  let from = 0;
  while (true) {
    const { data: page, error } = await supabase
      .from("provisional_sources")
      .select("url")
      .range(from, from + 999);
    if (error) {
      console.error("Provisional URL fetch failed:", error.message);
      process.exit(1);
    }
    for (const r of page ?? []) {
      if (r.url) existingUrls.add(r.url);
    }
    if (!page || page.length < 1000) break;
    from += 1000;
  }
  console.log(`Pre-loaded ${existingUrls.size} existing provisional URLs for dedupe\n`);
}

let inserted = 0;
let skippedDupe = 0;
let skippedAlreadyDone = 0;
let failed = 0;

for (let i = 0; i < orphans.length; i++) {
  const row = orphans[i];
  const candidateName = row.candidate_name || row.candidate_url;
  const jurisdiction = (row.jurisdiction_iso || [])[0] || null;

  // Skip if URL already in provisional_sources (UNIQUE(url) safety).
  if (existingUrls.has(row.candidate_url)) {
    skippedDupe++;
    if (i % 50 === 0) {
      console.log(`[${i + 1}/${orphans.length}] skip-dupe: ${row.candidate_url}`);
    }
    continue;
  }

  const recommended = aiTierToNumeric(row.ai_trust_tier);
  const newProv = {
    name: candidateName,
    url: row.candidate_url,
    description:
      `Backfilled 2026-05-06 from W3 audit log (rl=${row.ai_relevance_score ?? "?"}, ` +
      `frt=${row.ai_freight_score ?? "?"}, trust=${row.ai_trust_tier ?? "?"}). ` +
      `Original failure cause: insertProvisional column-name bug; corrected.`,
    discovered_via: "worker_search",
    discovered_for_jurisdiction: jurisdiction,
    status: "pending_review",
    provisional_tier: 7,
    recommended_tier: recommended,
    reviewer_notes:
      `Auto-queued via W3 backfill ${new Date().toISOString().slice(0, 10)} ` +
      `(jurisdiction ${jurisdiction ?? "unknown"}): ${row.rejection_reason ?? "uncertain"}. ` +
      `lang=${row.language ?? "unknown"}.`,
  };

  const { data: ins, error: insErr } = await supabase
    .from("provisional_sources")
    .insert(newProv)
    .select("id")
    .single();

  if (insErr || !ins) {
    if (
      (insErr?.message ?? "").toLowerCase().includes("unique") ||
      insErr?.code === "23505"
    ) {
      skippedDupe++;
    } else {
      failed++;
      console.warn(`  [${i + 1}] insert failed for ${row.candidate_url}: ${insErr?.message}`);
    }
    continue;
  }

  // Update the audit row to point at the new provisional + flip action.
  const { error: updErr } = await supabase
    .from("source_verifications")
    .update({
      resulting_provisional_id: ins.id,
      action_taken: "queued-provisional",
    })
    .eq("id", row.id);

  if (updErr) {
    console.warn(`  [${i + 1}] audit update failed: ${updErr.message}`);
    // The provisional row is in place but the audit pointer didn't update.
    // Re-running the script will skip it via existingUrls dedupe.
  }

  existingUrls.add(row.candidate_url);
  inserted++;

  if (i % 50 === 0) {
    console.log(`[${i + 1}/${orphans.length}] inserted ${ins.id} for ${row.candidate_url}`);
  }
}

console.log("");
console.log("=".repeat(70));
console.log("Backfill complete");
console.log("=".repeat(70));
console.log(`Total orphan rows:              ${orphans.length}`);
console.log(`Inserted into provisional:      ${inserted}`);
console.log(`Skipped (URL already exists):   ${skippedDupe}`);
console.log(`Failed (other error):           ${failed}`);
console.log("=".repeat(70));

const reportPath = path.resolve("C:/Users/jason/dotfiles/docs/BACKFILL-MISSING-PROVISIONALS-RESULTS.json");
fs.writeFileSync(
  reportPath,
  JSON.stringify({
    ran_at: new Date().toISOString(),
    orphan_count: orphans.length,
    inserted,
    skipped_dupe: skippedDupe,
    failed,
  }, null, 2)
);
console.log(`Report: ${reportPath}`);
