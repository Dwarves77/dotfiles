import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnvFile } from "../../lib/env-file.mjs";

/** fsi-app root, resolved from this file's own location (scripts/maintenance/lib/cli.mjs -> fsi-app). */
export function fsiRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
}

/** Pure: --mode/--arg/--out out of argv. `--mode` defaults to 'dry'; bare `--apply` is accepted too
 *  (matches every existing script in this repo — screen-reconcile-records.mjs, apply-mint-batch.mjs,
 *  etc. — so the same muscle memory works here). NOT exported (lane DEAD-EXEC, 2026-09-04): used only
 *  by `runCli` below — no wrapper script or test imports it directly, per the wiring audit's Appendix B
 *  (dead exports, 2026-09-04). */
function parseCliArgs(argv) {
  const get = (flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
  };
  const modeFlag = get("--mode");
  const mode = modeFlag ?? (argv.includes("--apply") ? "apply" : "dry");
  const arg = get("--arg") ?? "";
  const out = get("--out") ?? null;
  return { mode, arg, out };
}

/**
 * requiresArg declarations (lane OPS-1, 2026-10-07, chain-fire report F-RED-1). A step listed here cannot do
 * anything without an input (a worklist file, a selector) and refuses by design when `--arg` is empty. Under
 * maintenance.yml `step=all` (every step, dry, ONE dispatch, so no per-step arg exists) that refusal was
 * counted as a nonzero step. `runCli` now skips such a step in the fan-out with a logged reason instead.
 * A NAMED dispatch of the step is unaffected: it still runs main() and refuses on its own terms.
 * Value = the human reason printed in the skip line and recorded in summary.json.
 */
export const REQUIRES_ARG = Object.freeze({
  "attach-found-sources": "needs --arg naming the worklist JSON file; dispatch it named with a real worklist path",
  "reopen-validation-holds": "needs --arg naming the --reason-contains failure-class selector; dispatch it named",
});

/**
 * Pure: the skip summary when `step` declares an input requirement, the run is the `all` fan-out
 * (env RUN_STEP === "all", set by maintenance.yml) and no arg was given; otherwise null.
 */
export function fanoutSkipSummary({ step, mode, arg, env = process.env, requires = REQUIRES_ARG }) {
  const reason = requires[step];
  if (!reason || env.RUN_STEP !== "all" || String(arg || "").trim() !== "") return null;
  return {
    step, mode, skipped: true, skip_reason: `skipped in step=all fan-out: ${reason}`,
    counts: {}, applied: 0, read_back: {}, exitCode: 0,
  };
}

/** Writes `<outDir>/summary.json`. Returns the file path, or null when outDir is falsy (no --out). */
export function writeSummary(outDir, summary) {
  if (!outDir) return null;
  mkdirSync(outDir, { recursive: true });
  const file = resolve(outDir, "summary.json");
  writeFileSync(file, JSON.stringify(summary, null, 2) + "\n");
  return file;
}

/**
 * Runs one maintenance wrapper's main() as a CLI: parses args, loads .env.local (best-effort — CI
 * injects env directly), checks DB creds when `needsDb`, builds deps via `buildDeps()` (real DB/spawn
 * wiring — omitted for DB-less steps), calls `main(opts, deps)`, prints the summary, writes summary.json
 * when --out is given, and exits with `summary.exitCode ?? 0`.
 * @param {{ step: string, main: Function, needsDb?: boolean, buildDeps?: () => Promise<object>|object }} spec
 */
export async function runCli({ step, main, needsDb = true, buildDeps }) {
  const { mode, arg, out } = parseCliArgs(process.argv.slice(2));
  if (mode !== "dry" && mode !== "apply") {
    console.error(`${step}: --mode must be 'dry' or 'apply' (got '${mode}').`);
    process.exit(1);
  }

  const skip = fanoutSkipSummary({ step, mode, arg });
  if (skip) {
    console.log(`${step}: ${skip.skip_reason}`);
    console.log(JSON.stringify(skip, null, 2));
    if (out) console.log(`${step}: wrote ${writeSummary(out, skip)}`);
    process.exit(0);
  }

  loadLocalEnvFile();

  if (needsDb && (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    console.error(`${step}: no DB creds (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY) — cannot run here (exit 2).`);
    process.exit(2);
  }

  const deps = buildDeps ? await buildDeps() : {};

  let summary;
  try {
    summary = await main({ mode, arg, out }, deps);
  } catch (e) {
    console.error(`${step}: fatal:`, e);
    process.exit(1);
  }

  console.log(JSON.stringify(summary, null, 2));
  if (out) {
    const file = writeSummary(out, summary);
    console.log(`${step}: wrote ${file}`);
  }
  process.exit(typeof summary?.exitCode === "number" ? summary.exitCode : 0);
}

/** Small helper CLI entrypoints use to build the artifact-out dir consistently with the workflow's own
 *  `$RUNNER_TEMP/maintenance-<step>` convention when no --out is given (e.g. a local by-hand run). */
export function defaultOutDir(step) {
  const base = process.env.RUNNER_TEMP || process.env.TMPDIR || "/tmp";
  return join(base, `maintenance-${step}`);
}
