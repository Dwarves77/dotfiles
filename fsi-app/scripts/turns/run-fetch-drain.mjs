#!/usr/bin/env node
// run-fetch-drain.mjs, the fetch-drain family's canonical entry point (lane M1, 2026-09-18, build plan
// `docs/plans/complete-system-build-plan-2026-09-04.md` section 6.1 row M1). This family has never had a
// runner: every drain to date (fetch-drain-run-001/002/003.json) was a coordinator issuing `pg_net`
// batches by hand through MCP (`fetch-drain-run-003.json`'s own `config.invocation_mechanism`; PROTOCOL.md
// section 0, "the drain family has no single runner script"). The stage audit names this as one of the six
// wiring gaps in loop order (README.md, gap 1: "one of them [fetch-drain] is not even a workflow"). This
// file is that runner, extracted from the same protocol PROTOCOL.md already documents for a lane's own
// hand steps, nothing about the CONTRACT below is invented; it is read from
// `supabase/functions/capture-worker/index.ts` v1.6 and the three existing fetch-drain-run-*.json
// artifacts.
//
// CONTRACT, read (not invented):
//   - The worker (`Deno.serve`, index.ts:221) accepts POST `{ limit?, queue_ids? }` and returns
//     `{ processed, results }`. A `queue_ids` request processes exactly those rows (accepting status
//     'queued' OR 'error' for an explicit replay, index.ts:248); the bare `limit` form claims the oldest
//     'queued' rows itself. This runner ALWAYS sends an explicit `queue_ids` array per batch (never the
//     bare `limit` form) so the rows this runner selected, read back, and reports on are exactly the rows
//     the worker touches, no daylight between the plan and what ran.
//   - The worker's own atomic claim (index.ts:290-292, `UPDATE ... WHERE id=? AND status IN
//     (queued,error)`) means a row already claimed by a concurrent invocation comes back
//     `outcome:"skipped"`, never double-processed, this runner relies on that, it does not re-implement
//     locking of its own.
//   - A row can be left stuck at `status='fetching'` forever if an invocation crashes mid-processing
//     without ever reaching its own terminal UPDATE (fetch-drain-run-003.json's own `defects_found`: the
//     WORKER_RESOURCE_LIMIT class killed the function mid-PDF-parse with no `pending_first_fetch`/
//     `agent_run_searches` write of any kind). That artifact's own `inputs_ref` names the reset condition
//     it used to find such rows: "status='fetching' older than 1 hour", reproduced here as
//     `STUCK_AFTER_MS`, reset via a SCOPED, id-list UPDATE (`db.mjs`'s `guardedUpdateByIds`, cited,
//     snapshotted, re-applies its own match at write time, never an unscoped WHERE).
//
// MODES:
//   --mode dry (default): READ-ONLY. Selects the queued rows (`status='queued'`, oldest `queued_at`
//     first, `--limit`, default 8) and the STUCK rows (`status='fetching'`, `last_attempt_at` at or
//     before the one-hour cutoff). Prints the plan. Writes the artifact with `config.mode:"dry"` and
//     zero invocations. No write, no HTTP call, the same two-clause promise `run-source-sweep.mjs` and
//     `run-ledger-consume.mjs` already keep for their own `--mode dry`.
//   --mode apply: (1) resets every STUCK row to `status='queued'` via the scoped id-list UPDATE described
//     above; (2) re-selects the queued rows (oldest `queued_at` first, `--limit`), run AFTER the reset,
//     so a freshly-reset row's own (old) `queued_at` naturally sorts it to the front of the SAME query,
//     never a second, separately-ordered list; (3) invokes the capture-worker Edge Function directly over
//     HTTPS (never `pg_net`, this runner has its own network egress under GitHub Actions, which is
//     exactly the gap PROTOCOL.md names) in batches of 8 ids (`fetch-drain-run-003.json`'s own batch
//     size), awaiting each batch before sending the next; (4) reads back every batch's own rows
//     afterward (`status`/`attempt_count`/`last_error_text`) regardless of whether the HTTP call itself
//     succeeded, the database is the source of truth for the FINAL outcome, which matters exactly when
//     the HTTP call fails outright (a WORKER_RESOURCE_LIMIT crash leaves no parseable JSON body at all;
//     run-003's own `defects_found` documents this as a live failure mode, not a hypothetical one).
//   --limit: bounds the queued-row selection in BOTH modes. Maximum 64 per run, enforced in code (not
//     only documented), the cap the lane brief names, independent of the default of 8.
//
// ALWAYS records a harness-run artifact (`scripts/lib/run-artifact.mjs`), in both modes, from a `finally`
// block, the same crash-safety `run-source-sweep.mjs`/`run-ledger-consume.mjs` already apply to their
// own families, and PROTOCOL.md section 3's "MANDATORY, the lane's last step" for this family specifically.
//
// Usage:
//   node scripts/turns/run-fetch-drain.mjs --mode dry [--limit 8]
//   node scripts/turns/run-fetch-drain.mjs --mode apply [--limit 8] [--harness-runs-dir dir] [--out-dir dir]
// Exit 0 done · 1 bad args · 2 no DB creds (cannot run here).

import { parseArgs as nodeParseArgs } from "node:util";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { writeRunArtifact, hashHarnessVersion, claimRunId, validateModeArg, baseArtifactFields } from "../lib/run-artifact.mjs";
import { GOVERNING_FILES } from "../harness-runs/governing-files.mjs";
import { loadLocalEnvFile } from "../lib/env-file.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FSI_ROOT = resolve(HERE, "..", "..");
const DEFAULT_HARNESS_RUNS_DIR = resolve(HERE, "..", "harness-runs", "fetch-drain");

// This family's governing files. Extended (governing-files.mjs, same commit) to include this runner
// itself, the same shape every other family's entry already has (source-sweep, ledger-consume, ...);
// before this lane, fetch-drain's entry named only `supabase/functions/capture-worker/index.ts` because
// there was no canonical script to add (see that file's own comment, now updated).
export const FETCH_DRAIN_GOVERNING_FILES = GOVERNING_FILES["fetch-drain"];

export const DEFAULT_LIMIT = 8;
export const MAX_LIMIT = 64;
export const BATCH_SIZE = 8;
export const STUCK_AFTER_MS = 60 * 60 * 1000; // one hour, fetch-drain-run-003.json's own reset condition

function usage() {
  return (
    "Usage: node scripts/turns/run-fetch-drain.mjs --mode <dry|apply> [--limit N (default 8, max 64)]\n" +
    "         [--harness-runs-dir dir] [--out-dir dir]"
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
        limit: { type: "string", default: String(DEFAULT_LIMIT) },
        "harness-runs-dir": { type: "string" },
        "out-dir": { type: "string" },
      },
      allowPositionals: false,
      strict: true,
    }));
  } catch (err) {
    return { ok: false, error: err.message };
  }

  const modeCheck = validateModeArg(values.mode);
  if (!modeCheck.ok) return modeCheck;
  const limitRaw = Number(values.limit);
  if (!Number.isFinite(limitRaw) || !Number.isInteger(limitRaw) || limitRaw <= 0) {
    return { ok: false, error: `--limit must be a positive integer (got ${JSON.stringify(values.limit)}).` };
  }
  if (limitRaw > MAX_LIMIT) {
    return { ok: false, error: `--limit must be at most ${MAX_LIMIT} (got ${limitRaw}), the drain's own cap, enforced in code.` };
  }

  return {
    ok: true,
    mode: values.mode,
    limit: limitRaw,
    harnessRunsDir: values["harness-runs-dir"] || null,
    outDir: values["out-dir"] || null,
  };
}

/** The stuck-row cutoff: a row still `status='fetching'` with `last_attempt_at` at or before this ISO
 *  timestamp is eligible for reset. PURE, `nowMs` is the caller's own clock reading (`Date.now()` live,
 *  a fixed value in a test), never read internally, so this is testable without a live clock.
 *  @param {number} nowMs @returns {string} */
export function stuckCutoffIso(nowMs) {
  return new Date(nowMs - STUCK_AFTER_MS).toISOString();
}

/** Split `ids` into `size`-sized batches, in order. PURE.
 *  @param {string[]} ids @param {number} [size] @returns {string[][]} */
export function batchIds(ids, size = BATCH_SIZE) {
  const out = [];
  const list = Array.isArray(ids) ? ids : [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Tally rows by `status`. PURE, the before/after queue-depth summary this family's own metrics use,
 *  the same shape `fetch-drain-run-001.json`'s `queue_queued`/`queue_done`/`queue_errors` hand-counted.
 *  @param {Array<{status?:string}>} rows @returns {Record<string, number>} */
export function tallyByStatus(rows) {
  const out = {};
  for (const r of rows ?? []) {
    const s = r?.status ?? "unknown";
    out[s] = (out[s] ?? 0) + 1;
  }
  return out;
}

/** Dry mode's plan -> per_item + metrics. PURE. Every queued row and every stuck row gets one per_item
 *  entry, at this run's scale (never more than MAX_LIMIT queued rows, and the stuck bucket is
 *  inherently small, a crash-only condition) the full selected population fits, never a truncated
 *  sample.
 *  @param {Array<{id:string,source_id:string,queued_at:string}>} queuedRows
 *  @param {Array<{id:string,source_id:string,status:string,last_attempt_at:string|null}>} stuckRows
 *  @param {{limit:number}} opts
 *  @returns {{perItem:object[], metrics:object}} */
export function shapeDryPlan(queuedRows, stuckRows, { limit }) {
  const q = Array.isArray(queuedRows) ? queuedRows : [];
  const s = Array.isArray(stuckRows) ? stuckRows : [];
  const perItem = [
    ...q.map((r) => ({
      id: r.id,
      outcome: "planned_queued",
      verdict: `would invoke capture-worker for source_id ${r.source_id} (queued_at ${r.queued_at})`,
      evidence_refs: [],
      error: null,
    })),
    ...s.map((r) => ({
      id: r.id,
      outcome: "planned_stuck_reset",
      verdict:
        `would reset status='fetching' -> 'queued' (last_attempt_at ${r.last_attempt_at}, stuck past the ` +
        "one-hour cutoff), then may be picked up by this or a later run's queued-row selection",
      evidence_refs: [],
      error: null,
    })),
  ];
  const metrics = {
    mode: "dry",
    limit,
    queued_selected: q.length,
    stuck_selected: s.length,
    invocations: 0,
    batches: 0,
  };
  return { perItem, metrics };
}

/** One batch's per_item entries, CONVENTION.md's `{id, outcome, verdict, evidence_refs, error}` shape,
 *  built from the worker's own HTTP response (when the call succeeded and parsed) AND the read-back DB
 *  rows (always present). The DB read-back is the source of truth for the row's FINAL status; the
 *  worker's own `results` entries (when present) add the richer verdict detail
 *  (`http_status`/`chars`/`detail`/`url`) a bare status column cannot carry. When the HTTP call itself
 *  failed (network error, non-2xx, unparseable body), `workerResults` is null and every row in the batch
 *  is shaped from the read-back alone, honestly labelled `http_call_failed_readback_<status>` so a
 *  reader can tell the two cases apart rather than reading a worker verdict that was never actually
 *  returned. PURE.
 *  @param {string[]} idsInBatch
 *  @param {Array<object>|null} workerResults the worker's own `results` array, or null on a failed call
 *  @param {string|null} httpError set when the HTTP call itself failed
 *  @param {Array<{id:string,status:string,attempt_count?:number,last_error_text?:string|null}>} readback
 *  @returns {object[]} */
export function shapeBatchPerItem(idsInBatch, workerResults, httpError, readback) {
  const byId = new Map((readback ?? []).map((r) => [r.id, r]));
  const workerById = new Map((workerResults ?? []).map((r) => [r.queue_id, r]));
  return (idsInBatch ?? []).map((id) => {
    const w = workerById.get(id) ?? null;
    const rb = byId.get(id) ?? null;
    const finalStatus = rb?.status ?? "unknown";
    if (httpError && !w) {
      return {
        id,
        outcome: `http_call_failed_readback_${finalStatus}`,
        verdict: `the batch HTTP call itself failed (${httpError}); read back status='${finalStatus}' after the fact`,
        evidence_refs: [],
        error: httpError,
      };
    }
    return {
      id,
      outcome: w?.outcome ?? `no_worker_result_readback_${finalStatus}`,
      verdict: w
        ? `worker outcome=${w.outcome}` +
          (w.http_status ? `, http_status=${w.http_status}` : "") +
          (w.chars ? `, chars=${w.chars}` : "") +
          `, read back status='${finalStatus}'`
        : `no per-row result from the worker for this id, read back status='${finalStatus}'`,
      evidence_refs: w?.url ? [w.url] : [],
      error: w?.detail ?? rb?.last_error_text ?? null,
    };
  });
}

/** The capture-worker Edge Function's own URL, derived from the project URL every guarded script in
 *  this repo already reads from env (`NEXT_PUBLIC_SUPABASE_URL`), never a second, hand-typed project
 *  ref. PURE. @param {string} supabaseUrl @returns {string} */
export function functionUrlFor(supabaseUrl) {
  return `${String(supabaseUrl).replace(/\/+$/, "")}/functions/v1/capture-worker`;
}

/** Repo-relative, POSIX-separated form of an absolute path (pre-commit rule 012, "no user-home paths in
 *  code or comments": an artifact written from a local checkout under a Windows or Unix user-home
 *  directory must never carry that literal string into a committed JSON file; a CI run's own
 *  `/home/runner/...` absolute path is fine on that machine, but this repo's own convention, once a
 *  local run is what produces the committed artifact, is a path relative to `fsi-app/`, the same
 *  normalization `hashHarnessVersion` already applies to its own digest inputs). PURE.
 *  @param {string} absPath @param {string} baseDir @returns {string} */
export function repoRelative(absPath, baseDir) {
  return relative(baseDir, absPath).split(sep).join("/");
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) await main();

async function main() {
  loadLocalEnvFile();

  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(`run-fetch-drain: ${parsed.error}\n${usage()}`);
    process.exit(1);
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("run-fetch-drain: no DB creds, cannot run here (exit 2).");
    process.exit(2);
  }

  const { readAll, readAllByIds, guardedUpdateByIds } = await import("../lib/db.mjs");
  const { createClient } = await import("@supabase/supabase-js");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sb = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const { mode, limit } = parsed;
  const harnessRunsDir = resolve(parsed.harnessRunsDir || DEFAULT_HARNESS_RUNS_DIR);
  const outDir = resolve(parsed.outDir || join(harnessRunsDir, "traces"));
  const functionUrl = functionUrlFor(supabaseUrl);

  const CITE = {
    skill: "corpus-turn-runbook",
    reason:
      "fetch-drain: reset a pending_first_fetch row stuck at status='fetching' past the one-hour claim " +
      "window back to 'queued' so a future selection can retry it (fetch-drain-run-003.json's own reset step).",
  };

  const nowMs = Date.now();
  const cutoffIso = stuckCutoffIso(nowMs);

  let runId = null;
  let runError = null;
  let reportPath = null;
  const startedAt = new Date().toISOString();
  let perItem = [];
  let metrics = {};
  const defectsFound = [];
  const invocationMechanism = mode === "dry" ? "none (dry run, no HTTP call)" : "https from runner";
  let stuckReset = { attempted: 0, updated: 0 };

  try {
    runId = claimRunId(harnessRunsDir, "fetch-drain");

    // Both modes report the stuck rows; only apply resets them. Read FIRST, in both modes, so the dry
    // plan and the apply run see the identical selection logic.
    const stuckRows = await readAll(
      "pending_first_fetch",
      "id,source_id,status,attempt_count,last_attempt_at,queued_at",
      { match: (q) => q.eq("status", "fetching").lte("last_attempt_at", cutoffIso), client: sb }
    );

    if (mode === "apply" && stuckRows.length > 0) {
      const resetIds = stuckRows.map((r) => r.id);
      const res = await guardedUpdateByIds(
        "pending_first_fetch",
        resetIds,
        { status: "queued" },
        {
          cite: CITE,
          // Re-applies the SAME match at write time (db.mjs's own idempotent-under-concurrent-change
          // contract), a row that stopped being stuck between the read and the write (reclaimed,
          // finished) is left alone, never force-reset.
          applyMatch: (q) => q.eq("status", "fetching").lte("last_attempt_at", cutoffIso),
        }
      );
      stuckReset = { attempted: resetIds.length, updated: res.updated };
    }

    // The queue selection, oldest queued_at first, capped at `limit`. Runs AFTER the reset above (in
    // apply mode), so a freshly-reset stuck row's own (old) queued_at naturally sorts it to the front of
    // this SAME query, one selection, never a second, separately-ordered list for former-stuck rows.
    const { data: queuedRowsRaw, error: qErr } = await sb
      .from("pending_first_fetch")
      .select("id,source_id,status,attempt_count,queued_at")
      .eq("status", "queued")
      .order("queued_at", { ascending: true })
      .limit(limit);
    if (qErr) throw new Error(`run-fetch-drain: queued-row select failed: ${qErr.message}`);
    const queuedRows = queuedRowsRaw ?? [];

    const rawTrace = { mode, limit, cutoff_iso: cutoffIso, queued_rows: queuedRows, stuck_rows: stuckRows };

    if (mode === "dry") {
      const shaped = shapeDryPlan(queuedRows, stuckRows, { limit });
      perItem = shaped.perItem;
      metrics = shaped.metrics;
      console.log(
        `run-fetch-drain: [dry-run] queued_selected=${queuedRows.length} stuck_selected=${stuckRows.length} limit=${limit}`
      );
    } else {
      const ids = queuedRows.map((r) => r.id);
      const batches = batchIds(ids, BATCH_SIZE);
      const batchTraces = [];
      let invocations = 0;

      for (const batch of batches) {
        let workerResults = null;
        let httpError = null;
        let rawBody = null;
        try {
          const res = await fetch(functionUrl, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${serviceRoleKey}`,
              apikey: serviceRoleKey,
            },
            body: JSON.stringify({ queue_ids: batch }),
          });
          invocations += 1;
          if (!res.ok) {
            httpError = `HTTP ${res.status} from capture-worker`;
          } else {
            rawBody = await res.json();
            workerResults = Array.isArray(rawBody?.results) ? rawBody.results : [];
          }
        } catch (err) {
          invocations += 1;
          httpError = err instanceof Error ? err.message : String(err);
        }

        // Read back this batch's own rows regardless of HTTP outcome, the database is the source of
        // truth for the final status, per this file's header. Through db.mjs's readAllByIds (F39
        // unbounded-in-filter: the repo's own chunked id-list reader, never a bare .in(col, runtimeVar))
        // even though one batch is already bounded to BATCH_SIZE (8) by construction.
        let readback = [];
        try {
          readback = await readAllByIds("pending_first_fetch", "id,status,attempt_count,last_error_text", batch, { client: sb });
        } catch (rbErr) {
          defectsFound.push({
            description: `read-back select failed for batch [${batch.join(",")}]: ${rbErr.message}`,
            root_cause: rbErr.message,
            fix_ref: null,
          });
        }

        perItem.push(...shapeBatchPerItem(batch, workerResults, httpError, readback));
        batchTraces.push({ batch_ids: batch, http_error: httpError, worker_response: rawBody, readback });
      }

      rawTrace.stuck_reset = stuckReset;
      rawTrace.batches = batchTraces;

      metrics = {
        mode: "apply",
        limit,
        queued_selected: ids.length,
        stuck_selected: stuckRows.length,
        stuck_reset_attempted: stuckReset.attempted,
        stuck_reset_updated: stuckReset.updated,
        batches: batches.length,
        invocations,
        outcome_tally: tallyByStatus(perItem.map((p) => ({ status: p.outcome }))),
      };
      console.log(
        `run-fetch-drain: apply, queued_selected=${ids.length} stuck_reset=${stuckReset.updated}/${stuckReset.attempted} ` +
          `batches=${batches.length} invocations=${invocations}`
      );
    }

    mkdirSync(outDir, { recursive: true });
    reportPath = join(outDir, `${runId}.raw-result.json`);
    writeFileSync(reportPath, JSON.stringify(rawTrace, null, 2) + "\n", "utf8");
    console.log(`Wrote ${reportPath}`);
  } catch (err) {
    runError = err;
  } finally {
    if (runId) {
      const harnessVersion = hashHarnessVersion(FETCH_DRAIN_GOVERNING_FILES, FSI_ROOT);
      if (runError) {
        defectsFound.push({
          description: `run-fetch-drain.mjs threw during a ${mode} run: ${runError.message}`,
          root_cause: runError.stack ?? "",
          fix_ref: null,
        });
      }
      const artifact = {
        ...baseArtifactFields({ family: "fetch-drain", harnessVersion, runId, startedAt }),
        config: {
          mode,
          limit,
          invocation_mechanism: invocationMechanism,
          supabase_project: supabaseUrl,
          upstream_run_id: process.env.GITHUB_EVENT_WORKFLOW_RUN_ID || null,
          stuck_cutoff: cutoffIso,
        },
        inputs_ref: [
          `live query: pending_first_fetch status='queued' order by queued_at limit ${limit}`,
          `live query: pending_first_fetch status='fetching' AND last_attempt_at <= ${cutoffIso} (stuck reset condition, fetch-drain-run-003.json's own reset step)`,
        ],
        per_item: perItem,
        metrics: metrics && Object.keys(metrics).length ? metrics : { mode, limit },
        defects_found: defectsFound,
        full_trace_refs: reportPath
          ? [repoRelative(reportPath, FSI_ROOT)]
          : [repoRelative(harnessRunsDir, FSI_ROOT)],
        proposer_notes: runError
          ? "This run threw before completing, see defects_found for the error. Re-run after fixing the root cause."
          : "Auto-emitted by run-fetch-drain.mjs, the fetch-drain family's canonical entry point (lane M1, " +
            "2026-09-18). Replaces the hand pg_net procedure PROTOCOL.md documented with a runner like " +
            "every other harness family already has.",
      };
      const artifactPath = writeRunArtifact(harnessRunsDir, artifact);
      console.log(`Wrote ${artifactPath}`);
    }
  }

  if (runError) {
    console.error(`run-fetch-drain: FAILED, ${runError.message}`);
    process.exit(1);
  }
  process.exit(0);
}
