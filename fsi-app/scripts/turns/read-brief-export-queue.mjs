#!/usr/bin/env node
// scripts/turns/read-brief-export-queue.mjs -- the CONSUMER end of the brief-export auto-queue (lane R22,
// 2026-10-02, coordinator-directed). The queue itself is harness_runs rows (family "brief-export",
// scripts/turns/brief-export/queue.mjs), landed by run-population-flywheel.mjs's step 12, never a file.
// This is how a session lane reads it -- the replacement for "open scripts/turns/brief-export/pending/
// and read the JSON" (that path is gone; see queue.mjs's own header for the full story).
//
// Usage:
//   node scripts/turns/read-brief-export-queue.mjs --list
//     Lists every still-pending queue row (run_id, mint_run_id, ids, part count), oldest first.
//   node scripts/turns/read-brief-export-queue.mjs --run-id <brief-export-run-NNN>
//     Prints that row's own queued content (inputs_ref -- the parts, claims/sections + pool text) as
//     JSON to stdout, so a session lane can pipe it straight into whatever it was reading a file for.
//
// READ-ONLY, by construction: this script has no write path at all (no guardedUpdate import, no
// "mark drained" flag). "Drained" is a pure, derived read over a LATER brief-apply row's own per_item ids
// (queue.mjs's pendingQueueRows) -- see that module's own header for why no mutation is needed.
//
// Exit codes: 0 = printed. 1 = usage error or DB read error (real failure). 2 = missing credentials,
// self-skip (rule 15: diagnosable, never a false red).

import { readAll } from "../lib/db.mjs";
import { loadLocalEnvFile } from "../lib/env-file.mjs";
import { isMainModule } from "../lib/is-main.mjs";
import { FAMILY as EXPORT_FAMILY, pendingQueueRows } from "./brief-export/queue.mjs";

const APPLY_FAMILY = "brief-apply";

function usage() {
  return (
    "Usage:\n" +
    "  node scripts/turns/read-brief-export-queue.mjs --list\n" +
    "  node scripts/turns/read-brief-export-queue.mjs --run-id <brief-export-run-NNN>"
  );
}

/**
 * Pure: the --list rendering, oldest (lowest run_id) first. @param {object[]} rows
 * @returns {string[]}
 */
export function formatPendingList(rows) {
  if (rows.length === 0) return ["read-brief-export-queue: 0 pending row(s) -- the queue is caught up."];
  const sorted = [...rows].sort((a, b) => String(a.run_id).localeCompare(String(b.run_id)));
  const lines = sorted.map((r) => {
    const ids = (r.per_item ?? []).map((it) => it.id);
    const parts = Array.isArray(r.inputs_ref) ? r.inputs_ref.length : 0;
    return `  ${r.run_id}  mint_run=${r.config?.mint_run_id ?? "(none)"}  ids=${ids.length} (${ids.slice(0, 3).join(",")}${ids.length > 3 ? ",..." : ""})  parts=${parts}`;
  });
  return [`read-brief-export-queue: ${rows.length} pending row(s):`, ...lines];
}

/**
 * Pure: resolve one named run's queued content. @param {object[]} rows (brief-export family only)
 * @param {string} runId
 * @returns {{ok:true, content:object}|{ok:false, error:string}}
 */
export function resolveQueueContent(rows, runId) {
  const row = rows.find((r) => r.run_id === runId);
  if (!row) return { ok: false, error: `no ${EXPORT_FAMILY} row with run_id "${runId}" found.` };
  return { ok: true, content: { run_id: row.run_id, config: row.config, per_item: row.per_item, parts: row.inputs_ref } };
}

/**
 * @param {string[]} args
 * @param {{log?:Function, errorLog?:Function, readAllFn?:Function, loadEnv?:Function}} [deps]
 * @returns {Promise<number>}
 */
export async function runCli(args, deps = {}) {
  const {
    log = (m) => console.log(m),
    errorLog = (m) => console.error(m),
    readAllFn = readAll,
    loadEnv = loadLocalEnvFile,
  } = deps;

  const listMode = args.includes("--list");
  const runIdIdx = args.indexOf("--run-id");
  const runId = runIdIdx >= 0 ? args[runIdIdx + 1] : null;

  if (!listMode && !runId) {
    errorLog(usage());
    return 1;
  }

  loadEnv();
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    errorLog(
      "read-brief-export-queue: NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set -- self-skip " +
        "(no-cred case, rule 15): diagnosable, never a false red.",
    );
    return 2;
  }

  let rows;
  try {
    rows = await readAllFn("harness_runs", "run_id, harness_family, config, per_item, inputs_ref, started_at", {
      match: (q) => q.in("harness_family", [EXPORT_FAMILY, APPLY_FAMILY]),
    });
  } catch (e) {
    errorLog(`read-brief-export-queue: DB read failed: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }

  const exportRows = rows.filter((r) => r.harness_family === EXPORT_FAMILY);
  const applyRows = rows.filter((r) => r.harness_family === APPLY_FAMILY);

  if (listMode) {
    const pending = pendingQueueRows(exportRows, applyRows);
    for (const line of formatPendingList(pending)) log(line);
    return 0;
  }

  const resolved = resolveQueueContent(exportRows, runId);
  if (!resolved.ok) {
    errorLog(`read-brief-export-queue: ${resolved.error}`);
    return 1;
  }
  log(JSON.stringify(resolved.content, null, 2));
  return 0;
}

if (isMainModule(import.meta.url)) {
  runCli(process.argv.slice(2)).then((code) => process.exit(code));
}
