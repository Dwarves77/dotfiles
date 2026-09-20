// Tests for emit-brief-export-artifact.mjs (lane M4, 2026-09-20, build plan section 6.1 row M4,
// Amendment 1 section C). node:test + node:assert/strict, node: builtins + relative imports only
// (portable, no-npm glob). Run: node --test scripts/turns/emit-brief-export-artifact.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateRunArtifact } from "../lib/run-artifact.mjs";
import { buildArtifact, parseIdsList } from "./emit-brief-export-artifact.mjs";
import { resolveLoopRunIdFromUpstream } from "../lib/loop-run-id.mjs";

function withTmpDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "brief-export-artifact-test-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("parseIdsList: blank or absent -> []", () => {
  assert.deepEqual(parseIdsList(""), []);
  assert.deepEqual(parseIdsList(undefined), []);
  assert.deepEqual(parseIdsList(null), []);
});

test("parseIdsList: a comma-separated list is trimmed and filtered", () => {
  assert.deepEqual(parseIdsList("aaa, bbb ,ccc"), ["aaa", "bbb", "ccc"]);
});

test("buildArtifact: zero ids resolved -> a no-op run, still validateRunArtifact-clean, non-empty full_trace_refs fallback", () => {
  const artifact = buildArtifact({
    runId: "brief-export-run-001",
    harnessVersion: "sha256:0000000000000000",
    startedAt: new Date().toISOString(),
    mode: "auto",
    selection: "record",
    limit: 50,
    upstreamName: "Population turn",
    upstreamRunId: "12345",
    ids: [],
    batchPath: null,
    branch: null,
  });
  assert.deepEqual(artifact.per_item, []);
  assert.equal(artifact.metrics.ids_resolved, 0);
  assert.equal(artifact.metrics.ids_exported, 0);
  assert.ok(artifact.full_trace_refs.length > 0, "full_trace_refs must be non-empty even on a zero-id run");
  assert.deepEqual(artifact.defects_found, []);
  assert.deepEqual(validateRunArtifact(artifact), []);
});

test("buildArtifact: ids resolved and a batch skeleton written -> per_item all 'exported', metrics match, clean", () => {
  const ids = ["aaaaaaaa-1111-1111-1111-111111111111", "bbbbbbbb-2222-2222-2222-222222222222"];
  const batchPath = "scripts/turns/record-briefs/batches/record-briefs-loop-99.json";
  const artifact = buildArtifact({
    runId: "brief-export-run-002",
    harnessVersion: "sha256:0000000000000000",
    startedAt: new Date().toISOString(),
    mode: "auto",
    selection: "record",
    limit: 50,
    upstreamName: "Population turn",
    upstreamRunId: "12345",
    ids,
    batchPath,
    branch: "brief-lane/99",
  });
  assert.equal(artifact.per_item.length, 2);
  assert.ok(artifact.per_item.every((p) => p.outcome === "exported"));
  assert.deepEqual(artifact.full_trace_refs, [batchPath]);
  assert.equal(artifact.metrics.ids_resolved, 2);
  assert.equal(artifact.metrics.ids_exported, 2);
  assert.equal(artifact.config.batch_path, batchPath);
  assert.equal(artifact.config.branch, "brief-lane/99");
  assert.deepEqual(artifact.defects_found, []);
  assert.deepEqual(validateRunArtifact(artifact), []);
});

test("buildArtifact: ids resolved but no batch skeleton written -> a defect is recorded naming the gap", () => {
  const artifact = buildArtifact({
    runId: "brief-export-run-003",
    harnessVersion: "sha256:0000000000000000",
    startedAt: new Date().toISOString(),
    mode: "explicit",
    selection: "explicit",
    limit: 5,
    upstreamName: null,
    upstreamRunId: null,
    ids: ["cccccccc-3333-3333-3333-333333333333"],
    batchPath: null,
    branch: null,
  });
  assert.equal(artifact.per_item[0].outcome, "not_exported");
  assert.equal(artifact.defects_found.length, 1);
  assert.match(artifact.defects_found[0].description, /1 id\(s\) resolved/);
  assert.deepEqual(validateRunArtifact(artifact), []);
});

test("buildArtifact: loopRunId defaults to null when the caller passes nothing", () => {
  const artifact = buildArtifact({
    runId: "brief-export-run-004",
    harnessVersion: "sha256:0000000000000000",
    startedAt: new Date().toISOString(),
    mode: "auto",
    selection: "record",
    limit: 50,
    upstreamName: "Population turn",
    upstreamRunId: "12345",
    ids: [],
    batchPath: null,
    branch: null,
  });
  assert.equal(artifact.config.loop_run_id, null);
});

test("buildArtifact: a loopRunId passed by the caller is recorded verbatim on config.loop_run_id", () => {
  const artifact = buildArtifact({
    runId: "brief-export-run-005",
    harnessVersion: "sha256:0000000000000000",
    startedAt: new Date().toISOString(),
    mode: "auto",
    selection: "record",
    limit: 50,
    upstreamName: "Population turn",
    upstreamRunId: "12345",
    ids: [],
    batchPath: null,
    branch: null,
    loopRunId: "loop-run-abc-123",
  });
  assert.equal(artifact.config.loop_run_id, "loop-run-abc-123");
  assert.deepEqual(validateRunArtifact(artifact), []);
});

test("resolveLoopRunIdFromUpstream fixture: an upstream mint artifact with a matching github_run_id resolves its own loop_run_id; a different run id resolves null", () => {
  withTmpDir((fsiRoot) => {
    const mintDir = join(fsiRoot, "scripts", "harness-runs", "mint");
    mkdirSync(mintDir, { recursive: true });
    writeFileSync(
      join(mintDir, "mint-run-001.json"),
      JSON.stringify({
        harness_family: "mint",
        harness_version: "sha256:0000000000000000",
        run_id: "mint-run-001",
        started_at: new Date().toISOString(),
        config: { github_run_id: "111", loop_run_id: "loop-x" },
        inputs_ref: ["x"],
        per_item: [],
        metrics: {},
        defects_found: [],
        full_trace_refs: ["x"],
        proposer_notes: "test fixture",
      }, null, 2) + "\n",
      "utf8"
    );

    const matched = resolveLoopRunIdFromUpstream({
      explicit: null,
      upstreamName: "Population turn",
      upstreamRunId: "111",
      fsiRoot,
    });
    assert.equal(matched, "loop-x");

    const unmatched = resolveLoopRunIdFromUpstream({
      explicit: null,
      upstreamName: "Population turn",
      upstreamRunId: "999",
      fsiRoot,
    });
    assert.equal(unmatched, null);
  });
});
