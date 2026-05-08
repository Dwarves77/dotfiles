/**
 * topic-backfill-execute.mjs — authorized writes for Wave 5 topic backfill.
 *
 * Backfills intelligence_items.category for rows where it's NULL or empty,
 * using the derivations recorded by topic-backfill-investigate.mjs. The
 * `category` column is what UI maps to Resource.topic — see
 * src/lib/supabase-server.ts line 475 (`topic: row.category || undefined`).
 * That single read is what surfaces "Uncategorized" in MarketPage.tsx's
 * groupByCategory(), per Wave 2 PR-G investigation.
 *
 * Authorized scope (per dispatch on 2026-05-07):
 *   - Read docs/topic-backfill-investigation-2026-05-07.json
 *   - For each derivable candidate (ambiguous=false, derived_topic in
 *     canonical TOPICS), update intelligence_items.category to the
 *     derived topic value, by row id.
 *   - Skip ambiguous rows. They are logged in the investigation report
 *     and surfaced in the PR description.
 *   - Per-row read-back: confirm the row's category equals the derived
 *     topic before moving on.
 *
 * Verification gates:
 *   - Pre/post NULL/empty count of intelligence_items.category
 *   - Each updated row has a canonical TOPICS value
 *   - Per-row read-back match
 *
 * Output: docs/topic-backfill-execute-log.json
 *
 * Idempotent: re-running after partial completion only updates rows still
 * NULL/empty — already-set rows are short-circuited by the IS NULL filter.
 */

import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { writeFileSync, readFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
process.chdir(resolve(__dirname, ".."));
process.loadEnvFile(".env.local");

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const TOPICS = new Set([
  "emissions", "fuels", "transport", "reporting", "packaging", "corridors",
  "customs", "trade", "sanctions", "origin",
  "dangerous-goods", "food-safety", "pharma", "security",
  "cabotage", "labor", "infrastructure", "digital", "insurance",
  "standards", "research",
]);

const LOG_PATH = resolve("..", "docs", "topic-backfill-execute-log.json");
const log = [];
function step(name, ok, detail) {
  const line = `[${ok ? "OK" : "FAIL"}] ${name} — ${detail}`;
  console.log(line);
  log.push({ name, ok, detail, at: new Date().toISOString() });
  if (!ok) {
    writeFileSync(
      LOG_PATH,
      JSON.stringify({ aborted_at: name, log }, null, 2),
      "utf8"
    );
    process.exit(1);
  }
}

// ─── Load the investigation report ───────────────────────────────────
const reportPath = resolve(
  "..",
  "docs",
  "topic-backfill-investigation-2026-05-07.json"
);
let report;
try {
  report = JSON.parse(readFileSync(reportPath, "utf8"));
} catch (e) {
  step(
    "load_investigation_report",
    false,
    `cannot read ${reportPath}: ${e.message}. Run topic-backfill-investigate.mjs first.`
  );
}
step(
  "load_investigation_report",
  true,
  `${report.candidates.length} derivable, ${report.ambiguous_skipped.length} ambiguous`
);

// Sanity-check: every candidate's derived_topic must be in canonical TOPICS.
{
  const bad = report.candidates.filter((c) => !TOPICS.has(c.derived_topic));
  step(
    "candidates_canonical_check",
    bad.length === 0,
    bad.length === 0
      ? "all candidates use canonical TOPICS values"
      : `non-canonical: ${bad.map((b) => `${b.legacy_id}:${b.derived_topic}`).join(",")}`
  );
}

// ─── Pre-state count ──────────────────────────────────────────────────
const { count: preNull } = await supabase
  .from("intelligence_items")
  .select("id", { count: "exact", head: true })
  .or("category.is.null,category.eq.");
step("pre_state_null_count", true, `${preNull} rows with NULL/empty category`);

// ─── Per-row backfill ────────────────────────────────────────────────
let updated = 0;
let already = 0;
for (const c of report.candidates) {
  // Read current state — only update if still NULL/empty (idempotent).
  const { data: row, error: readErr } = await supabase
    .from("intelligence_items")
    .select("id, legacy_id, category")
    .eq("id", c.id)
    .maybeSingle();
  if (readErr || !row) {
    step(
      `read_${c.legacy_id || c.id}`,
      false,
      readErr?.message || "row not found"
    );
  }
  if (row.category && row.category.trim() !== "") {
    if (row.category === c.derived_topic) {
      already++;
      continue;
    }
    // Row already has a different value — don't clobber. Log and skip.
    log.push({
      name: `skip_already_set_${c.legacy_id || c.id}`,
      ok: true,
      detail: `existing category=${row.category}, derived=${c.derived_topic}; skipping`,
      at: new Date().toISOString(),
    });
    continue;
  }

  // Write
  const { error: updErr } = await supabase
    .from("intelligence_items")
    .update({ category: c.derived_topic })
    .eq("id", c.id);
  if (updErr) {
    step(
      `update_${c.legacy_id || c.id}`,
      false,
      `${updErr.message}`
    );
  }

  // Read-back
  const { data: rb } = await supabase
    .from("intelligence_items")
    .select("id, legacy_id, category")
    .eq("id", c.id)
    .maybeSingle();
  step(
    `verify_${c.legacy_id || c.id}`,
    rb?.category === c.derived_topic,
    `category=${rb?.category} (expected ${c.derived_topic})`
  );
  updated++;
}

// ─── Post-state count ────────────────────────────────────────────────
const { count: postNull } = await supabase
  .from("intelligence_items")
  .select("id", { count: "exact", head: true })
  .or("category.is.null,category.eq.");

const expectedPostNull = preNull - updated;
step(
  "post_state_null_count",
  postNull === expectedPostNull,
  `pre=${preNull}, updated=${updated}, expected_post=${expectedPostNull}, actual_post=${postNull}`
);

// ─── Final summary ───────────────────────────────────────────────────
const summary = {
  completed: true,
  pre_state_null_count: preNull,
  post_state_null_count: postNull,
  updated_count: updated,
  already_correct_count: already,
  skipped_ambiguous_count: report.ambiguous_skipped.length,
  total_targets_in_report: report.candidates.length,
  derivation_breakdown: report.derivation_summary.reason_counts,
  log,
};
writeFileSync(LOG_PATH, JSON.stringify(summary, null, 2), "utf8");

console.log("\n── topic-backfill execute summary ──");
console.log(`Pre-state NULL/empty: ${preNull}`);
console.log(`Updated: ${updated}`);
console.log(`Already correct (idempotent skip): ${already}`);
console.log(`Skipped ambiguous (logged in investigation): ${report.ambiguous_skipped.length}`);
console.log(`Post-state NULL/empty: ${postNull}`);
console.log(`\nLog: docs/topic-backfill-execute-log.json`);
