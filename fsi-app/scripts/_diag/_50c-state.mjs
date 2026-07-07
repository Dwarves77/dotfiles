// READ-ONLY state of 50ccd5cc before any re-ground. Establishes the verification contract: what is its
// current provenance_status, what pool did its generation store, what claims exist now, what is keeping
// it quarantined, and is there a deferral/integrity record. NO writes, NO Browserless (fetch reachability
// already proven separately). Resolve schema first (column names) so the reads can't silently mis-select.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const { readClient, readAll } = await import("../lib/db.mjs");
const sb = readClient();

// 1. the item — id is a uuid (no ilike); read ids and match the prefix in JS, then fetch the full row.
const allItems = await readAll("intelligence_items", "id");
const hit = (allItems || []).find((i) => String(i.id).startsWith("50ccd5cc"));
if (!hit) { console.log(`50ccd5cc NOT FOUND among ${allItems?.length || 0} items`); process.exit(0); }
const { data: items } = await sb.from("intelligence_items").select("*").eq("id", hit.id);
const it = items?.[0];
if (!it) { console.log("50ccd5cc NOT FOUND"); process.exit(0); }
const show = (o, keys) => keys.filter((k) => k in o).map((k) => `${k}=${JSON.stringify(o[k])?.slice(0, 90)}`).join("\n  ");
console.log("=== intelligence_items (50ccd5cc) ===");
console.log("  " + show(it, ["id", "title", "item_type", "source_url", "provenance_status", "status", "jurisdiction", "regeneration_skill_version", "agent_integrity_flag", "agent_integrity_phrase", "updated_at", "created_at"]));
console.log("  ALL COLUMNS:", Object.keys(it).join(", "));

// 2. stored generation pool
const { data: pool } = await sb.from("agent_run_searches").select("result_url,result_content_excerpt,search_query").eq("intelligence_item_id", it.id);
console.log(`\n=== agent_run_searches pool: ${pool?.length || 0} rows ===`);
for (const p of (pool || []).sort((a, b) => (b.result_content_excerpt?.length || 0) - (a.result_content_excerpt?.length || 0)))
  console.log(`  [${(p.result_content_excerpt || "").length}ch] ${p.result_url}`);

// 3. current claim ledger
const { data: claims } = await sb.from("section_claim_provenance").select("*").eq("intelligence_item_id", it.id);
console.log(`\n=== section_claim_provenance: ${claims?.length || 0} claims ===`);
if (claims?.length) {
  console.log("  claim columns:", Object.keys(claims[0]).join(", "));
  const byStatus = {};
  for (const c of claims) { const k = c.verification_status || c.status || "?"; byStatus[k] = (byStatus[k] || 0) + 1; }
  console.log("  by status:", JSON.stringify(byStatus));
}

// 4. integrity flags on the item
const { data: flags } = await sb.from("integrity_flags").select("category,description,status,created_by,created_at").or(`subject_ref.eq.${it.id}`);
console.log(`\n=== integrity_flags (subject_ref=item): ${flags?.length || 0} ===`);
for (const f of flags || []) console.log(`  [${f.status}] ${f.category} — ${(f.description || "").slice(0, 110)} (${f.created_by})`);

process.exit(0);
