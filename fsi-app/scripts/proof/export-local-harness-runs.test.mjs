/** Tests for scripts/proof/export-local-harness-runs.mjs (lane PROOF-1). The ledger is read through a fake
 *  client; the point is what the public export does NOT carry. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { hashId, buildHarnessRunsExport, exportLocalHarnessRuns, SELECT_RUNS } from "./export-local-harness-runs.mjs";

const ROWS = [
  { run_id: "source-sweep-run-001", harness_family: "source-sweep", trigger: "workflow_dispatch", github_run_id: "111", upstream_run_id: null,
    started_at: new Date("2026-10-07T01:00:00Z"), finished_at: new Date("2026-10-07T01:05:00Z"),
    config: { step: "feed", loop_run_id: "777", note: "free text that must not leak" }, metrics: { new_urls: 2, label: "text", ok: true } },
  { run_id: "mint-run-002", harness_family: "mint", trigger: "workflow_run", github_run_id: "222", upstream_run_id: "111",
    started_at: "2026-10-07T01:10:00Z", finished_at: null, config: { loop_run_id: "777" }, metrics: {} },
];

test("hashId is stable, short, and null-safe", () => {
  assert.equal(hashId("111"), hashId("111"));
  assert.notEqual(hashId("111"), hashId("112"));
  assert.equal(hashId("111").length, 12);
  assert.equal(hashId(null), null);
  assert.equal(hashId("  "), null);
});

test("the export hashes every id and keeps the hop order and the chain links comparable", () => {
  const e = buildHarnessRunsExport(ROWS);
  assert.equal(e.count, 2);
  assert.deepEqual(e.runs.map((r) => r.family), ["source-sweep", "mint"]);
  assert.equal(e.runs[1].upstream, e.runs[0].github_run, "the upstream link must still match the upstream run");
  assert.equal(e.runs[0].loop, e.runs[1].loop, "both rows carry the same loop id");
  assert.equal(e.runs[0].step, "feed");
  assert.equal(e.runs[0].started_at, "2026-10-07T01:00:00.000Z");
});

test("the export never carries a raw id, free text, or a non-numeric metric", () => {
  const text = JSON.stringify(buildHarnessRunsExport(ROWS));
  for (const leak of ["source-sweep-run-001", "mint-run-002", '"111"', '"777"', "free text that must not leak", '"text"']) {
    assert.ok(!text.includes(leak), `leaked: ${leak}`);
  }
  assert.deepEqual(buildHarnessRunsExport(ROWS).runs[0].metrics, { new_urls: 2 });
});

test("an empty ledger exports zero runs", () => {
  assert.deepEqual(buildHarnessRunsExport([]), { schema: "chain-proof-local-harness-runs/1", count: 0, runs: [] });
});

test("exportLocalHarnessRuns issues exactly one SELECT, bounded and ordered, and closes the client", async () => {
  const queries = [];
  let closed = false;
  const client = { query: async (q) => { queries.push(q); return { rows: ROWS }; }, end: async () => { closed = true; } };
  const e = await exportLocalHarnessRuns(client);
  assert.equal(e.count, 2);
  assert.equal(queries.length, 1);
  assert.equal(queries[0], SELECT_RUNS);
  assert.match(SELECT_RUNS, /^select .* from public\.harness_runs order by started_at asc, run_id asc limit \d+$/);
  assert.ok(!/\b(insert|update|delete|truncate|drop|alter)\b/i.test(SELECT_RUNS));
  assert.equal(closed, true);
});

test("the client is closed even when the read fails", async () => {
  let closed = false;
  const client = { query: async () => { throw new Error("relation does not exist"); }, end: async () => { closed = true; } };
  await assert.rejects(() => exportLocalHarnessRuns(client), /does not exist/);
  assert.equal(closed, true);
});
