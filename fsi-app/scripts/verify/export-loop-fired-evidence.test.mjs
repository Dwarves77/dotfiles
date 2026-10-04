// export-loop-fired-evidence.test.mjs (lane GATES-1, 2026-10-04): the pure hop mapping in loop-manifest.mjs
// and the exporter CLI, on fixture rows with every dependency injected (no database, no file write).
// Run: node --test fsi-app/scripts/verify/export-loop-fired-evidence.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runCli, renderEvidenceFile, HARNESS_RUN_COLUMNS } from "./export-loop-fired-evidence.mjs";
import { readEvidenceFile } from "./loop-fired-evidence-audit.mjs";
import {
  LOOP_HOPS,
  FIRED_TRIGGERS,
  PRODUCER_FAMILY_BY_WORKFLOW_FILE,
  mapRowsToHops,
  producerFamilyOf,
} from "../../.discipline/governance/loop-manifest.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const row = (over) => ({
  harness_family: "fetch-drain", run_id: "fetch-drain-run-001", started_at: "2026-10-03T10:00:00Z",
  trigger: "workflow_run", github_run_id: "200", upstream_run_id: "100", ...over,
});

test("mapRowsToHops: a family served by one hop maps on family alone, trigger must be a fired trigger", () => {
  const { entries, unmapped } = mapRowsToHops([
    row(),
    row({ run_id: "fetch-drain-run-002", trigger: "workflow_dispatch" }),
    row({ harness_family: "not-a-loop-family", run_id: "x-run-001" }),
  ]);
  assert.deepEqual(entries.map((e) => [e.hop, e.run_id, e.trigger]), [["sweep-to-fetch-drain", "fetch-drain-run-001", "workflow_run"]]);
  assert.deepEqual(unmapped, []);
});

test("mapRowsToHops: workflow_run_forced_dry counts, and the EARLIEST firing row is the entry", () => {
  const { entries } = mapRowsToHops([
    row({ run_id: "fetch-drain-run-009", started_at: "2026-10-04T00:00:00Z", trigger: "workflow_run_forced_dry" }),
    row({ run_id: "fetch-drain-run-003", started_at: "2026-10-02T00:00:00Z", trigger: "workflow_run_forced_dry" }),
  ]);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].run_id, "fetch-drain-run-003");
});

test("mapRowsToHops: a shared family is placed on the hop whose producer family has the upstream github run id", () => {
  const rows = [
    row({ harness_family: "mint", run_id: "mint-run-001", trigger: "manual", github_run_id: "555", upstream_run_id: null }),
    row({ harness_family: "corpus-turn", run_id: "corpus-turn-run-001", trigger: "manual", github_run_id: "666", upstream_run_id: null }),
    row({ harness_family: "downstream-chain", run_id: "downstream-chain-run-001", github_run_id: "777", upstream_run_id: "555" }),
    row({ harness_family: "downstream-chain", run_id: "downstream-chain-run-002", github_run_id: "778", upstream_run_id: "666", started_at: "2026-10-03T11:00:00Z" }),
  ];
  const { entries, unmapped } = mapRowsToHops(rows);
  assert.deepEqual(unmapped, []);
  assert.deepEqual(
    entries.map((e) => [e.hop, e.run_id]),
    [["population-turn-to-downstream-chain", "downstream-chain-run-001"], ["corpus-turn-to-downstream-chain", "downstream-chain-run-002"]],
  );
});

test("mapRowsToHops: a shared-family row that cannot be placed is reported unmapped with its reason, never claimed", () => {
  const { entries, unmapped } = mapRowsToHops([
    row({ harness_family: "downstream-chain", run_id: "downstream-chain-run-001", upstream_run_id: null }),
    row({ harness_family: "downstream-chain", run_id: "downstream-chain-run-002", upstream_run_id: "999" }),
  ]);
  assert.deepEqual(entries, []);
  assert.equal(unmapped.length, 2);
  assert.match(unmapped[0].reason, /no upstream_run_id/);
  assert.match(unmapped[1].reason, /no producer row has github_run_id 999/);
});

test("manifest pins: every producer-table family is a real harness family directory, producerFamilyOf resolves", () => {
  const harnessRuns = resolve(HERE, "..", "harness-runs");
  for (const fam of Object.values(PRODUCER_FAMILY_BY_WORKFLOW_FILE)) assert.ok(existsSync(join(harnessRuns, fam)), fam);
  const hop = LOOP_HOPS.find((h) => h.id === "corpus-turn-to-downstream-chain");
  assert.equal(producerFamilyOf(hop), "corpus-turn");
  assert.deepEqual([...FIRED_TRIGGERS], ["workflow_run", "workflow_run_forced_dry"]);
});

function cliDeps(over = {}) {
  const out = { logs: [], errs: [], written: [] };
  return {
    out,
    deps: {
      log: (m) => out.logs.push(m),
      errorLog: (m) => out.errs.push(m),
      loadEnv: () => {},
      hasCreds: () => true,
      readAllFn: async (table, cols) => { out.read = [table, cols]; return [row()]; },
      writeFileFn: (p, text) => out.written.push([p, text]),
      outFile: "/fixture/loop-fired-evidence.json",
      ...over,
    },
  };
}

test("CLI: no credentials self-skips with exit 2 and reads nothing", async () => {
  const { out, deps } = cliDeps({ hasCreds: () => false, readAllFn: async () => { throw new Error("must not read"); } });
  assert.equal(await runCli(["--write"], deps), 2);
  assert.match(out.errs[0], /self-skip/);
  assert.equal(out.written.length, 0);
});

test("CLI: dry by default prints the entries and writes nothing", async () => {
  const { out, deps } = cliDeps();
  assert.equal(await runCli([], deps), 0);
  assert.deepEqual(out.read, ["harness_runs", HARNESS_RUN_COLUMNS]);
  assert.ok(out.logs.some((l) => /FIRED {2}sweep-to-fetch-drain/.test(l)));
  assert.ok(out.logs.some((l) => /dry run, nothing written/.test(l)));
  assert.equal(out.written.length, 0);
});

test("CLI: --write writes exactly the rendered entries to the injected path", async () => {
  const { out, deps } = cliDeps();
  assert.equal(await runCli(["--write"], deps), 0);
  assert.equal(out.written.length, 1);
  assert.equal(out.written[0][0], "/fixture/loop-fired-evidence.json");
  const parsed = JSON.parse(out.written[0][1]);
  assert.equal(parsed.entries.length, 1);
  assert.equal(parsed.entries[0].hop, "sweep-to-fetch-drain");
  assert.equal(out.written[0][1], renderEvidenceFile(parsed.entries));
});

test("CLI: a DB read error is exit 1 and nothing is written", async () => {
  const { out, deps } = cliDeps({ readAllFn: async () => { throw new Error("boom"); } });
  assert.equal(await runCli(["--write"], deps), 1);
  assert.match(out.errs[0], /DB read failed: boom/);
  assert.equal(out.written.length, 0);
});

test("CLI: a write error is exit 1", async () => {
  const { deps } = cliDeps({ writeFileFn: () => { throw new Error("disk"); } });
  assert.equal(await runCli(["--write"], deps), 1);
});

test("the committed evidence file exists with an entries array (F50 reads it)", () => {
  const r = readEvidenceFile();
  assert.ok(Array.isArray(r.entries), r.error);
});
