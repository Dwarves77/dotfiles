#!/usr/bin/env node
// run-extraction.mjs — the forward-events family's canonical entry point (Wave MH-5, "harness
// completion").
//
// WHY THIS EXISTS: before this file, forward-events had NO runner script at all — PROTOCOL.md's own
// header says so plainly ("this lane deliberately does not create scripts/harness-runs/forward-events/"
// until a real run lands one), and the one run this family has (forward-events-run-001.json) was
// produced by a scratch script (`/root/work/forward-events/run-live.mjs`) that lived OUTSIDE this repo
// and is not in version control — its `full_trace_refs` even name it as an external path. That means
// every future forward-events run either re-derives that scratch script from scratch, or (worse) runs
// the extractor ad hoc and forgets to write the artifact at all — exactly PROPOSER-RUNBOOK.md §5's
// "Known residual" describes for mint and fetch-drain, extended to a family that never even had prose
// runbook steps to forget. This script closes that gap by giving forward-events a real, versioned,
// self-emitting entry point, the same shape screen-worklist.mjs already is for screen and
// run-mint-batch.mjs (this same wave) now is for mint.
//
// WHAT IT DOES — a thin orchestrator around the family's EXISTING, unmodified extractor:
//   1. Reads a corpus file: an array of { id, claims, sections } items (or { items: [...] }) — the exact
//      shape extractForwardEvents() already consumes per PROTOCOL.md §2, just batched over many items.
//   2. Runs extractForwardEvents({claims, sections}) once per item — no new extraction logic here; this
//      script never touches a date pattern or a trigger rule.
//   3. Prints (and, on --execute, writes) the full events/skipped output for every item.
//   4. ALWAYS writes this run's CONVENTION.md-shaped artifact via scripts/lib/run-artifact.mjs's
//      writeRunArtifact, from a `finally` block, so a thrown error partway through an --execute run
//      still leaves a record — see main() below.
//
// extractForwardEvents() is pure and does no I/O of its own (no DB, no network, no writes) — per
// PROTOCOL.md §2, "the extractor never writes." This script does not change that: it only reads the
// corpus file it's given and writes its own output files + run artifact, never a database.
//
// --dry-run is the default (preview: extract, print, touch nothing on disk). Pass --execute to write the
// events/skipped output files and the run artifact.
//
// USAGE:
//   node scripts/forward-events/run-extraction.mjs --input path/to/corpus.json [--execute]
//                                                    [--harness-runs-dir dir] [--out-dir dir]

import { parseArgs } from "node:util";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, basename, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { extractForwardEvents, EXTRACTOR_VERSION } from "./extract-forward-events.mjs";
import { writeRunArtifact, hashHarnessVersion, claimRunId } from "../lib/run-artifact.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FSI_ROOT = resolve(HERE, "..", "..");
const DEFAULT_HARNESS_RUNS_DIR = resolve(HERE, "..", "harness-runs", "forward-events");

// The forward-events family's governing files — identical to CONVENTION.md's harness_version table and
// F28's GOVERNING_FILES.'forward-events' (.discipline/fitness/functions/F28-harness-run-integrity.mjs).
export const FORWARD_EVENTS_GOVERNING_FILES = Object.freeze([
  "scripts/forward-events/extract-forward-events.mjs",
  "scripts/harness-runs/forward-events/PROTOCOL.md",
]);

function usage() {
  return (
    "Usage: node scripts/forward-events/run-extraction.mjs --input path/to/corpus.json [--execute]\n" +
    "                                                        [--harness-runs-dir dir] [--out-dir dir] [--out-basename name]"
  );
}

/**
 * Load and normalize a corpus file into a bare array of items. Accepts either a bare JSON array of
 * `{ id, claims, sections }` items, or `{ "items": [...] }` — same normalization style as
 * screen-worklist.mjs's loadRows / run-mint-batch.mjs's loadBatch. Throws on unreadable/unparseable
 * input (a usage error); a single item's own shape problems are never thrown, only reported per-item
 * (extractForwardEvents already tolerates missing/malformed claims/sections gracefully — see its own
 * `Array.isArray(...) ? ... : []` guards).
 */
export function loadCorpus(inputPath) {
  const raw = readFileSync(inputPath, "utf8");
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.items)) return parsed.items;
  throw new Error(`--input must be a JSON array of items, or an object { "items": [...] }; got ${typeof parsed}`);
}

/** An item's own identifier for per_item/output reporting — never invented. */
export function itemId(item, index) {
  return item?.id ?? item?.item_id ?? item?.intelligence_item_id ?? `corpus-index-${index}`;
}

/**
 * Run extractForwardEvents (the family's EXISTING, unmodified pure extractor) once per item in the
 * corpus. Pure function: no I/O, no DB, no network — extractForwardEvents itself performs none, and
 * this wrapper adds none. Returns:
 *   perItem    -- CONVENTION.md-shaped per_item entries, one per item
 *   metrics    -- items_processed / items_with_events / events_emitted / skips / by_kind / by_confidence
 *                 / by_precision — the shape forward-events-run-001.json already established
 *   allEvents  -- every emitted event, each tagged with its source item's id (for the events output file)
 *   allSkips   -- every skip, each tagged with its source item's id (for the skipped output file)
 */
export function runExtraction(items) {
  const perItem = [];
  const allEvents = [];
  const allSkips = [];
  const byKind = {};
  const byConfidence = {};
  const byPrecision = {};
  let itemsWithEvents = 0;

  items.forEach((item, index) => {
    const id = String(itemId(item, index));
    const claims = Array.isArray(item?.claims) ? item.claims : [];
    const sections = Array.isArray(item?.sections) ? item.sections : [];
    const { events, skipped } = extractForwardEvents({ claims, sections });

    if (events.length > 0) itemsWithEvents += 1;
    for (const e of events) {
      allEvents.push({ item_id: id, ...e });
      byKind[e.event_kind] = (byKind[e.event_kind] ?? 0) + 1;
      byConfidence[e.confidence] = (byConfidence[e.confidence] ?? 0) + 1;
      byPrecision[e.date_precision] = (byPrecision[e.date_precision] ?? 0) + 1;
    }
    for (const s of skipped) allSkips.push({ item_id: id, ...s });

    perItem.push({
      id,
      outcome: events.length > 0 ? "extracted" : "no_events",
      verdict: `${events.length} event(s), ${skipped.length} skip(s)`,
      evidence_refs: [],
      error: null,
    });
  });

  return {
    perItem,
    metrics: {
      items_processed: items.length,
      items_with_events: itemsWithEvents,
      events_emitted: allEvents.length,
      skips: allSkips.length,
      by_kind: byKind,
      by_confidence: byConfidence,
      by_precision: byPrecision,
      extractor_version: EXTRACTOR_VERSION,
    },
    allEvents,
    allSkips,
  };
}

/**
 * Build this run's CONVENTION.md-shaped artifact. Pure function (no I/O). Mirrors
 * run-mint-batch.mjs's buildRunArtifact / screen-worklist.mjs's buildRunArtifact — same discipline,
 * different family. See run-mint-batch.mjs's doc comment for the runError/partial-result handling
 * rationale; identical here.
 */
export function buildRunArtifact({
  runId,
  harnessVersion,
  startedAt,
  finishedAt,
  inputPath,
  outDir,
  execute,
  result,
  runError,
  eventsPath,
  skipsPath,
}) {
  const fullTraceRefs = [inputPath];
  if (eventsPath) fullTraceRefs.push(eventsPath);
  if (skipsPath) fullTraceRefs.push(skipsPath);

  const defectsFound = [];
  if (runError) {
    defectsFound.push({
      description: `run-extraction.mjs threw during an --execute run: ${runError.message}`,
      root_cause: runError.stack ?? "",
      fix_ref: null,
    });
  }

  return {
    harness_family: "forward-events",
    harness_version: harnessVersion,
    run_id: runId,
    started_at: startedAt,
    finished_at: finishedAt,
    config: {
      input: inputPath,
      out_dir: outDir,
      execute,
      mode: execute ? "execute" : "dry_run",
    },
    inputs_ref: [inputPath],
    per_item: result?.perItem ?? [],
    metrics: result?.metrics ?? {},
    defects_found: defectsFound,
    full_trace_refs: fullTraceRefs,
    proposer_notes: runError
      ? "This run threw before completing — see defects_found for the error. Re-run after fixing the " +
        "root cause; this artifact exists so the attempt is not silently unrecorded (Wave MH-5)."
      : "Auto-emitted by run-extraction.mjs's own execution path (Wave MH-5) — the family's first " +
        "versioned, in-repo runner; forward-events-run-001.json was produced by an external scratch " +
        "script (see its own inputs_ref/full_trace_refs paths under /root/work/forward-events/), which " +
        "this script replaces going forward.",
  };
}

function printSummary(result, { dryRun }) {
  console.log(`${dryRun ? "[dry-run] " : ""}Processed ${result.metrics.items_processed} item(s).`);
  console.log(`  items_with_events: ${result.metrics.items_with_events}`);
  console.log(`  events_emitted:    ${result.metrics.events_emitted}`);
  console.log(`  skips:             ${result.metrics.skips}`);
  console.log(`  by_kind: ${JSON.stringify(result.metrics.by_kind)}`);
  if (dryRun) {
    console.log("Preview only — nothing written; pass --execute to write output files + the run artifact.");
  }
}

function main() {
  const { values } = parseArgs({
    options: {
      input: { type: "string" },
      execute: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      "harness-runs-dir": { type: "string" },
      "out-dir": { type: "string" },
      "out-basename": { type: "string" },
      help: { type: "boolean", default: false },
    },
    allowPositionals: false,
    strict: true,
  });

  if (values.help) {
    console.log(usage());
    return;
  }
  if (!values.input) {
    console.error(usage());
    process.exit(1);
  }

  const inputPath = resolve(values.input);
  const execute = values.execute === true && values["dry-run"] !== true;
  const harnessRunsDir = resolve(values["harness-runs-dir"] || DEFAULT_HARNESS_RUNS_DIR);
  const outDir = resolve(values["out-dir"] || dirname(inputPath));
  const startedAt = new Date().toISOString();

  if (!execute) {
    // DRY RUN (default): extract in full, print the summary, write NOTHING to disk.
    let items;
    try {
      items = loadCorpus(inputPath);
    } catch (err) {
      console.error(`Failed to read/parse --input ${inputPath}: ${err.message}`);
      process.exit(1);
    }
    const result = runExtraction(items);
    printSummary(result, { dryRun: true });
    return;
  }

  // EXECUTE: a real run. The run artifact write happens in `finally`, unconditionally — see
  // run-mint-batch.mjs's identical pattern and its doc comment for the rationale.
  let runId = null;
  let result = null;
  let runError = null;
  let eventsPath = null;
  let skipsPath = null;

  try {
    runId = claimRunId(harnessRunsDir, "forward-events");
    const items = loadCorpus(inputPath);
    result = runExtraction(items);
    printSummary(result, { dryRun: false });

    mkdirSync(outDir, { recursive: true });
    const base = values["out-basename"] || basename(inputPath, extname(inputPath));
    eventsPath = join(outDir, `${base}.events.json`);
    skipsPath = join(outDir, `${base}.skipped.json`);
    writeFileSync(eventsPath, JSON.stringify(result.allEvents, null, 2) + "\n", "utf8");
    writeFileSync(skipsPath, JSON.stringify(result.allSkips, null, 2) + "\n", "utf8");
    console.log(`Wrote ${eventsPath}`);
    console.log(`Wrote ${skipsPath}`);
  } catch (err) {
    runError = err;
  } finally {
    if (runId) {
      const harnessVersion = hashHarnessVersion(FORWARD_EVENTS_GOVERNING_FILES, FSI_ROOT);
      const artifact = buildRunArtifact({
        runId,
        harnessVersion,
        startedAt,
        finishedAt: new Date().toISOString(),
        inputPath,
        outDir,
        execute,
        result,
        runError,
        eventsPath,
        skipsPath,
      });
      const artifactPath = writeRunArtifact(harnessRunsDir, artifact);
      console.log(`Wrote ${artifactPath}`);
    }
  }

  if (runError) {
    console.error(`run-extraction: FAILED — ${runError.message}`);
    process.exit(1);
  }
}

// Only run main() when this file is executed directly (not when imported by the test suite).
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
