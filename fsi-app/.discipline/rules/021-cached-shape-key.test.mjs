// Fire-tests for rule 021 (dashboard cache key carries the shape hash).
// Run: node --test fsi-app/.discipline/rules/021-cached-shape-key.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rule, computeShapeKey, _SHAPE_FILE, _CONSUMER_FILE } from './021-cached-shape-key.mjs';
import { buildContextFromFixture } from '../lib/context.mjs';

// A minimal shape file whose interface hashes deterministically.
function shapeFile(fields, key) {
  return [
    `export const DASHBOARD_DATA_CACHE_KEY = "${key}";`,
    '',
    'export interface DashboardData {',
    ...fields.map((f) => `  ${f}`),
    '}',
    '',
  ].join('\n');
}

const FIELDS_V1 = ['resources: string[];', 'archived: string[];'];
const FIELDS_V2 = [...FIELDS_V1, 'recentChanges: string[];']; // the #395 shape of failure

const KEY_V1 = computeShapeKey(shapeFile(FIELDS_V1, 'placeholder'));
const KEY_V2 = computeShapeKey(shapeFile(FIELDS_V2, 'placeholder'));

test('021 hash: shape edit changes the required key', () => {
  assert.ok(KEY_V1.startsWith('app-data-'));
  assert.ok(KEY_V2.startsWith('app-data-'));
  assert.notEqual(KEY_V1, KEY_V2);
});

test('021 hash: comment and whitespace edits do NOT change the required key', () => {
  const commented = shapeFile(
    ['resources: string[]; // the org-scoped rows', '/* archive layer */', 'archived:   string[];'],
    'placeholder',
  );
  assert.equal(computeShapeKey(commented), KEY_V1);
});

test('021 trigger: fires when the shape file is staged', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: payload change',
    files: [{ path: _SHAPE_FILE, status: 'M', additions: 3, deletions: 0 }],
  });
  assert.equal(rule.trigger(ctx), true);
});

test('021 trigger: fires when the consumer file is staged', () => {
  const ctx = buildContextFromFixture({
    message: 'refactor: cache wiring',
    files: [{ path: _CONSUMER_FILE, status: 'M', additions: 1, deletions: 1 }],
  });
  assert.equal(rule.trigger(ctx), true);
});

test('021 trigger: does NOT fire on unrelated files, merges, or reverts', () => {
  const unrelated = buildContextFromFixture({
    message: 'docs: note',
    files: [{ path: 'docs/ops/session-log.md', status: 'M', additions: 5, deletions: 0 }],
  });
  assert.equal(rule.trigger(unrelated), false);

  const merge = buildContextFromFixture({
    message: "Merge branch 'x'",
    files: [{ path: _SHAPE_FILE, status: 'M', additions: 3, deletions: 0 }],
    isMergeCommit: true,
  });
  assert.equal(rule.trigger(merge), false);

  const revert = buildContextFromFixture({
    message: 'Revert "feat: payload change"',
    files: [{ path: _SHAPE_FILE, status: 'M', additions: 3, deletions: 0 }],
  });
  assert.equal(rule.trigger(revert), false);
});

test('021 check: PASS when the key matches the shape hash', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: payload change',
    files: [{ path: _SHAPE_FILE, status: 'M', additions: 3, deletions: 0 }],
    fileContents: {
      [_SHAPE_FILE]: shapeFile(FIELDS_V1, KEY_V1),
      // NOTE: no import-path string in this fixture — the glob-portability
      // meta-gate scans test files for bare-package import strings.
      [_CONSUMER_FILE]: 'const k = [DASHBOARD_DATA_CACHE_KEY];\n',
    },
  });
  assert.equal(rule.check(ctx).status, 'PASS');
});

test('021 check: FAIL — the exact #395 class (field added, key not rotated)', () => {
  const ctx = buildContextFromFixture({
    message: 'fix(home): This-week feed bounded by window',
    files: [{ path: _SHAPE_FILE, status: 'M', additions: 1, deletions: 0 }],
    fileContents: {
      [_SHAPE_FILE]: shapeFile(FIELDS_V2, KEY_V1), // shape moved to v2, key still v1
      [_CONSUMER_FILE]: 'const k = [DASHBOARD_DATA_CACHE_KEY];\n',
    },
  });
  const r = rule.check(ctx);
  assert.equal(r.status, 'FAIL');
  assert.ok(r.message.includes(KEY_V1));
  assert.ok(r.remediation.includes(KEY_V2), 'remediation must print the exact new key');
});

test('021 check: FAIL when the constant is missing entirely', () => {
  const noConst = shapeFile(FIELDS_V1, 'x').replace(/^export const DASHBOARD_DATA_CACHE_KEY.*\n/, '');
  const ctx = buildContextFromFixture({
    message: 'refactor: move things',
    files: [{ path: _SHAPE_FILE, status: 'M', additions: 1, deletions: 1 }],
    fileContents: { [_SHAPE_FILE]: noConst },
  });
  const r = rule.check(ctx);
  assert.equal(r.status, 'FAIL');
  assert.ok(r.remediation.includes(KEY_V1));
});

test('021 check: FAIL when data.ts re-inlines a raw app-data- literal', () => {
  const ctx = buildContextFromFixture({
    message: 'refactor: cache wiring',
    files: [{ path: _CONSUMER_FILE, status: 'M', additions: 1, deletions: 1 }],
    fileContents: {
      [_SHAPE_FILE]: shapeFile(FIELDS_V1, KEY_V1),
      [_CONSUMER_FILE]: 'const key = ["app-data-v2"];\n',
    },
  });
  const r = rule.check(ctx);
  assert.equal(r.status, 'FAIL');
  assert.ok(r.message.includes('raw "app-data-"'));
});

test('021 check: SKIP when shape-file content is unavailable (fixture without injection)', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: payload change',
    files: [{ path: _SHAPE_FILE, status: 'M', additions: 3, deletions: 0 }],
  });
  assert.equal(rule.check(ctx).status, 'SKIP');
});

test('021 check: FAIL when the DashboardData anchor is gone (renamed or moved)', () => {
  const ctx = buildContextFromFixture({
    message: 'refactor: rename payload type',
    files: [{ path: _SHAPE_FILE, status: 'M', additions: 3, deletions: 3 }],
    fileContents: { [_SHAPE_FILE]: 'export interface RenamedData {\n  a: string;\n}\n' },
  });
  const r = rule.check(ctx);
  assert.equal(r.status, 'FAIL');
  assert.ok(r.message.includes('DashboardData'));
});

// ---------------------------------------------------------------------------
// GATE-7 (2026-10-08): honest forms from the AUD-AT-3 attack register.
// ---------------------------------------------------------------------------

function ctx021(shapeContent, consumerContent = null, files = [{ path: _SHAPE_FILE, status: 'M' }]) {
  return buildContextFromFixture({
    message: 'feat: payload',
    files,
    fileContents: { [_SHAPE_FILE]: shapeContent, ...(consumerContent === null ? {} : { [_CONSUMER_FILE]: consumerContent }) },
  });
}

test('021 GATE-7 A021-1: a comment that quotes the NEW key ahead of the real stale constant does not satisfy the rule', () => {
  const stale = shapeFile(FIELDS_V2, KEY_V1);
  const decoy = `// DASHBOARD_DATA_CACHE_KEY = "${KEY_V2}" (rotated)\n/* export const DASHBOARD_DATA_CACHE_KEY = "${KEY_V2}"; */\n${stale}`;
  assert.equal(rule.check(ctx021(decoy)).status, 'FAIL');
  assert.equal(rule.check(ctx021(shapeFile(FIELDS_V2, KEY_V2))).status, 'PASS');
});

test('021 GATE-7 A021-1b: a block-comment copy of the OLD interface ahead of the real one is not the interface', () => {
  const real = shapeFile(FIELDS_V2, KEY_V1);
  const old = ['/*', 'export interface DashboardData {', ...FIELDS_V1.map((f) => `  ${f}`), '}', '*/'].join('\n');
  assert.equal(computeShapeKey(`${old}\n${real}`), KEY_V2);
  assert.equal(rule.check(ctx021(`${old}\n${real}`)).status, 'FAIL'); // key says V1, shape hashes to V2
});

test('021 GATE-7 A021-3: a consumer that splits the raw key literal across a concatenation is still inlining it', () => {
  const ok = shapeFile(FIELDS_V1, KEY_V1);
  const split = 'const k = "app-" + "data-v9";\n';
  const inlined = 'const k = "app-data-v9";\n';
  assert.equal(rule.check(ctx021(ok, 'const k = DASHBOARD_DATA_CACHE_KEY;\n')).status, 'PASS');
  assert.equal(rule.check(ctx021(ok, inlined)).status, 'FAIL');
  assert.equal(rule.check(ctx021(ok, 'const k = "app-" + "data-v9";\n')).status, 'FAIL');
  assert.ok(split.length > 0);
  assert.equal(rule.check(ctx021(ok, '// the app-data- prefix is documented here\nconst k = DASHBOARD_DATA_CACHE_KEY;\n')).status, 'PASS');
});

test('021 GATE-7 A021-5: deleting or renaming the shape file away is refused (the anchor is gone)', () => {
  const del = buildContextFromFixture({ message: 'x', files: [{ path: _SHAPE_FILE, status: 'D' }] });
  assert.equal(rule.trigger(del), true);
  assert.equal(rule.check(del).status, 'FAIL');
  const moved = buildContextFromFixture({
    message: 'x',
    files: [{ path: 'fsi-app/src/lib/dashboard-shape.ts', status: 'R' }, { path: _SHAPE_FILE, status: 'D' }],
    changes: [{ path: 'fsi-app/src/lib/dashboard-shape.ts', oldPath: _SHAPE_FILE, status: 'R' }],
  });
  assert.equal(rule.check(moved).status, 'FAIL');
});
