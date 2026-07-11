/** Phase 1 — FREE 4b re-home over the VERIFIED-but-failing floor-class population ($0, no model calls).
 *  Deterministic-first (spend-guard doctrine; the verified-item gate blocks paid re-ground anyway):
 *  for each below-floor FACT on a verified item failing fact_below_authority_floor, re-point its
 *  scp row (source_id / search_result_id / source_tier_at_grounding) to a floor-qualifying pool source
 *  that VERBATIM contains the span (floor-attribution.mjs, never forced — 4c honest-wall otherwise).
 *  DRY-RUN default (probe: per-item wall/rehome split). --apply = snapshot + write + revalidate read-back.
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, mkdirSync } from "node:fs";
import { createJiti } from "jiti";
import { readClient, readAll } from "../lib/db.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const APPLY = process.argv.includes("--apply");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { buildResolver } = await jiti.import("../../src/lib/sources/institution.ts");
const { floorSources, reattributeToFloor, MIN_REATTRIB_SPAN } = await jiti.import("../../src/lib/agent/floor-attribution.mjs");
const { authorityFloorFor } = await jiti.import("../../src/lib/agent/source-blocks.mjs");
const sb = readClient();

// full paginated sources registry -> resolver
let srcs = [];
for (let f = 0; ; f += 1000) {
  const { data } = await sb.from("sources").select("id,url,base_tier,tier_override").order("id").range(f, f + 999);
  if (!data?.length) break; srcs.push(...data); if (data.length < 1000) break;
}
const resolver = buildResolver(srcs);
const tierOfSourceId = new Map(srcs.map((s) => [s.id, s.tier_override ?? s.base_tier]));

// live population: verified, non-archived, validator recommends quarantined, floor-class present
const verified = await readAll("intelligence_items", "id,legacy_id,title,item_type,priority", { match: (q) => q.eq("is_archived", false).eq("provenance_status", "verified") });
const pop = [];
for (const it of verified) {
  const { data: vr } = await sb.rpc("validate_item_provenance", { p_item_id: it.id });
  const r = Array.isArray(vr) ? vr[0] : vr;
  if (r?.valid) continue;
  const reasons = [...new Set((r?.failures || []).map((f) => f.reason))];
  pop.push({ ...it, reasons });
}
console.log(`verified-but-failing: ${pop.length}`);
const floorItems = pop.filter((p) => p.reasons.includes("fact_below_authority_floor"));
console.log(`  with floor-class failure: ${floorItems.length}`);
console.log(`  other-class only: ${pop.filter((p) => !p.reasons.includes("fact_below_authority_floor")).map((p) => `${(p.legacy_id || p.id.slice(0, 8))}[${p.reasons}]`).join(" ")}`);

const detClear = [], partial = [], none = [];
const writes = []; // {scpId, itemId, key, newSourceId, newSearchResultId, newTier, oldSourceId, oldSearchResultId, oldTier}
for (const it of floorItems) {
  const floor = authorityFloorFor(it.item_type);
  const { data: pool } = await sb.from("agent_run_searches").select("id,result_url,result_content_excerpt").eq("intelligence_item_id", it.id);
  const withTier = (pool || []).filter((r) => (r.result_content_excerpt || "").length > 200)
    .map((r) => ({ poolId: r.id, url: r.result_url, text: r.result_content_excerpt, ...resolver.resolveSpan(r.result_url) }));
  const fp = floorSources(withTier, floor);
  const { data: facts } = await sb.from("section_claim_provenance").select("id,source_span,source_id,search_result_id,claim_kind").eq("intelligence_item_id", it.id).eq("claim_kind", "FACT");
  let wall = 0, rehome = 0;
  for (const f of facts || []) {
    const cur = f.source_id ? (tierOfSourceId.get(f.source_id) ?? null) : null;
    const below = floor != null && (cur == null || cur > floor);
    if (!below) continue;
    wall++;
    const target = reattributeToFloor(f.source_span, cur, fp, floor);
    if (target) {
      rehome++;
      writes.push({ scpId: f.id, itemId: it.id, key: it.legacy_id || it.id.slice(0, 8),
        newSourceId: target.sourceId, newSearchResultId: target.poolId, newTier: target.tier,
        oldSourceId: f.source_id, oldSearchResultId: f.search_result_id, oldTier: cur });
    }
  }
  const rec = { key: it.legacy_id || it.id.slice(0, 8), id: it.id, type: it.item_type, reasons: it.reasons, wall, rehome };
  if (wall > 0 && rehome === wall && it.reasons.every((r) => r === "fact_below_authority_floor")) detClear.push(rec);
  else if (rehome > 0) partial.push(rec);
  else none.push(rec);
}
console.log(`\nDET-CLEAR (all walls re-home, floor-only): ${detClear.length}`);
for (const d of detClear) console.log(`  ${d.key} ${d.rehome}/${d.wall}`);
console.log(`PARTIAL (some re-home): ${partial.length}`);
for (const d of partial) console.log(`  ${d.key} ${d.rehome}/${d.wall} [${d.reasons}]`);
console.log(`NONE (0 re-home): ${none.length}`);
for (const d of none) console.log(`  ${d.key} 0/${d.wall} [${d.reasons}]`);
console.log(`\ntotal re-point writes staged: ${writes.length} (MIN span ${MIN_REATTRIB_SPAN}ch, verbatim-only, never forced)`);

if (!APPLY) { console.log(`\nDRY-RUN — pass --apply to write.`); process.exit(0); }

// snapshot + write + read-back
const snapDir = resolve(ROOT, "scripts/_snapshots");
mkdirSync(snapDir, { recursive: true });
const snap = resolve(snapDir, `${new Date().toISOString().replace(/[:.]/g, "-")}_floor-rehome-scp.jsonl`);
writeFileSync(snap, writes.map((w) => JSON.stringify(w)).join("\n") + "\n");
console.log(`snapshot: ${snap}`);
let okN = 0, failN = 0;
for (const w of writes) {
  const { error } = await sb.from("section_claim_provenance")
    .update({ source_id: w.newSourceId, search_result_id: w.newSearchResultId, source_tier_at_grounding: w.newTier })
    .eq("id", w.scpId);
  if (error) { failN++; console.error(`  WRITE FAIL scp=${w.scpId}: ${error.message}`); } else okN++;
}
console.log(`writes: ok=${okN} fail=${failN}`);

// revalidate read-back per touched item
const touched = [...new Set(writes.map((w) => w.itemId))];
let nowValid = 0, stillFail = 0;
for (const id of touched) {
  const { data: vr } = await sb.rpc("validate_item_provenance", { p_item_id: id });
  const r = Array.isArray(vr) ? vr[0] : vr;
  if (r?.valid) nowValid++; else stillFail++;
}
console.log(`revalidate over ${touched.length} touched items: valid=${nowValid} still-failing=${stillFail}`);
process.exit(failN ? 1 : 0);
