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
