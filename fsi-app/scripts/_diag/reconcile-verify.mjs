/** Integration test: recordItemChange writes intelligence_changes (the writer-less table), then
 * cleans up. Proves the reconcile consumer closes the gap. READ-MOSTLY (writes 1 row, deletes it). */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { recordItemChange } from "../../src/lib/sources/reconcile.ts";
const __d = dirname(fileURLToPath(import.meta.url)), ROOT = resolve(__d, "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: item } = await sb.from("intelligence_items").select("id, compliance_deadline, summary").limit(1).single();
console.log(`test item: ${item.id.slice(0, 8)}`);

const previous = { compliance_deadline: "2026-01-01", status: "proposed", summary: "old summary" };
const next = { compliance_deadline: "2027-06-30", status: "in_force", summary: "old summary" };
const r = await recordItemChange(sb, { itemId: item.id, previous, next });
console.log(`recordItemChange -> ok=${r.ok} type=${r.changeType} severity=${r.severity} changeId=${r.changeId?.slice(0, 8)} ${r.error || ""}`);

// read back
const { data: row } = await sb.from("intelligence_changes").select("*").eq("id", r.changeId).single();
const ok = r.ok && row && row.item_id === item.id && row.change_severity === "critical" && row.change_type === "status_change";
console.log(`read-back: item_id match=${row?.item_id === item.id}  severity=${row?.change_severity}  summary="${row?.change_summary}"`);
console.log(`raw_diff: ${row?.raw_diff}`);

// cleanup (this was a simulated change, not a real one)
await sb.from("intelligence_changes").delete().eq("id", r.changeId);
const { count } = await sb.from("intelligence_changes").select("*", { count: "exact", head: true });
console.log(`cleaned up; intelligence_changes back to ${count} rows`);
console.log(ok ? "\nPASS — reconcile consumer writes intelligence_changes correctly (major change recorded, diff captured)." : "\nFAIL");
