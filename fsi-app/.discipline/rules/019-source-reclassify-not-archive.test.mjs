// Fire-tests for rule 019 (source-not-item reclassified, not raw-archived).
// Run: node --test fsi-app/.discipline/rules/019-source-reclassify-not-archive.test.mjs
//
// Lane GATE-1 (2026-10-08): the rule charges INTRODUCED lines only. A script that already carried a
// source-y archive on a line the commit does not add, edit into it, or move, is not the commit's defect.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rule } from './019-source-reclassify-not-archive.mjs';
import { buildContextFromFixture } from '../lib/context.mjs';

const IMPORT_ARCHIVE = 'import { archiveRows } from "./lib/db.mjs";';
const ARCHIVE_AS_SOURCE = 'await archiveRows("intelligence_items", ids, { cite, archive_reason: "source_not_item" });';
const SAFE_IMPORT = 'import { reclassifyToSource } from "./lib/db.mjs";';
const SAFE_CALL = 'await reclassifyToSource(ids, { url, base_tier: 3 }, { cite });';
const ARCHIVE_NON_SOURCE = 'await archiveRows("intelligence_items", ids, { cite, archive_reason: "duplicate" });';
const PATH = 'fsi-app/scripts/verify/remediate-archive.mjs';

// A new script: every line introduced.
function newScript(lines, path = PATH) {
  return buildContextFromFixture({
    message: 'remediate: archive',
    files: [{ path, status: 'A', additions: lines.length, deletions: 0 }],
    changes: [{ path, status: 'A', added: lines }],
    fileContents: { [path]: `${lines.join('\n')}\n` },
  });
}

// An edit to a script whose post-image is `post`.
function edit(post, hunk, path = PATH) {
  return buildContextFromFixture({
    message: 'remediate: edit',
    files: [{ path, status: 'M' }],
    changes: [{ path, ...hunk }],
    fileContents: { [path]: `${post.join('\n')}\n` },
  });
}

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

test('019 check: FAIL, a new raw archive with a source-y reason and no reclassifyToSource (the corrected error)', () => {
  const r = rule.check(newScript([IMPORT_ARCHIVE, ARCHIVE_AS_SOURCE]));
  assert.equal(r.status, 'FAIL');
  assert.ok(r.message.includes('without registering'));
  assert.ok(r.remediation.includes('reclassifyToSource'));
  assert.deepEqual(r.locations, [{ path: PATH, line: 2 }]);
});

test('019 check: PASS, uses reclassifyToSource (register-then-archive)', () => {
  assert.equal(rule.check(newScript([SAFE_IMPORT, SAFE_CALL])).status, 'PASS');
});

test('019 check: PASS, archive with a non-source reason is untouched', () => {
  assert.equal(rule.check(newScript([IMPORT_ARCHIVE, ARCHIVE_NON_SOURCE])).status, 'PASS');
});

test('019 check: the Source-Reclassify-Override trailer is gone, it no longer excuses a raw archive', () => {
  const ctx = buildContextFromFixture({
    message: 'remediate: legacy\n\nSource-Reclassify-Override: legacy one-shot, source already registered',
    files: [{ path: PATH, status: 'A', additions: 2, deletions: 0 }],
    changes: [{ path: PATH, status: 'A', added: [IMPORT_ARCHIVE, ARCHIVE_AS_SOURCE] }],
    fileContents: { [PATH]: `${IMPORT_ARCHIVE}\n${ARCHIVE_AS_SOURCE}\n` },
  });
  const r = rule.check(ctx);
  assert.equal(r.status, 'FAIL');
  assert.ok(!r.remediation.includes('Source-Reclassify-Override'), 'the hook message must not offer a trailer that is not honoured');
});

test('019 scope: PASS, a legacy script with a raw source-y archive is edited on an unrelated line', () => {
  const post = [IMPORT_ARCHIVE, ARCHIVE_AS_SOURCE, 'console.log("done, edited");'];
  const ctx = edit(post, { removed: ['console.log("done");'], added: ['console.log("done, edited");'], oldStart: 3, newStart: 3 });
  assert.equal(rule.trigger(ctx), true);
  assert.equal(rule.check(ctx).status, 'PASS');
});

test('019 scope: PASS, the line that already carried the archive is edited (same call, different ids)', () => {
  const post = [IMPORT_ARCHIVE, 'await archiveRows("intelligence_items", moreIds, { cite, archive_reason: "source_not_item" });'];
  const ctx = edit(post, { removed: [ARCHIVE_AS_SOURCE], added: [post[1]], oldStart: 2, newStart: 2 });
  assert.equal(rule.check(ctx).status, 'PASS');
});

test('019 scope: PASS, the archive line is MOVED from another script', () => {
  const ctx = buildContextFromFixture({
    message: 'refactor: move',
    files: [{ path: 'fsi-app/scripts/verify/old.mjs' }, { path: PATH, status: 'A' }],
    changes: [
      { path: 'fsi-app/scripts/verify/old.mjs', removed: [ARCHIVE_AS_SOURCE] },
      { path: PATH, status: 'A', added: [IMPORT_ARCHIVE, ARCHIVE_AS_SOURCE] },
    ],
    fileContents: { [PATH]: `${IMPORT_ARCHIVE}\n${ARCHIVE_AS_SOURCE}\n` },
  });
  assert.equal(rule.check(ctx).status, 'PASS');
});

test('019 scope: FAIL, a source-y archive INTRODUCED into an existing script', () => {
  const post = [IMPORT_ARCHIVE, ARCHIVE_NON_SOURCE, ARCHIVE_AS_SOURCE];
  const ctx = edit(post, { added: [ARCHIVE_AS_SOURCE], oldStart: 2, newStart: 3 });
  const r = rule.check(ctx);
  assert.equal(r.status, 'FAIL');
  assert.deepEqual(r.locations, [{ path: PATH, line: 3 }]);
});

test('019 scope: FAIL, an edit that changes the archive reason to a source-y one', () => {
  const post = [IMPORT_ARCHIVE, ARCHIVE_AS_SOURCE];
  const ctx = edit(post, { removed: [ARCHIVE_NON_SOURCE], added: [ARCHIVE_AS_SOURCE], oldStart: 2, newStart: 2 });
  assert.equal(rule.check(ctx).status, 'FAIL');
});

test('019: metadata', () => {
  assert.equal(rule.id, '019');
  assert.ok(rule.ruleSource.includes('source-credibility-model'));
});

// ---------------------------------------------------------------------------
// GATE-7 (2026-10-08): honest forms from the AUD-AT-3 attack register.
// ---------------------------------------------------------------------------

test('019 GATE-7 A019-1: a source-y reason built by string concatenation is the reason', () => {
  const split = 'await archiveRows("intelligence_items", ids, { cite, archive_reason: "source_" + "not_item" });';
  assert.equal(rule.check(newScript([IMPORT_ARCHIVE, split])).status, 'FAIL');
});

test('019 GATE-7 A019-2: the sanctioned helper named in a comment or a string does not excuse the archive', () => {
  assert.equal(rule.check(newScript([IMPORT_ARCHIVE, '// uses reclassifyToSource elsewhere', ARCHIVE_AS_SOURCE])).status, 'FAIL');
  assert.equal(rule.check(newScript([IMPORT_ARCHIVE, 'const note = "reclassifyToSource";', ARCHIVE_AS_SOURCE])).status, 'FAIL');
  assert.equal(rule.check(newScript([SAFE_IMPORT, ARCHIVE_AS_SOURCE, SAFE_CALL])).status, 'PASS');
});

test('019 GATE-7 A019-3: scripts/lib is exempt only for the helper itself', () => {
  const lines = [IMPORT_ARCHIVE, ARCHIVE_AS_SOURCE];
  assert.equal(rule.check(newScript(lines, 'fsi-app/scripts/lib/other.mjs')).status, 'FAIL');
  assert.equal(rule.trigger(newScript(lines, 'fsi-app/scripts/lib/db.mjs')), false);
});

test('019 GATE-7 A019-4: an aliased archive helper is still the archive helper', () => {
  const aliased = ['import { archiveRows as arch } from "./lib/db.mjs";', 'await arch("intelligence_items", ids, { cite, archive_reason: "source_not_item" });'];
  assert.equal(rule.check(newScript(aliased)).status, 'FAIL');
  const assigned = ['import * as db from "./lib/db.mjs";', 'const arch = archiveRows;', 'await arch(ids, { archive_reason: "portal_artifact" });'];
  assert.equal(rule.check(newScript(assigned)).status, 'FAIL');
});

test('019 GATE-7 A019-6: .cjs, .js and .ts scripts are scripts', () => {
  for (const ext of ['cjs', 'js', 'ts', 'mts']) {
    assert.equal(rule.check(newScript([IMPORT_ARCHIVE, ARCHIVE_AS_SOURCE], `fsi-app/scripts/verify/x.${ext}`)).status, 'FAIL', ext);
  }
});

test('019 GATE-7 A019-8: swapping one source-y reason for another on an archive line is charged', () => {
  const before = 'await archiveRows("intelligence_items", ids, { cite, archive_reason: "source_not_item" });';
  const after = 'await archiveRows("intelligence_items", ids, { cite, archive_reason: "portal_artifact" });';
  const ctx = edit([IMPORT_ARCHIVE, after], { removed: [before], added: [after], newStart: 2 });
  assert.equal(rule.check(ctx).status, 'FAIL');
});
