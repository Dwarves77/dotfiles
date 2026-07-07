// READ-ONLY refreshed BATCH-1 quote (post-T1). Scope = the full current non-verified non-archived set
// (T1 proved the pools exhausted → everything remaining is retrieval-class: seek-more / re-fetch). Classifies
// each by fetch STRATEGY (host pattern) → Browserless units + Sonnet re-ground estimate, as ONE number set.
// Quote-before-fetch. ZERO fetch/mint/spend.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const { readAll } = await import("../lib/db.mjs");

const items = (await readAll("intelligence_items", "id,legacy_id,title,item_type,provenance_status,is_archived,source_url"))
  .filter((i) => i.provenance_status !== "verified" && !i.is_archived);

// strategy by host (mirrors _refetch-quote): API=0 units, JS-shell=1 render, dead/portal=seek-more(0-1),
// bot-walled=stealth ~2, other=direct ~1.
const API = /federalregister\.gov|ecfr\.gov/i;
const JS = /customs\.go\.jp|gob\.mx|sdgs\.un\.org|portwatch\.imf\.org|meti\.go\.jp/i;
const DEAD = /eur-lex\.europa\.eu\/legal-content|cciced|regjeringen\.no|sdir\.no/i; // portal/news → seek-more to canonical
const BOT = /iea\.org|iata\.org|adb\.org|itf-oecd\.org|sciencedirect\.com|ilo\.org|iopscience|smartfreightcentre|un\.org|c40\.org|spglobal|zawya|congress\.gov|planalto\.gov\.br|lovdata/i;
const strat = (u) => API.test(u) ? "API-0u" : JS.test(u) ? "JS-render-1u" : DEAD.test(u) ? "dead/seek-more-0-1u" : BOT.test(u) ? "bot-walled-1-2u" : "direct-1u";

const buckets = { "API-0u": [], "JS-render-1u": [], "dead/seek-more-0-1u": [], "bot-walled-1-2u": [], "direct-1u": [] };
for (const it of items) buckets[strat(it.source_url || "")].push(it.legacy_id || it.id.slice(0, 8));

console.log(`\n=== REFRESHED BATCH-1 QUOTE (post-T1) — ${items.length} non-verified items (retrieval-class) ===\n`);
let unitsLo = 0, unitsHi = 0;
for (const [s, list] of Object.entries(buckets)) {
  const perLo = s === "API-0u" ? 0 : s === "dead/seek-more-0-1u" ? 0 : 1;
  const perHi = s === "API-0u" ? 0 : s === "JS-render-1u" ? 1 : s === "dead/seek-more-0-1u" ? 1 : 2;
  unitsLo += list.length * perLo; unitsHi += list.length * perHi;
  console.log(`  [${String(list.length).padStart(2)}] ${s.padEnd(20)} (${perLo}-${perHi} units ea): ${list.join(", ")}`);
}
const webSearches = buckets["dead/seek-more-0-1u"].length; // seek-more web_search candidate-gen (near-free)
const sonnet = (items.length * 0.30);
console.log(`\n=== ONE NUMBER SET ===`);
console.log(`  closed item list: ${items.length} items (full non-verified retrieval-class set)`);
console.log(`  Browserless units: ~${unitsLo}-${unitsHi} (of 20,000/mo = ${(unitsLo / 20000 * 100).toFixed(1)}-${(unitsHi / 20000 * 100).toFixed(1)}%)`);
console.log(`  seek-more web searches: ~${webSearches} candidate-gen passes (near-free, ~cents each)`);
console.log(`  Sonnet re-ground after fetch: ~${items.length} x ~$0.30 = ~$${sonnet.toFixed(2)} (headroom $${(85 - 28.8862).toFixed(2)})`);
console.log(`\n  NOTE: T1 proved pools exhausted — re-grounding without a NEW source just re-holds. Batch-1's value is`);
console.log(`  the SOURCE-side fix (seek-more canonical + re-fetch); the Sonnet re-ground only pays off on items where`);
console.log(`  a genuine new primary is fetched. Quote is the ceiling, not the expected spend.`);
process.exit(0);
