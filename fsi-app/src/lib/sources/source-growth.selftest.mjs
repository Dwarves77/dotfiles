/** Isolation gate for source-growth (per the operator's step-1 guardrail): prove the load-bearing
 * core BEFORE wiring it into the canonical workflow path. No DB. Feeds the JOLT corroboration set
 * incl. the May-2024 SRF announcement syndicated across 3 trade sites, and asserts:
 *   (a) syndication collapses (3 syndicated copies -> 1 corroboration),
 *   (b) trust_score_citation moves 0 -> >0,
 *   (c) the honest (collapsed) score is LOWER than the naive (inflated) count would give.
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* pure-math selftest; .env.local optional (absent in CI) */ }
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { aggregateConvergence, citationScore } = await jiti.import("./source-growth.ts");

// Corroboration set for the JOLT launch/partners claim:
//   - The original SRF May-2024 announcement, REPUBLISHED across 3 trade sites (one press release).
//   - Cambridge SRF academic announcement (independent, tier 3).
//   - Motor Transport Nov-2025 operational reporting (independent later article, tier 5).
const edges = [
  { citer_source_id: "freightcarbonzero", citer_tier: 5, syndication_group: "srf-may2024-launch" },
  { citer_source_id: "commercialmotor",   citer_tier: 5, syndication_group: "srf-may2024-launch" },
  { citer_source_id: "fleetnews",         citer_tier: 5, syndication_group: "srf-may2024-launch" },
  { citer_source_id: "cambridge-eng",     citer_tier: 3, syndication_group: null },
  { citer_source_id: "motortransport-nov2025", citer_tier: 5, syndication_group: null },
];

// BEFORE: source has zero citations.
const before = aggregateConvergence([]);
const scoreBefore = citationScore(before);

// NAIVE (the existing distinct-citer path, no syndication awareness): every site counts.
const naive = aggregateConvergence(edges.map((e) => ({ ...e, syndication_group: null })));
const scoreNaive = citationScore(naive);

// HONEST (syndication-collapsed): the 3 republications of the SRF release count as ONE.
const honest = aggregateConvergence(edges);
const scoreHonest = citationScore(honest);

console.log(`raw citation edges: ${edges.length}`);
console.log(`BEFORE (no citations): independent_citers=${before.independent_citers}  trust_score_citation=${scoreBefore}`);
console.log(`NAIVE  (no syndication dedup): independent_citers=${naive.independent_citers}  highest_tier=${naive.highest_citing_tier}  score=${scoreNaive.toFixed(3)}`);
console.log(`HONEST (syndication collapsed): independent_citers=${honest.independent_citers}  highest_tier=${honest.highest_citing_tier}  score=${scoreHonest.toFixed(3)}`);

const collapsed = naive.independent_citers - honest.independent_citers; // 5 -> 3 == 2 collapsed (3 sites -> 1)
const pass =
  before.independent_citers === 0 && scoreBefore === 0 &&        // started cold
  honest.independent_citers === 3 &&                              // 3-site cluster + 2 independents -> 3
  collapsed === 2 &&                                              // the May-2024 cluster collapsed (3 -> 1)
  scoreHonest > 0 &&                                              // trust_score_citation MOVED
  scoreHonest < scoreNaive;                                       // honest < inflated (integrity)

console.log(`\nsyndication collapse: May-2024 SRF announcement across 3 sites -> 1 corroboration (independent_citers ${naive.independent_citers} -> ${honest.independent_citers})`);
console.log(`trust_score_citation: 0 -> ${scoreHonest.toFixed(3)} (MOVED); honest ${scoreHonest.toFixed(3)} < inflated ${scoreNaive.toFixed(3)} (integrity holds)`);
console.log(pass ? "\nPASS — source-growth core proven in isolation." : "\nFAIL");
process.exit(pass ? 0 : 1);
