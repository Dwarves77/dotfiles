/** recon-mechanisms-probe.mjs — READ-ONLY rowcounts for reconciliation mechanisms. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
const __dirname = dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(resolve(__dirname, "..", "..", ".env.local"));
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const tables = [
  "monitoring_queue", "source_conflicts", "item_disputes", "item_changelog",
  "item_timelines", "item_supersessions", "item_cross_references",
  "source_trust_events", "staged_updates", "intelligence_summaries",
  "intelligence_changes", "provisional_sources", "system_state",
];
for (const t of tables) {
  try {
    const { count, error } = await s.from(t).select("*", { count: "exact", head: true });
    console.log(`${t.padEnd(26)} ${error ? "ERR " + error.message : count}`);
  } catch (e) { console.log(`${t.padEnd(26)} EXC ${e.message}`); }
}

// staged_updates by status
const { data: su } = await s.from("staged_updates").select("status, materialized_at");
if (su) {
  const byStatus = su.reduce((m, r) => ((m[r.status] = (m[r.status]||0)+1), m), {});
  const matr = su.filter(r => r.materialized_at).length;
  console.log("\nstaged_updates by status:", JSON.stringify(byStatus), "| materialized:", matr);
}

// supersession columns populated on intelligence_items
const { data: items } = await s.from("intelligence_items").select("status, replaced_by, is_archived, archive_reason");
if (items) {
  const superseded = items.filter(i => i.status === "superseded").length;
  const replaced = items.filter(i => i.replaced_by).length;
  const archived = items.filter(i => i.is_archived).length;
  const reasons = items.filter(i=>i.archive_reason).reduce((m,r)=>((m[r.archive_reason]=(m[r.archive_reason]||0)+1),m),{});
  console.log(`\nintelligence_items: ${items.length} | status=superseded: ${superseded} | replaced_by set: ${replaced} | archived: ${archived}`);
  console.log("archive_reason tally:", JSON.stringify(reasons));
}

// system_state pause flags
const { data: ss } = await s.from("system_state").select("*");
console.log("\nsystem_state:", JSON.stringify(ss));

// sources auto_run_enabled
const { data: srcs } = await s.from("sources").select("auto_run_enabled, processing_paused, status");
if (srcs) {
  const autoOn = srcs.filter(x=>x.auto_run_enabled).length;
  const paused = srcs.filter(x=>x.processing_paused).length;
  console.log(`sources: ${srcs.length} | auto_run_enabled=true: ${autoOn} | processing_paused=true: ${paused}`);
}
console.log("\nREAD-ONLY.");
