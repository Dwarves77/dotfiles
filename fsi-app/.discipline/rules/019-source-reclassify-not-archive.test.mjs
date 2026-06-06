// Fire-tests for rule 019 (source-not-item reclassified, not raw-archived).
// Run: node --test fsi-app/.discipline/rules/019-source-reclassify-not-archive.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rule } from './019-source-reclassify-not-archive.mjs';
import { buildContextFromFixture } from '../lib/context.mjs';

const RAW_ARCHIVE_AS_SOURCE =
  'import { archiveRows } from "./lib/db.mjs";\n' +
  'await archiveRows("intelligence_items", ids, { cite, archive_reason: "source_not_item" });\n';
const SAFE_RECLASSIFY =
  'import { reclassifyToSource } from "./lib/db.mjs";\n' +
  'await reclassifyToSource(ids, { url, base_tier: 3 }, { cite });\n';
const ARCHIVE_NON_SOURCE =
  'import { archiveRows } from "./lib/db.mjs";\n' +
  'await archiveRows("intelligence_items", ids, { cite, archive_reason: "duplicate" });\n';

test('019 trigger: fires on a staged scripts/*.mjs', () => {
  const ctx = buildContextFromFixture({
    message: 'remediate: archive',
    files: [{ path: 'fsi-app/scripts/verify/x.mjs', additions: 5, deletions: 0 }],
  });
  assert.equal(rule.trigger(ctx), true);
});

test('019 trigger: skips _diag and lib', () => {
  const ctx = buildContextFromFixture({
    message: 'diag',
    files: [
      { path: 'fsi-app/scripts/_diag/x.mjs', additions: 5, deletions: 0 },
      { path: 'fsi-app/scripts/lib/db.mjs', additions: 5, deletions: 0 },
    ],
  });
  assert.equal(rule.trigger(ctx), false);
});

test('019 check: FAIL — raw archive with a source-y reason, no reclassifyToSource (the corrected error)', () => {
  const ctx = buildContextFromFixture({
    message: 'remediate: archive portals',
    files: [{ path: 'fsi-app/scripts/verify/remediate-archive.mjs', additions: 10, deletions: 0 }],
    fileContents: { 'fsi-app/scripts/verify/remediate-archive.mjs': RAW_ARCHIVE_AS_SOURCE },
  });
  const r = rule.check(ctx);
  assert.equal(r.status, 'FAIL');
  assert.ok(r.message.includes('without registering'));
  assert.ok(r.remediation.includes('reclassifyToSource'));
});

test('019 check: PASS — uses reclassifyToSource (register-then-archive)', () => {
  const ctx = buildContextFromFixture({
    message: 'remediate: reclassify',
    files: [{ path: 'fsi-app/scripts/verify/reclassify.mjs', additions: 10, deletions: 0 }],
    fileContents: { 'fsi-app/scripts/verify/reclassify.mjs': SAFE_RECLASSIFY },
  });
  assert.equal(rule.check(ctx).status, 'PASS');
});

test('019 check: PASS — archive with a non-source reason is untouched', () => {
  const ctx = buildContextFromFixture({
    message: 'remediate: dedupe',
    files: [{ path: 'fsi-app/scripts/verify/dedupe.mjs', additions: 10, deletions: 0 }],
    fileContents: { 'fsi-app/scripts/verify/dedupe.mjs': ARCHIVE_NON_SOURCE },
  });
  assert.equal(rule.check(ctx).status, 'PASS');
});

test('019 check: PASS — override trailer present', () => {
  const ctx = buildContextFromFixture({
    message: 'remediate: legacy\n\nSource-Reclassify-Override: legacy one-shot, source already registered',
    files: [{ path: 'fsi-app/scripts/verify/legacy.mjs', additions: 10, deletions: 0 }],
    fileContents: { 'fsi-app/scripts/verify/legacy.mjs': RAW_ARCHIVE_AS_SOURCE },
  });
  assert.equal(rule.check(ctx).status, 'PASS');
});

test('019: metadata', () => {
  assert.equal(rule.id, '019');
  assert.ok(rule.ruleSource.includes('source-credibility-model'));
});
