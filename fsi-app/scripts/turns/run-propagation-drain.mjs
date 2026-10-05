#!/usr/bin/env node
// run-propagation-drain.mjs — the propagation family's canonical entry point (Lane DP-ENGINE, system-
// completion train, 2026-09-02). A thin driver over runPropagationDrain (src/lib/propagation/drain.ts):
// real Supabase client, a real harness-run artifact, the same "driver + the modules it gives a runtime to"
// shape run-source-sweep.mjs already established for its own family (see that file's own header).
//
// WHY A RAW createClient(...) HERE, NOT db.mjs's guarded write path. db.mjs's guardedUpdate/guardedInsert
// (rule 015) exist for one-off, human-cited row mutations with a prior-value snapshot — the right shape
// for a script correcting or backfilling specific rows. A drain is a MECHANICAL loop over however many
// undrained events a batch holds, invalidating/recomputing derived_values through migration 285's OWN
// functions (invalidate_dependents, register_derived_value) — the governed, tested, atomic write path
// ALREADY IS the reversibility/audit mechanism (every recompute retains the row it supersedes; migration
// 284/285 already log the event and the edge). A second snapshot-plus-cite layer on top would duplicate
// what the SQL functions already guarantee, not add safety. run-source-sweep.mjs sets this exact
// precedent for its own family (`upsertPortalLinkCandidates` writes via a raw `sb`, not db.mjs) — its own
// header note: db.mjs's rule-015 residual is "a script that constructs its own createClient... excluded"
// from the guard, by design, not an oversight.
//
// MODES: --mode dry runs Pass 1 only (invalidate_dependents(p_apply=false) — counts, writes nothing).
// --mode apply runs both passes (invalidate for real, then recompute every value this run just staled
// through a registered METHODS[method_id] — see drain.ts's own header for the exact two-pass contract).
//
// AFTER THE DRAIN PASSES (lane L4-A): the events this call processed are handed to questionsOnChangeStep,
// which raises the four product questions for the verified items linked to each changed entity (see
// src/lib/learning/questions-on-change.mjs). Dry mode computes and reports the counts and writes nothing;
// apply mode writes through the same guarded writer the flywheel's mint-time step uses. The counts land in
// the run artifact's metrics (qoc_*). NOTE: propagation-drain.yml runs chained firings dry, so a chained
// firing raises no question (see this lane's session-log entry).
//
// ALWAYS records a harness-run artifact, in both modes, from a `finally` block — same crash-safety
// run-source-sweep.mjs and run-extraction.mjs already apply to their own families.
//
// Usage:
//   node scripts/turns/run-propagation-drain.mjs --mode dry [--batch 500] [--trigger-context '<json>']
//   node scripts/turns/run-propagation-drain.mjs --mode apply [--batch 500] [--out-dir dir]
//     [--harness-runs-dir dir] [--trigger-context '<json>']
// Exit 0 done · 1 bad args · 2 no DB creds (cannot run here).
//
// --trigger-context (lane CHAIN, 2026-09-04): only meaningful when this run was fired by
// propagation-drain.yml's own `workflow_run` chaining off "Data producers" completing — a JSON object
// {name, run_id, conclusion} naming that upstream run, recorded verbatim as config.trigger_context on
// this run's own harness-run artifact (null for a plain hand dispatch). See propagation-drain.yml's own
// "Resolve run parameters and the chaining gate" step for how it is built.

import { parseArgs as nodeParseArgs } from "node:util";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runPropagationDrain } from "../../src/lib/propagation/drain.ts";
import { writeRunArtifact, hashHarnessVersion, claimRunId } from "../lib/run-artifact.mjs";
import { GOVERNING_FILES } from "../harness-runs/governing-files.mjs";
import { resolveLoopRunIdFromUpstream } from "../lib/loop-run-id.mjs";
import { loadLocalEnvFile } from "../lib/env-file.mjs";
// Lane L4-A (2026-10-05): the questions-on-change step, run after the drain passes (CLAUDE.md rule 17: a
// runtime that ends without triggering its downstream is a defect). The deps builder is the one shared
// with run-population-flywheel.mjs's mint-time step.
import { runQuestionsOnChange, buildEntityItemsReader, CITE as QUESTIONS_ON_CHANGE_CITE } from "../../src/lib/learning/questions-on-change.mjs";
import { buildTriggerQuestionsDeps } from "../lib/trigger-question-deps.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FSI_ROOT = resolve(HERE, "..", "..");
const DEFAULT_HARNESS_RUNS_DIR = resolve(HERE, "..", "harness-runs", "propagation");

// This family's governing files — IMPORTED from scripts/harness-runs/governing-files.mjs (Wave
// GOV-SINGLE, 2026-09-04), re-exported under this historical name so existing importers keep working
// unchanged — F28's own copy and this runner's self-hash are now the same array by construction.
export const PROPAGATION_GOVERNING_FILES = GOVERNING_FILES.propagation;

function usage() {
  return (
    "Usage: node scripts/turns/run-propagation-drain.mjs --mode <dry|apply> [--batch N]\n" +
    "         [--harness-runs-dir dir] [--out-dir dir] [--trigger-context '<json>']\n" +
    "         [--trigger <workflow_run|workflow_dispatch>]"
  );
}

/** Pure CLI arg parse/validate. @param {string[]} argv */
export function parseArgs(argv) {
  let values;
  try {
    ({ values } = nodeParseArgs({
      args: Array.isArray(argv) ? argv : [],
      options: {
        mode: { type: "string" },
        batch: { type: "string", default: "500" },
        "harness-runs-dir": { type: "string" },
        "out-dir": { type: "string" },
        "trigger-context": { type: "string" },
        trigger: { type: "string" },
      },
      allowPositionals: false,
      strict: true,
    }));
  } catch (err) {
    return { ok: false, error: err.message };
  }

  if (values.mode !== "dry" && values.mode !== "apply") {
    return { ok: false, error: `--mode must be "dry" or "apply" (got ${JSON.stringify(values.mode)}).` };
  }
  const batch = Number(values.batch);
  if (!Number.isFinite(batch) || batch <= 0) {
    return { ok: false, error: "--batch must be a positive number." };
  }
  let triggerContext = null;
  if (values["trigger-context"] !== undefined) {
    try {
      const parsed = JSON.parse(values["trigger-context"]);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { ok: false, error: `--trigger-context must be a JSON object (got ${JSON.stringify(parsed)}).` };
      }
      triggerContext = parsed;
    } catch (err) {
      return { ok: false, error: `--trigger-context must be valid JSON: ${err.message}` };
    }
  }

  // --trigger (lane LOOP-B-FIRING, 2026-09-28, F50/F60): the REAL GitHub event name (github.event_name),
  // passed explicitly rather than inferred from --trigger-context's presence -- an F60 explicit-dispatch
  // fallback run (downstream-chain.yml calling `gh workflow run propagation-drain.yml` directly) carries
  // a rebuilt --trigger-context for loop_run_id resolution even though its OWN event is a genuine
  // workflow_dispatch, so triggerContext presence alone can no longer stand in for the event kind. Only
  // "workflow_run" and "workflow_dispatch" are ever passed by this repo's own workflow; anything else is
  // refused rather than silently recorded.
  let trigger = null;
  if (values.trigger !== undefined) {
    if (values.trigger !== "workflow_run" && values.trigger !== "workflow_dispatch") {
      return { ok: false, error: `--trigger must be "workflow_run" or "workflow_dispatch" (got ${JSON.stringify(values.trigger)}).` };
    }
    trigger = values.trigger;
  }

  return {
    ok: true,
    mode: values.mode,
    batch,
    harnessRunsDir: values["harness-runs-dir"] || null,
    outDir: values["out-dir"] || null,
    triggerContext,
    trigger,
  };
}

/** Resolve this run's top-level artifact `trigger` field (F50). PURE (no I/O), independently testable.
 *  An explicit `trigger` (the real github.event_name propagation-drain.yml's own resolve step captured)
 *  always wins when given: it is the only honest source once the F60 explicit-dispatch fallback exists
 *  (lane LOOP-B-FIRING, 2026-09-28): that fallback's own run carries a non-null triggerContext (for
 *  loop_run_id resolution) despite its REAL event being a plain workflow_dispatch, so triggerContext's
 *  mere presence can no longer stand in for the event kind on its own. Falling back to triggerContext's
 *  presence when no explicit trigger is given keeps every pre-F60 caller (including a local hand run with
 *  no --trigger flag at all) working exactly as before.
 *  @param {object|null} triggerContext
 *  @param {"workflow_run"|"workflow_dispatch"|null} [explicitTrigger]
 *  @returns {"workflow_run"|"workflow_dispatch"} */
export function resolveArtifactTrigger(triggerContext, explicitTrigger = null) {
  if (explicitTrigger === "workflow_run" || explicitTrigger === "workflow_dispatch") return explicitTrigger;
  return triggerContext ? "workflow_run" : "workflow_dispatch";
}

/** The questions-on-change step (lane L4-A). `sb` reads the entity-to-item link, `db` is the
 *  scripts/lib/db.mjs module (reads the open question flags, writes through its guarded insert). Pure
 *  orchestration over injected clients, so it is provable with fakes. @param {{mode:"dry"|"apply", result:object, sb:object, db:object}} args */
export async function questionsOnChangeStep({ mode, result, sb, db }) {
  const deps = {
    readEntityLinks: buildEntityItemsReader(sb),
    ...buildTriggerQuestionsDeps(db, { cite: QUESTIONS_ON_CHANGE_CITE }),
  };
  return runQuestionsOnChange({ mode, events: result?.processedEvents ?? [], deps });
}

/** The questions-on-change counts as flat run-artifact metrics. PURE. `questions_raised` is what apply
 *  mode wrote, and in dry mode what it would write (same number by construction). */
export function questionsOnChangeMetrics(summary) {
  if (!summary) return {};
  const c = summary.counts ?? {};
  return {
    qoc_events_seen: c.events_seen ?? 0,
    qoc_events_mapped: c.events_mapped ?? 0,
    qoc_items_affected: c.items_affected ?? 0,
    qoc_questions_raised: c.new ?? 0,
    qoc_questions_deduplicated: (c.already_open ?? 0) + (c.deduped_in_batch ?? 0),
    qoc_items_capped: c.items_dropped_by_cap ?? 0,
    qoc_events_no_entity: c.events_no_entity ?? 0,
    qoc_events_unmapped: c.events_unmapped ?? 0,
    qoc_read_errors: c.read_errors ?? 0,
  };
}

/** Build this run's per_item / metrics from a DrainResult. PURE (no I/O) so the shaping is independently
 *  testable, matching run-source-sweep.mjs's own shapeRunOutput. `reportPath` is where the full DrainResult
 *  was written on disk (the artifact's full_trace_refs pointer). `questionsOnChange` (optional) is the
 *  questions-on-change summary, merged into metrics as qoc_* keys. */
export function shapeRunOutput(result, reportPath, questionsOnChange = null) {
  const perItem = [
    {
      id: `queue-depth-${result.queueDepthBefore}`,
      outcome: result.errors.length ? "error" : "drained",
      verdict:
        result.mode === "dry"
          ? `${result.eventsConsidered} event(s) considered, ${result.invalidated} value(s) would be invalidated (dry, nothing written)`
          : `${result.eventsDrained} event(s) drained, ${result.invalidated} value(s) invalidated, ${result.recomputed} recomputed, ${result.skippedUnknownMethod} skipped (unknown method), ${result.skippedMethodRefused} skipped (method refused)`,
      evidence_refs: [reportPath],
      error: result.errors.length ? result.errors.map((e) => `event ${e.eventId}: ${e.message}`).join("; ") : null,
    },
    ...result.superseded.map((s) => ({
      id: s.to,
      outcome: "recomputed",
      verdict: `supersedes ${s.from}`,
      evidence_refs: [reportPath],
      error: null,
    })),
  ];
  const metrics = {
    mode: result.mode,
    queue_depth_before: result.queueDepthBefore,
    events_considered: result.eventsConsidered,
    events_drained: result.eventsDrained,
    invalidated: result.invalidated,
    recomputed: result.recomputed,
    skipped_unknown_method: result.skippedUnknownMethod,
    skipped_method_refused: result.skippedMethodRefused,
    errors: result.errors.length,
    ...questionsOnChangeMetrics(questionsOnChange),
  };
  return { perItem, metrics };
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) await main();

async function main() {
  loadLocalEnvFile();

  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(`run-propagation-drain: ${parsed.error}\n${usage()}`);
    process.exit(1);
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("run-propagation-drain: no DB creds — cannot run here (exit 2).");
    process.exit(2);
  }

  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const { mode, batch, triggerContext, trigger: explicitTrigger } = parsed;
  const harnessRunsDir = resolve(parsed.harnessRunsDir || DEFAULT_HARNESS_RUNS_DIR);
  const outDir = resolve(parsed.outDir || join(harnessRunsDir, "traces"));

  let runId = null;
  let result = null;
  let runError = null;
  let reportPath = null;
  let questionsOnChange = null;
  let questionsError = null;
  const startedAt = new Date().toISOString();

  try {
    runId = claimRunId(harnessRunsDir, "propagation");

    result = await runPropagationDrain(sb, { caller: `run-propagation-drain:${runId}`, mode, batch });

    mkdirSync(outDir, { recursive: true });
    reportPath = join(outDir, `${runId}.report.json`);
    writeFileSync(reportPath, JSON.stringify(result, null, 2) + "\n", "utf8");
    console.log(`Wrote ${reportPath}`);
    console.log(`${mode === "dry" ? "[dry-run] " : ""}${JSON.stringify(result, null, 2)}`);

    // Questions on change, AFTER the drain passes. A failure here never loses the drain's own result: it is
    // recorded as a defect on the artifact below and fails the run's exit code.
    try {
      const db = await import("../lib/db.mjs");
      questionsOnChange = await questionsOnChangeStep({ mode, result, sb, db });
      console.log(`${mode === "dry" ? "[dry-run] " : ""}questions-on-change: ${JSON.stringify(questionsOnChange.counts)}`);
    } catch (err) {
      questionsError = err;
    }
  } catch (err) {
    runError = err;
  } finally {
    if (runId) {
      const harnessVersion = hashHarnessVersion(PROPAGATION_GOVERNING_FILES, FSI_ROOT);
      const shaped = result && reportPath ? shapeRunOutput(result, reportPath, questionsOnChange) : null;
      const defectsFound = [];
      if (runError) {
        defectsFound.push({
          description: `run-propagation-drain.mjs threw during a ${mode} run: ${runError.message}`,
          root_cause: runError.stack ?? "",
          fix_ref: null,
        });
      }
      if (questionsError) {
        defectsFound.push({
          description: `questions-on-change threw after the ${mode} drain: ${questionsError.message}`,
          root_cause: questionsError.stack ?? "",
          fix_ref: null,
        });
      }
      if (result?.errors?.length) {
        for (const e of result.errors) {
          defectsFound.push({
            description: `propagation event ${e.eventId} failed during the drain: ${e.message}`,
            root_cause: "",
            fix_ref: null,
          });
        }
      }
      const artifact = {
        harness_family: "propagation",
        harness_version: harnessVersion,
        run_id: runId,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        // trigger (lane LOOP-B-FIRING, 2026-09-28, F50): OPTIONAL top-level field the loop-wiring gate
        // (.discipline/fitness/functions/F50-loop-wiring.mjs) reads to tell "a workflow fired this run
        // automatically" apart from "a person dispatched it", see run-artifact.mjs's own TRIGGER_VALUES
        // comment and emit-gate-a-rescan-artifact.mjs's identical field for the gate-a-rescan family.
        // Derived from triggerContext rather than a new CLI flag: propagation-drain.yml's own "Resolve run
        // parameters and the chaining gate" step already only ever passes --trigger-context on a
        // workflow_run dispatch (never on workflow_dispatch, see that file's own `args+=(--trigger-context
        // ...)` line), so triggerContext's presence already IS the trigger kind; no second source of truth.
        trigger: resolveArtifactTrigger(triggerContext, explicitTrigger),
        // trigger_context (lane CHAIN, 2026-09-04): {name, run_id, conclusion} of the upstream "Data
        // producers" run when this drain was fired by propagation-drain.yml's own workflow_run chaining,
        // or null for a plain hand dispatch — recorded every run, even null (same "record it every batch"
        // posture run-population-flywheel.mjs's own trigger_context field already applies).
        config: {
          mode,
          batch,
          trigger_context: triggerContext ?? null,
          // loop_run_id (lane M3b, 2026-09-20): resolved from triggerContext's own {name, run_id} through
          // the shared name-to-family map (scripts/lib/loop-run-id.mjs) -- this hop's upstream is either
          // "Downstream chain" (family downstream-chain) or "Data producers" (its own loop head, no
          // upstream sweep id to inherit -- resolves null by the map's own contract). Null when there is
          // no trigger context at all (a plain hand dispatch).
          loop_run_id: resolveLoopRunIdFromUpstream({
            explicit: null,
            upstreamName: triggerContext?.name ?? null,
            upstreamRunId: triggerContext?.run_id != null ? String(triggerContext.run_id) : null,
            fsiRoot: FSI_ROOT,
          }),
        },
        inputs_ref: [`mode=${mode}`, `batch=${batch}`],
        per_item: shaped?.perItem ?? [],
        metrics: shaped?.metrics ?? {},
        defects_found: defectsFound,
        full_trace_refs: reportPath ? [reportPath] : [harnessRunsDir],
        proposer_notes: runError
          ? "This run threw before completing — see defects_found for the error. Re-run after fixing the root cause."
          : "Auto-emitted by run-propagation-drain.mjs, the propagation family's canonical entry point (lane DP-ENGINE, 2026-09-02, system-completion train). Drives runPropagationDrain (src/lib/propagation/drain.ts) against the propagation_events outbox (migration 284) and the derivation DAG (migration 285).",
      };
      const artifactPath = writeRunArtifact(harnessRunsDir, artifact);
      console.log(`Wrote ${artifactPath}`);
    }
  }

  if (runError) {
    console.error(`run-propagation-drain: FAILED — ${runError.message}`);
    process.exit(1);
  }
  if (questionsError) {
    console.error(`run-propagation-drain: questions-on-change FAILED: ${questionsError.message}`);
    process.exit(1);
  }
  process.exit(0);
}
