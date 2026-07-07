// READ-ONLY proof of the Layer B gate's verdict on REAL verified items (no Sonnet spend). Shows the gate
// FAILS a per-item-verified-but-cross-item-DIRTY item (the exact class the mig-115 per-item trigger lets
// through) and PASSES a clean one — i.e. it catches what the per-item gate cannot see.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { readClient } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(ROOT + "/.env.local"); } catch {}
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { crossItemAuditGate } = await jiti.import(resolve(ROOT, "src/lib/agent/audit-gate.ts"));
const { buildResolver } = await jiti.import(resolve(ROOT, "src/lib/sources/institution.ts"));
const sb = readClient();

const srcs = [];
for (let from = 0; ; from += 1000) { const { data } = await sb.from("sources").select("id,url,base_tier,effective_tier,tier_override").order("id").range(from, from + 999); if (!data?.length) break; srcs.push(...data); if (data.length < 1000) break; }
const resolver = buildResolver(srcs);
const items = [];
for (let from = 0; ; from += 1000) { const { data } = await sb.from("intelligence_items").select("id,legacy_id").eq("provenance_status", "verified").eq("is_archived", false).order("id").range(from, from + 999); if (!data?.length) break; items.push(...data); if (data.length < 1000) break; }
const claims = [];
for (let from = 0; ; from += 1000) { const { data } = await sb.from("section_claim_provenance").select("intelligence_item_id,claim_kind,search_result_id").order("id").range(from, from + 999); if (!data?.length) break; claims.push(...data); if (data.length < 1000) break; }
const srIds = [...new Set(claims.filter((c) => c.claim_kind === "FACT" && c.search_result_id).map((c) => c.search_result_id))];
const urlById = new Map();
for (let i = 0; i < srIds.length; i += 200) { const { data } = await sb.from("agent_run_searches").select("id,result_url").in("id", srIds.slice(i, i + 200)); for (const r of data || []) urlById.set(r.id, r.result_url); }
const nullByItem = new Map();
for (const c of claims) { if (c.claim_kind !== "FACT" || !c.search_result_id) continue; if (resolver.resolveSpan(urlById.get(c.search_result_id) || "").tier == null) nullByItem.set(c.intelligence_item_id, (nullByItem.get(c.intelligence_item_id) || 0) + 1); }
const verifiedIds = new Set(items.map((i) => i.id));
const dirty = [...nullByItem.entries()].filter(([id]) => verifiedIds.has(id)).sort((a, b) => b[1] - a[1])[0];
const clean = items.find((i) => !nullByItem.has(i.id));

console.log(`verified items: ${items.length} | of which cross-item-dirty (>=1 unregistered-span FACT): ${[...nullByItem.keys()].filter((id) => verifiedIds.has(id)).length}`);

async function runGate(label, id) {
  if (!id) { console.log(`\n[${label}] no candidate found`); return; }
  const res = await crossItemAuditGate(sb, id, 0);
  console.log(`\n[${label}] item ${id}`);
  console.log(`  verdict: ok=${res.ok}  detail=${res.detail.slice(0, 180)}`);
}
await runGate("DIRTY verified item (expect ok=false)", dirty?.[0]);
await runGate("CLEAN verified item (expect ok=true)", clean?.id);
process.exit(0);
