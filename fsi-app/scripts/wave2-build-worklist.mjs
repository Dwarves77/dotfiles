/** WAVE 2 worklist generator (operator GO 2026-07-15, $60 bound). Furniture triage FIRST ($0): the paid
 *  re-ground list EXCLUDES (a) furniture/portal/news/agenda by title, (b) FURNITURE/STUB holdings (migration
 *  203 holdings_quality) — those exit to discovery/re-collection, never a paid re-ground; and (c) the clear
 *  inherently-sub-floor ANALYSIS/framework bodies (IPCC/OECD/SBTi/IDB/TNO/ITF/GLEC-framework/Lloyd's/UN-SDGs/
 *  advisory) whose facts legitimately ground at T3-4 and CANNOT reach the reg floor by construction (the moat) —
 *  re-grounding them is futile; they exit AS coverage-floor residue, not failure. The remainder = real-reg
 *  re-attribution candidates, ordered CHEAPEST-CLASS FIRST (fewest facts = smallest pool). The runner's built
 *  guards (junk-pool spend reject, no-gain tripwire, dominance guard) backstop any residual futile item; the
 *  $60 bound halts with the remainder enumerated. Writes scripts/tmp/funded-pass-worklist.json.
 *  Usage: node scripts/wave2-build-worklist.mjs
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const FURNITURE_RE = /portal|session agenda|cookie|newsletter|fraud alert|advances medical|releases updated|overview|policies & measures|download|access to di[aá]rio/i;
// inherently-sub-floor analysis / framework / advisory bodies (authority genuinely T3-4; re-ground won't flip) ->
// coverage-floor residue, not paid re-ground.
const ANALYSIS_RE = /\bIPCC\b|\bOECD\b|\bSBTi\b|\bIDB\b|\bTNO\b|International Transport Forum|UN SDGs|GLEC Framework|Lloyd's Register|CEC North|National Logistics Plan|ASEAN Transport Strategic|CCICED|SEMARNAT Challenge|Environment Policy Area|Decarbonisation Hub|IEA Policies/i;

async function main() {
  const { data: items } = await sb.from("intelligence_items")
    .select("id, title, item_type")
    .eq("provenance_status", "quarantined")
    .in("item_type", ["regulation", "directive", "standard", "guidance", "framework"]);

  // holdings furniture/stub set (migration 203)
  const { data: hq } = await sb.from("holdings_quality").select("intelligence_item_id, completeness");
  const furnitureHoldings = new Set((hq || []).filter((r) => ["FURNITURE", "STUB"].includes(r.completeness)).map((r) => r.intelligence_item_id));

  const rows = [];
  const excluded = { furniture_title: [], furniture_holdings: [], analysis_body: [], not_c3: 0 };
  for (const it of items || []) {
    // C3-floor gate
    const { data: v } = await sb.rpc("validate_item_provenance", { p_item_id: it.id });
    const r = Array.isArray(v) ? v[0] : v;
    const isC3 = (r?.failures || []).some((f) => f.reason === "fact_below_authority_floor");
    if (!isC3) { excluded.not_c3 += 1; continue; }
    if (FURNITURE_RE.test(it.title)) { excluded.furniture_title.push(it.title); continue; }
    if (furnitureHoldings.has(it.id)) { excluded.furniture_holdings.push(it.title); continue; }
    if (ANALYSIS_RE.test(it.title)) { excluded.analysis_body.push(it.title); continue; }
    // fact count for cheapest-first ordering
    const { count } = await sb.from("section_claim_provenance").select("id", { count: "exact", head: true })
      .eq("intelligence_item_id", it.id).eq("claim_kind", "FACT");
    rows.push({ id: it.id, key: it.title.slice(0, 40), cls: "resynth", facts: count || 0 });
  }
  rows.sort((a, b) => a.facts - b.facts); // cheapest-class first

  const worklist = {
    generatedFrom: "WAVE 2 ($60 bound, operator 2026-07-15): floor-first re-attribution over C3-floor real-reg candidates, cheapest-class first. Furniture (title+holdings) + inherently-sub-floor analysis bodies triaged OUT to coverage-floor residue/discovery. C4 relabel folds into each re-ground. Guards: dominance, no-gain tripwire, junk-pool reject, priced-line markers, $60 bound.",
    count: rows.length,
    caller: "wave2-reattribution",
    worklist: rows.map(({ id, key, cls }) => ({ id, key, cls })),
  };
  mkdirSync(resolve(ROOT, "scripts/tmp"), { recursive: true });
  writeFileSync(resolve(ROOT, "scripts/tmp/funded-pass-worklist.json"), JSON.stringify(worklist, null, 2));
  console.log(`WAVE 2 worklist: ${rows.length} re-ground candidates (cheapest-first).`);
  console.log(`Excluded — furniture(title): ${excluded.furniture_title.length}, furniture(holdings): ${excluded.furniture_holdings.length}, analysis-body(residue): ${excluded.analysis_body.length}, not-C3: ${excluded.not_c3}`);
  console.log(`residue/exit sample: ${[...excluded.analysis_body, ...excluded.furniture_title].slice(0, 12).join(" | ")}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
