// READ-ONLY three-way fix-type split for the backward floor problem (no spend, no fetch). For every
// reg-family CRITICAL/HIGH item with >=1 SUB-FLOOR FACT (tier > 2 or NULL — what the authority floor
// quarantines), classify each sub-floor FACT into the fix it actually needs:
//   RETRIEVAL  — the fact references a specific identifiable EU SECONDARY INSTRUMENT (implementing /
//                delegated / amending act, a Regulation(EU) 20xx/nnn, a dated act, an Article/Annex). The
//                primary source exists and is T1/2 — it is just not in the pool. Fix = PIN the instrument
//                -> it grounds to T1/2 as a legit FACT. RELABEL would launder a real primary fact.
//   RESOURCE   — a PRESENT-TENSE enacted-law REQUIREMENT (legal-line pattern, not forward-framed) with NO
//                identifiable instrument reference. Needs genuine re-source or an honest GAP. Never relabel.
//   RELABEL    — genuinely non-primary contextual / forward claim (credible T3 analysis, early-signal,
//                forthcoming). Fix = DETERMINISTIC relabel FACT->grounded-ANALYSIS (the mechanism proven
//                on CBAM). Near-free.
// Per-item rollup = the set of fix-types its sub-floor facts need (an item can need more than one).
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const all = async (t, c) => { const o = []; for (let f = 0; ; f += 1000) { const { data } = await sb.from(t).select(c).order("id").range(f, f + 999); if (!data?.length) break; o.push(...data); if (data.length < 1000) break; } return o; };
const REG = new Set(["regulation", "directive", "standard", "guidance", "framework"]);

// references a specific identifiable EU secondary instrument -> the primary exists, pin it (RETRIEVAL)
const INSTRUMENT = /(implementing|delegated)\s+(act|regulation|decision)|amending\s+(regulation|directive)|regulation\s*\(eu\)\s*\d{4}\/\d+|directive\s*\d{4}\/\d+|\bcelex\b|\b3\d{4}[rld]\d{4}\b|commission\s+(implementing|delegated)|\b\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z.]*\s+20\d\d\b|\bannex\s+[ivx]+\b|\barticle\s+\d+/i;
// present-tense enacted-law requirement (the migration-142 guard pattern) ...
const LEGAL_REQ = /(the\s+(regulation|law|directive|rule|act|amendment|mechanism|standard)\s+(requires|mandates|obligates|prohibits|imposes))|(is\s+required\s+(under|by))|(legally\s+required)/i;
// ... unless forward-framed (then it is legitimate forward ANALYSIS -> RELABEL)
const FORWARD = /(propos|would|will|expected|forthcoming|consultation|draft|anticipat|pending|set\s+to|once\s+(adopted|enacted)|if\s+adopted|(by|from|effective|until)\s+20\d\d)/i;

function classify(text) {
  const t = String(text || "");
  if (INSTRUMENT.test(t)) return "RETRIEVAL";
  if (LEGAL_REQ.test(t) && !FORWARD.test(t)) return "RESOURCE";
  return "RELABEL";
}

const items = (await all("intelligence_items", "id,title,item_type,priority,is_archived,provenance_status")).filter((r) => REG.has(r.item_type) && !r.is_archived && ["CRITICAL", "HIGH"].includes(r.priority));
const byId = new Map(items.map((r) => [r.id, r]));
const claims = await all("section_claim_provenance", "intelligence_item_id,claim_kind,source_tier_at_grounding,claim_text");

const subByItem = new Map();
for (const c of claims) {
  if (c.claim_kind !== "FACT" || !byId.has(c.intelligence_item_id)) continue;
  if (!(c.source_tier_at_grounding == null || c.source_tier_at_grounding > 2)) continue; // sub-floor only
  (subByItem.get(c.intelligence_item_id) || subByItem.set(c.intelligence_item_id, []).get(c.intelligence_item_id)).push(c);
}

const factCount = { RETRIEVAL: 0, RESOURCE: 0, RELABEL: 0 };
const itemFix = new Map(); // itemId -> Set(fixtypes)
const samples = { RETRIEVAL: [], RESOURCE: [], RELABEL: [] };
for (const [itemId, subs] of subByItem) {
  const set = new Set();
  for (const c of subs) { const fx = classify(c.claim_text); factCount[fx]++; set.add(fx); if (samples[fx].length < 6) samples[fx].push(`[${itemId.slice(0,8)} T${c.source_tier_at_grounding ?? "null"}] ${String(c.claim_text).slice(0, 96)}`); }
  itemFix.set(itemId, set);
}

// per-item dominant: an item needs RETRIEVAL if ANY sub-floor fact is retrieval (the strictest correctness
// requirement — a real primary fact must not be relabeled). Then RESOURCE. Pure-RELABEL = only relabel needed.
const itemBuckets = { "retrieval (>=1 instrument fact)": 0, "resource (>=1 legal-req, no retrieval)": 0, "relabel-only (pure contextual/forward)": 0 };
for (const [, set] of itemFix) {
  if (set.has("RETRIEVAL")) itemBuckets["retrieval (>=1 instrument fact)"]++;
  else if (set.has("RESOURCE")) itemBuckets["resource (>=1 legal-req, no retrieval)"]++;
  else itemBuckets["relabel-only (pure contextual/forward)"]++;
}

console.log(`=== THREE-WAY FIX-TYPE SPLIT (reg-family CRITICAL/HIGH, sub-floor FACTs) ===`);
console.log(`sub-floor items: ${subByItem.size}   sub-floor FACT claims: ${factCount.RETRIEVAL + factCount.RESOURCE + factCount.RELABEL}\n`);
console.log(`--- per FACT ---`);
console.log(`  RETRIEVAL (pin secondary instrument -> T1/2 FACT): ${factCount.RETRIEVAL}`);
console.log(`  RESOURCE  (present-tense legal req, no instrument): ${factCount.RESOURCE}`);
console.log(`  RELABEL   (contextual/forward -> grounded-ANALYSIS): ${factCount.RELABEL}`);
console.log(`\n--- per ITEM (dominant fix; retrieval-correctness wins) ---`);
for (const [k, v] of Object.entries(itemBuckets)) console.log(`  ${k}: ${v}`);
for (const fx of ["RETRIEVAL", "RESOURCE", "RELABEL"]) { console.log(`\n  sample ${fx}:`); for (const s of samples[fx]) console.log(`    ${s}`); }
process.exit(0);
