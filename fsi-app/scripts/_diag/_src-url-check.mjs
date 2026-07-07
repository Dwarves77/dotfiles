// READ-ONLY: of the sub-floor reg items, how many have an ENACTED source_url vs a PORTAL source_url?
// (synthesiseAndWriteBrief treats source_url's content as the FULL primary; corroborators are trimmed —
// so a PORTAL source_url anchors re-synthesis on the portal and preserves sub-floor grounding even though
// the enacted text sits in the pool as a trimmed corroborator. ENACTED source_url -> re-synthesis anchors
// on the law -> grounds to T1/2.) Also prints last_regenerated_at to compare against the GUARD-4 date.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const all = async (t, c) => { const o = []; for (let f = 0; ; f += 1000) { const { data } = await sb.from(t).select(c).order("id").range(f, f + 999); if (!data?.length) break; o.push(...data); if (data.length < 1000) break; } return o; };
const REG = new Set(["regulation", "directive", "standard", "guidance", "framework"]);
const ENACTED = /eur-lex\.europa\.eu\/(legal-content|eli)|federalregister\.gov\/documents|\/eli\/|legislation\.gov\.uk\/[a-z]+\/\d|ecfr\.gov|planalto\.gov\.br\/ccivil/i;

const items = (await all("intelligence_items", "id,title,item_type,priority,is_archived,source_url,last_regenerated_at")).filter((r) => REG.has(r.item_type) && !r.is_archived && ["CRITICAL", "HIGH"].includes(r.priority));
const byId = new Map(items.map((r) => [r.id, r]));
const claims = await all("section_claim_provenance", "intelligence_item_id,claim_kind,source_tier_at_grounding");
const sub = new Set();
for (const c of claims) { if (c.claim_kind !== "FACT" || !byId.has(c.intelligence_item_id)) continue; if (c.source_tier_at_grounding == null || c.source_tier_at_grounding > 2) sub.add(c.intelligence_item_id); }
let enacted = 0, portal = 0;
for (const id of sub) { const it = byId.get(id); const isE = ENACTED.test(it.source_url || ""); if (isE) enacted++; else portal++; console.log(`  ${isE ? "ENACTED" : "PORTAL "} ${id.slice(0, 8)} regen=${(it.last_regenerated_at || "never").slice(0, 10)} ${(it.source_url || "").slice(0, 60)}`); }
console.log(`\n  ENACTED source_url: ${enacted}   PORTAL source_url: ${portal}   (of ${sub.size} sub-floor items)`);
process.exit(0);
