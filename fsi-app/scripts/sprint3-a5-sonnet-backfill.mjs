/**
 * sprint3-a5-sonnet-backfill.mjs
 *
 * Sprint 3 A5.4 (2026-05-28). Backfill driver for active D1 (Regulations)
 * items whose section coverage predates the SKILL.md §3-§15 contract.
 *
 * Sprint 4 Block 1 (task 1.6): generation no longer runs inline here. This
 * script no longer calls Sonnet directly, runs web_search, or parses/upserts
 * section JSON. Instead each eligible item is handed to the durable Vercel
 * workflow `generateBriefWorkflow` via start(). The workflow's steps own the
 * full pipeline — source fetch / active sourcing, parse, provenance
 * validation, persist/route (task 1.5) — and step-level retry / RetryableError
 * replaces the embedded Sonnet retry + tolerant-JSON recovery this script used
 * to carry.
 *
 * COST GOVERNANCE NOTE: per-call cost metering and the $30 / $15 budget cap
 * moved into the workflow/step layer (Block 4). This driver no longer sees
 * model responses, so it cannot meter spend itself. Block 4 must carry the
 * budget ceiling inside the workflow before any real generation pass runs.
 *
 * This driver now: selects eligible items by mode, then enqueues one durable
 * run per item. Idempotent — items already in the checkpoint are skipped.
 *
 * Modes (eligibility selection only — generation behavior is the workflow's):
 *   brief-anchor (default) — D1 items WITH full_brief but no section rows.
 *   url-anchor             — D1 items with NO full_brief, no section rows,
 *                            priority CRITICAL/HIGH, source_url present.
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { start } from "workflow/api";
import { generateBriefWorkflow } from "../src/workflows/generate-brief.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(__dirname, "..");

// ── env ─────────────────────────────────────────────────────────────
const envText = readFileSync(resolve(APP_ROOT, ".env.local"), "utf8");
const env = (k) => envText.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();

const SUPABASE_URL = env("NEXT_PUBLIC_SUPABASE_URL");
const SERVICE_ROLE_KEY = env("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("[A5.4] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ── mode + flags ───────────────────────────────────────────────────
// Two modes drive eligibility selection (generation behavior is now the
// workflow's concern, derived from item state in Block 4):
//   brief-anchor (default) — D1 items that HAVE full_brief but no sections.
//   url-anchor             — D1 items with NO full_brief, no sections, and
//                            priority IN (CRITICAL, HIGH); source_url required.
const MODE = process.argv.includes("--mode=url-anchor") ? "url-anchor" : "brief-anchor";
const DRY_RUN = process.argv.includes("--dry-run");

// Separate checkpoint per mode so the url-anchor pass doesn't pollute the
// brief-anchor pass's enqueued list.
const CHECKPOINT_PATH = resolve(__dirname, `.a5-sonnet-checkpoint-${MODE}.json`);
const LOG_PATH = resolve(__dirname, ".a5-sonnet-backfill.log");

console.log(`[A5.4] mode=${MODE}${DRY_RUN ? " [DRY RUN]" : ""} — enqueue driver (task 1.6)`);

// ── checkpoint ─────────────────────────────────────────────────────
let checkpoint = { completed_ids: [], started_at: null };
if (existsSync(CHECKPOINT_PATH)) {
  try {
    checkpoint = JSON.parse(readFileSync(CHECKPOINT_PATH, "utf8"));
    // Legacy checkpoints may carry total_cost; ignored now (cost lives in the workflow).
    if (!Array.isArray(checkpoint.completed_ids)) checkpoint.completed_ids = [];
    console.log(`[A5.4] resumed from checkpoint: ${checkpoint.completed_ids.length} items already enqueued`);
  } catch (e) {
    console.warn(`[A5.4] failed to read checkpoint, starting fresh: ${e.message}`);
    checkpoint = { completed_ids: [], started_at: new Date().toISOString() };
  }
} else {
  checkpoint = { completed_ids: [], started_at: new Date().toISOString() };
}

function saveCheckpoint() {
  writeFileSync(CHECKPOINT_PATH, JSON.stringify(checkpoint, null, 2));
}

function log(line) {
  const stamped = `${new Date().toISOString()} ${line}\n`;
  appendFileSync(LOG_PATH, stamped);
}

// ── identify uncovered D1 items ────────────────────────────────────
console.log("[A5.4] querying active D1 items…");
const { data: allD1, error: qErr } = await supabase
  .from("intelligence_items")
  .select("id, legacy_id, title, summary, jurisdictions, topic_tags, source_url, full_brief, priority")
  .eq("domain", 1)
  .eq("is_archived", false);

if (qErr) {
  console.error(`[A5.4] query failed: ${qErr.message}`);
  process.exit(1);
}

console.log(`[A5.4] total active D1 items: ${(allD1 || []).length}`);

// Determine which items have ≥1 section in intelligence_item_sections.
const { data: existingSections, error: sErr } = await supabase
  .from("intelligence_item_sections")
  .select("item_id");

if (sErr) {
  console.error(`[A5.4] section query failed: ${sErr.message}`);
  process.exit(1);
}

const itemsWithSections = new Set((existingSections || []).map((r) => r.item_id));
console.log(`[A5.4] items with ≥1 existing section row: ${itemsWithSections.size}`);

// Eligibility depends on mode (see header).
const uncovered = (allD1 || [])
  .filter((r) => !itemsWithSections.has(r.id))
  .filter((r) => {
    const briefEmpty = !(r.full_brief || "").trim();
    const urlOk = !!(r.source_url || "").trim();
    if (MODE === "url-anchor") {
      const priorityOk = r.priority === "CRITICAL" || r.priority === "HIGH";
      return briefEmpty && urlOk && priorityOk;
    }
    return !briefEmpty;
  });

console.log(`[A5.4] uncovered D1 items eligible for enqueue (${MODE}): ${uncovered.length}`);

// Filter out items already enqueued (checkpoint).
const completedSet = new Set(checkpoint.completed_ids);
const remaining = uncovered.filter((r) => !completedSet.has(r.id));
console.log(`[A5.4] remaining after checkpoint filter: ${remaining.length}`);

if (remaining.length === 0) {
  console.log("[A5.4] nothing to do — all eligible items already enqueued.");
  printFinalReport(uncovered.length);
  process.exit(0);
}

// ── per-item enqueue ───────────────────────────────────────────────
const tally = { enqueued: 0, start_failed: 0 };

log(`# RUN start ${new Date().toISOString()} — ${remaining.length} items remaining, mode=${MODE}, dryRun=${DRY_RUN}`);

for (let i = 0; i < remaining.length; i++) {
  const row = remaining[i];
  const idx = i + 1;
  const total = remaining.length;
  const t0 = Date.now();

  if (DRY_RUN) {
    console.log(`[A5.4] item ${idx}/${total} (${row.legacy_id || row.id.slice(0, 8)}): [DRY RUN] would start(generateBriefWorkflow, ["${row.id}"])`);
    tally.enqueued++;
    continue;
  }

  // Hand the item to the durable workflow. Fire-and-forget: start() returns a
  // runId immediately; the workflow runs durably (and may suspend on the
  // per-claim human-verify hook for CRITICAL/HIGH) without blocking this loop.
  let run;
  try {
    run = await start(generateBriefWorkflow, [row.id]);
  } catch (e) {
    console.log(`[A5.4] item ${idx}/${total} (${row.legacy_id || row.id.slice(0, 8)}): START_FAIL ${e.message?.slice(0, 200)}`);
    log(`[${row.legacy_id || row.id}] START_FAIL ${e.message?.slice(0, 200)}`);
    tally.start_failed++;
    continue;
  }

  const ms = Date.now() - t0;
  checkpoint.completed_ids.push(row.id);
  saveCheckpoint();
  tally.enqueued++;
  console.log(`[A5.4] item ${idx}/${total} (${row.legacy_id || row.id.slice(0, 8)}): ENQUEUED runId=${run.runId} (${ms}ms)`);
  log(`[${row.legacy_id || row.id}] ENQUEUED runId=${run.runId} ms=${ms}`);
}

log(`# RUN end ${new Date().toISOString()} — enqueued=${tally.enqueued} start_fail=${tally.start_failed}`);

printFinalReport(uncovered.length);

// ── final report helper ────────────────────────────────────────────
function printFinalReport(uncoveredTotal) {
  console.log("\n[A5.4] === Final enqueue report ===");
  console.log(`Uncovered D1 items targeted:    ${uncoveredTotal}`);
  console.log(`Items enqueued this run:        ${tally.enqueued}`);
  console.log(`Start failures:                 ${tally.start_failed}`);
  console.log(`Cumulative checkpoint enqueued: ${checkpoint.completed_ids.length}`);
  console.log("");
}
