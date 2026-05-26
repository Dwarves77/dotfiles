/**
 * sprint3-a15-step3-pause-sources.mjs — A1.5 Step 3.
 *
 * Sets processing_paused=true on the 5 EcoVadis source registry rows.
 * Per operator A1.5 Verdict 2 = Option A (clean cut at source level
 * — stops future ingestion entirely, vs. admin_only=true which only
 * gates UI visibility and lets the pipeline keep landing marketing
 * content).
 *
 * Column correction note: operator verdict said "status='paused'" but
 * sources.status has a CHECK constraint that doesn't include 'paused'.
 * The canonical source-level pause mechanism is sources.processing_paused
 * (BOOLEAN, migration 016) — every ingestion/scan/agent gate already
 * reads this column. processing_paused=true matches the operator intent
 * exactly (stop future ingestion at the source level).
 *
 *   4fdb662c-3ab1-4987-b754-5530c9e511e1  EcoVadis (about-us)
 *   a6b20a8a-e6a9-41aa-9c6c-0f38b71016ba  EcoVadis (blog)
 *   a2d25d50-0bb7-4b7c-8cda-e37d26803e8e  EcoVadis (resources blog)
 *   4a956756-9117-451e-b3f1-1e976dd79e39  EcoVadis (root)
 *   6f698bf0-8e67-4432-83d1-83f9daff7283  EcoVadis (methodology whitepaper)
 *
 * Note: CDP Supply Chain (bb8954b0) is intentionally NOT in this
 * list per operator A1.5 Verdict 3 (keep as legitimate T5 reporting
 * source — non-profit, open Socrata API, framework-referenced).
 *
 * Per-step verification: pre-read, update, read-back.
 *
 * Output: docs/audits/sprint3-a15-step3-pause-log-2026-05-25.json
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
const LOG_PATH = resolve(LOG_DIR, "sprint3-a15-step3-pause-log-2026-05-25.json");

const TARGETS = [
  { id: "4fdb662c-3ab1-4987-b754-5530c9e511e1", expected_name: "EcoVadis" },
  { id: "a6b20a8a-e6a9-41aa-9c6c-0f38b71016ba", expected_name: "EcoVadis" },
  { id: "a2d25d50-0bb7-4b7c-8cda-e37d26803e8e", expected_name: "EcoVadis" },
  { id: "4a956756-9117-451e-b3f1-1e976dd79e39", expected_name: "EcoVadis" },
  { id: "6f698bf0-8e67-4432-83d1-83f9daff7283", expected_name: "EcoVadis" },
];

const log = { run_date: new Date().toISOString(), targets: TARGETS, steps: [] };

async function main() {
  for (const target of TARGETS) {
    console.log(`\n[A1.5/Step3] ${target.id}`);

    const { data: before, error: readErr } = await supabase
      .from("sources")
      .select("id, name, url, status, processing_paused, admin_only")
      .eq("id", target.id)
      .maybeSingle();
    if (readErr || !before) {
      log.steps.push({ id: target.id, action: "ABORT", reason: readErr?.message ?? "row not found" });
      console.error("ABORT");
      writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
      process.exit(1);
    }
    if (before.name !== target.expected_name) {
      log.steps.push({
        id: target.id,
        action: "ABORT",
        reason: `name mismatch: expected "${target.expected_name}", got "${before.name}"`,
      });
      console.error("ABORT: name mismatch");
      writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
      process.exit(1);
    }
    console.log(`  pre: name="${before.name}" url=${before.url} status=${before.status} processing_paused=${before.processing_paused}`);

    const { error: updErr } = await supabase
      .from("sources")
      .update({ processing_paused: true })
      .eq("id", target.id);
    if (updErr) {
      log.steps.push({ id: target.id, action: "ABORT", reason: `update failed: ${updErr.message}` });
      console.error("ABORT:", updErr.message);
      writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
      process.exit(1);
    }

    const { data: after } = await supabase
      .from("sources")
      .select("id, name, status, processing_paused")
      .eq("id", target.id)
      .maybeSingle();
    if (!after || after.processing_paused !== true) {
      log.steps.push({ id: target.id, action: "ABORT", reason: `verify failed: ${JSON.stringify(after)}` });
      console.error("ABORT: verify");
      writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
      process.exit(1);
    }
    console.log(`  post: processing_paused=${after.processing_paused}`);
    log.steps.push({
      id: target.id,
      action: "UPDATED",
      name: before.name,
      url: before.url,
      pre: { processing_paused: before.processing_paused },
      post: { processing_paused: after.processing_paused },
    });
  }

  writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
  console.log(`\n[A1.5/Step3] DONE. 5 EcoVadis sources paused. Log: ${LOG_PATH}`);
}

main().catch((e) => {
  console.error(e);
  log.error = e.message;
  writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
  process.exit(1);
});
