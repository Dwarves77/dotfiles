#!/usr/bin/env node
// run-change-detection.mjs — the change-detection family's canonical entry point (lane CD,
// change-detection runtime, 2026-09-02). Drives the three-hop chain that already exists in the
// codebase but had never run through a runtime end to end (docs/plans/system-completion-plan-2026-09-02.md
// §0 item 3, live-confirmed 2026-09-02: 0 pending monitoring_queue change rows, 0 pending staged_updates):
//
//   STEP A  detect     POST the DEPLOYED /api/worker/check-sources route (x-worker-secret auth) — the
//                      route itself renders each due source via Browserless, fingerprints the content,
//                      writes monitoring_queue rows with a REAL change_detected, and (since 2026-09-01)
//                      already runs its OWN in-process reconcile pass at the end of the same request.
//   STEP B  reconcile  runReconcilePass (src/lib/sources/reconcile.ts) — claims pending monitoring_queue
//                      rows (change_detected=true, reconciled_at IS NULL), records intelligence_changes,
//                      bridges live items into staged_updates (update_item). Run a SECOND time here,
//                      independently of the route's own in-process call, so this script's own artifact
//                      is self-contained evidence of the reconcile step regardless of whether the route
//                      was called this run — and so a --skip-check invocation can still drain a backlog.
//   STEP C  drain      drainChangeSweepUpdates (src/lib/intake/run-intake-cycle.ts, exported for this
//                      driver — see that file's own doc comment on the export) — applies + re-verifies
//                      up to UPDATE_DRAIN_LIMIT pending change-sweep-marked update_item rows.
//
// MODES. --mode dry (default): STEP A never calls the route (it WRITES — sources.*, monitoring_queue,
// portal_link_candidates — see check-sources/route.ts's assessAndUpdateSource); instead this script
// reads the SAME "due for check" predicate the route's own SELECT uses (mirrored below, not imported —
// the route inlines it) to report how many sources WOULD be checked. STEP B calls runReconcilePass with
// `dryRun: true` (src/lib/sources/reconcile.ts's own opt, added by this lane) — a read-only projection
// that counts what would be written without writing. STEP C reads the same pending-row predicate
// drainChangeSweepUpdates uses, without calling it. --mode apply calls the route for real (unless
// --skip-check), runs the SAME reconcile pass for real, and calls the drain export for real.
//
// FIXED, second commit (2026-09-02, "there is no small follow-up fix" — operator ruling): the two
// defects found while building this driver are fixed in check-sources/route.ts itself, not merely
// worked around here. The route now (1) accepts an optional `limit` (JSON body `{"limit": N}` or a
// `?limit=N` query param — this script sends it as a JSON body, `validateCheckLimit`'s own contract) so
// --check-limit genuinely bounds what the deployed route checks in apply mode, not just this script's own
// dry-mode read; and (2) returns `sourcesChecked`/`changesDetected`/`portalCandidates` totals plus
// `httpStatus`/`outcome`/`changeDetected`/`portalCandidates` per source in `results[]` — the fields
// assessAndUpdateSource always computed but the response never carried. This script now reads those
// fields as the PRIMARY source of truth; the same read-only `monitoring_queue`/`portal_link_candidates`
// window queries this driver's first commit used as its only source now run ONLY as a cross-check,
// recorded in the artifact as `verified_by_read` (metrics + per_item), with any mismatch reported —
// never silently swallowed — rather than treated as an error (a concurrent writer or clock skew across
// the call boundary can legitimately produce a one-row difference).
//
// BROWSERLESS COST. assessAndUpdateSource (check-sources/route.ts) makes exactly ONE browserlessRender
// call per source checked (no retries in that code path) — one Browserless "unit" cost per source. This
// repo does not document Browserless's own per-render unit price anywhere in-tree; the closest live
// reference is docs/PHASE2-FLAGSHIP-REGROUND-RUNBOOK.md ("~10 Browserless units" / 5 items, "~60-90
// units" / 30 items — roughly 2 units/render). BROWSERLESS_UNITS_PER_SOURCE_EST below is that estimate,
// clearly labelled — metrics.browserless_units_est = sourcesChecked * BROWSERLESS_UNITS_PER_SOURCE_EST,
// [UNCONFIRMED] against Browserless's own metered billing.
//
// ALWAYS records a harness-run artifact (scripts/lib/run-artifact.mjs), in both modes, from a `finally`
// block — same crash-safety run-source-sweep.mjs and run-mint-batch.mjs already apply to their families.
//
// Usage:
//   node scripts/turns/run-change-detection.mjs --mode dry
//   node scripts/turns/run-change-detection.mjs --mode apply [--check-limit 10] [--reconcile-batch 200]
//     [--drain-limit 5] [--skip-check] [--harness-runs-dir dir] [--trace-dir dir]
// Exit 0 done · 1 bad args or run error · 2 no DB creds / no APP_URL+WORKER_SECRET for a live check.

import { parseArgs as nodeParseArgs } from "node:util";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeRunArtifact, hashHarnessVersion, claimRunId } from "../lib/run-artifact.mjs";
// change-sweep.mjs's own whole transitive import graph is relative .mjs + node: builtins only (traced:
// verify-item.mjs -> acquire-lock.mjs; snapshot-store.mjs -> node:crypto/zlib/util; amendment-diff.mjs ->
// holdings-audit.mjs -> ../agent/source-blocks.mjs, a leaf) — safe to import statically here so this
// file's own pure exports (parseArgs, shapeRunOutput, ...) stay importable by the no-npm-ci discipline
// glob test. "jiti" and "@supabase/supabase-js" are NOT imported at module top level for the same reason
// (see run-source-sweep.mjs's identical discipline) — both are `await import(...)`-ed lazily inside
// main(), which only ever runs when this file is executed directly (IS_MAIN guard below), never on a
// bare `import` for testing.
import { CHANGE_SWEEP_STAGED_MARKER } from "../../src/lib/sources/change-sweep.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FSI_ROOT = resolve(HERE, "..", "..");
const ROOT = FSI_ROOT;
const DEFAULT_HARNESS_RUNS_DIR = resolve(HERE, "..", "harness-runs", "change-detection");

// This family's governing files (fsi-app-relative — mirrors CONVENTION.md's harness_version table + F28's
// GOVERNING_FILES.'change-detection', kept in sync by the CONVENTION-TABLE-PARITY test every other
// family's list already carries).
export const CHANGE_DETECTION_GOVERNING_FILES = Object.freeze([
  "scripts/turns/run-change-detection.mjs",
  "src/lib/sources/reconcile.ts",
  "src/lib/intake/run-intake-cycle.ts",
]);

// The route's own DEFAULT_CHECK_LIMIT (check-sources/route.ts) — mirrored here as this script's own
// default for BOTH --check-limit's dry-mode read/report AND (second commit) the `limit` this script sends
// the route in apply mode, so an unset --check-limit genuinely matches the route's own unparameterised
// default (source-monitoring.yml's own no-body POST behaviour) rather than silently diverging from it.
export const DEFAULT_CHECK_LIMIT = 10;
// reconcile.ts's own RECONCILE_BATCH default (not exported; mirrored here as this script's own default so
// --reconcile-batch has a sane starting point without silently diverging if that constant ever changes —
// passing --reconcile-batch explicitly always wins either way).
export const DEFAULT_RECONCILE_BATCH = 200;
// The estimate cited in the file header above — [UNCONFIRMED] against Browserless's real metered price.
export const BROWSERLESS_UNITS_PER_SOURCE_EST = 2;

// ── The scrape gate (2026-09-03, change-detection run-004 apply: `HTTP 200 ok=true sourcesChecked=0`
// while 959 sources were due). check-sources/route.ts exits BEFORE its due-sources SELECT when
// `pause.ts isGloballyPaused()` (system_state.scrape_cadence='off' OR global_processing_paused) or
// `scrape-schedule.ts scrapeWindowOpen()` (not a scheduled scrape day) says no — and it returns HTTP 200
// with `sourcesChecked: 0` and a "...; worker exiting" message. This driver's dry mode mirrored only the
// due-sources predicate, so dry said "959 would be checked" and apply checked 0, with the artifact
// classifying the apply as `checked`. Two fixes, both here: (1) BOTH modes now read the same gate state
// the route reads (pause.ts readScrapeState — the throwing form of the route's own fail-closed
// getScrapeState — + scrape-schedule.ts scrapeWindowOpen, imported via jiti, not re-implemented) and report `scrape_gate` in metrics, with `sources_checkable` = due count only when the
// gate is open; (2) an apply run whose route response carries the worker-exiting message is classified
// `gate_closed_at_route`, never `checked`. The gate itself is NOT bypassed: "the loop/cadence flip is the
// operator's word only" (PROGRAM-BOARD standing constraints, 2026-07-13; ADR-015 §3 — cadence OFF is a
// standing spend constraint, and setting system_state.scrape_cadence/scrape_start_date is the operator's
// config action). Pure given its inputs so it is unit-tested with a stub windowOpen.
export const SCRAPE_GATE_REASONS = Object.freeze({
  emergency_stop: "system_state.global_processing_paused=true (operator emergency stop) — check-sources exits before selecting any source",
  cadence_off: "system_state.scrape_cadence='off' — check-sources exits before selecting any source; the cadence flip is the operator's word only (ADR-015 §3)",
  not_a_scrape_day: "today is not a scheduled scrape day for the saved cadence — the automated worker fires only on scrape days (decision C)",
});

/** The route's own gate order (route.ts: isGloballyPaused → scrapeWindowOpen), evaluated from the same
 *  ScrapeState `getScrapeState()` returns. `windowOpen` is scrape-schedule.ts's `scrapeWindowOpen`,
 *  injected so this stays a pure function.
 *  @param {{cadence:string,startDate:string|null,emergencyPaused:boolean}} state
 *  @param {Date} now
 *  @param {(s:{cadence:string,startDate:string|null}, now:Date)=>boolean} windowOpen
 *  @returns {{open:boolean, reason:string|null, detail:string, cadence:string, start_date:string|null, emergency_paused:boolean}} */
export function evaluateScrapeGate(state, now, windowOpen) {
  const base = { cadence: state.cadence, start_date: state.startDate ?? null, emergency_paused: !!state.emergencyPaused };
  if (state.emergencyPaused) return { ...base, open: false, reason: "emergency_stop", detail: SCRAPE_GATE_REASONS.emergency_stop };
  if (state.cadence === "off") return { ...base, open: false, reason: "cadence_off", detail: SCRAPE_GATE_REASONS.cadence_off };
  if (!windowOpen({ cadence: state.cadence, startDate: state.startDate ?? null }, now)) {
    return { ...base, open: false, reason: "not_a_scrape_day", detail: SCRAPE_GATE_REASONS.not_a_scrape_day };
  }
  return { ...base, open: true, reason: null, detail: `cadence=${state.cadence} start_date=${state.startDate} — scrape window open today` };
}

/** Did the deployed route refuse at its own gate? Both of route.ts's gate exits return HTTP 200 with a
 *  message ending "; worker exiting" and every total at 0 — distinguishable from "No sources due for
 *  checking" (a real, empty check) and from a real checked batch. @param {any} body @returns {boolean} */
export function routeExitedAtGate(body) {
  return typeof body?.message === "string" && /worker exiting/i.test(body.message);
}
// Bound on the informational "how many rows are pending right now" reads this script does ahead of the
// real (bounded) reconcile/drain calls — generous enough to see the true backlog depth without an
// unbounded scan; NOT the batch/drain limit itself (those stay --reconcile-batch / --drain-limit).
const PENDING_READ_CAP = 1000;

function usage() {
  return (
    "Usage: node scripts/turns/run-change-detection.mjs --mode <dry|apply>\n" +
    "         [--check-limit N] [--skip-check] [--reconcile-batch N] [--drain-limit N]\n" +
    "         [--harness-runs-dir dir] [--trace-dir dir]"
  );
}

/** Pure CLI arg parse/validate. @param {string[]} argv */
export function parseArgs(argv) {
  let values;
  try {
    ({ values } = nodeParseArgs({
      args: Array.isArray(argv) ? argv : [],
      options: {
        mode: { type: "string", default: "dry" },
        "check-limit": { type: "string" },
        "skip-check": { type: "boolean", default: false },
        "reconcile-batch": { type: "string" },
        "drain-limit": { type: "string" },
        "harness-runs-dir": { type: "string" },
        "trace-dir": { type: "string" },
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

  function positiveIntOrNull(name, raw) {
    if (raw === undefined) return { ok: true, value: null };
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
      return { ok: false, error: `${name} must be a positive integer (got ${JSON.stringify(raw)}).` };
    }
    return { ok: true, value: n };
  }

  const checkLimit = positiveIntOrNull("--check-limit", values["check-limit"]);
  if (!checkLimit.ok) return checkLimit;
  const reconcileBatch = positiveIntOrNull("--reconcile-batch", values["reconcile-batch"]);
  if (!reconcileBatch.ok) return reconcileBatch;
  const drainLimit = positiveIntOrNull("--drain-limit", values["drain-limit"]);
  if (!drainLimit.ok) return drainLimit;

  return {
    ok: true,
    mode: values.mode,
    skipCheck: Boolean(values["skip-check"]),
    checkLimit: checkLimit.value, // null = use DEFAULT_CHECK_LIMIT
    reconcileBatch: reconcileBatch.value, // null = use DEFAULT_RECONCILE_BATCH
    drainLimit: drainLimit.value, // null = use UPDATE_DRAIN_LIMIT (resolved after import)
    harnessRunsDir: values["harness-runs-dir"] || null,
    traceDir: values["trace-dir"] || null,
  };
}

/** Where a run's raw step results (its full trace) are written when --trace-dir is not given — one level
 *  below the family directory, mirroring run-source-sweep.mjs's defaultTraceDir so F28's family-level
 *  *.json artifact glob never sees it. PURE. @param {string} harnessRunsDir */
export function defaultTraceDir(harnessRunsDir) {
  return join(harnessRunsDir, "traces");
}

/** UTC-midnight of `now`, ISO string — mirrors check-sources/route.ts's inline `windowStart` expression
 *  EXACTLY (the route computes it inline, nothing there is importable): a source checked already THIS
 *  scrape window (last_checked >= windowStart) is not due again until the next UTC day. PURE.
 *  @param {Date} [now] */
export function dueSourcesWindowStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

/** Estimate Browserless render-call cost for a check-sources batch. PURE. See file header for basis.
 *  @param {number} sourcesChecked */
export function browserlessUnitsEstimate(sourcesChecked) {
  return Math.max(0, sourcesChecked) * BROWSERLESS_UNITS_PER_SOURCE_EST;
}

/**
 * Build this run's per_item / metrics / inputs_ref from the raw step results collected in main(). PURE
 * (no I/O) so the shaping is independently testable, mirroring run-source-sweep.mjs's shapeRunOutput.
 * `reportPath` is where the raw step results were written on disk (the artifact's full_trace_refs
 * pointer). See the module header for the shape of `raw`.
 * @param {object} raw
 * @param {string} reportPath
 */
export function shapeRunOutput(raw, reportPath) {
  const { mode, skipCheck, checkLimit, reconcileBatch, drainLimit, check, reconcile, drain } = raw;
  const perItem = [];

  // ── scrape gate (both modes) ────────────────────────────────────────────────────────────────────
  // `gate` is absent only on artifacts shaped from a run that threw before reading system_state.
  const gate = check.gate ?? null;
  if (gate) {
    perItem.push({
      id: "scrape-gate",
      outcome: gate.open ? "gate_open" : "gate_closed",
      verdict: gate.open
        ? `scrape gate OPEN — ${gate.detail}`
        : `scrape gate CLOSED (${gate.reason}) — ${gate.detail}; check-sources would check 0 source(s) regardless of how many are due`,
      evidence_refs: [],
      error: null,
    });
  }

  // ── check (Step A) ──────────────────────────────────────────────────────────────────────────────
  if (check.skipped) {
    const dueClause = gate && !gate.open
      ? `${check.dueCount} source(s) due by the due-predicate but 0 checkable while the gate is closed (${gate.reason})`
      : `${check.dueCount} source(s) due for check`;
    perItem.push({
      id: "check-sources",
      outcome: "skipped",
      verdict:
        `check skipped (${check.reason}); ${dueClause} ` +
        `(sample of ${check.dueSample.length}, capped at --check-limit=${checkLimit})`,
      evidence_refs: [],
      error: null,
    });
    for (const s of check.dueSample) {
      perItem.push({ id: `due:${s.id}`, outcome: "due_not_checked", verdict: `${s.name} — base_tier ${s.base_tier}`, evidence_refs: [], error: null });
    }
  } else {
    const exitedAtGate = check.ok && routeExitedAtGate(check.body);
    perItem.push({
      id: "check-sources",
      outcome: !check.ok ? "route_error" : exitedAtGate ? "gate_closed_at_route" : "checked",
      verdict: !check.ok
        ? `HTTP ${check.httpStatus}: ${check.error}`
        : exitedAtGate
          ? `HTTP ${check.httpStatus}: the deployed route refused at its own gate ("${check.body?.message}") — 0 source(s) checked; ` +
            `nothing was detected, reconciled or drained from this step (local gate read: ${gate ? (gate.open ? "open" : `closed/${gate.reason}`) : "not read"})`
          : `HTTP ${check.httpStatus}: ${check.body?.message ?? ""} — ${check.body?.sourcesChecked ?? "?"} source(s) checked ` +
            `(${check.body?.changesDetected ?? "?"} changesDetected, ${check.body?.portalCandidates ?? "?"} portalCandidates — route-reported)`,
      evidence_refs: [],
      error: check.ok ? null : check.error,
    });
    if (gate && exitedAtGate === gate.open) {
      // The local gate read and the deployed route disagree — a deploy lag or a system_state write between
      // the two reads. Reported, never swallowed (same posture as verified_by_read mismatches).
      perItem.push({
        id: "scrape-gate:cross-check",
        outcome: "gate_cross_check_mismatch",
        verdict: `local system_state read says gate ${gate.open ? "open" : `closed (${gate.reason})`} but the deployed route ${exitedAtGate ? "exited at its gate" : "ran its check"}`,
        evidence_refs: [],
        error: null,
      });
    }
    for (const r of check.body?.results ?? []) {
      perItem.push({
        id: `check:${r.source}`,
        outcome: r.status,
        verdict: r.error
          ? `error: ${r.error}`
          : `status=${r.status} httpStatus=${r.httpStatus} outcome=${r.outcome} changeDetected=${r.changeDetected} portalCandidates=${r.portalCandidates}`,
        evidence_refs: [],
        error: r.error ?? null,
      });
    }
    if (check.mismatches?.length) {
      perItem.push({
        id: "check-sources:verified_by_read",
        outcome: "cross_check_mismatch",
        verdict: check.mismatches.join("; "),
        evidence_refs: [],
        error: null,
      });
    }
  }

  // ── reconcile (Step B) ──────────────────────────────────────────────────────────────────────────
  const rr = reconcile.result;
  for (const row of reconcile.queueRows) {
    perItem.push({
      id: `queue:${row.id}`,
      outcome: mode === "dry" ? "would_reconcile" : "reconcile_pass_ran",
      verdict: `source ${row.source_id}, checked_at ${row.checked_at}`,
      evidence_refs: [],
      error: null,
    });
  }

  // ── drain (Step C) ──────────────────────────────────────────────────────────────────────────────
  if (mode === "apply") {
    for (const item of drain.result.items) {
      perItem.push({
        id: `drain:${item.stagedId ?? item.itemId ?? item.title}`,
        outcome: item.disposition,
        verdict: item.reason ?? item.disposition,
        evidence_refs: [],
        error: item.disposition === "update_rejected" ? (item.reason ?? "rejected") : null,
      });
    }
  } else {
    for (const row of drain.dryRows) {
      perItem.push({
        id: `drain:${row.id}`,
        outcome: "would_drain",
        verdict: `item ${row.item_id ?? "(none — would be rejected: no item_id)"}, staged ${row.created_at}`,
        evidence_refs: [],
        error: null,
      });
    }
  }

  const sourcesChecked = check.skipped ? 0 : (check.body?.sourcesChecked ?? check.body?.results?.length ?? 0);
  const metrics = {
    mode,
    skip_check: skipCheck,
    check_limit: checkLimit,
    reconcile_batch: reconcileBatch,
    drain_limit: drainLimit,
    sources_due_for_check: check.skipped ? check.dueCount : null,
    // What the route's gate would let through: the due count when the gate is open, 0 when closed, null
    // when the gate was not read (a run that threw first) or the route was actually called.
    sources_checkable: check.skipped ? (gate ? (gate.open ? check.dueCount : 0) : null) : null,
    scrape_gate: gate ? { open: gate.open, reason: gate.reason, cadence: gate.cadence, start_date: gate.start_date, emergency_paused: gate.emergency_paused } : null,
    route_exited_at_gate: check.skipped ? null : (check.ok ? routeExitedAtGate(check.body) : null),
    sources_checked: sourcesChecked,
    // Primary source: the route's own reported totals (second commit — computed from the same
    // assessAndUpdateSource() calls, not re-derived here).
    changes_detected: check.skipped ? null : (check.body?.changesDetected ?? null),
    portal_candidates_touched: check.skipped ? null : (check.body?.portalCandidates ?? null),
    // Cross-check only — READ-ONLY monitoring_queue/portal_link_candidates window counts, kept
    // independent of the route's response. Never the primary number; see crossCheckMismatches.
    verified_by_read: check.skipped ? null : {
      changes_detected: check.verifiedByRead?.changeDetectedCount ?? null,
      portal_candidates_touched: check.verifiedByRead?.portalCandidatesTouched ?? null,
      mismatches: check.mismatches ?? [],
    },
    pending_change_rows: rr.pending,
    pending_change_rows_total: reconcile.pendingTotal,
    changes_recorded: rr.changesRecorded,
    staged: rr.staged,
    drained: mode === "apply" ? drain.result.drained : drain.dryRows.length,
    approved: mode === "apply" ? drain.result.approved : null,
    rejected: mode === "apply" ? drain.result.rejected : null,
    not_drained: mode === "apply" ? drain.result.notDrained : drain.overflow,
    browserless_units_est: browserlessUnitsEstimate(sourcesChecked),
  };

  const inputsRef = [
    `route=POST /api/worker/check-sources (skipped=${check.skipped})`,
    `monitoring_queue: change_detected=true AND reconciled_at IS NULL LIMIT ${reconcileBatch}`,
    `staged_updates: update_type=update_item AND status=pending AND reason LIKE '${CHANGE_SWEEP_STAGED_MARKER}%' LIMIT ${drainLimit}`,
  ];

  return { perItem, metrics, inputsRef, fullTraceRefs: [reportPath] };
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) await main();

async function main() {
  try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* CI: env injected */ }

  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(`run-change-detection: ${parsed.error}\n${usage()}`);
    process.exit(1);
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("run-change-detection: no DB creds — cannot run here (exit 2).");
    process.exit(2);
  }
  const willCallRoute = parsed.mode === "apply" && !parsed.skipCheck;
  if (willCallRoute && (!process.env.APP_URL || !process.env.WORKER_SECRET)) {
    console.error("run-change-detection: --mode apply without --skip-check needs APP_URL + WORKER_SECRET — cannot run here (exit 2).");
    process.exit(2);
  }

  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
  const { runReconcilePass } = await jiti.import("../../src/lib/sources/reconcile.ts");
  const { drainChangeSweepUpdates, UPDATE_DRAIN_LIMIT, MANUAL_INTAKE_CALLER } = await jiti.import("../../src/lib/intake/run-intake-cycle.ts");
  // The route's OWN gate readers (not mirrored): pause.ts getScrapeState + scrape-schedule.ts scrapeWindowOpen.
  const { readScrapeState } = await jiti.import("../../src/lib/api/pause.ts");
  const { scrapeWindowOpen } = await jiti.import("../../src/lib/sources/scrape-schedule.ts");

  const mode = parsed.mode;
  const skipCheck = parsed.skipCheck;
  const checkLimit = parsed.checkLimit ?? DEFAULT_CHECK_LIMIT;
  const reconcileBatch = parsed.reconcileBatch ?? DEFAULT_RECONCILE_BATCH;
  const drainLimit = parsed.drainLimit ?? UPDATE_DRAIN_LIMIT;

  const harnessRunsDir = resolve(parsed.harnessRunsDir || DEFAULT_HARNESS_RUNS_DIR);
  const traceDir = resolve(parsed.traceDir || defaultTraceDir(harnessRunsDir));

  let runId = null;
  let runError = null;
  let reportPath = null;
  const startedAt = new Date().toISOString();
  const raw = { mode, skipCheck, checkLimit, reconcileBatch, drainLimit };

  try {
    runId = claimRunId(harnessRunsDir, "change-detection");

    // ── STEP A0: the scrape gate, read the way the route reads it (both modes) ──────────────────
    // readScrapeState THROWS on a failed read (pause.ts) — the route's getScrapeState fails closed to
    // 'off', which is right for a gate but would let this report say "cadence_off" when it really means
    // "could not read system_state". A failed read here is a run error, not a gate verdict.
    const gate = evaluateScrapeGate(await readScrapeState(sb), new Date(), scrapeWindowOpen);
    console.log(gate.open
      ? `[gate] OPEN — ${gate.detail}`
      : `[gate] CLOSED (${gate.reason}) — ${gate.detail}`);

    // ── STEP A: detect ──────────────────────────────────────────────────────────────────────────
    if (!willCallRoute) {
      const reason = skipCheck ? "--skip-check" : "dry mode never calls a route that writes (sources, monitoring_queue, portal_link_candidates)";
      const due = await countDueSources(sb, checkLimit);
      raw.check = { skipped: true, reason, gate, ...due };
      console.log(gate.open
        ? `[check] skipped (${reason}) — ${due.dueCount} source(s) due for check`
        : `[check] skipped (${reason}) — ${due.dueCount} source(s) due by predicate, 0 checkable: the route exits at its gate (${gate.reason})`);
    } else {
      const windowBefore = new Date().toISOString();
      const posted = await postCheckSources(process.env.APP_URL, process.env.WORKER_SECRET, checkLimit);
      // verifiedByRead is a CROSS-CHECK only (second commit) — the route's own response body
      // (posted.body.changesDetected / .portalCandidates / .sourcesChecked) is the primary source of
      // truth now that it carries real per-request totals computed from the same assessAndUpdateSource()
      // calls, at zero extra DB round trip.
      const verifiedByRead = posted.ok ? await countWindowChangeStats(sb, windowBefore) : { changeDetectedCount: null, portalCandidatesTouched: null };
      const mismatches = posted.ok ? crossCheckMismatches(posted.body, verifiedByRead) : [];
      raw.check = { skipped: false, gate, httpStatus: posted.status, ok: posted.ok, body: posted.body, error: posted.error, verifiedByRead, mismatches };
      if (posted.ok && routeExitedAtGate(posted.body)) {
        console.log(`[check] HTTP ${posted.status} GATE CLOSED AT ROUTE — "${posted.body?.message}" — 0 source(s) checked; this apply detected nothing`);
      } else {
        console.log(`[check] HTTP ${posted.status} ok=${posted.ok} sourcesChecked=${posted.body?.sourcesChecked ?? "?"} changesDetected=${posted.body?.changesDetected ?? "?"}`);
      }
      if (mismatches.length) console.log(`[check] verified_by_read mismatch(es): ${mismatches.join("; ")}`);
    }

    // ── STEP B: reconcile ───────────────────────────────────────────────────────────────────────
    const queueRows = await readPendingQueueRows(sb, reconcileBatch);
    const pendingTotal = await countPendingQueueRows(sb);
    const reconcileResult = await runReconcilePass(sb, { batch: reconcileBatch, dryRun: mode === "dry" });
    raw.reconcile = { result: reconcileResult, queueRows, pendingTotal };
    console.log(`[reconcile] mode=${mode} processed=${reconcileResult.processed} changesRecorded=${reconcileResult.changesRecorded} staged=${reconcileResult.staged} errors=${reconcileResult.errors.length}`);

    // ── STEP C: drain ───────────────────────────────────────────────────────────────────────────
    if (mode === "apply") {
      const drainResult = await drainChangeSweepUpdates(sb, MANUAL_INTAKE_CALLER, drainLimit);
      raw.drain = { result: drainResult };
      console.log(`[drain] drained=${drainResult.drained} approved=${drainResult.approved} rejected=${drainResult.rejected} notDrained=${drainResult.notDrained}`);
    } else {
      const { rows, overflow } = await readPendingDrainRows(sb, drainLimit);
      raw.drain = { dryRows: rows, overflow };
      console.log(`[drain] dry — ${rows.length} row(s) would be drained, ${overflow} beyond --drain-limit=${drainLimit}`);
    }

    mkdirSync(traceDir, { recursive: true });
    reportPath = join(traceDir, `${runId}.result.json`);
    writeFileSync(reportPath, JSON.stringify(raw, null, 2) + "\n", "utf8");
    console.log(`Wrote ${reportPath}`);
  } catch (err) {
    runError = err;
  } finally {
    if (runId) {
      const harnessVersion = hashHarnessVersion(CHANGE_DETECTION_GOVERNING_FILES, FSI_ROOT);
      const shaped = raw.check && reportPath ? shapeRunOutput(raw, reportPath) : null;
      const defectsFound = [];
      if (runError) {
        defectsFound.push({
          description: `run-change-detection.mjs threw during a ${mode} run: ${runError.message}`,
          root_cause: runError.stack ?? "",
          fix_ref: null,
        });
      }
      const artifact = {
        harness_family: "change-detection",
        harness_version: harnessVersion,
        run_id: runId,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        config: { mode, skip_check: skipCheck, check_limit: checkLimit, reconcile_batch: reconcileBatch, drain_limit: drainLimit },
        inputs_ref: shaped?.inputsRef ?? [`mode=${mode}`],
        per_item: shaped?.perItem ?? [],
        metrics: shaped?.metrics ?? {},
        defects_found: defectsFound,
        full_trace_refs: shaped?.fullTraceRefs ?? [harnessRunsDir],
        proposer_notes: runError
          ? "This run threw before completing — see defects_found for the error. Re-run after fixing the root cause."
          : "Auto-emitted by run-change-detection.mjs, the change-detection family's canonical entry point (lane CD, 2026-09-02). " +
            "In apply mode with --skip-check unset, check-sources/route.ts already runs its OWN in-process reconcile pass — " +
            "this run's own Step B reconcile call is a SECOND, independent pass, so a low or zero changesRecorded/staged here " +
            "on an apply run is expected (the route's own call already claimed the same rows) and not itself a defect.",
      };
      const artifactPath = writeRunArtifact(harnessRunsDir, artifact);
      console.log(`Wrote ${artifactPath}`);
    }
  }

  if (runError) {
    console.error(`run-change-detection: FAILED — ${runError.message}`);
    process.exit(1);
  }
  process.exit(0);
}

/** POST the deployed check-sources route with the worker-secret header, bounding what it checks via a
 *  JSON body `{"limit": N}` — the route's own `validateCheckLimit` contract (body wins over query; this
 *  script only ever sends a body). Never throws — network/HTTP failures are reported in the returned
 *  object. */
async function postCheckSources(appUrl, workerSecret, limit) {
  const base = String(appUrl).replace(/\/+$/, "");
  const target = `${base}/api/worker/check-sources`;
  try {
    const res = await fetch(target, {
      method: "POST",
      headers: { "x-worker-secret": workerSecret, "content-type": "application/json" },
      body: JSON.stringify({ limit }),
    });
    const text = await res.text();
    let body = null;
    try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 4000) }; }
    return { ok: res.ok, status: res.status, body, error: res.ok ? null : (body?.error ?? body?.message ?? `HTTP ${res.status}`) };
  } catch (e) {
    return { ok: false, status: 0, body: null, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Mirrors check-sources/route.ts's own due-sources SELECT (status=active, processing_paused=false,
 *  auto_run_enabled=true, last_checked null or before today's UTC window start, ordered by base_tier) —
 *  READ-ONLY. Returns a full count plus a sample capped at `limit` (what the route's own `.limit(10)`
 *  batch — or this call's --check-limit override for the sample size — would actually pick up). */
async function countDueSources(sb, limit) {
  const windowStart = dueSourcesWindowStart();
  const filters = (q) =>
    q.eq("status", "active").eq("processing_paused", false).eq("auto_run_enabled", true)
      .or(`last_checked.is.null,last_checked.lt.${windowStart}`);

  const { count, error: countErr } = await filters(
    sb.from("sources").select("id", { count: "exact", head: true })
  );
  const { data: sample, error: sampleErr } = await filters(
    sb.from("sources").select("id, name, base_tier").order("base_tier", { ascending: true })
  ).limit(limit);

  return {
    dueCount: countErr ? 0 : (count ?? 0),
    dueSample: sampleErr ? [] : (sample ?? []),
  };
}

/** Rows check-sources' own claim query would read RIGHT NOW (read-only — mirrors reconcile.ts's own
 *  SELECT exactly, capped at `batch`), so per_item can name which queue rows this run touches even in
 *  dry mode (runReconcilePass's dryRun already avoids writing; this is a SEPARATE read for reporting). */
async function readPendingQueueRows(sb, batch) {
  const { data, error } = await sb
    .from("monitoring_queue")
    .select("id, source_id, checked_at")
    .eq("change_detected", true)
    .is("reconciled_at", null)
    .order("checked_at", { ascending: true })
    .limit(batch);
  return error ? [] : (data ?? []);
}

/** Full pending-queue depth (no limit) — informational only, so a --reconcile-batch smaller than the
 *  real backlog is visible in the artifact rather than silently hidden behind the batch cap. */
async function countPendingQueueRows(sb) {
  const { count, error } = await sb
    .from("monitoring_queue")
    .select("id", { count: "exact", head: true })
    .eq("change_detected", true)
    .is("reconciled_at", null);
  return error ? null : (count ?? 0);
}

/** Rows drainChangeSweepUpdates' own claim query would read RIGHT NOW (read-only, mirrors that
 *  function's own SELECT), capped at `limit` for the reported "would drain" set plus an honest overflow
 *  count when more are pending than `limit` covers (the same bounded/reported posture the real drain
 *  applies via `notDrained`). */
async function readPendingDrainRows(sb, limit) {
  const { data, error } = await sb
    .from("staged_updates")
    .select("id, item_id, source_id, created_at")
    .eq("update_type", "update_item")
    .eq("status", "pending")
    .like("reason", `${CHANGE_SWEEP_STAGED_MARKER}%`)
    .order("created_at", { ascending: true })
    .limit(Math.max(limit, PENDING_READ_CAP) + 1);
  if (error) return { rows: [], overflow: 0 };
  const all = data ?? [];
  const rows = all.slice(0, limit);
  const overflow = all.length > limit ? all.length - limit : 0;
  return { rows, overflow };
}

/** How many monitoring_queue rows (change_detected=true) and portal_link_candidates upserts landed since
 *  `sinceIso` — READ-ONLY. Second commit: no longer the primary source for "changes detected" / "portal
 *  candidates" (the route's own response body now carries those, computed from the SAME
 *  assessAndUpdateSource() calls, with zero extra DB round trip) — this read now runs ONLY as an
 *  independent cross-check, compared against the route's reported totals by `crossCheckMismatches` and
 *  recorded in the artifact as `verified_by_read`. A mismatch is reported, never silently swallowed, but
 *  is not itself treated as an error: a concurrent writer or clock skew across the call boundary (this
 *  read happens strictly after the route's response returns) can legitimately produce a small difference. */
async function countWindowChangeStats(sb, sinceIso) {
  const { count: changeDetectedCount, error: cErr } = await sb
    .from("monitoring_queue")
    .select("id", { count: "exact", head: true })
    .eq("change_detected", true)
    .gte("checked_at", sinceIso);
  const { count: portalCandidatesTouched, error: pErr } = await sb
    .from("portal_link_candidates")
    .select("id", { count: "exact", head: true })
    .gte("last_seen_at", sinceIso);
  return {
    changeDetectedCount: cErr ? null : (changeDetectedCount ?? 0),
    portalCandidatesTouched: pErr ? null : (portalCandidatesTouched ?? 0),
  };
}

/** Compare the route's own reported totals (primary source of truth, second commit) against the
 *  read-only `verifiedByRead` cross-check counts. PURE. Returns a list of human-readable mismatch
 *  descriptions (empty when everything agrees, or when the read-only side could not be computed —
 *  `null` counts are never diffed, only reported as "cross-check unavailable"). Never throws — a mismatch
 *  here is informational (recorded in the artifact), not fatal to the run. */
export function crossCheckMismatches(reported, verifiedByRead) {
  const mismatches = [];
  if (!reported || !verifiedByRead) return mismatches;
  for (const field of ["changesDetected", "portalCandidates"]) {
    const readField = field === "changesDetected" ? "changeDetectedCount" : "portalCandidatesTouched";
    const readVal = verifiedByRead[readField];
    const reportedVal = reported[field];
    if (readVal === null || readVal === undefined || reportedVal === null || reportedVal === undefined) {
      mismatches.push(`${field}: cross-check unavailable (read=${readVal}, reported=${reportedVal})`);
      continue;
    }
    if (readVal !== reportedVal) {
      mismatches.push(`${field}: route reported ${reportedVal}, read-only cross-check counted ${readVal}`);
    }
  }
  return mismatches;
}
