// READ-ONLY T1 selector: the chokepoint-re-ground set = quarantined + not-archived + pool>=1, MINUS the
// dedup loser (queues) MINUS the seek-more class (roadblocked/none-tier/wrong-page) MINUS the 4d/non-English
// pair. These are the items whose stored pool is >=floor and quarantine is truncation/slot-coverage, so a
// Sonnet-only re-ground off the FULL pool (post-cat-2-fix) can flip them. ZERO spend/fetch. Emits the batch keys.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const { readAll } = await import("../lib/db.mjs");

// EXCLUSIONS (by legacy_id or id-prefix) — determined by the counsel-split + dedup analysis.
const SEEKMORE = new Set(["27dfbe4c", "93c344a1", "ad4cc6c6", "cd5c84e3", "d56ca4e1", "d5ee6ab8", "japan-s-updated-top-runner-program-for-heavy-duty-vehicles"]);
const FOURD = new Set(["03b5f234", "82f09535", "6a857887"]); // Norwegian x2 (+ dedup unresolved) + Portuguese
const LOSER = new Set(["7a0ead55"]); // dedup loser — queues for delete on o2 release
const excluded = new Set([...SEEKMORE, ...FOURD, ...LOSER]);
const isExcluded = (it) => excluded.has(it.legacy_id) || excluded.has(it.id.slice(0, 8));

const items = (await readAll("intelligence_items", "id,legacy_id,title,item_type,provenance_status,is_archived"))
  .filter((i) => i.provenance_status === "quarantined" && !i.is_archived);
// pool sizes
const pool = await readAll("agent_run_searches", "intelligence_item_id,result_content_excerpt");
const poolByItem = new Map();
for (const r of pool) { if ((r.result_content_excerpt || "").length > 200) poolByItem.set(r.intelligence_item_id, (poolByItem.get(r.intelligence_item_id) || 0) + 1); }

const t1 = [], excl = [];
for (const it of items) {
  const key = it.legacy_id || it.id.slice(0, 8);
  const p = poolByItem.get(it.id) || 0;
  const rec = { key, id: it.id, type: it.item_type, pool: p, title: (it.title || "").slice(0, 46) };
  if (isExcluded(it)) { excl.push({ ...rec, why: SEEKMORE.has(it.legacy_id) || SEEKMORE.has(it.id.slice(0, 8)) ? "seek-more" : FOURD.has(it.legacy_id) || FOURD.has(it.id.slice(0, 8)) ? "4d/non-EN" : "dedup-loser" }); continue; }
  if (p < 1) { excl.push({ ...rec, why: "zero-pool" }); continue; }
  t1.push(rec);
}
t1.sort((a, b) => b.pool - a.pool);
console.log(`\n=== T1 SELECTOR ===`);
console.log(`quarantined non-archived: ${items.length} | EXCLUDED: ${excl.length} | >>> T1 RE-GROUND SET: ${t1.length}`);
console.log(`\n[EXCLUDED]`);
for (const e of excl.sort((a, b) => a.why.localeCompare(b.why))) console.log(`  ${e.key.padEnd(16)} ${e.why.padEnd(12)} pool=${e.pool} | ${e.title}`);
console.log(`\n[T1 RE-GROUND SET] (${t1.length})`);
for (const r of t1) console.log(`  ${r.key.padEnd(16)} ${r.type.padEnd(14)} pool=${String(r.pool).padStart(2)} | ${r.title}`);
const est = (t1.length * 0.30).toFixed(2);
console.log(`\nENVELOPE: ${t1.length} items x ~$0.30 Sonnet-only (no fetch) = ~$${est} (headroom $${(85 - 26.0324).toFixed(2)}). Stop layers: $3/item breaker, $80 soft-cap, 2x-measured, cohort judge-fail.`);
const keys = t1.map((r) => r.key).join(",");
writeFileSync(resolve(ROOT, "scripts", "_plans", "t1-batch-keys.txt"), keys);
console.log(`\nbatch keys -> scripts/_plans/t1-batch-keys.txt`);
process.exit(0);
