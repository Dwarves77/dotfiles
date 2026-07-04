/** SPAN RE-POINT (item 3, operator ruling 2026-07-04). DETERMINISTIC guarded fix for fact_span_not_in_source:
 *  a FACT whose stored source_span is NOT verbatim in its cited source's content, but IS verbatim in ANOTHER
 *  pool source (agent_run_searches) for the same item — re-point search_result_id + source_id + tier stamp to
 *  the source that actually contains the span. NO LLM, NO fetch. GUARDED (guardedUpdate snapshot + cite).
 *  Standing authorization; the 3 items with re-pointable spans surfaced by the lever map (g33,
 *  eu_clean_trucking_2024_1610, d5ee6ab8). MODES: default dry-run · --sample (3) · --apply (all). */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { readClient, guardedUpdate } from "./lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { buildResolver } = await jiti.import("../src/lib/sources/institution.ts");

const SAMPLE = process.argv.includes("--sample");
const APPLY = process.argv.includes("--apply");
const ONLY = ["g33", "eu_clean_trucking_2024_1610", "d5ee6ab8"]; // lever-map re-pointable set
const CITE = { skill: "environmental-policy-and-innovation", reason: "Span re-point (item 3): fact_span_not_in_source FACT whose span is verbatim in another pool source — re-point search_result_id/source_id/tier to the source that contains it. Deterministic, no LLM. Operator ruling 2026-07-04." };
const has = (text, span) => String(text || "").toLowerCase().includes(String(span || "").toLowerCase().trim());

const sb = readClient();
let srcs = []; for (let f = 0; ; f += 1000) { const { data } = await sb.from("sources").select("id,url,base_tier,tier_override").order("id").range(f, f + 999); if (!data?.length) break; srcs.push(...data); if (data.length < 1000) break; }
const resolver = buildResolver(srcs);
const { data: items } = await sb.from("intelligence_items").select("id,legacy_id").eq("is_archived", false);
const targets = items.filter((it) => ONLY.includes(it.legacy_id) || ONLY.some((k) => it.id.startsWith(k)));

const repoints = [];
for (const it of targets) {
  const { data: pool } = await sb.from("agent_run_searches").select("id,result_url,result_content_excerpt").eq("intelligence_item_id", it.id);
  const usable = (pool || []).filter((r) => (r.result_content_excerpt || "").length > 200);
  const urlById = Object.fromEntries((pool || []).map((r) => [r.id, r.result_url]));
  const { data: facts } = await sb.from("section_claim_provenance").select("id,source_span,source_id,search_result_id").eq("intelligence_item_id", it.id).eq("claim_kind", "FACT");
  for (const f of (facts || [])) {
    if (!f.source_span) continue;
    const curUrl = f.search_result_id ? urlById[f.search_result_id] : null;
    const curRow = usable.find((r) => r.id === f.search_result_id);
    if (curRow && has(curRow.result_content_excerpt, f.source_span)) continue; // span already in cited source
    // find a pool source that DOES contain the span verbatim (prefer highest tier)
    const cands = usable.filter((r) => has(r.result_content_excerpt, f.source_span))
      .map((r) => ({ r, tier: resolver.resolveSpan(r.result_url).tier ?? 99 }))
      .sort((a, b) => a.tier - b.tier);
    if (!cands.length) continue;
    const best = cands[0];
    const res = resolver.resolveSpan(best.r.result_url);
    repoints.push({ itemKey: it.legacy_id || it.id.slice(0, 8), factId: f.id, from: curUrl || "(none)", to: best.r.result_url, newSid: res.sourceId, newTier: res.tier, newSearchId: best.r.id });
  }
}
console.log(`re-pointable FACT spans across ${targets.length} items: ${repoints.length}`);
for (const r of repoints.slice(0, 8)) console.log(`  ${r.itemKey} fact ${r.factId.slice(0, 8)} -> ${new URL(r.to).host} (T${r.newTier ?? "null"})`);

if (!SAMPLE && !APPLY) { console.log("\nDRY-RUN. --sample (3) then --apply (all)."); process.exit(0); }
const batch = SAMPLE ? repoints.slice(0, 3) : repoints;
console.log(`\n${SAMPLE ? "SAMPLE (3)" : "APPLY (all)"} — ${batch.length} guarded re-points…`);
let ok = 0, fail = 0;
for (const r of batch) {
  try {
    await guardedUpdate("section_claim_provenance", (q) => q.eq("id", r.factId), { source_id: r.newSid, search_result_id: r.newSearchId, source_tier_at_grounding: r.newTier }, { cite: CITE });
    const { data: rb } = await sb.from("section_claim_provenance").select("search_result_id").eq("id", r.factId).single();
    const good = rb?.search_result_id === r.newSearchId;
    console.log(`  ${good ? "✔" : "✖"} ${r.itemKey} ${r.factId.slice(0, 8)} -> ${new URL(r.to).host}`); good ? ok++ : fail++;
  } catch (e) { fail++; console.log(`  ✖ ${r.factId.slice(0, 8)} ${e.message.slice(0, 70)}`); }
}
console.log(`\n${SAMPLE ? "SAMPLE" : "APPLY"} DONE: ${ok} ok, ${fail} failed.`);
process.exit(fail ? 1 : 0);
