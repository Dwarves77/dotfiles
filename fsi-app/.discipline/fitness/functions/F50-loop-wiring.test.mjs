// F50-loop-wiring.test.mjs - attack tests for lane M9a (brief-m9a.md item 3's attack list): an enforced
// edge whose yml lacks the workflow_run line is caught; an enforced-fired hop whose family has only
// manual artifacts is caught; a wrong name is caught. Plus a live proof that today's real tree (this
// lane's own landing) reports zero violations, matching the acceptance criterion in brief-m9a.md
// ("Reachable: F50 in the manifest and run by the fitness runner ... with 0 violations and 'hops not yet
// enforced: N'").
//
// node:test + node:assert/strict, no npm deps.
// Run: node --test .discipline/fitness/functions/F50-loop-wiring.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  extractWorkflowRunNames,
  hasWorkflowRunEdge,
  familyFiredStatus,
  fitnessFunction,
} from './F50-loop-wiring.mjs';

// ── pure helper: extractWorkflowRunNames / hasWorkflowRunEdge ──────────────────────────────────────

test('extractWorkflowRunNames reads the inline-array form every workflow file in this repo actually uses', () => {
  const yml = 'on:\n  workflow_run:\n    workflows: ["Source sweep", "Data producers"]\n    types: [completed]\n';
  assert.deepEqual(extractWorkflowRunNames(yml), ['Source sweep', 'Data producers']);
});

test('extractWorkflowRunNames reads a multi-line block-list form too (documented bonus, not the primary shape)', () => {
  const yml = 'on:\n  workflow_run:\n    workflows:\n      - "Source sweep"\n      - "Data producers"\n    types: [completed]\n';
  assert.deepEqual(extractWorkflowRunNames(yml), ['Source sweep', 'Data producers']);
});

test('extractWorkflowRunNames returns null when there is no workflow_run trigger at all', () => {
  const yml = 'on:\n  workflow_dispatch:\n    inputs: {}\n';
  assert.equal(extractWorkflowRunNames(yml), null);
});

test('ATTACK: a consumer yml that lacks the workflow_run line does not satisfy hasWorkflowRunEdge', () => {
  const ymlWithoutEdge = 'on:\n  workflow_dispatch:\n    inputs:\n      mode:\n        type: choice\n';
  assert.equal(hasWorkflowRunEdge(ymlWithoutEdge, 'Source sweep'), false);
});

test('ATTACK: a wrong producer name is caught (the real edge names a different workflow)', () => {
  const yml = 'on:\n  workflow_run:\n    workflows: ["Source sweep"]\n    types: [completed]\n';
  assert.equal(hasWorkflowRunEdge(yml, 'Source Sweep (wrong case)'), false);
  assert.equal(hasWorkflowRunEdge(yml, 'Source sweep'), true);
});

// ── pure helper: familyFiredStatus ──────────────────────────────────────────────────────────────────

function withTempFamily(family, artifacts, fn) {
  const repoRoot = mkdtempSync(join(tmpdir(), 'f50-family-'));
  const dir = join(repoRoot, 'fsi-app', 'scripts', 'harness-runs', family);
  mkdirSync(dir, { recursive: true });
  artifacts.forEach((artifact, i) => {
    const runId = `${family}-run-${String(i + 1).padStart(3, '0')}`;
    writeFileSync(join(dir, `${runId}.json`), JSON.stringify({ ...artifact, run_id: runId }));
  });
  try {
    return fn(repoRoot);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
}

test('familyFiredStatus: no directory at all', () => {
  const repoRoot = mkdtempSync(join(tmpdir(), 'f50-nofam-'));
  try {
    assert.deepEqual(familyFiredStatus(repoRoot, 'nonexistent-family'), {
      dirExists: false,
      hasFiredArtifact: false,
    });
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('ATTACK: an enforced-fired hop whose family has only manual artifacts is caught', () => {
  withTempFamily('mint', [{ trigger: 'manual' }, { trigger: 'manual' }], (repoRoot) => {
    const status = familyFiredStatus(repoRoot, 'mint');
    assert.equal(status.dirExists, true);
    assert.equal(status.hasFiredArtifact, false);
  });
});

test('familyFiredStatus: true once one artifact carries trigger workflow_run, even among manual ones', () => {
  withTempFamily('mint', [{ trigger: 'manual' }, { trigger: 'workflow_run' }], (repoRoot) => {
    const status = familyFiredStatus(repoRoot, 'mint');
    assert.equal(status.hasFiredArtifact, true);
  });
});

test('familyFiredStatus: an artifact with no trigger field at all (pre-this-lane artifacts) does not count as fired', () => {
  withTempFamily('mint', [{ metrics: {} }], (repoRoot) => {
    const status = familyFiredStatus(repoRoot, 'mint');
    assert.equal(status.hasFiredArtifact, false);
  });
});

test('familyFiredStatus: a corrupt JSON file is skipped, not thrown on', () => {
  const repoRoot = mkdtempSync(join(tmpdir(), 'f50-corrupt-'));
  const dir = join(repoRoot, 'fsi-app', 'scripts', 'harness-runs', 'mint');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'mint-run-001.json'), '{ not valid json');
  try {
    assert.doesNotThrow(() => familyFiredStatus(repoRoot, 'mint'));
    assert.equal(familyFiredStatus(repoRoot, 'mint').hasFiredArtifact, false);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

// ── LIVE: the real tree, today, reports zero violations ────────────────────────────────────────────

test('LIVE: fitnessFunction.check() over the real committed tree returns zero violations', () => {
  const result = fitnessFunction.check();
  assert.deepEqual(
    result,
    [],
    `expected 0 violations, got: ${JSON.stringify(result, null, 2)}`,
  );
});

test('enumerate() returns exactly one sentinel path (holistic pattern, same as F23/F25/F27/F47)', () => {
  assert.deepEqual(fitnessFunction.enumerate(), ['fsi-app/.discipline/governance/loop-manifest.mjs']);
});
