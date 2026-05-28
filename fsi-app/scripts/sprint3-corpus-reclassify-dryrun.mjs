/**
 * sprint3-corpus-reclassify-dryrun.mjs
 *
 * Sprint 3 CORPUS-RECLASSIFY-SOURCES Scope A dry-run preview
 * (operator-locked 2026-05-27). READ-ONLY by default; pass --execute
 * to actually run the writes after operator green-light.
 *
 * Scope A = 25 rows with ≥2 pattern hits, all URL-matched in sources.
 *
 * Fix shape (per A1.5 EcoVadis precedent + operator confirmation):
 *   1. Archive each intelligence_item (set is_archived = true)
 *   2. Upsert URL to sources (no-op for this set; every row already
 *      URL-matched with intel.source_id aligned, but the upsert step
 *      is kept for parity with A1.5 pattern and as defense-in-depth)
 *
 * Dry-run output:
 *   - Pre-write read-back: confirm 25 rows currently is_archived=false
 *   - Per-row action summary (UPDATE planned; sources insert needed?)
 *   - Total counts for operator review
 *
 * Operator confirms after seeing the dry-run output. Then re-runs with
 * `--execute` to apply.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(__dirname, "..");
const EXECUTE = process.argv.includes("--execute");

// ── env ─────────────────────────────────────────────────────────────
const envText = readFileSync(resolve(APP_ROOT, ".env.local"), "utf8");
const env = (k) => envText.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const supabase = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

// ── load + filter to Scope A (multi-hit) ──────────────────────────
const xcheckPath = resolve(APP_ROOT, "docs/audits/sprint3-corpus-reclassify-crosscheck-2026-05-27.json");
const xcheck = JSON.parse(readFileSync(xcheckPath, "utf8"));
const allRows = [...xcheck.url_match_rows, ...xcheck.no_match_rows];
const scopeA = allRows.filter((r) => (r.hits || []).length >= 2);

console.log(`[${EXECUTE ? "EXECUTE" : "DRY-RUN"}] CORPUS-RECLASSIFY Scope A`);
console.log(`Scope A candidates (multi-hit, ≥2 patterns): ${scopeA.length}`);
console.log("");

if (scopeA.length !== 25) {
  console.warn(`⚠ Expected 25 rows; got ${scopeA.length}. Continuing.`);
}

// ── pre-write read-back: confirm rows still exist + still un-archived ──
const ids = scopeA.map((r) => r.id);
console.log("[step 1] pre-write read-back …");
const { data: liveRows, error: rbErr } = await supabase
  .from("intelligence_items")
  .select("id, legacy_id, title, is_archived, item_type, priority, domain, source_id, source_url")
  .in("id", ids);

if (rbErr) {
  console.error("read-back failed:", rbErr.message);
  process.exit(1);
}

const liveById = new Map(liveRows.map((r) => [r.id, r]));
const missing = scopeA.filter((c) => !liveById.has(c.id));
const alreadyArchived = liveRows.filter((r) => r.is_archived);
const targetForArchive = liveRows.filter((r) => !r.is_archived);

console.log(`  rows found:         ${liveRows.length}`);
console.log(`  missing from DB:    ${missing.length}`);
console.log(`  already archived:   ${alreadyArchived.length}`);
console.log(`  target for archive: ${targetForArchive.length}`);
console.log("");

if (missing.length > 0) {
  console.log("Missing IDs (no longer in intelligence_items?):");
  for (const m of missing) console.log(`  ${m.id}  ${m.title?.slice(0, 70)}`);
  console.log("");
}

if (alreadyArchived.length > 0) {
  console.log("Already-archived IDs (skipping):");
  for (const r of alreadyArchived) console.log(`  ${r.id}  ${r.title?.slice(0, 70)}`);
  console.log("");
}

// ── sources upsert check ──────────────────────────────────────────
// Every Scope A row already URL-matched per the cross-check. Confirm
// intel.source_id is set (defense-in-depth before archiving).
const missingSourceId = targetForArchive.filter((r) => !r.source_id);
console.log(`[step 2] sources_id alignment check …`);
console.log(`  rows with intel.source_id set: ${targetForArchive.length - missingSourceId.length}`);
console.log(`  rows with intel.source_id NULL: ${missingSourceId.length}`);
if (missingSourceId.length > 0) {
  console.log("  ⚠ Rows missing source_id (will need sources upsert before archive):");
  for (const r of missingSourceId) console.log(`    ${r.id}  ${r.source_url}`);
}
console.log("");

// ── planned actions per row ──────────────────────────────────────
console.log("[step 3] planned per-row actions:");
console.log("");
for (const r of targetForArchive) {
  const candidate = scopeA.find((c) => c.id === r.id);
  const matched = candidate?.matched_sources?.[0] || null;
  const sourceAction = !r.source_id
    ? "INSERT sources (URL not yet registered)"
    : "no sources change (already registered + aligned)";
  console.log(
    `  ${r.id.slice(0, 8)}  ${r.priority.padEnd(8)}  ${r.item_type.padEnd(12)}  ${(r.title || "").slice(0, 60)}`
  );
  console.log(`    → UPDATE intelligence_items SET is_archived = true`);
  console.log(`    → ${sourceAction}`);
  if (matched) {
    console.log(`    matched source: ${matched.name} (${matched.source_role || "—"}, T${matched.base_tier ?? "?"})`);
  }
}

console.log("");

// ── SQL preview (text only, not executed in dry-run) ─────────────
console.log("[step 4] SQL preview:");
console.log("");
console.log("BEGIN;");
console.log("");
console.log("-- Archive 25 source-aggregator misclassifications (Scope A)");
console.log("UPDATE intelligence_items");
console.log("   SET is_archived = true,");
console.log("       updated_at = NOW()");
console.log(` WHERE id IN (${ids.slice(0, 3).map((x) => `'${x.slice(0, 8)}…'`).join(", ")}, …)`);
console.log(`   AND is_archived = false;`);
console.log("");
if (missingSourceId.length === 0) {
  console.log("-- No sources upserts needed: every row's URL is already registered + aligned.");
} else {
  console.log(`-- ${missingSourceId.length} sources upserts needed (URL not yet registered):`);
  console.log("INSERT INTO sources (url, name, ...) VALUES (...) ON CONFLICT (url) DO NOTHING;");
}
console.log("");
console.log("COMMIT;");
console.log("");

// ── execute path (only when --execute flag passed) ───────────────
if (!EXECUTE) {
  console.log("─".repeat(60));
  console.log("DRY-RUN COMPLETE. No writes performed.");
  console.log("");
  console.log("Operator review:");
  console.log(`  - ${targetForArchive.length} archive UPDATEs planned`);
  console.log(`  - ${missingSourceId.length} sources INSERTs planned (likely 0 for this set)`);
  console.log(`  - ${alreadyArchived.length} already-archived rows skipped`);
  console.log(`  - ${missing.length} missing rows (unexpected; investigate before re-run)`);
  console.log("");
  console.log("Re-run with --execute to apply the writes.");
  process.exit(0);
}

// ── EXECUTE branch ────────────────────────────────────────────────
console.log("─".repeat(60));
console.log("EXECUTE MODE — applying writes …");
console.log("");

// Step 1 — sources upserts (any rows missing source_id)
if (missingSourceId.length > 0) {
  // We won't reach this in the current Scope A set; left as a guard
  // for future runs.
  console.warn("⚠ Sources upsert path not implemented in this run because Scope A had 0 rows needing it. Re-run audit first.");
  process.exit(1);
}

// Step 2 — archive UPDATE
const archiveIds = targetForArchive.map((r) => r.id);
const { error: upErr, data: upData } = await supabase
  .from("intelligence_items")
  .update({ is_archived: true, updated_at: new Date().toISOString() })
  .in("id", archiveIds)
  .select("id, title, is_archived");

if (upErr) {
  console.error("UPDATE failed:", upErr.message);
  process.exit(1);
}

console.log(`[execute] UPDATE returned ${upData?.length || 0} rows`);

// Step 3 — post-write verification
const { data: postRows } = await supabase
  .from("intelligence_items")
  .select("id, is_archived")
  .in("id", archiveIds);

const stillUnarchived = (postRows || []).filter((r) => !r.is_archived);
console.log(`[execute] post-write read-back: ${postRows?.length} rows checked`);
console.log(`[execute] still un-archived (should be 0): ${stillUnarchived.length}`);

if (stillUnarchived.length > 0) {
  console.error("⚠ Some rows did not archive:");
  for (const r of stillUnarchived) console.error(`  ${r.id}`);
  process.exit(1);
}

console.log("");
console.log(`✓ ${archiveIds.length} intelligence_items archived.`);
console.log("");
console.log("Run /api/admin/scan or revalidateTag(APP_DATA_TAG) to refresh");
console.log("downstream caches if needed; otherwise the 60s TTL will absorb.");
