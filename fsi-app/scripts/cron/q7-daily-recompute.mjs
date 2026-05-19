/**
 * q7-daily-recompute.mjs
 *
 * Daily batch: recompute effective_tier for every source per the Q7
 * promotion thresholds + tier-weighted decayed citation network sum.
 *
 * Per Q7 (docs/sprint-2/source-credibility-model-decisions-2026-05-19.md)
 * and the source-credibility-model skill, Section 4 and Section 5.
 *
 * Canonical implementation lives in src/lib/trust.ts (functions
 * evaluateCandidatePromotion + recomputeEffectiveTier + constants
 * Q7_CONFIG + TIER_WEIGHTS + decayFactor). This .mjs script mirrors the
 * logic verbatim because Node has no built-in TypeScript loader; the
 * trust.ts module is the source of truth and is what the Next.js runtime
 * consumes. ANY logic change MUST land in both places; a single-source
 * refactor requires either adding a TypeScript loader to devDependencies
 * (tsx) or compiling trust.ts to .mjs at build time. Both are footprint
 * changes deferred to the cron-wiring dispatch.
 *
 * Scope:
 *   - Iterates every row in `sources`.
 *   - For each row, computes the tier-weighted decayed citation sum,
 *     evaluates the Q7 promotion threshold, recomputes effective_tier.
 *   - When the recomputed effective tier differs from the stored value,
 *     UPDATEs the sources row (pre-Q2: writes `tier`; post-Q2: writes
 *     `effective_tier`) and INSERTs a source_trust_events audit row.
 *   - Emits a summary: N sources processed, N tier changes, top-N
 *     promoted/demoted.
 *
 * Usage:
 *   node scripts/cron/q7-daily-recompute.mjs --dry-run
 *     Compute recommended changes but do NOT write to the database.
 *     Always run this first; the script also defaults to dry-run if
 *     neither flag is passed.
 *
 *   node scripts/cron/q7-daily-recompute.mjs --execute
 *     Compute and apply changes. UPDATEs sources rows whose
 *     effective_tier changes; INSERTs a source_trust_events row
 *     per change. Idempotent: re-running on the same data is a no-op
 *     because the recompute reads the now-updated tier.
 *
 *   --half-life-days=N
 *     Override the recency decay half-life (default 720 = 24 months).
 *     Tuning aid; production should use the default until Q6 defines
 *     a different canonical value.
 *
 * Cron wiring:
 *   This script is cron-runnable but the wiring (GitHub Actions cron
 *   schedule, AWS EventBridge rule, equivalent) is NOT in scope for the
 *   Q7 dispatch. Wiring is a separate operator-decided dispatch.
 *
 * Schema state notes (pre-Q2 / pre-Q5):
 *   - Reads/writes `sources.tier`; switches to base_tier/effective_tier
 *     when Q2 lands.
 *   - source_trust_events.event_type CHECK constraint does NOT currently
 *     allow 'effective_tier_recompute'. The script uses the existing
 *     allowed values 'tier_promotion' / 'tier_demotion' (matching the
 *     direction of the tier change) and stamps the `details` JSONB with
 *     { recompute: true, before, after, reasoning, weighted_sum,
 *     citation_count, q7_config_version }. Adding a dedicated
 *     'effective_tier_recompute' event_type is a separate migration
 *     dispatch.
 *
 * Non-negotiables:
 *   - Dry-run is the default; --execute is required to apply changes.
 *   - Idempotent: a no-change recompute produces zero writes.
 */

import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
  process.exit(1);
});
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
  process.exit(1);
});

const __dirname = dirname(fileURLToPath(import.meta.url));
const FSI_APP_ROOT = resolve(__dirname, "..", "..");
process.loadEnvFile(resolve(FSI_APP_ROOT, ".env.local"));

// ════════════════════════════════════════════════════════════════════════════
// Q7 constants + logic mirror of src/lib/trust.ts
// Keep in sync. See file header for rationale.
// ════════════════════════════════════════════════════════════════════════════

const Q7_CONFIG = {
  CLASSIFIER_CONFIDENCE_REVIEW_THRESHOLD: 0.65,
  CITATION_FREQUENCY_PROMOTION_THRESHOLD: 3,
  PROMOTION_WEIGHTED_SUM_THRESHOLD: 2.5,
  TIER_OPINION_DISAGREEMENT_WINDOW_DAYS: 90,
  TIER_OPINION_DISAGREEMENT_COUNT_THRESHOLD: 5,
  EXPECTED_QUEUE_RATE_PER_WEEK: [5, 15],
};

const TIER_WEIGHTS = { 1: 1.0, 2: 0.85, 3: 0.7, 4: 0.5, 5: 0.3, 6: 0.15, 7: 0 };

const Q7_DEFAULT_HALF_LIFE_DAYS = 24 * 30;

function decayFactor(detectedAt, now, halfLifeDays) {
  const detectedTime = typeof detectedAt === "string" ? new Date(detectedAt).getTime() : detectedAt.getTime();
  const ageDays = (now.getTime() - detectedTime) / 86400000;
  if (ageDays <= 0) return 1.0;
  return Math.pow(0.5, ageDays / halfLifeDays);
}

async function evaluateCandidatePromotion(client, sourceId, now, halfLifeDays) {
  const { data: citations, error: citErr } = await client
    .from("source_citations")
    .select("citing_source_id, cited_source_id, detected_at")
    .eq("cited_source_id", sourceId);

  if (citErr) throw new Error(`evaluateCandidatePromotion: failed to read source_citations for ${sourceId}: ${citErr.message}`);

  const rows = citations ?? [];
  const citation_count = rows.length;

  if (citation_count === 0) {
    return { source_id: sourceId, should_promote: false, weighted_sum: 0, citation_count: 0, reasoning: "no citations" };
  }

  const citingIds = Array.from(new Set(rows.map((r) => r.citing_source_id)));
  const { data: citerSources, error: srcErr } = await client
    .from("sources")
    .select("id, tier")
    .in("id", citingIds);

  if (srcErr) throw new Error(`evaluateCandidatePromotion: failed to read sources for citers of ${sourceId}: ${srcErr.message}`);

  const tierById = new Map();
  for (const s of citerSources ?? []) tierById.set(s.id, s.tier);

  let weighted_sum = 0;
  for (const row of rows) {
    const tier = tierById.get(row.citing_source_id);
    if (tier == null) continue;
    if (tier < 1 || tier > 7) continue;
    const weight = TIER_WEIGHTS[tier];
    const decay = decayFactor(row.detected_at, now, halfLifeDays);
    weighted_sum += weight * decay;
  }

  const should_promote =
    weighted_sum >= Q7_CONFIG.PROMOTION_WEIGHTED_SUM_THRESHOLD &&
    citation_count >= Q7_CONFIG.CITATION_FREQUENCY_PROMOTION_THRESHOLD;

  const reasoning = should_promote
    ? `weighted_sum=${weighted_sum.toFixed(3)} >= ${Q7_CONFIG.PROMOTION_WEIGHTED_SUM_THRESHOLD} AND citations=${citation_count} >= ${Q7_CONFIG.CITATION_FREQUENCY_PROMOTION_THRESHOLD} (promote)`
    : `weighted_sum=${weighted_sum.toFixed(3)} citations=${citation_count} below thresholds (sum>=${Q7_CONFIG.PROMOTION_WEIGHTED_SUM_THRESHOLD}, citations>=${Q7_CONFIG.CITATION_FREQUENCY_PROMOTION_THRESHOLD})`;

  return { source_id: sourceId, should_promote, weighted_sum, citation_count, reasoning };
}

async function recomputeEffectiveTier(client, sourceId, now, halfLifeDays) {
  const { data: src, error: srcErr } = await client
    .from("sources")
    .select("id, tier")
    .eq("id", sourceId)
    .single();

  if (srcErr) throw new Error(`recomputeEffectiveTier: failed to read source ${sourceId}: ${srcErr.message}`);
  if (!src) throw new Error(`recomputeEffectiveTier: source ${sourceId} not found`);

  const baseTierNum = src.tier;
  if (baseTierNum < 1 || baseTierNum > 7) {
    throw new Error(`recomputeEffectiveTier: source ${sourceId} has out-of-range tier=${baseTierNum}`);
  }
  const base_tier = baseTierNum;
  const tier_override = null; // Pre-Q5.
  const before_tier = base_tier; // Pre-Q2.

  const promo = await evaluateCandidatePromotion(client, sourceId, now, halfLifeDays);

  let computed_dynamic_tier = base_tier;
  if (promo.should_promote && base_tier > 1) computed_dynamic_tier = base_tier - 1;

  const after_tier = tier_override ?? computed_dynamic_tier ?? base_tier;
  const changed = after_tier !== before_tier;

  const reasoning = changed
    ? `effective_tier ${before_tier} -> ${after_tier}: base=${base_tier} override=${tier_override ?? "null"} computed=${computed_dynamic_tier} (${promo.reasoning})`
    : `effective_tier unchanged at ${after_tier}: base=${base_tier} override=${tier_override ?? "null"} computed=${computed_dynamic_tier} (${promo.reasoning})`;

  return {
    source_id: sourceId,
    before_tier,
    after_tier,
    changed,
    base_tier,
    computed_dynamic_tier,
    tier_override,
    weighted_sum: promo.weighted_sum,
    citation_count: promo.citation_count,
    reasoning,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// Main
// ════════════════════════════════════════════════════════════════════════════

const args = process.argv.slice(2);
const EXECUTE = args.includes("--execute");
const DRY_RUN = !EXECUTE;
const halfLifeArg = args.find((a) => a.startsWith("--half-life-days="));
const HALF_LIFE_DAYS = halfLifeArg ? Number(halfLifeArg.split("=")[1]) : Q7_DEFAULT_HALF_LIFE_DAYS;

if (!Number.isFinite(HALF_LIFE_DAYS) || HALF_LIFE_DAYS <= 0) {
  console.error(`Invalid --half-life-days value: ${halfLifeArg}`);
  process.exit(1);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const Q7_CONFIG_VERSION = "q7-2026-05-19";
const NOW = new Date();

console.log(`[q7-daily-recompute] started ${NOW.toISOString()}`);
console.log(`  mode=${DRY_RUN ? "DRY_RUN" : "EXECUTE"}`);
console.log(`  half_life_days=${HALF_LIFE_DAYS}`);
console.log(`  thresholds: weighted_sum>=${Q7_CONFIG.PROMOTION_WEIGHTED_SUM_THRESHOLD} citations>=${Q7_CONFIG.CITATION_FREQUENCY_PROMOTION_THRESHOLD}`);
console.log(`  expected weekly review-queue arrivals: ${Q7_CONFIG.EXPECTED_QUEUE_RATE_PER_WEEK[0]}-${Q7_CONFIG.EXPECTED_QUEUE_RATE_PER_WEEK[1]}`);

// ────────────────────────────────────────────────────────────────────────────
// Step 1: enumerate sources
// ────────────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 1000;
const sources = [];
let offset = 0;
// eslint-disable-next-line no-constant-condition
while (true) {
  const { data, error } = await supabase
    .from("sources")
    .select("id, name, tier")
    .order("id", { ascending: true })
    .range(offset, offset + PAGE_SIZE - 1);

  if (error) {
    console.error(`[q7-daily-recompute] failed to read sources page at offset=${offset}: ${error.message}`);
    process.exit(1);
  }

  const rows = data ?? [];
  sources.push(...rows);
  if (rows.length < PAGE_SIZE) break;
  offset += PAGE_SIZE;
}

console.log(`[q7-daily-recompute] enumerated ${sources.length} sources`);

// ────────────────────────────────────────────────────────────────────────────
// Step 2: per-source recompute
// ────────────────────────────────────────────────────────────────────────────

const results = [];
const tierChanges = [];
const errors = [];

for (let i = 0; i < sources.length; i++) {
  const s = sources[i];
  try {
    const result = await recomputeEffectiveTier(supabase, s.id, NOW, HALF_LIFE_DAYS);
    results.push({ ...result, name: s.name });
    if (result.changed) tierChanges.push({ ...result, name: s.name });
  } catch (err) {
    errors.push({ source_id: s.id, name: s.name, error: err?.message ?? String(err) });
  }

  if ((i + 1) % 100 === 0) {
    console.log(`  ... processed ${i + 1}/${sources.length} (changes so far: ${tierChanges.length}, errors: ${errors.length})`);
  }
}

console.log(`[q7-daily-recompute] computed: ${results.length} processed, ${tierChanges.length} tier changes, ${errors.length} errors`);

// ────────────────────────────────────────────────────────────────────────────
// Step 3: apply changes
// ────────────────────────────────────────────────────────────────────────────

let updateCount = 0;
let eventInsertCount = 0;
let writeErrorCount = 0;

if (DRY_RUN) {
  console.log(`[q7-daily-recompute] DRY_RUN: skipping writes (${tierChanges.length} changes would be applied)`);
} else {
  for (const change of tierChanges) {
    // tier numbering: lower = higher authority. 5 -> 4 is a promotion.
    const direction = change.after_tier < change.before_tier ? "tier_promotion" : "tier_demotion";

    // UPDATE sources. Pre-Q2: write `tier`. Post-Q2: write `effective_tier`.
    const { error: upErr } = await supabase
      .from("sources")
      .update({ tier: change.after_tier })
      .eq("id", change.source_id);

    if (upErr) {
      writeErrorCount++;
      console.error(`  UPDATE failed for ${change.source_id}: ${upErr.message}`);
      continue;
    }
    updateCount++;

    // INSERT source_trust_events audit row.
    // event_type uses the existing tier_promotion/tier_demotion values
    // because the CHECK constraint does not yet include
    // 'effective_tier_recompute'. The details JSONB carries the recompute
    // marker so consumers can distinguish batch-driven from manual events.
    const { error: evErr } = await supabase
      .from("source_trust_events")
      .insert({
        source_id: change.source_id,
        event_type: direction,
        details: {
          recompute: true,
          q7_config_version: Q7_CONFIG_VERSION,
          before_tier: change.before_tier,
          after_tier: change.after_tier,
          base_tier: change.base_tier,
          computed_dynamic_tier: change.computed_dynamic_tier,
          tier_override: change.tier_override,
          weighted_sum: Number(change.weighted_sum.toFixed(4)),
          citation_count: change.citation_count,
          reasoning: change.reasoning,
          half_life_days: HALF_LIFE_DAYS,
          batch_run_at: NOW.toISOString(),
        },
        created_by: "worker",
      });

    if (evErr) {
      writeErrorCount++;
      console.error(`  source_trust_events INSERT failed for ${change.source_id}: ${evErr.message}`);
      continue;
    }
    eventInsertCount++;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Step 4: summary report
// ────────────────────────────────────────────────────────────────────────────

const promotions = tierChanges.filter((c) => c.after_tier < c.before_tier);
const demotions = tierChanges.filter((c) => c.after_tier > c.before_tier);

const topN = (list, n = 10) =>
  list
    .slice()
    .sort((a, b) => Math.abs(b.weighted_sum) - Math.abs(a.weighted_sum))
    .slice(0, n);

console.log("");
console.log("══════════════════════════════════════════════════════════════");
console.log("Q7 DAILY RECOMPUTE, SUMMARY");
console.log("══════════════════════════════════════════════════════════════");
console.log(`  mode:               ${DRY_RUN ? "DRY_RUN" : "EXECUTE"}`);
console.log(`  sources processed:  ${results.length}`);
console.log(`  tier changes:       ${tierChanges.length}`);
console.log(`    promotions:       ${promotions.length}`);
console.log(`    demotions:        ${demotions.length}`);
console.log(`  errors (compute):   ${errors.length}`);
if (!DRY_RUN) {
  console.log(`  sources updated:    ${updateCount}`);
  console.log(`  events inserted:    ${eventInsertCount}`);
  console.log(`  write errors:       ${writeErrorCount}`);
}

if (promotions.length > 0) {
  console.log("");
  console.log(`  Top ${Math.min(promotions.length, 10)} promotions (by weighted_sum):`);
  for (const p of topN(promotions, 10)) {
    console.log(`    ${p.source_id.slice(0, 8)} ${p.name?.slice(0, 50) ?? "(unnamed)"}: T${p.before_tier}->T${p.after_tier} sum=${p.weighted_sum.toFixed(3)} cites=${p.citation_count}`);
  }
}

if (demotions.length > 0) {
  console.log("");
  console.log(`  Top ${Math.min(demotions.length, 10)} demotions (by weighted_sum):`);
  for (const d of topN(demotions, 10)) {
    console.log(`    ${d.source_id.slice(0, 8)} ${d.name?.slice(0, 50) ?? "(unnamed)"}: T${d.before_tier}->T${d.after_tier} sum=${d.weighted_sum.toFixed(3)} cites=${d.citation_count}`);
  }
}

if (errors.length > 0) {
  console.log("");
  console.log(`  Compute errors:`);
  for (const e of errors.slice(0, 20)) {
    console.log(`    ${e.source_id.slice(0, 8)} ${e.name?.slice(0, 50) ?? "(unnamed)"}: ${e.error}`);
  }
  if (errors.length > 20) console.log(`    ... and ${errors.length - 20} more`);
}

console.log("");
console.log(`[q7-daily-recompute] done ${new Date().toISOString()}`);

if (errors.length > 0 || writeErrorCount > 0) {
  process.exit(2); // Non-zero exit for cron to surface failure.
}
