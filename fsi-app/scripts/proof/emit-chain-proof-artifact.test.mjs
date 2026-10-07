/** Tests for scripts/proof/emit-chain-proof-artifact.mjs (lane PROOF-1). Fixture inputs only. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateRunArtifact, readRunHistory } from "../lib/run-artifact.mjs";
import { readInputs, buildArtifact, summaryMarkdown, emit } from "./emit-chain-proof-artifact.mjs";

const REPLAY = {
  ok: false, planned: 5, applied: 3, failed: 1, tolerated: 0, skipped: 1, not_in_inventory: ["011_x.sql"], skipped_not_applied: ["007_y.sql"], applied_without_file: [],
  post_checks: [{ name: "harness_runs table exists", ok: false }], post_info: { public_tables: 100 },
  files: [{ file: "006_b.sql", status: "failed", error: { line: 4, message: 'relation "t" does not exist' } }, { file: "001_a.sql", status: "applied" }],
};
const STEPS = [
  { step: "export-subset", lane: "PROOF-2", status: "skipped", reason: "x is absent: lane PROOF-2 has not landed", exit_code: null, seconds: 0 },
  { step: "chain", lane: "PROOF-3", status: "failed", reason: "exited 3", exit_code: 3, seconds: 12.5 },
];

function withTmp(fn) {
  const dir = mkdtempSync(join(tmpdir(), "chain-proof-emit-"));
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

const base = { runId: "chain-proof-run-001", harnessVersion: "v", startedAt: "2026-10-07T00:00:00Z", loopRunId: "123" };

test("buildArtifact: counts, one defect per failed file, failed post check and failed step; validates", () => {
  const a = buildArtifact({ ...base, inputs: { replay: REPLAY, replayError: null, local: { count: 4 }, steps: STEPS } });
  assert.deepEqual(validateRunArtifact(a), []);
  assert.equal(a.metrics.replay_applied, 3);
  assert.equal(a.metrics.replay_failed, 1);
  assert.equal(a.metrics.replay_post_checks_failed, 1);
  assert.equal(a.metrics.steps_skipped, 1);
  assert.equal(a.metrics.steps_failed, 1);
  assert.equal(a.metrics.local_harness_runs, 4);
  assert.equal(a.defects_found.length, 3);
  assert.match(a.defects_found[0].description, /migration 006_b\.sql did not replay/);
  assert.equal(a.config.loop_run_id, "123");
  assert.equal(a.config.production_writes, false);
});

test("ATTACK: no replay report is recorded as report_missing with null counts, never as a clean run", () => {
  const a = buildArtifact({ ...base, inputs: { replay: null, replayError: "ENOENT", local: null, steps: [] } });
  assert.deepEqual(validateRunArtifact(a), []);
  assert.equal(a.metrics.replay_failed, null);
  assert.equal(a.per_item[0].outcome, "report_missing");
  assert.equal(a.defects_found[0].description, "chain proof produced no replay report");
});

test("a green replay with skipped later steps reads as ok with the skips named in the summary", () => {
  const green = { ...REPLAY, ok: true, failed: 0, post_checks: [{ name: "x", ok: true }], files: [] };
  const a = buildArtifact({ ...base, inputs: { replay: green, replayError: null, local: null, steps: [STEPS[0]] } });
  assert.equal(a.defects_found.length, 0);
  const md = summaryMarkdown(a);
  assert.match(md, /step:export-subset: skipped \(.*lane PROOF-2 has not landed\)/);
});

test("emit reads the output directory and writes a numbered, schema-valid artifact under it", () => {
  withTmp((dir) => {
    writeFileSync(join(dir, "replay-report.json"), JSON.stringify(REPLAY));
    writeFileSync(join(dir, "harness-runs-local.json"), JSON.stringify({ count: 2, runs: [] }));
    for (const s of STEPS) writeFileSync(join(dir, `step-${s.step}.json`), JSON.stringify(s));
    writeFileSync(join(dir, "notes.txt"), "ignored");
    const { outPath, artifact } = emit({ env: { CP_OUT_DIR: dir, CP_STARTED_AT: "2026-10-07T00:00:00Z", GITHUB_RUN_ID: "999" } });
    assert.match(outPath, /chain-proof-run-001\.json$/);
    assert.equal(artifact.harness_family, "chain-proof");
    assert.equal(artifact.config.loop_run_id, "999");
    assert.equal(artifact.metrics.local_harness_runs, 2);
    const { runs, invalid } = readRunHistory(join(dir, "artifact"));
    assert.equal(invalid.length, 0);
    assert.equal(runs.length, 1);
    assert.ok(!readFileSync(outPath, "utf8").includes("notes.txt"));
  });
});

test("readInputs tolerates a missing directory and unreadable files", () => {
  const r = readInputs("/nonexistent-dir-for-test");
  assert.equal(r.replay, null);
  assert.ok(r.replayError);
  assert.deepEqual(r.steps, []);
});

test("emit refuses without CP_OUT_DIR", () => {
  assert.throws(() => emit({ env: {} }), /CP_OUT_DIR/);
});
