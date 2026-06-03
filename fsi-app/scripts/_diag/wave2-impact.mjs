/**
 * wave2-impact.mjs — READ-ONLY assessment of wave2-cleanup-execute's Step-1 damage.
 *
 * wave2-cleanup-execute.mjs re-classified 12 stale provisional_sources using a
 * plain-fetch reachability + content path (FORBIDDEN — Browserless is the MUST).
 * That path treats 403/429/5xx/timeout as "unreachable" -> tier L -> status
 * 'rejected'. This script surfaces every row it stamped (reviewer_notes carry the
 * "[Re-run by wave2-cleanup-execute ...]" marker) and classifies the verdict so we
 * can see which were rejected on the reachability bug vs on a (also-suspect) Haiku
 * score. READ-ONLY. No writes.
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data, error } = await s
  .from("provisional_sources")
  .select("id, name, url, status, recommended_tier, discovered_for_jurisdiction, reviewed_at, reviewer_notes, created_at")
  .ilike("reviewer_notes", "%wave2-cleanup-execute%")
  .order("status", { ascending: true });

if (error) { console.error(error.message); process.exit(1); }
console.log(`wave2-cleanup-execute touched ${data.length} provisional_sources rows.\n`);

const reasonOf = (notes) => {
  const m = (notes || "").match(/decision=([HML])\s*\(([^)]*)\)/);
  return m ? { tier: m[1], reason: m[2] } : { tier: "?", reason: "?" };
};
const byStatus = {};
for (const r of data) {
  const { tier, reason } = reasonOf(r.reviewer_notes);
  (byStatus[r.status] ||= []).push({ ...r, tier, reason });
}

for (const [status, rows] of Object.entries(byStatus)) {
  console.log(`\n=== status='${status}'  (${rows.length}) ===`);
  for (const r of rows) {
    const suspect = r.reason.startsWith("reachability") ? "  <-- FALSE-NEGATIVE (rejected on plain-fetch reachability bug)" : "";
    console.log(`  [${r.tier} ${r.reason}] tier=${r.recommended_tier ?? "-"} juris=${r.discovered_for_jurisdiction ?? "-"}${suspect}`);
    console.log(`     "${(r.name || "").slice(0, 50)}"  ${r.url}`);
  }
}

const rejected = (byStatus["rejected"] || []);
const reachRejects = rejected.filter((r) => r.reason.startsWith("reachability"));
console.log(`\n${"=".repeat(60)}`);
console.log(`rejected total: ${rejected.length}  |  of which rejected on the reachability bug: ${reachRejects.length}`);
console.log(`ALL ${data.length} verdicts ran on the forbidden plain-fetch path (reachability AND content) -> none are trustworthy.`);
console.log(`READ-ONLY. No writes performed.`);
