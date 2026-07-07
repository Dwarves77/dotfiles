// READ-ONLY: scope the truncation exposure in CAPTURED pool data + grounding inputs across the corpus.
// Signatures: (a) pool source excerpts near round caps (truncated-at-cap); (b) truncation-guard flags;
// (c) section content_md > GROUND_SECTION_MAX_CHARS (12000) = truncated when shown to the grounder.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const { readClient, readAll } = await import("../lib/db.mjs");
const sb = readClient();
const GSM = 12000;

// pool sources (real fetched content, result_index < 90, >200 chars) — length buckets + near-cap detection
const pool = await readAll("agent_run_searches", "intelligence_item_id,result_index,result_content_excerpt");
const real = pool.filter((r) => (r.result_index ?? 0) < 90 && (r.result_content_excerpt || "").length > 200);
const CAPS = [12000, 16000, 32000, 60000, 100000, 200000];
const nearCap = (len) => CAPS.find((c) => len >= c - 50 && len <= c + 5);
let capped = 0; const capHist = {}; const lenBuckets = { "<2k": 0, "2-12k": 0, "12-60k": 0, "60-200k": 0, ">200k": 0 };
const itemsWithCapped = new Set();
for (const r of real) {
  const L = r.result_content_excerpt.length;
  const c = nearCap(L);
  if (c) { capped++; capHist[c] = (capHist[c] || 0) + 1; itemsWithCapped.add(r.intelligence_item_id); }
  if (L < 2000) lenBuckets["<2k"]++; else if (L < 12000) lenBuckets["2-12k"]++; else if (L < 60000) lenBuckets["12-60k"]++; else if (L < 200000) lenBuckets["60-200k"]++; else lenBuckets[">200k"]++;
}
console.log(`\n=== POOL SOURCE CAPTURES (real, >200ch): ${real.length} rows across ${new Set(real.map(r=>r.intelligence_item_id)).size} items ===`);
console.log(`  length buckets: ${JSON.stringify(lenBuckets)}`);
console.log(`  near-round-cap (likely truncated-at-cap): ${capped} rows, by cap: ${JSON.stringify(capHist)}`);
console.log(`  items with >=1 near-cap pool source: ${itemsWithCapped.size}`);

// truncation-guard integrity flags
const tflags = await readAll("integrity_flags", "subject_ref,status,created_by", { match: (q) => q.eq("created_by", "truncation-guard") });
console.log(`\n=== TRUNCATION-GUARD FLAGS: ${tflags.length} (open: ${tflags.filter(f=>f.status==="open").length}) on ${new Set(tflags.map(f=>f.subject_ref)).size} items ===`);

// sections that EXCEED the 12k grounding cap (tail invisible to the grounder)
const secs = await readAll("intelligence_item_sections", "item_id,section_key,content_md");
const overCap = secs.filter((s) => (s.content_md || "").length > GSM);
const itemsOverCap = new Set(overCap.map((s) => s.item_id));
console.log(`\n=== SECTIONS > ${GSM} chars (tail truncated at ground time): ${overCap.length} sections on ${itemsOverCap.size} items ===`);
const maxSec = secs.reduce((m, s) => Math.max(m, (s.content_md || "").length), 0);
console.log(`  largest section: ${maxSec} chars`);

// verified corpus overlap (are VERIFIED items grounded against capped pool?)
const verified = await readAll("intelligence_items", "id", { match: (q) => q.eq("is_archived", false).eq("provenance_status", "verified") });
const vset = new Set(verified.map(v => v.id));
const verifiedCapped = [...itemsWithCapped].filter(id => vset.has(id)).length;
const verifiedOverCap = [...itemsOverCap].filter(id => vset.has(id)).length;
console.log(`\n=== VERIFIED (${vset.size}) exposure ===`);
console.log(`  verified items with near-cap pool source: ${verifiedCapped}`);
console.log(`  verified items with a >12k section: ${verifiedOverCap}`);
process.exit(0);
