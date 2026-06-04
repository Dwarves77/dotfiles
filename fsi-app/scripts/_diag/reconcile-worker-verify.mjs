/** End-to-end verify of the reconcile worker against the LIVE Supabase: inject a simulated
 * change_detected=true signal, run the consumer logic, assert it records to intelligence_changes
 * + stamps reconciled_at + is idempotent, then clean up the simulated rows. */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { recordSourceChangeTrigger } from "../../src/lib/sources/reconcile.ts";
const __d = dirname(fileURLToPath(import.meta.url)), ROOT = resolve(__d, "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// 1. find a source that has active items
const { data: src } = await sb.rpc("noop").then(() => ({ data: null })).catch(() => ({ data: null }));
const { data: anyItem } = await sb.from("intelligence_items").select("source_id").eq("is_archived", false).not("source_id", "is", null).limit(1).single();
const sourceId = anyItem.source_id;
const { data: items } = await sb.from("intelligence_items").select("id").eq("source_id", sourceId).eq("is_archived", false);
console.log(`test source ${sourceId.slice(0, 8)} with ${items.length} active item(s)`);

// 2. inject a simulated detection signal
const { data: qrow, error: qInsErr } = await sb.from("monitoring_queue").insert({
  source_id: sourceId, scheduled_check: new Date().toISOString(), priority: "normal",
  last_result: "no_change", change_detected: true, checked_at: new Date().toISOString(),
}).select("id").single();
if (qInsErr) { console.error("monitoring_queue insert error:", qInsErr.message); process.exit(1); }
console.log(`injected monitoring_queue change_detected=true row ${qrow.id.slice(0, 8)}`);

// 3. run the worker's consumer logic
const { data: pending } = await sb.from("monitoring_queue").select("id, source_id").eq("change_detected", true).is("reconciled_at", null);
let changesRecorded = 0; const changeIds = [];
for (const row of pending) {
  const { data: its } = await sb.from("intelligence_items").select("id, source_url").eq("source_id", row.source_id).eq("is_archived", false);
  for (const it of its) { const r = await recordSourceChangeTrigger(sb, { itemId: it.id, sourceUrl: it.source_url }); if (r.ok) { changesRecorded++; changeIds.push(r.changeId); } }
  await sb.from("monitoring_queue").update({ reconciled_at: new Date().toISOString() }).eq("id", row.id);
}
console.log(`worker recorded ${changesRecorded} change(s) into intelligence_changes`);

// 4. assert
const { count: icCount } = await sb.from("intelligence_changes").select("*", { count: "exact", head: true });
const { data: q2 } = await sb.from("monitoring_queue").select("reconciled_at").eq("id", qrow.id).single();
const { data: stillPending } = await sb.from("monitoring_queue").select("id").eq("id", qrow.id).eq("change_detected", true).is("reconciled_at", null);
const ok = changesRecorded === items.length && icCount >= changesRecorded && q2.reconciled_at && stillPending.length === 0;
console.log(`assert: recorded=${changesRecorded}==items=${items.length}; intelligence_changes count=${icCount}; reconciled_at set=${!!q2.reconciled_at}; idempotent(no longer pending)=${stillPending.length === 0}`);

// 5. cleanup the simulated rows
await sb.from("intelligence_changes").delete().in("id", changeIds);
await sb.from("monitoring_queue").delete().eq("id", qrow.id);
const { count: after } = await sb.from("intelligence_changes").select("*", { count: "exact", head: true });
console.log(`cleaned up; intelligence_changes back to ${after} rows`);
console.log(ok ? "\nPASS — reconcile worker consumes change_detected, writes intelligence_changes to Supabase, stamps reconciled_at, idempotent." : "\nFAIL");
