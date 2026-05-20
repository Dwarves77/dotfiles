// Tests for rule 009. Run: node --test fsi-app/.discipline/rules/009-plan-skill-hybrid.test.mjs

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  rule,
  _branchSignalsCoordination,
  _parseCoordinationCount,
  _extractPlanFileReference,
} from './009-plan-skill-hybrid.mjs';
import { buildContextFromFixture } from '../lib/context.mjs';

// ---------------------------------------------------------------------------
// Trigger: skips
// ---------------------------------------------------------------------------

test('009 trigger: skips when not on master', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: ship\n\nCoordination: 3 dispatches',
    files: Array.from({ length: 10 }, (_, i) => ({ path: `src/f${i}.ts`, additions: 5, deletions: 5 })),
    branch: 'feat/track-foo',
  });
  // Branch is not master, so trigger should skip regardless of attestation.
  // (rule.trigger checks isOnMaster first; "feat/track-foo" doesn't match master/main.)
  assert.equal(rule.trigger(ctx), false);
});

test('009 trigger: skips single-dispatch attested commit', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: ship\n\nCoordination: 1 dispatch (single)',
    files: Array.from({ length: 10 }, (_, i) => ({ path: `src/f${i}.ts`, additions: 5, deletions: 5 })),
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), false);
});

test('009 trigger: skips 2-dispatch attested commit', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: ship\n\nCoordination: 2 dispatches (design + implementation)',
    files: Array.from({ length: 10 }, (_, i) => ({ path: `src/f${i}.ts`, additions: 5, deletions: 5 })),
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), false);
});

test('009 trigger: skips commit with neutral branch name and no Coordination line', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: routine update',
    files: Array.from({ length: 10 }, (_, i) => ({ path: `src/f${i}.ts`, additions: 5, deletions: 5 })),
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), false);
});

test('009 trigger: skips audit dispatch type even if branch suggests coordination', () => {
  const ctx = buildContextFromFixture({
    message: 'audit: review track-a outputs',
    files: Array.from({ length: 6 }, (_, i) => ({ path: `docs/r${i}.md`, additions: 80, deletions: 0 })),
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), false);
});

// ---------------------------------------------------------------------------
// Trigger: fires
// ---------------------------------------------------------------------------

test('009 trigger: fires on 3-dispatch self-attestation', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: track-a ship\n\nCoordination: 3 dispatches (A, B, C)',
    files: Array.from({ length: 10 }, (_, i) => ({ path: `src/f${i}.ts`, additions: 5, deletions: 5 })),
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), true);
});

test('009 trigger: fires on branch name containing track-', () => {
  // The trigger reads ctx.branchName. We need the merge commit's recorded branch
  // to expose the multi-dispatch signal; in practice the feature branch lives
  // through the squashed commit's CI run. Test the signal via _branchSignalsCoordination.
  assert.equal(_branchSignalsCoordination('feat/track-a-foo'), true);
  assert.equal(_branchSignalsCoordination('phase-7-triage-ui'), true);
  assert.equal(_branchSignalsCoordination('wave-1-foo'), true);
  assert.equal(_branchSignalsCoordination('multi-track-bar'), true);
});

test('009 trigger: branch signal returns false for unrelated branches', () => {
  assert.equal(_branchSignalsCoordination('master'), false);
  assert.equal(_branchSignalsCoordination('feat/foo'), false);
  assert.equal(_branchSignalsCoordination('fix/jurisdictions-null'), false);
  assert.equal(_branchSignalsCoordination(null), false);
});

// ---------------------------------------------------------------------------
// Helper: parseCoordinationCount
// ---------------------------------------------------------------------------

test('009 helper: parseCoordinationCount returns number when present', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: x\n\nCoordination: 5 dispatches',
    files: [{ path: 'src/x.ts', additions: 1, deletions: 0 }],
    branch: 'master',
  });
  assert.equal(_parseCoordinationCount(ctx), 5);
});

test('009 helper: parseCoordinationCount returns null when absent', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: x\n\nbody only',
    files: [{ path: 'src/x.ts', additions: 1, deletions: 0 }],
    branch: 'master',
  });
  assert.equal(_parseCoordinationCount(ctx), null);
});

// ---------------------------------------------------------------------------
// Helper: extractPlanFileReference
// ---------------------------------------------------------------------------

test('009 helper: extractPlanFileReference handles simple path', () => {
  assert.equal(_extractPlanFileReference('Plan-file: fsi-app/docs/plans/2026-05-20-foo.md'), 'fsi-app/docs/plans/2026-05-20-foo.md');
});

test('009 helper: extractPlanFileReference strips surrounding backticks', () => {
  assert.equal(_extractPlanFileReference('Plan-file: `fsi-app/docs/plans/2026-05-20-foo.md`'), 'fsi-app/docs/plans/2026-05-20-foo.md');
});

test('009 helper: extractPlanFileReference strips trailing parenthetical', () => {
  assert.equal(_extractPlanFileReference('Plan-file: fsi-app/docs/plans/2026-05-20-foo.md (authored 2026-05-20)'), 'fsi-app/docs/plans/2026-05-20-foo.md');
});

// ---------------------------------------------------------------------------
// Check: presence
// ---------------------------------------------------------------------------

test('009 check: FAIL when no Plan-file line', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: multi-track ship\n\nCoordination: 3 dispatches',
    files: Array.from({ length: 10 }, (_, i) => ({ path: `src/f${i}.ts`, additions: 5, deletions: 5 })),
    branch: 'master',
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'FAIL');
  assert.ok(result.message.includes('Plan-file'));
});

// ---------------------------------------------------------------------------
// Check: file existence (using a hermetic tmp plan dir)
// ---------------------------------------------------------------------------

let tmpDir;
let planAbsPath;

before(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'rule009-plan-'));
  const plansDir = join(tmpDir, 'plans');
  mkdirSync(plansDir);
  planAbsPath = join(plansDir, '2026-05-20-test-coordination.md');
  writeFileSync(planAbsPath, '# Test plan\n');
});

after(() => {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

test('009 check: PASS when Plan-file references an existing absolute path', () => {
  const ctx = buildContextFromFixture({
    message: [
      'feat: multi-track ship',
      '',
      'Coordination: 3 dispatches',
      `Plan-file: ${planAbsPath}`,
    ].join('\n'),
    files: Array.from({ length: 10 }, (_, i) => ({ path: `src/f${i}.ts`, additions: 5, deletions: 5 })),
    branch: 'master',
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'PASS');
});

test('009 check: FAIL when Plan-file references a non-existent path', () => {
  const ctx = buildContextFromFixture({
    message: [
      'feat: multi-track ship',
      '',
      'Coordination: 3 dispatches',
      'Plan-file: fsi-app/docs/plans/2099-99-99-does-not-exist.md',
    ].join('\n'),
    files: Array.from({ length: 10 }, (_, i) => ({ path: `src/f${i}.ts`, additions: 5, deletions: 5 })),
    branch: 'master',
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'FAIL');
  assert.ok(result.message.toLowerCase().includes('do not exist') || result.message.toLowerCase().includes('not exist'));
});

test('009 check: PASS when one of multiple Plan-file lines references an existing path', () => {
  const ctx = buildContextFromFixture({
    message: [
      'feat: multi-track ship referencing two plans',
      '',
      'Coordination: 3 dispatches',
      'Plan-file: fsi-app/docs/plans/2099-99-99-does-not-exist.md',
      `Plan-file: ${planAbsPath}`,
    ].join('\n'),
    files: Array.from({ length: 10 }, (_, i) => ({ path: `src/f${i}.ts`, additions: 5, deletions: 5 })),
    branch: 'master',
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'PASS');
});

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

test('009: has required metadata fields', () => {
  assert.equal(rule.id, '009');
  assert.equal(typeof rule.name, 'string');
  assert.equal(typeof rule.description, 'string');
  assert.ok(rule.ruleSource.includes('sprint-followups-discipline'));
});
