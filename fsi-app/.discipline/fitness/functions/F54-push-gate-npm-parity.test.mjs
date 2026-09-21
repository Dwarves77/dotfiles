// F54-push-gate-npm-parity.test.mjs, attack tests for lane G2 (brief-g2.md item 2: "a workflow with an
// extra test step the hook lacks (must fail); the matching pair (must pass)"), plus a live proof that
// today's real discipline.yml + pre-push report zero violations (rule 15: a guard is proven by attack,
// not by presence, AND a proof must actually execute, this test IS wired into run-test-suite.sh's
// discovery glob, no separate step needed).
//
// node:test + node:assert/strict, no npm deps.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  extractJobBlock,
  extractSteps,
  stepWorkingDirectory,
  stepRunText,
  extractScriptInvocations,
  isCandidateTestStep,
  evaluateStepParity,
  EXEMPT_STEPS,
  fitnessFunction,
} from './F54-push-gate-npm-parity.mjs';
import { getRepoRoot } from '../../lib/context.mjs';
import { readFile, _clearCache } from '../lib/file-content.mjs';

// ── pure helpers ─────────────────────────────────────────────────────────────────────────────────

const FIXTURE_JOB = [
  '  fitness-check:',
  '    name: Fitness functions (application-layer enforcement)',
  '    runs-on: ubuntu-latest',
  '    steps:',
  '      - name: Checkout repository',
  '        uses: actions/checkout@v5',
  '',
  '      - name: Install fsi-app deps',
  '        working-directory: fsi-app',
  '        run: npm ci --prefer-offline --no-audit',
  '',
  '      - name: Run fitness functions',
  '        run: node fsi-app/.discipline/fitness/runner.mjs',
  '',
  '      - name: App unit tests requiring npm deps (*.npmtest.mjs)',
  '        run: sh fsi-app/.discipline/hooks/lib/run-npmtest-suites.sh',
  '',
  '  rendering-guard:',
  '    name: Rendering guard',
].join('\n');

function wrapWholeFile(jobText) {
  return `name: Discipline engine\n\njobs:\n${jobText}\n`;
}

test('extractJobBlock finds the named job and stops before the next top-level job key', () => {
  const block = extractJobBlock(wrapWholeFile(FIXTURE_JOB), 'fitness-check');
  assert.match(block, /name: Fitness functions/);
  assert.match(block, /App unit tests requiring npm deps/);
  assert.doesNotMatch(block, /rendering-guard:/);
});

test('extractJobBlock returns null for a job key that does not exist', () => {
  assert.equal(extractJobBlock(wrapWholeFile(FIXTURE_JOB), 'no-such-job'), null);
});

test('extractSteps splits on the 6-space "- name:" boundary and captures each step body', () => {
  const block = extractJobBlock(wrapWholeFile(FIXTURE_JOB), 'fitness-check');
  const steps = extractSteps(block);
  assert.deepEqual(
    steps.map((s) => s.name),
    ['Checkout repository', 'Install fsi-app deps', 'Run fitness functions', 'App unit tests requiring npm deps (*.npmtest.mjs)'],
  );
});

test('stepRunText reads an inline scalar and a block scalar the same way', () => {
  const inline = '      - name: X\n        run: node foo.mjs\n';
  assert.equal(stepRunText(inline), 'node foo.mjs');

  const block = '      - name: X\n        run: |\n          set -u\n          node foo.mjs\n\n      - name: Y\n        run: node bar.mjs\n';
  assert.equal(stepRunText(block).trim(), 'set -u\n          node foo.mjs'.trim());
});

test('stepRunText returns null for a uses: step with no run:', () => {
  assert.equal(stepRunText('      - name: Checkout\n        uses: actions/checkout@v5\n'), null);
});

test('stepWorkingDirectory reads the step-level field, null when absent', () => {
  assert.equal(stepWorkingDirectory('      - name: X\n        working-directory: fsi-app\n        run: node y.mjs\n'), 'fsi-app');
  assert.equal(stepWorkingDirectory('      - name: X\n        run: node y.mjs\n'), null);
});

test('extractScriptInvocations finds node/sh/bash script calls and joins working-directory the way GitHub Actions resolves a relative arg', () => {
  assert.deepEqual(extractScriptInvocations('node fsi-app/.discipline/fitness/runner.mjs', null), [
    'fsi-app/.discipline/fitness/runner.mjs',
  ]);
  assert.deepEqual(extractScriptInvocations('node scripts/verify/run-goldens.mjs', 'fsi-app'), [
    'fsi-app/scripts/verify/run-goldens.mjs',
  ]);
  // Already-prefixed and absolute paths are left alone.
  assert.deepEqual(extractScriptInvocations('sh fsi-app/x.sh', 'fsi-app'), ['fsi-app/x.sh']);
  // A step with no node/sh/bash script invocation (e.g. npm ci, or a curl+tar+binary run) finds nothing.
  assert.deepEqual(extractScriptInvocations('npm ci --prefer-offline --no-audit', 'fsi-app'), []);
  assert.deepEqual(extractScriptInvocations(null, 'fsi-app'), []);
});

test('isCandidateTestStep matches on "test", "golden" or "lint" substrings, case-insensitively', () => {
  assert.equal(isCandidateTestStep('App unit tests requiring npm deps (*.npmtest.mjs)'), true);
  assert.equal(isCandidateTestStep('Behavioral goldens (scripts/verify/*.golden.mjs)'), true);
  assert.equal(isCandidateTestStep('actionlint (pinned, checksum-verified) over .github/workflows'), true);
  assert.equal(isCandidateTestStep('Setup Node'), false);
  assert.equal(isCandidateTestStep('Checkout repository'), false);
  assert.equal(isCandidateTestStep('Install fsi-app deps'), false);
});

// ── evaluateStepParity: the attack pair (brief-g2.md item 2) ────────────────────────────────────────

test('ATTACK: a workflow with an extra test step the hook lacks, MUST FAIL', () => {
  const jobWithExtraStep = [
    '  fitness-check:',
    '    name: Fitness functions (application-layer enforcement)',
    '    steps:',
    '      - name: Run fitness functions',
    '        run: node fsi-app/.discipline/fitness/runner.mjs',
    '',
    '      - name: App new unit tests requiring npm deps (*.newtest.mjs)',
    '        run: node fsi-app/scripts/verify/new-thing.mjs',
  ].join('\n');
  const steps = extractSteps(extractJobBlock(wrapWholeFile(jobWithExtraStep), 'fitness-check'));
  // Hook only knows about the fitness runner, not the new step.
  const hookText = '#!/bin/sh\nnode fsi-app/.discipline/fitness/runner.mjs\n';
  const violations = evaluateStepParity(steps, hookText, EXEMPT_STEPS);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /App new unit tests requiring npm deps/);
  assert.match(violations[0], /fsi-app\/scripts\/verify\/new-thing\.mjs/);
});

test('ATTACK: the matching pair, the hook also calls the new step\'s script, MUST PASS', () => {
  const jobWithExtraStep = [
    '  fitness-check:',
    '    name: Fitness functions (application-layer enforcement)',
    '    steps:',
    '      - name: Run fitness functions',
    '        run: node fsi-app/.discipline/fitness/runner.mjs',
    '',
    '      - name: App new unit tests requiring npm deps (*.newtest.mjs)',
    '        run: node fsi-app/scripts/verify/new-thing.mjs',
  ].join('\n');
  const steps = extractSteps(extractJobBlock(wrapWholeFile(jobWithExtraStep), 'fitness-check'));
  const hookText = '#!/bin/sh\nnode fsi-app/.discipline/fitness/runner.mjs\nnode fsi-app/scripts/verify/new-thing.mjs\n';
  const violations = evaluateStepParity(steps, hookText, EXEMPT_STEPS);
  assert.deepEqual(violations, []);
});

test('a step whose name is test-shaped but has no discoverable script, and is not exempt, FAILS', () => {
  const job = [
    '  fitness-check:',
    '    name: Fitness functions (application-layer enforcement)',
    '    steps:',
    '      - name: Some other lint step',
    '        run: /tmp/some-binary --lint .',
  ].join('\n');
  const steps = extractSteps(extractJobBlock(wrapWholeFile(job), 'fitness-check'));
  const violations = evaluateStepParity(steps, '#!/bin/sh\n', []);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /no node\/sh\/bash script invocation was found/);
});

test('an EXEMPT_STEPS entry with no script found and a nameContains match is skipped, not a violation', () => {
  const job = [
    '  fitness-check:',
    '    name: Fitness functions (application-layer enforcement)',
    '    steps:',
    '      - name: actionlint over workflows',
    '        run: /tmp/actionlint .github/workflows/*.yml',
  ].join('\n');
  const steps = extractSteps(extractJobBlock(wrapWholeFile(job), 'fitness-check'));
  const violations = evaluateStepParity(steps, '#!/bin/sh\n', EXEMPT_STEPS);
  assert.deepEqual(violations, []);
});

test('an exemption entry missing a date or a reason fails the check ("nothing else goes in that table")', () => {
  const job = [
    '  fitness-check:',
    '    name: Fitness functions (application-layer enforcement)',
    '    steps:',
    '      - name: actionlint over workflows',
    '        run: /tmp/actionlint .github/workflows/*.yml',
  ].join('\n');
  const steps = extractSteps(extractJobBlock(wrapWholeFile(job), 'fitness-check'));
  const undated = [{ nameContains: 'actionlint', reason: 'no date though' }];
  const v1 = evaluateStepParity(steps, '#!/bin/sh\n', undated);
  assert.equal(v1.length, 1);
  assert.match(v1[0], /missing a decidedOn date or a reason/);

  const unreasoned = [{ nameContains: 'actionlint', decidedOn: '2026-09-21' }];
  const v2 = evaluateStepParity(steps, '#!/bin/sh\n', unreasoned);
  assert.equal(v2.length, 1);
  assert.match(v2[0], /missing a decidedOn date or a reason/);
});

test('EXEMPT_STEPS entries in the shipped table each carry a decidedOn date and a non-empty reason', () => {
  assert.ok(EXEMPT_STEPS.length >= 1);
  for (const e of EXEMPT_STEPS) {
    assert.match(e.decidedOn, /^\d{4}-\d{2}-\d{2}$/, `${e.nameContains}: decidedOn must be a YYYY-MM-DD date`);
    assert.ok(e.reason && e.reason.trim().length > 0, `${e.nameContains}: reason must be non-empty`);
  }
});

// ── live proof against the real tree: zero violations today ─────────────────────────────────────────

test('LIVE: today\'s real discipline.yml "Fitness functions" job and the real pre-push hook report zero violations', () => {
  _clearCache();
  const root = getRepoRoot();
  const ymlText = readFile('.github/workflows/discipline.yml');
  const hookText = readFile('fsi-app/.discipline/hooks/pre-push');
  assert.ok(ymlText, 'discipline.yml must be readable from the repo root');
  assert.ok(hookText, 'pre-push hook must be readable from the repo root');
  const jobBlock = extractJobBlock(ymlText, 'fitness-check');
  assert.ok(jobBlock, 'the fitness-check job must exist in discipline.yml');
  const steps = extractSteps(jobBlock);
  const violations = evaluateStepParity(steps, hookText, EXEMPT_STEPS);
  assert.deepEqual(violations, [], `RD-79 parity gap(s) on the real tree:\n${violations.join('\n')}`);
  void root;
});

test('fitnessFunction.check() itself returns zero violations against the checked-out tree', () => {
  _clearCache();
  const result = fitnessFunction.check();
  assert.deepEqual(result, [], `F54 violations:\n${result.map((v) => v.message).join('\n')}`);
});
