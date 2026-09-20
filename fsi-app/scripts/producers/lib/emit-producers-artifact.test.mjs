// emit-producers-artifact.test.mjs -- lane M9d (2026-09-20). Lives under scripts/producers/lib/ (not
// beside emit-producers-artifact.mjs itself, one level up in scripts/producers/) so it is picked up by
// the existing scripts/producers/*/*.test.mjs directory glob in .discipline/run-test-suite.sh -- that
// glob is a derived registry per this lane's brief (never hand-edited to add a one-off entry), and
// scripts/producers/ itself has no single-level *.test.mjs glob. node:test + node:assert/strict, node:
// builtins + relative imports only (portable, no-npm glob). Run: node --test
// scripts/producers/lib/emit-producers-artifact.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateRunArtifact } from "../../lib/run-artifact.mjs";
import { readProducerSummaries, buildArtifact } from "../emit-producers-artifact.mjs";

function withTmpDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "producers-artifact-test-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function makeSummary(overrides = {}) {
  return {
    producer: "ecb-fx",
    status: "ok",
    rows_changed: 3,
    edges_authored: 2,
    reason: null,
    counts: { created: 3, updated: 0 },
    written_at: "2026-09-20T18:00:00.000Z",
    ...overrides,
  };
}

test("readProducerSummaries: a missing/never-set summary dir -> [], never throws", () => {
  assert.deepEqual(readProducerSummaries(null), []);
  assert.deepEqual(readProducerSummaries(join(tmpdir(), "does-not-exist-" + Date.now())), []);
});

test("readProducerSummaries: reads every *.json in the dir, sorted by filename", () => {
  withTmpDir((dir) => {
    writeFileSync(join(dir, "eu-weekly-oil-bulletin.json"), JSON.stringify(makeSummary({ producer: "eu-weekly-oil-bulletin" })));
    writeFileSync(join(dir, "ecb-fx.json"), JSON.stringify(makeSummary({ producer: "ecb-fx" })));
    const summaries = readProducerSummaries(dir);
    assert.deepEqual(summaries.map((s) => s.producer), ["ecb-fx", "eu-weekly-oil-bulletin"]);
  });
});

test("readProducerSummaries: an unparseable summary is skipped, never crashes the read", () => {
  withTmpDir((dir) => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "broken.json"), "{not json");
    writeFileSync(join(dir, "ecb-fx.json"), JSON.stringify(makeSummary()));
    const summaries = readProducerSummaries(dir);
    assert.deepEqual(summaries.map((s) => s.producer), ["ecb-fx"]);
  });
});

test("buildArtifact: zero summaries -> a valid artifact recorded anyway (record it every batch, even when zero)", () => {
  const artifact = buildArtifact({
    runId: "producers-run-001", harnessVersion: "sha256:aaaaaaaaaaaaaaaa", startedAt: "2026-09-20T18:00:00Z",
    mode: "dry", runProducer: "all", summaries: [],
  });
  assert.deepEqual(validateRunArtifact(artifact), []);
  assert.equal(artifact.per_item.length, 0);
  assert.equal(artifact.metrics.producers_reporting, 0);
  assert.equal(artifact.defects_found.length, 0);
  assert.ok(artifact.full_trace_refs.length > 0);
  assert.equal(artifact.config.loop_run_id, null);
});

test("buildArtifact: every summary status:ok -> outcome clean, no defects, config carries mode/run_producer", () => {
  const summaries = [makeSummary({ producer: "ecb-fx", rows_changed: 3, edges_authored: 2 }), makeSummary({ producer: "eia-v2-petroleum-spot", rows_changed: 4, edges_authored: 4 })];
  const artifact = buildArtifact({
    runId: "producers-run-002", harnessVersion: "sha256:bbbbbbbbbbbbbbbb", startedAt: "2026-09-20T18:00:00Z",
    mode: "apply", runProducer: "all", summaries,
  });
  assert.deepEqual(validateRunArtifact(artifact), []);
  assert.equal(artifact.per_item.length, 2);
  assert.ok(artifact.per_item.every((p) => p.outcome === "clean"));
  assert.equal(artifact.metrics.producers_reporting, 2);
  assert.equal(artifact.metrics.producers_failed, 0);
  assert.equal(artifact.metrics.rows_changed_total, 7);
  assert.equal(artifact.metrics.edges_authored_total, 6);
  assert.equal(artifact.defects_found.length, 0);
  assert.equal(artifact.config.mode, "apply");
  assert.equal(artifact.config.run_producer, "all");
});

test("buildArtifact: a failed summary (the M5 assertEdgesAuthored throw) records outcome failed and a defect", () => {
  const summaries = [
    makeSummary({ producer: "ecb-fx", status: "ok", rows_changed: 3, edges_authored: 3 }),
    makeSummary({ producer: "eia-v2-petroleum-spot", status: "failed", rows_changed: 4, edges_authored: 0, reason: "assertEdgesAuthored: this run wrote 4 row(s) ... authored 0 derivation_edges" }),
  ];
  const artifact = buildArtifact({
    runId: "producers-run-003", harnessVersion: "sha256:cccccccccccccccc", startedAt: "2026-09-20T18:00:00Z",
    mode: "apply", runProducer: "eia-v2-petroleum-spot", summaries,
  });
  assert.deepEqual(validateRunArtifact(artifact), []);
  const failedItem = artifact.per_item.find((p) => p.id === "eia-v2-petroleum-spot");
  assert.equal(failedItem.outcome, "failed");
  assert.match(failedItem.verdict, /assertEdgesAuthored/);
  assert.equal(artifact.metrics.producers_failed, 1);
  assert.equal(artifact.defects_found.length, 1);
  assert.match(artifact.defects_found[0].description, /1 of 2 producer/);
});

test("buildArtifact: edges_authored:null (a producer with no notion of edges) is excluded from the total, never coerced to 0 wrongly", () => {
  const summaries = [makeSummary({ producer: "fetch-desnz-factors", rows_changed: 11, edges_authored: null })];
  const artifact = buildArtifact({
    runId: "producers-run-004", harnessVersion: "sha256:dddddddddddddddd", startedAt: "2026-09-20T18:00:00Z",
    mode: "apply", runProducer: "desnz-emission-factors", summaries,
  });
  assert.deepEqual(validateRunArtifact(artifact), []);
  assert.equal(artifact.metrics.edges_authored_total, 0);
  assert.equal(artifact.metrics.rows_changed_total, 11);
});
