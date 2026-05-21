import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rule } from './015-post-push-verification.mjs';
import { buildContextFromFixture } from '../lib/context.mjs';

// ---------------------------------------------------------------------------
// Trigger
// ---------------------------------------------------------------------------

test('015 trigger: skips when not on master', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: stuff',
    files: [
      { path: 'fsi-app/src/lib/a.ts', additions: 20, deletions: 0 },
      { path: 'fsi-app/src/lib/b.ts', additions: 20, deletions: 0 },
    ],
    branch: 'feat/foo',
  });
  assert.equal(rule.trigger(ctx), false);
});

test('015 trigger: skips merge commits', () => {
  const ctx = buildContextFromFixture({
    message: 'Merge branch foo',
    files: [
      { path: 'fsi-app/src/lib/a.ts', additions: 20, deletions: 0 },
      { path: 'fsi-app/src/lib/b.ts', additions: 20, deletions: 0 },
    ],
    branch: 'master',
    isMergeCommit: true,
  });
  assert.equal(rule.trigger(ctx), false);
});

test('015 trigger: skips investigation-only commits', () => {
  const ctx = buildContextFromFixture({
    message: 'audit: explore migration drift',
    files: [
      { path: 'docs/audit.md', additions: 50, deletions: 0 },
      { path: 'docs/audit2.md', additions: 50, deletions: 0 },
    ],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), false);
});

test('015 trigger: skips trivial commits (<=1 file, <=5 additions)', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: tiny tweak',
    files: [{ path: 'fsi-app/src/lib/a.ts', additions: 3, deletions: 0 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), false);
});

test('015 trigger: fires when applicable + non-trivial', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: substantial work',
    files: [
      { path: 'fsi-app/src/lib/a.ts', additions: 20, deletions: 0 },
      { path: 'fsi-app/src/lib/b.ts', additions: 20, deletions: 0 },
    ],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), true);
});

test('015 trigger: fires for substantial single-file commit with many additions', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: big single file',
    files: [{ path: 'fsi-app/src/lib/a.ts', additions: 200, deletions: 0 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), true);
});

// ---------------------------------------------------------------------------
// Check
// ---------------------------------------------------------------------------

const SUBSTANTIAL_FILES = [
  { path: 'fsi-app/src/lib/a.ts', additions: 20, deletions: 0 },
  { path: 'fsi-app/src/lib/b.ts', additions: 20, deletions: 0 },
];

function makeCtx(message) {
  return buildContextFromFixture({
    message,
    files: SUBSTANTIAL_FILES,
    branch: 'master',
  });
}

test('015 check: PASS when both trailers present with valid values', () => {
  const ctx = makeCtx([
    'feat: substantial work',
    '',
    'CI-Status: PASS',
    'Deploy-Status: READY',
  ].join('\n'));
  assert.equal(rule.check(ctx).status, 'PASS');
});

test('015 check: PASS for BOOTSTRAP values', () => {
  const ctx = makeCtx('feat: x\n\nCI-Status: BOOTSTRAP\nDeploy-Status: BOOTSTRAP');
  assert.equal(rule.check(ctx).status, 'PASS');
});

test('015 check: PASS for N/A values', () => {
  const ctx = makeCtx('feat: x\n\nCI-Status: N/A\nDeploy-Status: N/A');
  assert.equal(rule.check(ctx).status, 'PASS');
});

test('015 check: FAIL when both trailers missing', () => {
  const ctx = makeCtx('feat: substantial work\n\nno trailers here');
  const result = rule.check(ctx);
  assert.equal(result.status, 'FAIL');
  assert.match(result.message, /CI-Status:.*Deploy-Status:/);
});

test('015 check: FAIL when only CI-Status present', () => {
  const ctx = makeCtx('feat: x\n\nCI-Status: PASS');
  const result = rule.check(ctx);
  assert.equal(result.status, 'FAIL');
  assert.match(result.message, /Deploy-Status:/);
});

test('015 check: FAIL when only Deploy-Status present', () => {
  const ctx = makeCtx('feat: x\n\nDeploy-Status: READY');
  const result = rule.check(ctx);
  assert.equal(result.status, 'FAIL');
  assert.match(result.message, /CI-Status:/);
});

test('015 check: FAIL when CI-Status value invalid', () => {
  const ctx = makeCtx('feat: x\n\nCI-Status: GREEN\nDeploy-Status: READY');
  const result = rule.check(ctx);
  assert.equal(result.status, 'FAIL');
  assert.match(result.message, /invalid value/);
});

test('015 check: FAIL when Deploy-Status value invalid', () => {
  const ctx = makeCtx('feat: x\n\nCI-Status: PASS\nDeploy-Status: GREEN');
  const result = rule.check(ctx);
  assert.equal(result.status, 'FAIL');
  assert.match(result.message, /invalid value/);
});

test('015 check: PASS for FAIL/ERROR values (rule does not gate; surfaces in audit)', () => {
  const ctx = makeCtx('feat: x\n\nCI-Status: FAIL\nDeploy-Status: ERROR');
  assert.equal(rule.check(ctx).status, 'PASS');
});

test('015 check: FAIL when CI-Status: PENDING without Recheck-Timeline', () => {
  const ctx = makeCtx('feat: x\n\nCI-Status: PENDING\nDeploy-Status: READY');
  const result = rule.check(ctx);
  assert.equal(result.status, 'FAIL');
  assert.match(result.message, /Recheck-Timeline/);
});

test('015 check: FAIL when Deploy-Status: BUILDING without Recheck-Timeline', () => {
  const ctx = makeCtx('feat: x\n\nCI-Status: PASS\nDeploy-Status: BUILDING');
  const result = rule.check(ctx);
  assert.equal(result.status, 'FAIL');
  assert.match(result.message, /Recheck-Timeline/);
});

test('015 check: PASS for PENDING with Recheck-Timeline', () => {
  const ctx = makeCtx([
    'feat: x',
    '',
    'CI-Status: PENDING',
    'Deploy-Status: BUILDING',
    'Recheck-Timeline: within 5 minutes of push',
  ].join('\n'));
  assert.equal(rule.check(ctx).status, 'PASS');
});

test('015 check: PASS when Verification-Override present with substantive rationale', () => {
  const ctx = makeCtx('feat: x\n\nVerification-Override: emergency hotfix; parent CI status unreachable from this dispatch context');
  assert.equal(rule.check(ctx).status, 'PASS');
});

test('015 check: FAIL when Verification-Override present but rationale too short', () => {
  const ctx = makeCtx('feat: x\n\nVerification-Override: tldr');
  const result = rule.check(ctx);
  assert.equal(result.status, 'FAIL');
  assert.match(result.message, /rationale is empty or too short/);
});

test('015 check: lowercase trailer values normalized to uppercase for matching', () => {
  const ctx = makeCtx('feat: x\n\nCI-Status: pass\nDeploy-Status: ready');
  assert.equal(rule.check(ctx).status, 'PASS');
});

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

test('015: has required metadata fields', () => {
  assert.equal(rule.id, '015');
  assert.ok(rule.name.length > 0);
  assert.ok(rule.description.length > 0);
  assert.ok(rule.ruleSource.includes('ADR-010'));
});
