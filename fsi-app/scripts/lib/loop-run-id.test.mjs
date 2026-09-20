// Tests for loop-run-id.mjs (lane M3, 2026-09-19; rewritten for Amendment 2's config.github_run_id
// match). node:test + node:assert/strict, node: builtins + relative imports only (portable, no-npm
// glob). Run: node --test scripts/lib/loop-run-id.test.mjs
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

/** Write one minimal valid run artifact of `family`, with an arbitrary `config` object. */
function writeArtifact(dir, family, runNum, config) {
  const runId = `${family}-run-${String(runNum).padStart(3, "0")}`;
  const artifact = {
    harness_family: family,
    harness_version: "sha256:0000000000000000",
    run_id: runId,
    started_at: new Date().toISOString(),
    config,
    inputs_ref: ["x"],
    per_item: [],
    metrics: {},
    defects_found: [],
    full_trace_refs: ["x"],
    proposer_notes: "test fixture",
  };
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${runId}.json`), JSON.stringify(artifact, null, 2) + "\n", "utf8");
}

test("resolveLoopRunId: explicit always wins, even when it would not match any artifact", () => {
  withTmpDir((dir) => {
    writeArtifact(dir, "source-sweep", 1, { github_run_id: "12345", loop_run_id: "12345" });
    const got = resolveLoopRunId({
      explicit: "custom-loop-id",
      upstreamFamily: "source-sweep",
      upstreamRunId: "12345",
      harnessRunsDir: dir,
    });
    assert.equal(got, "custom-loop-id");
  });
});

test("resolveLoopRunId: matches by config.github_run_id (never config.loop_run_id) and returns that artifact's own loop_run_id", () => {
  withTmpDir((dir) => {
    // The sweep carries an EXPLICIT loop_run_id different from its own run id -- Amendment 2's own
    // worked example (the proof run passes --loop-run-id, so github_run_id != loop_run_id).
    writeArtifact(dir, "source-sweep", 1, { github_run_id: "1001", loop_run_id: "explicit-loop-id-99" });
    const got = resolveLoopRunId({
      explicit: null,
      upstreamFamily: "source-sweep",
      upstreamRunId: "1001",
      harnessRunsDir: dir,
    });
    assert.equal(got, "explicit-loop-id-99");
  });
});

test("resolveLoopRunId: a matching config.loop_run_id with a DIFFERENT config.github_run_id never matches (the retired Amendment 1 mechanism)", () => {
  withTmpDir((dir) => {
    writeArtifact(dir, "source-sweep", 1, { github_run_id: "9999", loop_run_id: "1001" });
    const got = resolveLoopRunId({
      explicit: null,
      upstreamFamily: "source-sweep",
      upstreamRunId: "1001",
      harnessRunsDir: dir,
    });
    assert.equal(got, null);
  });
});

test("resolveLoopRunId: no matching artifact -- returns null (never invents an id)", () => {
  withTmpDir((dir) => {
    writeArtifact(dir, "source-sweep", 1, { github_run_id: "11111", loop_run_id: "11111" });
    const got = resolveLoopRunId({
      explicit: "",
      upstreamFamily: "source-sweep",
      upstreamRunId: "99999",
      harnessRunsDir: dir,
    });
    assert.equal(got, null);
  });
});

test("resolveLoopRunId: a matched artifact with no loop_run_id field at all -- null, not a crash", () => {
  withTmpDir((dir) => {
    writeArtifact(dir, "source-sweep", 1, { github_run_id: "12345", walker: "sitemap" });
    const got = resolveLoopRunId({
      explicit: undefined,
      upstreamFamily: "source-sweep",
      upstreamRunId: "12345",
      harnessRunsDir: dir,
    });
    assert.equal(got, null);
  });
});

test("resolveLoopRunId: an artifact written outside GitHub Actions (github_run_id: null) never matches", () => {
  withTmpDir((dir) => {
    writeArtifact(dir, "source-sweep", 1, { github_run_id: null, loop_run_id: "some-loop-id" });
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
    writeArtifact(dir, "source-sweep", 1, { github_run_id: "11111", loop_run_id: "11111" });
    const got = resolveLoopRunId({
      explicit: undefined,
      upstreamFamily: "source-sweep",
      upstreamRunId: undefined,
      harnessRunsDir: dir,
    });
    assert.equal(got, null);
  });
});

// ── attack form (rule 15): a four-hop chain, matched hop to hop, then one hop's github_run_id is
// broken and the next hop resolves null. This is the mechanical proof that the fix generalizes past
// hop 1, the exact gap Amendment 2 closes. ─────────────────────────────────────────────────────────

test("resolveLoopRunId ATTACK: a four-hop chain resolves hop to hop to the sweep's own explicit loop id, distinct from every hop's own run id", () => {
  withTmpDir((base) => {
    const sweepDir = join(base, "source-sweep");
    const fetchDrainDir = join(base, "fetch-drain");
    const ledgerConsumeDir = join(base, "ledger-consume");
    const mintDir = join(base, "mint");

    // Hop 1: source-sweep, an operator-supplied explicit loop id, different from its own run id.
    writeArtifact(sweepDir, "source-sweep", 1, { github_run_id: "1001", loop_run_id: "explicit-loop-id-99" });

    // Hop 2: fetch-drain, resolving off hop 1, propagating the SAME loop id forward, on its OWN run id.
    const hop2LoopId = resolveLoopRunId({
      explicit: null,
      upstreamFamily: "source-sweep",
      upstreamRunId: "1001",
      harnessRunsDir: sweepDir,
    });
    writeArtifact(fetchDrainDir, "fetch-drain", 1, { github_run_id: "2002", loop_run_id: hop2LoopId });

    // Hop 3: ledger-consume, resolving off hop 2.
    const hop3LoopId = resolveLoopRunId({
      explicit: null,
      upstreamFamily: "fetch-drain",
      upstreamRunId: "2002",
      harnessRunsDir: fetchDrainDir,
    });
    writeArtifact(ledgerConsumeDir, "ledger-consume", 1, { github_run_id: "3003", loop_run_id: hop3LoopId });

    // Hop 4: mint, resolving off hop 3.
    const hop4LoopId = resolveLoopRunId({
      explicit: null,
      upstreamFamily: "ledger-consume",
      upstreamRunId: "3003",
      harnessRunsDir: ledgerConsumeDir,
    });
    writeArtifact(mintDir, "mint", 1, { github_run_id: "4004", loop_run_id: hop4LoopId });

    assert.equal(hop2LoopId, "explicit-loop-id-99");
    assert.equal(hop3LoopId, "explicit-loop-id-99");
    assert.equal(hop4LoopId, "explicit-loop-id-99");
  });
});

test("resolveLoopRunId ATTACK: breaking one hop's github_run_id makes the NEXT hop resolve null, cascading (never a stale/invented id)", () => {
  withTmpDir((base) => {
    const sweepDir = join(base, "source-sweep");
    const fetchDrainDir = join(base, "fetch-drain");
    const ledgerConsumeDir = join(base, "ledger-consume");

    writeArtifact(sweepDir, "source-sweep", 1, { github_run_id: "1001", loop_run_id: "explicit-loop-id-99" });

    const hop2LoopId = resolveLoopRunId({
      explicit: null,
      upstreamFamily: "source-sweep",
      upstreamRunId: "1001",
      harnessRunsDir: sweepDir,
    });
    // Corrupt hop 2's own recorded github_run_id (simulating a run whose artifact does not carry the id
    // hop 3's own workflow_run event actually names) -- write "9999" instead of "2002".
    writeArtifact(fetchDrainDir, "fetch-drain", 1, { github_run_id: "9999", loop_run_id: hop2LoopId });

    // Hop 3 asks for the artifact matching run id "2002" (what its own workflow_run event names) -- no
    // such artifact exists any more, so this resolves null, never falling back to hop 2's stale value.
    const hop3LoopId = resolveLoopRunId({
      explicit: null,
      upstreamFamily: "fetch-drain",
      upstreamRunId: "2002",
      harnessRunsDir: fetchDrainDir,
    });
    assert.equal(hop3LoopId, null);
    writeArtifact(ledgerConsumeDir, "ledger-consume", 1, { github_run_id: "3003", loop_run_id: hop3LoopId });

    // Hop 4 finds hop 3's artifact fine (its OWN github_run_id, "3003", is intact) but that artifact's
    // own loop_run_id is null (cascaded from the break above) -- hop 4 also resolves null, never
    // inventing a replacement id.
    const hop4LoopId = resolveLoopRunId({
      explicit: null,
      upstreamFamily: "ledger-consume",
      upstreamRunId: "3003",
      harnessRunsDir: ledgerConsumeDir,
    });
    assert.equal(hop4LoopId, null);
  });
});
