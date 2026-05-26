/**
 * sprint3-a16-apply.mjs — A1.6 apply (per-row-class atomic).
 *
 * Reads the revised manifest at docs/audits/sprint3-a1-revised-manifest-2026-05-25.json
 * and applies one of three phases:
 *
 *   --phase=A    Commit A: category-only changes (~285 rows)
 *   --phase=B    Commit B: domain changes (~132 rows)
 *   --phase=C    Commit C: item_type changes (~69 rows, canonical only)
 *
 * Each invocation touches ONLY the column in scope for that phase, even
 * if a row appears in multiple groups. Verification: bulk read-back of
 * affected IDs, compare each touched field to manifest's expected.to.
 *
 * Concurrency: 10 in-flight UPDATEs. Halt on first error.
 *
 * Output: docs/audits/sprint3-a16-phase-{A|B|C}-log-2026-05-25.json
 */

import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
process.chdir(resolve(__dirname, ".."));
process.loadEnvFile(".env.local");

const args = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  })
);
const PHASE = (args.phase || "").toUpperCase();
if (!["A", "B", "C"].includes(PHASE)) {
  console.error("Usage: node sprint3-a16-apply.mjs --phase=A|B|C");
  process.exit(1);
}

const CONCURRENCY = 10;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const LOG_DIR = resolve("docs", "audits");
if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
const LOG_PATH = resolve(LOG_DIR, `sprint3-a16-phase-${PHASE}-log-2026-05-25.json`);

const MANIFEST = JSON.parse(readFileSync(resolve(LOG_DIR, "sprint3-a1-revised-manifest-2026-05-25.json"), "utf8"));

const PHASE_CONFIG = {
  A: {
    rows: MANIFEST.apply_plan.commit_A_category_only.rows,
    column: "category",
    label: "category-only changes",
  },
  B: {
    rows: MANIFEST.apply_plan.commit_B_domain_changes.rows,
    column: "domain",
    label: "domain changes",
  },
  C: {
    rows: MANIFEST.apply_plan.commit_C_item_type_changes.rows,
    column: "item_type",
    label: "item_type changes (canonical only)",
  },
};

const { rows, column, label } = PHASE_CONFIG[PHASE];

const log = {
  run_date: new Date().toISOString(),
  phase: PHASE,
  label,
  column,
  total_rows: rows.length,
  applied: 0,
  errors: [],
  verify_mismatches: [],
};

async function applyOne(row) {
  const change = row.changes[column];
  if (!change) {
    log.errors.push({ id: row.id, reason: "no change for phase column (manifest bug?)" });
    return false;
  }
  const updatePayload = { [column]: change.to };
  const { error } = await supabase
    .from("intelligence_items")
    .update(updatePayload)
    .eq("id", row.id);
  if (error) {
    log.errors.push({ id: row.id, reason: error.message });
    return false;
  }
  log.applied++;
  return true;
}

// Concurrency pool.
async function workerLoop(rows, fn) {
  let idx = 0;
  async function worker() {
    while (true) {
      const i = idx++;
      if (i >= rows.length) return;
      await fn(rows[i]);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
}

async function main() {
  console.log(`[A1.6/Phase ${PHASE}] ${label} — ${rows.length} rows`);

  if (rows.length === 0) {
    console.log(`[A1.6/Phase ${PHASE}] no rows; exit clean.`);
    writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
    return;
  }

  // Apply.
  await workerLoop(rows, applyOne);
  console.log(`[A1.6/Phase ${PHASE}] apply: ${log.applied}/${rows.length} succeeded, ${log.errors.length} errors`);

  if (log.errors.length > 0) {
    console.error(`[A1.6/Phase ${PHASE}] ABORTING due to apply errors — see log`);
    writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
    process.exit(1);
  }

  // Verify: bulk read-back, compare each row's column to expected.to.
  const ids = rows.map((r) => r.id);
  const idChunks = [];
  for (let i = 0; i < ids.length; i += 100) {
    idChunks.push(ids.slice(i, i + 100));
  }
  const readBack = new Map();
  for (const chunk of idChunks) {
    const { data, error } = await supabase
      .from("intelligence_items")
      .select(`id, ${column}`)
      .in("id", chunk);
    if (error) {
      log.errors.push({ id: "VERIFY", reason: `read-back error: ${error.message}` });
      writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
      process.exit(1);
    }
    for (const r of data ?? []) readBack.set(r.id, r[column]);
  }

  for (const row of rows) {
    const expected = row.changes[column].to;
    const actual = readBack.get(row.id);
    // Handle null comparison
    if (actual !== expected) {
      log.verify_mismatches.push({ id: row.id, title: row.title, expected, actual });
    }
  }

  console.log(`[A1.6/Phase ${PHASE}] verify: ${log.verify_mismatches.length} mismatches`);

  if (log.verify_mismatches.length > 0) {
    console.error(`[A1.6/Phase ${PHASE}] ABORTING due to verify mismatches — see log`);
    writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
    process.exit(1);
  }

  console.log(`[A1.6/Phase ${PHASE}] DONE. ${log.applied} rows applied, all verified.`);
  writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
}

main().catch((e) => {
  console.error(e);
  log.errors.push({ id: "MAIN", reason: e.message });
  writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
  process.exit(1);
});
