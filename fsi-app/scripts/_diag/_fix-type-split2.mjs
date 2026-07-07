// READ-ONLY tightened three-way fix-type split (v2). Firms the v1 heuristic before a hard quote:
//   - drops the over-broad bare "Article N" / "Annex" signal (a fact citing the BASE reg's article is NOT
//     a secondary-instrument retrieval — it's already in the pool);
//   - splits RETRIEVAL into FREE-HOST (EU instruments on eur-lex / federalregister / legislation.gov.uk ->
//     pinnable for free) vs NON-FREE (IMO/ICAO/etc -> can't freely fetch -> honest GAP / re-source);
//   - routes REQUIRED-SLOT sub-floor facts ([primary_deadline] etc.) away from RELABEL (a slot needs a
//     FACT or GAP, never ANALYSIS) -> RETRIEVAL if a free instrument, else GAP/RESOURCE.
// Buckets map to the three locked fix-types: RETRIEVAL (free), RELABEL (deterministic, near-free),
// RESOURCE (genuine reground / GAP / manual — includes non-free instruments + slot-gaps + legal-reqs).
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const all = async (t, c) => { const o = []; for (let f = 0; ; f += 1000) { const { data } = await sb.from(t).select(c).order("id").range(f, f + 999); if (!data?.length) break; o.push(...data); if (data.length < 1000) break; } return o; };
const REG = new Set(["regulation", "directive", "standard", "guidance", "framework"]);

// FREE-HOST secondary EU instrument (eur-lex et al. — pinnable for free). Strong signals only.
const FREE_INSTR = /(implementing|delegated|amending)\s+(act|regulation|decision|directive)|regulation\s*\(eu\)\s*\d{4}\/\d+|commission\s+(implementing|delegated)\s+(regulation|decision|act)|\bcelex\b|\b3\d{4}[rld]\d{4}\b/i;
// NON-FREE intergovernmental instrument (IMO/ICAO — not freely fetchable).
const NONFREE_INSTR = /\b(imo|mepc|marpol|seemp|icao|corsia)\b|\bcii\b|resolution\s+mepc/i;
// present-tense enacted-law requirement (migration-142 guard), exempt if forward-framed.
const LEGAL_REQ = /(the\s+(regulation|law|directive|rule|act|amendment|mechanism|standard)\s+(requires|mandates|obligates|prohibits|imposes))|(is\s+required\s+(under|by))|(legally\s+required)/i;
const FORWARD = /(propos|would|will|expected|forthcoming|consultation|draft|anticipat|pending|set\s+to|once\s+(adopted|enacted)|if\s+adopted|(by|from|effective|until)\s+20\d\d)/i;
const REQ_SLOT = /^\[(primary_deadline|jurisdictional_scope|effective_date|penalty_summary)\]/i;

function classify(text) {
  const t = String(text || "");
  const slot = REQ_SLOT.test(t);
  if (FREE_INSTR.test(t) && !NONFREE_INSTR.test(t)) return "RETRIEVAL";            // pin EU instrument -> T1/2 FACT
  if (NONFREE_INSTR.test(t)) return "RESOURCE";                                    // IMO/ICAO non-free -> GAP / manual
  if (slot) return "RESOURCE";                                                     // required slot, no free instrument -> GAP
  if (LEGAL_REQ.test(t) && !FORWARD.test(t)) return "RESOURCE";                     // present-tense legal req -> re-source
  return "RELABEL";                                                                // contextual/forward -> grounded-ANALYSIS
}

const items = (await all("intelligence_items", "id,title,item_type,priority,is_archived")).filter((r) => REG.has(r.item_type) && !r.is_archived && ["CRITICAL", "HIGH"].includes(r.priority));
const byId = new Map(items.map((r) => [r.id, r]));
const claims = await all("section_claim_provenance", "intelligence_item_id,claim_kind,source_tier_at_grounding,claim_text");
const subByItem = new Map();
for (const c of claims) { if (c.claim_kind !== "FACT" || !byId.has(c.intelligence_item_id)) continue; if (!(c.source_tier_at_grounding == null || c.source_tier_at_grounding > 2)) continue; (subByItem.get(c.intelligence_item_id) || subByItem.set(c.intelligence_item_id, []).get(c.intelligence_item_id)).push(c); }

const fc = { RETRIEVAL: 0, RESOURCE: 0, RELABEL: 0 };
const itemFix = new Map();
for (const [itemId, subs] of subByItem) { const set = new Set(); for (const c of subs) { const fx = classify(c.claim_text); fc[fx]++; set.add(fx); } itemFix.set(itemId, set); }

// per-item dominant: RETRIEVAL if any free-instrument fact (correctness: don't relabel a real primary);
// else RESOURCE if any; else pure RELABEL.
const ib = { "retrieval (>=1 free-instrument fact)": [], "resource (>=1 gap/legal/non-free)": [], "relabel-only (pure contextual)": [] };
for (const [id, set] of itemFix) { const it = byId.get(id); const tag = `${id.slice(0,8)} ${String(it.title).slice(0,30)}`; if (set.has("RETRIEVAL")) ib["retrieval (>=1 free-instrument fact)"].push(tag); else if (set.has("RESOURCE")) ib["resource (>=1 gap/legal/non-free)"].push(tag); else ib["relabel-only (pure contextual)"].push(tag); }

console.log(`=== TIGHTENED FIX-TYPE SPLIT (reg CRITICAL/HIGH, sub-floor FACTs) ===`);
console.log(`sub-floor items: ${subByItem.size}   sub-floor FACT claims: ${fc.RETRIEVAL + fc.RESOURCE + fc.RELABEL}\n`);
console.log(`per FACT:  RETRIEVAL(free)=${fc.RETRIEVAL}  RESOURCE(gap/legal/nonfree)=${fc.RESOURCE}  RELABEL(deterministic)=${fc.RELABEL}`);
console.log(`\nper ITEM (dominant):`);
for (const [k, v] of Object.entries(ib)) { console.log(`  ${k}: ${v.length}`); for (const t of v) console.log(`      ${t}`); }
process.exit(0);
