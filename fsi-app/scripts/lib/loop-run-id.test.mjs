// Tests for loop-run-id.mjs (lane M3, 2026-09-19). node:test + node:assert/strict, node: builtins +
// relative imports only (portable, no-npm glob). Run: node --test scripts/lib/loop-run-id.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveLoopRunId } from "./loop-run-id.mjs";

function withTmpDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "loop-run-id-test-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Write one minimal valid source-sweep-family run artifact carrying a given config.loop_run_id. */
function writeSweepArtifact(dir, runNum, loopRunId) {
  const runId = `source-sweep-run-${String(runNum).padStart(3, "0")}`;
  const artifact = {
    harness_family: "source-sweep",
    harness_version: "sha256:0000000000000000",
    run_id: runId,
    started_at: new Date().toISOString(),
    config: { loop_run_id: loopRunId },
    inputs_ref: ["x"],
    per_item: [],
    metrics: {},
    defects_found: [],
    full_trace_refs: ["x"],
    proposer_notes: "test fixture",
  };
  writeFileSync(join(dir, `${runId}.json`), JSON.stringify(artifact, null, 2) + "\n", "utf8");
}

test("resolveLoopRunId: explicit always wins, even when it would not match any artifact", () => {
  withTmpDir((dir) => {
    writeSweepArtifact(dir, 1, "12345");
    const got = resolveLoopRunId({
      explicit: "custom-loop-id",
      upstreamFamily: "source-sweep",
      upstreamRunId: "12345",
      harnessRunsDir: dir,
    });
    assert.equal(got, "custom-loop-id");
  });
});

test("resolveLoopRunId: no explicit value -- finds the artifact whose config.loop_run_id equals upstreamRunId and returns it", () => {
  withTmpDir((dir) => {
    writeSweepArtifact(dir, 1, "11111");
    writeSweepArtifact(dir, 2, "22222");
    const got = resolveLoopRunId({
      explicit: null,
      upstreamFamily: "source-sweep",
      upstreamRunId: "22222",
      harnessRunsDir: dir,
    });
    assert.equal(got, "22222");
  });
});

test("resolveLoopRunId: no matching artifact -- returns null (never invents an id)", () => {
  withTmpDir((dir) => {
    writeSweepArtifact(dir, 1, "11111");
    const got = resolveLoopRunId({
      explicit: "",
      upstreamFamily: "source-sweep",
      upstreamRunId: "99999",
      harnessRunsDir: dir,
    });
    assert.equal(got, null);
  });
});

test("resolveLoopRunId: an artifact without config.loop_run_id (a run predating lane M1) never matches -- null, not a crash", () => {
  withTmpDir((dir) => {
    mkdirSync(dir, { recursive: true });
    const runId = "source-sweep-run-001";
    const artifact = {
      harness_family: "source-sweep",
      harness_version: "sha256:0000000000000000",
      run_id: runId,
      started_at: new Date().toISOString(),
      config: { walker: "sitemap" }, // no loop_run_id field at all -- pre-lane-M1 shape
      inputs_ref: ["x"],
      per_item: [],
      metrics: {},
      defects_found: [],
      full_trace_refs: ["x"],
      proposer_notes: "test fixture",
    };
    writeFileSync(join(dir, `${runId}.json`), JSON.stringify(artifact, null, 2) + "\n", "utf8");
    const got = resolveLoopRunId({
      explicit: undefined,
      upstreamFamily: "source-sweep",
      upstreamRunId: "12345",
      harnessRunsDir: dir,
    });
    assert.equal(got, null);
  });
});

test("resolveLoopRunId: no upstreamRunId given at all (e.g. a bare workflow_dispatch with no upstream) -- null, no match attempted", () => {
  withTmpDir((dir) => {
    writeSweepArtifact(dir, 1, "11111");
    const got = resolveLoopRunId({
      explicit: undefined,
      upstreamFamily: "source-sweep",
      upstreamRunId: undefined,
      harnessRunsDir: dir,
    });
    assert.equal(got, null);
  });
});
