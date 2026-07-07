// DIAGNOSTIC (read-only). (A) characterize non-FACT-stamped claims (claims-tier violations the A6 backfill
// can't touch): total, kind, how many on my 9 Path B items (self-inflicted via uncommitted WS1 grounded-
// ANALYSIS stamp). (B) 5cc10a6d pool size + which URL is the synthesis primary (fetched[0]) to confirm the
// synthesis-budget ÷ N-corroborators truncation of the binding legal text.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const NINE = ["7a0ead55","e2e03e1b","782878c0","5cc10a6d","8c186db2","15f63ea9","51b2c91e","6a857887","1e80067a"];

// (A) non-FACT carrying a stamp
let rows = [];
for (let f = 0; ; f += 1000) {
  const { data, error } = await sb.from("section_claim_provenance")
    .select("id,intelligence_item_id,claim_kind,source_tier_at_grounding")
    .neq("claim_kind", "FACT").not("source_tier_at_grounding", "is", null).order("id").range(f, f + 999);
  if (error) { console.error("A:", error.message); process.exit(1); }
  if (!data?.length) break; rows.push(...data); if (data.length < 1000) break;
}
const byKind = {}; for (const r of rows) byKind[r.claim_kind] = (byKind[r.claim_kind]||0)+1;
const isMine = (id) => NINE.some(p => id.startsWith(p));
const mine = rows.filter(r => isMine(r.intelligence_item_id));
console.log(`(A) non-FACT claims carrying a stamp: ${rows.length}  by_kind=${JSON.stringify(byKind)}`);
console.log(`    on my 9 Path B items (self-inflicted this session): ${mine.length}`);
console.log(`    on OTHER items (legacy/other generation): ${rows.length - mine.length}`);
const perItem = {}; for (const r of mine) { const k = r.intelligence_item_id.slice(0,8); perItem[k]=(perItem[k]||0)+1; }
console.log(`    per-item (mine): ${JSON.stringify(perItem)}`);

// (B) 5cc10a6d pool size + primary identity
const { data: it } = await sb.from("intelligence_items").select("id,source_url,title").like("id","5cc10a6d%").single();
if (it) {
  const { data: pool } = await sb.from("agent_run_searches").select("result_url,result_content_excerpt").eq("intelligence_item_id", it.id);
  const usable = (pool||[]).filter(r => (r.result_content_excerpt||"").length > 200);
  console.log(`\n(B) 5cc10a6d source_url(primary)= ${it.source_url}`);
  console.log(`    pool rows total=${(pool||[]).length} usable(>200ch)=${usable.length}  => perCorr≈ floor((560000 - primaryLen)/${Math.max(0,usable.length-1)})`);
  const longest = usable.map(r=>({u:r.result_url,n:(r.result_content_excerpt||"").length})).sort((a,b)=>b.n-a.n).slice(0,6);
  console.log(`    longest pool docs:`); for (const d of longest) console.log(`      ${d.n}  ${d.u}`);
}
process.exit(0);
