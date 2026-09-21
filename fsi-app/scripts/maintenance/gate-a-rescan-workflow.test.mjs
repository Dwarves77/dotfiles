// gate-a-rescan-workflow.test.mjs -- wiring test for .github/workflows/gate-a-rescan.yml (lane M6b,
// 2026-09-21, brief item 5: "Wiring test beside the other workflow wiring tests (triggers, names, no
// schedule)"). node --test scripts/maintenance/gate-a-rescan-workflow.test.mjs. Text-based checks over
// the real committed yml, same discipline as scripts/producers/lib/producer-summary-wiring.test.mjs
// (no real YAML parser dependency in this repo -- see F52's own header).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..", "..");
const WORKFLOW_PATH = resolve(REPO_ROOT, ".github", "workflows", "gate-a-rescan.yml");
const BRIEF_APPLY_PATH = resolve(REPO_ROOT, ".github", "workflows", "brief-apply.yml");
const POPULATION_TURN_PATH = resolve(REPO_ROOT, ".github", "workflows", "population-turn.yml");

function ymlText() {
  return readFileSync(WORKFLOW_PATH, "utf8");
}

test("gate-a-rescan.yml: carries the name GitHub / F52 checkE requires", () => {
  const text = ymlText();
  assert.match(text, /^name: Gate A rescan\s*$/m);
});

test("gate-a-rescan.yml: workflow_run.workflows names real workflow name: lines (Brief apply, Population turn)", () => {
  const text = ymlText();
  const m = /workflow_run:\s*\n\s*workflows:\s*\[([^\]]*)\]/.exec(text);
  assert.ok(m, "expected a workflow_run.workflows: [...] block");
  const names = m[1].split(",").map((s) => s.trim().replace(/^"|"$/g, ""));
  assert.deepEqual(names.sort(), ["Brief apply", "Population turn"].sort());

  const briefApplyName = readFileSync(BRIEF_APPLY_PATH, "utf8").match(/^name:\s*(.+)$/m)?.[1]?.trim();
  const populationTurnName = readFileSync(POPULATION_TURN_PATH, "utf8").match(/^name:\s*(.+)$/m)?.[1]?.trim();
  assert.equal(briefApplyName, "Brief apply", "brief-apply.yml's own name: line must still read exactly 'Brief apply'");
  assert.equal(populationTurnName, "Population turn", "population-turn.yml's own name: line must still read exactly 'Population turn'");
  assert.ok(names.includes(briefApplyName));
  assert.ok(names.includes(populationTurnName));
});

test("gate-a-rescan.yml: types: [completed] on the workflow_run trigger", () => {
  const text = ymlText();
  assert.match(text, /workflow_run:\s*\n\s*workflows:\s*\[[^\]]*\]\s*\n\s*types:\s*\[completed\]/);
});

test("gate-a-rescan.yml: no schedule: trigger (CLAUDE.md rule 16, build mode)", () => {
  const text = ymlText();
  assert.doesNotMatch(text, /^\s*schedule:/m);
});

test("gate-a-rescan.yml: workflow_dispatch carries mode (dry default), limit, and loop_run_id inputs", () => {
  const text = ymlText();
  const dispatchBlock = text.slice(text.indexOf("workflow_dispatch:"), text.indexOf("workflow_run:"));
  assert.match(dispatchBlock, /\n\s*mode:\s*\n/);
  assert.match(dispatchBlock, /default:\s*'dry'/);
  assert.match(dispatchBlock, /\n\s*limit:\s*\n/);
  assert.match(dispatchBlock, /\n\s*loop_run_id:\s*\n/);
});

test("gate-a-rescan.yml: never dispatches without checkout + install + secrets verification", () => {
  const text = ymlText();
  assert.match(text, /uses: actions\/checkout@v4/);
  assert.match(text, /npm ci/);
  assert.match(text, /Verify required secrets/);
});

test("gate-a-rescan.yml: runs gate-a-rescan.mjs and, when orphans remain, attach-found-sources.mjs scoped by --items-file/--limit", () => {
  const text = ymlText();
  assert.match(text, /node scripts\/maintenance\/gate-a-rescan\.mjs --mode/);
  assert.match(text, /node scripts\/maintenance\/attach-found-sources\.mjs/);
  assert.match(text, /--items-file/);
  assert.match(text, /--limit 50/);
});

test("gate-a-rescan.yml: excludes .seed.json and .fixture.json worklists from the chained attach glob", () => {
  const text = ymlText();
  assert.match(text, /\*\.seed\.json\|\*\.fixture\.json\)\s*continue/);
});

test("gate-a-rescan.yml: emits this family's own harness-run artifact, always()", () => {
  const text = ymlText();
  assert.match(text, /emit-gate-a-rescan-artifact\.mjs/);
  assert.match(text, /Record this run's own harness-run artifact \(gate-a-rescan family\)\s*\n\s*if: always\(\)/);
});

test("gate-a-rescan.yml: F52 checks a-e report zero violations for this file", async () => {
  const { fitnessFunction } = await import("../../.discipline/fitness/functions/F52-workflow-file-validity.mjs");
  const violations = fitnessFunction.check().filter((v) => v.message.includes("gate-a-rescan.yml"));
  assert.deepEqual(violations, []);
});
