import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readClient } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(ROOT + "/.env.local"); } catch {}
const sb = readClient();
const { data } = await sb.from("intelligence_items").select("full_brief,source_url").eq("id","efdb3390-0000-0000-0000-000000000000");
// id prefix won't match; fetch by title instead
const { data: d2 } = await sb.from("intelligence_items").select("id,full_brief,source_url").ilike("title","%PPWR 2025/40%").limit(1);
const it = d2?.[0]; const b = it?.full_brief || "";
console.log(`PPWR reg ${it?.id?.slice(0,8)} source_url=${it?.source_url}`);
console.log(`briefLen=${b.length}\n`);
// sentences mentioning an exception/qualification
const sents = b.split(/(?<=[.!?])\s+/);
const exRe = /\b(except|exempt|exemption|derogat|excluded|does not apply|shall not apply|threshold|micro|unless|provided that)\b/i;
const hits = sents.filter((s) => exRe.test(s)).slice(0, 8);
console.log(`--- sentences carrying a qualification (${hits.length} shown) ---`);
for (const s of hits) console.log(`  • ${s.replace(/\s+/g," ").trim().slice(0,220)}`);
// a few requirement sentences to show if they carry qualifications inline
const reqRe = /\b(must|shall|required to|mandates|obligat|prohibit)\b/i;
const reqs = sents.filter((s) => reqRe.test(s) && !exRe.test(s)).slice(0, 5);
console.log(`\n--- requirement sentences with NO inline qualification (${reqs.length} shown) ---`);
for (const s of reqs) console.log(`  • ${s.replace(/\s+/g," ").trim().slice(0,220)}`);
process.exit(0);
