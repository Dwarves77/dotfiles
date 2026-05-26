/**
 * sprint3-a1-spotcheck-sample.mjs — Build operator 10% spot-check sample.
 *
 * READ-ONLY. Reads the A1 batch JSON and emits a markdown sample
 * surface for operator review. Stratified across the 4 buckets so
 * each row class gets meaningful coverage (operator instruction:
 * verify Haiku quality across EACH row class, not 47 random).
 *
 * Stratification:
 *   - ambiguous_null (409 rows)    → 30 sampled (every ~14th row)
 *   - d1_research (28 rows)        → 6 sampled (every ~5th row)
 *   - non_canonical (32 rows)      → 6 sampled (every ~5th row)
 *   - specific_misclass (5 rows)   → 5 all sampled
 *   Total: 47
 *
 * Output: docs/audits/sprint3-a1-spotcheck-sample-2026-05-25.md
 */

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
process.chdir(resolve(__dirname, ".."));

const BATCH_PATH = resolve("docs", "audits", "sprint3-classifier-quality-batch-2026-05-25.json");
const OUT_PATH = resolve("docs", "audits", "sprint3-a1-spotcheck-sample-2026-05-25.md");

const SAMPLES_PER_BUCKET = {
  ambiguous_null: 30,
  d1_research: 6,
  non_canonical: 6,
  specific_misclass: 5,
};

const batch = JSON.parse(readFileSync(BATCH_PATH, "utf8"));
const byBucket = batch.recommendations.reduce((acc, r) => {
  (acc[r.bucket] = acc[r.bucket] ?? []).push(r);
  return acc;
}, {});

function strideSample(rows, n) {
  if (rows.length <= n) return rows;
  const stride = Math.floor(rows.length / n);
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(rows[i * stride]);
  }
  return out;
}

const out = [];
out.push(`# Sprint 3 A1 — Operator 10% spot-check sample\n`);
out.push(`**Source:** \`docs/audits/sprint3-classifier-quality-batch-2026-05-25.json\` (474 rows, $0.72 actual cost, 0 errors)\n`);
out.push(`**Sample size:** 47 rows stratified across 4 buckets.\n`);
out.push(`**Goal:** verify Haiku classification quality across each row class. Operator accepts or rejects the batch as a whole.\n`);
out.push(`\n---\n`);
out.push(`## Spot-check methodology\n`);
out.push(`Sampling: stride-N pick within each bucket (deterministic, evenly spread by id ordering):\n`);
out.push(`- ambiguous_null: 30 of 409 (every ~14th row by sorted id)\n`);
out.push(`- d1_research: 6 of 28 (every ~5th row)\n`);
out.push(`- non_canonical: 6 of 32 (every ~5th row)\n`);
out.push(`- specific_misclass: 5 of 5 (all)\n`);
out.push(`\n**Known classification axis issue** flagged for operator attention: Haiku sometimes returns format_type values ('technology_profile', 'regulatory_fact_document', 'operations_profile', 'market_signal_brief', 'research_summary') in the \`recommended_item_type\` field instead of the canonical item_type vocab (regulation/directive/standard/guidance/framework/technology/innovation/tool/regional_data/market_signal/initiative/research_finding). The apply script must guard against this — recommendations with non-canonical item_type values get \`item_type: keep current\` on apply.\n`);
out.push(`\n---\n`);

const BUCKET_HEADERS = {
  ambiguous_null: "Ambiguous null-category rows (Phase 3D deferral)",
  d1_research: "domain=1 AND category='research' rows (cross-axis misalignment)",
  non_canonical: "Non-canonical category rows (NOT IN TOPICS taxonomy)",
  specific_misclass: "Specific surfaced misclassifications (Green Corridors / UNDP / EcoVadis)",
};

for (const bucket of ["ambiguous_null", "d1_research", "non_canonical", "specific_misclass"]) {
  const all = byBucket[bucket] ?? [];
  const sample = strideSample(all, SAMPLES_PER_BUCKET[bucket]);
  out.push(`## ${BUCKET_HEADERS[bucket]} — ${sample.length} of ${all.length}\n`);
  out.push(`\n`);
  for (const r of sample) {
    out.push(`### ${r.title}\n`);
    out.push(`- **ID:** \`${r.id}\`\n`);
    out.push(`- **Current:** category=\`${r.current.category ?? "null"}\` · domain=\`${r.current.domain}\` · item_type=\`${r.current.item_type ?? "null"}\`\n`);
    if (r.recommendation) {
      out.push(`- **Recommended:** category=\`${r.recommendation.recommended_category ?? "null"}\` · domain=\`${r.recommendation.recommended_domain ?? "(keep)"}\` · item_type=\`${r.recommendation.recommended_item_type ?? "(keep)"}\`\n`);
      out.push(`- **Confidence:** ${r.recommendation.confidence}\n`);
      out.push(`- **Rationale:** ${r.recommendation.rationale}\n`);
    } else if (r.error) {
      out.push(`- **ERROR:** ${r.error}\n`);
    }
    out.push(`\n`);
  }
}

out.push(`---\n`);
out.push(`## Operator verdict required\n`);
out.push(`\nThree responses accepted:\n`);
out.push(`1. **Accept batch as-is** — proceed with apply (per-row-class atomic commits + cross-surface count reconciliation per dispatch brief).\n`);
out.push(`2. **Accept with item_type guard** — apply but ignore Haiku item_type recommendations where the value is non-canonical (format_type leakage). This is the recommended option; the apply script is already wired for this.\n`);
out.push(`3. **Reject batch** — surfaced issues require prompt revision and re-run.\n`);
out.push(`\nIf accepted, apply runs as separate atomic commits per row-class:\n`);
out.push(`- Commit A: category-only changes (1 per row where only category differs)\n`);
out.push(`- Commit B: domain changes (where domain shifts)\n`);
out.push(`- Commit C: item_type changes (where item_type shifts AND value is canonical)\n`);
out.push(`\nAfter apply, cross-surface count reconciliation runs per Phase 2A pattern; deltas surfaced before A1 considered green.\n`);

writeFileSync(OUT_PATH, out.join(""));
console.log(`[A1 spotcheck] wrote ${OUT_PATH}`);
console.log(`[A1 spotcheck] sample stats:`);
for (const [bucket, count] of Object.entries(SAMPLES_PER_BUCKET)) {
  const all = (byBucket[bucket] ?? []).length;
  console.log(`  ${bucket}: ${Math.min(count, all)} of ${all}`);
}
