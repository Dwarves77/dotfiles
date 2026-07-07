import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url";
import { readClient, readAll } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."); try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const sb = readClient();
const items = await readAll("intelligence_items","id,legacy_id");
const it = items.find(x=>x.legacy_id==="japan-green-transformation-gx-freight-transport-standards");
const secs = await readAll("intelligence_item_sections","section_key,content_md",{match:q=>q.eq("item_id",it.id)});
const pool = await readAll("agent_run_searches","result_url,result_content_excerpt",{match:q=>q.eq("intelligence_item_id",it.id)});
const fetched = pool.filter(r=>(r.result_content_excerpt||"").length>200).map(r=>({url:r.result_url,text:r.result_content_excerpt}));
const user = `BRIEF SECTIONS:\n${secs.map(s=>`### SECTION ${s.section_key}\n${(s.content_md||"").slice(0,2200)}`).join("\n\n")}\n\n====\nSOURCE CONTENT:\n${fetched.map((b,i)=>`### SOURCE ${i+1} url=${b.url}\n${b.text.slice(0,16000)}`).join("\n\n")}`;
console.log(`japan ground request: sections=${secs.length} pool-rows=${pool.length} usable-sources=${fetched.length}`);
console.log(`user chars=${user.length} (~${Math.round(user.length/4)} tokens est) + max_tokens=24000`);
const resp = await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"content-type":"application/json","x-api-key":process.env.ANTHROPIC_API_KEY,"anthropic-version":"2023-06-01"},body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:24000,messages:[{role:"user",content:user}]})});
const d = await resp.json();
console.log(`HTTP ${resp.status}`);
console.log("FULL RESPONSE:", JSON.stringify(d).slice(0,600));
process.exit(0);
