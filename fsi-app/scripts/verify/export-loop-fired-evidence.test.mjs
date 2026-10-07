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

test("CLI: --write --out <path> writes to the given path, resolved against the cwd, not the default file", async () => {
  const { out, deps } = cliDeps();
  assert.equal(await runCli(["--write", "--out", "rel/dir/evidence.json"], deps), 0);
  assert.equal(out.written.length, 1);
  assert.equal(out.written[0][0], resolve(process.cwd(), "rel/dir/evidence.json"));
  assert.notEqual(out.written[0][0], "/fixture/loop-fired-evidence.json");
});

test("CLI: --out without --write is refused with a message, nothing is read or written", async () => {
  const { out, deps } = cliDeps({ readAllFn: async () => { throw new Error("must not read"); } });
  assert.equal(await runCli(["--out", "x.json"], deps), 1);
  assert.match(out.errs[0], /--out requires --write/);
  assert.equal(out.written.length, 0);
});

test("CLI: --out with no path value is refused", async () => {
  const { out, deps } = cliDeps();
  assert.equal(await runCli(["--write", "--out"], deps), 1);
  assert.match(out.errs[0], /--out needs a path/);
  assert.equal(out.written.length, 0);
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

// ── lane CHAIN-1 (2026-10-07): the two upstream_run_id shapes the first dry fire found null ───────────────
// chain-fire-2026-10-06 finding F3: Downstream chain and Propagation drain rows carried upstream_run_id null, so
// the hops whose family serves two hops (05/06, 07/08) were UNMAPPED. The workflows now export the upstream run
// id as GITHUB_EVENT_WORKFLOW_RUN_ID and writeRunArtifact stamps it; these tests drive that real emission path.
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { writeRunArtifact } from "../lib/run-artifact.mjs";
import { buildArtifact as buildDownstreamArtifact } from "../turns/emit-downstream-chain-artifact.mjs";

/** Emit a downstream-chain artifact exactly as the workflow step does, with the env the resolve step exports, and
 *  return the row the landing step would insert (record-harness-run.mjs's baseRow mapping, by hand). */
function emittedDownstreamRow({ upstreamRunId, githubRunId, upstreamName }) {
  const dir = mkdtempSync(join(tmpdir(), "chain1-exporter-"));
  const keys = ["GITHUB_EVENT_NAME", "CHAINED_FORCED_DRY", "GITHUB_EVENT_WORKFLOW_RUN_ID", "GITHUB_RUN_ID"];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  try {
    Object.assign(process.env, { GITHUB_EVENT_NAME: "workflow_run", CHAINED_FORCED_DRY: "true", GITHUB_EVENT_WORKFLOW_RUN_ID: upstreamRunId, GITHUB_RUN_ID: githubRunId });
    const artifact = buildDownstreamArtifact({
      runId: "downstream-chain-run-001", harnessVersion: "sha256:0123456789abcdef", startedAt: "2026-10-07T07:00:00Z",
      mode: "dry", skip: false, skipReason: "", upstreamName, upstreamRunId, stepResults: [],
    });
    const written = JSON.parse(readFileSync(writeRunArtifact(dir, artifact), "utf8"));
    return {
      harness_family: written.harness_family, run_id: written.run_id, started_at: written.started_at, trigger: written.trigger,
      github_run_id: written.config.github_run_id, upstream_run_id: written.upstream_run_id ?? null,
    };
  } finally {
    for (const k of keys) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
    rmSync(dir, { recursive: true, force: true });
  }
}

test("CHAIN-1 shape 1: a downstream-chain row emitted with the exported upstream id carries it, and lands on hop 05 / hop 06 by producer family", () => {
  const popRow = emittedDownstreamRow({ upstreamRunId: "555", githubRunId: "777", upstreamName: "Population turn" });
  const corpusRow = emittedDownstreamRow({ upstreamRunId: "666", githubRunId: "778", upstreamName: "Corpus turn" });
  assert.equal(popRow.upstream_run_id, "555", "writeRunArtifact stamps the exported upstream id");
  assert.equal(popRow.trigger, "workflow_run_forced_dry");
  const { entries, unmapped } = mapRowsToHops([
    row({ harness_family: "mint", run_id: "mint-run-001", trigger: "manual", github_run_id: "555", upstream_run_id: null }),
    row({ harness_family: "corpus-turn", run_id: "corpus-turn-run-001", trigger: "manual", github_run_id: "666", upstream_run_id: null }),
    { ...popRow, run_id: "downstream-chain-run-001" },
    { ...corpusRow, run_id: "downstream-chain-run-002" },
  ]);
  assert.deepEqual(unmapped, []);
  assert.deepEqual(entries.map((e) => [e.hop, e.run_id]), [
    ["population-turn-to-downstream-chain", "downstream-chain-run-001"],
    ["corpus-turn-to-downstream-chain", "downstream-chain-run-002"],
  ]);
});

test("CHAIN-1 shape 2: propagation rows that carry the upstream id land on hop 07 (downstream-chain producer) and hop 08 (producers), not unmapped", () => {
  const rows = [
    row({ harness_family: "producers", run_id: "producers-run-001", trigger: "manual", github_run_id: "900", upstream_run_id: null }),
    row({ harness_family: "downstream-chain", run_id: "downstream-chain-run-001", trigger: "manual", github_run_id: "901", upstream_run_id: null }),
    row({ harness_family: "propagation", run_id: "propagation-run-001", trigger: "workflow_run_forced_dry", github_run_id: "910", upstream_run_id: "900" }),
    row({ harness_family: "propagation", run_id: "propagation-run-002", trigger: "workflow_run_forced_dry", github_run_id: "911", upstream_run_id: "901", started_at: "2026-10-03T11:00:00Z" }),
  ];
  const { entries, unmapped } = mapRowsToHops(rows);
  assert.deepEqual(unmapped, []);
  assert.deepEqual(entries.map((e) => [e.hop, e.run_id]), [
    ["downstream-chain-to-propagation-drain", "propagation-run-002"],
    ["data-producers-to-propagation-drain", "propagation-run-001"],
  ]);
  const before = mapRowsToHops(rows.map((r) => (r.harness_family === "propagation" ? { ...r, upstream_run_id: null } : r)));
  assert.equal(before.unmapped.length, 2, "with a null upstream (the pre-fix rows) both are unmapped");
});

// ── lane CHAIN-1 ruling 1 (2026-10-07): the F60 dispatch fallback is fired evidence on a dispatchFallback hop ──
import { isFiredEvidence } from "../../.discipline/governance/loop-manifest.mjs";

const prodRows = () => [
  row({ harness_family: "downstream-chain", run_id: "downstream-chain-run-001", trigger: "manual", github_run_id: "901", upstream_run_id: null }),
  row({ harness_family: "producers", run_id: "producers-run-001", trigger: "manual", github_run_id: "900", upstream_run_id: null }),
];

test("CHAIN-1: a workflow_dispatch propagation row carrying the downstream-chain upstream id maps to hop 07 (dispatchFallback)", () => {
  const { entries, unmapped } = mapRowsToHops([
    ...prodRows(),
    row({ harness_family: "propagation", run_id: "propagation-run-002", trigger: "workflow_dispatch", github_run_id: "911", upstream_run_id: "901" }),
  ]);
  assert.deepEqual(unmapped, []);
  assert.deepEqual(entries.map((e) => [e.hop, e.run_id, e.trigger]), [["downstream-chain-to-propagation-drain", "propagation-run-002", "workflow_dispatch"]]);
});

test("ATTACK: a workflow_dispatch propagation row WITHOUT upstream_run_id (a hand dispatch) does not map and is not unmapped noise", () => {
  const { entries, unmapped } = mapRowsToHops([...prodRows(), row({ harness_family: "propagation", run_id: "propagation-run-003", trigger: "workflow_dispatch", github_run_id: "912", upstream_run_id: null })]);
  assert.deepEqual(entries, []);
  assert.deepEqual(unmapped, []);
});

test("ATTACK: a dispatch row whose upstream id is not the downstream-chain producer's run does not map (never claimed on a guess)", () => {
  // 900 is a producers run: hop 08 does not declare dispatchFallback, hop 07's producer family has no row 900.
  const { entries, unmapped } = mapRowsToHops([...prodRows(), row({ harness_family: "propagation", run_id: "propagation-run-004", trigger: "workflow_dispatch", github_run_id: "913", upstream_run_id: "900" })]);
  assert.deepEqual(entries, []);
  assert.equal(unmapped.length, 1);
});

test("ATTACK: a dispatch row with an upstream id on a hop that does not declare dispatchFallback never counts (fetch-drain)", () => {
  const { entries } = mapRowsToHops([row({ trigger: "workflow_dispatch", upstream_run_id: "100" })]);
  assert.deepEqual(entries, []);
  const fetchHop = LOOP_HOPS.find((h) => h.family === "fetch-drain");
  assert.equal(isFiredEvidence({ trigger: "workflow_dispatch", upstream_run_id: "100" }, fetchHop), false);
  const hop07 = LOOP_HOPS.find((h) => h.id === "downstream-chain-to-propagation-drain");
  assert.equal(hop07.dispatchFallback, true);
  assert.equal(isFiredEvidence({ trigger: "workflow_dispatch", upstream_run_id: "1" }, hop07), true);
  assert.equal(isFiredEvidence({ trigger: "workflow_dispatch", upstream_run_id: null }, hop07), false);
  assert.equal(isFiredEvidence({ trigger: "manual", upstream_run_id: "1" }, hop07), false);
});
