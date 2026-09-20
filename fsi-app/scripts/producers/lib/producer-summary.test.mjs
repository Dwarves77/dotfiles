// producer-summary.test.mjs -- proves writeProducerSummary's pure path/shape logic (lane M9d, 2026-09-20).
// No network, no DB -- a temp directory stands in for PRODUCER_SUMMARY_DIR, restored/cleared after every
// test so no test leaks env state into the next one (the same discipline run-artifact.test.mjs uses for
// its own tmp-dir fixtures).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeProducerSummary } from "./producer-summary.mjs";

function withTempSummaryDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "producer-summary-test-"));
  const prior = process.env.PRODUCER_SUMMARY_DIR;
  process.env.PRODUCER_SUMMARY_DIR = dir;
  try {
    return fn(dir);
  } finally {
    if (prior === undefined) delete process.env.PRODUCER_SUMMARY_DIR;
    else process.env.PRODUCER_SUMMARY_DIR = prior;
    rmSync(dir, { recursive: true, force: true });
  }
}

test("no-op (returns null, writes nothing) when PRODUCER_SUMMARY_DIR is unset", () => {
  const prior = process.env.PRODUCER_SUMMARY_DIR;
  delete process.env.PRODUCER_SUMMARY_DIR;
  try {
    const result = writeProducerSummary({ producer: "ecb-fx", status: "ok", rows_changed: 3, edges_authored: 2 });
    assert.equal(result, null);
  } finally {
    if (prior !== undefined) process.env.PRODUCER_SUMMARY_DIR = prior;
  }
});

test("writes <dir>/<producer>.json with the full shape on status=ok", () => {
  withTempSummaryDir((dir) => {
    const outPath = writeProducerSummary({
      producer: "ecb-fx",
      status: "ok",
      rows_changed: 5,
      edges_authored: 4,
      counts: { created: 3, updated: 2 },
    });
    assert.equal(outPath, join(dir, "ecb-fx.json"));
    const parsed = JSON.parse(readFileSync(outPath, "utf8"));
    assert.equal(parsed.producer, "ecb-fx");
    assert.equal(parsed.status, "ok");
    assert.equal(parsed.rows_changed, 5);
    assert.equal(parsed.edges_authored, 4);
    assert.equal(parsed.reason, null);
    assert.deepEqual(parsed.counts, { created: 3, updated: 2 });
    assert.equal(typeof parsed.written_at, "string");
    assert.equal(Number.isNaN(Date.parse(parsed.written_at)), false);
  });
});

test("status=failed carries the reason; a missing reason falls back to a named default, never silently null", () => {
  withTempSummaryDir((dir) => {
    writeProducerSummary({ producer: "eia-v2-petroleum-spot", status: "failed", rows_changed: 6, edges_authored: 0, reason: "assertEdgesAuthored threw" });
    const a = JSON.parse(readFileSync(join(dir, "eia-v2-petroleum-spot.json"), "utf8"));
    assert.equal(a.reason, "assertEdgesAuthored threw");

    writeProducerSummary({ producer: "bls-oews", status: "failed", rows_changed: 0, edges_authored: null });
    const b = JSON.parse(readFileSync(join(dir, "bls-oews.json"), "utf8"));
    assert.equal(b.reason, "no reason recorded");
  });
});

test("edges_authored: null is preserved (never coerced to 0) for a producer with no notion of edges", () => {
  withTempSummaryDir((dir) => {
    writeProducerSummary({ producer: "fetch-desnz-factors", status: "ok", rows_changed: 11, edges_authored: null });
    const parsed = JSON.parse(readFileSync(join(dir, "fetch-desnz-factors.json"), "utf8"));
    assert.equal(parsed.edges_authored, null);
  });
});

test("creates PRODUCER_SUMMARY_DIR when it does not yet exist", () => {
  const base = mkdtempSync(join(tmpdir(), "producer-summary-test-nested-"));
  const nested = join(base, "does", "not", "exist", "yet");
  const prior = process.env.PRODUCER_SUMMARY_DIR;
  process.env.PRODUCER_SUMMARY_DIR = nested;
  try {
    const outPath = writeProducerSummary({ producer: "ratify-series-items", status: "ok", rows_changed: 0, edges_authored: null });
    assert.equal(existsSync(outPath), true);
  } finally {
    if (prior === undefined) delete process.env.PRODUCER_SUMMARY_DIR;
    else process.env.PRODUCER_SUMMARY_DIR = prior;
    rmSync(base, { recursive: true, force: true });
  }
});

test("rejects an unknown status rather than writing a malformed summary", () => {
  withTempSummaryDir(() => {
    assert.throws(() => writeProducerSummary({ producer: "x", status: "weird", rows_changed: 0, edges_authored: null }), /status must be one of/);
  });
});

test("rejects a non-string/empty producer name", () => {
  withTempSummaryDir(() => {
    assert.throws(() => writeProducerSummary({ producer: "", status: "ok", rows_changed: 0, edges_authored: null }), /producer must be a non-empty string/);
    assert.throws(() => writeProducerSummary({ producer: null, status: "ok", rows_changed: 0, edges_authored: null }), /producer must be a non-empty string/);
  });
});
