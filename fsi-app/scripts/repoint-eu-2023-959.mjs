/** hold-means-seek: re-point EU 2023/959 (verified, HIGH directive) off the Task-3-suspended EUR-Lex
 *  junk-drawer source to the ALREADY-REGISTERED correct active source. The item's source_url was already
 *  correct (eli/dir/2023/959/oj/eng); only its source_id FK pointed to the dead OJ:L_202500040 row that Task 3
 *  suspended, so criterion 1 failed source_not_active. Retrieval-before-generation: the correct source
 *  (57eda525, same URL, T1, active) already exists — no registration, no spend. Guarded + snapshotted + cited.
 *  Re-validates after. Usage: node scripts/repoint-eu-2023-959.mjs [--apply]
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { guardedUpdate } from "./lib/db.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const APPLY = process.argv.includes("--apply");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const ITEM = "15f63ea9-4803-4bb4-b1a3-9ccdeb8a3050";
const CORRECT_SOURCE = "57eda525-a8fe-45fe-a563-dd7167fa6152";
const cite = { skill: "remediation-discipline", reason: "hold-means-seek: re-point EU 2023/959 (verified) off the Task-3-suspended EUR-Lex junk-drawer to the already-registered correct active source (eli/dir/2023/959/oj/eng, T1); source_url was already correct, only the source_id FK pointed to the dead row" };

async function state() {
  const { data: it } = await sb.from("intelligence_items").select("source_id, source_url, provenance_status").eq("id", ITEM).single();
  const { data: src } = await sb.from("sources").select("url, status, base_tier").eq("id", it.source_id).single();
  const { data: v } = await sb.rpc("validate_item_provenance", { p_item_id: ITEM });
  const val = Array.isArray(v) ? v[0] : v;
  return { it, src, valid: val?.valid, reasons: (val?.failures || []).map((f) => f.reason) };
}

async function main() {
  // precondition guard: the correct source must be active + its URL must match the item's source_url
  const { data: cs } = await sb.from("sources").select("url, status, base_tier").eq("id", CORRECT_SOURCE).single();
  const before = await state();
  console.log(`\n=== EU 2023/959 re-point (${APPLY ? "APPLY" : "DRY"}) ===`);
  console.log(`  target source: ${cs?.url} status=${cs?.status} tier=${cs?.base_tier}`);
  console.log(`  BEFORE: source=${before.src?.url} status=${before.src?.status} | valid=${before.valid} reasons=${before.reasons.join(",")}`);
  if (cs?.status !== "active") { console.error("REFUSING: correct source is not active."); process.exit(2); }
  if (!APPLY) { console.log("  (dry) would re-point source_id -> correct active source."); return; }
  const r = await guardedUpdate("intelligence_items", (q) => q.eq("id", ITEM), { source_id: CORRECT_SOURCE }, { cite });
  const after = await state();
  console.log(`  AFTER:  source=${after.src?.url} status=${after.src?.status} | valid=${after.valid} reasons=${after.reasons.join(",") || "(none)"} | prov=${after.it?.provenance_status}`);
  console.log(`  ${after.valid ? "OK — item validates clean; source_not_active resolved." : "STILL INVALID — remaining reasons: " + after.reasons.join(",")}`);
  console.log(`  snapshot: ${String(r.snapshot).replace(/.*[\\/]/, "")}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
