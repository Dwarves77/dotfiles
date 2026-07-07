// READ-ONLY: why did CBAM (51b2c91e) quarantine after re-ground? Uses the AUDITED schema:
// section_claim_provenance has NO source_url — a claim's source is source_id (FK->sources.url) and
// search_result_id (FK->agent_run_searches.result_url) + source_tier_at_grounding (number).
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(ROOT + "/.env.local");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const hostOf = (u) => { try { return new URL(u).host.replace(/^www\./, ""); } catch { return "(none)"; } };

const ID = (await sb.from("intelligence_items").select("id,title").ilike("title", "%CBAM%").limit(10)).data.find((r) => r.id.startsWith("51b2c91e")).id;

const { data: vr } = await sb.rpc("validate_item_provenance", { p_item_id: ID });
const row = Array.isArray(vr) ? vr[0] : vr;
console.log(`provenance failures: ${(row?.failures || []).length}`);

const { data: cl } = await sb.from("section_claim_provenance")
  .select("claim_kind,source_tier_at_grounding,source_id,search_result_id,claim_text").eq("intelligence_item_id", ID);
const facts = (cl || []).filter((c) => c.claim_kind === "FACT");
const kinds = {}; for (const c of (cl || [])) kinds[c.claim_kind] = (kinds[c.claim_kind] || 0) + 1;
console.log(`claims=${(cl || []).length}  by kind: ${JSON.stringify(kinds)}`);

// resolve source hosts for FACT claims via source_id -> sources.url  and  search_result_id -> agent_run_searches.result_url
const srcIds = [...new Set(facts.map((c) => c.source_id).filter(Boolean))];
const resIds = [...new Set(facts.map((c) => c.search_result_id).filter(Boolean))];
const srcMap = new Map(); if (srcIds.length) { const { data } = await sb.from("sources").select("id,url,base_tier,effective_tier").in("id", srcIds); for (const s of data || []) srcMap.set(s.id, s); }
const resMap = new Map(); if (resIds.length) { const { data } = await sb.from("agent_run_searches").select("id,result_url").in("id", resIds); for (const r of data || []) resMap.set(r.id, r.result_url); }

const urlOf = (c) => srcMap.get(c.source_id)?.url || resMap.get(c.search_result_id) || "";
const tierDist = {}; for (const c of facts) { const t = c.source_tier_at_grounding ?? "null"; tierDist[t] = (tierDist[t] || 0) + 1; }
console.log(`FACT claims=${facts.length}  by source_tier_at_grounding: ${JSON.stringify(tierDist)}  (reg floor = <=2)`);
const hostDist = {}; for (const c of facts) { const h = hostOf(urlOf(c)); hostDist[h] = (hostDist[h] || 0) + 1; }
console.log(`FACT by source host: ${JSON.stringify(hostDist, null, 1)}`);

console.log(`\nSUB-FLOOR FACT claims (tier null or >2 — the quarantine cause):`);
for (const c of facts.filter((c) => c.source_tier_at_grounding == null || c.source_tier_at_grounding > 2))
  console.log(`  T${c.source_tier_at_grounding ?? "null"}  ${hostOf(urlOf(c)).padEnd(34)} | ${(c.claim_text || "").slice(0, 72)}`);

// is the 2025 amending act registered?
const { data: amd } = await sb.from("sources").select("url,base_tier,status").or("url.ilike.%32025R2083%,url.ilike.%2025R2083%,url.ilike.%2025/2083%");
console.log(`\n2025/2083 amending act registered in sources: ${JSON.stringify(amd || [])}`);
process.exit(0);
