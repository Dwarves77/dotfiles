// attack-cli.mjs -- the one CLI body of the local-stack SQL attack runners (lane TESTS-2, 2026-10-10; fitness F45, one home per
// concept). rls-persona-matrix.mjs and rls-view-function-attacks.mjs both parse `--out-dir`, refuse any environment that is not the
// local stack, connect, run, print, write a JSON report and map violations to the exit code. That body lived twice; it lives here.
//
// Exit: 0 every attack held; 1 a violation; 2 cannot run (bad argument, not the local stack, no connection).

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { assertLocalOnly } from "../../proof/attacks/run-attacks.mjs";

/** Parse `--out-dir <dir>`; any other argument throws. */
export function parseOutDirArgs(argv) {
  const out = { outDir: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--out-dir") out.outDir = argv[++i];
    else throw new Error(`unknown argument ${argv[i]}`);
  }
  return out;
}

/**
 * The CLI body with every side effect injectable. `run(client)` returns a report with a `violations` array; `describe(report, log)`
 * prints the runner's own lines (before the violations). Returns the exit code.
 */
export async function runAttackCli({
  name, reportFile, run, describe,
  argv = process.argv.slice(2), env = process.env,
  connect = async () => (await import("../../lib/pg-conn.mjs")).connectPg(),
  writeFile = writeFileSync, makeDir = mkdirSync, log = console.log,
}) {
  let args;
  try { args = parseOutDirArgs(argv); } catch (e) { log(`${name}: ${e.message}`); return 2; }
  const local = assertLocalOnly(env);
  if (!local.ok) { log(`${name}: REFUSED, the environment is not the local stack:`); local.violations.forEach((v) => log(`  - ${v}`)); return 2; }
  const client = await connect();
  if (!client) { log(`${name}: no database connection to the local stack. Cannot verify, exit 2.`); return 2; }
  try {
    const report = await run(client);
    describe(report, log);
    for (const v of report.violations) log(`VIOLATION ${v}`);
    const outDir = args.outDir ?? env.CP_OUT_DIR ?? env.MP_OUT_DIR ?? null;
    if (outDir) {
      makeDir(outDir, { recursive: true });
      writeFile(join(outDir, reportFile), JSON.stringify(report, null, 2) + "\n", "utf8");
    } else {
      log(`${name}: no output directory (--out-dir, CP_OUT_DIR or MP_OUT_DIR); the report was not written.`);
    }
    return report.violations.length === 0 ? 0 : 1;
  } finally {
    await client.end?.();
  }
}
