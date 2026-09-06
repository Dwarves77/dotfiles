// source-role-cleanup.mjs — MAINT dispatch step for scripts/source-role-cleanup.mjs (lane ONESHOTS,
// 2026-09-06, F25 expiry-52 disposition). session-log.md is explicit and current: "874 registry-wide
// NULL-role rows... the durable path is scripts/source-role-cleanup.mjs" — a real, incomplete repair
// with no ruling gate blocking it, not a discharged one-shot; F22's own residual note names this same
// script as the repair. It had NO dispatch root anywhere (hand-run only, requiring a local `supabase
// link` its own connection code hardcoded) — this wrapper is that first runtime, using the fixed,
// shared scripts/lib/pg-conn.mjs resolver the target script's own header explains.
//
// UPSTREAM: ALL THE CLASSIFICATION LOGIC LIVES IN scripts/source-role-cleanup.mjs's exported
// `planAndApply({ execute, activeOnly }, { query })`, called UNMODIFIED here — nothing reimplemented.
// This wrapper adds only: mode->execute mapping, the pg-conn self-skip, and the summary.json shape.
//
// `arg`: optional; `arg=active-only` narrows the scope to status='active' sources (the pre-2026-08-11
// scope); omitted (default) scopes to every source, matching the durable-path note above.
//
// USAGE (by hand, needs DB creds — SUPABASE_DB_URL/DATABASE_URL, a local `supabase link`, or
// NEXT_PUBLIC_SUPABASE_URL+SUPABASE_DB_PASSWORD):
//   node scripts/maintenance/source-role-cleanup.mjs --mode dry
//   node scripts/maintenance/source-role-cleanup.mjs --mode apply
// Normally dispatched via .github/workflows/maintenance.yml (step=source-role-cleanup).
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCli } from "./lib/cli.mjs";
import { planAndApply } from "../source-role-cleanup.mjs";
// connectPg is imported DYNAMICALLY in buildDeps below — it transitively imports the `pg` npm package,
// and this file's own exported `main` must stay importable by the no-npm-ci discipline test glob (see
// scripts/source-role-cleanup.mjs's own header note on the same trap).

/**
 * @param {{ mode?: "dry"|"apply", arg?: string }} opts
 * @param {{ query: Function }} deps - `query` is a pg.Client-shaped `(sql, params?) => Promise<{rows, rowCount}>`.
 */
export async function main({ mode = "dry", arg = "" } = {}, deps) {
  const execute = mode === "apply";
  const activeOnly = String(arg || "").trim() === "active-only";
  const summary = { step: "source-role-cleanup", mode, counts: {}, applied: 0, read_back: {}, exitCode: 0 };

  const r = await planAndApply({ execute, activeOnly }, deps);
  summary.counts = { scope: activeOnly ? "active-only" : "all", total_rows: r.totalRows, mismatches: r.mismatches.length, by_transition: r.byTransition, ghg_protocol: r.ghg };
  if (!execute) {
    summary.note = `dry: ${r.mismatches.length} confident role mismatch(es) found (scope: ${activeOnly ? "active-only" : "all sources"}). Re-run with --mode apply to write them.`;
    return summary;
  }
  summary.applied = r.applied;
  summary.read_back = { applied: r.applied, halted: r.halted, sample: r.appliedRows.slice(0, 20) };
  if (r.halted) summary.note = `${r.halted} row(s) FAILED read-back verification (source_role changed under us between plan and write) — left untouched.`;
  return summary;
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  await runCli({
    step: "source-role-cleanup",
    main,
    needsDb: false, // this step needs a DIRECT PG connection, not the Supabase REST creds runCli checks
    buildDeps: async () => {
      const { connectPg } = await import("../lib/pg-conn.mjs");
      const c = await connectPg();
      if (!c) {
        console.error("source-role-cleanup: no working Postgres connection — cannot verify here (exit 2).");
        process.exit(2);
      }
      // Close the connection after main() runs (runCli has no post-hook, so wrap query to close on the
      // process's own exit path is unnecessary — Node exits the process at runCli's own process.exit,
      // which tears down the socket; an explicit close here would race main()'s own in-flight query).
      return { query: (sql, params) => c.query(sql, params) };
    },
  });
}
