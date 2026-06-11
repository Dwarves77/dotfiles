/** P0-1 PHASE 0a SIMULATION (read-only). GOVERNING: source-credibility-model + remediation-discipline.
 *  Treat the genuinely-authoritative official unregistered hosts AS IF registered at honest tier, plus
 *  the 13 T7 academics re-tiered, and recompute the Option-B flip set. Answers: does honest registry
 *  completion change the flip count, or are the 32 reg flips robust (driven by secondary/NULL claims)?
 *  Verification-before-authorization: simulate -> report the honest flip count -> THEN do the writes.
 *  PURE READS.
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readAll } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}

const hostOf = (u) => { try { return new URL(u).host.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };
const HIGH = new Set(["CRITICAL", "HIGH"]);
const REG_TYPES = new Set(["regulation", "directive", "standard", "guidance", "framework"]);
const tierOf = (s) => (s == null ? null : (s.effective_tier ?? s.base_tier ?? null));
const passesFloor = (t) => t === 1 || t === 2;

// AUTHORITATIVE official hosts to register at honest tier (gov / regulator / IGO / official record).
// Only T1-2 can rescue a reg claim under the reg-only floor; T3 (UNESCO) is honest completion but
// does NOT pass the floor. Secondary hosts (law firms, trade press, advisory) are NOT here -> stay NULL.
const AUTH = {
  "gao.gov": 2, "questions-statements.parliament.uk": 2, "english.www.gov.cn": 2,
  "sos.state.tx.us": 2, "governor.nc.gov": 2, "mof.go.jp": 2, "cssf.lu": 2,
  "dehst.de": 2, "osc.ny.gov": 2, "business.gov.uk": 2, "whc.unesco.org": 3,
};
// 13 T7 academics re-tiered per the model (NLR = DOE national lab T2; maritime trade press T5; rest academic T3).
const RETIER = {
  "nlr.gov": 2, "maritimecarbonintelligence.com": 5,
  "cranfield.ac.uk": 3, "sei.org": 3, "csrf.ac.uk": 3, "wri.org": 3,
  "iml.fraunhofer.de": 3, "tandfonline.com": 4, "erim.eur.nl": 3, "tyndall.ac.uk": 3,
  "sustainable.mit.edu": 3,
};

const items   = await readAll("intelligence_items", "id,legacy_id,title,item_type,priority,is_archived");
const sources = await readAll("sources", "id,url,base_tier,effective_tier");
const claims  = await readAll("section_claim_provenance", "id,intelligence_item_id,claim_kind,source_id,search_result_id");
const searches = await readAll("agent_run_searches", "id,result_url");

const itemById = new Map(items.map((i) => [i.id, i]));
const srcById = new Map(sources.map((s) => [s.id, s]));
const srcByHost = new Map(); for (const s of sources) { const h = hostOf(s.url); if (h && !srcByHost.has(h)) srcByHost.set(h, s); }
const searchById = new Map(searches.map((r) => [r.id, r]));

function simTier(c) {
  if (c.search_result_id && searchById.has(c.search_result_id)) {
    const h = hostOf(searchById.get(c.search_result_id).result_url);
    if (h) {
      if (RETIER[h] != null) return RETIER[h];          // re-tiered academic/T7
      if (srcByHost.has(h)) { const t = tierOf(srcByHost.get(h)); if (t != null) return RETIER[h] ?? t; }
      if (AUTH[h] != null) return AUTH[h];               // newly-registered authoritative
      return null;                                       // still unregistered -> NULL
    }
  }
  if (c.source_id && srcById.has(c.source_id)) { const t = tierOf(srcById.get(c.source_id)); if (t != null) return t; }
  return null;
}

const flipRegs = new Set();
const flipNonReg = new Set();
for (const c of claims) {
  if (c.claim_kind !== "FACT") continue;
  const it = itemById.get(c.intelligence_item_id);
  if (!it || it.is_archived || !HIGH.has(it.priority)) continue;
  if (passesFloor(simTier(c))) continue;
  if (REG_TYPES.has(it.item_type)) flipRegs.add(it.legacy_id || it.id.slice(0, 8));
  else flipNonReg.add(it.legacy_id || it.id.slice(0, 8));
}

console.log(`=== PHASE 0 SIMULATION (auth hosts registered + 13 T7 re-tiered) ===`);
console.log(`Option-B flip set AFTER honest registry completion:`);
console.log(`  regulatory items FLIP: ${flipRegs.size}  (was 32 pre-Phase-0)`);
console.log(`  non-reg exempt items still floor-failing (no flip): ${flipNonReg.size}`);
console.log(`\nregs that FLIP (honest, post-Phase-0):`);
console.log([...flipRegs].sort().join(", "));
process.exit(0);
