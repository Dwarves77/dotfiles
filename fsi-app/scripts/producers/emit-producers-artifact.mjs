#!/usr/bin/env node

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
