// cli.mjs — shared CLI bootstrap for every fsi-app/scripts/maintenance/*.mjs wrapper.
//
// WHY THIS EXISTS (Lane MAINT, 2026-09-02). .github/workflows/maintenance.yml is the first runtime for
// the coordinator-only applies docs/plans/finish-plan-2026-09-02.md's MAINT paragraph names: seven
// steps, each dry by default, apply only with an explicit `mode=apply` dispatch input (and several also
// gated on a ruling token passed as `arg`). Every step needs the SAME three things — parse
// --mode/--arg/--out, load .env.local when run by hand, refuse cleanly when DB creds are absent for a
// step that needs them — so that plumbing lives here once rather than seven times. What each step
// actually DOES (the deps it needs, the DB calls it makes) stays in that step's own file; this module
// never imports db.mjs itself, so a step that needs no DB (tier-opinions, w1-dispositions) never pays
// for a credential check it doesn't need.
//
// CONTRACT every wrapper's main(opts, deps) receives opts = { mode, arg, out } (out is this run's
// artifact/out-dir, null when --out wasn't passed — only review-digests.mjs uses it today, to hand the
// same directory to the upstream script it shells out to; every other step ignores it) and returns:
// { step, mode, counts, applied, read_back, ...}
// per the dispatch's own contract (finish-plan-2026-09-02.md, MAINT paragraph: "a summary.json written
// by every wrapper ({ step, mode, counts..., applied: n, read_back: {...} })"). An optional numeric
// `exitCode` on the returned summary sets this CLI's process exit code (default 0); every step uses
// this instead of throwing for an EXPECTED refusal (bad/missing --arg, "not runnable this way") so the
// summary.json — not just stderr — carries the reason.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** fsi-app root, resolved from this file's own location (scripts/maintenance/lib/cli.mjs -> fsi-app). */
export function fsiRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
}

/** Pure: --mode/--arg/--out out of argv. `--mode` defaults to 'dry'; bare `--apply` is accepted too
 *  (matches every existing script in this repo — screen-reconcile-records.mjs, apply-mint-batch.mjs,
 *  etc. — so the same muscle memory works here). */
export function parseCliArgs(argv) {
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

  try {
    process.loadEnvFile(resolve(fsiRoot(), ".env.local"));
  } catch {
    // CI injects env directly (secrets context -> job env); a local run without .env.local relies on
    // the caller's shell env instead. Either way, absence here is not fatal on its own.
  }

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
