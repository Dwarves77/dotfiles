// F61-chained-dry-guard-wired.test.mjs, lane CHAINED-DRY-GUARD, 2026-09-29. ATTACK tests: a
// workflow_run-triggered workflow that can set "apply" but never calls the shared gate (or calls it but
// never reads its output) is caught. Plus a live proof that today's real tree (all 8 wired workflows)
// reports zero violations.
//
// node:test + node:assert/strict, no npm deps.
// Run: node --test .discipline/fitness/functions/F61-chained-dry-guard-wired.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fitnessFunction, hasMasterBatchPush } from './F61-chained-dry-guard-wired.mjs';
import { readFile } from '../lib/file-content.mjs';
import { getRepoRoot } from '../../lib/context.mjs';

const WORKFLOW_RUN_YML = `
on:
  workflow_run:
    workflows: ["Source sweep"]
    types: [completed]
jobs:
  x:
    steps:
      - run: |
          mode="apply"
`;

// ── ATTACK: an apply-capable workflow_run workflow with no gate call at all ─────────────────────────

test('ATTACK: workflow_run + "apply" literal + no chained-dry-guard.mjs call = 2 violations (script AND output both missing)', () => {
  const out = fitnessFunction.check('.github/workflows/fixture.yml', WORKFLOW_RUN_YML);
  assert.equal(out.length, 2);
  assert.match(out[0].message, /never calls chained-dry-guard\.mjs/);
  assert.match(out[1].message, /never reads CHAINED_FORCED_DRY/);
});

test('ATTACK: the gate script is called but its output is never consulted (called-and-ignored)', () => {
  const yml = WORKFLOW_RUN_YML.replace(
    'mode="apply"',
    'node scripts/lib/chained-dry-guard.mjs --event x --requested-mode apply >> "$GITHUB_ENV"\n          mode="apply"',
  );
  const out = fitnessFunction.check('.github/workflows/fixture.yml', yml);
  assert.equal(out.length, 1);
  assert.match(out[0].message, /never reads CHAINED_FORCED_DRY/);
});

// ── CONTROL: fully wired workflow reports zero violations ──────────────────────────────────────────

test('CONTROL: gate called AND its output consulted -- zero violations', () => {
  const yml = WORKFLOW_RUN_YML.replace(
    'mode="apply"',
    'node scripts/lib/chained-dry-guard.mjs --event x --requested-mode apply >> "$GITHUB_ENV"\n' +
      '          mode="apply"\n' +
      '          if [ "$CHAINED_FORCED_DRY" = "true" ]; then mode="dry"; fi',
  );
  assert.deepEqual(fitnessFunction.check('.github/workflows/fixture.yml', yml), []);
});

// ── CONTROL: no workflow_run trigger at all -- not this gate's concern ──────────────────────────────

test('CONTROL: a workflow with no workflow_run trigger is skipped entirely, even with a bare "apply" literal', () => {
  const yml = `
on:
  workflow_dispatch:
jobs:
  x:
    steps:
      - run: mode="apply"
`;
  assert.deepEqual(fitnessFunction.check('.github/workflows/fixture.yml', yml), []);
});

// ── CONTROL: workflow_run trigger but no "apply" literal at all (a read-only export) ────────────────

test('CONTROL: workflow_run trigger with no "apply" literal anywhere is skipped (nothing to guard)', () => {
  const yml = `
on:
  workflow_run:
    workflows: ["Population turn"]
    types: [completed]
jobs:
  x:
    steps:
      - run: echo "read only, no write path"
`;
  assert.deepEqual(fitnessFunction.check('.github/workflows/fixture.yml', yml), []);
});

// ── CONTROL: null/undefined content (file vanished) never throws ───────────────────────────────────

test('CONTROL: null content is skipped, not thrown on', () => {
  assert.deepEqual(fitnessFunction.check('.github/workflows/fixture.yml', null), []);
});

// ── LIVE: the real tree, today, reports zero violations (this lane's own fix) ───────────────────────

test('LIVE: every real .github/workflows/*.yml file reports zero violations', () => {
  const files = fitnessFunction.enumerate();
  assert.ok(files.length > 0, 'enumerate() found no workflow files -- check getRepoRoot()/.github/workflows path');
  let violations = [];
  for (const f of files) {
    const content = readFile(f);
    violations = violations.concat(fitnessFunction.check(f, content));
  }
  assert.deepEqual(
    violations,
    [],
    `expected 0 violations, got: ${JSON.stringify(violations, null, 2)}`,
  );
});

// ── ATTACK (lane CHAINED-DRY-GUARD-2, 2026-09-29, coordinator-directed): a machine dispatch requesting
// apply under cadence off must resolve dry -- the live proof run found propagation-drain.yml's guard
// call reachable via downstream-chain.yml's OWN machine-fired workflow_dispatch (the F60 explicit-
// dispatch fallback) without a --chained marker, so the force-dry branch never fired for that path;
// the workflow ran dry only because the caller's own -f mode input happened to say so. This is the
// runtime proof (pure resolveChainedRunMode, in scripts/lib/chained-dry-guard.test.mjs) mirrored here
// as a static content check on the one file known to be reachable that way today.

test('ATTACK: propagation-drain.yml, the one workflow reachable via a machine-fired workflow_dispatch (downstream-chain.yml\'s F60 fallback), wires --chained into its own guard call', () => {
  const dir = join(getRepoRoot(), '.github', 'workflows');
  const text = readFileSync(join(dir, 'propagation-drain.yml'), 'utf8');
  assert.match(
    text,
    /chained-dry-guard\.mjs --event "\$\{\{ github\.event_name \}\}" --requested-mode apply --chained/,
    'expected the guard call to pass --chained (derived from inputs.chain_upstream_run_id being ' +
      'non-empty), so a machine-fired workflow_dispatch is treated like workflow_run for the force-dry ' +
      'decision, not merely trusted to have arrived already-dry from its caller.'
  );
});

test('enumerate() finds every .yml file directly under .github/workflows/', () => {
  const dir = join(getRepoRoot(), '.github', 'workflows');
  const expectedCount = readdirSync(dir).filter((f) => f.endsWith('.yml')).length;
  assert.equal(fitnessFunction.enumerate().length, expectedCount);
});

// ── lane G6-DRAIN (2026-10-06): a push to master on a committed batch path is machine-triggered too ────────

const BATCH_PUSH_YML = `
on:
  push:
    branches: [master]
    paths:
      - 'fsi-app/scripts/turns/theme-briefs/batches/theme-briefs-*.json'
  workflow_dispatch:
jobs:
  x:
    steps:
      - run: |
          node scripts/lib/chained-dry-guard.mjs --event x --requested-mode apply >> "$GITHUB_ENV"
          mode="apply"
          if [ "$CHAINED_FORCED_DRY" = "true" ]; then mode="dry"; fi
`;

test('ATTACK: a batch-path push-to-master workflow that calls the guard WITHOUT --ref is a violation', () => {
  const out = fitnessFunction.check('.github/workflows/fixture.yml', BATCH_PUSH_YML);
  assert.equal(out.length, 1);
  assert.match(out[0].message, /never passes --ref/);
});

test('CONTROL: the same workflow passing --ref to the guard is clean', () => {
  const yml = BATCH_PUSH_YML.replace('--requested-mode apply >>', '--requested-mode apply --ref "${{ github.ref }}" >>');
  assert.deepEqual(fitnessFunction.check('.github/workflows/fixture.yml', yml), []);
});

test('ATTACK: a batch-path push-to-master workflow that never calls the guard at all is a violation', () => {
  const yml = BATCH_PUSH_YML.replace(/node scripts\/lib\/chained-dry-guard\.mjs.*\n/, '').replace('if [ "$CHAINED_FORCED_DRY" = "true" ]; then mode="dry"; fi', '');
  const out = fitnessFunction.check('.github/workflows/fixture.yml', yml);
  assert.equal(out.length, 2);
});

test('CONTROL: a push to master filtered on src/ (a build workflow), or a push to a turn/** branch, is not a batch apply path', () => {
  const build = BATCH_PUSH_YML.replace("fsi-app/scripts/turns/theme-briefs/batches/theme-briefs-*.json", 'fsi-app/src/**').replace(/node scripts\/lib\/chained-dry-guard\.mjs.*\n/, '');
  assert.deepEqual(fitnessFunction.check('.github/workflows/fixture.yml', build), []);
  const turn = BATCH_PUSH_YML.replace('branches: [master]', "branches:\n      - 'turn/**'").replace(/node scripts\/lib\/chained-dry-guard\.mjs.*\n/, '');
  assert.deepEqual(fitnessFunction.check('.github/workflows/fixture.yml', turn), []);
});

test('hasMasterBatchPush reads the block-list branches form too', () => {
  const yml = "on:\n  push:\n    branches:\n      - master\n    paths:\n      - 'fsi-app/scripts/x/*.json'\n  workflow_dispatch:\n";
  assert.equal(hasMasterBatchPush(yml), true);
});
