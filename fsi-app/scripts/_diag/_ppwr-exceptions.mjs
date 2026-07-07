import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readClient } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(ROOT + "/.env.local"); } catch {}
const sb = readClient();
const IDS = ["5b8f3e8a","9d18608f","efdb3390"];
// PPWR is famously exception-heavy: known carve-outs include micro-enterprises, cardboard/paper,
// wine & spirits, medical/contact-sensitive packaging, and member-state derogations.
const EXC = /\b(except|exception|exempt|exemption|derogat|excluded|exclud|does not apply|shall not apply|not applicable|carve[- ]?out|threshold|micro[- ]?enterprise|waiver|condition(s|al)?|scope limit|unless|provided that|save (for|where))\b/gi;
const KNOWN = /\b(micro[- ]?enterprise|cardboard|paper-based|wine|spirit|medical|pharmaceutical|contact[- ]sensitive|immediate (packaging|contact)|derogation)\b/gi;
const { data } = await sb.from("intelligence_items").select("id,legacy_id,title,item_type,provenance_status,full_brief")
  .or(IDS.map((p) => `id.ilike.${p}%`).join(","));
for (const it of data || []) {
  const b = it.full_brief || "";
  const exc = [...b.matchAll(EXC)].map((m) => m[0].toLowerCase());
  const known = [...new Set([...b.matchAll(KNOWN)].map((m) => m[0].toLowerCase()))];
  const reqs = (b.match(/\b(must|shall|required|mandates|obligat|prohibit)\b/gi) || []).length;
  console.log(`\n=== ${it.id.slice(0,8)} [${it.provenance_status}] type=${it.item_type} briefLen=${b.length}`);
  console.log(`    title: ${(it.title||"").slice(0,120)}`);
  console.log(`    requirement-language hits: ${reqs}`);
  console.log(`    exception/qualification-language hits: ${exc.length}  ${exc.length ? "{"+[...new Set(exc)].slice(0,12).join(", ")+"}" : "(NONE)"}`);
  console.log(`    KNOWN PPWR carve-out terms present: ${known.length ? known.join(", ") : "(NONE)"}`);
}
process.exit(0);
