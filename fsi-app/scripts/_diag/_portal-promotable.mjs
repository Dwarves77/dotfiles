// READ-ONLY: for the PORTAL-sourced sub-floor items, does the pool contain a PROMOTABLE enacted doc
// (CELEX/ELI/FedReg/UK/IMO-MEPC/BR/CA, score>=4 per _reg-promote-from-pool's classifier)? If yes -> the
// 2-step pairing (re-point from pool -> re-synthesize) works, $0 fetch. If no -> genuine RE-SOURCE (enacted
// not in pool; fetch from a free host if classifiable, else honest GAP/manual). Splits the 10 portal items.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const all = async (t, c) => { const o = []; for (let f = 0; ; f += 1000) { const { data } = await sb.from(t).select(c).order("id").range(f, f + 999); if (!data?.length) break; o.push(...data); if (data.length < 1000) break; } return o; };
const REG = new Set(["regulation", "directive", "standard", "guidance", "framework"]);
const ENACTED = /eur-lex\.europa\.eu\/(legal-content|eli)|federalregister\.gov\/documents|\/eli\/|legislation\.gov\.uk\/[a-z]+\/\d|ecfr\.gov|planalto\.gov\.br\/ccivil/i;

// classify a pool URL → score (mirror of _reg-promote-from-pool.classifyUrl, promotable iff score>=4)
function score(raw) {
  let u = raw; try { u = decodeURIComponent(raw); } catch {}
  if (/com[_:]\d{4}[_/]\d+|comnat[:_]com|\/com_\d/i.test(u)) return 0;        // COM proposal
  if (/celex[:\s]*?\d\d{4}[A-Z]\d{3,4}/i.test(u)) return 6;
  if (/\/eli\/(reg|dir|dec)\/\d{4}\/\d+/i.test(u)) return 6;
  if (/federalregister\.gov\/documents\/\d{4}\/\d{2}\/\d{2}/i.test(u)) return 5;
  if (/legislation\.gov\.uk\/[a-z]+\/\d{4}\/\d+/i.test(u)) return 5;
  if (/wwwcdn\.imo\.org\/.+(MEPC|MSC)[._]?\s*\d+\(\d+\)/i.test(u)) return 4;
  if (/planalto\.gov\.br\/ccivil.*\/lei\/l\d+/i.test(u)) return 4;
  if (/leginfo\.legislature\.ca\.gov\/faces\/billtext.*bill_id=\d+/i.test(u)) return 4;
  return 1;
}

const items = (await all("intelligence_items", "id,title,item_type,priority,is_archived,source_url")).filter((r) => REG.has(r.item_type) && !r.is_archived && ["CRITICAL", "HIGH"].includes(r.priority));
const byId = new Map(items.map((r) => [r.id, r]));
const claims = await all("section_claim_provenance", "intelligence_item_id,claim_kind,source_tier_at_grounding");
const sub = new Set();
for (const c of claims) { if (c.claim_kind !== "FACT" || !byId.has(c.intelligence_item_id)) continue; if (c.source_tier_at_grounding == null || c.source_tier_at_grounding > 2) sub.add(c.intelligence_item_id); }
const portal = [...sub].filter((id) => !ENACTED.test(byId.get(id).source_url || ""));

let repointable = 0, resource = 0;
console.log(`=== PORTAL sub-floor items (${portal.length}): re-pointable-from-pool vs genuine RE-SOURCE ===`);
for (const id of portal) {
  const { data: pool } = await sb.from("agent_run_searches").select("result_url").eq("intelligence_item_id", id);
  const best = Math.max(0, ...(pool || []).map((p) => score(p.result_url || "")));
  const ok = best >= 4;
  if (ok) repointable++; else resource++;
  console.log(`  ${ok ? "RE-POINT ✓" : "RE-SOURCE "} ${id.slice(0, 8)} bestPoolScore=${best}  ${String(byId.get(id).title).slice(0, 34)}`);
}
console.log(`\n  re-pointable-from-pool (cheap 2-step): ${repointable}   genuine RE-SOURCE (enacted not in pool): ${resource}`);
process.exit(0);
