/**
 * sprint3-a15-step2-takedown-remaining.mjs — A1.5 Step 2.
 *
 * Same archive + domain 5 reroute treatment as Step 1, applied to the
 * 3 remaining EcoVadis items (currently draft / no-pipeline-stage):
 *
 *   05b786f8-8753-4e81-923e-ee9d76c56609  "EcoVadis: Enterprise Sustainability Intelligence and Ratings Platform Overview"
 *   6c59d250-5658-406b-b313-ca38b7b4915f  "EcoVadis 2025 Purpose Report: $2.5T Global Spend Now Governed by Sustainability Risk Insights"
 *   8107ba33-30e8-4e73-bee2-dd967f995114  "EcoVadis Sustainability Platform: Comprehensive ESG & Supply Chain Compliance Solution"
 *
 * Same per-step verification discipline as Step 1.
 *
 * Output: docs/audits/sprint3-a15-step2-takedown-log-2026-05-25.json
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
const LOG_PATH = resolve(LOG_DIR, "sprint3-a15-step2-takedown-log-2026-05-25.json");

const TARGETS = [
  { id: "05b786f8-8753-4e81-923e-ee9d76c56609", expected_title: "EcoVadis: Enterprise Sustainability Intelligence and Ratings Platform Overview" },
  { id: "6c59d250-5658-406b-b313-ca38b7b4915f", expected_title: "EcoVadis 2025 Purpose Report: $2.5T Global Spend Now Governed by Sustainability Risk Insights" },
  { id: "8107ba33-30e8-4e73-bee2-dd967f995114", expected_title: "EcoVadis Sustainability Platform: Comprehensive ESG & Supply Chain Compliance Solution" },
];

const log = { run_date: new Date().toISOString(), targets: TARGETS, steps: [] };

async function main() {
  for (const target of TARGETS) {
    console.log(`\n[A1.5/Step2] ${target.id}`);

    const { data: before, error: readErr } = await supabase
      .from("intelligence_items")
      .select("id, title, is_archived, domain, category, pipeline_stage")
      .eq("id", target.id)
      .maybeSingle();
    if (readErr || !before) {
      log.steps.push({ id: target.id, action: "ABORT", reason: readErr?.message ?? "row not found" });
      console.error("ABORT");
      writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
      process.exit(1);
    }
    if (before.title !== target.expected_title) {
      log.steps.push({
        id: target.id,
        action: "ABORT",
        reason: `title mismatch: expected "${target.expected_title}", got "${before.title}"`,
      });
      console.error(`ABORT: title mismatch`);
      writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
      process.exit(1);
    }
    console.log(`  pre: archived=${before.is_archived} domain=${before.domain} category=${before.category} pipeline=${before.pipeline_stage}`);

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

    const { data: after } = await supabase
      .from("intelligence_items")
      .select("id, is_archived, domain, category")
      .eq("id", target.id)
      .maybeSingle();
    if (!after || !after.is_archived || after.domain !== 5 || after.category !== null) {
      log.steps.push({ id: target.id, action: "ABORT", reason: `verify failed: ${JSON.stringify(after)}` });
      console.error("ABORT: verify");
      writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
      process.exit(1);
    }
    console.log(`  post: archived=${after.is_archived} domain=${after.domain} category=${after.category}`);
    log.steps.push({
      id: target.id,
      action: "UPDATED",
      title: before.title,
      pre: { is_archived: before.is_archived, domain: before.domain, category: before.category, pipeline_stage: before.pipeline_stage },
      post: { is_archived: after.is_archived, domain: after.domain, category: after.category },
    });
  }

  writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
  console.log(`\n[A1.5/Step2] DONE. 3 items archived + rerouted. Log: ${LOG_PATH}`);
}

main().catch((e) => {
  console.error(e);
  log.error = e.message;
  writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
  process.exit(1);
});
