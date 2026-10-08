// F68-actions-artifact-budget.test.mjs, attack tests for lane R22 (ACTIONS-STORAGE-AND-DOCS-ONLY-PUSH,
// 2026-10-01): a fixture that over-retains must fail, a fixture that paths into _snapshots or
// scripts/tmp must fail, and the matching clean fixture must pass (rule 15: a guard is proven by
// attack, not by presence). Plus a live proof that today's real .github/workflows/*.yml report zero
// violations, so this check is not merely plausible but actually wired against the live tree.
//
// node:test + node:assert/strict, no npm deps.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  extractUploadArtifactSteps,
  evaluateArtifactBudget,
  listWorkflowFiles,
  fitnessFunction,
} from './F68-actions-artifact-budget.mjs';
import { getRepoRoot } from '../../lib/context.mjs';

function wf(stepYaml) {
  return [
    'name: Fixture',
    'on: workflow_dispatch',
    'jobs:',
    '  fixture:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    stepYaml,
  ].join('\n');
}

// ── pure helpers ───────────────────────────────────────────────────────────────────────────────────

test('extractUploadArtifactSteps reads an inline path and an explicit retention-days', () => {
  const text = wf(
    [
      '      - name: Upload',
      '        uses: actions/upload-artifact@v4',
      '        with:',
      '          name: fixture',
      '          path: fsi-app/dossiers/',
      '          retention-days: 7',
    ].join('\n'),
  );
  const steps = extractUploadArtifactSteps(text);
  assert.equal(steps.length, 1);
  assert.equal(steps[0].retentionDays, 7);
  assert.equal(steps[0].pathValue, 'fsi-app/dossiers/');
});

test('extractUploadArtifactSteps reads a block-scalar path across multiple lines', () => {
  const text = wf(
    [
      '      - name: Upload',
      '        uses: actions/upload-artifact@v4',
      '        with:',
      '          name: fixture',
      '          path: |',
      '            fsi-app/scripts/harness-runs/fixture/',
      '            /tmp/fixture.log',
      '          retention-days: 7',
    ].join('\n'),
  );
  const steps = extractUploadArtifactSteps(text);
  assert.equal(steps.length, 1);
  assert.match(steps[0].pathValue, /harness-runs\/fixture/);
  assert.match(steps[0].pathValue, /tmp\/fixture\.log/);
});

test('extractUploadArtifactSteps returns retentionDays null when the step sets none', () => {
  const text = wf(
    [
      '      - name: Upload',
      '        uses: actions/upload-artifact@v4',
      '        with:',
      '          name: fixture',
      '          path: /tmp/fixture.log',
    ].join('\n'),
  );
  const steps = extractUploadArtifactSteps(text);
  assert.equal(steps[0].retentionDays, null);
});

// ── attack: must fail ─────────────────────────────────────────────────────────────────────────────

test('evaluateArtifactBudget FAILS a step with retention-days above 7', () => {
  const text = wf(
    [
      '      - name: Upload',
      '        uses: actions/upload-artifact@v4',
      '        with:',
      '          name: fixture',
      '          path: fsi-app/scripts/harness-runs/fixture/',
      '          retention-days: 90',
    ].join('\n'),
  );
  const out = evaluateArtifactBudget('.github/workflows/fixture.yml', text);
  assert.ok(out.some((m) => /retention-days: 90 exceeds/.test(m)), out.join('\n'));
});

test('evaluateArtifactBudget FAILS a step whose path contains _snapshots (inline)', () => {
  const text = wf(
    [
      '      - name: Upload',
      '        uses: actions/upload-artifact@v4',
      '        with:',
      '          name: fixture',
      '          path: fsi-app/scripts/_snapshots/',
      '          retention-days: 7',
    ].join('\n'),
  );
  const out = evaluateArtifactBudget('.github/workflows/fixture.yml', text);
  assert.ok(out.some((m) => /references '_snapshots'/.test(m)), out.join('\n'));
});

test('evaluateArtifactBudget FAILS a step whose path contains _snapshots (inside a block scalar)', () => {
  const text = wf(
    [
      '      - name: Upload',
      '        uses: actions/upload-artifact@v4',
      '        with:',
      '          name: fixture',
      '          path: |',
      '            fsi-app/scripts/harness-runs/fixture/',
      '            fsi-app/scripts/_snapshots/turn-123/',
      '          retention-days: 7',
    ].join('\n'),
  );
  const out = evaluateArtifactBudget('.github/workflows/fixture.yml', text);
  assert.ok(out.some((m) => /references '_snapshots'/.test(m)), out.join('\n'));
});

test('evaluateArtifactBudget FAILS a step whose path contains scripts/tmp', () => {
  const text = wf(
    [
      '      - name: Upload',
      '        uses: actions/upload-artifact@v4',
      '        with:',
      '          name: fixture',
      '          path: fsi-app/scripts/tmp/select.log',
      '          retention-days: 7',
    ].join('\n'),
  );
  const out = evaluateArtifactBudget('.github/workflows/fixture.yml', text);
  assert.ok(out.some((m) => /references 'scripts\/tmp'/.test(m)), out.join('\n'));
});

// ── the matching clean pair: must pass ────────────────────────────────────────────────────────────

test('evaluateArtifactBudget PASSES a step with retention-days: 7 and a harness-runs-only path', () => {
  const text = wf(
    [
      '      - name: Upload',
      '        uses: actions/upload-artifact@v4',
      '        with:',
      '          name: fixture',
      '          path: |',
      '            fsi-app/scripts/harness-runs/fixture/',
      '            /tmp/fixture.log',
      '          retention-days: 7',
    ].join('\n'),
  );
  assert.deepEqual(evaluateArtifactBudget('.github/workflows/fixture.yml', text), []);
});

test('evaluateArtifactBudget PASSES a step that sets no retention-days at all (no explicit value to judge)', () => {
  const text = wf(
    [
      '      - name: Upload',
      '        uses: actions/upload-artifact@v4',
      '        with:',
      '          name: fixture',
      '          path: fsi-app/scripts/harness-runs/fixture/',
    ].join('\n'),
  );
  assert.deepEqual(evaluateArtifactBudget('.github/workflows/fixture.yml', text), []);
});

test('evaluateArtifactBudget ignores a file with no upload-artifact step at all', () => {
  const text = wf(['      - name: Build', '        run: echo hi'].join('\n'));
  assert.deepEqual(evaluateArtifactBudget('.github/workflows/fixture.yml', text), []);
});

// ── live proof (rule 15: execution over existence) ────────────────────────────────────────────────

test('listWorkflowFiles finds the real .github/workflows directory', () => {
  const files = listWorkflowFiles(getRepoRoot());
  assert.ok(files.length > 10, `expected >10 workflow files, got ${files.length}`);
  assert.ok(files.includes('.github/workflows/discipline.yml'));
});

// GATE-4 (2026-10-07): this test runs the fitness function against the live repo, which the Fitness
// functions job already does on every pull request (gate evaluation B section 7.6: it failed the unit-test
// step while the gate itself passed in the fitness job). It stays runnable here with FITNESS_LIVE_TESTS=1.
const LIVE_TREE = process.env.FITNESS_LIVE_TESTS === '1' ? {} : { skip: 'live-tree self-test, run by the Fitness functions job; set FITNESS_LIVE_TESTS=1 to run it here' };

test('fitnessFunction.check() reports zero violations against the live tree (post-R22 remediation)', LIVE_TREE, () => {
  const out = fitnessFunction.check();
  assert.deepEqual(out, [], JSON.stringify(out, null, 2));
});
