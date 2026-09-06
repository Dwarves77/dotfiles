// refetch-capped.mjs — MAINT dispatch step for scripts/remediation/refetch-capped-worklist.mjs (lane
// ONESHOTS, 2026-09-06, F25 expiry-52 disposition). ADR-016 (docs/decisions/ADR-016-storage-side-uncap.md)
// documents this as a not-yet-executed Implementation step, blocked on an open GUARD-1 pool-insert-size
// ruling — "Out of scope: ... running EXECUTE" (the ADR's own words); BUILD (the read-only worklist) was
// always in scope and has been buildable since the ADR landed, but had no dispatch root either.
//
// SUBPROCESS WRAP (same rationale as acquire-primaries.mjs's own header): EXECUTE re-fetches every row
// through the LIVE transport ladder (real network I/O), so wrapping the target script unmodified as a
// child process is the honest boundary — this wrapper's own logic (mode/arg -> flags, the GUARD-1 gate,
// summary shape) is what refetch-capped.test.mjs unit-tests, with a fake `run` standing in for spawnSync.
//
// MODES:
//   dry   (BUILD)   — read-only, no fetch, no write. ALWAYS allowed, including inside an 'all' dry
//                     fan-out (unlike acquire-primaries — this classifies existing rows, it does not
//                     hit the network). Emits the worklist + population counts.
//   apply (EXECUTE) — re-fetches + guarded-replaces. GATED: refuses (exit 1, no subprocess spawned) unless
//                     `arg` is EXACTLY `GUARD-1-accepted` — the explicit operator token this dispatch
//                     requires per ADR-016's own drain order ("operator lifts the hold... then --execute").
//
// USAGE (by hand, needs DB creds):
//   node scripts/maintenance/refetch-capped.mjs --mode dry
//   node scripts/maintenance/refetch-capped.mjs --mode apply --arg GUARD-1-accepted
// Normally dispatched via .github/workflows/maintenance.yml (step=refetch-capped).
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { runCli, fsiRoot } from "./lib/cli.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const TARGET = resolve(HERE, "..", "remediation", "refetch-capped-worklist.mjs");
const GUARD_TOKEN = "GUARD-1-accepted";

/**
 * @param {{ mode?: "dry"|"apply", arg?: string, out?: string|null }} opts
 * @param {{ run: (argv: string[]) => Promise<{ code: number, stdout: string }>,
 *   readArtifact?: (mode: string) => object|null }} deps
 */
export async function main({ mode = "dry", arg = "" } = {}, deps) {
  const summary = { step: "refetch-capped", mode, counts: {}, applied: 0, read_back: {}, exitCode: 0 };
  if (mode === "apply" && String(arg || "").trim() !== GUARD_TOKEN) {
    summary.note = `REFUSED — apply requires --arg ${GUARD_TOKEN} (ADR-016's own explicit operator-acceptance token for the GUARD-1 pool-insert-size ruling). Got arg=${JSON.stringify(arg || "")}. No subprocess spawned, no fetch, no write.`;
    summary.exitCode = 1;
    return summary;
  }
  const { code, stdout } = await deps.run(mode === "apply" ? ["--execute"] : []);
  summary.exitCode = code === 0 ? 0 : 1;
  summary.stdout_tail = String(stdout || "").slice(-4000);

  const artifact = deps.readArtifact ? deps.readArtifact(mode) : null;
  if (artifact) {
    if (mode === "apply") {
      summary.counts = { populations: artifact.populations, raw_counts: artifact.raw_counts };
      summary.applied = artifact.replaced ?? 0;
      summary.read_back = { held: artifact.held ?? 0, reground_recommended: artifact.regroundRecommended ?? 0, flags_resolved: artifact.flagsResolved ?? 0 };
    } else {
      summary.counts = { populations: artifact.populations, raw_counts: artifact.raw_counts, expected: artifact.expected };
      summary.read_back = { worklist_rows: Object.values(artifact.populations || {}).reduce((a, n) => a + n, 0) };
    }
  } else {
    summary.note = (summary.note ? `${summary.note} ` : "") + "no artifact file found to parse (scripts/tmp/refetch-capped-worklist-*.json) — see stdout_tail.";
  }
  if (code !== 0) summary.note = `target script exited ${code} — see stdout_tail.`;
  return summary;
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  await runCli({
    step: "refetch-capped",
    main,
    needsDb: true,
    buildDeps: async () => ({
      run: async (argv) => {
        const r = spawnSync(process.execPath, [TARGET, ...argv], { cwd: fsiRoot(), encoding: "utf8", env: process.env, stdio: ["ignore", "pipe", "inherit"] });
        return { code: r.status ?? 1, stdout: r.stdout || "" };
      },
      readArtifact: (mode) => {
        try {
          const path = resolve(fsiRoot(), `scripts/tmp/refetch-capped-worklist-${mode === "apply" ? "execute" : "build"}.json`);
          return JSON.parse(readFileSync(path, "utf8"));
        } catch { return null; }
      },
    }),
  });
}
