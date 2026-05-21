import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAdrContent,
  matchScopeGlob,
  findIntersectingAdrs,
} from './adr-loader.mjs';

// ---------------------------------------------------------------------------
// parseAdrContent
// ---------------------------------------------------------------------------

const VALID_ADR = `---
id: ADR-001
title: Platform model
status: accepted
date: 2026-05-20
scope:
  - "fsi-app/src/app/(tenant)/**"
  - "fsi-app/src/lib/tenancy.ts"
supersedes: null
related: []
---

## Context

Body.
`;

test('parseAdrContent: parses valid ADR with no errors', () => {
  const adr = parseAdrContent('docs/decisions/ADR-001-platform-model.md', VALID_ADR);
  assert.equal(adr.id, 'ADR-001');
  assert.equal(adr.title, 'Platform model');
  assert.equal(adr.status, 'accepted');
  assert.equal(adr.date, '2026-05-20');
  assert.deepEqual(adr.scope, ['fsi-app/src/app/(tenant)/**', 'fsi-app/src/lib/tenancy.ts']);
  assert.equal(adr.supersedes, null);
  assert.deepEqual(adr.related, []);
  assert.deepEqual(adr._errors, []);
});

test('parseAdrContent: surfaces errors on invalid ADR (missing fields, bad status)', () => {
  const bad = `---
id: ADR-1
title: Test
status: maybe
date: 2026-5-20
scope: not-a-list
---
`;
  const adr = parseAdrContent('docs/decisions/ADR-bad.md', bad);
  assert.ok(adr._errors.length >= 3);
});

test('parseAdrContent: returns error object on missing frontmatter', () => {
  const noFm = '## Just a heading\n\nBody.';
  const adr = parseAdrContent('docs/decisions/ADR-no-fm.md', noFm);
  assert.match(adr._error, /no YAML frontmatter/);
});

// ---------------------------------------------------------------------------
// matchScopeGlob
// ---------------------------------------------------------------------------

test('matchScopeGlob: dir/**/*.ext matches recursively', () => {
  assert.equal(matchScopeGlob('fsi-app/src/app/api/admin/foo/route.ts', 'fsi-app/src/app/**/*.ts'), true);
  assert.equal(matchScopeGlob('fsi-app/src/app/api/admin/foo/route.tsx', 'fsi-app/src/app/**/*.ts'), false);
});

test('matchScopeGlob: dir/ matches anything under', () => {
  assert.equal(matchScopeGlob('fsi-app/src/components/foo/bar.tsx', 'fsi-app/src/components/'), true);
  assert.equal(matchScopeGlob('fsi-app/scripts/foo.mjs', 'fsi-app/src/components/'), false);
});

test('matchScopeGlob: dir/** matches anything under (without trailing slash)', () => {
  assert.equal(matchScopeGlob('fsi-app/src/components/foo/bar.tsx', 'fsi-app/src/components/**'), true);
  assert.equal(matchScopeGlob('fsi-app/scripts/foo.mjs', 'fsi-app/src/components/**'), false);
});

test('matchScopeGlob: **/filename matches anywhere', () => {
  assert.equal(matchScopeGlob('a/b/c/foo.ts', '**/foo.ts'), true);
  assert.equal(matchScopeGlob('foo.ts', '**/foo.ts'), true);
  assert.equal(matchScopeGlob('a/b/foo.tsx', '**/foo.ts'), false);
});

test('matchScopeGlob: exact path', () => {
  assert.equal(matchScopeGlob('fsi-app/src/lib/tenancy.ts', 'fsi-app/src/lib/tenancy.ts'), true);
  assert.equal(matchScopeGlob('fsi-app/src/lib/other.ts', 'fsi-app/src/lib/tenancy.ts'), false);
});

test('matchScopeGlob: normalizes backslashes', () => {
  assert.equal(matchScopeGlob('fsi-app\\src\\lib\\foo.ts', 'fsi-app/src/lib/foo.ts'), true);
});

// ---------------------------------------------------------------------------
// findIntersectingAdrs
// ---------------------------------------------------------------------------

test('findIntersectingAdrs: returns ADRs whose scope intersects file paths', () => {
  const adrs = [
    {
      id: 'ADR-001',
      status: 'accepted',
      scope: ['fsi-app/src/components/'],
      _errors: [],
    },
    {
      id: 'ADR-002',
      status: 'accepted',
      scope: ['fsi-app/src/lib/'],
      _errors: [],
    },
  ];
  const files = ['fsi-app/src/components/Foo.tsx', 'fsi-app/scripts/bar.mjs'];
  const hits = findIntersectingAdrs(files, adrs);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].id, 'ADR-001');
});

test('findIntersectingAdrs: skips ADRs with errors', () => {
  const adrs = [
    { id: 'ADR-X', status: 'accepted', scope: ['fsi-app/'], _errors: ['bad'] },
  ];
  const hits = findIntersectingAdrs(['fsi-app/foo.ts'], adrs);
  assert.deepEqual(hits, []);
});

test('findIntersectingAdrs: returns empty array when no intersection', () => {
  const adrs = [
    { id: 'ADR-001', status: 'accepted', scope: ['docs/'], _errors: [] },
  ];
  const hits = findIntersectingAdrs(['fsi-app/foo.ts'], adrs);
  assert.deepEqual(hits, []);
});
