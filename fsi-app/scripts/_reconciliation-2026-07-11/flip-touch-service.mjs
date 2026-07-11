/** Service-role revalidation touch (the sanctioned app path for verified<->quarantined; the
 *  guard only binds flips OFF 'unverified'). Touch updated_at -> trigger re-derives status.
 *  Usage: node flip-touch-service.mjs <id,id,...> */
import { createClient } from "@supabase/supabase-js";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ids = (process.argv[2] || "").split(",").map(s => s.trim()).filter(Boolean);
if (!ids.length) { console.error("REFUSING: pass ids"); process.exit(2); }
let v=0,q=0,o=0;
for (const id of ids) {
  const { data: before } = await db.from("intelligence_items").select("provenance_status,legacy_id").eq("id", id).single();
  const { error } = await db.from("intelligence_items").update({ updated_at: new Date().toISOString() }).eq("id", id);
  if (error) { console.log(`  ${id.slice(0,8)} TOUCH FAIL: ${error.message}`); o++; continue; }
  const { data: after } = await db.from("intelligence_items").select("provenance_status").eq("id", id).single();
  const { count } = await db.from("integrity_flags").select("id", { count: "exact", head: true })
    .eq("subject_type","item").eq("subject_ref", id).eq("status","open").eq("created_by","set_provenance_status_trigger");
  console.log(`  ${(before?.legacy_id || id.slice(0,8)).padEnd(14)} ${before?.provenance_status} -> ${after?.provenance_status} (open trigger flags: ${count})`);
  after?.provenance_status === "verified" ? v++ : after?.provenance_status === "quarantined" ? q++ : o++;
}
console.log(`SPLIT verified=${v} quarantined=${q} other=${o}`);
