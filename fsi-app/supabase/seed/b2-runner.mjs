// Phase B.2 full regeneration runner.
//
// Sequentially enqueues regeneration of all intelligence_items under the
// SKILL.md contract.
//
// Sprint 4 Block 1 (task 1.6): generation no longer runs inline here. Each
// candidate item is handed to the durable Vercel workflow
// `generateBriefWorkflow` via start(). The workflow's steps own the full
// pipeline — source fetch, active sourcing, parse, provenance validation,
// and persist/route (task 1.5) — and step-level retry / RetryableError
// replaces the embedded Sonnet retry this runner used to carry. This runner
// is now a thin, idempotent enqueue driver: it selects candidates and starts
// one durable run per item. It no longer calls Sonnet, fetches source pages,
// parses output, or writes intelligence_items directly.
//
// Behavior:
//   - Pulls candidates: source_url is not null, item_type is a known
//     format, regeneration_skill_version != "2026-04-29".
//   - Sorts by priority CRITICAL -> HIGH -> MODERATE -> LOW (most urgent
//     items get enqueued first; if the run is interrupted, the remaining
//     work is the lowest-priority tail).
//   - For each item: start(generateBriefWorkflow, [item.id]). Writes one log
//     line per item to b2-progress.log.
//   - Idempotent at the contract level: items already at the current
//     regeneration_skill_version are skipped (the workflow stamps it on
//     successful completion).
//
// Usage:
//   node supabase/seed/b2-runner.mjs                 # enqueue all
//   node supabase/seed/b2-runner.mjs --limit=10      # first 10 only
//   node supabase/seed/b2-runner.mjs --legacy=g2,g6  # specific items
//   node supabase/seed/b2-runner.mjs --dry-run       # no enqueue

import { createClient } from "@supabase/supabase-js";
import { appendFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { start } from "workflow/api";
import { generateBriefWorkflow } from "../../src/workflows/generate-brief.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
process.chdir(resolve(__dirname, "..", ".."));

process.loadEnvFile(".env.local");
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Args
const args = process.argv.slice(2);
const limitArg = args.find((a) => a.startsWith("--limit="));
const legacyArg = args.find((a) => a.startsWith("--legacy="));
const dryRun = args.includes("--dry-run");
const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : Infinity;
const legacyList = legacyArg ? legacyArg.split("=")[1].split(",") : null;

const SKILL_VERSION = "2026-04-29";
const LOG_PATH = resolve(process.cwd(), "supabase", "seed", "b2-progress.log");

// Build the work queue
let q = supabase
  .from("intelligence_items")
  .select("id, legacy_id, title, source_url, source_id, item_type, domain, jurisdictions, topic_tags, full_brief, priority, regeneration_skill_version, is_archived")
  .not("source_url", "is", null)
  .neq("source_url", "")
  .eq("is_archived", false);

const { data: allItems } = await q;

// Filter by legacy list if provided
let candidates = allItems || [];
if (legacyList) {
  candidates = candidates.filter((i) => legacyList.includes(i.legacy_id));
}

// Skip ghost FK targets (ss1-ss5) and items with no item_type fitting our formats
const KNOWN_FORMATS = new Set([
  "regulation", "directive", "standard", "guidance", "framework",
  "technology", "innovation", "tool",
  "regional_data",
  "market_signal", "initiative",
  "research_finding",
]);
candidates = candidates.filter((i) => i.item_type && KNOWN_FORMATS.has(i.item_type));
candidates = candidates.filter((i) => !i.legacy_id?.startsWith("ss") && !i.legacy_id?.startsWith("arc"));

// Skip items already regenerated under current contract
const todo = candidates.filter((i) => i.regeneration_skill_version !== SKILL_VERSION);
const done = candidates.filter((i) => i.regeneration_skill_version === SKILL_VERSION);

// Sort by priority — CRITICAL first
const PRI_ORDER = { CRITICAL: 0, HIGH: 1, MODERATE: 2, LOW: 3 };
todo.sort((a, b) => (PRI_ORDER[a.priority] ?? 9) - (PRI_ORDER[b.priority] ?? 9));

const targets = todo.slice(0, limit);

console.log("=== B.2 RUNNER (enqueue mode — task 1.6) ===");
console.log(`SKILL contract version: ${SKILL_VERSION}`);
console.log(`Total candidate items: ${candidates.length}`);
console.log(`Already regenerated:   ${done.length}`);
console.log(`Remaining (todo):      ${todo.length}`);
console.log(`This run will enqueue: ${targets.length}${legacyList ? ` (filtered by legacy_id)` : ""}${dryRun ? " [DRY RUN]" : ""}`);
console.log(`Logging to: ${LOG_PATH}`);
console.log("");

if (targets.length === 0) {
  console.log("Nothing to do. All candidates are at current contract version.");
  process.exit(0);
}

if (!existsSync(LOG_PATH)) {
  appendFileSync(LOG_PATH, `# B.2 progress log — started ${new Date().toISOString()}\n`);
}
appendFileSync(LOG_PATH, `\n# RUN start ${new Date().toISOString()} — ${targets.length} items, dryRun=${dryRun}\n`);

const tally = { enqueued: 0, start_failed: 0 };

for (let i = 0; i < targets.length; i++) {
  const item = targets[i];
  const t0 = Date.now();
  console.log(`\n[${i + 1}/${targets.length}] [${item.legacy_id || item.id.slice(0, 8)}] ${item.title.slice(0, 60)} (${item.item_type}, ${item.priority})`);

  if (dryRun) {
    console.log(`    [DRY RUN] would start(generateBriefWorkflow, ["${item.id}"])`);
    tally.enqueued++;
    continue;
  }

  // Hand the item to the durable workflow. Fire-and-forget: start() returns a
  // runId immediately; the workflow runs durably (and may suspend on the
  // per-claim human-verify hook for CRITICAL/HIGH) without blocking this loop.
  let run;
  try {
    run = await start(generateBriefWorkflow, [item.id]);
  } catch (e) {
    const msg = e.message?.slice(0, 200) || String(e).slice(0, 200);
    console.log(`    ✗ start: ${msg}`);
    appendFileSync(LOG_PATH, `${new Date().toISOString()} [${item.legacy_id || item.id}] START_FAIL ${msg}\n`);
    tally.start_failed++;
    continue;
  }

  const totalMs = Date.now() - t0;
  console.log(`    ✓ enqueued runId=${run.runId} (${totalMs}ms)`);
  appendFileSync(LOG_PATH, `${new Date().toISOString()} [${item.legacy_id || item.id}] ENQUEUED runId=${run.runId} ms=${totalMs}\n`);
  tally.enqueued++;
}

console.log("\n" + "=".repeat(60));
console.log("RUN COMPLETE");
console.log("=".repeat(60));
console.log(`Targeted:   ${targets.length}`);
console.log(`Enqueued:   ${tally.enqueued}`);
console.log(`Start fail: ${tally.start_failed}`);

appendFileSync(LOG_PATH, `# RUN end ${new Date().toISOString()} — enqueued=${tally.enqueued} start_fail=${tally.start_failed}\n`);
