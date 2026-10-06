// kinds.test.mjs: the registry's shape and its pure helpers (lane G6-DRAIN).
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { KINDS, KIND_ORDER, kindById, kindForBatchPath, nextBatchPath } from "./kinds.mjs";

const FSI = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = resolve(FSI, "..");

test("every kind names a real exporter script, authoring guide and apply workflow", () => {
  for (const k of KINDS) {
    assert.ok(existsSync(resolve(FSI, k.exportArgv[0])), `${k.id}: exporter ${k.exportArgv[0]}`);
    assert.ok(existsSync(resolve(FSI, k.authoringGuide)), `${k.id}: guide ${k.authoringGuide}`);
    assert.ok(existsSync(resolve(REPO, ".github/workflows", k.applyWorkflow)), `${k.id}: workflow ${k.applyWorkflow}`);
  }
});

test("KIND_ORDER lists exactly the registered kinds, once each", () => {
  assert.deepEqual([...KIND_ORDER].sort(), KINDS.map((k) => k.id).sort());
});

test("one batch file per kind per run (an apply workflow that names its file takes one)", () => {
  for (const k of KINDS) assert.equal(k.maxBatchesPerRun, 1, k.id);
});

test("each apply workflow carries a push trigger on exactly its kind's batch directory (the wiring the drain relies on)", () => {
  for (const k of KINDS) {
    const text = readFileSync(resolve(REPO, ".github/workflows", k.applyWorkflow), "utf8");
    assert.match(text, /^ {2}push:/m, `${k.applyWorkflow} has no push trigger`);
    assert.ok(text.includes(`fsi-app/${k.batchDir}/${k.batchPrefix}-*.json`), `${k.applyWorkflow} push paths must list fsi-app/${k.batchDir}/${k.batchPrefix}-*.json`);
    assert.ok(text.includes(`--kind ${k.id}`), `${k.applyWorkflow} must resolve its batch with resolve-push-batch.mjs --kind ${k.id}`);
  }
});

test("kindForBatchPath accepts repo or app relative batch files and refuses everything else", () => {
  assert.equal(kindForBatchPath("fsi-app/scripts/turns/theme-briefs/batches/theme-briefs-004.json").id, "theme-briefs");
  assert.equal(kindForBatchPath("scripts/turns/ledger-verdicts/ledger-verdicts-003.json").id, "ledger-verdicts");
  assert.equal(kindForBatchPath("scripts/maintenance/host-verdicts/host-verdicts-001.json").id, "host-verdicts");
  assert.equal(kindForBatchPath("scripts/turns/record-briefs/batches/record-briefs-009-reg-a.json").id, "record-briefs");
  for (const no of ["scripts/maintenance/host-verdicts/host-verdicts-000.fixture.json", "scripts/turns/ledger-verdicts/candidates-001.json", "scripts/turns/theme-briefs/batches/README.md", "scripts/turns/theme-briefs/batches/x/theme-briefs-001.json", "src/app/theme-briefs-001.json"]) {
    assert.equal(kindForBatchPath(no), null, no);
  }
});

test("nextBatchPath: highest NNN in any accepted variant plus one, offset for the next ones, 001 when none", () => {
  const rb = kindById("record-briefs");
  assert.equal(nextBatchPath(rb, ["record-briefs-003b.json", "record-briefs-010-slots.json", "record-briefs-009-reg-a.json", "README.md"]), "scripts/turns/record-briefs/batches/record-briefs-011.json");
  assert.equal(nextBatchPath(rb, ["record-briefs-010-slots.json"], 1), "scripts/turns/record-briefs/batches/record-briefs-012.json");
  assert.equal(nextBatchPath(kindById("theme-briefs"), []), "scripts/turns/theme-briefs/batches/theme-briefs-001.json");
  assert.equal(nextBatchPath(kindById("host-verdicts"), ["host-verdicts-000.fixture.json"]), "scripts/maintenance/host-verdicts/host-verdicts-001.json");
});
