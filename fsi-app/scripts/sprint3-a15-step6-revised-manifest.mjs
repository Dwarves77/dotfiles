/**
 * sprint3-a15-step6-revised-manifest.mjs — A1.5 Step 6.
 *
 * Builds the REVISED A1 apply manifest accounting for A1.5 source-
 * level cleanup. READ-ONLY against the A1 batch JSON; emits the
 * filtered + per-row-class-grouped manifest for operator green-light
 * before any DB apply.
 *
 * Source filtering rules per A1.5 outcomes:
 *   - Exclude any item whose source was flagged commercial-vendor
 *     and paused in Step 3 (5 EcoVadis sources)
 *   - These items are ALREADY handled (archived + domain 5 in
 *     Steps 1-2) — re-applying Haiku's classification would
 *     un-archive them
 *
 * Item-type guard per Verdict 2 (A1 spot-check):
 *   - If Haiku's recommended_item_type is NOT in the canonical
 *     ITEM_TYPES vocabulary, treat as "keep current" (Haiku
 *     conflated item_type with format_type on some rows)
 *
 * Per-row-class grouping:
 *   - category-only changes (current.category != recommended_category)
 *   - domain changes (current.domain != recommended_domain)
 *   - item_type changes (current.item_type != recommended_item_type
 *     AND recommended_item_type is in ITEM_TYPES)
 *   - Items can land in multiple groups; the apply runs three
 *     separate atomic commits, each touching only the column(s)
 *     in that group.
 *
 * Output: docs/audits/sprint3-a1-revised-manifest-2026-05-25.json
 *
 * NO DB writes. Operator reviews the manifest. After green-light,
 * a separate apply script reads this manifest and ships per-row-
 * class atomic commits.
 */

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
process.chdir(resolve(__dirname, ".."));

const BATCH_PATH = resolve("docs", "audits", "sprint3-classifier-quality-batch-2026-05-25.json");
const A15_SWEEP_PATH = resolve("docs", "audits", "sprint3-a15-vendor-source-sweep-2026-05-25.json");
const A15_STEP4_PATH = resolve("docs", "audits", "sprint3-a15-step4-broader-sweep-2026-05-25.json");
const OUT = resolve("docs", "audits", "sprint3-a1-revised-manifest-2026-05-25.json");

const CANONICAL_ITEM_TYPES = new Set([
  "regulation", "directive", "standard", "guidance", "framework",
  "technology", "innovation", "tool",
  "regional_data",
  "market_signal", "initiative",
  "research_finding",
]);

const CANONICAL_TOPICS = new Set([
  "emissions", "fuels", "transport", "reporting", "packaging", "corridors",
  "customs", "trade", "sanctions", "origin",
  "dangerous-goods", "food-safety", "pharma", "security",
  "cabotage", "labor", "infrastructure", "digital", "insurance",
  "standards", "research",
]);

// IDs of items already handled by A1.5 Steps 1-2 (archived + domain 5).
// Apply must EXCLUDE these from main A1 ship — re-applying Haiku's
// recommendation would un-archive them.
const ALREADY_HANDLED_IDS = new Set([
  "52eadc84-b3ea-4a80-8173-30b7d5435d4f", // EcoVadis Blog (Step 1)
  "19f08fcc-5f81-44cc-b3db-fe25f1717845", // EcoVadis (Step 1)
  "05b786f8-8753-4e81-923e-ee9d76c56609", // EcoVadis Platform Overview (Step 2)
  "6c59d250-5658-406b-b313-ca38b7b4915f", // EcoVadis 2025 Purpose Report (Step 2)
  "8107ba33-30e8-4e73-bee2-dd967f995114", // EcoVadis Comprehensive ESG (Step 2)
]);

const batch = JSON.parse(readFileSync(BATCH_PATH, "utf8"));

const categoryOnly = [];
const domainChanges = [];
const itemTypeChanges = [];
const itemTypeGuarded = []; // rows where Haiku returned non-canonical item_type
const excludedAlreadyHandled = [];
const errorRows = [];
const noChangeRows = [];
const lowConfidenceRows = [];
const outOfScopeRecommendations = []; // category not in TOPICS — Haiku said leave as-is or new value not canonical

for (const r of batch.recommendations) {
  if (ALREADY_HANDLED_IDS.has(r.id)) {
    excludedAlreadyHandled.push({ id: r.id, title: r.title, bucket: r.bucket });
    continue;
  }
  if (r.error) {
    errorRows.push({ id: r.id, title: r.title, bucket: r.bucket, error: r.error });
    continue;
  }
  const rec = r.recommendation;
  if (!rec) {
    errorRows.push({ id: r.id, title: r.title, bucket: r.bucket, error: "no recommendation" });
    continue;
  }

  // Category resolution — emit only when recommended is canonical
  // OR explicitly null. If recommended is a non-canonical string,
  // treat as keep-current (don't write garbage).
  const recCategory = rec.recommended_category;
  let categoryChange = null;
  if (recCategory === null || recCategory === "null") {
    if (r.current.category !== null) categoryChange = { from: r.current.category, to: null };
  } else if (typeof recCategory === "string" && CANONICAL_TOPICS.has(recCategory)) {
    if (r.current.category !== recCategory) categoryChange = { from: r.current.category, to: recCategory };
  } else if (typeof recCategory === "string") {
    // Non-canonical category recommendation — log but don't apply.
    outOfScopeRecommendations.push({ id: r.id, title: r.title, field: "category", recommended: recCategory });
  }

  // Domain resolution — only apply when recommended_domain is an
  // integer 1-7 AND different from current. The string "(keep)" or
  // null means keep.
  const recDomain = rec.recommended_domain;
  let domainChange = null;
  if (typeof recDomain === "number" && recDomain >= 1 && recDomain <= 7) {
    if (r.current.domain !== recDomain) domainChange = { from: r.current.domain, to: recDomain };
  }

  // Item-type guard per Verdict 2: only apply if canonical.
  const recItemType = rec.recommended_item_type;
  let itemTypeChange = null;
  if (typeof recItemType === "string" && CANONICAL_ITEM_TYPES.has(recItemType)) {
    if (r.current.item_type !== recItemType) itemTypeChange = { from: r.current.item_type, to: recItemType };
  } else if (typeof recItemType === "string" && recItemType !== "(keep)") {
    // Non-canonical item_type — guard kicks in
    itemTypeGuarded.push({
      id: r.id,
      title: r.title,
      bucket: r.bucket,
      current_item_type: r.current.item_type,
      haiku_recommended: recItemType,
      action: "keep current",
    });
  }

  const lowConfidence = rec.confidence === "low";

  const entry = {
    id: r.id,
    title: r.title,
    bucket: r.bucket,
    confidence: rec.confidence,
    rationale: rec.rationale,
    current: r.current,
    changes: {
      category: categoryChange,
      domain: domainChange,
      item_type: itemTypeChange,
    },
  };

  if (lowConfidence) {
    lowConfidenceRows.push(entry);
  }

  if (categoryChange) categoryOnly.push(entry);
  if (domainChange) domainChanges.push(entry);
  if (itemTypeChange) itemTypeChanges.push(entry);

  if (!categoryChange && !domainChange && !itemTypeChange) {
    noChangeRows.push(entry);
  }
}

const output = {
  generated_at: new Date().toISOString(),
  source_batch: "docs/audits/sprint3-classifier-quality-batch-2026-05-25.json",
  source_sweep_step3_paused: A15_SWEEP_PATH,
  source_sweep_step4_broader: A15_STEP4_PATH,
  total_rows_in_batch: batch.recommendations.length,
  excluded_already_handled_by_a15: {
    count: excludedAlreadyHandled.length,
    note: "These items were archived + rerouted to domain 5 by A1.5 Steps 1-2 (commits 3511e02, 25da342). Re-applying Haiku recommendations would un-archive them.",
    items: excludedAlreadyHandled,
  },
  error_rows: errorRows,
  apply_plan: {
    commit_A_category_only: {
      count: categoryOnly.length,
      note: "Atomic commit per row-class. category column updates only.",
      rows: categoryOnly,
    },
    commit_B_domain_changes: {
      count: domainChanges.length,
      note: "Atomic commit. domain column updates only.",
      rows: domainChanges,
    },
    commit_C_item_type_changes: {
      count: itemTypeChanges.length,
      note: "Atomic commit. item_type column updates only. Only canonical ITEM_TYPES values applied.",
      rows: itemTypeChanges,
    },
  },
  item_type_guard_triggers: {
    count: itemTypeGuarded.length,
    note: "Rows where Haiku recommended a non-canonical item_type value (format_type leakage). Per operator Verdict 2, action is 'keep current' on item_type field. Other axes (category, domain) still apply if recommendations were canonical.",
    rows: itemTypeGuarded,
  },
  no_change_rows: {
    count: noChangeRows.length,
    note: "Rows where Haiku recommended keeping current state on all three axes. No DB write needed; documented for audit trail.",
    rows: noChangeRows,
  },
  low_confidence_rows: {
    count: lowConfidenceRows.length,
    note: "Rows where Haiku confidence='low'. Surfaced separately for operator's awareness; recommendations still applied per the apply plan unless operator excludes specific IDs.",
    rows: lowConfidenceRows,
  },
  out_of_scope_recommendations: {
    count: outOfScopeRecommendations.length,
    note: "Haiku recommended a category value outside the canonical 21-topic TOPICS set. These rows keep current category; logged for audit trail.",
    rows: outOfScopeRecommendations,
  },
};

writeFileSync(OUT, JSON.stringify(output, null, 2));
console.log(`[A1.5/Step6] wrote ${OUT}`);
console.log(`[A1.5/Step6] revised manifest summary:`);
console.log(`  total batch rows: ${output.total_rows_in_batch}`);
console.log(`  excluded (A1.5 already handled): ${output.excluded_already_handled_by_a15.count}`);
console.log(`  error rows: ${output.error_rows.length}`);
console.log(`  Commit A — category-only: ${output.apply_plan.commit_A_category_only.count} rows`);
console.log(`  Commit B — domain changes: ${output.apply_plan.commit_B_domain_changes.count} rows`);
console.log(`  Commit C — item_type changes: ${output.apply_plan.commit_C_item_type_changes.count} rows`);
console.log(`  item_type guard triggers: ${output.item_type_guard_triggers.count} rows (keep current item_type)`);
console.log(`  no-change rows: ${output.no_change_rows.count}`);
console.log(`  low-confidence rows (audit): ${output.low_confidence_rows.count}`);
console.log(`  out-of-scope category recommendations: ${output.out_of_scope_recommendations.count}`);
