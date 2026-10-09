/** Tests for scripts/proof/run-lane-step.mjs (lane PROOF-1). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runLaneStep, buildStepRecord } from "./run-lane-step.mjs";

function tmp() { return mkdtempSync(join(tmpdir(), "lane-step-")); }

test("an absent script is a named skip, exit 0, with the owning lane in the record", () => {
  const dir = tmp();
  try {
    const { record, exitCode } = runLaneStep({ name: "export-subset", lane: "PROOF-2", script: join(dir, "export-subset.mjs"), outDir: dir });
    assert.equal(exitCode, 0);
    assert.equal(record.status, "skipped");
    assert.match(record.reason, /lane PROOF-2 has not landed/);
    assert.deepEqual(JSON.parse(readFileSync(join(dir, "step-export-subset.json"), "utf8")), record);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a present script runs with its arguments and a zero exit is recorded as ran", () => {
  const dir = tmp();
  try {
    const script = join(dir, "ok.mjs");
    writeFileSync(script, "import { writeFileSync } from 'node:fs'; writeFileSync(process.argv[2], process.argv.slice(3).join(','));");
    const marker = join(dir, "marker.txt");
    const { record, exitCode } = runLaneStep({ name: "ok", lane: "PROOF-3", script, outDir: dir, args: [marker, "a", "b"] });
    assert.equal(exitCode, 0);
    assert.equal(record.status, "ran");
    assert.equal(readFileSync(marker, "utf8"), "a,b");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a failing script passes its exit code through and is recorded as failed, never as a skip", () => {
  const dir = tmp();
  try {
    const script = join(dir, "bad.mjs");
    writeFileSync(script, "process.exit(7);");
    const { record, exitCode } = runLaneStep({ name: "bad", lane: "PROOF-3", script, outDir: dir });
    assert.equal(exitCode, 7);
    assert.equal(record.status, "failed");
    assert.equal(record.exit_code, 7);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("the record never carries argument values", () => {
  const rec = buildStepRecord({ name: "x", lane: "L", status: "ran", exitCode: 0, seconds: 1 });
  assert.deepEqual(Object.keys(rec).sort(), ["exit_code", "lane", "reason", "seconds", "status", "step"]);
});

// ── lane GATE-9 (2026-10-08, AUD-AT-5 gate-script neuter row): the CLI's EXIT STATUS is the step's own ─────────
test("GATE-9 exit status: run-lane-step.mjs exits 2 on a missing argument, the step script's own status when it fails, and 0 when it passes or is absent", async () => {
  const { spawnSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const script = fileURLToPath(new URL("./run-lane-step.mjs", import.meta.url));
  const dir = mkdtempSync(join(tmpdir(), "run-lane-step-"));
  try {
    const failing = join(dir, "fails.mjs");
    const passing = join(dir, "passes.mjs");
    writeFileSync(failing, "process.exit(3);\n");
    writeFileSync(passing, "process.exit(0);\n");
    const run = (...a) => spawnSync(process.execPath, [script, ...a], { encoding: "utf8" });
    assert.equal(run("--name", "x").status, 2, "--lane, --script and --out-dir are required");
    assert.equal(run("--name", "s", "--lane", "L", "--script", failing, "--out-dir", dir).status, 3, "the failing step's own status passes through");
    assert.equal(run("--name", "s", "--lane", "L", "--script", passing, "--out-dir", dir).status, 0);
    assert.equal(run("--name", "s", "--lane", "L", "--script", join(dir, "absent.mjs"), "--out-dir", dir).status, 0, "a step whose lane has not landed is a named skip, not a failure");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
