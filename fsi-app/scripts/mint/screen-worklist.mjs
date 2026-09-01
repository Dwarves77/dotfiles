#!/usr/bin/env node
// screen-worklist.mjs — runner for the $0, rule-based relevance re-screen (screen-rules.mjs) against a
// JSON dump of census_worklist rows. Read-only, no DB access, no network: it reads one input file the
// coordinator exported, classifies every row with classifyRelevance(), and writes a results JSON + a
// human-readable summary. It never talks to Supabase itself (MINT-RUNBOOK.md's $0/no-DB-writes-from-a-
// mint-lane rule) — the coordinator exports the 3,661 would_mint rows, this runner classifies the dump,
// and the coordinator applies the dispositions it recommends (see SCREEN-REPORT-FORMAT.md for the handoff
// contract).
//
// ── OPTIONAL --reviewed MERGE (round-2 judgment pass) ─────────────────────────────────────────────────────
// Pass --reviewed path/to/reviewed-verdicts.json to merge in human-reviewer verdicts for rows the rule
// engine left ambiguous (id -> {verdict, reason, reviewer}). Provenance is kept separate in every output
// row (`provenance: "rule" | "reviewed"`) and in counts.byProvenance, per the M-screen-2 hard rule: a
// reviewed verdict is ONLY ever applied to a row the RULE engine classified ambiguous — it never overrides
// an on_vertical/off_vertical rule decision. See mergeReviewed() below for the exact contract.
//
// ── EXPECTED INPUT SHAPE ────────────────────────────────────────────────────────────────────────────────
// A JSON file at --input, either:
//   (a) a bare array of row objects, or
//   (b) an object of the form { "rows": [ ...row objects... ] }
// Each row object (a projection of public.census_worklist, id + document_url required; extra columns are
// ignored so the coordinator's export can carry more than the screen needs):
//   {
//     "id": "<census_worklist.id, uuid>",           // required — carried through unchanged for traceability
//     "document_url": "<census_worklist.document_url>", // required — what the classifier reads
//     "title": "<census_worklist.title, may be null>",  // optional; absent/null rows are still classified
//                                                          (title="" -> undecodable-title path, see screen-rules.mjs)
//     "surface_tags": ["regulations", ...]            // optional; census_worklist.surface_tags, informational only
//   }
// A row missing `id` or `document_url` is treated as malformed: it is NOT classified (no fabricated verdict)
// and is instead reported in the summary's "malformed input rows" section — the same "flag it, never invent
// or silently drop" discipline the runbook enforces on payload authoring.
//
// Run history belongs in scripts/harness-runs/screen/ — see scripts/harness-runs/CONVENTION.md for the
// artifact schema and PROPOSER-RUNBOOK.md for the read-before-you-run cadence (Wave MH-1).
//
// ── EMISSION IS IN THE HARNESS (Wave MH-2, build plan §2) ─────────────────────────────────────────────────
// Every invocation of main() that reaches a successful write also writes its own run artifact to
// scripts/harness-runs/screen/ via scripts/lib/run-artifact.mjs's writeRunArtifact — this is not a step a
// coordinator remembers to run afterward, it is the last thing this script does before exiting 0. Forgetting
// is not possible because there is nothing separate to remember. run_id auto-increments from the highest
// existing screen-run-NNN.json already in the target directory (nextRunId, exported for the test suite).
// --harness-runs-dir overrides the target directory (default: scripts/harness-runs/screen next to this
// script, resolved absolutely so it is independent of cwd) — the ONLY reason to override it is a test that
// must not write into the repo's real run history.
//
// ── USAGE ───────────────────────────────────────────────────────────────────────────────────────────────
//   node scripts/mint/screen-worklist.mjs --input path/to/census-dump.json [--out-dir path/to/dir]
//                                          [--harness-runs-dir path/to/dir]
//
// Writes, into --out-dir (default: the input file's own directory):
//   <basename>.screen-results.json   -- full machine-readable results (see shape below)
//   <basename>.screen-summary.md     -- human-readable summary for the coordinator (SCREEN-REPORT-FORMAT.md)
// Writes, into --harness-runs-dir (default: scripts/harness-runs/screen/):
//   screen-run-NNN.json              -- this run's CONVENTION.md-shaped artifact (see buildRunArtifact)
//
// Exit code: 0 on success (even when off_vertical/ambiguous rows exist — that is the screen doing its job,
// not a runner failure); 1 only on a usage error or an unreadable/unparseable --input file.

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { resolve, dirname, basename, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyRelevance } from "./screen-rules.mjs";
import { writeRunArtifact, hashHarnessVersion } from "../lib/run-artifact.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FSI_ROOT = resolve(HERE, "..", "..");
const DEFAULT_HARNESS_RUNS_DIR = resolve(HERE, "..", "harness-runs", "screen");

// The screen family's governing files per scripts/harness-runs/CONVENTION.md's harness_version table —
// fsi-app-relative, single source of truth this script hashes itself with. F28 (harness-run-integrity)
// imports this same constant rather than hand-copying it, so the two can never drift apart.
export const SCREEN_GOVERNING_FILES = [
  "scripts/mint/screen-rules.mjs",
  "scripts/mint/screen-worklist.mjs",
];

function parseArgs(argv) {
  const args = { input: null, outDir: null, reviewed: null, outBasename: null, harnessRunsDir: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--input") args.input = argv[++i];
    else if (a.startsWith("--input=")) args.input = a.slice("--input=".length);
    else if (a === "--out-dir") args.outDir = argv[++i];
    else if (a.startsWith("--out-dir=")) args.outDir = a.slice("--out-dir=".length);
    else if (a === "--reviewed") args.reviewed = argv[++i];
    else if (a.startsWith("--reviewed=")) args.reviewed = a.slice("--reviewed=".length);
    else if (a === "--out-basename") args.outBasename = argv[++i];
    else if (a.startsWith("--out-basename=")) args.outBasename = a.slice("--out-basename=".length);
    else if (a === "--harness-runs-dir") args.harnessRunsDir = argv[++i];
    else if (a.startsWith("--harness-runs-dir=")) args.harnessRunsDir = a.slice("--harness-runs-dir=".length);
  }
  return args;
}

/**
 * Load and normalize the input file into a bare array of row objects. Throws on unreadable/unparseable
 * input (a usage error, not a screening outcome) but never on row-level shape problems -- those are
 * malformed rows, reported, not thrown.
 */
export function loadRows(inputPath) {
  const raw = readFileSync(inputPath, "utf8");
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.rows)) return parsed.rows;
  throw new Error(
    `--input must be a JSON array of rows, or an object { "rows": [...] }; got ${typeof parsed}`,
  );
}

/**
 * Classify every row. Pure function: no I/O. Returns { results, malformed, counts }.
 *   results[]   -- one entry per classified row: { id, document_url, title, surface_tags, verdict, rule, basis }
 *   malformed[] -- rows missing id or document_url, verbatim plus a reason, never classified
 *   counts      -- { byVerdict: {on_vertical,off_vertical,ambiguous}, byRule: {<rule name>: n} }
 */
export function screenRows(rows) {
  const results = [];
  const malformed = [];
  const byVerdict = { on_vertical: 0, off_vertical: 0, ambiguous: 0 };
  const byRule = {};

  for (const row of rows) {
    if (!row || typeof row !== "object") {
      malformed.push({ row, reason: "row is not an object" });
      continue;
    }
    if (!row.id) {
      malformed.push({ row, reason: "missing id" });
      continue;
    }
    if (!row.document_url) {
      malformed.push({ row, reason: "missing document_url" });
      continue;
    }
    const { verdict, rule, basis } = classifyRelevance({
      title: row.title ?? "",
      document_url: row.document_url,
      surface_tags: row.surface_tags ?? [],
    });
    results.push({
      id: row.id,
      document_url: row.document_url,
      title: row.title ?? null,
      surface_tags: row.surface_tags ?? [],
      verdict,
      rule,
      basis,
      provenance: "rule",
    });
    byVerdict[verdict] = (byVerdict[verdict] ?? 0) + 1;
    byRule[rule] = (byRule[rule] ?? 0) + 1;
  }

  return { results, malformed, counts: { byVerdict, byRule } };
}

/**
 * Load a reviewed-verdicts file: a flat JSON object `{ "<census_worklist.id>": {verdict, reason, reviewer} }`
 * produced by a human reviewer's judgment pass over rows the rule engine left ambiguous. Throws only on
 * unreadable/unparseable input or the wrong top-level shape (a usage error) -- per-entry problems are
 * reported by mergeReviewed(), never thrown.
 */
export function loadReviewed(reviewedPath) {
  const raw = readFileSync(reviewedPath, "utf8");
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      `--reviewed must be a JSON object of { "<id>": {verdict, reason, reviewer} }; got ${Array.isArray(parsed) ? "array" : typeof parsed}`,
    );
  }
  return parsed;
}

const VALID_VERDICTS = new Set(["on_vertical", "off_vertical", "ambiguous"]);

/**
 * Merge a reviewed-verdicts map into a screenRows() result. Pure function: no I/O.
 *
 * HARD RULE (provenance separation + the ambiguous-never-auto-declines-by-RULE guarantee extended to
 * judgment): a reviewed entry is applied ONLY to a row the RULE engine classified `ambiguous`. A reviewed
 * entry for a row the rule engine already decided on_vertical/off_vertical is never applied -- it is
 * recorded in `reviewedSkippedNotAmbiguous` instead, so a mismatch between the reviewer's working set and
 * the rule engine's current output is visible, never silently ignored. Every result row keeps an explicit
 * `provenance: "rule" | "reviewed"` field; counts.byProvenance tallies both.
 *
 * Returns { results, malformed, counts: {byVerdict, byRule, byProvenance},
 *           reviewedApplied, reviewedSkippedNotAmbiguous, reviewedInvalid, reviewedUnmatched }.
 */
export function mergeReviewed(screened, reviewed) {
  const results = screened.results.map((r) => ({ ...r }));
  const byId = new Map(results.map((r) => [r.id, r]));
  const byVerdict = { ...screened.counts.byVerdict };
  const byProvenance = { rule: results.length, reviewed: 0 };

  const reviewedApplied = [];
  const reviewedSkippedNotAmbiguous = [];
  const reviewedInvalid = [];
  const reviewedUnmatched = [];

  for (const [id, entry] of Object.entries(reviewed ?? {})) {
    const row = byId.get(id);
    if (!row) {
      reviewedUnmatched.push(id);
      continue;
    }
    const hasValidShape =
      entry &&
      typeof entry === "object" &&
      VALID_VERDICTS.has(entry.verdict) &&
      typeof entry.reason === "string" &&
      entry.reason.length > 0;
    if (!hasValidShape) {
      reviewedInvalid.push(id);
      continue;
    }
    if (row.verdict !== "ambiguous") {
      reviewedSkippedNotAmbiguous.push(id);
      continue;
    }

    byVerdict[row.verdict] = (byVerdict[row.verdict] ?? 0) - 1;
    row.verdict = entry.verdict;
    row.rule = null;
    row.basis = entry.reason;
    row.reviewer = entry.reviewer ?? null;
    row.provenance = "reviewed";
    byVerdict[row.verdict] = (byVerdict[row.verdict] ?? 0) + 1;
    byProvenance.rule -= 1;
    byProvenance.reviewed += 1;
    reviewedApplied.push(id);
  }

  return {
    results,
    malformed: screened.malformed,
    counts: { byVerdict, byRule: screened.counts.byRule, byProvenance },
    reviewedApplied,
    reviewedSkippedNotAmbiguous,
    reviewedInvalid,
    reviewedUnmatched,
  };
}

function fmtRow(r) {
  const ruleLabel = r.provenance === "reviewed" ? `reviewed by ${r.reviewer ?? "unknown"}` : r.rule;
  return `- [${ruleLabel}] ${r.id}\n  title: ${r.title ?? "(none)"}\n  url: ${r.document_url}\n  basis: ${r.basis}`;
}

/**
 * Build the human-readable summary markdown. Exported so the test suite can assert on its shape without
 * touching the filesystem.
 */
export function buildSummary({ results, malformed, counts, reviewMeta }, { inputPath, generatedAt, reviewedPath } = {}) {
  const lines = [];
  lines.push(`# Relevance re-screen summary`);
  lines.push("");
  lines.push(`Input: \`${inputPath ?? "(unspecified)"}\``);
  if (reviewedPath) lines.push(`Reviewed verdicts: \`${reviewedPath}\``);
  lines.push(`Generated: ${generatedAt ?? new Date().toISOString()}`);
  lines.push(`Rows classified: ${results.length}${malformed.length ? ` (+ ${malformed.length} malformed, not classified)` : ""}`);
  lines.push("");

  lines.push(`## Counts per verdict`);
  for (const v of ["on_vertical", "off_vertical", "ambiguous"]) {
    lines.push(`- ${v}: ${counts.byVerdict[v] ?? 0}`);
  }
  lines.push("");

  if (counts.byProvenance) {
    lines.push(`## Counts per provenance`);
    lines.push(`- rule: ${counts.byProvenance.rule ?? 0}`);
    lines.push(`- reviewed: ${counts.byProvenance.reviewed ?? 0}`);
    lines.push("");

    lines.push(`## Verdict × provenance`);
    for (const v of ["on_vertical", "off_vertical", "ambiguous"]) {
      const ruleN = results.filter((r) => r.verdict === v && r.provenance === "rule").length;
      const reviewedN = results.filter((r) => r.verdict === v && r.provenance === "reviewed").length;
      lines.push(`- ${v}: ${ruleN} rule + ${reviewedN} reviewed = ${ruleN + reviewedN}`);
    }
    lines.push("");
  }

  if (reviewMeta) {
    lines.push(`## Reviewed-file merge notes`);
    lines.push(`- applied: ${reviewMeta.reviewedApplied.length}`);
    lines.push(`- skipped (rule already decided on/off, not applied): ${reviewMeta.reviewedSkippedNotAmbiguous.length}`);
    lines.push(`- invalid entries (bad shape, not applied): ${reviewMeta.reviewedInvalid.length}`);
    lines.push(`- unmatched ids (no such row in --input, not applied): ${reviewMeta.reviewedUnmatched.length}`);
    if (reviewMeta.reviewedSkippedNotAmbiguous.length) {
      lines.push("");
      lines.push(`  skipped ids: ${reviewMeta.reviewedSkippedNotAmbiguous.join(", ")}`);
    }
    if (reviewMeta.reviewedInvalid.length) {
      lines.push("");
      lines.push(`  invalid ids: ${reviewMeta.reviewedInvalid.join(", ")}`);
    }
    if (reviewMeta.reviewedUnmatched.length) {
      lines.push("");
      lines.push(`  unmatched ids: ${reviewMeta.reviewedUnmatched.join(", ")}`);
    }
    lines.push("");
  }

  lines.push(`## Counts per rule`);
  const ruleNames = Object.keys(counts.byRule).sort();
  if (ruleNames.length === 0) {
    lines.push("(none)");
  } else {
    for (const name of ruleNames) lines.push(`- ${name}: ${counts.byRule[name]}`);
  }
  lines.push("");

  const offVertical = results.filter((r) => r.verdict === "off_vertical");
  lines.push(`## Off-vertical (${offVertical.length}) — for archive/park, never minted, never silently dropped`);
  lines.push("");
  if (offVertical.length === 0) {
    lines.push("(none)");
  } else {
    for (const r of offVertical) lines.push(fmtRow(r));
  }
  lines.push("");

  const ambiguous = results.filter((r) => r.verdict === "ambiguous");
  lines.push(`## Ambiguous (${ambiguous.length}) — human-review bucket, never auto-declined`);
  lines.push("");
  if (ambiguous.length === 0) {
    lines.push("(none)");
  } else {
    for (const r of ambiguous) lines.push(fmtRow(r));
  }
  lines.push("");

  if (malformed.length) {
    lines.push(`## Malformed input rows (${malformed.length}) — not classified, flag back to the exporting lane`);
    lines.push("");
    for (const m of malformed) {
      lines.push(`- reason: ${m.reason} — row: ${JSON.stringify(m.row)}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Next run_id for the screen family: scans harnessRunsDir for existing screen-run-NNN.json files
 * (ignoring anything that doesn't match, so a stray PENDING-RUN.md or a corrupt filename never blocks
 * numbering) and returns "screen-run-<NNN+1>", zero-padded 3 digits, per CONVENTION.md's run_id rule.
 * An empty/missing directory starts at screen-run-001. Exported for the test suite.
 */
export function nextRunId(harnessRunsDir) {
  let entries = [];
  try {
    entries = readdirSync(harnessRunsDir);
  } catch {
    entries = [];
  }
  let max = 0;
  for (const name of entries) {
    const m = /^screen-run-(\d{3})\.json$/.exec(name);
    if (m) max = Math.max(max, Number.parseInt(m[1], 10));
  }
  return `screen-run-${String(max + 1).padStart(3, "0")}`;
}

/**
 * Build this run's CONVENTION.md-shaped artifact. Pure function (no I/O, no Date.now() default — callers
 * supply startedAt) so the test suite can assert its shape without touching the filesystem or the real
 * harness-runs directory. `merged`/`reviewMeta` are exactly what main() already computed; `harnessVersion`
 * is computed by the caller (the one I/O-bearing step: hashing SCREEN_GOVERNING_FILES).
 *
 * per_item ships EMPTY here, matching CONVENTION.md's "per_item at scale" rule and the precedent every
 * retrofitted screen-run-*.json artifact already set (round 1 through round 3 all shipped per_item: []):
 * a screen run's population is hundreds to thousands of rows, so row-level truth lives ONLY in
 * full_trace_refs (the results JSON this same run writes, which — unlike per_item — holds every row,
 * not a curated subset) never in a second, driftable copy inside the artifact itself.
 */
export function buildRunArtifact({
  runId,
  harnessVersion,
  startedAt,
  inputPath,
  reviewedPath,
  outDir,
  rowsIn,
  merged,
  reviewMeta,
  resultsPath,
  summaryPath,
}) {
  const rate = (n, d) => (d > 0 ? `${n}/${d} = ${((n / d) * 100).toFixed(2)}%` : `${n}/${d} (no rows classified)`);
  const classified = merged.results.length;
  const operatorOverturnRate = reviewMeta
    ? `${reviewMeta.reviewedApplied.length} reviewed verdict(s) applied to rule-ambiguous rows; ` +
      `${reviewMeta.reviewedSkippedNotAmbiguous.length} reviewed entr(y/ies) targeting an already-decided ` +
      `row were REFUSED by the hard rule (never overturns a rule on/off verdict), so 0 of those were applied`
    : "not applicable — no --reviewed merge this run";

  return {
    harness_family: "screen",
    harness_version: harnessVersion,
    run_id: runId,
    started_at: startedAt,
    config: {
      input: inputPath,
      reviewed: reviewedPath,
      out_dir: outDir,
      rows_in: rowsIn,
    },
    inputs_ref: reviewedPath ? [inputPath, reviewedPath] : [inputPath],
    per_item: [],
    metrics: {
      on_vertical: merged.counts.byVerdict.on_vertical ?? 0,
      off_vertical: merged.counts.byVerdict.off_vertical ?? 0,
      ambiguous: merged.counts.byVerdict.ambiguous ?? 0,
      rows_malformed: merged.malformed.length,
      ambiguous_rate: rate(merged.counts.byVerdict.ambiguous ?? 0, classified),
      operator_overturn_rate: operatorOverturnRate,
    },
    defects_found: [],
    full_trace_refs: [resultsPath, summaryPath],
    proposer_notes:
      "Auto-emitted by screen-worklist.mjs's own execution path (Wave MH-2, build plan §2 — " +
      "'emission is in the harness, not the operator'). A proposer pass reading this run before the " +
      "next screen batch should still read the full resultsPath/summaryPath in full_trace_refs, not " +
      "just this artifact's metrics — per PROPOSER-RUNBOOK.md.",
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) {
    console.error(
      "Usage: node scripts/mint/screen-worklist.mjs --input path/to/census-dump.json [--out-dir path/to/dir] [--reviewed path/to/reviewed-verdicts.json] [--out-basename name]",
    );
    process.exit(1);
  }

  const inputPath = resolve(args.input);
  let rows;
  try {
    rows = loadRows(inputPath);
  } catch (err) {
    console.error(`Failed to read/parse --input ${inputPath}: ${err.message}`);
    process.exit(1);
  }

  const screened = screenRows(rows);

  let reviewedPath = null;
  let merged = screened;
  let reviewMeta = null;
  if (args.reviewed) {
    reviewedPath = resolve(args.reviewed);
    let reviewedMap;
    try {
      reviewedMap = loadReviewed(reviewedPath);
    } catch (err) {
      console.error(`Failed to read/parse --reviewed ${reviewedPath}: ${err.message}`);
      process.exit(1);
    }
    merged = mergeReviewed(screened, reviewedMap);
    reviewMeta = {
      reviewedApplied: merged.reviewedApplied,
      reviewedSkippedNotAmbiguous: merged.reviewedSkippedNotAmbiguous,
      reviewedInvalid: merged.reviewedInvalid,
      reviewedUnmatched: merged.reviewedUnmatched,
    };
  }

  const outDir = resolve(args.outDir || dirname(inputPath));
  mkdirSync(outDir, { recursive: true });

  const base = args.outBasename || basename(inputPath, extname(inputPath));
  const resultsPath = join(outDir, `${base}.screen-results.json`);
  const summaryPath = join(outDir, `${base}.screen-summary.md`);
  const generatedAt = new Date().toISOString();

  writeFileSync(
    resultsPath,
    JSON.stringify(
      {
        input: inputPath,
        reviewed_input: reviewedPath,
        generated_at: generatedAt,
        rows_in: rows.length,
        rows_classified: merged.results.length,
        rows_malformed: merged.malformed.length,
        counts: merged.counts,
        review_merge: reviewMeta,
        results: merged.results,
        malformed: merged.malformed,
      },
      null,
      2,
    ),
    "utf8",
  );

  writeFileSync(
    summaryPath,
    buildSummary({ ...merged, reviewMeta }, { inputPath, generatedAt, reviewedPath }),
    "utf8",
  );

  console.log(`Screened ${merged.results.length}/${rows.length} rows (${merged.malformed.length} malformed).`);
  console.log(`  on_vertical:  ${merged.counts.byVerdict.on_vertical}`);
  console.log(`  off_vertical: ${merged.counts.byVerdict.off_vertical}`);
  console.log(`  ambiguous:    ${merged.counts.byVerdict.ambiguous}`);
  if (reviewMeta) {
    console.log(`  reviewed applied: ${reviewMeta.reviewedApplied.length}`);
  }
  console.log(`Wrote ${resultsPath}`);
  console.log(`Wrote ${summaryPath}`);

  // ── EMISSION IS IN THE HARNESS (Wave MH-2) — the run artifact write, as part of THIS execution path,
  // not a separate step a coordinator has to remember. See the header note and buildRunArtifact() above.
  const harnessRunsDir = resolve(args.harnessRunsDir || DEFAULT_HARNESS_RUNS_DIR);
  const runId = nextRunId(harnessRunsDir);
  const harnessVersion = hashHarnessVersion(SCREEN_GOVERNING_FILES, FSI_ROOT);
  const artifact = buildRunArtifact({
    runId,
    harnessVersion,
    startedAt: generatedAt,
    inputPath,
    reviewedPath,
    outDir,
    rowsIn: rows.length,
    merged,
    reviewMeta,
    resultsPath,
    summaryPath,
  });
  const artifactPath = writeRunArtifact(harnessRunsDir, artifact);
  console.log(`Wrote ${artifactPath}`);
}

// Only run main() when this file is executed directly (not when imported by the test suite).
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
