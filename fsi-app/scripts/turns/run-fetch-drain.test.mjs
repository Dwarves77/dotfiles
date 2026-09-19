// run-fetch-drain.test.mjs, proves arg parsing, the stuck-row cutoff, batching, the dry-plan shaping,
// the per-batch outcome shaping (worker response + DB read-back), and the function URL derivation, all
// against fixtures (no network, no DB). Importing this module never invokes main() (IS_MAIN guard).
import test from "node:test";
import assert from "node:assert/strict";
import {
  parseArgs, stuckCutoffIso, batchIds, tallyByStatus, shapeDryPlan, shapeBatchPerItem, functionUrlFor,
  DEFAULT_LIMIT, MAX_LIMIT, BATCH_SIZE, STUCK_AFTER_MS,
} from "./run-fetch-drain.mjs";

// -- parseArgs ---------------------------------------------------------------------------------------

test("parseArgs: defaults to mode=dry, limit=8", () => {
  const r = parseArgs([]);
  assert.equal(r.ok, true);
  assert.equal(r.mode, "dry");
  assert.equal(r.limit, DEFAULT_LIMIT);
});

test("parseArgs: unknown --mode value is refused", () => {
  const r = parseArgs(["--mode", "sideways"]);
  assert.equal(r.ok, false);
  assert.match(r.error, /--mode must be/);
});

test("parseArgs: --limit must be a positive integer", () => {
  assert.equal(parseArgs(["--limit", "0"]).ok, false);
  assert.equal(parseArgs(["--limit", "-3"]).ok, false);
  assert.equal(parseArgs(["--limit", "abc"]).ok, false);
  assert.equal(parseArgs(["--limit", "3.5"]).ok, false);
});

test("parseArgs: --limit is capped at MAX_LIMIT, enforced in code", () => {
  const r = parseArgs(["--mode", "apply", "--limit", String(MAX_LIMIT + 1)]);
  assert.equal(r.ok, false);
  assert.match(r.error, /--limit must be at most 64/);
});

test("parseArgs: --limit at exactly MAX_LIMIT is accepted", () => {
  const r = parseArgs(["--mode", "apply", "--limit", String(MAX_LIMIT)]);
  assert.equal(r.ok, true);
  assert.equal(r.limit, MAX_LIMIT);
});

test("parseArgs: --mode apply with a valid limit parses", () => {
  const r = parseArgs(["--mode", "apply", "--limit", "16"]);
  assert.equal(r.ok, true);
  assert.equal(r.mode, "apply");
  assert.equal(r.limit, 16);
});

test("parseArgs: --harness-runs-dir and --out-dir pass through, null when absent", () => {
  assert.equal(parseArgs([]).harnessRunsDir, null);
  assert.equal(parseArgs([]).outDir, null);
  const r = parseArgs(["--harness-runs-dir", "/tmp/hr", "--out-dir", "/tmp/out"]);
  assert.equal(r.harnessRunsDir, "/tmp/hr");
  assert.equal(r.outDir, "/tmp/out");
});

test("parseArgs: an unknown flag is refused (strict parsing)", () => {
  const r = parseArgs(["--bogus", "x"]);
  assert.equal(r.ok, false);
});

// -- stuckCutoffIso ------------------------------------------------------------------------------------

test("stuckCutoffIso: subtracts exactly one hour from the given clock reading", () => {
  const now = Date.parse("2026-09-18T12:00:00.000Z");
  assert.equal(stuckCutoffIso(now), "2026-09-18T11:00:00.000Z");
  assert.equal(STUCK_AFTER_MS, 60 * 60 * 1000);
});

// -- batchIds ------------------------------------------------------------------------------------------

test("batchIds: splits into BATCH_SIZE-sized groups, in order", () => {
  const ids = Array.from({ length: 20 }, (_, i) => `id-${i}`);
  const batches = batchIds(ids, 8);
  assert.equal(batches.length, 3);
  assert.equal(batches[0].length, 8);
  assert.equal(batches[1].length, 8);
  assert.equal(batches[2].length, 4);
  assert.deepEqual(batches.flat(), ids);
});

test("batchIds: empty input yields no batches", () => {
  assert.deepEqual(batchIds([]), []);
  assert.deepEqual(batchIds(null), []);
});

test("batchIds: default size is BATCH_SIZE (8)", () => {
  const ids = Array.from({ length: 9 }, (_, i) => `id-${i}`);
  const batches = batchIds(ids);
  assert.equal(BATCH_SIZE, 8);
  assert.equal(batches.length, 2);
  assert.equal(batches[0].length, 8);
  assert.equal(batches[1].length, 1);
});

// -- tallyByStatus ---------------------------------------------------------------------------------------

test("tallyByStatus: counts rows by status, unknown for a missing status", () => {
  const rows = [{ status: "queued" }, { status: "queued" }, { status: "done" }, {}];
  assert.deepEqual(tallyByStatus(rows), { queued: 2, done: 1, unknown: 1 });
});

test("tallyByStatus: empty/undefined input yields an empty tally", () => {
  assert.deepEqual(tallyByStatus([]), {});
  assert.deepEqual(tallyByStatus(undefined), {});
});

// -- shapeDryPlan ----------------------------------------------------------------------------------------

test("shapeDryPlan: one per_item entry per queued row and per stuck row, zero invocations", () => {
  const queued = [
    { id: "q1", source_id: "s1", queued_at: "2026-09-17T00:00:00Z" },
    { id: "q2", source_id: "s2", queued_at: "2026-09-17T01:00:00Z" },
  ];
  const stuck = [
    { id: "st1", source_id: "s3", status: "fetching", last_attempt_at: "2026-09-18T08:00:00Z" },
  ];
  const { perItem, metrics } = shapeDryPlan(queued, stuck, { limit: 8 });
  assert.equal(perItem.length, 3);
  assert.equal(perItem[0].id, "q1");
  assert.equal(perItem[0].outcome, "planned_queued");
  assert.equal(perItem[2].id, "st1");
  assert.equal(perItem[2].outcome, "planned_stuck_reset");
  assert.equal(metrics.mode, "dry");
  assert.equal(metrics.queued_selected, 2);
  assert.equal(metrics.stuck_selected, 1);
  assert.equal(metrics.invocations, 0);
  assert.equal(metrics.batches, 0);
});

test("shapeDryPlan: no queued or stuck rows yields an empty plan, not a throw", () => {
  const { perItem, metrics } = shapeDryPlan([], [], { limit: 8 });
  assert.deepEqual(perItem, []);
  assert.equal(metrics.queued_selected, 0);
  assert.equal(metrics.stuck_selected, 0);
});

test("shapeDryPlan: tolerates null/undefined row arrays", () => {
  const { perItem } = shapeDryPlan(null, undefined, { limit: 8 });
  assert.deepEqual(perItem, []);
});

// -- shapeBatchPerItem -----------------------------------------------------------------------------------

test("shapeBatchPerItem: a captured row reads its worker outcome and read-back status", () => {
  const ids = ["a", "b"];
  const workerResults = [
    { queue_id: "a", outcome: "captured", http_status: 200, chars: 5000, url: "https://example.gov/a" },
    { queue_id: "b", outcome: "failed", http_status: 403, detail: "non-200 status 403", url: "https://example.gov/b" },
  ];
  const readback = [
    { id: "a", status: "done" },
    { id: "b", status: "error", last_error_text: "non-200 status 403" },
  ];
  const shaped = shapeBatchPerItem(ids, workerResults, null, readback);
  assert.equal(shaped.length, 2);
  assert.equal(shaped[0].outcome, "captured");
  assert.match(shaped[0].verdict, /http_status=200/);
  assert.match(shaped[0].verdict, /chars=5000/);
  assert.match(shaped[0].verdict, /status='done'/);
  assert.deepEqual(shaped[0].evidence_refs, ["https://example.gov/a"]);
  assert.equal(shaped[0].error, null);
  assert.equal(shaped[1].outcome, "failed");
  assert.equal(shaped[1].error, "non-200 status 403");
});

test("shapeBatchPerItem: an HTTP call failure with no worker result reads honestly from read-back alone", () => {
  const ids = ["x", "y"];
  const readback = [
    { id: "x", status: "fetching" },
    { id: "y", status: "fetching" },
  ];
  const shaped = shapeBatchPerItem(ids, null, "HTTP 500 from capture-worker", readback);
  assert.equal(shaped.length, 2);
  for (const item of shaped) {
    assert.equal(item.outcome, "http_call_failed_readback_fetching");
    assert.equal(item.error, "HTTP 500 from capture-worker");
    assert.match(item.verdict, /the batch HTTP call itself failed/);
  }
});

test("shapeBatchPerItem: a missing worker result and no HTTP error still reads from read-back, honestly labelled", () => {
  const shaped = shapeBatchPerItem(["z"], [], null, [{ id: "z", status: "queued" }]);
  assert.equal(shaped.length, 1);
  assert.equal(shaped[0].outcome, "no_worker_result_readback_queued");
  assert.equal(shaped[0].error, null);
});

test("shapeBatchPerItem: a row with no read-back row at all reads status='unknown', never throws", () => {
  const shaped = shapeBatchPerItem(["missing"], null, "network error", []);
  assert.equal(shaped[0].outcome, "http_call_failed_readback_unknown");
});

test("shapeBatchPerItem: empty batch yields no entries", () => {
  assert.deepEqual(shapeBatchPerItem([], null, null, []), []);
});

// -- functionUrlFor --------------------------------------------------------------------------------------

test("functionUrlFor: appends the Edge Function path, stripping a trailing slash", () => {
  assert.equal(
    functionUrlFor("https://kwrsbpiseruzbfwjpvsp.supabase.co"),
    "https://kwrsbpiseruzbfwjpvsp.supabase.co/functions/v1/capture-worker"
  );
  assert.equal(
    functionUrlFor("https://kwrsbpiseruzbfwjpvsp.supabase.co/"),
    "https://kwrsbpiseruzbfwjpvsp.supabase.co/functions/v1/capture-worker"
  );
});

// -- attack test (rule 15): a violation this module SHOULD catch must actually be caught ------------------
// The cap is enforced in parseArgs (MAX_LIMIT), not only documented in the header comment. This plants
// the violation the fitness/gate discipline expects a unit-tested guard to prove against: a caller asking
// for more than the cap is refused, never silently clamped or silently allowed through.
test("ATTACK: a --limit above MAX_LIMIT is refused, never silently clamped", () => {
  const r = parseArgs(["--mode", "apply", "--limit", "1000"]);
  assert.equal(r.ok, false, "a --limit of 1000 must be refused, not silently accepted or clamped");
  assert.match(r.error, /at most 64/);
});
