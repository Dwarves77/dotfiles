// screen-worklist.test.mjs — coverage for the round-2 judgment-pass merge added to screen-worklist.mjs
// (mergeReviewed / loadReviewed / the --reviewed CLI flag). Run standalone:
//   node --test scripts/mint/screen-worklist.test.mjs
// (scripts/mint/** is this lane's own write set, outside the wired .discipline/run-test-suite.sh glob list
// — the same precedent validate-mint-payload.test.mjs and screen-rules.test.mjs already set.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

import {
  screenRows,
  loadReviewed,
  mergeReviewed,
  buildSummary,
  nextRunId,
  buildRunArtifact,
} from "./screen-worklist.mjs";
import { validateRunArtifact, readRunHistory } from "../lib/run-artifact.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKLIST_SCRIPT = join(HERE, "screen-worklist.mjs");

// A row with no title and a URL that carries no CELEX/known-root/rule signal -> stays ambiguous.
const AMBIGUOUS_ROW = {
  id: "row-ambiguous-1",
  document_url: "https://example.gov/docs/2026-1234.pdf",
  title: null,
  surface_tags: [],
};
// A row a round-1/round-2 RULE already decides on_vertical.
const ON_ROW = {
  id: "row-on-1",
  document_url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32026L0088",
  title: "Directive amending Directive 2003/87/EC as regards the EU Emissions Trading System (maritime)",
  surface_tags: [],
};

test("mergeReviewed: applies a reviewed verdict to a rule-ambiguous row and tags provenance", () => {
  const screened = screenRows([AMBIGUOUS_ROW]);
  assert.equal(screened.results[0].verdict, "ambiguous");
  assert.equal(screened.results[0].provenance, "rule");

  const merged = mergeReviewed(screened, {
    "row-ambiguous-1": {
      verdict: "off_vertical",
      reason: "US federal register document outside freight-sustainability scope",
      reviewer: "M-SCREEN-2",
    },
  });

  const row = merged.results.find((r) => r.id === "row-ambiguous-1");
  assert.equal(row.verdict, "off_vertical");
  assert.equal(row.provenance, "reviewed");
  assert.equal(row.reviewer, "M-SCREEN-2");
  assert.equal(row.rule, null);
  assert.equal(merged.reviewedApplied.length, 1);
  assert.equal(merged.counts.byVerdict.ambiguous, 0);
  assert.equal(merged.counts.byVerdict.off_vertical, 1);
  assert.equal(merged.counts.byProvenance.reviewed, 1);
  assert.equal(merged.counts.byProvenance.rule, 0);
});

test("mergeReviewed: HARD RULE — never overrides a row the rule engine already decided on/off", () => {
  const screened = screenRows([ON_ROW]);
  assert.equal(screened.results[0].verdict, "on_vertical");

  const merged = mergeReviewed(screened, {
    "row-on-1": { verdict: "off_vertical", reason: "reviewer disagrees", reviewer: "M-SCREEN-2" },
  });

  const row = merged.results.find((r) => r.id === "row-on-1");
  // Rule verdict stands. The reviewed entry is recorded as skipped, never silently applied.
  assert.equal(row.verdict, "on_vertical");
  assert.equal(row.provenance, "rule");
  assert.deepEqual(merged.reviewedApplied, []);
  assert.deepEqual(merged.reviewedSkippedNotAmbiguous, ["row-on-1"]);
});

test("mergeReviewed: an ambiguous row can stay ambiguous with a reviewed reason (title-insufficient residue)", () => {
  const screened = screenRows([AMBIGUOUS_ROW]);
  const merged = mergeReviewed(screened, {
    "row-ambiguous-1": {
      verdict: "ambiguous",
      reason: "title insufficient — needs document fetch",
      reviewer: "M-SCREEN-2",
    },
  });
  const row = merged.results.find((r) => r.id === "row-ambiguous-1");
  assert.equal(row.verdict, "ambiguous");
  assert.equal(row.provenance, "reviewed");
  assert.equal(merged.counts.byProvenance.reviewed, 1);
  assert.equal(merged.counts.byVerdict.ambiguous, 1);
});

test("mergeReviewed: an invalid entry (bad verdict, missing reason) is recorded, not applied", () => {
  const screened = screenRows([AMBIGUOUS_ROW]);
  const merged = mergeReviewed(screened, {
    "row-ambiguous-1": { verdict: "not_a_real_verdict", reason: "" },
  });
  const row = merged.results.find((r) => r.id === "row-ambiguous-1");
  assert.equal(row.verdict, "ambiguous");
  assert.equal(row.provenance, "rule");
  assert.deepEqual(merged.reviewedInvalid, ["row-ambiguous-1"]);
});

test("mergeReviewed: an id absent from the screened rows is recorded as unmatched, not applied", () => {
  const screened = screenRows([AMBIGUOUS_ROW]);
  const merged = mergeReviewed(screened, {
    "row-does-not-exist": { verdict: "on_vertical", reason: "x", reviewer: "M-SCREEN-2" },
  });
  assert.deepEqual(merged.reviewedUnmatched, ["row-does-not-exist"]);
  assert.deepEqual(merged.reviewedApplied, []);
});

test("loadReviewed: rejects a top-level array (must be an object keyed by id)", () => {
  const dir = mkdtempSync(join(tmpdir(), "screen-worklist-test-"));
  const p = join(dir, "reviewed.json");
  writeFileSync(p, JSON.stringify([{ id: "x" }]), "utf8");
  assert.throws(() => loadReviewed(p), /must be a JSON object/);
  rmSync(dir, { recursive: true, force: true });
});

test("buildSummary: shows provenance sections only when counts.byProvenance is present", () => {
  const screened = screenRows([AMBIGUOUS_ROW, ON_ROW]);
  const withoutReview = buildSummary(screened, { inputPath: "x.json" });
  assert.ok(!withoutReview.includes("Counts per provenance"));

  const merged = mergeReviewed(screened, {
    "row-ambiguous-1": { verdict: "off_vertical", reason: "r", reviewer: "M-SCREEN-2" },
  });
  const withReview = buildSummary(merged, { inputPath: "x.json", reviewedPath: "reviewed.json" });
  assert.ok(withReview.includes("Counts per provenance"));
  assert.ok(withReview.includes("- reviewed: 1"));
  assert.ok(withReview.includes("Verdict × provenance"));
});

test("CLI: --reviewed end-to-end resolves the ambiguous row and writes provenance-tagged output", () => {
  const dir = mkdtempSync(join(tmpdir(), "screen-worklist-cli-test-"));
  const inputPath = join(dir, "census.json");
  const reviewedPath = join(dir, "reviewed.json");
  writeFileSync(inputPath, JSON.stringify({ rows: [AMBIGUOUS_ROW, ON_ROW] }), "utf8");
  writeFileSync(
    reviewedPath,
    JSON.stringify({
      "row-ambiguous-1": {
        verdict: "off_vertical",
        reason: "US federal register document outside freight-sustainability scope",
        reviewer: "M-SCREEN-2",
      },
    }),
    "utf8",
  );

  const harnessRunsDir = join(dir, "harness-runs-screen");
  execFileSync(
    process.execPath,
    [
      WORKLIST_SCRIPT,
      "--input", inputPath,
      "--reviewed", reviewedPath,
      "--out-dir", dir,
      "--out-basename", "final",
      "--harness-runs-dir", harnessRunsDir,
    ],
    { encoding: "utf8" },
  );

  const results = JSON.parse(readFileSync(join(dir, "final.screen-results.json"), "utf8"));
  assert.equal(results.counts.byVerdict.ambiguous, 0);
  assert.equal(results.counts.byVerdict.off_vertical, 1);
  assert.equal(results.counts.byVerdict.on_vertical, 1);
  assert.equal(results.counts.byProvenance.reviewed, 1);
  assert.equal(results.counts.byProvenance.rule, 1);
  assert.equal(results.review_merge.reviewedApplied.length, 1);

  const summary = readFileSync(join(dir, "final.screen-summary.md"), "utf8");
  assert.ok(summary.includes("Reviewed verdicts:"));
  assert.ok(summary.includes("Counts per provenance"));

  rmSync(dir, { recursive: true, force: true });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════
// WAVE MH-2 (2026-09-01) — emission-in-the-harness: screen-worklist.mjs writes its own run artifact as
// part of its own execution path (build plan §2). Every test here that runs the CLI end-to-end MUST pass
// --harness-runs-dir pointing at a tmp dir — never the default — so a test run is never mistaken for a
// real screen batch inside the repo's own scripts/harness-runs/screen/ history.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════

test("nextRunId: empty/missing directory starts at screen-run-001", () => {
  const dir = mkdtempSync(join(tmpdir(), "screen-nextrunid-test-"));
  assert.equal(nextRunId(join(dir, "does-not-exist")), "screen-run-001");
  rmSync(dir, { recursive: true, force: true });
});

test("nextRunId: increments past the highest existing screen-run-NNN.json, ignoring non-matching files", () => {
  const dir = mkdtempSync(join(tmpdir(), "screen-nextrunid-test-"));
  writeFileSync(join(dir, "screen-run-001.json"), "{}", "utf8");
  writeFileSync(join(dir, "screen-run-003.json"), "{}", "utf8");
  writeFileSync(join(dir, "PENDING-RUN.md"), "not a run file", "utf8");
  writeFileSync(join(dir, "screen-run-not-a-number.json"), "{}", "utf8");
  assert.equal(nextRunId(dir), "screen-run-004");
  rmSync(dir, { recursive: true, force: true });
});

test("buildRunArtifact: shape is CONVENTION.md-valid and per_item ships empty (per_item-at-scale rule)", () => {
  const screened = screenRows([AMBIGUOUS_ROW, ON_ROW]);
  const artifact = buildRunArtifact({
    runId: "screen-run-099",
    harnessVersion: "sha256:aaaaaaaaaaaaaaaa",
    startedAt: "2026-09-01T00:00:00.000Z",
    inputPath: "/tmp/x/census.json",
    reviewedPath: null,
    outDir: "/tmp/x",
    rowsIn: 2,
    merged: screened,
    reviewMeta: null,
    resultsPath: "/tmp/x/census.screen-results.json",
    summaryPath: "/tmp/x/census.screen-summary.md",
  });
  assert.deepEqual(validateRunArtifact(artifact), []);
  assert.equal(artifact.harness_family, "screen");
  assert.deepEqual(artifact.per_item, []);
  assert.equal(artifact.metrics.on_vertical, 1);
  assert.equal(artifact.metrics.ambiguous, 1);
  assert.equal(artifact.metrics.operator_overturn_rate, "not applicable — no --reviewed merge this run");
  assert.deepEqual(artifact.full_trace_refs, ["/tmp/x/census.screen-results.json", "/tmp/x/census.screen-summary.md"]);
});

test("buildRunArtifact: a --reviewed run records the applied/skipped counts in operator_overturn_rate and inputs_ref", () => {
  const screened = screenRows([AMBIGUOUS_ROW, ON_ROW]);
  const merged = mergeReviewed(screened, {
    "row-ambiguous-1": { verdict: "off_vertical", reason: "r", reviewer: "test" },
    "row-on-1": { verdict: "off_vertical", reason: "attempted overturn", reviewer: "test" },
  });
  const reviewMeta = {
    reviewedApplied: merged.reviewedApplied,
    reviewedSkippedNotAmbiguous: merged.reviewedSkippedNotAmbiguous,
    reviewedInvalid: merged.reviewedInvalid,
    reviewedUnmatched: merged.reviewedUnmatched,
  };
  const artifact = buildRunArtifact({
    runId: "screen-run-099",
    harnessVersion: "sha256:aaaaaaaaaaaaaaaa",
    startedAt: "2026-09-01T00:00:00.000Z",
    inputPath: "/tmp/x/census.json",
    reviewedPath: "/tmp/x/reviewed.json",
    outDir: "/tmp/x",
    rowsIn: 2,
    merged,
    reviewMeta,
    resultsPath: "/tmp/x/census.screen-results.json",
    summaryPath: "/tmp/x/census.screen-summary.md",
  });
  assert.deepEqual(validateRunArtifact(artifact), []);
  assert.deepEqual(artifact.inputs_ref, ["/tmp/x/census.json", "/tmp/x/reviewed.json"]);
  assert.match(artifact.metrics.operator_overturn_rate, /1 reviewed verdict\(s\) applied/);
  assert.match(artifact.metrics.operator_overturn_rate, /1 reviewed entr\(y\/ies\).*REFUSED/);
});

test("CLI end-to-end: a run writes a VALID run artifact into --harness-runs-dir, never the repo default", () => {
  const dir = mkdtempSync(join(tmpdir(), "screen-worklist-emission-test-"));
  const inputPath = join(dir, "census.json");
  const harnessRunsDir = join(dir, "harness-runs-screen");
  writeFileSync(inputPath, JSON.stringify({ rows: [AMBIGUOUS_ROW, ON_ROW] }), "utf8");

  execFileSync(
    process.execPath,
    [WORKLIST_SCRIPT, "--input", inputPath, "--out-dir", dir, "--out-basename", "run1", "--harness-runs-dir", harnessRunsDir],
    { encoding: "utf8" },
  );

  const { runs, invalid } = readRunHistory(harnessRunsDir);
  assert.deepEqual(invalid, []);
  assert.equal(runs.length, 1);
  const artifact = runs[0];
  assert.equal(artifact.run_id, "screen-run-001");
  assert.equal(artifact.harness_family, "screen");
  assert.match(artifact.harness_version, /^sha256:[0-9a-f]{16}$/);
  assert.ok(artifact.full_trace_refs.some((p) => p.endsWith("run1.screen-results.json")));
  assert.deepEqual(validateRunArtifact(artifact), []);

  // A SECOND run against the same --harness-runs-dir numbers itself screen-run-002, never overwrites —
  // the exact screen-v1-loss failure mode CONVENTION.md documents; this is screen-worklist.mjs's own
  // proof it no longer repeats it.
  execFileSync(
    process.execPath,
    [WORKLIST_SCRIPT, "--input", inputPath, "--out-dir", dir, "--out-basename", "run2", "--harness-runs-dir", harnessRunsDir],
    { encoding: "utf8" },
  );
  const second = readRunHistory(harnessRunsDir);
  assert.equal(second.runs.length, 2);
  assert.deepEqual(second.runs.map((r) => r.run_id).sort(), ["screen-run-001", "screen-run-002"]);

  rmSync(dir, { recursive: true, force: true });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════
// WAVE M-SCREEN-3 (2026-08-31) — real reviewed-verdicts.json coverage: the named record (Directive 92/106/
// EEC, operator ruling, verbatim rationale) plus the M-SCREEN-3-mechanism-test sweep of reviewed off_vertical
// rows squarely inside the operator's 8 rationales or the mechanism test. Reads the REAL file (not a
// synthetic fixture) so a future edit to it that drops one of these entries fails a test, not just a report.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════
const REVIEWED_VERDICTS_PATH = join(HERE, "reviewed-verdicts.json");

test("WAVE M-SCREEN-3: the named record (04f3ffcf, Directive 92/106/EEC Combined Transport) is on_vertical, reviewer operator-ruling-2026-08-31, rationale verbatim", () => {
  const reviewed = loadReviewed(REVIEWED_VERDICTS_PATH);
  const entry = reviewed["04f3ffcf-7341-4fd2-84ff-3e761102b5a2"];
  assert.ok(entry, "named record must exist in reviewed-verdicts.json");
  assert.equal(entry.verdict, "on_vertical");
  assert.equal(entry.reviewer, "operator-ruling-2026-08-31");
  assert.ok(
    entry.reason.includes("primary EU framework incentivizing modal shift from trucking to rail/inland waterways"),
    `rationale must be recorded verbatim; got: ${entry.reason}`,
  );
});

test("WAVE M-SCREEN-3: exactly 13 reviewed rows were flipped by the mechanism-test sweep (reviewer M-SCREEN-3-mechanism-test), all on_vertical", () => {
  const reviewed = loadReviewed(REVIEWED_VERDICTS_PATH);
  const sweep = Object.entries(reviewed).filter(([, v]) => v.reviewer === "M-SCREEN-3-mechanism-test");
  assert.equal(sweep.length, 13, `expected 13 sweep flips, got ${sweep.length}`);
  for (const [id, entry] of sweep) {
    assert.equal(entry.verdict, "on_vertical", `sweep entry ${id} must be on_vertical`);
    assert.ok(entry.reason && entry.reason.length > 0, `sweep entry ${id} must carry a non-empty rationale`);
  }
});

test("WAVE M-SCREEN-3: the operator's worked example 0278fa64 (HGV infrastructure-charging amendment regs) is on_vertical in the real reviewed-verdicts.json", () => {
  const reviewed = loadReviewed(REVIEWED_VERDICTS_PATH);
  const entry = reviewed["0278fa64-a0b7-4529-a1ea-5c448efab8af"];
  assert.ok(entry, "operator's worked-example row must exist in reviewed-verdicts.json");
  assert.equal(entry.verdict, "on_vertical");
});

test("WAVE M-SCREEN-3 + ruling 2026-09-02: reviewed-verdicts.json off_vertical count is 830 - 14 (M-SCREEN-3) - 6 (TEN-T 2024/1679, CEF entries, TEN-T coordinator, 2020/349 aerodynamic devices flipped on_vertical by the operator, 2026-09-02)", () => {
  const reviewed = loadReviewed(REVIEWED_VERDICTS_PATH);
  const counts = { on_vertical: 0, off_vertical: 0, ambiguous: 0 };
  for (const v of Object.values(reviewed)) counts[v.verdict] = (counts[v.verdict] ?? 0) + 1;
  assert.equal(counts.off_vertical, 830 - 14 - 6);
  assert.equal(counts.on_vertical, 660 + 14 + 6);
  assert.equal(counts.ambiguous, 256, "ambiguous count must be untouched by this wave's reviewed-file edits");
});
