/**
 * sprint3-a15-step1-takedown-published.mjs — URGENT A1.5 Step 1.
 *
 * Takes down the 2 PUBLISHED EcoVadis items per operator verdict:
 *   - 52eadc84-b3ea-4a80-8173-30b7d5435d4f  "EcoVadis Blog"
 *   - 19f08fcc-5f81-44cc-b3db-fe25f1717845  "EcoVadis"
 *
 * These are LIVE on customer surfaces as commercial-vendor marketing
 * masquerading as intelligence. Take down FIRST, before remaining
 * A1.5 work, per operator urgency.
 *
 * Treatment (Verdict 1 = Option C = both):
 *   - is_archived = true        (exits customer-facing surfaces)
 *   - domain = 5                (Source Intel meta-catalog)
 *   - category = null           (no false topic association)
 *
 * Per-step verification per dispatch discipline: read each row
 * BEFORE update, perform update, read BACK to verify, halt on
 * any divergence.
 *
 * Output: docs/audits/sprint3-a15-step1-takedown-log-2026-05-25.json
 */

import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";

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

const LOG_DIR = resolve("docs", "audits");
if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
const LOG_PATH = resolve(LOG_DIR, "sprint3-a15-step1-takedown-log-2026-05-25.json");

// The 2 PUBLISHED EcoVadis items, per A1.5 sweep results.
const TARGETS = [
  { id: "52eadc84-b3ea-4a80-8173-30b7d5435d4f", expected_title: "EcoVadis Blog" },
  { id: "19f08fcc-5f81-44cc-b3db-fe25f1717845", expected_title: "EcoVadis" },
];

const log = { run_date: new Date().toISOString(), targets: TARGETS, steps: [] };

async function main() {
  for (const target of TARGETS) {
    console.log(`\n[A1.5/Step1] Processing ${target.id} (${target.expected_title})`);

    // Pre-read
    const { data: before, error: readErr } = await supabase
      .from("intelligence_items")
      .select("id, title, is_archived, domain, category, pipeline_stage, source_id")
      .eq("id", target.id)
      .maybeSingle();
    if (readErr) {
      log.steps.push({ id: target.id, action: "ABORT", reason: `pre-read failed: ${readErr.message}` });
      console.error("ABORT:", readErr.message);
      writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
      process.exit(1);
    }
    if (!before) {
      log.steps.push({ id: target.id, action: "ABORT", reason: "row not found" });
      console.error("ABORT: row not found");
      writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
      process.exit(1);
    }

    // Sanity check: title matches expected
    if (before.title !== target.expected_title) {
      log.steps.push({
        id: target.id,
        action: "ABORT",
        reason: `title mismatch: expected "${target.expected_title}", got "${before.title}"`,
      });
      console.error(`ABORT: title mismatch — expected "${target.expected_title}", got "${before.title}"`);
      writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
      process.exit(1);
    }
    console.log(`  pre-read: title="${before.title}" archived=${before.is_archived} domain=${before.domain} category=${before.category} pipeline=${before.pipeline_stage}`);

    // Update
    const { error: updErr } = await supabase
      .from("intelligence_items")
      .update({ is_archived: true, domain: 5, category: null })
      .eq("id", target.id);
    if (updErr) {
      log.steps.push({ id: target.id, action: "ABORT", reason: `update failed: ${updErr.message}` });
      console.error("ABORT:", updErr.message);
      writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
      process.exit(1);
    }

    // Read-back verify
    const { data: after } = await supabase
      .from("intelligence_items")
      .select("id, title, is_archived, domain, category, pipeline_stage")
      .eq("id", target.id)
      .maybeSingle();
    if (!after || !after.is_archived || after.domain !== 5 || after.category !== null) {
      log.steps.push({
        id: target.id,
        action: "ABORT",
        reason: `verify failed: ${JSON.stringify(after)}`,
      });
      console.error("ABORT: read-back did not match expected post-state");
      writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
      process.exit(1);
    }
    console.log(`  post-update: archived=${after.is_archived} domain=${after.domain} category=${after.category}`);
    log.steps.push({
      id: target.id,
      action: "UPDATED",
      title: before.title,
      pre: {
        is_archived: before.is_archived,
        domain: before.domain,
        category: before.category,
        pipeline_stage: before.pipeline_stage,
      },
      post: {
        is_archived: after.is_archived,
        domain: after.domain,
        category: after.category,
      },
    });
  }

  writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
  console.log(`\n[A1.5/Step1] DONE. Both items archived + rerouted to domain 5. Log: ${LOG_PATH}`);
}

main().catch((e) => {
  console.error(e);
  log.error = e.message;
  writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
  process.exit(1);
});
