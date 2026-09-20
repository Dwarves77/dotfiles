#!/usr/bin/env node
// emit-producers-artifact.mjs -- the `producers` family's own harness-run artifact writer (lane M9d,
// 2026-09-20, build plan section 6.1 row M9, brief-m9d Amendment 1 item C.4; follow-on from lane M5,
// docs/runbooks/PROPAGATION-DRAIN-RUNBOOK.md "Tracing edge authorship": "no market/regional producer
// family is registered ... registering one is a separate, deliberate act ... out of this lane's write
// set" -- this lane is that act). Modelled on scripts/turns/emit-downstream-chain-artifact.mjs (read
// before writing this file): reuse writeRunArtifact/claimRunId/hashHarnessVersion, never a second copy.
//
// ONE ARTIFACT PER WORKFLOW RUN, not one writeRunArtifact call per producer (lane M9d's own brief,
// Amendment 1 section C: "eleven call sites would be eleven copies of the same block and eleven run ids
// per firing"). Every producer script producers.yml runs with --apply calls writeProducerSummary
// (scripts/producers/lib/producer-summary.mjs) once on its own exit path, writing
// `<PRODUCER_SUMMARY_DIR>/<producer>.json`. This script is producers.yml's own last step: it reads back
// every summary this firing wrote (zero when a run had nothing armed to fire, or fired but wrote nothing)
// and folds them into ONE `producers-run-NNN.json`.
//
// loop_run_id IS DELIBERATELY NULL, WITH A NAMED REASON (not an omission): every other family's own
// emitter (see emit-downstream-chain-artifact.mjs, run-propagation-drain.mjs) reads a loop_run_id that
// CHAINED down from an upstream firing (loop-run-id.mjs's resolveLoopRunId). Producers has no upstream in
// this loop -- producers.yml runs on workflow_dispatch only (ADR-023, build-mode: no schedule while the
// site is being built), never as a workflow_run consumer of anything else in this repo's loop -- so it is
// the loop's OWN HEAD for this hop, not a link in a chain with a loop_run_id to inherit. Named ADR-031
// per the coordinator's Amendment 1 (that ADR had not yet been read/found in docs/decisions/ at the time
// this file was written; see this lane's own report for the flag).
//
// Reads its configuration from environment variables (PR_*), set by producers.yml's own "Record this
// run's own harness-run artifact (producers family)" step -- same posture as DC_* in
// emit-downstream-chain-artifact.mjs. No CLI flags: exactly one caller, every value already a workflow
// step output/env var.
//
// Exit 0 on a successful write. Throws (non-zero exit) on a schema-invalid artifact (writeRunArtifact's
// own fail-closed validation) or an id-claim collision after 50 attempts (claimRunId) -- both real
// conditions a coordinator should see, not swallow.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeRunArtifact, claimRunId, hashHarnessVersion, baseArtifactFields } from "../lib/run-artifact.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FSI_ROOT = resolve(HERE, "..", "..");
const FAMILY = "producers";
const FAMILY_DIR = resolve(FSI_ROOT, "scripts/harness-runs", FAMILY);

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

/**
 * Read every `<producer>.json` summary in `summaryDir` (writeProducerSummary's own output shape). Skips
 * (never throws on) an unparseable file -- one bad summary must not hide the rest of this run's outcome,
 * same posture readRunHistory takes for a corrupt run artifact. Returns [] when the directory does not
 * exist (a firing where PRODUCER_SUMMARY_DIR was never set, or nothing wrote to it -- see buildArtifact's
 * own "zero summaries" handling).
 * @param {string|null} summaryDir
 * @returns {object[]}
 */
export function readProducerSummaries(summaryDir) {
  if (!summaryDir || !existsSync(summaryDir)) return [];
  const files = readdirSync(summaryDir).filter((f) => f.endsWith(".json")).sort();
  const summaries = [];
  for (const file of files) {
    try {
      summaries.push(JSON.parse(readFileSync(join(summaryDir, file), "utf8")));
    } catch (err) {
      console.warn(`emit-producers-artifact: skipping unparseable summary ${file}: ${err.message}`);
    }
  }
  return summaries;
}

/**
 * Build this run's `producers-run-NNN.json` artifact object from the summaries this firing's producer
 * scripts wrote. Pure -- no I/O of its own (readProducerSummaries already did the read).
 * @param {{ runId: string, harnessVersion: string, startedAt: string, mode: string, runProducer: string,
 *   summaries: object[] }} args
 */
export function buildArtifact({ runId, harnessVersion, startedAt, mode, runProducer, summaries }) {
  const perItem = summaries.map((s) => ({
    id: s.producer,
    outcome: s.status === "failed" ? "failed" : "clean",
    verdict: s.status === "failed" ? (s.reason || "no reason recorded") : `rows_changed=${s.rows_changed} edges_authored=${JSON.stringify(s.edges_authored)}`,
    evidence_refs: [],
    error: s.status === "failed" ? JSON.stringify({ reason: s.reason, counts: s.counts }) : null,
  }));

  const failedCount = summaries.filter((s) => s.status === "failed").length;
  const rowsChangedTotal = summaries.reduce((acc, s) => acc + (typeof s.rows_changed === "number" ? s.rows_changed : 0), 0);
  const edgesAuthoredTotal = summaries.reduce((acc, s) => acc + (typeof s.edges_authored === "number" ? s.edges_authored : 0), 0);

  const defectsFound = [];
  if (failedCount > 0) {
    defectsFound.push({
      description: `${failedCount} of ${summaries.length} producer(s) reported status:"failed" this run`,
      root_cause: summaries.filter((s) => s.status === "failed").map((s) => `${s.producer}: ${s.reason}`).join(" | "),
      fix_ref: null,
    });
  }

  return {
    // The shared five-field header every harness-run artifact opens with (scripts/lib/run-artifact.mjs's
    // own baseArtifactFields, F45: reuse the existing shared home rather than a fresh inline literal).
    ...baseArtifactFields({ family: FAMILY, harnessVersion, runId, startedAt }),
    config: {
      mode,
      run_producer: runProducer,
      // The producers family is its own loop head for this hop -- see this file's own header (ADR-031)
      // for why loop_run_id is null by design here, never a missing value another hop should have set.
      loop_run_id: null,
    },
    inputs_ref: summaries.map((s) => s.producer),
    per_item: perItem,
    metrics: {
      producers_reporting: summaries.length,
      producers_failed: failedCount,
      rows_changed_total: rowsChangedTotal,
      edges_authored_total: edgesAuthoredTotal,
    },
    defects_found: defectsFound,
    full_trace_refs: ["docs/runbooks/PROPAGATION-DRAIN-RUNBOOK.md"],
    proposer_notes: summaries.length
      ? "Auto-emitted by emit-producers-artifact.mjs after every --apply-invoked producer step wrote its own summary via scripts/producers/lib/producer-summary.mjs."
      : "This dispatch fired with zero producer summaries recorded (no --apply step ran, or PRODUCER_SUMMARY_DIR was unset). Recorded anyway so the family's own history shows every firing, not only the ones with real work (PROPOSER-RUNBOOK.md's \"record it every batch, even when zero\", applied here).",
  };
}

if (IS_MAIN) main();

function main() {
  const mode = process.env.PR_MODE || "dry";
  const runProducer = process.env.PR_RUN_PRODUCER || "all";
  const startedAt = process.env.PR_STARTED_AT || new Date().toISOString();
  const summaryDir = process.env.PR_SUMMARY_DIR || process.env.PRODUCER_SUMMARY_DIR || null;

  const summaries = readProducerSummaries(summaryDir);

  // MUST mirror scripts/harness-runs/producers/family.json's own governing_files list exactly (same
  // spelling, fsi-app-relative), since family-registry.mjs/governing-files.mjs derive GOVERNING_FILES
  // from that descriptor and F28's own staleness check re-hashes against it.
  const harnessVersion = hashHarnessVersion(
    [
      "../.github/workflows/producers.yml",
      "scripts/producers/market/author-market-series-delta.mjs",
      "scripts/producers/regional/run-envelope-producer.mjs",
      "scripts/producers/emit-producers-artifact.mjs",
      "scripts/producers/lib/producer-summary.mjs",
    ],
    FSI_ROOT,
  );
  const runId = claimRunId(FAMILY_DIR, FAMILY);

  const artifact = buildArtifact({ runId, harnessVersion, startedAt, mode, runProducer, summaries });

  const outPath = writeRunArtifact(FAMILY_DIR, artifact);
  console.log(`emit-producers-artifact: wrote ${outPath} (${summaries.length} producer summar${summaries.length === 1 ? "y" : "ies"} folded in)`);
}
