// run-registered.test.mjs -- lane S8-E0. Proves the runner against the REAL registry with an injected
// spawn (no producer script ever runs, no network, no database): the loader's output is what runs, in order,
// dry by default, --apply only on apply, the kill-switch env set, a failure stops the run. Also the
// composition proof F27 asks of a shebang entry point: the runner and the loader exercised together.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runRegistered, parseArgs } from "./run-registered.mjs";
import { loadProducerRegistry } from "./load-registry.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

function harness(spawnImpl) {
  const calls = [];
  const logs = [];
  const spawn = (cmd, args, opts) => {
    calls.push({ cmd, args, env: opts.env, cwd: opts.cwd });
    return spawnImpl ? spawnImpl(args, calls.length) : { status: 0 };
  };
  return { calls, logs, deps: { spawn, log: (s) => logs.push(s), env: { PATH: "x", PRODUCER_SUMMARY_DIR: "/tmp/ps" } } };
}

test("parseArgs: defaults are dry and all; an unknown flag throws", () => {
  assert.deepEqual(parseArgs([]), { mode: "dry", producer: "all", only: "", since: "", list: false });
  assert.throws(() => parseArgs(["--bogus"]), /unknown argument --bogus/);
  assert.throws(() => parseArgs(["--mode"]), /needs a value/);
});

test("producer=all dry: runs every in_all registry entry in order, none with --apply, the SBTi entry excluded", () => {
  const h = harness();
  assert.equal(runRegistered(["--mode", "dry", "--producer", "all"], h.deps), 0);
  const scripts = h.calls.map((c) => c.args[0]);
  assert.deepEqual(scripts, [
    "scripts/producers/market/ecb-fx-producer.mjs",
    "scripts/producers/market/eia-v2-petroleum-spot-producer.mjs",
    "scripts/producers/market/fetch-oil-bulletin.mjs",
    "scripts/producers/market/eu-weekly-oil-bulletin.mjs",
  ]);
  assert.equal(h.calls.some((c) => c.args.includes("--apply")), false);
  assert.equal(h.calls[0].env.MARKET_PRODUCER_ECB_FX_ENABLED, "1");
  assert.equal(h.calls[0].env.PRODUCER_SUMMARY_DIR, "/tmp/ps", "the child inherits the environment, so the summary dir reaches the producer");
  assert.equal(h.calls[0].cmd, "node");
});

test("producer=all apply: --apply lands on the producer scripts only, never on the oil bulletin fetch stage", () => {
  const h = harness();
  assert.equal(runRegistered(["--mode", "apply", "--producer", "all", "--since", "2026-01-05"], h.deps), 0);
  const byScript = Object.fromEntries(h.calls.map((c) => [c.args[0], c.args.slice(1)]));
  assert.deepEqual(byScript["scripts/producers/market/ecb-fx-producer.mjs"], ["--apply"]);
  assert.deepEqual(byScript["scripts/producers/market/fetch-oil-bulletin.mjs"], ["--out", "/tmp/wob.csv", "--since", "2026-01-05"]);
  assert.deepEqual(byScript["scripts/producers/market/eu-weekly-oil-bulletin.mjs"], ["--input", "/tmp/wob.csv", "--apply"]);
});

test("producer=registry only=sbti-target-dashboard apply: runs the named entry even though it is not in_all", () => {
  const h = harness();
  assert.equal(runRegistered(["--mode", "apply", "--producer", "registry", "--only", "sbti-target-dashboard"], h.deps), 0);
  assert.deepEqual(h.calls.map((c) => c.args), [["scripts/producers/market/sbti-target-dashboard-producer.mjs", "--apply"]]);
  assert.equal(h.calls[0].env.MARKET_PRODUCER_SBTI_ENABLED, "1");
});

test("a failing child stops the run and its exit code is returned (no later producer runs)", () => {
  const h = harness((args) => ({ status: args[0].includes("ecb-fx") ? 3 : 0 }));
  assert.equal(runRegistered(["--mode", "dry", "--producer", "all"], h.deps), 3);
  assert.equal(h.calls.length, 1);
  assert.ok(h.logs.some((l) => /registry producer ecb-fx failed/.test(l)));
});

test("an unknown registry name, a bad mode and a malformed registry all exit 2 and run nothing", () => {
  for (const argv of [["--producer", "registry", "--only", "nope"], ["--mode", "bogus"]]) {
    const h = harness();
    assert.equal(runRegistered(argv, h.deps), 2);
    assert.equal(h.calls.length, 0);
  }
  const h = harness();
  const code = runRegistered([], { ...h.deps, load: () => { throw new Error("producer registry: x.json: unknown field \"y\""); } });
  assert.equal(code, 2);
  assert.equal(h.calls.length, 0);
});

test("a producer value that belongs to a non-registry step selects nothing and exits 0", () => {
  const h = harness();
  assert.equal(runRegistered(["--producer", "bls-oews"], h.deps), 0);
  assert.equal(h.calls.length, 0);
});

test("the real CLI: --list prints the selected runs as JSON and runs nothing", () => {
  const res = spawnSync(process.execPath, ["scripts/producers/registry/run-registered.mjs", "--list", "--mode", "apply", "--producer", "all"], {
    cwd: resolve(HERE, "..", "..", ".."), encoding: "utf8",
  });
  assert.equal(res.status, 0, res.stderr);
  const listed = JSON.parse(res.stdout);
  assert.deepEqual(listed.map((r) => r.name), loadProducerRegistry().filter((e) => e.in_all).map((e) => e.name));
  assert.deepEqual(listed.find((r) => r.name === "ecb-fx").commands, [["node", "scripts/producers/market/ecb-fx-producer.mjs", "--apply"]]);
});
