// BLAST-RADIUS (read-only): how many currently-VERIFIED reg-family items would re-quarantine under
// enacted-text-origin grounding (reg FACT must trace to enacted text, not guidance/opinion). PROXY: classify
// each FACT span's host via the EXISTING classifySourceRole; a span on a NON primary_legal_authority host is
// not enacted text. This is an UPPER BOUND — follow-through-to-origin can recover spans that merely RELAY a
// primary (the law firm citing the directive → ground against the directive). No spend.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { readClient } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(ROOT + "/.env.local"); } catch {}
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { classifySourceRole } = await jiti.import(resolve(ROOT, "src/lib/sources/classify-source-role.ts"));
const { hostOf } = await jiti.import(resolve(ROOT, "src/lib/sources/institution.ts"));
const sb = readClient();

async function pageAll(table, cols, applyMatch) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    let q = sb.from(table).select(cols).order("id").range(from, from + 999);
    if (applyMatch) q = applyMatch(q);
    const { data, error } = await q; if (error) throw new Error(`${table}: ${error.message}`);
    if (!data?.length) break; rows.push(...data); if (data.length < 1000) break;
  }
  return rows;
}

const REG_FAMILY = ["regulation", "directive", "standard", "guidance", "framework"];
const items = await pageAll("intelligence_items", "id,item_type,priority,provenance_status",
  (q) => q.eq("provenance_status", "verified").eq("is_archived", false).in("item_type", REG_FAMILY));
const itemById = new Map(items.map((i) => [i.id, i]));
const claims = await pageAll("section_claim_provenance", "intelligence_item_id,claim_kind,search_result_id");
const srIds = [...new Set(claims.filter((c) => c.claim_kind === "FACT" && c.search_result_id && itemById.has(c.intelligence_item_id)).map((c) => c.search_result_id))];
const urlById = new Map();
for (let i = 0; i < srIds.length; i += 200) { const { data } = await sb.from("agent_run_searches").select("id,result_url").in("id", srIds.slice(i, i + 200)); for (const r of data || []) urlById.set(r.id, r.result_url); }

// per reg-family item: classify each FACT span host
const PLA = "primary_legal_authority";
const roleHist = new Map();          // role -> span count (non-enacted only)
const itemState = new Map();         // itemId -> { facts, nonEnacted }
for (const c of claims) {
  if (c.claim_kind !== "FACT" || !c.search_result_id || !itemById.has(c.intelligence_item_id)) continue;
  const url = urlById.get(c.search_result_id) || "";
  const host = hostOf(url);
  const role = classifySourceRole(host, url); // proxy: enacted ~ primary_legal_authority
  const st = itemState.get(c.intelligence_item_id) || { facts: 0, nonEnacted: 0 };
  st.facts++;
  if (role !== PLA) { st.nonEnacted++; roleHist.set(role || "unclassified", (roleHist.get(role || "unclassified") || 0) + 1); }
  itemState.set(c.intelligence_item_id, st);
}

let wouldRequarantine = 0, allEnacted = 0, noFacts = 0, highPrio = 0;
for (const it of items) {
  const st = itemState.get(it.id);
  if (!st || st.facts === 0) { noFacts++; continue; }
  if (st.nonEnacted > 0) { wouldRequarantine++; if (["CRITICAL", "HIGH"].includes(it.priority)) highPrio++; }
  else allEnacted++;
}

console.log(`══ BLAST RADIUS — enacted-text-origin grounding on verified reg-family items ══`);
console.log(`verified reg-family items: ${items.length}`);
console.log(`  WOULD re-quarantine (>=1 FACT span on a non-enacted/non-PLA host): ${wouldRequarantine}   [UPPER BOUND]`);
console.log(`     of which CRITICAL/HIGH priority: ${highPrio}`);
console.log(`  all FACT spans already on primary-legal-authority hosts (likely safe): ${allEnacted}`);
console.log(`  no FACT spans (n/a to this gate): ${noFacts}`);
console.log(`\n  NOTE: UPPER BOUND. Follow-through-to-origin recovers spans that merely RELAY a primary (cite the`);
console.log(`        directive/ruling) by grounding against that primary; only terminal-opinion spans truly drop.`);
console.log(`\n══ the non-enacted FACT spans, by source role (where the dirt is) ══`);
for (const [r, n] of [...roleHist.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(5)}  ${r}`);
process.exit(0);
