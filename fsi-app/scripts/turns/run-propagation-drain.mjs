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
// NO EVENT IS LOST (CLAUDE.md rules 13 and 17). The drain marks an event drained before the question step
// runs, so a failed or cut-short question step would lose those events for questions. Instead the run
// artifact records the exact event ids the step did not finish (metrics qoc_unfinished_*, bounded list plus
// count, min and max id), and the NEXT run starts by reading the most recent propagation run of record
// (readRunHistory, the same reader loop-run-id.mjs uses), reading those rows back from propagation_events
// (append-only, ADR-043) and running the question step over them BEFORE its own new events (metrics
// qoc_replayed_*). Dedup makes a replay idempotent. A dry run does not consume an id: nothing was written,
// so it stays unfinished and is carried forward. `--questions-for-events <from>-<to>` runs the same step
// over an id range only (dry unless --mode apply is given), with no drain.
//
// SIGNPOSTS (lane L4-D, ADR-044 decision 4). After the drain, the events it processed are matched to the
// unfired signposts whose `watches` is the event's entity; a signpost whose predicate holds is fired
// (fireSignpost: fired_at, an outbox row that flows through this same drain on the next run, the assessment's
// lifecycle) and scored by its direction, and a signpost whose expectation date has passed unfired is scored
// refuted. Every scored outcome appends one source_reliability_ledger row per grounding source. The step is
// dry in dry mode (counts only), runs inside the same replay discipline (a failed signpost's event ids join
// the unfinished list and are replayed next run, without the state-based sweep), and its counts land in the
// artifact's metrics as sp_*. The chained workflow run is dry while scrape_cadence is off, so a chained firing
// reports and changes nothing.
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
import { writeRunArtifact, hashHarnessVersion, claimRunId, readRunHistory } from "../lib/run-artifact.mjs";
import { GOVERNING_FILES } from "../harness-runs/governing-files.mjs";
import { resolveLoopRunIdFromUpstream } from "../lib/loop-run-id.mjs";
import { loadLocalEnvFile } from "../lib/env-file.mjs";
// Lane L4-A (2026-10-05): the questions-on-change step, run after the drain passes (CLAUDE.md rule 17: a
// runtime that ends without triggering its downstream is a defect). The deps builder is the one shared
// with run-population-flywheel.mjs's mint-time step.
import { runQuestionsOnChange, buildEntityItemsReader, readOutboxEvents, CITE as QUESTIONS_ON_CHANGE_CITE } from "../../src/lib/learning/questions-on-change.mjs";
import { buildTriggerQuestionsDeps } from "../lib/trigger-question-deps.mjs";
// Lane L4-D (2026-10-05): the signpost step, run after the drain passes and the questions step (rule 17: a
// prediction is fired and scored by the same run that saw the change, and its reliability evidence is
// appended in the same motion). See src/lib/learning/prediction-scoring.mjs for the whole rule.
import { runSignpostStep, buildSignpostStepDeps, hydrateEventRows, signpostMetrics } from "../../src/lib/learning/prediction-scoring.mjs";

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
    "         [--questions-for-events <from>-<to>]   (questions only over that outbox id range; dry by default)\n" +
    "         [--harness-runs-dir dir] [--out-dir dir] [--trigger-context '<json>']\n" +
    "         [--trigger <workflow_run|workflow_dispatch>] [--loop-run-id <id>]"
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
        "loop-run-id": { type: "string" },
        "questions-for-events": { type: "string" },
      },
      allowPositionals: false,
      strict: true,
    }));
  } catch (err) {
    return { ok: false, error: err.message };
  }

  let questionsForEvents = null;
  if (values["questions-for-events"] !== undefined) {
    questionsForEvents = parseEventRange(values["questions-for-events"]);
    if (!questionsForEvents) {
      return { ok: false, error: `--questions-for-events must be <from>-<to>, two event ids with from <= to and at most ${MAX_REPLAY_RANGE} ids (got ${JSON.stringify(values["questions-for-events"])}).` };
    }
    if (values.mode === undefined) values.mode = "dry";
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
    // --loop-run-id (lane CHAIN-2, ADR-031): the upstream row's own loop id, read by propagation-drain.yml
    // through scripts/lib/upstream-artifact.mjs. An explicit id wins over the on-disk resolver, which finds
    // nothing in a CI checkout now that artifacts land only in harness_runs.
    loopRunId: values["loop-run-id"] && values["loop-run-id"].trim() !== "" ? values["loop-run-id"].trim() : null,
    questionsForEvents,
  };
}

/** Widest outbox id range a manual replay may cover in one run. */
export const MAX_REPLAY_RANGE = 5000;

/** Parse "<from>-<to>" into {from,to}, or null when malformed or too wide. PURE. @param {string} text */
export function parseEventRange(text) {
  const m = /^(\d+)-(\d+)$/.exec(String(text ?? "").trim());
  if (!m) return null;
  const from = Number(m[1]);
  const to = Number(m[2]);
  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from > to || to - from + 1 > MAX_REPLAY_RANGE) return null;
  return { from, to };
}

/**
 * This run's loop_run_id (ADR-031). An explicit id (--loop-run-id, lane CHAIN-2: the upstream row's own loop
 * id as the workflow read it) wins over the on-disk resolver, which finds nothing in a CI checkout. PURE
 * apart from the resolver's directory read; `fsiRoot` is injectable for the test.
 * @returns {string|null}
 */
export function resolveDrainLoopRunId({ explicit = null, triggerContext = null, fsiRoot = FSI_ROOT } = {}) {
  return resolveLoopRunIdFromUpstream({
    explicit,
    upstreamName: triggerContext?.name ?? null,
    upstreamRunId: triggerContext?.run_id != null ? String(triggerContext.run_id) : null,
    fsiRoot,
  });
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

/** The signpost step (lane L4-D). `sb` reads signposts, assessments and grounding sources and carries
 *  fireSignpost's own writes, `db` is the scripts/lib/db.mjs module (guarded ledger insert and score update).
 *  Events replayed from the outbox arrive without their changed row, so it is read back first. `sweep` runs
 *  the state-based paths (repair, deadline) and is false for a replay. @param {{mode:"dry"|"apply", events:Array<object>, sb:object, db:object, sweep?:boolean, now?:Date}} args */
export async function signpostStep({ mode, events, sb, db, sweep = true, now = new Date() }) {
  const hydrated = await hydrateEventRows(sb, events ?? []);
  return runSignpostStep({ mode, events: hydrated, sweep, now, deps: buildSignpostStepDeps(sb, db) });
}

/** The questions-on-change counts as flat run-artifact metrics, under `prefix` (qoc_ for the run's own
 *  events, qoc_replayed_ for replayed ones). PURE. `questions_raised` is what apply mode wrote, and in dry
 *  mode what it would write (same number by construction). A null summary yields {}. */
export function questionsOnChangeMetrics(summary, prefix = "qoc_") {
  if (!summary) return {};
  const c = summary.counts ?? {};
  return {
    [`${prefix}events_seen`]: c.events_seen ?? 0,
    [`${prefix}events_mapped`]: c.events_mapped ?? 0,
    [`${prefix}items_affected`]: c.items_affected ?? 0,
    [`${prefix}questions_raised`]: c.new ?? 0,
    [`${prefix}questions_deduplicated`]: (c.already_open ?? 0) + (c.deduped_in_batch ?? 0),
    [`${prefix}items_capped`]: c.items_dropped_by_cap ?? 0,
    [`${prefix}events_no_entity`]: c.events_no_entity ?? 0,
    [`${prefix}events_unmapped`]: c.events_unmapped ?? 0,
    [`${prefix}read_errors`]: c.read_errors ?? 0,
  };
}

/** Longest list of unfinished event ids recorded verbatim on an artifact. */
export const UNFINISHED_ID_CAP = 500;

/** The unfinished-event-ids metrics: a bounded list, the full count, and min and max id (so a capped list
 *  is still replayable by range). PURE. @param {Array<number|string>} ids */
export function unfinishedMetrics(ids) {
  const sorted = [...new Set((ids ?? []).map(Number))].filter(Number.isFinite).sort((a, b) => a - b);
  return {
    qoc_unfinished_count: sorted.length,
    qoc_unfinished_event_ids: sorted.slice(0, UNFINISHED_ID_CAP),
    qoc_unfinished_capped: sorted.length > UNFINISHED_ID_CAP,
    qoc_unfinished_min_id: sorted.length ? sorted[0] : null,
    qoc_unfinished_max_id: sorted.length ? sorted[sorted.length - 1] : null,
  };
}

/** Unfinished event ids recorded by the most recent run in a readRunHistory() result. PURE. */
export function unfinishedIdsFromHistory(runs) {
  const last = Array.isArray(runs) && runs.length ? runs[runs.length - 1] : null;
  const ids = last?.metrics?.qoc_unfinished_event_ids;
  return Array.isArray(ids) ? ids.map(Number).filter(Number.isFinite) : [];
}

/**
 * The whole question phase of a run: replay first (ids the previous run of record left unfinished, or the
 * manual range), then the drain, then the question step over the drain's own processed events. Returns the
 * results, any errors (none thrown) and the unfinished event ids to record on this run's artifact.
 * An id is finished only when apply mode ran its step to completion without a per-event failure for it; a
 * dry run writes nothing, so replayed ids stay unfinished (carried forward) and the events it just
 * considered were never drained, so they are not unfinished.
 * Lane L4-D: `signposts` (optional, `({mode, events, sweep}) => summary`) is the signpost step. It runs over the
 * replayed events (no sweep) and then over the drain's own events (with the sweep, even when there are none).
 * Its failed event ids join the same unfinished list, so the same replay carries them to the next run.
 * @param {{mode:"dry"|"apply", sb:object, getDb:()=>Promise<object>, harnessRunsDir:string,
 *   range?:{from:number,to:number}|null, drain?:(()=>Promise<object>)|null, readHistory?:Function,
 *   signposts?:Function|null}} args
 */
export async function orchestrateQuestions({ mode, sb, getDb, harnessRunsDir, range = null, drain = null, readHistory = readRunHistory, signposts = null }) {
  const apply = mode === "apply";
  const out = {
    result: null, drainError: null,
    replay: { events: [], summary: null, error: null, signposts: null, signpostsError: null },
    qoc: { summary: null, error: null },
    sp: { summary: null, error: null },
    unfinishedIds: [],
  };
  const unfinished = new Set();

  // 1. Replay, before the new events.
  let replayIds = [];
  try {
    if (range) {
      out.replay.events = await readOutboxEvents(sb, range);
    } else {
      replayIds = unfinishedIdsFromHistory(readHistory(harnessRunsDir).runs);
      if (replayIds.length) out.replay.events = await readOutboxEvents(sb, { ids: replayIds });
    }
    out.replay.summary = out.replay.events.length
      ? await questionsOnChangeStep({ mode, result: { processedEvents: out.replay.events }, sb, db: await getDb() })
      : { counts: {} };
  } catch (err) {
    out.replay.error = err;
  }
  if (signposts && out.replay.events.length) {
    try {
      out.replay.signposts = await signposts({ mode, events: out.replay.events, sweep: false });
    } catch (err) {
      out.replay.signpostsError = err;
    }
  }
  const replayAll = range ? out.replay.events.map((e) => e.eventId) : replayIds;
  const replayFailed = [...(out.replay.summary?.failed_event_ids ?? []), ...(out.replay.signposts?.failed_event_ids ?? [])];
  if (out.replay.error || out.replay.signpostsError) {
    if (apply || !range) replayAll.forEach((id) => unfinished.add(Number(id)));
  } else if (apply) {
    replayFailed.forEach((id) => unfinished.add(Number(id)));
  } else if (!range) {
    replayAll.forEach((id) => unfinished.add(Number(id)));
  }

  // 2. The drain and the step over its own events (not in manual range mode).
  if (drain) {
    try {
      out.result = await drain();
    } catch (err) {
      out.drainError = err;
    }
    if (out.result) {
      const events = out.result.processedEvents ?? [];
      try {
        out.qoc.summary = await questionsOnChangeStep({ mode, result: out.result, sb, db: await getDb() });
      } catch (err) {
        out.qoc.error = err;
      }
      if (apply) {
        const failed = out.qoc.error ? events.map((e) => e.eventId) : (out.qoc.summary?.failed_event_ids ?? []);
        failed.forEach((id) => unfinished.add(Number(id)));
      }
      if (signposts) {
        try {
          out.sp.summary = await signposts({ mode, events, sweep: true });
        } catch (err) {
          out.sp.error = err;
        }
        if (apply) {
          const failed = out.sp.error ? events.map((e) => e.eventId) : (out.sp.summary?.failed_event_ids ?? []);
          failed.forEach((id) => unfinished.add(Number(id)));
        }
      }
    }
  }
  out.unfinishedIds = [...unfinished].sort((a, b) => a - b);
  return out;
}

/** Build this run's per_item / metrics from a DrainResult. PURE (no I/O) so the shaping is independently
 *  testable, matching run-source-sweep.mjs's own shapeRunOutput. `reportPath` is where the full DrainResult
 *  was written on disk (the artifact's full_trace_refs pointer). `questionsOnChange` (optional) is the
 *  questions-on-change summary, merged into metrics as qoc_* keys. */
export function shapeRunOutput(result, reportPath, questionsOnChange = null, extraMetrics = {}) {
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
    ...extraMetrics,
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

  const { mode, batch, triggerContext, trigger: explicitTrigger, loopRunId: explicitLoopRunId, questionsForEvents } = parsed;
  const harnessRunsDir = resolve(parsed.harnessRunsDir || DEFAULT_HARNESS_RUNS_DIR);
  const outDir = resolve(parsed.outDir || join(harnessRunsDir, "traces"));

  let runId = null;
  let result = null;
  let runError = null;
  let reportPath = null;
  let questionsOnChange = null;
  let questionsError = null;
  let orchestrated = null;
  const startedAt = new Date().toISOString();

  try {
    runId = claimRunId(harnessRunsDir, "propagation");

    // Replay of unfinished events, the drain, then questions on change over the drain's own events
    // (orchestrateQuestions). A failure in the question phase never loses the drain's own result: it is
    // recorded as a defect on the artifact below, its event ids are carried forward, and the exit code fails.
    orchestrated = await orchestrateQuestions({
      mode, sb, harnessRunsDir,
      getDb: () => import("../lib/db.mjs"),
      range: questionsForEvents,
      drain: questionsForEvents ? null : () => runPropagationDrain(sb, { caller: `run-propagation-drain:${runId}`, mode, batch }),
      // Lane L4-D: fire and score signposts over the same events (and replay them with the same ids).
      signposts: async ({ events, sweep }) => signpostStep({ mode, events, sb, db: await import("../lib/db.mjs"), sweep }),
    });
    if (orchestrated.drainError) throw orchestrated.drainError;
    result = orchestrated.result;
    questionsOnChange = orchestrated.qoc.summary;
    questionsError = orchestrated.qoc.error;

    mkdirSync(outDir, { recursive: true });
    reportPath = join(outDir, `${runId}.report.json`);
    writeFileSync(reportPath, JSON.stringify(result ?? { mode, questions_for_events: questionsForEvents }, null, 2) + "\n", "utf8");
    console.log(`Wrote ${reportPath}`);
    if (result) console.log(`${mode === "dry" ? "[dry-run] " : ""}${JSON.stringify(result, null, 2)}`);
    if (orchestrated.replay.summary) console.log(`${mode === "dry" ? "[dry-run] " : ""}questions-on-change replay (${orchestrated.replay.events.length} event(s)): ${JSON.stringify(orchestrated.replay.summary.counts)}`);
    if (questionsOnChange) console.log(`${mode === "dry" ? "[dry-run] " : ""}questions-on-change: ${JSON.stringify(questionsOnChange.counts)}`);
    if (orchestrated.sp.summary) console.log(`${mode === "dry" ? "[dry-run] " : ""}signposts: ${JSON.stringify(orchestrated.sp.summary.counts)}`);
    if (orchestrated.replay.signposts) console.log(`${mode === "dry" ? "[dry-run] " : ""}signposts replay: ${JSON.stringify(orchestrated.replay.signposts.counts)}`);
  } catch (err) {
    runError = err;
  } finally {
    if (runId) {
      const harnessVersion = hashHarnessVersion(PROPAGATION_GOVERNING_FILES, FSI_ROOT);
      const qocExtra = orchestrated
        ? {
            ...unfinishedMetrics(orchestrated.unfinishedIds),
            qoc_replayed_events: orchestrated.replay.events.length,
            ...questionsOnChangeMetrics(orchestrated.replay.summary, "qoc_replayed_"),
            ...signpostMetrics(orchestrated.sp.summary),
            ...signpostMetrics(orchestrated.replay.signposts, "sp_replayed_"),
          }
        : {};
      const shaped = result && reportPath ? shapeRunOutput(result, reportPath, questionsOnChange, qocExtra) : null;
      const defectsFound = [];
      if (runError) {
        defectsFound.push({
          description: `run-propagation-drain.mjs threw during a ${mode} run: ${runError.message}`,
          root_cause: runError.stack ?? "",
          fix_ref: null,
        });
      }
      if (orchestrated?.replay.error) {
        defectsFound.push({
          description: `questions-on-change replay of unfinished events threw: ${orchestrated.replay.error.message}`,
          root_cause: orchestrated.replay.error.stack ?? "",
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
      for (const [what, err] of [
        ["signpost step after the drain", orchestrated?.sp.error],
        ["signpost step over replayed events", orchestrated?.replay.signpostsError],
      ]) {
        if (err) {
          defectsFound.push({ description: `${what} threw: ${err.message}`, root_cause: err.stack ?? "", fix_ref: null });
        }
      }
      for (const [what, errs] of [
        ["signpost step", orchestrated?.sp.summary?.errors],
        ["signpost step (replay)", orchestrated?.replay.signposts?.errors],
      ]) {
        for (const message of errs ?? []) {
          defectsFound.push({ description: `${what}: ${message}`, root_cause: "", fix_ref: null });
        }
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
          loop_run_id: resolveDrainLoopRunId({ explicit: explicitLoopRunId, triggerContext }),
        },
        inputs_ref: [`mode=${mode}`, `batch=${batch}`],
        per_item: shaped?.perItem ?? [],
        metrics: shaped?.metrics ?? qocExtra,
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
  const phaseError = questionsError ?? orchestrated?.replay.error ?? orchestrated?.sp.error ?? orchestrated?.replay.signpostsError;
  if (phaseError) {
    console.error(`run-propagation-drain: post-drain step (questions or signposts) FAILED: ${phaseError.message}`);
    process.exit(1);
  }
  process.exit(0);
}
