/** Slot-fit triage (read-only): categorize item_type='tool' items -> institutional-body (->registry),
 *  data-tool (cluster check -> tool-variant), or genuine tool. */
import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url"; import { createClient } from "@supabase/supabase-js";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."); process.loadEnvFile(resolve(ROOT, ".env.local"));
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data } = await sb.from("intelligence_items").select("id,legacy_id,title,summary,source_url,provenance_status").eq("item_type","tool").eq("is_archived",false).order("title");
console.log(`item_type='tool' non-archived: ${(data||[]).length}\n`);
const inst=[],dataTool=[],other=[];
for(const r of data||[]){ const t=((r.title||"")+" "+(r.summary||"")).toLowerCase();
  if(/\b(eea|eclac|oecd|agency|environment agency|commission|organization overview|institutional)\b/.test(t)) inst.push(r);
  else if(/\b(explorer|dashboard|portal|data|statistics|api|database|price|tracker|index|open data)\b/.test(t)) dataTool.push(r);
  else other.push(r); }
const show=(lbl,a)=>{console.log(`\n=== ${lbl} (${a.length}) ===`); for(const r of a) console.log(`  ${r.id.slice(0,8)} [${r.provenance_status.slice(0,9)}] ${(r.title||"").slice(0,60)}`);};
show("INSTITUTIONAL-BODY -> sources registry / reclassify out", inst);
show("DATA-TOOL -> cluster? (tool-variant of Technology format)", dataTool);
show("OTHER / genuine tool", other);
console.log(`\nCLUSTER CHECK: data-tools=${dataTool.length} ${dataTool.length>=4?"-> REAL CLUSTER (justifies a tool-variant)":"-> not yet a cluster"}`);
process.exit(0);
