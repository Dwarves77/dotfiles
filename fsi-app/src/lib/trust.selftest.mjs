/** Isolation self-test for the source-credibility TIER WEIGHTS + recency decay (skill
 * source-credibility-model §3/§4/§7). Wired into the discipline engine by fitness F11. Proves the
 * load-bearing tier-weight half of the effective_tier model against the REAL trust.ts exports (no DB):
 *   (a) TIER_WEIGHTS are exactly the Q7 verbatim values (T1=1.0 … T7=0),
 *   (b) the weights are strictly decreasing and T7 contributes NOTHING (overflow tier ≠ signal),
 *   (c) recency decay is the 0.5^(age/halfLife) curve (now→1.0, one half-life→0.5, monotonic),
 *   (d) computeCitationComponentFromRows applies the weights (T1 row > T5 row; T7-only → 0).
 *
 * Residual (NOT asserted here, honest): the effective_tier = COALESCE(tier_override,
 * computed_dynamic_tier, base_tier) precedence and "override never modifies base_tier" live in the
 * SQL daily-recompute job + override endpoint — there is no JS unit surface. Mechanizable via pgTAP
 * SQL tests; deferred for that infra cost (REVISIT). Tracked as the residual on invariant SC-3.
 *
 * Exit 0 = invariant holds; non-zero = a tier-weight/decay regression. Run: node src/lib/trust.selftest.mjs
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* pure functions; env optional */ }
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { TIER_WEIGHTS, HALF_LIFE_MONTHS, applyRecencyDecay, computeCitationComponentFromRows } =
  await jiti.import("./trust.ts");

let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };

// (a) exact Q7 verbatim values
const EXPECTED = { 1: 1.0, 2: 0.85, 3: 0.7, 4: 0.5, 5: 0.3, 6: 0.15, 7: 0 };
for (const [t, w] of Object.entries(EXPECTED)) {
  ok(TIER_WEIGHTS[t] === w, `TIER_WEIGHTS[${t}] expected ${w}, got ${TIER_WEIGHTS[t]}`);
}
ok(Object.keys(TIER_WEIGHTS).length === 7, `TIER_WEIGHTS must have exactly 7 tiers, got ${Object.keys(TIER_WEIGHTS).length}`);

// (b) strictly decreasing + T7 = 0
for (let t = 1; t <= 6; t++) {
  ok(TIER_WEIGHTS[t] > TIER_WEIGHTS[t + 1], `weights must strictly decrease: T${t}(${TIER_WEIGHTS[t]}) > T${t + 1}(${TIER_WEIGHTS[t + 1]})`);
}
ok(TIER_WEIGHTS[7] === 0, `T7 must be 0 (overflow tier propagates no credibility), got ${TIER_WEIGHTS[7]}`);

// (c) recency decay curve: now → ~1.0; one half-life → ~0.5; two → ~0.25; monotonic
const now = new Date();
const monthsAgo = (m) => new Date(now.getTime() - m * 30.4375 * 24 * 3600 * 1000);
ok(Math.abs(applyRecencyDecay(now) - 1.0) < 1e-6, `decay(now) must be ~1.0, got ${applyRecencyDecay(now)}`);
ok(Math.abs(applyRecencyDecay(monthsAgo(HALF_LIFE_MONTHS)) - 0.5) < 0.02, `decay(one half-life) must be ~0.5, got ${applyRecencyDecay(monthsAgo(HALF_LIFE_MONTHS))}`);
ok(applyRecencyDecay(monthsAgo(2 * HALF_LIFE_MONTHS)) < applyRecencyDecay(monthsAgo(HALF_LIFE_MONTHS)), "decay must be monotonic decreasing with age");

// (d) the component path applies the weights: T1 recent > T5 recent; T7-only → 0; empty → 0
const t1 = computeCitationComponentFromRows([{ citing_tier: 1, detected_at: now }]);
const t5 = computeCitationComponentFromRows([{ citing_tier: 5, detected_at: now }]);
ok(t1 > t5, `a T1 citation must outweigh a T5 citation (${t1} > ${t5})`);
ok(computeCitationComponentFromRows([{ citing_tier: 7, detected_at: now }]) === 0, "a T7-only citation set must contribute 0");
ok(computeCitationComponentFromRows([]) === 0, "no citations must contribute 0");

console.log(`trust.selftest: ${checks} assertions passed (tier weights T1=1.0…T7=0, strictly decreasing, decay curve, weight ordering).`);
process.exit(0);
