// HAPPY-PATH proof: a CLEAN item completes through the FULL gated workflow — grounds (per-item verified)
// -> reaches auditGateStep -> gate passes -> stands verified. Proves Layer B's PASS branch in-workflow
// (the complement to the dirty-item FAIL already proven). Uses refresh=false to re-synthesise from the
// SAME stored pool that already grounded, minimising regeneration drift. Snapshots before mutating.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import { createJiti } from "jiti";
import { readClient } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(ROOT + "/.env.local"); } catch {}
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { generateBriefWorkflow } = await jiti.import(resolve(ROOT, "src/workflows/generate-brief.ts"));
const { buildResolver } = await jiti.import(resolve(ROOT, "src/lib/sources/institution.ts"));
const sb = readClient();
const ID = "007104ed-b4e4-4735-b7ac-c16bc214c1eb"; // Singapore Maritime Decarbonisation reg — verified, cross-item clean

async function nullFacts(itemId) {
  const srcs = [];
  for (let from = 0; ; from += 1000) { const { data } = await sb.from("sources").select("id,url,base_tier,effective_tier,tier_override").order("id").range(from, from + 999); if (!data?.length) break; srcs.push(...data); if (data.length < 1000) break; }
  const resolver = buildResolver(srcs);
  const { data: claims } = await sb.from("section_claim_provenance").select("claim_kind,search_result_id").eq("intelligence_item_id", itemId);
  const srIds = [...new Set((claims || []).filter((c) => c.claim_kind === "FACT" && c.search_result_id).map((c) => c.search_result_id))];
  const urlById = new Map();
  for (let i = 0; i < srIds.length; i += 200) { const { data } = await sb.from("agent_run_searches").select("id,result_url").in("id", srIds.slice(i, i + 200)); for (const r of data || []) urlById.set(r.id, r.result_url); }
  let facts = 0, nulls = 0;
  for (const c of claims || []) { if (c.claim_kind !== "FACT" || !c.search_result_id) continue; facts++; if (resolver.resolveSpan(urlById.get(c.search_result_id) || "").tier == null) nulls++; }
  return { facts, nulls };
}

const before = await nullFacts(ID);
console.log(`BEFORE: prov=verified, FACT=${before.facts}, unregistered-span(null)=${before.nulls}`);
const { data: full } = await sb.from("intelligence_items").select("*").eq("id", ID).single();
writeFileSync(resolve(ROOT, "scripts/_diag/_happy-snapshot.json"), JSON.stringify(full, null, 2));
console.log("snapshot -> scripts/_diag/_happy-snapshot.json");
// erase to force the full gated path (section + ground run only when the item is NOT already verified)
await sb.from("intelligence_items").update({ full_brief: null, updated_at: new Date().toISOString() }).eq("id", ID);
await sb.from("intelligence_item_sections").delete().eq("item_id", ID);
await sb.from("section_claim_provenance").delete().eq("intelligence_item_id", ID);
console.log("erased; running gated workflow (refresh=false -> reuse stored pool)...");

const t = Date.now();
const r = await generateBriefWorkflow(ID, false);
console.log(`\nstatus=${r.status} (${((Date.now() - t) / 1000).toFixed(0)}s)`);
const keys = Object.keys(r.steps || {});
console.log(`steps: ${keys.join(" -> ")}  ${keys.includes("auditGate") ? "(auditGate REACHED ✓)" : "(auditGate NOT reached)"}`);
for (const [k, v] of Object.entries(r.steps || {})) console.log(`  ${k.padEnd(13)} ${typeof v === "object" ? JSON.stringify(v).slice(0, 150) : v}`);
const { data: it } = await sb.from("intelligence_items").select("provenance_status,is_archived,full_brief").eq("id", ID).single();
const after = await nullFacts(ID);
console.log(`\nAFTER: prov=${it.provenance_status} briefLen=${(it.full_brief || "").length} customer-visible=${it.provenance_status === "verified" && !it.is_archived ? "YES ✓" : "NO"}`);
console.log(`AFTER: FACT=${after.facts}, unregistered-span(null)=${after.nulls}`);
console.log(`\nGATE: ${r.steps?.auditGate ? JSON.stringify(r.steps.auditGate) : "(not reached)"}`);
process.exit(0);
