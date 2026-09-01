#!/usr/bin/env node
// run-mint-batch.mjs — the mint family's canonical entry point (Wave MH-5, "harness completion").
//
// WHY THIS EXISTS: PROPOSER-RUNBOOK.md §5's "Known residual" names it directly — "'forgetting is not
// possible' is true for `screen` (emission is CODE, inside screen-worklist.mjs's own main()) but not yet
// true for `mint` ... where emission is PROSE (a mandatory runbook step) — a lane can still run a full
// batch, author payloads, and report results without ever calling writeRunArtifact." This script closes
// that gap for mint the same way screen-worklist.mjs already closes it for screen: a thin orchestrator
// whose OWN execution path writes the run artifact, so there is nothing separate left to forget.
//
// WHAT IT DOES — a thin orchestrator, not a new validator:
//   1. Reads a batch file (an array of mint payloads, or { payloads: [...] } — see loadBatch below).
//   2. Runs the family's EXISTING gate, validate-mint-payload.mjs's validateMintPayload(), over every
//      payload — this script does not re-implement C1-C7 or invent new validation logic.
//   3. Prints (and, on --execute, writes) the apply-ready output: valid payloads the coordinator can
//      apply through the guarded write path (MINT-RUNBOOK.md's "zero DB writes from a mint lane" rule is
//      unchanged and unbroken by this script — it validates and reports, it never writes to Supabase).
//   4. ALWAYS writes this run's CONVENTION.md-shaped artifact via scripts/lib/run-artifact.mjs's
//      writeRunArtifact, from a `finally` block — see main() below — so a thrown error partway through
//      an --execute run still leaves a record, not silence (CONVENTION.md's "screen-v1 loss" discipline,
//      extended from overwrite-safety to crash-safety).
//
// --dry-run is the default (a preview: validate, print, touch nothing on disk — no output files, no run
// artifact). Pass --execute to perform a real run: write the apply-ready/report files AND the run
// artifact. This environment has no live DB credentials — nothing here ever attempts a DB write in
// either mode; --execute controls only whether this invocation's own filesystem side effects (output
// files, the run artifact) happen, per MINT-RUNBOOK.md step 6's "coordinator applies each payload"
// hand-off model.
//
// A SEPARATE mode, --outcomes <file>, enriches an EXISTING run artifact's `metrics` block with
// post-apply corpus-outcome numbers (edges_discovered, forward_events_extracted, isolated_items — the
// Interface-3 metrics vocabulary, MINT-RUNBOOK.md §6/§8) that this DB-less environment cannot compute
// itself. See enrichRunArtifactMetrics() and the "--outcomes" section below.
//
// A THIRD mode, --census-rows <file> --grade record (Lane POP, 2026-09-01), builds RECORD-GRADE
// payloads from a JSON export of `would_mint` census_worklist rows (see loadCensusRows / CensusRow's
// shape below) via src/lib/intake/record-facts.mjs's buildRecordPayload — no LLM, no fetch, $0 — then
// runs the SAME validateMintPayload gate as --batch-file over the result. A row that fails to BUILD (no
// captured text, missing source, etc.) is recorded as a `build_failed` per_item entry rather than
// crashing the batch — see buildPayloadsFromCensusRows.
//
// USAGE:
//   node scripts/mint/run-mint-batch.mjs --batch-file path/to/batch.json [--execute]
//                                         [--harness-runs-dir dir] [--out-dir dir]
//   node scripts/mint/run-mint-batch.mjs --census-rows path/to/rows.json --grade record [--execute]
//                                         [--harness-runs-dir dir] [--out-dir dir]
//   node scripts/mint/run-mint-batch.mjs --outcomes path/to/outcomes.json [--run-id mint-run-NNN]
//                                         [--harness-runs-dir dir]

import { parseArgs } from "node:util";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname, basename, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateMintPayload } from "./validate-mint-payload.mjs";
import { writeRunArtifact, hashHarnessVersion, claimRunId } from "../lib/run-artifact.mjs";
import { buildRecordPayload } from "../../src/lib/intake/record-facts.mjs";
import { checkTagPresence } from "./lib/tag-presence-check.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FSI_ROOT = resolve(HERE, "..", "..");
const DEFAULT_HARNESS_RUNS_DIR = resolve(HERE, "..", "harness-runs", "mint");

// The mint family's governing files, per CONVENTION.md's harness_version table and F28's GOVERNING_FILES
// (.discipline/fitness/functions/F28-harness-run-integrity.mjs) — kept identical to both by hand today
// (mint's list is hardcoded in F28 too, per that file's own comment: "mint and fetch-drain have no
// equivalent canonical script" — true when F28 was written, no longer true now that this file exists,
// but F28 itself is out of this lane's write set beyond its one named ENOENT fix, so the two copies stay
// hand-synced for now; a future wave could point F28 at this export the same way it already does for
// screen's SCREEN_GOVERNING_FILES).
export const MINT_GOVERNING_FILES = Object.freeze([
  "scripts/mint/MINT-RUNBOOK.md",
  "scripts/mint/validate-mint-payload.mjs",
  "scripts/mint/payload-schema.json",
  "scripts/mint/item-type-required-slots.json",
  "scripts/mint/lib/gate-a-scan.mjs",
  "scripts/mint/lib/gate-a-match.mjs",
  "scripts/mint/lib/canonicalize-citation-url.mjs",
  // record-facts.mjs (the --grade record payload builder, Lane POP 2026-09-01): a change to its
  // extraction logic changes what a record batch produces exactly as validate-mint-payload.mjs changes
  // what it accepts. Added to this array AND F28's GOVERNING_FILES.mint AND CONVENTION.md's table in
  // the same commit (coordinator, 2026-09-01), so the byte-for-byte parity test holds.
  "src/lib/intake/record-facts.mjs",
]);

function usage() {
  return [
    "Usage:",
    "  node scripts/mint/run-mint-batch.mjs --batch-file path/to/batch.json [--execute]",
    "                                        [--harness-runs-dir dir] [--out-dir dir] [--out-basename name]",
    "  node scripts/mint/run-mint-batch.mjs --census-rows path/to/rows.json --grade record [--execute]",
    "                                        [--harness-runs-dir dir] [--out-dir dir] [--out-basename name]",
    "  node scripts/mint/run-mint-batch.mjs --outcomes path/to/outcomes.json [--run-id mint-run-NNN]",
    "                                        [--harness-runs-dir dir]",
  ].join("\n");
}

/**
 * Load and normalize a batch file into a bare array of payload objects. Accepts either a bare JSON array
 * of payloads, or { "payloads": [...] } — same normalization screen-worklist.mjs's loadRows uses for its
 * own input, for consistency across the two harness families that read a "dump of many things" file.
 * Throws on unreadable/unparseable input (a usage error) — never on a single payload's own shape, which
 * validateMintPayload reports per-payload instead.
 */
export function loadBatch(batchPath) {
  const raw = readFileSync(batchPath, "utf8");
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.payloads)) return parsed.payloads;
  throw new Error(
    `--batch-file must be a JSON array of payloads, or an object { "payloads": [...] }; got ${typeof parsed}`,
  );
}

// ── --census-rows (Lane POP, 2026-09-01): record-grade payload building ────────────────────────────
//
// A CENSUS ROW (this script's own input contract — no exporter ships in this lane's write set; see
// docs/plans/record-tier-population-plan-2026-09-01.md for the full sequence a future census-worklist
// export would follow) is one `would_mint` census_worklist row ENRICHED with what buildRecordPayload
// needs and census_worklist itself does not carry (migration 221's columns are identity/enumeration
// only — no title, item_type, or captured text):
//   {
//     "row_id": "<census_worklist.id, optional, for traceability>",
//     "source_url": "https://…",                  // required — becomes item.source_url
//     "item_type": "directive",                    // required — one of item-type-required-slots.json's keys
//     "title": "…",                                 // required
//     "instrument_identifier": "…",                 // optional
//     "canonical_instrument_key": "CELEX:…",         // optional
//     "jurisdiction_iso": "EU",                      // optional
//     "priority": "MODERATE",                        // optional, default MODERATE
//     "source": { "id": "…", "url": "…", "base_tier": 1, "tier_override": null, "status": "active" },
//     "captured_text": "…",                          // the FULL fetched document text, OR:
//     "captured_text_path": "relative/to/this/file.txt",
//     "fetched_length": 12345,                       // optional; defaults to captured_text.length
//     "agent_run_searches_id": "…"                    // recognized but NOT resolvable by this DB-less
//                                                      // script — a row naming only this field fails to
//                                                      // build with a clear error, it never silently skips
//   }

/** Load and normalize a --census-rows file into a bare array of row objects. Same array-or-{key:[...]}
 *  normalization as loadBatch, for consistency across this script's input modes. */
export function loadCensusRows(censusRowsPath) {
  const raw = readFileSync(censusRowsPath, "utf8");
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.rows)) return parsed.rows;
  throw new Error(
    `--census-rows must be a JSON array of rows, or an object { "rows": [...] }; got ${typeof parsed}`,
  );
}

/** A census row's own id for build-failure reporting — mirrors payloadId's preference order. */
function censusRowId(row, index) {
  return row?.row_id ?? row?.canonical_instrument_key ?? row?.instrument_identifier ?? row?.source_url ?? `census-index-${index}`;
}

/**
 * Build one record-grade payload per census row via src/lib/intake/record-facts.mjs's buildRecordPayload
 * — no LLM, no fetch, $0. A row that cannot be built (unreadable captured_text_path, no captured text at
 * all, a missing required field buildRecordPayload itself rejects) is recorded in `buildFailures` rather
 * than thrown — one bad row must never abort an entire census-rows run. Returns
 * `{ payloads, buildFailures }`; `payloads` carry a top-level `id` (the row's own id) so payloadId() /
 * run-artifact traceability point back to the SAME row identifier reported for a build failure.
 * @param {object[]} rows
 * @param {{ baseDir: string, requiredSlotsByType?: Record<string,string[]> }} opts `baseDir` resolves a
 *   row's `captured_text_path` (the --census-rows file's own directory, same convention
 *   validate-mint-payload.mjs uses for `archived_source_path`).
 */
export function buildPayloadsFromCensusRows(rows, { baseDir, requiredSlotsByType = {} } = {}) {
  const payloads = [];
  const buildFailures = [];

  rows.forEach((row, index) => {
    const id = String(censusRowId(row, index));
    try {
      let capturedText = row?.captured_text ?? null;
      if (capturedText == null && row?.captured_text_path) {
        capturedText = readFileSync(resolve(baseDir, row.captured_text_path), "utf8");
      }
      if (capturedText == null && row?.agent_run_searches_id) {
        throw new Error(
          `agent_run_searches_id (${row.agent_run_searches_id}) requires live DB access this DB-less ` +
          `script does not have — supply captured_text or captured_text_path instead (see ` +
          `docs/plans/record-tier-population-plan-2026-09-01.md)`,
        );
      }
      if (capturedText == null) {
        throw new Error("no captured_text, captured_text_path, or agent_run_searches_id — nothing to extract from");
      }

      const requiredSlots = requiredSlotsByType[row?.item_type] || [];
      const payload = buildRecordPayload({
        sourceUrl: row?.source_url,
        itemType: row?.item_type,
        title: row?.title,
        instrumentIdentifier: row?.instrument_identifier ?? null,
        canonicalInstrumentKey: row?.canonical_instrument_key ?? null,
        jurisdictionIso: row?.jurisdiction_iso ?? null,
        priority: row?.priority ?? "MODERATE",
        source: row?.source,
        capturedText,
        fetchedLength: row?.fetched_length,
        requiredSlots,
      });
      payload.id = id; // carry the row's own id through for payloadId()/traceability
      payloads.push(payload);
    } catch (err) {
      buildFailures.push({ id, error: err.message });
    }
  });

  return { payloads, buildFailures };
}

/**
 * Merge --census-rows build failures into a runBatch() result, in the SAME shape runBatch returns, so
 * printSummary/buildRunArtifact treat a census-rows run identically to a batch-file run. A build failure
 * is reported as outcome "build_failed" (distinct from validateMintPayload's "validation_failed" — the
 * payload never existed to validate) and counted into `invalid`/`attempted` so validator_first_pass_rate
 * stays honest against the FULL census-rows population, not just the rows that made it to a payload.
 */
export function mergeCensusBuildFailures(buildFailures, runResult) {
  const buildPerItem = buildFailures.map((bf) => ({
    id: bf.id,
    outcome: "build_failed",
    verdict: `record payload build failed: ${bf.error}`,
    evidence_refs: [],
    error: bf.error,
  }));
  const buildResults = buildFailures.map((bf) => ({
    id: bf.id,
    valid: false,
    recommended_status: "quarantined",
    failures: [{ criterion: "kit", reason: "record_build_failed", detail: bf.error }],
  }));

  const attempted = buildFailures.length + runResult.metrics.attempted;
  const valid = runResult.metrics.valid;
  const invalid = attempted - valid;
  const rate =
    attempted > 0 ? `${valid}/${attempted} = ${((valid / attempted) * 100).toFixed(2)}%` : "0/0 (empty batch)";

  return {
    perItem: [...buildPerItem, ...runResult.perItem],
    metrics: { attempted, valid, invalid, build_failed: buildFailures.length, validator_first_pass_rate: rate },
    applyReady: runResult.applyReady,
    report: {
      generated_at: runResult.report.generated_at,
      attempted,
      results: [...buildResults, ...runResult.report.results],
    },
  };
}

/**
 * A payload's own item id for per_item/apply-ready reporting — never invented. Prefers the identifiers
 * MINT-RUNBOOK.md's payloads already carry (canonical_instrument_key, e.g. "CELEX:32011L0037"; then
 * instrument_identifier; then source_url) and falls back to a positional label only when a payload
 * carries none of those, so a malformed payload is still traceable to its position in the batch file.
 */
export function payloadId(payload, index) {
  const item = payload?.item ?? {};
  return (
    payload?.id ??
    item.canonical_instrument_key ??
    item.instrument_identifier ??
    item.source_url ??
    `batch-index-${index}`
  );
}

/**
 * Run validateMintPayload (the family's EXISTING, unmodified gate) over every payload in a batch. Pure
 * function: no I/O beyond what validateMintPayload itself does (reading an optional archived_source_path
 * under baseDir) — no DB, no network, no writes. Returns:
 *   perItem       -- CONVENTION.md-shaped per_item entries, one per payload (mint batches are tens of
 *                     items, well inside "every item" per_item-at-scale tier)
 *   metrics       -- attempted/valid/invalid counts + validator_first_pass_rate (the mint family's
 *                     standing metric, per PROPOSER-RUNBOOK.md §3)
 *   applyReady    -- the valid payloads verbatim, in order — what the coordinator actually applies
 *   report        -- full per-payload validation results (valid + invalid, with failures[]) for the
 *                     human-readable / full-trace side of the output
 */
export function runBatch(payloads, { baseDir } = {}) {
  const perItem = [];
  const report = { generated_at: null, attempted: payloads.length, results: [] };
  const applyReady = [];
  let validCount = 0;

  payloads.forEach((payload, index) => {
    const id = String(payloadId(payload, index));
    const { valid, failures, recommended_status } = validateMintPayload(payload, { baseDir });
    // Interface-3 prevention (lane TAG, 2026-09-01): an item minted with empty signature tags is
    // invisible to discovery. Non-blocking by design (an empty array is sometimes the honest answer),
    // but recorded per payload so the artifact's corpus-outcome metrics can grade it.
    const tag_presence = checkTagPresence(payload);

    report.results.push({ id, valid, recommended_status, failures, tag_presence });

    if (valid) {
      validCount += 1;
      applyReady.push(payload);
      perItem.push({
        id,
        outcome: "apply_ready",
        verdict: `valid, 0 failures — recommended_status=${recommended_status}`,
        evidence_refs: [],
        error: null,
      });
    } else {
      const criteria = [...new Set(failures.map((f) => String(f.criterion)))].sort();
      perItem.push({
        id,
        outcome: "validation_failed",
        verdict: `invalid, ${failures.length} failure(s) — criteria: ${criteria.join(", ")}`,
        evidence_refs: [],
        error: failures.map((f) => `[${f.criterion}] ${f.reason}`).join("; "),
      });
    }
  });

  const attempted = payloads.length;
  const rate =
    attempted > 0 ? `${validCount}/${attempted} = ${((validCount / attempted) * 100).toFixed(2)}%` : "0/0 (empty batch)";

  return {
    perItem,
    metrics: {
      attempted,
      valid: validCount,
      invalid: attempted - validCount,
      validator_first_pass_rate: rate,
    },
    applyReady,
    report,
  };
}

/**
 * Build this run's CONVENTION.md-shaped artifact. Pure function (no I/O) so the test suite can assert
 * its shape without touching the filesystem. Mirrors screen-worklist.mjs's buildRunArtifact — same
 * discipline, different family. When `runError` is set (an --execute run that threw), `result` may be
 * partial or null: per_item/metrics fall back to [] / {} (both are valid per CONVENTION.md's schema —
 * "may hold an empty array/object when a run genuinely produced none of that thing," extended here to
 * "the run never got far enough to produce any") and defects_found carries the thrown error itself, so
 * the failure is recorded, not silently absent.
 */
export function buildRunArtifact({
  runId,
  harnessVersion,
  startedAt,
  finishedAt,
  batchPath,
  outDir,
  execute,
  result,
  runError,
  applyReadyPath,
  reportPath,
}) {
  const fullTraceRefs = [batchPath];
  if (applyReadyPath) fullTraceRefs.push(applyReadyPath);
  if (reportPath) fullTraceRefs.push(reportPath);

  const defectsFound = [];
  if (runError) {
    defectsFound.push({
      description: `run-mint-batch.mjs threw during an --execute run: ${runError.message}`,
      root_cause: runError.stack ?? "",
      fix_ref: null,
    });
  }

  return {
    harness_family: "mint",
    harness_version: harnessVersion,
    run_id: runId,
    started_at: startedAt,
    finished_at: finishedAt,
    config: {
      batch_file: batchPath,
      out_dir: outDir,
      execute,
      mode: execute ? "execute" : "dry_run",
    },
    inputs_ref: [batchPath],
    per_item: result?.perItem ?? [],
    metrics: result?.metrics ?? {},
    defects_found: defectsFound,
    full_trace_refs: fullTraceRefs,
    proposer_notes: runError
      ? "This run threw before completing — see defects_found for the error. Re-run after fixing the " +
        "root cause; this artifact exists so the attempt is not silently unrecorded (Wave MH-5)."
      : "Auto-emitted by run-mint-batch.mjs's own execution path (Wave MH-5 — 'emission is in the " +
        "harness, not the operator,' extended to mint per PROPOSER-RUNBOOK.md §5's named residual). " +
        "Corpus-outcome metrics (edges_discovered, forward_events_extracted, isolated_items) are not " +
        "computed by this DB-less runner — see MINT-RUNBOOK.md's post-apply flywheel steps and run this " +
        "same script again with --outcomes once the coordinator's apply + discovery pass has run.",
  };
}

// ── --outcomes enrichment (Interface-3 metrics: edges_discovered, forward_events_extracted,
//    isolated_items) — a follow-up invocation against an ALREADY-WRITTEN run artifact, not a new run. ──

const KNOWN_OUTCOME_KEYS = Object.freeze(["edges_discovered", "forward_events_extracted", "isolated_items"]);

/**
 * Merge a metrics patch into an existing run artifact, returning a NEW artifact object (never mutates
 * its input) with `metrics` extended/overwritten by every key in `patch`. Pure function — the caller
 * decides where to read the existing artifact from and where to write the result (writeRunArtifact with
 * { allowOverwrite: true }, since this deliberately replaces an already-written file's content with an
 * enriched version of itself — the same "deliberate overwrite" writeRunArtifact's own opts already
 * support, not a new escape hatch).
 * @param {object} artifact an existing, schema-valid run artifact
 * @param {object} patch metrics keys to add/update — any keys, not just KNOWN_OUTCOME_KEYS (forward-
 *   compatible with metrics this family's vocabulary hasn't named yet), but KNOWN_OUTCOME_KEYS are the
 *   ones MINT-RUNBOOK.md documents as this enrichment step's intended payload.
 * @returns {object}
 */
export function enrichRunArtifactMetrics(artifact, patch) {
  return {
    ...artifact,
    metrics: { ...(artifact.metrics ?? {}), ...(patch ?? {}) },
  };
}

/**
 * Load an --outcomes file into a { runId, patch } pair. Shape: either
 *   { "run_id": "mint-run-005", "metrics": { "edges_discovered": 12, ... } }, or
 *   { "run_id": "mint-run-005", "edges_discovered": 12, "forward_events_extracted": 34, ... } (flat —
 *   every key except run_id becomes a metrics patch entry).
 * `run_id` is optional here when the caller supplies --run-id on the command line instead.
 */
export function loadOutcomes(outcomesPath) {
  const raw = readFileSync(outcomesPath, "utf8");
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`--outcomes must be a JSON object; got ${Array.isArray(parsed) ? "array" : typeof parsed}`);
  }
  const runId = typeof parsed.run_id === "string" ? parsed.run_id : null;
  const patch =
    parsed.metrics && typeof parsed.metrics === "object" && !Array.isArray(parsed.metrics)
      ? parsed.metrics
      : Object.fromEntries(Object.entries(parsed).filter(([k]) => k !== "run_id"));
  return { runId, patch };
}

function runOutcomesEnrichment(values, harnessRunsDir) {
  const outcomesPath = resolve(values.outcomes);
  const { runId: fileRunId, patch } = loadOutcomes(outcomesPath);
  const runId = values["run-id"] || fileRunId;
  if (!runId) {
    console.error(
      `--outcomes ${outcomesPath} names no "run_id" and --run-id was not given — nothing to enrich.\n${usage()}`,
    );
    process.exit(1);
  }
  const artifactPath = join(harnessRunsDir, `${runId}.json`);
  if (!existsSync(artifactPath)) {
    console.error(`No such run artifact: ${artifactPath}`);
    process.exit(1);
  }
  const existing = JSON.parse(readFileSync(artifactPath, "utf8"));
  const enriched = enrichRunArtifactMetrics(existing, patch);
  writeRunArtifact(harnessRunsDir, enriched, { allowOverwrite: true });
  console.log(`Enriched ${artifactPath} — metrics: ${Object.keys(patch).join(", ") || "(no keys in patch)"}`);
}

function printSummary(result, { dryRun }) {
  console.log(`${dryRun ? "[dry-run] " : ""}Validated ${result.metrics.attempted} payload(s).`);
  console.log(`  valid (apply_ready):   ${result.metrics.valid}`);
  console.log(`  invalid (needs fix):   ${result.metrics.invalid}`);
  console.log(`  validator_first_pass_rate: ${result.metrics.validator_first_pass_rate}`);
  if (result.metrics.invalid > 0) {
    console.log("  invalid ids:");
    for (const r of result.report.results) {
      if (!r.valid) console.log(`    - ${r.id}: ${r.failures.map((f) => `[${f.criterion}] ${f.reason}`).join("; ")}`);
    }
  }
  if (dryRun) {
    console.log(`Apply-ready payload count: ${result.applyReady.length} (preview only — nothing written; pass --execute to write output files + the run artifact)`);
  }
}

function main() {
  const { values } = parseArgs({
    options: {
      "batch-file": { type: "string" },
      "census-rows": { type: "string" },
      grade: { type: "string" },
      execute: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      "harness-runs-dir": { type: "string" },
      "out-dir": { type: "string" },
      "out-basename": { type: "string" },
      outcomes: { type: "string" },
      "run-id": { type: "string" },
      help: { type: "boolean", default: false },
    },
    allowPositionals: false,
    strict: true,
  });

  if (values.help) {
    console.log(usage());
    return;
  }

  const harnessRunsDir = resolve(values["harness-runs-dir"] || DEFAULT_HARNESS_RUNS_DIR);

  if (values.outcomes) {
    runOutcomesEnrichment(values, harnessRunsDir);
    return;
  }

  const usingCensusRows = !!values["census-rows"];
  if (values["batch-file"] && usingCensusRows) {
    console.error(`--batch-file and --census-rows are mutually exclusive — pass exactly one.\n${usage()}`);
    process.exit(1);
  }
  if (!values["batch-file"] && !usingCensusRows) {
    console.error(usage());
    process.exit(1);
  }
  if (usingCensusRows && values.grade !== "record") {
    console.error(`--census-rows requires --grade record (this script builds only record-grade payloads from census rows).\n${usage()}`);
    process.exit(1);
  }
  if (!usingCensusRows && values.grade && values.grade !== "brief" && values.grade !== "record") {
    console.error(`--grade must be "brief" or "record"; got ${JSON.stringify(values.grade)}.\n${usage()}`);
    process.exit(1);
  }

  const inputPath = resolve(usingCensusRows ? values["census-rows"] : values["batch-file"]);
  const execute = values.execute === true && values["dry-run"] !== true;
  const outDir = resolve(values["out-dir"] || dirname(inputPath));
  const startedAt = new Date().toISOString();

  // Loads + validates this run's payloads uniformly for either input mode, merging any --census-rows
  // build failures into the SAME shape a batch-file run produces (mergeCensusBuildFailures) so every
  // downstream consumer (printSummary, buildRunArtifact) is input-mode-agnostic.
  function loadAndRun() {
    if (usingCensusRows) {
      const rows = loadCensusRows(inputPath);
      const requiredSlotsByType = JSON.parse(
        readFileSync(resolve(HERE, "item-type-required-slots.json"), "utf8"),
      );
      const { payloads, buildFailures } = buildPayloadsFromCensusRows(rows, {
        baseDir: dirname(inputPath),
        requiredSlotsByType,
      });
      const runResult = runBatch(payloads, { baseDir: dirname(inputPath) });
      return mergeCensusBuildFailures(buildFailures, runResult);
    }
    const payloads = loadBatch(inputPath);
    return runBatch(payloads, { baseDir: dirname(inputPath) });
  }

  if (!execute) {
    // DRY RUN (default): validate in full, print the apply-ready preview, write NOTHING to disk — no
    // output files, no run artifact. A preview is not "a run" CONVENTION.md's schema needs to remember;
    // pass --execute to make it one.
    let result;
    try {
      result = loadAndRun();
    } catch (err) {
      console.error(`Failed to read/build ${usingCensusRows ? "--census-rows" : "--batch-file"} ${inputPath}: ${err.message}`);
      process.exit(1);
    }
    printSummary(result, { dryRun: true });
    process.exit(result.metrics.invalid > 0 ? 1 : 0);
    return;
  }

  // EXECUTE: a real run. The run artifact write happens in `finally`, unconditionally, so a thrown error
  // anywhere above it still leaves a record — see buildRunArtifact's runError handling and the module
  // header's crash-safety note.
  let runId = null;
  let result = null;
  let runError = null;
  let applyReadyPath = null;
  let reportPath = null;

  try {
    runId = claimRunId(harnessRunsDir, "mint");
    result = loadAndRun();
    printSummary(result, { dryRun: false });

    mkdirSync(outDir, { recursive: true });
    const base = values["out-basename"] || basename(inputPath, extname(inputPath));
    applyReadyPath = join(outDir, `${base}.apply-ready.json`);
    reportPath = join(outDir, `${base}.mint-batch-report.json`);
    result.report.generated_at = new Date().toISOString();
    writeFileSync(applyReadyPath, JSON.stringify(result.applyReady, null, 2) + "\n", "utf8");
    writeFileSync(reportPath, JSON.stringify(result.report, null, 2) + "\n", "utf8");
    console.log(`Wrote ${applyReadyPath}`);
    console.log(`Wrote ${reportPath}`);
  } catch (err) {
    runError = err;
  } finally {
    if (runId) {
      const harnessVersion = hashHarnessVersion(MINT_GOVERNING_FILES, FSI_ROOT);
      const artifact = buildRunArtifact({
        runId,
        harnessVersion,
        startedAt,
        finishedAt: new Date().toISOString(),
        batchPath: inputPath,
        outDir,
        execute,
        result,
        runError,
        applyReadyPath,
        reportPath,
      });
      const artifactPath = writeRunArtifact(harnessRunsDir, artifact);
      console.log(`Wrote ${artifactPath}`);
    }
  }

  if (runError) {
    console.error(`run-mint-batch: FAILED — ${runError.message}`);
    process.exit(1);
  }
  process.exit(result.metrics.invalid > 0 ? 1 : 0);
}

// Only run main() when this file is executed directly (not when imported by the test suite) — same
// guard as screen-worklist.mjs / run-artifact.mjs.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
