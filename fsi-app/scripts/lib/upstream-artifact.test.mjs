// Tests for upstream-artifact.mjs (lane CHAIN-1, 2026-10-07): the chain's one artifact hand-off. Fixture rows
// and injected deps only (no database, no network, no repo write). node:test + node: builtins + relative
// imports (portable, no-npm glob). Run: node --test scripts/lib/upstream-artifact.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  APPLY_EVIDENCE,
  NOOP_FAMILIES,
  HARNESS_RUN_READ_COLUMNS,
  decideChainGate,
  readUpstreamArtifact,
  makeRestRowReader,
  buildNoopArtifact,
  runCli,
} from "./upstream-artifact.mjs";
import { validateRunArtifact, writeRunArtifact } from "./run-artifact.mjs";
import { resolveHarnessRunContext } from "./loop-run-id.mjs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE_FSI = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const ledgerRow = (over = {}) => ({
  run_id: "ledger-consume-run-010", harness_family: "ledger-consume", github_run_id: "100", started_at: "2026-10-07T07:00:00Z",
  config: { mode: "apply", apply_disarmed: false, loop_run_id: "9001" }, metrics: { promoted: 3 }, ...over,
});
const mintRow = (over = {}) => ({
  run_id: "mint-run-030", harness_family: "mint", github_run_id: "200", started_at: "2026-10-07T07:05:00Z",
  config: { mode: "execute" }, metrics: { minted: 4 }, ...over,
});
const corpusRow = (over = {}) => ({
  run_id: "corpus-turn-run-007", harness_family: "corpus-turn", github_run_id: "300", started_at: "2026-10-07T07:05:00Z",
  config: { mode: "apply" }, metrics: { tickets_selected: 9 }, ...over,
});

// ── decideChainGate ───────────────────────────────────────────────────────────────────────────────────
test("gate: a missing upstream row skips with a reason that names the run, in both modes", () => {
  for (const runMode of ["dry", "apply"]) {
    const r = decideChainGate({ consumer: "population-turn", upstreamName: "Ledger consume", row: null, runMode, upstreamRunId: "100" });
    assert.equal(r.skip, true);
    assert.match(r.reason, /no harness_runs row exists for "Ledger consume" run 100/);
  }
});

test("gate: an upstream that was itself a no-op produces nothing, by config.noop or config.skip", () => {
  const noop = decideChainGate({ consumer: "downstream-chain", upstreamName: "Population turn", row: mintRow({ config: { mode: "dry", noop: true, noop_reason: "nothing to chain" } }), runMode: "dry" });
  assert.equal(noop.skip, true);
  assert.match(noop.reason, /itself a no-op \(nothing to chain\)/);
  const skipped = decideChainGate({ consumer: "downstream-chain", upstreamName: "Corpus turn", row: corpusRow({ config: { mode: "dry", skip: true, skip_reason: "zero tickets" } }), runMode: "dry" });
  assert.equal(skipped.skip, true);
  assert.match(skipped.reason, /zero tickets/);
});

test("gate: dry mode proceeds on any real upstream row, including a plan-mode ledger-consume with promoted 0", () => {
  const plan = ledgerRow({ config: { mode: "plan", apply_disarmed: true }, metrics: { promoted: 0 } });
  assert.deepEqual(decideChainGate({ consumer: "population-turn", upstreamName: "Ledger consume", row: plan, runMode: "dry" }), { skip: false, reason: "" });
  assert.deepEqual(decideChainGate({ consumer: "downstream-chain", upstreamName: "Population turn", row: mintRow({ config: { mode: "execute" }, metrics: { minted: 0 } }), runMode: "dry" }), { skip: false, reason: "" });
  assert.deepEqual(decideChainGate({ consumer: "downstream-chain", upstreamName: "Corpus turn", row: corpusRow({ config: { mode: "dry" }, metrics: { tickets_selected: 0 } }), runMode: "dry" }), { skip: false, reason: "" });
});

test("gate: apply mode needs real upstream work (the evidence the branch readers used to apply)", () => {
  const ok = (consumer, upstreamName, row) => decideChainGate({ consumer, upstreamName, row, runMode: "apply" });
  assert.equal(ok("population-turn", "Ledger consume", ledgerRow()).skip, false);
  assert.match(ok("population-turn", "Ledger consume", ledgerRow({ config: { mode: "plan" } })).reason, /effective mode=plan/);
  assert.match(ok("population-turn", "Ledger consume", ledgerRow({ config: { mode: "apply", apply_disarmed: true } })).reason, /apply_disarmed=true/);
  assert.match(ok("population-turn", "Ledger consume", ledgerRow({ metrics: { promoted: 0 } })).reason, /promoted=0/);
  assert.equal(ok("downstream-chain", "Population turn", mintRow()).skip, false);
  assert.match(ok("downstream-chain", "Population turn", mintRow({ metrics: { minted: 0 } })).reason, /minted=0/);
  assert.match(ok("downstream-chain", "Population turn", mintRow({ config: { mode: "dry" } })).reason, /wanted execute/);
  assert.equal(ok("downstream-chain", "Corpus turn", corpusRow()).skip, false);
  assert.match(ok("downstream-chain", "Corpus turn", corpusRow({ metrics: { tickets_selected: 0 } })).reason, /tickets_selected=0/);
  assert.match(ok("downstream-chain", "Corpus turn", corpusRow({ config: { mode: "dry" } })).reason, /wanted apply/);
});

test("gate: an unknown upstream or consumer has no hand-off and skips", () => {
  assert.match(decideChainGate({ consumer: "population-turn", upstreamName: "Source sweep", row: ledgerRow(), runMode: "dry" }).reason, /no hand-off is defined/);
  assert.match(decideChainGate({ consumer: "nobody", upstreamName: "Ledger consume", row: ledgerRow(), runMode: "dry" }).reason, /no hand-off is defined/);
  assert.deepEqual(Object.keys(APPLY_EVIDENCE).sort(), ["downstream-chain", "population-turn"]);
});

// ── readUpstreamArtifact ──────────────────────────────────────────────────────────────────────────────
test("reader: maps the upstream NAME to its family and returns the newest matching row", async () => {
  const seen = [];
  const rows = [ledgerRow({ run_id: "ledger-consume-run-009", started_at: "2026-10-07T06:00:00Z" }), ledgerRow()];
  const r = await readUpstreamArtifact({ upstreamName: "Ledger consume", upstreamRunId: 100, readRows: async (f, id) => { seen.push([f, id]); return rows; } });
  assert.deepEqual(seen, [["ledger-consume", "100"]]);
  assert.equal(r.family, "ledger-consume");
  assert.equal(r.row.run_id, "ledger-consume-run-010");
  const m = await readUpstreamArtifact({ upstreamName: "Population turn", upstreamRunId: "200", readRows: async (f) => { seen.push(f); return [mintRow()]; } });
  assert.equal(m.family, "mint");
});

test("reader: retries a not-yet-visible landing, then reports null (never invents a row)", async () => {
  let calls = 0;
  const slept = [];
  const r = await readUpstreamArtifact({
    upstreamName: "Corpus turn", upstreamRunId: "300", attempts: 3, delayMs: 7, sleep: async (ms) => { slept.push(ms); },
    readRows: async () => { calls += 1; return calls < 3 ? [] : [corpusRow()]; },
  });
  assert.equal(calls, 3);
  assert.deepEqual(slept, [7, 7]);
  assert.equal(r.row.run_id, "corpus-turn-run-007");
  const none = await readUpstreamArtifact({ upstreamName: "Corpus turn", upstreamRunId: "300", attempts: 2, delayMs: 0, sleep: async () => {}, readRows: async () => [] });
  assert.equal(none.row, null);
});

test("reader: an unmapped upstream name or a blank run id never reads", async () => {
  const boom = async () => { throw new Error("must not read"); };
  assert.equal((await readUpstreamArtifact({ upstreamName: "Data producers", upstreamRunId: "1", readRows: boom })).row, null);
  assert.equal((await readUpstreamArtifact({ upstreamName: "Ledger consume", upstreamRunId: " ", readRows: boom })).row, null);
  assert.equal((await readUpstreamArtifact({ upstreamName: undefined, upstreamRunId: "1", readRows: boom })).row, null);
});

test("REST reader: builds the family + github_run_id filter, sends the service key, throws on a non-2xx", async () => {
  let call;
  const good = makeRestRowReader("https://x.supabase.co", "KEY", async (url, init) => { call = { url, init }; return { ok: true, json: async () => [{ run_id: "r" }] }; });
  assert.deepEqual(await good("mint", "200"), [{ run_id: "r" }]);
  assert.match(call.url, /^https:\/\/x\.supabase\.co\/rest\/v1\/harness_runs\?/);
  assert.ok(call.url.includes(`select=${HARNESS_RUN_READ_COLUMNS}`));
  assert.ok(call.url.includes("harness_family=eq.mint") && call.url.includes("github_run_id=eq.200"));
  assert.equal(call.init.headers.apikey, "KEY");
  const bad = makeRestRowReader("https://x.supabase.co", "KEY", async () => ({ ok: false, status: 503 }));
  await assert.rejects(() => bad("mint", "200"), /HTTP 503/);
});

// ── NO-OP artifact ────────────────────────────────────────────────────────────────────────────────────
test("noop artifact: schema-valid for every NOOP family, config.noop and noop_reason set, one line reason", () => {
  for (const family of Object.keys(NOOP_FAMILIES)) {
    const a = buildNoopArtifact({ family, runId: `${family}-run-001`, harnessVersion: "sha256:0123456789abcdef", startedAt: "2026-10-07T07:00:00Z", mode: "dry", reason: "line one\n  line two", upstreamName: "Ledger consume", upstreamRunId: "100" });
    assert.deepEqual(validateRunArtifact(a), [], family);
    assert.equal(a.config.noop, true);
    assert.equal(a.config.noop_reason, "line one line two");
    assert.equal(a.config.upstream_run_id, "100");
  }
  assert.throws(() => buildNoopArtifact({ family: "screen", runId: "screen-run-001", harnessVersion: "x", startedAt: "2026-10-07T07:00:00Z", mode: "dry", reason: "r" }), /not one of/);
});

test("noop artifact written through writeRunArtifact: trigger is honest and upstream_run_id is stamped (the loop evidence needs both)", () => {
  const dir = mkdtempSync(join(tmpdir(), "noop-artifact-"));
  const saved = { ...process.env };
  try {
    process.env.GITHUB_EVENT_NAME = "workflow_run";
    process.env.CHAINED_FORCED_DRY = "true";
    process.env.GITHUB_EVENT_WORKFLOW_RUN_ID = "555";
    const path = writeRunArtifact(dir, buildNoopArtifact({ family: "mint", runId: "mint-run-001", harnessVersion: "sha256:0123456789abcdef", startedAt: "2026-10-07T07:00:00Z", mode: "dry", reason: "nothing" }));
    const written = JSON.parse(readFileSync(path, "utf8"));
    assert.equal(written.trigger, "workflow_run_forced_dry");
    assert.equal(written.upstream_run_id, "555");
    assert.equal(written.config.noop, true);
  } finally {
    for (const k of ["GITHUB_EVENT_NAME", "CHAINED_FORCED_DRY", "GITHUB_EVENT_WORKFLOW_RUN_ID"]) {
      if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
    }
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── CLI ───────────────────────────────────────────────────────────────────────────────────────────────
function cli(over = {}) {
  const io = { out: [], err: [] };
  return {
    io,
    deps: {
      out: (l) => io.out.push(l), err: (m) => io.err.push(m),
      envUrl: "https://x.supabase.co", envKey: "KEY", isGitHubActions: true,
      readRowsFactory: () => async () => [ledgerRow()], sleep: async () => {},
      ...over,
    },
  };
}
const READ = ["read", "--consumer", "population-turn", "--upstream-name", "Ledger consume", "--upstream-run-id", "100", "--run-mode", "apply"];

test("CLI read: prints the KEY=VALUE lines the workflow reads", async () => {
  const { io, deps } = cli();
  assert.equal(await runCli(READ, deps), 0);
  assert.deepEqual(io.out, ["CHAIN_SKIP=false", "CHAIN_SKIP_REASON=", "CHAIN_UPSTREAM_ROW_ID=ledger-consume-run-010", "CHAIN_UPSTREAM_LOOP_RUN_ID=9001"]);
});

test("CLI read: a refused gate prints skip=true with a one-line reason and still exits 0", async () => {
  const { io, deps } = cli({ readRowsFactory: () => async () => [ledgerRow({ config: { mode: "plan" } })] });
  assert.equal(await runCli(READ, deps), 0);
  assert.equal(io.out[0], "CHAIN_SKIP=true");
  assert.match(io.out[1], /^CHAIN_SKIP_REASON=ledger-consume run .* effective mode=plan/);
  assert.ok(!io.out[1].includes("\n"));
});

test("CLI read: no row at all is a named skip, not an error", async () => {
  const { io, deps } = cli({ readRowsFactory: () => async () => [] });
  assert.equal(await runCli(READ, deps), 0);
  assert.equal(io.out[0], "CHAIN_SKIP=true");
  assert.match(io.out[1], /no harness_runs row exists/);
  assert.equal(io.out[2], "CHAIN_UPSTREAM_ROW_ID=");
  assert.equal(io.out[3], "CHAIN_UPSTREAM_LOOP_RUN_ID=");
});

// ── ADR-031: the loop id comes from the upstream ROW (a CI checkout holds no upstream artifact file) ───────
test("loop id: the reader exposes the upstream row's loop id, empty when the row has none", async () => {
  const { io, deps } = cli({ readRowsFactory: () => async () => [ledgerRow({ config: { mode: "plan" } })] });
  await runCli(["read", "--consumer", "population-turn", "--upstream-name", "Ledger consume", "--upstream-run-id", "100", "--run-mode", "dry"], deps);
  assert.equal(io.out[3], "CHAIN_UPSTREAM_LOOP_RUN_ID=");
});

test("loop id: an explicit id from the row wins over the on-disk resolver, which finds nothing in a CI checkout", () => {
  const dir = mkdtempSync(join(tmpdir(), "loop-ctx-"));
  try {
    const base = { family: "downstream-chain", familyDir: dir, governingFiles: ["scripts/lib/upstream-artifact.mjs"], fsiRoot: join(HERE_FSI), upstreamName: "Population turn", upstreamRunId: "200" };
    assert.equal(resolveHarnessRunContext({ ...base, explicit: null }).loopRunId, null, "disk-only resolution is null with no upstream artifact on disk");
    assert.equal(resolveHarnessRunContext({ ...base, explicit: "9001" }).loopRunId, "9001");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loop id: a NO-OP artifact records the loop id it is given (the envelope sets config.loop_run_id)", async () => {
  const written = [];
  const { deps } = cli({ claimId: (f) => `${f}-run-042`, versionOf: () => "sha256:0123456789abcdef", writeNoop: (a) => { written.push(a); return "x"; } });
  assert.equal(await runCli(["noop", "--family", "mint", "--mode", "dry", "--reason", "r", "--loop-run-id", "9001"], deps), 0);
  assert.equal(written[0].config.loop_run_id, "9001");
  assert.deepEqual(validateRunArtifact(written[0]), []);
});

test("CLI read: a read error is exit 1, and missing credentials are exit 1 in Actions, exit 2 outside", async () => {
  const a = cli({ readRowsFactory: () => async () => { throw new Error("harness_runs read failed: HTTP 500"); } });
  assert.equal(await runCli(READ, a.deps), 1);
  assert.match(a.io.err.join("\n"), /HTTP 500/);
  assert.deepEqual(a.io.out, []);
  const b = cli({ envKey: "" });
  assert.equal(await runCli(READ, b.deps), 1);
  const c = cli({ envKey: "", isGitHubActions: false });
  assert.equal(await runCli(READ, c.deps), 2);
});

test("CLI read: bad arguments are exit 1", async () => {
  for (const args of [[], ["read"], ["read", "--consumer", "nope", "--run-mode", "dry"], ["read", "--consumer", "population-turn", "--run-mode", "plan"], ["bogus"]]) {
    const { deps } = cli();
    assert.equal(await runCli(args, deps), 1, JSON.stringify(args));
  }
});

test("CLI noop: claims an id, builds the artifact for the family, writes it, exits 0 (apply path through the writer)", async () => {
  const written = [];
  const { deps } = cli({ claimId: (f) => `${f}-run-042`, versionOf: () => "sha256:0123456789abcdef", writeNoop: (a, f) => { written.push([f, a]); return `/fixture/${a.run_id}.json`; } });
  assert.equal(await runCli(["noop", "--family", "propagation", "--mode", "apply", "--reason", "upstream failed", "--upstream-name", "Downstream chain", "--upstream-run-id", "9"], deps), 0);
  assert.equal(written.length, 1);
  assert.equal(written[0][0], "propagation");
  assert.equal(written[0][1].run_id, "propagation-run-042");
  assert.deepEqual(validateRunArtifact(written[0][1]), []);
  assert.equal(written[0][1].config.upstream_name, "Downstream chain");
});

test("CLI noop: an unknown family or a bad mode is exit 1 and writes nothing", async () => {
  const written = [];
  const { deps } = cli({ writeNoop: (a) => { written.push(a); return "x"; } });
  assert.equal(await runCli(["noop", "--family", "screen", "--mode", "dry", "--reason", "r"], deps), 1);
  assert.equal(await runCli(["noop", "--family", "mint", "--mode", "plan", "--reason", "r"], deps), 1);
  assert.equal(written.length, 0);
});

// ── lane CHAIN-2: loop-id, the loop id only, no consumer and no gate ──────────────────────────────────────
const LOOP_ID = ["loop-id", "--upstream-name", "Source sweep", "--upstream-run-id", "100"];

test("CLI loop-id: prints only the upstream row's loop id, with no consumer, run mode or gate", async () => {
  const { io, deps } = cli({ readRowsFactory: () => async () => [ledgerRow({ config: { mode: "plan", noop: true, loop_run_id: "sweep-5" } })] });
  assert.equal(await runCli(LOOP_ID, deps), 0);
  assert.deepEqual(io.out, ["CHAIN_UPSTREAM_LOOP_RUN_ID=sweep-5"], "a no-op or plan upstream is not gated here");
});

test("CLI loop-id: no row, or a row with no loop id, prints an empty id and exits 0", async () => {
  const a = cli({ readRowsFactory: () => async () => [] });
  assert.equal(await runCli(LOOP_ID, a.deps), 0);
  assert.deepEqual(a.io.out, ["CHAIN_UPSTREAM_LOOP_RUN_ID="]);
  const b = cli({ readRowsFactory: () => async () => [ledgerRow({ config: { mode: "plan" } })] });
  assert.equal(await runCli(LOOP_ID, b.deps), 0);
  assert.deepEqual(b.io.out, ["CHAIN_UPSTREAM_LOOP_RUN_ID="]);
});

test("CLI loop-id: a read error and missing credentials fail like read (exit 1 in Actions, 2 outside)", async () => {
  const a = cli({ readRowsFactory: () => async () => { throw new Error("boom"); } });
  assert.equal(await runCli(LOOP_ID, a.deps), 1);
  assert.equal(await runCli(LOOP_ID, cli({ envKey: "" }).deps), 1);
  assert.equal(await runCli(LOOP_ID, cli({ envKey: "", isGitHubActions: false }).deps), 2);
});

test("CLI read: the consumer is still required (loop-id did not loosen read)", async () => {
  const { deps } = cli();
  assert.equal(await runCli(["read", "--upstream-name", "Source sweep", "--upstream-run-id", "100", "--run-mode", "dry"], deps), 1);
});
