#!/usr/bin/env node
// export-loop-fired-evidence.mjs (lane GATES-1, 2026-10-04). Credentialed REFRESH of the committed loop
// firing evidence, the same "credentialed refresh, secret-less check" pattern export-harness-ledger.mjs and
// db-catalog.json use: F50 holds no secret, so the database enters the repo as a plain committed fact file.
//
// WHY. A chained run (a workflow started by another workflow's completion) lands in the `harness_runs` table,
// not as a committed artifact (the 2026-09-26 ruling made that table the run of record), so F50's
// artifact-only reading could never see a loop hop fire. This reads `harness_runs` rows whose `trigger` is
// `workflow_run` or `workflow_run_forced_dry`, places each on its loop hop through the loop manifest
// (mapRowsToHops in .discipline/governance/loop-manifest.mjs, the one definition), and writes
// fsi-app/.discipline/governance/loop-fired-evidence.json: one entry per hop that has fired (hop id, harness
// family, run id, github run id, upstream run id, started_at, trigger). loop-fired-evidence-audit.mjs is the
// hard data-audit that proves every committed entry against the live table (a forged or stale entry fails).
//
// DRY BY DEFAULT: prints the entries and what could not be placed. `--write` writes the file.
// `--out <path>` (with `--write` only) writes to that path instead, resolved against the current working
// directory, so a coordinator can produce the file inside a worktree without touching the main checkout.
// READ-ONLY on the database: one SELECT. Self-skips exit 2 without credentials (rule 15).
//
// Command the coordinator's executor runs to produce the file (needs fsi-app/.env.local or SUPABASE_* set):
//   node fsi-app/scripts/verify/export-loop-fired-evidence.mjs --write
// then commit fsi-app/.discipline/governance/loop-fired-evidence.json. Flipping a hop's enforceFired flag in
// loop-hops.d/ is a separate, later change that this file makes safe to do.
//
// Exit codes: 0 = printed (or wrote). 1 = DB read or write error. 2 = missing credentials, self-skip.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { readAll } from "../lib/db.mjs";
import { loadLocalEnvFile } from "../lib/env-file.mjs";
import { isMainModule } from "../lib/is-main.mjs";
import { LOOP_HOPS, LOOP_FIRED_EVIDENCE_FILE, mapRowsToHops } from "../../.discipline/governance/loop-manifest.mjs";

export const HARNESS_RUN_COLUMNS = "harness_family, run_id, started_at, trigger, github_run_id, upstream_run_id";

/** The file's text for a set of entries. PURE. Two-space JSON, trailing newline, so a diff is reviewable. */
export function renderEvidenceFile(entries) {
  return `${JSON.stringify({ entries }, null, 2)}\n`;
}

/**
 * @param {string[]} args
 * @param {{log?: Function, errorLog?: Function, readAllFn?: Function, loadEnv?: Function,
 *   writeFileFn?: Function, hops?: ReadonlyArray<object>, hasCreds?: () => boolean, outFile?: string}} [deps]
 * @returns {Promise<number>}
 */
export async function runCli(args, deps = {}) {
  const {
    log = (m) => console.log(m),
    errorLog = (m) => console.error(m),
    readAllFn = readAll,
    loadEnv = loadLocalEnvFile,
    writeFileFn = writeFileSync,
    hops = LOOP_HOPS,
    hasCreds = () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    outFile = LOOP_FIRED_EVIDENCE_FILE,
  } = deps;
  const write = args.includes("--write");
  const outIdx = args.indexOf("--out");
  let target = outFile;
  if (outIdx !== -1) {
    if (!write) {
      errorLog("export-loop-fired-evidence: --out requires --write (a dry run writes nothing).");
      return 1;
    }
    const given = args[outIdx + 1];
    if (!given || given.startsWith("--")) {
      errorLog("export-loop-fired-evidence: --out needs a path argument.");
      return 1;
    }
    target = resolve(process.cwd(), given);
  }

  loadEnv();
  if (!hasCreds()) {
    errorLog(
      "export-loop-fired-evidence: NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set -- self-skip " +
        "(no-cred case, rule 15): diagnosable, never a false red.",
    );
    return 2;
  }

  let rows;
  try {
    rows = await readAllFn("harness_runs", HARNESS_RUN_COLUMNS);
  } catch (e) {
    errorLog(`export-loop-fired-evidence: DB read failed: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }

  const { entries, unmapped } = mapRowsToHops(rows, hops);
  const fired = new Set(entries.map((e) => e.hop));
  log(`export-loop-fired-evidence: ${rows.length} harness_runs row(s) read, ${entries.length} of ${hops.length} hop(s) have fired.`);
  for (const e of entries) log(`  FIRED  ${e.hop}  ${e.run_id}  ${e.trigger}  ${e.started_at}`);
  for (const h of hops) if (!fired.has(h.id)) log(`  none   ${h.id}`);
  for (const u of unmapped) log(`  UNMAPPED  ${u.run_id}: ${u.reason}`);

  if (!write) {
    log("export-loop-fired-evidence: dry run, nothing written. Re-run with --write to write the evidence file.");
    return 0;
  }
  try {
    writeFileFn(target, renderEvidenceFile(entries), "utf8");
  } catch (e) {
    errorLog(`export-loop-fired-evidence: write failed: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
  log(`export-loop-fired-evidence: wrote the evidence file (${entries.length} entr${entries.length === 1 ? "y" : "ies"}). Commit the diff.`);
  return 0;
}

if (isMainModule(import.meta.url)) {
  // Set exitCode and let the event loop drain; an explicit process.exit here, right after the Supabase
  // client's async work, can abort while libuv handles are still closing (Windows assertion, exit 127).
  runCli(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}
