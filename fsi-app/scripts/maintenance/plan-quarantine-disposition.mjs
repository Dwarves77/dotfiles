// plan-quarantine-disposition.mjs -- MAINT dispatch step for scripts/plan-quarantine-disposition.mjs
// (lane QUARANTINE-DISPOSITION, 2026-09-28). Mirrors scripts/maintenance/regen-quarantined.mjs's own
// wrapper shape exactly: the decision/planning logic lives entirely upstream in the target script's
// exported `runPlanner(opts, deps)`, called UNMODIFIED here.
//
// `arg`, if given, is passed through as `--dispatch-apply-deferrals` when arg === "dispatch-apply-deferrals"
// (opt-in, since the hand-off to apply-deferrals.mjs -- even in ITS dry mode -- is extra work most dry
// dispatches don't need). Any other/empty arg leaves the hand-off off.
//
// mode "apply" here means "write scripts/harness-runs/quarantine-disposition/plan.json and this run's own
// harness-run artifact" -- it does NOT write to intelligence_items or integrity_flags. That write (via
// scripts/maintenance/apply-deferrals.mjs) is a SEPARATE, explicitly-authorized dispatch, held under R14
// until the operator lifts the build-mode hold (docs/plans/data-machine-tool-gaps-2026-09-25.md build
// order step 5).
//
// USAGE (by hand, needs DB creds):
//   node scripts/maintenance/plan-quarantine-disposition.mjs --mode dry
//   node scripts/maintenance/plan-quarantine-disposition.mjs --mode apply --arg dispatch-apply-deferrals --out /tmp/qd-plan
// Normally dispatched via .github/workflows/maintenance.yml (step=plan-quarantine-disposition).
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCli } from "./lib/cli.mjs";
import { runPlanner } from "../plan-quarantine-disposition.mjs";

/**
 * @param {{ mode?: "dry"|"apply", arg?: string, out?: string|null }} opts
 * @param {{ sb: object, readAll: Function }} deps
 */
export async function main({ mode = "dry", arg = "", out = null } = {}, deps) {
  const dispatchApplyDeferrals = String(arg || "").trim() === "dispatch-apply-deferrals";
  // `log` is wired through to console.error (not console.log) so it lands in the step's own log output
  // without disturbing runCli's `console.log(JSON.stringify(summary))` contract -- a silent
  // harness_runs_landed:false with no printed reason (run 36446625925, 2026-09-28) is the defect this fixes.
  const r = await runPlanner({ mode, out, dispatchApplyDeferrals }, { sb: deps.sb, readAllFn: deps.readAll, log: (msg) => console.error(msg) });
  const summary = {
    step: "plan-quarantine-disposition", mode,
    counts: r.counts,
    applied: r.outPlanPath ? r.deferralCandidates.length : 0,
    read_back: {
      run_id: r.runId,
      artifact_path: r.artifactPath,
      harness_runs_landed: r.harnessRunRow?.ok === true,
      harness_runs_error: r.harnessRunRow?.ok === true ? null : (r.harnessRunRow?.error ?? null),
      plan_path: r.outPlanPath,
      apply_deferrals_dry_result: r.applyDeferralsDryResult,
    },
  };
  return summary;
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  await runCli({
    step: "plan-quarantine-disposition",
    main,
    needsDb: true,
    buildDeps: async () => {
      const { readClient, readAll } = await import("../lib/db.mjs");
      return { sb: readClient(), readAll };
    },
  });
}
