import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const { readClient, readAll } = await import("../lib/db.mjs");
const sb = readClient();
const all = await readAll("intelligence_items", "id,title,item_type,instrument_identifier,compliance_object_tags,operational_scenario_tags,cross_references,related_items,topic_tags");
const PROBES = ["iso 14083", "14083", "countemissions", "ghg protocol", "2023/1805", "celex"];
for (const p of ["3581c084", "50ccd5cc", "4939b133"]) {
  const it = all.find((i) => String(i.id).startsWith(p));
  if (!it) continue;
  console.log(`\n${p} [${it.item_type}] "${it.title.slice(0, 42)}"`);
  console.log(`  instrument_identifier: ${JSON.stringify(it.instrument_identifier)}`);
  console.log(`  compliance_object_tags: ${JSON.stringify(it.compliance_object_tags)}`);
  console.log(`  operational_scenario_tags: ${JSON.stringify(it.operational_scenario_tags)}`);
  console.log(`  cross_references (prose): ${JSON.stringify((it.cross_references || "").slice(0, 90))}`);
  const { data: one } = await sb.from("intelligence_items").select("full_brief").eq("id", it.id).single();
  const { data: pool } = await sb.from("agent_run_searches").select("result_content_excerpt").eq("intelligence_item_id", it.id);
  const hay = ((one.full_brief || "") + " " + (pool || []).map((r) => r.result_content_excerpt || "").join(" ")).toLowerCase();
  const hits = PROBES.filter((x) => hay.includes(x));
  console.log(`  >> CONTENT (brief+pool ${hay.length}ch) MENTIONS: ${JSON.stringify(hits)}  <- present in text, NOT in any structured entity field`);
}
process.exit(0);
