/**
 * sprint4-provenance-reconcile.mjs  (Sprint 4 Block 1 — task 1.9)
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ PHASE 2 TOOL. DO NOT RUN DURING BLOCK 1.                             │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * Reconciles the pre-existing intelligence_items corpus against the source-
 * provenance invariant. Every active item predates the set_provenance_status
 * trigger (migration 115), so its provenance_status is still the migration-112
 * default 'unverified'. Reconciliation drives re-validation of those rows.
 *
 *   --dry-run  (DEFAULT) : calls the READ-ONLY validate_item_provenance(item)
 *                          RPC (migration 114, STABLE) for each active item,
 *                          tallies the recommended terminal status + the
 *                          failure criteria, and prints a report. WRITES
 *                          NOTHING — the RPC is read-only and no UPDATE runs.
 *   --execute            : touches each active item (UPDATE ... SET updated_at)
 *                          to FIRE the set_provenance_status trigger, which is
 *                          the single source of truth: it sets provenance_status
 *                          from recommended_status and inserts the data_quality
 *                          integrity_flags row on quarantine. The script does
 *                          NOT compute or set status itself (no duplicated
 *                          routing). Requires --confirm-phase-2 as a deliberate
 *                          second key.
 *
 * Block 1 fence: this file is WRITTEN and `node --check`ed ONLY. It is NOT run.
 * Reconciliation executes in Phase 2 — AFTER HARD CHECKPOINT 1 and AFTER Phase
 * 1.5 (source-tier audit), so the criterion-3 authority floor checks against
 * operator-verified tiers rather than unverified ones.
 *
 * HOOK GAP (surface before Phase 2): the --execute path mutates the corpus via
 * the trigger, but the launching command string (`node scripts/...`) does NOT
 * contain the danger keywords the PreToolUse hook greps. Before Phase 2, add
 * this script (or its --execute flag) to the hook danger set so corpus mutation
 * force-asks — the same treatment b2-runner / sprint3-a5-sonnet-backfill get.
 *
 * Usage:
 *   node scripts/sprint4-provenance-reconcile.mjs                       # dry run
 *   node scripts/sprint4-provenance-reconcile.mjs --limit=20            # dry, first 20
 *   node scripts/sprint4-provenance-reconcile.mjs --execute --confirm-phase-2   # PHASE 2 ONLY
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(__dirname, "..");

const envText = readFileSync(resolve(APP_ROOT, ".env.local"), "utf8");
const env = (k) => envText.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const SUPABASE_URL = env("NEXT_PUBLIC_SUPABASE_URL");
const SERVICE_ROLE_KEY = env("SUPABASE_SERVICE_ROLE_KEY");
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("[reconcile] missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const argv = process.argv.slice(2);
const EXECUTE = argv.includes("--execute");
const CONFIRM = argv.includes("--confirm-phase-2");
const limitArg = argv.find((x) => x.startsWith("--limit="));
const LIMIT = limitArg ? parseInt(limitArg.split("=")[1], 10) : Infinity;

console.log("=".repeat(64));
console.log("SPRINT 4 PROVENANCE RECONCILIATION — PHASE 2 TOOL");
console.log("=".repeat(64));

// Hard self-gate: --execute is a corpus mutation and a Phase 2 action.
if (EXECUTE && !CONFIRM) {
  console.error("\n[reconcile] --execute requires --confirm-phase-2 (deliberate second key).");
  console.error("[reconcile] Reconciliation is Phase 2 — it runs AFTER HARD CHECKPOINT 1 + Phase 1.5.");
  console.error("[reconcile] Refusing to mutate the corpus. Re-run with --dry-run (default) to preview.");
  process.exit(2);
}

const MODE = EXECUTE ? "EXECUTE (corpus reconciled via trigger)" : "DRY RUN (read-only preview; nothing written)";
console.log(`mode: ${MODE}`);

// Pull the active corpus.
const { data: items, error } = await supabase
  .from("intelligence_items")
  .select("id, legacy_id, title, priority, provenance_status, is_archived")
  .eq("is_archived", false);
if (error) {
  console.error(`[reconcile] query failed: ${error.message}`);
  process.exit(1);
}

const targets = (items || []).slice(0, LIMIT);

// Current status distribution (proves the starting state — expected all
// 'unverified' pre-reconciliation).
const currentDist = {};
for (const it of targets) currentDist[it.provenance_status || "null"] = (currentDist[it.provenance_status || "null"] || 0) + 1;
console.log(`active items to reconcile: ${targets.length}`);
console.log(`current provenance_status distribution: ${JSON.stringify(currentDist)}\n`);

const tally = { verified: 0, pending_human_verify: 0, quarantined: 0, error: 0 };
const criterionHist = {};
const quarantineSamples = [];

for (let i = 0; i < targets.length; i++) {
  const item = targets[i];

  // READ-ONLY validation (both modes report from this; the RPC is STABLE).
  const { data: vr, error: rpcErr } = await supabase.rpc("validate_item_provenance", { p_item_id: item.id });
  if (rpcErr) {
    tally.error++;
    console.log(`  [${item.legacy_id || item.id.slice(0, 8)}] RPC error: ${rpcErr.message}`);
    continue;
  }
  // The composite may arrive as a single object or a 1-row array per client.
  const result = Array.isArray(vr) ? vr[0] : vr;
  const status = result?.recommended_status || "error";
  const failures = Array.isArray(result?.failures) ? result.failures : [];
  tally[status] = (tally[status] || 0) + 1;
  for (const f of failures) {
    const key = `criterion_${f.criterion}_${f.reason || "?"}`;
    criterionHist[key] = (criterionHist[key] || 0) + 1;
  }
  if (status === "quarantined" && quarantineSamples.length < 15) {
    quarantineSamples.push({
      id: item.legacy_id || item.id.slice(0, 8),
      title: (item.title || "").slice(0, 50),
      reasons: failures.map((f) => `c${f.criterion}:${f.reason}`).slice(0, 4),
    });
  }

  // EXECUTE: touch the row so set_provenance_status fires; the trigger sets
  // status + inserts integrity_flags. Single source of truth — no routing here.
  if (EXECUTE) {
    const { error: upErr } = await supabase
      .from("intelligence_items")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", item.id);
    if (upErr) console.log(`  [${item.legacy_id || item.id.slice(0, 8)}] touch failed: ${upErr.message}`);
  }

  if ((i + 1) % 50 === 0) console.log(`  ...${i + 1}/${targets.length}`);
}

console.log("\n" + "-".repeat(64));
console.log(`RECONCILIATION ${EXECUTE ? "EXECUTED" : "PREVIEW"} — ${targets.length} active items`);
console.log("-".repeat(64));
console.log(`  -> verified:             ${tally.verified || 0}`);
console.log(`  -> pending_human_verify: ${tally.pending_human_verify || 0}  (CRITICAL/HIGH gate)`);
console.log(`  -> quarantined:          ${tally.quarantined || 0}`);
if (tally.error) console.log(`  -> RPC errors:           ${tally.error}`);

console.log("\nFailure histogram (criterion:reason -> count):");
const histRows = Object.entries(criterionHist).sort((a, b) => b[1] - a[1]);
if (histRows.length === 0) console.log("  (none)");
for (const [k, v] of histRows) console.log(`  ${k}: ${v}`);

if (quarantineSamples.length) {
  console.log("\nQuarantine samples (first 15):");
  for (const s of quarantineSamples) console.log(`  [${s.id}] ${s.title} :: ${s.reasons.join(", ")}`);
}

if (!EXECUTE) {
  console.log("\nThis was a DRY RUN. Nothing was written.");
  console.log("Phase 2 execution: node scripts/sprint4-provenance-reconcile.mjs --execute --confirm-phase-2");
}
