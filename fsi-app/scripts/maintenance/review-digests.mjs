// review-digests.mjs — MAINT dispatch step for scripts/review/build-review-digests.mjs, the
// ratification-digest builder finish-plan-2026-09-02.md's R1 paragraph assigns to a SIBLING lane
// (write set: docs/ratifications/2026-09/**, fsi-app/scripts/review/**), not built here.
//
// WHY THIS WRAPPER, NOT A BARE WORKFLOW STEP. Every MAINT step carries the same summary.json contract
// (finish-plan's own line: "a summary.json written by every wrapper"), so this stays consistent with
// its six siblings even though it shells out rather than importing a function — build-review-digests.mjs
// does not exist in this worktree to import from. This wrapper's whole job: detect absence and fail
// CLEARLY (never a bare "command not found" from a missing-file `node` invocation), and run it when it
// exists.
//
// CONTRACT (R1's own write-set line, reproduced here so it is checkable without reading that lane's
// code): `node scripts/review/build-review-digests.mjs --out <dir>` — reads the live review queues
// (927 provisional sources / 331 canonical candidates / 1,457 portal links / 91 gap dispositions per
// finish-plan-2026-09-02.md's R1 paragraph), writes ratification-digest files under `<dir>`, never
// writes a table itself (R1's scripts are read-only). This step therefore has no `apply` half of its
// own to gate on a ruling — `mode=apply` is what actually RUNS the upstream script (writes digest
// files to disk); `mode=dry` only checks presence and reports what apply would do, matching every
// other MAINT step's dry/apply shape even though nothing here writes a live table. `read_back` stays
// empty by design (documented in the summary, not silently omitted) — this step changes no table.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { runCli, fsiRoot, defaultOutDir } from "./lib/cli.mjs";

export const UPSTREAM_SCRIPT = "scripts/review/build-review-digests.mjs";

/**
 * @param {{ mode?: "dry"|"apply", out?: string|null }} opts
 * @param {{ scriptExists: () => boolean|Promise<boolean>, runScript: (outDir:string) => Promise<{code:number, stdout?:string, stderr?:string}> }} deps
 */
export async function main({ mode = "dry", out = null } = {}, deps) {
  const apply = mode === "apply";
  const outDir = out || defaultOutDir("review-digests");
  const summary = {
    step: "review-digests",
    mode,
    counts: { upstream: UPSTREAM_SCRIPT, out_dir: outDir },
    applied: 0,
    read_back: {},
    exitCode: 0,
  };

  const present = await deps.scriptExists();
  summary.counts.script_present = present;

  if (!present) {
    summary.note = `NOT PRESENT: ${UPSTREAM_SCRIPT} does not exist yet in this worktree (built by sibling lane R1, docs/plans/finish-plan-2026-09-02.md's R1 paragraph). Nothing run.`;
    summary.exitCode = apply ? 1 : 0;
    return summary;
  }

  if (!apply) {
    summary.note = `dry: ${UPSTREAM_SCRIPT} is present. apply would run it with --out ${outDir} and this run's artifact would upload that directory.`;
    return summary;
  }

  const res = await deps.runScript(outDir);
  summary.counts.upstream_exit_code = res.code;
  if (res.code !== 0) {
    summary.note = `${UPSTREAM_SCRIPT} exited ${res.code} — treated as a failed dispatch. stderr: ${String(res.stderr || "").slice(0, 2000)}`;
    summary.exitCode = 1;
    return summary;
  }
  summary.applied = 1; // one digest-build run, not a row count — this step writes files, not table rows
  summary.note = `Ran ${UPSTREAM_SCRIPT} --out ${outDir}. read_back is empty by design — this step changes no live table.`;
  return summary;
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  await runCli({
    step: "review-digests",
    main,
    needsDb: false,
    buildDeps: () => {
      const scriptPath = resolve(fsiRoot(), UPSTREAM_SCRIPT);
      return {
        scriptExists: () => existsSync(scriptPath),
        runScript: (outDir) => {
          const res = spawnSync(process.execPath, [scriptPath, "--out", outDir], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
          if (res.stdout) process.stdout.write(res.stdout);
          if (res.stderr) process.stderr.write(res.stderr);
          return { code: res.status ?? 1, stdout: res.stdout, stderr: res.stderr };
        },
      };
    },
  });
}
