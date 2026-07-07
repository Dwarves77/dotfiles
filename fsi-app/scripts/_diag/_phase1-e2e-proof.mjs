// Phase 1 END-TO-END proof (reversible). Proves, against the LIVE DB + the REAL code:
//   UP   — seeded citations move a source's effective_tier ABOVE base_tier; q7's fixed write lands in
//          effective_tier with base_tier UNTOUCHED; an analytical reader sees the move; the reg-fact
//          stamp (resolver) STILL returns base_tier (reputation can't RAISE eligibility).
//   DOWN — a degraded effective_tier (below base_tier) STILL stamps base_tier (can't LOWER eligibility).
//   B#2  — an agent_extraction edge makes get_source_citation_stats return a live (non-stale) count.
// Everything is restored at the end (snapshot test source; delete seeded edges).
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { readClient } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { recomputeEffectiveTier } = await jiti.import("../../src/lib/trust.ts");
const { buildResolver } = await jiti.import("../../src/lib/sources/institution.ts");
const sb = readClient();

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`); cond ? pass++ : fail++; };

async function allSources() {
  const rows = [];
  for (let f = 0; ; f += 1000) {
    const { data } = await sb.from("sources").select("id,url,base_tier,effective_tier,tier_override").order("id").range(f, f + 999);
    if (!data?.length) break; rows.push(...data); if (data.length < 1000) break;
  }
  return rows;
}
const tierAt = async (url) => buildResolver(await allSources()).resolveSpan(url).tier;

// ── pick a clean, promotable TEST source (base_tier 3-5, has a host, not already cited) ──
const { data: cited } = await sb.from("source_citations").select("cited_source_id");
const citedSet = new Set((cited ?? []).map((r) => r.cited_source_id));
const { data: cand } = await sb.from("sources").select("id,url,base_tier,effective_tier,tier_override").gte("base_tier", 3).lte("base_tier", 5).eq("status", "active").limit(200);
const TEST = (cand ?? []).find((s) => s.url && !citedSet.has(s.id) && s.tier_override == null);
if (!TEST) { console.error("no clean promotable test source found"); process.exit(1); }
// 5 distinct high-tier citers (not the test source)
const { data: citers } = await sb.from("sources").select("id,base_tier").lte("base_tier", 3).neq("id", TEST.id).limit(5);
if (!citers || citers.length < 3) { console.error("not enough citer sources"); process.exit(1); }
// a real intelligence_item for the B#2 edge
const { data: someItem } = await sb.from("intelligence_items").select("id").limit(1).maybeSingle();

const SNAP = { base_tier: TEST.base_tier, effective_tier: TEST.effective_tier };
console.log(`========== PHASE 1 END-TO-END PROOF ==========`);
console.log(`test source ${TEST.id} base_tier=${TEST.base_tier} effective_tier=${TEST.effective_tier} host=${(()=>{try{return new URL(TEST.url).host}catch{return"?"}})()}`);
const seededEdgeIds = [];
let b2edge = null;
try {
  // ── UP: seed citations, recompute, apply, check ──
  const nowIso = new Date().toISOString();
  for (const c of citers) {
    const { data: ins } = await sb.from("source_citations").insert({ citing_source_id: c.id, cited_source_id: TEST.id, detected_at: nowIso, context: "phase1-e2e-proof" }).select("id").single();
    if (ins) seededEdgeIds.push(ins.id);
  }
  const recompute = await recomputeEffectiveTier(sb, TEST.id);
  ok("recompute promotes (weighted_sum>=2.5, citations>=3)", recompute.should_promote === true || recompute.after_tier < TEST.base_tier, `after=${recompute.after_tier} base=${recompute.base_tier} wsum=${recompute.weighted_sum.toFixed(2)} cites=${recompute.citation_count}`);
  ok("promoted exactly one tier (base-1)", recompute.after_tier === TEST.base_tier - 1, `after=${recompute.after_tier}`);
  // apply like the FIXED q7 (write effective_tier, NOT tier)
  await sb.from("sources").update({ effective_tier: recompute.after_tier }).eq("id", TEST.id);
  const { data: afterUp } = await sb.from("sources").select("base_tier, effective_tier, tier").eq("id", TEST.id).single();
  ok("effective_tier moved above base_tier", afterUp.effective_tier === TEST.base_tier - 1, `eff=${afterUp.effective_tier}`);
  ok("base_tier UNTOUCHED (no 094 corruption)", afterUp.base_tier === TEST.base_tier, `base=${afterUp.base_tier}`);
  ok("compat `tier` column UNTOUCHED", afterUp.tier === TEST.base_tier, `tier=${afterUp.tier}`);
  ok("analytical reader sees the move (effective_tier ?? base_tier)", (afterUp.effective_tier ?? afterUp.base_tier) === TEST.base_tier - 1);
  // MOAT UP: the reg-fact resolver still returns base_tier despite the promoted effective_tier
  ok("MOAT UP: reg-fact stamp stays base_tier (reputation can't RAISE eligibility)", (await tierAt(TEST.url)) === TEST.base_tier, `stamp=${await tierAt(TEST.url)} base=${TEST.base_tier}`);

  // ── DOWN: degrade effective_tier below base_tier, stamp must still be base_tier ──
  const worse = Math.min(7, TEST.base_tier + 2);
  await sb.from("sources").update({ effective_tier: worse }).eq("id", TEST.id);
  ok("MOAT DOWN: reg-fact stamp stays base_tier (reputation can't LOWER eligibility)", (await tierAt(TEST.url)) === TEST.base_tier, `stamp=${await tierAt(TEST.url)} eff=${worse} base=${TEST.base_tier}`);

  // ── B#2: an agent_extraction edge makes the RPC return a live count ──
  if (someItem) {
    const { data: before } = await sb.rpc("get_source_citation_stats", { source_ids: [TEST.id] });
    const beforeCount = (Array.isArray(before) ? before[0]?.citation_count : 0) ?? 0;
    await sb.from("intelligence_item_citations").upsert([{ intelligence_item_id: someItem.id, source_id: TEST.id, detected_at: nowIso, origin: "agent_extraction" }], { onConflict: "intelligence_item_id,source_id,origin", ignoreDuplicates: true });
    b2edge = { item: someItem.id, source: TEST.id };
    const { data: after } = await sb.rpc("get_source_citation_stats", { source_ids: [TEST.id] });
    const afterCount = (Array.isArray(after) ? after[0]?.citation_count : 0) ?? 0;
    ok("B#2: agent_extraction edge raises get_source_citation_stats count", afterCount === beforeCount + 1, `${beforeCount} -> ${afterCount}`);
  } else ok("B#2 skipped (no intelligence_item)", true);
} finally {
  // ── REVERT ──
  if (seededEdgeIds.length) await sb.from("source_citations").delete().in("id", seededEdgeIds);
  if (b2edge) await sb.from("intelligence_item_citations").delete().eq("intelligence_item_id", b2edge.item).eq("source_id", b2edge.source).eq("origin", "agent_extraction");
  await sb.from("sources").update({ effective_tier: SNAP.effective_tier }).eq("id", TEST.id);
  const { data: restored } = await sb.from("sources").select("base_tier, effective_tier").eq("id", TEST.id).single();
  ok("REVERTED (test source tiers restored, seeded edges deleted)", restored.base_tier === SNAP.base_tier && restored.effective_tier === SNAP.effective_tier, `base=${restored.base_tier} eff=${restored.effective_tier}`);
}

console.log(`\n${fail === 0 ? "ALL PASS — q7 moves effective_tier (base untouched); analytical readers see it; the moat holds BOTH directions; B#2 RPC returns live counts." : `${fail} FAILED`} (${pass} passed)`);
process.exit(fail === 0 ? 0 : 1);
