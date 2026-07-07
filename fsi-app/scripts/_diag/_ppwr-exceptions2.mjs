import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readClient } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(ROOT + "/.env.local"); } catch {}
const sb = readClient();
const EXC = /\b(except|exception|exempt|exemption|derogat|excluded|exclud|does not apply|shall not apply|not applicable|carve[- ]?out|threshold|micro[- ]?enterprise|waiver|unless|provided that)\b/gi;
const KNOWN = /\b(micro[- ]?enterprise|cardboard|paper-based|wine|spirit|medical|pharmaceutical|contact[- ]sensitive|immediate (packaging|contact)|derogation)\b/gi;
const { data } = await sb.from("intelligence_items")
  .select("id,legacy_id,title,item_type,provenance_status,is_archived,full_brief")
  .or("legacy_id.ilike.%packaging%,legacy_id.ilike.%ppwr%,title.ilike.%packaging%,title.ilike.%PPWR%");
for (const it of (data||[]).sort((a,b)=> (a.provenance_status>b.provenance_status?1:-1))) {
  const b = it.full_brief || "";
  const exc = [...new Set([...b.matchAll(EXC)].map((m) => m[0].toLowerCase()))];
  const known = [...new Set([...b.matchAll(KNOWN)].map((m) => m[0].toLowerCase()))];
  const reqs = (b.match(/\b(must|shall|required|mandates|obligat|prohibit)\b/gi) || []).length;
  console.log(`\n=== ${it.id.slice(0,8)} [${it.provenance_status}${it.is_archived?",ARCH":""}] ${it.item_type} briefLen=${b.length}`);
  console.log(`    title: ${(it.title||"(none)").slice(0,130)}`);
  console.log(`    requirement-language: ${reqs} | exception-language: ${exc.length} ${exc.length?"{"+exc.slice(0,14).join(", ")+"}":"(NONE)"}`);
  console.log(`    KNOWN PPWR carve-outs: ${known.length?known.join(", "):"(NONE)"}`);
}
process.exit(0);
