// Tests for run-mint-batch.mjs — the mint family's canonical, self-emitting entry point (Wave MH-5).
// node:test + node:assert/strict, no npm deps, same discipline as validate-mint-payload.test.mjs and
// screen-worklist.test.mjs in this directory.
//
// Two tiers:
//   (1) pure-function unit tests (loadBatch, payloadId, runBatch, buildRunArtifact, outcomes enrichment)
//   (2) subprocess integration tests driving the real CLI end to end — this is where "artifact written
//       on success" / "artifact written on thrown failure" / "schema matches what F28 validates" are
//       proven against the ACTUAL script, not a mock of it.
//
// Run: node --test scripts/mint/run-mint-batch.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync, readdirSync, existsSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadBatch,
  payloadId,
  runBatch,
  buildRunArtifact,
  enrichRunArtifactMetrics,
  loadOutcomes,
  MINT_GOVERNING_FILES,
} from "./run-mint-batch.mjs";
import { validateRunArtifact } from "../lib/run-artifact.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNNER_PATH = join(HERE, "run-mint-batch.mjs");
const EXAMPLE_PAYLOAD = JSON.parse(readFileSync(join(HERE, "example-payload.json"), "utf8"));

function tmpDir() {
  return mkdtempSync(join(tmpdir(), "run-mint-batch-test-"));
}

function invalidPayload() {
  // Clone + break criterion 6 (missing full_brief) — a cheap, deterministic way to get a real, kit-shaped
  // INVALID payload without hand-authoring one from scratch.
  const clone = JSON.parse(JSON.stringify(EXAMPLE_PAYLOAD));
  clone.item.full_brief = "";
  return clone;
}

// ── loadBatch ────────────────────────────────────────────────────────────────────────────────────

test("loadBatch: accepts a bare JSON array of payloads", () => {
  const dir = tmpDir();
  try {
    const path = join(dir, "batch.json");
    writeFileSync(path, JSON.stringify([EXAMPLE_PAYLOAD]));
    assert.deepEqual(loadBatch(path), [EXAMPLE_PAYLOAD]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadBatch: accepts { "payloads": [...] }', () => {
  const dir = tmpDir();
  try {
    const path = join(dir, "batch.json");
    writeFileSync(path, JSON.stringify({ payloads: [EXAMPLE_PAYLOAD] }));
    assert.deepEqual(loadBatch(path), [EXAMPLE_PAYLOAD]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadBatch RED: neither shape throws a named usage error", () => {
  const dir = tmpDir();
  try {
    const path = join(dir, "batch.json");
    writeFileSync(path, JSON.stringify({ not_payloads: [] }));
    assert.throws(() => loadBatch(path), /must be a JSON array of payloads/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── payloadId ────────────────────────────────────────────────────────────────────────────────────

test("payloadId: prefers item.canonical_instrument_key", () => {
  assert.equal(payloadId(EXAMPLE_PAYLOAD, 0), EXAMPLE_PAYLOAD.item.canonical_instrument_key);
});

test("payloadId: falls back to a positional label when nothing identifies the payload", () => {
  assert.equal(payloadId({}, 3), "batch-index-3");
});

// ── runBatch: pure, drives the family's REAL validateMintPayload gate ─────────────────────────────

test("runBatch: a batch of one valid payload — apply_ready outcome, 100% validator_first_pass_rate", () => {
  const result = runBatch([EXAMPLE_PAYLOAD], { baseDir: HERE });
  assert.equal(result.metrics.attempted, 1);
  assert.equal(result.metrics.valid, 1);
  assert.equal(result.metrics.invalid, 0);
  assert.equal(result.metrics.validator_first_pass_rate, "1/1 = 100.00%");
  assert.equal(result.perItem.length, 1);
  assert.equal(result.perItem[0].outcome, "apply_ready");
  assert.equal(result.perItem[0].error, null);
  assert.deepEqual(result.applyReady, [EXAMPLE_PAYLOAD]);
});

test("runBatch: an invalid payload is reported, not silently dropped or falsely marked apply_ready", () => {
  const bad = invalidPayload();
  const result = runBatch([bad], { baseDir: HERE });
  assert.equal(result.metrics.valid, 0);
  assert.equal(result.metrics.invalid, 1);
  assert.equal(result.perItem[0].outcome, "validation_failed");
  assert.ok(result.perItem[0].error.length > 0);
  assert.deepEqual(result.applyReady, []);
});

test("runBatch: mixed batch — counts and applyReady reflect exactly the valid subset, in order", () => {
  const good2 = JSON.parse(JSON.stringify(EXAMPLE_PAYLOAD));
  good2.id = "second-good";
  const result = runBatch([EXAMPLE_PAYLOAD, invalidPayload(), good2], { baseDir: HERE });
  assert.equal(result.metrics.attempted, 3);
  assert.equal(result.metrics.valid, 2);
  assert.equal(result.metrics.invalid, 1);
  assert.deepEqual(
    result.applyReady.map((p) => p.id ?? p.item.canonical_instrument_key),
    [EXAMPLE_PAYLOAD.item.canonical_instrument_key, "second-good"],
  );
});

test("runBatch: an empty batch is a legitimate (if useless) run — no crash, honest zero-division-free rate", () => {
  const result = runBatch([], { baseDir: HERE });
  assert.equal(result.metrics.attempted, 0);
  assert.equal(result.metrics.validator_first_pass_rate, "0/0 (empty batch)");
  assert.deepEqual(result.perItem, []);
});

// ── buildRunArtifact: shape + schema ────────────────────────────────────────────────────────────

test("buildRunArtifact: a successful run's artifact validates against CONVENTION.md's schema (validateRunArtifact — what F28 checks)", () => {
  const result = runBatch([EXAMPLE_PAYLOAD], { baseDir: HERE });
  const artifact = buildRunArtifact({
    runId: "mint-run-001",
    harnessVersion: "sha256:aaaaaaaaaaaaaaaa",
    startedAt: "2026-09-01T00:00:00Z",
    finishedAt: "2026-09-01T00:00:05Z",
    batchPath: "/tmp/batch.json",
    outDir: "/tmp/out",
    execute: true,
    result,
    runError: null,
    applyReadyPath: "/tmp/out/batch.apply-ready.json",
    reportPath: "/tmp/out/batch.mint-batch-report.json",
  });
  assert.deepEqual(validateRunArtifact(artifact), []);
  assert.equal(artifact.harness_family, "mint");
  assert.equal(artifact.defects_found.length, 0);
  assert.ok(artifact.full_trace_refs.includes("/tmp/batch.json"));
});

test("buildRunArtifact: a thrown-failure run still produces a SCHEMA-VALID artifact — full_trace_refs falls back to the batch path, defects_found records the error", () => {
  const artifact = buildRunArtifact({
    runId: "mint-run-002",
    harnessVersion: "sha256:aaaaaaaaaaaaaaaa",
    startedAt: "2026-09-01T00:00:00Z",
    finishedAt: "2026-09-01T00:00:01Z",
    batchPath: "/tmp/bad-batch.json",
    outDir: "/tmp/out",
    execute: true,
    result: null,
    runError: new Error("--batch-file must be a JSON array of payloads; got object"),
    applyReadyPath: null,
    reportPath: null,
  });
  assert.deepEqual(validateRunArtifact(artifact), []);
  assert.deepEqual(artifact.per_item, []);
  assert.deepEqual(artifact.metrics, {});
  assert.equal(artifact.defects_found.length, 1);
  assert.match(artifact.defects_found[0].description, /threw during an --execute run/);
  assert.equal(artifact.defects_found[0].fix_ref, null);
  assert.deepEqual(artifact.full_trace_refs, ["/tmp/bad-batch.json"]);
});

// ── enrichRunArtifactMetrics / loadOutcomes (Interface-3 metrics) ─────────────────────────────────

test("enrichRunArtifactMetrics: merges new keys into metrics without touching any other field, never mutates the input", () => {
  const original = {
    harness_family: "mint",
    metrics: { attempted: 5, valid: 5 },
    proposer_notes: "unchanged",
  };
  const enriched = enrichRunArtifactMetrics(original, { edges_discovered: 12, isolated_items: 2 });
  assert.deepEqual(enriched.metrics, { attempted: 5, valid: 5, edges_discovered: 12, isolated_items: 2 });
  assert.equal(enriched.proposer_notes, "unchanged");
  assert.deepEqual(original.metrics, { attempted: 5, valid: 5 }, "must not mutate the original artifact");
});

test("enrichRunArtifactMetrics: an existing metrics key is overwritten by the patch, not duplicated or ignored", () => {
  const enriched = enrichRunArtifactMetrics({ metrics: { isolated_items: 99 } }, { isolated_items: 3 });
  assert.equal(enriched.metrics.isolated_items, 3);
});

test("loadOutcomes: a flat outcomes file (run_id + bare keys) becomes { runId, patch }", () => {
  const dir = tmpDir();
  try {
    const path = join(dir, "outcomes.json");
    writeFileSync(path, JSON.stringify({ run_id: "mint-run-005", edges_discovered: 7, forward_events_extracted: 2 }));
    const { runId, patch } = loadOutcomes(path);
    assert.equal(runId, "mint-run-005");
    assert.deepEqual(patch, { edges_discovered: 7, forward_events_extracted: 2 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadOutcomes: a nested { "metrics": {...} } shape is used as the patch directly, run_id optional', () => {
  const dir = tmpDir();
  try {
    const path = join(dir, "outcomes.json");
    writeFileSync(path, JSON.stringify({ metrics: { isolated_items: 4 } }));
    const { runId, patch } = loadOutcomes(path);
    assert.equal(runId, null);
    assert.deepEqual(patch, { isolated_items: 4 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── subprocess integration: the real CLI, end to end ────────────────────────────────────────────

function run(args, opts = {}) {
  try {
    const stdout = execFileSync(process.execPath, [RUNNER_PATH, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      ...opts,
    });
    return { status: 0, stdout };
  } catch (err) {
    return { status: err.status, stdout: err.stdout, stderr: err.stderr };
  }
}

test("CLI: --dry-run (the default, no --execute) writes NOTHING to disk — no output files, no run artifact", () => {
  const dir = tmpDir();
  try {
    const batchPath = join(dir, "batch.json");
    writeFileSync(batchPath, JSON.stringify([EXAMPLE_PAYLOAD]));
    const harnessRunsDir = join(dir, "harness-runs", "mint");
    const res = run(["--batch-file", batchPath, "--harness-runs-dir", harnessRunsDir]);
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /\[dry-run\]/);
    assert.equal(existsSync(harnessRunsDir), false, "dry-run must not create the harness-runs directory");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI --execute: artifact written on SUCCESS — a valid batch produces mint-run-001.json that validates against CONVENTION.md's schema", () => {
  const dir = tmpDir();
  try {
    const batchPath = join(dir, "batch.json");
    writeFileSync(batchPath, JSON.stringify([EXAMPLE_PAYLOAD]));
    const harnessRunsDir = join(dir, "harness-runs", "mint");
    const res = run(["--batch-file", batchPath, "--execute", "--harness-runs-dir", harnessRunsDir, "--out-dir", dir]);
    assert.equal(res.status, 0, res.stderr);

    const artifactPath = join(harnessRunsDir, "mint-run-001.json");
    assert.ok(existsSync(artifactPath), "expected mint-run-001.json to be written");
    const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
    assert.deepEqual(validateRunArtifact(artifact), [], "the written artifact must validate against F28's own schema check");
    assert.equal(artifact.harness_family, "mint");
    assert.equal(artifact.metrics.valid, 1);
    assert.equal(artifact.defects_found.length, 0);
    assert.ok(existsSync(join(dir, "batch.apply-ready.json")));
    assert.ok(existsSync(join(dir, "batch.mint-batch-report.json")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI --execute: artifact written on THROWN FAILURE — an unparseable batch file still produces a schema-valid artifact recording the error, never silence", () => {
  const dir = tmpDir();
  try {
    const batchPath = join(dir, "batch.json");
    writeFileSync(batchPath, "{ this is not valid json");
    const harnessRunsDir = join(dir, "harness-runs", "mint");
    const res = run(["--batch-file", batchPath, "--execute", "--harness-runs-dir", harnessRunsDir]);
    assert.equal(res.status, 1, "a thrown run must still exit non-zero");
    assert.match(res.stderr, /run-mint-batch: FAILED/);

    const artifactPath = join(harnessRunsDir, "mint-run-001.json");
    assert.ok(existsSync(artifactPath), "even a thrown failure must leave a run artifact — no run escapes recording");
    const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
    assert.deepEqual(validateRunArtifact(artifact), []);
    assert.equal(artifact.defects_found.length, 1);
    assert.match(artifact.defects_found[0].description, /threw during an --execute run/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI --execute: two consecutive real runs claim distinct, incrementing run ids (claimRunId wired through end to end)", () => {
  const dir = tmpDir();
  try {
    const batchPath = join(dir, "batch.json");
    writeFileSync(batchPath, JSON.stringify([EXAMPLE_PAYLOAD]));
    const harnessRunsDir = join(dir, "harness-runs", "mint");
    run(["--batch-file", batchPath, "--execute", "--harness-runs-dir", harnessRunsDir, "--out-dir", dir]);
    run(["--batch-file", batchPath, "--execute", "--harness-runs-dir", harnessRunsDir, "--out-dir", dir, "--out-basename", "batch2"]);
    const artifacts = readdirSync(harnessRunsDir).filter((f) => f.endsWith(".json")).sort();
    assert.deepEqual(artifacts, ["mint-run-001.json", "mint-run-002.json"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI --outcomes: enriches an existing run artifact's metrics block with edges_discovered / forward_events_extracted / isolated_items", () => {
  const dir = tmpDir();
  try {
    const batchPath = join(dir, "batch.json");
    writeFileSync(batchPath, JSON.stringify([EXAMPLE_PAYLOAD]));
    const harnessRunsDir = join(dir, "harness-runs", "mint");
    const first = run(["--batch-file", batchPath, "--execute", "--harness-runs-dir", harnessRunsDir, "--out-dir", dir]);
    assert.equal(first.status, 0, first.stderr);

    const outcomesPath = join(dir, "outcomes.json");
    writeFileSync(
      outcomesPath,
      JSON.stringify({ run_id: "mint-run-001", edges_discovered: 9, forward_events_extracted: 4, isolated_items: 1 }),
    );
    const second = run(["--outcomes", outcomesPath, "--harness-runs-dir", harnessRunsDir]);
    assert.equal(second.status, 0, second.stderr);

    const artifact = JSON.parse(readFileSync(join(harnessRunsDir, "mint-run-001.json"), "utf8"));
    assert.equal(artifact.metrics.edges_discovered, 9);
    assert.equal(artifact.metrics.forward_events_extracted, 4);
    assert.equal(artifact.metrics.isolated_items, 1);
    assert.equal(artifact.metrics.valid, 1, "enrichment must not clobber the original validator metrics");
    assert.deepEqual(validateRunArtifact(artifact), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("MINT_GOVERNING_FILES matches F28's hardcoded mint entry (kept hand-synced until a future wave points F28 at this export)", async () => {
  const src = readFileSync(
    join(HERE, "..", "..", ".discipline", "fitness", "functions", "F28-harness-run-integrity.mjs"),
    "utf8",
  );
  for (const f of MINT_GOVERNING_FILES) {
    assert.ok(src.includes(`'${f}'`), `F28's GOVERNING_FILES.mint must still list ${f}`);
  }
});
