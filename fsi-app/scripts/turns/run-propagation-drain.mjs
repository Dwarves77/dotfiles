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
// ALWAYS records a harness-run artifact, in both modes, from a `finally` block — same crash-safety
// run-source-sweep.mjs and run-extraction.mjs already apply to their own families.
//
// Usage:
//   node scripts/turns/run-propagation-drain.mjs --mode dry [--batch 500]
//   node scripts/turns/run-propagation-drain.mjs --mode apply [--batch 500] [--out-dir dir] [--harness-runs-dir dir]
// Exit 0 done · 1 bad args · 2 no DB creds (cannot run here).

import { parseArgs as nodeParseArgs } from "node:util";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runPropagationDrain } from "../../src/lib/propagation/drain.ts";
import { writeRunArtifact, hashHarnessVersion, claimRunId } from "../lib/run-artifact.mjs";
import { GOVERNING_FILES } from "../harness-runs/governing-files.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FSI_ROOT = resolve(HERE, "..", "..");
const DEFAULT_HARNESS_RUNS_DIR = resolve(HERE, "..", "harness-runs", "propagation");
const ROOT = FSI_ROOT;

// This family's governing files — IMPORTED from scripts/harness-runs/governing-files.mjs (Wave
// GOV-SINGLE, 2026-09-04), re-exported under this historical name so existing importers keep working
// unchanged — F28's own copy and this runner's self-hash are now the same array by construction.
export const PROPAGATION_GOVERNING_FILES = GOVERNING_FILES.propagation;

function usage() {
  return (
    "Usage: node scripts/turns/run-propagation-drain.mjs --mode <dry|apply> [--batch N]\n" +
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
        mode: { type: "string" },
        batch: { type: "string", default: "500" },
        "harness-runs-dir": { type: "string" },
        "out-dir": { type: "string" },
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

  return {
    ok: true,
    mode: values.mode,
    batch,
    harnessRunsDir: values["harness-runs-dir"] || null,
    outDir: values["out-dir"] || null,
  };
}

/** Build this run's per_item / metrics from a DrainResult. PURE (no I/O) so the shaping is independently
 *  testable, matching run-source-sweep.mjs's own shapeRunOutput. `reportPath` is where the full DrainResult
 *  was written on disk (the artifact's full_trace_refs pointer). */
export function shapeRunOutput(result, reportPath) {
  const perItem = [
    {
      id: `queue-depth-${result.queueDepthBefore}`,
      outcome: result.errors.length ? "error" : "drained",
      verdict:
        result.mode === "dry"
          ? `${result.eventsConsidered} event(s) considered, ${result.invalidated} value(s) would be invalidated (dry — nothing written)`
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
  };
  return { perItem, metrics };
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) await main();

async function main() {
  try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* CI: env injected */ }

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

  const { mode, batch } = parsed;
  const harnessRunsDir = resolve(parsed.harnessRunsDir || DEFAULT_HARNESS_RUNS_DIR);
  const outDir = resolve(parsed.outDir || join(harnessRunsDir, "traces"));

  let runId = null;
  let result = null;
  let runError = null;
  let reportPath = null;
  const startedAt = new Date().toISOString();

  try {
    runId = claimRunId(harnessRunsDir, "propagation");

    result = await runPropagationDrain(sb, { caller: `run-propagation-drain:${runId}`, mode, batch });

    mkdirSync(outDir, { recursive: true });
    reportPath = join(outDir, `${runId}.report.json`);
    writeFileSync(reportPath, JSON.stringify(result, null, 2) + "\n", "utf8");
    console.log(`Wrote ${reportPath}`);
    console.log(`${mode === "dry" ? "[dry-run] " : ""}${JSON.stringify(result, null, 2)}`);
  } catch (err) {
    runError = err;
  } finally {
    if (runId) {
      const harnessVersion = hashHarnessVersion(PROPAGATION_GOVERNING_FILES, FSI_ROOT);
      const shaped = result && reportPath ? shapeRunOutput(result, reportPath) : null;
      const defectsFound = [];
      if (runError) {
        defectsFound.push({
          description: `run-propagation-drain.mjs threw during a ${mode} run: ${runError.message}`,
          root_cause: runError.stack ?? "",
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
        config: { mode, batch },
        inputs_ref: [`mode=${mode}`, `batch=${batch}`],
        per_item: shaped?.perItem ?? [],
        metrics: shaped?.metrics ?? {},
        defects_found: defectsFound,
        full_trace_refs: reportPath ? [reportPath] : [harnessRunsDir],
        proposer_notes: runError
          ? "This run threw before completing — see defects_found for the error. Re-run after fixing the root cause."
          : "Auto-emitted by run-propagation-drain.mjs, the propagation family's canonical entry point (lane DP-ENGINE, 2026-09-02, system-completion train) — drives runPropagationDrain (src/lib/propagation/drain.ts) against the propagation_events outbox (migration 284) and the derivation DAG (migration 285).",
      };
      const artifactPath = writeRunArtifact(harnessRunsDir, artifact);
      console.log(`Wrote ${artifactPath}`);
    }
  }

  if (runError) {
    console.error(`run-propagation-drain: FAILED — ${runError.message}`);
    process.exit(1);
  }
  process.exit(0);
}
