// acquire-primaries.mjs — MAINT dispatch step for scripts/remediation/acquire-primaries-batch.mjs
// (lane ONESHOTS, 2026-09-06, F25 expiry-52 disposition). writeSnapshot (the sole writer of
// raw_fetches, the permanent append-only capture store) is called ONLY from the target script and
// _reground/acquire-*.mjs — this is the operator-fired acquire path's real, still-needed writer (see
// docs/inventories/shared-dataset-ownership.md's `raw_fetches` registration). It had NO dispatch root
// anywhere (hand-run only) — this wrapper is that first runtime.
//
// SUBPROCESS WRAP, not an in-process import (unlike most other MAINT wrappers in this directory): the
// target script does REAL, LIVE network fetches (fetch(), PDF extraction, officialness classification)
// as an unavoidable part of even its dry-run path — refactoring that into injected deps for an
// in-process call would mean either faking the network in production or duplicating the fetch/
// candidate-selection logic here (CLAUDE.md: no copies of logic). Wrapping it unmodified as a child
// process is the honest boundary: this wrapper's OWN logic (mode/arg -> flags, summary shape) is what
// `acquire-primaries.test.mjs` unit-tests, with a fake `run` (child-process) function standing in for
// the real spawn — the target script's own acquisition behavior is unchanged and unduplicated.
//
// `arg` is the item scope to acquire for — a comma-separated list of legacy_id/id-prefixes, passed
// through as the target script's own `--only=`. This is "the worklist" this step drives: there is no
// separate worklist FILE (the target script reads live from intelligence_items, not a file) — arg names
// the item scope directly, which serves the same "what does this run touch" purpose a worklist file
// would. APPLY ONLY (no `|| (dry && all)` branch in maintenance.yml): a dry run still performs real,
// billable-in-time (not in $) network fetches with no persisted effect, so this step is never part of
// an 'all' fan-out — dispatch it named, with an explicit --arg scope, or omit --arg for the full
// non-verified set (a real, if slow, dry-run classification of what WOULD be acquired).
//
// USAGE (by hand, needs DB creds):
//   node scripts/maintenance/acquire-primaries.mjs --mode dry --arg it-042,it-043
//   node scripts/maintenance/acquire-primaries.mjs --mode apply --arg it-042,it-043
// Normally dispatched via .github/workflows/maintenance.yml (step=acquire-primaries).
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { runCli, fsiRoot } from "./lib/cli.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const TARGET = resolve(HERE, "..", "remediation", "acquire-primaries-batch.mjs");

/** Pure: mode/arg -> the target script's own CLI flags. @param {{mode?:string, arg?:string}} opts */
export function buildArgs({ mode = "dry", arg = "" } = {}) {
  // The target script's own CLI has no explicit --dry-run flag — dry IS the absence of --execute
  // ("Run: --dry-run (default) | --execute", its own header).
  const flags = mode === "apply" ? ["--execute"] : [];
  const only = String(arg || "").trim();
  if (only) flags.push(`--only=${only}`);
  return flags;
}

/**
 * @param {{ mode?: "dry"|"apply", arg?: string, out?: string|null }} opts
 * @param {{ run: (argv: string[]) => Promise<{ code: number, stdout: string }>,
 *   readManifest?: (mode: string) => object|null }} deps - `run` executes the target script (real: spawnSync node+TARGET+argv).
 */
export async function main({ mode = "dry", arg = "" } = {}, deps) {
  const summary = { step: "acquire-primaries", mode, arg: arg || null, counts: {}, applied: 0, read_back: {}, exitCode: 0 };
  const argv = buildArgs({ mode, arg });
  const { code, stdout } = await deps.run(argv);
  summary.exitCode = code === 0 ? 0 : 1;
  summary.stdout_tail = String(stdout || "").slice(-4000);

  const manifest = deps.readManifest ? deps.readManifest(mode) : null;
  if (manifest) {
    summary.counts = { acquired: manifest.acquired ?? 0, already_held: manifest.already ?? 0, held_no_primary: manifest.held ?? 0, exempt_type: manifest.exempt ?? 0 };
    summary.applied = mode === "apply" ? (manifest.acquired ?? 0) : 0;
    summary.read_back = { manifest_items: (manifest.out || []).length };
  } else {
    summary.note = "no manifest file found to parse (scripts/tmp/acquire-batch-*.json) — see stdout_tail for the run's own printed summary.";
  }
  if (code !== 0) summary.note = `target script exited ${code} — see stdout_tail.`;
  return summary;
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  await runCli({
    step: "acquire-primaries",
    main,
    needsDb: true,
    buildDeps: async () => ({
      run: async (argv) => {
        const r = spawnSync(process.execPath, [TARGET, ...argv], { cwd: fsiRoot(), encoding: "utf8", env: process.env, stdio: ["ignore", "pipe", "inherit"] });
        return { code: r.status ?? 1, stdout: r.stdout || "" };
      },
      readManifest: (mode) => {
        try {
          const path = resolve(fsiRoot(), `scripts/tmp/acquire-batch-${mode === "apply" ? "applied" : "dryrun"}.json`);
          return JSON.parse(readFileSync(path, "utf8"));
        } catch { return null; }
      },
    }),
  });
}
