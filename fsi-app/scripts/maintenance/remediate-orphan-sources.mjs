// remediate-orphan-sources.mjs — MAINT dispatch step for scripts/verify/remediate-orphan-sources.mjs
// (lane F25-WAVE52, 2026-09-07, F25 module-liveness expiry-52 disposition — docs/audits/
// f25-wave52-dispositions-2026-09-07.md). This is the REMEDIATION half of invariant SC-2-source-
// registration (.discipline/governance/invariants.mjs): rule 019 (commit-time) and migration 135 (DB
// guard) stop NEW orphans; scripts/verify/orphan-source-audit.mjs (already wired, this lane's own
// AUDITS array) DETECTS pre-existing orphans; this script is the invariant's own residual note naming
// what FIXES them ("orphan-source-audit = live-data scan that must reach 0 to clear pre-existing
// orphans"). It had NO dispatch root anywhere (hand-run only) — this wrapper is that first runtime,
// following the exact subprocess-wrap shape acquire-primaries.mjs/refetch-capped.mjs already use in
// this directory.
//
// SUBPROCESS WRAP: the target script does real, guarded Supabase writes (registerSource /
// reclassifyToSource through db.mjs) as part of even reading its own dry-run report — wrapping it
// unmodified as a child process is the honest boundary, same rationale as this directory's other
// remediation wrappers. This wrapper's own logic (mode/arg -> flags, stdout-count parsing, summary
// shape) is what remediate-orphan-sources.test.mjs unit-tests, with a fake `run` standing in for the
// real spawn.
//
// `arg`, when set, is passed through as `--limit=<arg>` (bound the batch; the target script's own
// `--limit=N` flag) — omit for the full unbounded orphan population.
//
// USAGE (by hand, needs DB creds — NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY):
//   node scripts/maintenance/remediate-orphan-sources.mjs --mode dry
//   node scripts/maintenance/remediate-orphan-sources.mjs --mode apply --arg 50
// Normally dispatched via .github/workflows/maintenance.yml (step=remediate-orphan-sources).
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { runCli, fsiRoot } from "./lib/cli.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const TARGET = resolve(HERE, "..", "verify", "remediate-orphan-sources.mjs");

/** Pure: mode/arg -> the target script's own CLI flags. @param {{mode?:string, arg?:string}} opts */
export function buildArgs({ mode = "dry", arg = "" } = {}) {
  const flags = mode === "apply" ? ["--apply"] : [];
  const limit = String(arg || "").trim();
  if (limit) flags.push(`--limit=${limit}`);
  return flags;
}

/** Pure: parse the target script's own printed summary line — either
 *  "registered/activated=N failed=M" (apply) or "DRY-RUN — N would be registered..." (dry) — plus its
 *  leading "orphans to register: N" count line. Returns {} for any line not found (never throws). */
export function parseCounts(stdout) {
  const text = String(stdout || "");
  const out = {};
  const total = text.match(/orphans to register:\s*(\d+)/);
  if (total) out.orphans_found = Number(total[1]);
  const applied = text.match(/registered\/activated=(\d+)\s+failed=(\d+)/);
  if (applied) { out.registered = Number(applied[1]); out.failed = Number(applied[2]); }
  const dry = text.match(/DRY-RUN — (\d+) would be registered/);
  if (dry) out.would_register = Number(dry[1]);
  return out;
}

/**
 * @param {{ mode?: "dry"|"apply", arg?: string, out?: string|null }} opts
 * @param {{ run: (argv: string[]) => Promise<{ code: number, stdout: string }> }} deps
 */
export async function main({ mode = "dry", arg = "" } = {}, deps) {
  const summary = { step: "remediate-orphan-sources", mode, arg: arg || null, counts: {}, applied: 0, read_back: {}, exitCode: 0 };
  const argv = buildArgs({ mode, arg });
  const { code, stdout } = await deps.run(argv);
  summary.exitCode = code === 0 ? 0 : 1;
  summary.stdout_tail = String(stdout || "").slice(-4000);

  const counts = parseCounts(stdout);
  summary.counts = counts;
  summary.applied = mode === "apply" ? (counts.registered ?? 0) : 0;
  summary.read_back = mode === "apply" ? { failed: counts.failed ?? 0 } : { would_register: counts.would_register ?? 0 };
  if (code !== 0) summary.note = `target script exited ${code} — see stdout_tail.`;
  return summary;
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  await runCli({
    step: "remediate-orphan-sources",
    main,
    needsDb: true,
    buildDeps: async () => ({
      run: async (argv) => {
        const r = spawnSync(process.execPath, [TARGET, ...argv], { cwd: fsiRoot(), encoding: "utf8", env: process.env, stdio: ["ignore", "pipe", "inherit"] });
        return { code: r.status ?? 1, stdout: r.stdout || "" };
      },
    }),
  });
}
