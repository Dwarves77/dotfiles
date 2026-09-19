// write-run-artifact.test.mjs -- unit tests for the pure summary-collection and artifact-building
// functions behind maintenance.yml's own harness-run artifact writer. Lane M9b, 2026-09-18.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateRunArtifact } from "../lib/run-artifact.mjs";
import { collectStepSummaries, buildArtifact } from "./write-run-artifact.mjs";

test("collectStepSummaries: returns {} for a null or missing out-root (never throws)", () => {
  assert.deepEqual(collectStepSummaries(null), {});
  assert.deepEqual(collectStepSummaries("/does/not/exist/anywhere"), {});
});

test("collectStepSummaries: reads one summary.json per step directory", () => {
  const dir = mkdtempSync(join(tmpdir(), "write-run-artifact-test-"));
  mkdirSync(join(dir, "tier-opinions"));
  writeFileSync(join(dir, "tier-opinions", "summary.json"), JSON.stringify({ step: "tier-opinions", mode: "dry", counts: { opinions: 3 } }));
  mkdirSync(join(dir, "w1-dispositions"));
  writeFileSync(join(dir, "w1-dispositions", "summary.json"), JSON.stringify({ step: "w1-dispositions", mode: "dry", exitCode: 1 }));
  // a directory with no summary.json is skipped, not an error
  mkdirSync(join(dir, "screen-worklist"));

  const byStep = collectStepSummaries(dir);
  assert.deepEqual(Object.keys(byStep).sort(), ["tier-opinions", "w1-dispositions"]);
  assert.equal(byStep["tier-opinions"].counts.opinions, 3);
  assert.equal(byStep["w1-dispositions"].exitCode, 1);

  rmSync(dir, { recursive: true, force: true });
});

test("collectStepSummaries: an unparseable summary.json is recorded, never crashes the scan", () => {
  const dir = mkdtempSync(join(tmpdir(), "write-run-artifact-test-"));
  mkdirSync(join(dir, "migration-299-precheck"));
  writeFileSync(join(dir, "migration-299-precheck", "summary.json"), "{not valid json");

  const byStep = collectStepSummaries(dir);
  assert.ok(byStep["migration-299-precheck"].parse_error, "parse_error is recorded on the entry");

  rmSync(dir, { recursive: true, force: true });
});

test("buildArtifact: a named-step dispatch produces a valid CONVENTION.md artifact", () => {
  const artifact = buildArtifact({
    step: "tier-opinions",
    mode: "dry",
    arg: "",
    runId: "maintenance-run-001",
    harnessVersion: "sha256:aaaaaaaaaaaaaaaa",
    startedAt: "2026-09-18T00:00:00Z",
    byStep: { "tier-opinions": { step: "tier-opinions", mode: "dry", counts: { opinions: 3 } } },
    tracePath: "scripts/harness-runs/maintenance/traces/maintenance-run-001.summaries.json",
  });
  const errors = validateRunArtifact(artifact);
  assert.deepEqual(errors, []);
  assert.equal(artifact.config.step, "tier-opinions");
  assert.equal(artifact.metrics.steps_dispatched, 1);
  assert.equal(artifact.per_item.length, 1);
  assert.equal(artifact.per_item[0].outcome, "ran");
});

test("buildArtifact: step=all with a mix of clean and nonzero-exit steps counts both", () => {
  const artifact = buildArtifact({
    step: "all",
    mode: "dry",
    arg: "",
    runId: "maintenance-run-002",
    harnessVersion: "sha256:bbbbbbbbbbbbbbbb",
    startedAt: "2026-09-18T00:00:00Z",
    byStep: {
      "tier-opinions": { step: "tier-opinions", mode: "dry" },
      "w1-dispositions": { step: "w1-dispositions", mode: "dry", exitCode: 1 },
      "census-off-vertical": { parse_error: "SyntaxError: boom" },
    },
    tracePath: "scripts/harness-runs/maintenance/traces/maintenance-run-002.summaries.json",
  });
  const errors = validateRunArtifact(artifact);
  assert.deepEqual(errors, []);
  assert.equal(artifact.metrics.steps_dispatched, 3);
  assert.equal(artifact.metrics.steps_with_summary, 3);
  assert.equal(artifact.metrics.steps_nonzero_exit, 2, "the exit_1 step and the parse-error step both count");
  const byId = Object.fromEntries(artifact.per_item.map((p) => [p.id, p]));
  assert.equal(byId["tier-opinions"].outcome, "ran");
  assert.equal(byId["w1-dispositions"].outcome, "exit_1");
  assert.equal(byId["census-off-vertical"].outcome, "summary_parse_error");
  assert.equal(byId["census-off-vertical"].error, "SyntaxError: boom");
});

test("buildArtifact: zero summaries (every step skipped) still produces a valid, honest artifact", () => {
  const artifact = buildArtifact({
    step: "review-apply-provisional-sources",
    mode: "dry",
    arg: "",
    runId: "maintenance-run-003",
    harnessVersion: "sha256:cccccccccccccccc",
    startedAt: "2026-09-18T00:00:00Z",
    byStep: {},
    tracePath: "scripts/harness-runs/maintenance/traces/maintenance-run-003.summaries.json",
  });
  const errors = validateRunArtifact(artifact);
  assert.deepEqual(errors, []);
  assert.equal(artifact.per_item.length, 0);
  assert.match(artifact.proposer_notes, /No step wrote a summary\.json/);
});
