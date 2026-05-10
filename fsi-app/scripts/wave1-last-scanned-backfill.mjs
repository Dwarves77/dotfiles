/**
 * wave1-last-scanned-backfill.mjs — one-shot data backfill for Wave 1a step 1.
 *
 * Runs AFTER migration 051 applies. Sets sources.last_scanned = sources.last_checked
 * for every row where last_scanned is NULL and last_checked is populated.
 *
 * Reason (per dispatch): leaving last_scanned NULL across 718 sources after the
 * column lands creates either:
 *   (a) a thundering-herd cost spike on first cron tick if cooldown logic
 *       treats NULL as eligible, OR
 *   (b) a masked cooldown bug if NULL fails the comparison and nothing
 *       triggers
 * Backfilling from the worker-populated last_checked sidesteps both. The
 * cooldown becomes "1h since last HEAD probe" for sources that have never
 * had agent/run called — conservative, cost-protective default.
 *
 * Idempotent: WHERE last_scanned IS NULL AND last_checked IS NOT NULL means
 * re-running is a no-op once values are in place.
 *
 * Halts cleanly if column doesn't exist (migration 051 not applied yet).
 */

import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { writeFileSync } from "node:fs";

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

const log = [];

function step(name, ok, detail) {
  const line = `[${ok ? "OK" : "FAIL"}] ${name} — ${detail}`;
  console.log(line);
  log.push({ name, ok, detail, at: new Date().toISOString() });
  if (!ok) {
    writeFileSync(
      resolve("..", "docs", "wave1-last-scanned-backfill-log.json"),
      JSON.stringify({ aborted_at: name, log }, null, 2),
      "utf8"
    );
    process.exit(1);
  }
}

// ── Precondition: column exists ─────────────────────────────────────────
{
  const { error } = await supabase
    .from("sources")
    .select("id, last_scanned")
    .limit(1);
  if (error) {
    step(
      "precondition_column_exists",
      false,
      `last_scanned column not reachable: ${error.message} (code=${error.code ?? "?"}). Migration 051 not applied OR PostgREST schema cache stale (NOTIFY pgrst, 'reload schema'). HALT.`
    );
  }
  step("precondition_column_exists", true, "sources.last_scanned reachable via PostgREST");
}

// ── Read state before backfill ──────────────────────────────────────────
const { count: total } = await supabase
  .from("sources")
  .select("id", { count: "exact", head: true });

const { count: nullBefore } = await supabase
  .from("sources")
  .select("id", { count: "exact", head: true })
  .is("last_scanned", null);

const { count: eligibleForBackfill } = await supabase
  .from("sources")
  .select("id", { count: "exact", head: true })
  .is("last_scanned", null)
  .not("last_checked", "is", null);

step(
  "read_state",
  true,
  `total=${total} null_before=${nullBefore} eligible_for_backfill=${eligibleForBackfill}`
);

// ── Backfill ────────────────────────────────────────────────────────────
// Cannot do `last_scanned = last_checked` in one PostgREST update; need to
// fetch eligible ids+timestamps then batch update.
const PAGE = 200;
let offset = 0;
let updated = 0;

while (true) {
  const { data, error } = await supabase
    .from("sources")
    .select("id, last_checked")
    .is("last_scanned", null)
    .not("last_checked", "is", null)
    .order("id", { ascending: true })
    .range(offset, offset + PAGE - 1);

  if (error) {
    step("fetch_eligible", false, `page offset=${offset} failed: ${error.message}`);
  }
  if (!data || data.length === 0) break;

  // Update each row individually (no batch UPDATE in PostgREST without a function)
  for (const row of data) {
    const { error: upErr } = await supabase
      .from("sources")
      .update({ last_scanned: row.last_checked })
      .eq("id", row.id)
      .is("last_scanned", null); // double-guard against re-run / concurrent write

    if (upErr) {
      step(`update_${row.id}`, false, upErr.message);
    }
    updated++;
  }

  console.log(`  ... backfilled ${updated} so far`);
  if (data.length < PAGE) break;
  offset += PAGE;
}

step(
  "backfill_complete",
  true,
  `updated ${updated} of ${eligibleForBackfill} eligible rows`
);

// ── Verify post-state ───────────────────────────────────────────────────
const { count: nullAfter } = await supabase
  .from("sources")
  .select("id", { count: "exact", head: true })
  .is("last_scanned", null);

const expectedNullAfter = total - eligibleForBackfill;
step(
  "verify_state",
  nullAfter === expectedNullAfter,
  `null_after=${nullAfter} expected=${expectedNullAfter} (sources never HEAD-probed remain NULL by design)`
);

// ── Final log ───────────────────────────────────────────────────────────
writeFileSync(
  resolve("..", "docs", "wave1-last-scanned-backfill-log.json"),
  JSON.stringify(
    {
      completed: true,
      completed_at: new Date().toISOString(),
      total,
      null_before: nullBefore,
      eligible_for_backfill: eligibleForBackfill,
      updated,
      null_after: nullAfter,
      log,
    },
    null,
    2
  ),
  "utf8"
);

console.log(`\n✓ Backfill complete. ${updated} rows updated. ${nullAfter} sources still NULL (never HEAD-probed; will become eligible on first /agent/run).`);
console.log(`Log: docs/wave1-last-scanned-backfill-log.json`);
