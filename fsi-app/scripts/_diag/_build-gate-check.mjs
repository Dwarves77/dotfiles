// READ-ONLY build-gate check (retrieval-before-construction applied to the build). Answers:
//  CHECK 1 (DATA): are the 301 sub-floor facts already partially remediated (prior relabel run / flags),
//    and — the decisive cost question — how many are INTERNAL-RECOVERABLE RIGHT NOW (the fact's span is
//    already verbatim in a T1/2 source in the item's OWN pool -> a plain reground re-stamps it free, no
//    fetch), vs need a FETCH (authoritative source not in pool) vs are genuinely contextual.
//  Also: do the items already carry ANALYSIS claims / prior phase2 flags?
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { createClient } from "@supabase/supabase-js";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { buildResolver } = await jiti.import("../../src/lib/sources/institution.ts");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const all = async (t, c) => { const o = []; for (let f = 0; ; f += 1000) { const { data } = await sb.from(t).select(c).order("id").range(f, f + 999); if (!data?.length) break; o.push(...data); if (data.length < 1000) break; } return o; };
const REG = new Set(["regulation", "directive", "standard", "guidance", "framework"]);

const items = (await all("intelligence_items", "id,title,item_type,priority,is_archived")).filter((r) => REG.has(r.item_type) && !r.is_archived && ["CRITICAL", "HIGH"].includes(r.priority));
const byId = new Map(items.map((r) => [r.id, r]));
const sources = await all("sources", "id,url,base_tier,effective_tier,tier_override");
const resolver = buildResolver(sources);
const claims = await all("section_claim_provenance", "intelligence_item_id,claim_kind,source_tier_at_grounding,source_span,claim_text");

// sub-floor FACTs per item
const subByItem = new Map();
for (const c of claims) { if (c.claim_kind !== "FACT" || !byId.has(c.intelligence_item_id)) continue; if (!(c.source_tier_at_grounding == null || c.source_tier_at_grounding > 2)) continue; (subByItem.get(c.intelligence_item_id) || subByItem.set(c.intelligence_item_id, []).get(c.intelligence_item_id)).push(c); }
const subItemIds = [...subByItem.keys()];

// CHECK 1a — prior remediation: integrity_flags + existing ANALYSIS on these items
const flags = await all("integrity_flags", "subject_ref,created_by,status");
const flagBy = {}; for (const f of flags) { if (!subByItem.has(f.subject_ref)) continue; flagBy[f.created_by] = (flagBy[f.created_by] || 0) + 1; }
const analysisOnSub = claims.filter((c) => c.claim_kind === "ANALYSIS" && subByItem.has(c.intelligence_item_id));

console.log(`=== CHECK 1 — DATA (19 sub-floor items, ${[...subByItem.values()].reduce((a,b)=>a+b.length,0)} sub-floor FACTs) ===`);
console.log(`prior integrity_flags on these items by created_by: ${JSON.stringify(flagBy)}`);
console.log(`existing ANALYSIS claims already on these items: ${analysisOnSub.length}`);

// CHECK 1b — internal-recoverable NOW: span already verbatim in a T1/2 pool source for the SAME item
const INTERNAL = "INTERNAL(free reground)", FETCH = "FETCH(authoritative not in pool)";
let internal = 0, fetch = 0;
const perItem = [];
for (const itemId of subItemIds) {
  const { data: pool } = await sb.from("agent_run_searches").select("result_url,result_content_excerpt").eq("intelligence_item_id", itemId);
  // authoritative (T1/2) pool text for this item
  const authText = (pool || []).filter((p) => { const t = resolver.resolveSpan(p.result_url).tier; return t != null && t <= 2; }).map((p) => (p.result_content_excerpt || "").toLowerCase()).join("\n");
  const authHosts = [...new Set((pool || []).filter((p) => { const t = resolver.resolveSpan(p.result_url).tier; return t != null && t <= 2; }).map((p) => { try { return new URL(p.result_url).host; } catch { return "?"; } }))];
  let nIn = 0, nAbs = 0;
  for (const c of subByItem.get(itemId)) { const span = (c.source_span || "").toLowerCase().trim(); if (span.length > 12 && authText.includes(span)) { nIn++; internal++; } else { nAbs++; fetch++; } }
  perItem.push({ id: itemId.slice(0,8), title: String(byId.get(itemId).title).slice(0,30), nIn, nAbs, authHosts: authHosts.length, authChars: authText.length });
}
console.log(`\n=== CHECK 1b — internal-recoverable vs fetch (the cost crux) ===`);
console.log(`sub-floor FACTs INTERNAL-recoverable NOW (span in own T1/2 pool source -> free reground): ${internal}`);
console.log(`sub-floor FACTs needing FETCH (authoritative source not in pool):                          ${fetch}`);
console.log(`\nper item (nIn=internal / nAbs=needs-fetch / authHosts=#T1-2 pool hosts / authChars):`);
for (const p of perItem.sort((a,b)=>b.nAbs-a.nAbs)) console.log(`  ${p.id} ${p.title.padEnd(31)} in=${String(p.nIn).padStart(3)} fetch=${String(p.nAbs).padStart(3)} T12hosts=${p.authHosts} authChars=${p.authChars}`);
process.exit(0);
