// READ-ONLY ground truth: are the GLEC-cluster ITEMS actually connected in the live cross-ref graph,
// or minted isolated? Check intelligence_item_citations (brief->source), shared sources, item_cross_references
// (item<->item), related_items. The empirical test of "isolated vs wired" the subagent characterized.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const { readClient, readAll } = await import("../lib/db.mjs");
const sb = readClient();

const all = await readAll("intelligence_items", "id,title,item_type,related_items");
const want = ["3581c084", "50ccd5cc", "4939b133", "7d2f8d88", "7aaecc81"]; // GLEC v3, GLEC news, GLEC air, ISO 14083, CountEmissions
const cluster = want.map((p) => all.find((i) => String(i.id).startsWith(p))).filter(Boolean);
const idset = new Set(cluster.map((c) => c.id));
console.log("cluster:");
for (const c of cluster) console.log(`  ${c.id.slice(0, 8)} [${c.item_type}] "${c.title.slice(0, 48)}"  related_items=${(c.related_items || []).length}`);

// intelligence_item_citations: which sources each item cites
console.log("\n── intelligence_item_citations (brief->source) per item ──");
const citedByItem = new Map();
for (const c of cluster) {
  const { data } = await sb.from("intelligence_item_citations").select("source_id,origin").eq("intelligence_item_id", c.id);
  citedByItem.set(c.id, new Set((data || []).map((r) => r.source_id)));
  console.log(`  ${c.id.slice(0, 8)}: ${data?.length || 0} cited sources`);
}
// shared sources between cluster items (= implicit corroboration overlap)
console.log("\n── shared cited sources between cluster items (overlap = same-subject signal) ──");
for (let i = 0; i < cluster.length; i++) for (let j = i + 1; j < cluster.length; j++) {
  const a = citedByItem.get(cluster[i].id), b = citedByItem.get(cluster[j].id);
  const shared = [...a].filter((x) => b.has(x));
  if (shared.length) console.log(`  ${cluster[i].id.slice(0, 8)} ∩ ${cluster[j].id.slice(0, 8)} = ${shared.length} shared source(s)`);
}

// item_cross_references involving any cluster item
console.log("\n── item_cross_references (item<->item) touching the cluster ──");
const { data: xrefs } = await sb.from("item_cross_references").select("source_item_id,target_item_id,relationship");
const touching = (xrefs || []).filter((x) => idset.has(x.source_item_id) || idset.has(x.target_item_id));
console.log(`  total item_cross_references rows in DB: ${xrefs?.length || 0}; touching cluster: ${touching.length}`);
for (const x of touching) console.log(`    ${String(x.source_item_id).slice(0, 8)} -[${x.relationship}]-> ${String(x.target_item_id).slice(0, 8)}`);

// related_items linking cluster items to each other
console.log("\n── related_items linking cluster items to each other ──");
let any = false;
for (const c of cluster) for (const r of c.related_items || []) if (idset.has(r)) { console.log(`    ${c.id.slice(0, 8)} -> ${String(r).slice(0, 8)}`); any = true; }
if (!any) console.log("    (none — no cluster item lists another cluster item in related_items)");
process.exit(0);
