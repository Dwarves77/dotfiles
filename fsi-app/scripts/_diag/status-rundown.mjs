/** status-rundown.mjs — READ-ONLY corpus + source snapshot for a status report. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
const __dirname = dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(resolve(__dirname, "..", "..", ".env.local"));
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const tally = (rows, key) => rows.reduce((m, r) => ((m[r[key] ?? "null"] = (m[r[key] ?? "null"] || 0) + 1), m), {});

// intelligence_items
const { data: items } = await s.from("intelligence_items").select("id, provenance_status, is_archived, full_brief, source_id, item_type");
const active = items.filter((i) => !i.is_archived);
const archived = items.filter((i) => i.is_archived);
const { data: secRows } = await s.from("intelligence_item_sections").select("item_id").not("content_md", "is", null);
const withSec = new Set(secRows.map((r) => r.item_id));

console.log(`=== intelligence_items: ${items.length} total | ${active.length} active | ${archived.length} archived ===`);
console.log("active provenance_status:", JSON.stringify(tally(active, "provenance_status")));
const aHasBrief = active.filter((i) => (i.full_brief || "").trim().length > 0).length;
const aHasSec = active.filter((i) => withSec.has(i.id)).length;
const aEmptySourced = active.filter((i) => (i.full_brief || "").trim() === "" && !withSec.has(i.id) && i.source_id).length;
const aNoSource = active.filter((i) => !i.source_id).length;
console.log(`active with full_brief: ${aHasBrief} | with sections: ${aHasSec} | EMPTY+sourced: ${aEmptySourced} | no source_id: ${aNoSource}`);

// grounding substrate
const { count: scp } = await s.from("section_claim_provenance").select("id", { count: "exact", head: true });
const { count: ars } = await s.from("agent_run_searches").select("id", { count: "exact", head: true });
console.log(`grounding substrate: section_claim_provenance=${scp} | agent_run_searches=${ars}`);

// sources + provisional
const { data: srcs } = await s.from("sources").select("status");
const { data: prov } = await s.from("provisional_sources").select("status");
console.log(`\n=== sources: ${srcs.length} ===`, JSON.stringify(tally(srcs, "status")));
console.log(`provisional_sources: ${prov.length}`, JSON.stringify(tally(prov, "status")));
console.log("\nREAD-ONLY.");
