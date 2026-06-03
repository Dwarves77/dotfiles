/**
 * wave2-reachability-restore.mjs — reverse wave2-cleanup-execute's false-negatives.
 *
 * wave2-cleanup-execute.mjs Step 1 re-classified 12 stale provisional_sources via a
 * FORBIDDEN plain-fetch reachability path (bot-UA HEAD; 403/429/5xx/timeout misread as
 * "unreachable" -> tier L -> status 'rejected'). That killed 4 LIVE national-government
 * sources (METI JP transport-efficiency, MPA Singapore sustainability, UAE MoEI, Korea ME
 * K-Taxonomy) — "these are NOT dead."
 *
 * Fix: restore those 4 from 'rejected' -> 'pending_review' so they re-enter the queue for
 * proper canonical (Browserless) re-verification. Per-row UPDATE WHERE status='rejected'
 * (idempotent) + read-back assert + halt-on-mismatch. Reversible (re-reject by id set).
 *
 *   node scripts/wave2-reachability-restore.mjs                     # dry run
 *   node scripts/wave2-reachability-restore.mjs --execute --confirm # write
 *
 * NOTE: only the reachability-bug rejects are touched. The 6 'confirmed' + 2
 * 'needs_more_data' rows from the same run ran on the same suspect path but got benign
 * verdicts; they are left in place and re-verify naturally on the next canonical pass.
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const argv = process.argv.slice(2);
const EXECUTE = argv.includes("--execute"), CONFIRM = argv.includes("--confirm");
if (EXECUTE && !CONFIRM) { console.error("--execute requires --confirm"); process.exit(2); }

// Target: wave2-stamped, currently 'rejected', rejected on the reachability bug.
const { data: rows, error } = await s
  .from("provisional_sources")
  .select("id, name, url, status, reviewer_notes")
  .eq("status", "rejected")
  .ilike("reviewer_notes", "%wave2-cleanup-execute%");
if (error) { console.error(error.message); process.exit(1); }

const targets = (rows || []).filter((r) => /decision=L\s*\(reachability/.test(r.reviewer_notes || ""));
console.log(`MODE: ${EXECUTE ? "EXECUTE" : "DRY RUN"}`);
console.log(`reachability-bug false-negatives to restore: ${targets.length}\n`);
for (const r of targets) console.log(`  ${r.name}\n     ${r.url}`);

const log = [];
const STAMP = "[restored by wave2-reachability-restore] false-negative: wave2-cleanup-execute rejected this on a plain-fetch reachability bug (403/429/5xx/timeout misread as dead). Live national-gov source. Back to pending_review for canonical Browserless re-verification.";

if (!EXECUTE) {
  console.log(`\nDRY RUN — no write. Re-run with --execute --confirm to restore.`);
  process.exit(0);
}

let restored = 0;
for (const r of targets) {
  const note = `${STAMP}\n--- prior: ${r.reviewer_notes}`;
  const { error: uErr } = await s
    .from("provisional_sources")
    .update({ status: "pending_review", reviewed_at: null, recommended_tier: null, reviewer_notes: note })
    .eq("id", r.id)
    .eq("status", "rejected"); // idempotent guard
  if (uErr) { console.log(`  [FAIL] ${r.id}: ${uErr.message}`); log.push({ id: r.id, ok: false, err: uErr.message }); continue; }
  const { data: v } = await s.from("provisional_sources").select("status, reviewed_at").eq("id", r.id).maybeSingle();
  const ok = v?.status === "pending_review" && v?.reviewed_at === null;
  console.log(`  [${ok ? "OK" : "MISMATCH"}] ${r.name} -> status=${v?.status}`);
  log.push({ id: r.id, name: r.name, url: r.url, ok, status_after: v?.status });
  if (!ok) { console.error("HALT: read-back mismatch."); writeFileSync(resolve(ROOT, "docs", "wave2-reachability-restore-log.json"), JSON.stringify({ aborted: r.id, log }, null, 2)); process.exit(1); }
  restored++;
}
writeFileSync(resolve(ROOT, "docs", "wave2-reachability-restore-log.json"), JSON.stringify({ completed: true, restored, log }, null, 2));
console.log(`\nrestored ${restored}/${targets.length} -> pending_review. Log: docs/wave2-reachability-restore-log.json`);
console.log(`Reversal: set the ${restored} ids back to status='rejected'. Re-verify canonically when Browserless quota is restored.`);
