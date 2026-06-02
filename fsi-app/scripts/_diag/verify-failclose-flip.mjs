/** READ-ONLY: verify by OUTCOME that the stored provenance_status distribution
 * matches the fail-close projection (390 quarantined / 0 verified / 0 pending).
 * Also confirms a sample of formerly-verified shells now read 'quarantined'. */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(__dirname, "..", "..");
const envText = readFileSync(resolve(APP_ROOT, ".env.local"), "utf8");
const env = (k) => envText.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const supabase = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

const { data: items } = await supabase
  .from("intelligence_items")
  .select("id, legacy_id, title, provenance_status, provenance_verified_at")
  .eq("is_archived", false);

const dist = {};
let verifiedAtSet = 0;
for (const it of items || []) {
  dist[it.provenance_status || "null"] = (dist[it.provenance_status || "null"] || 0) + 1;
  if (it.provenance_verified_at) verifiedAtSet++;
}
console.log("STORED provenance_status distribution (active items):");
console.log(JSON.stringify(dist, null, 2));
console.log(`rows with provenance_verified_at set: ${verifiedAtSet}  (expect 0)`);

const total = (items || []).length;
const quar = dist.quarantined || 0;
const ok = quar === total && !dist.verified && !dist.pending_human_verify && verifiedAtSet === 0;
console.log(`\nVERIFY: ${total} active, ${quar} quarantined, ${dist.verified || 0} verified, ${dist.pending_human_verify || 0} pending.`);
console.log(ok ? "PASS — fail-close flip landed; nothing falsely verified." : "FAIL — distribution does not match projection. HALT + investigate.");

// Spot-check 3 formerly-verified shells by name.
const { data: shells } = await supabase
  .from("intelligence_items")
  .select("legacy_id, title, provenance_status")
  .in("legacy_id", ["g31", "445a06b2", "o8"])
  .limit(5);
console.log("\nSpot-check formerly-'verified' shells:");
for (const s of shells || []) console.log(`  [${s.legacy_id}] ${s.provenance_status}  "${(s.title || "").slice(0, 36)}"`);
