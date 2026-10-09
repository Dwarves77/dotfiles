/** Tests for scripts/proof/export-local-harness-runs.mjs (lane PROOF-1). The ledger is read through a fake
 *  client; the point is what the public export does NOT carry. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { hashId, buildHarnessRunsExport, exportLocalHarnessRuns, runCli, NoLocalLedgerError, NO_LEDGER_MESSAGE, SELECT_RUNS } from "./export-local-harness-runs.mjs";

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

test("PROOF-5: a missing ledger table (42P01) becomes NoLocalLedgerError, the client is still closed, and the read stays one SELECT", async () => {
  let closed = false;
  let n = 0;
  const client = { query: async () => { n++; throw Object.assign(new Error('relation "public.harness_runs" does not exist'), { code: "42P01" }); }, end: async () => { closed = true; } };
  await assert.rejects(() => exportLocalHarnessRuns(client), (e) => e instanceof NoLocalLedgerError && e.message === NO_LEDGER_MESSAGE);
  assert.equal(closed, true);
  assert.equal(n, 1);
});

test("PROOF-5: another read error is not turned into the no-ledger message", async () => {
  const client = { query: async () => { throw Object.assign(new Error("permission denied"), { code: "42501" }); }, end: async () => {} };
  await assert.rejects(() => exportLocalHarnessRuns(client), /permission denied/);
});

test("PROOF-5: the CLI exits 2 with 'no local ledger: the replay did not run' when the table is absent, and writes nothing", async () => {
  const errors = [];
  let wrote = false;
  const client = { query: async () => { throw Object.assign(new Error("relation does not exist"), { code: "42P01" }); }, end: async () => {} };
  const code = await runCli({ argv: ["node", "x", "--out", "o.json"], env: { CHAIN_PROOF_LOCAL: "1" }, connect: async () => client, writeOut: () => { wrote = true; }, log: () => {}, errorLog: (m) => errors.push(m) });
  assert.equal(code, 2);
  assert.equal(wrote, false);
  assert.match(errors.join("\n"), /no local ledger: the replay did not run/);
});

test("PROOF-5: the CLI still writes the export and exits 0 when the ledger exists", async () => {
  let written;
  const client = { query: async () => ({ rows: ROWS }), end: async () => {} };
  const code = await runCli({ argv: ["node", "x", "--out", "o.json"], env: { CHAIN_PROOF_LOCAL: "1" }, connect: async () => client, writeOut: (p, t) => { written = { p, t }; }, log: () => {}, errorLog: () => {} });
  assert.equal(code, 0);
  assert.equal(written.p, "o.json");
  assert.equal(JSON.parse(written.t).count, 2);
});

test("PROOF-5: the CLI refuses without CHAIN_PROOF_LOCAL=1 and without a connection (exit 2)", async () => {
  const q = { argv: ["node", "x", "--out", "o.json"], writeOut: () => {}, log: () => {}, errorLog: () => {} };
  assert.equal(await runCli({ ...q, env: {}, connect: async () => { throw new Error("must not connect"); } }), 2);
  assert.equal(await runCli({ ...q, env: { CHAIN_PROOF_LOCAL: "1" }, connect: async () => null }), 2);
});

test("the client is closed even when the read fails", async () => {
  let closed = false;
  const client = { query: async () => { throw new Error("relation does not exist"); }, end: async () => { closed = true; } };
  await assert.rejects(() => exportLocalHarnessRuns(client), /does not exist/);
  assert.equal(closed, true);
});

// ── lane GATE-9 (2026-10-08, AUD-AT-5 gate-script neuter row): the CLI's EXIT STATUS ───────────────────────────
test("GATE-9 exit status: export-local-harness-runs.mjs exits 2 without --out", async () => {
  const { spawnSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const { withoutCredentials } = await import("../lib/env-file.mjs");
  const script = fileURLToPath(new URL("./export-local-harness-runs.mjs", import.meta.url));
  const r = spawnSync(process.execPath, [script], { encoding: "utf8", env: { ...withoutCredentials(), SUPABASE_DB_URL: "", PROOF_DB_URL: "" } });
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /--out <path> is required/);
});
