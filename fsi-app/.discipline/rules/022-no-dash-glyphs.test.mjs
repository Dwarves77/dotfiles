// Tests for rule 022. Run: node --test fsi-app/.discipline/rules/022-no-dash-glyphs.test.mjs
//
// Note on fixture construction (same convention as rule 012's own test file): this file must exercise
// lines that CONTAIN the glyphs rule 022 forbids, without this file's own SOURCE TEXT containing a
// literal instance of them (rule 022 would otherwise flag its own test file, and the lane's hard rule
// forbids an added em/en dash or section-sign glyph outside a marked verbatim fixture line). Every
// offending character below is built via String.fromCharCode at RUNTIME, never typed literally.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rule, _GLYPH_RE, _MARKER } from './022-no-dash-glyphs.mjs';
import { buildContextFromFixture } from '../lib/context.mjs';

const EM_DASH = String.fromCharCode(0x2014);
const EN_DASH = String.fromCharCode(0x2013);
const SECTION_SIGN = String.fromCharCode(0x00a7);

// ---------------------------------------------------------------------------
// Regex
// ---------------------------------------------------------------------------

test('022 regex: matches em dash', () => {
  assert.ok(_GLYPH_RE.test(`a${EM_DASH}b`));
});

test('022 regex: matches en dash', () => {
  assert.ok(_GLYPH_RE.test(`a${EN_DASH}b`));
});

test('022 regex: matches section sign', () => {
  assert.ok(_GLYPH_RE.test(`a${SECTION_SIGN}b`));
});

test('022 regex: does NOT match a comma or a hyphen-minus', () => {
  assert.equal(_GLYPH_RE.test('a, b - c'), false);
});

test('022: marker constant has no glyph inside it', () => {
  assert.equal(_GLYPH_RE.test(_MARKER), false);
});

// ---------------------------------------------------------------------------
// Trigger
// ---------------------------------------------------------------------------

test('022 trigger: skips merge commits', () => {
  const ctx = buildContextFromFixture({
    message: 'Merge branch foo',
    files: [{ path: 'fsi-app/src/foo.mjs', additions: 1, deletions: 0 }],
    addedLines: { 'fsi-app/src/foo.mjs': [`bad${EM_DASH}line`] },
    isMergeCommit: true,
  });
  assert.equal(rule.trigger(ctx), false);
});

test('022 trigger: skips revert commits', () => {
  const ctx = buildContextFromFixture({
    message: 'Revert "feat: thing"',
    files: [{ path: 'fsi-app/src/foo.mjs', additions: 1, deletions: 0 }],
    addedLines: { 'fsi-app/src/foo.mjs': [`bad${EM_DASH}line`] },
  });
  assert.equal(rule.trigger(ctx), false);
});

test('022 trigger: skips when no added line carries a banned glyph', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: clean',
    files: [{ path: 'fsi-app/src/foo.mjs', additions: 1, deletions: 0 }],
    addedLines: { 'fsi-app/src/foo.mjs': ['const a = 1, b = 2;'] },
  });
  assert.equal(rule.trigger(ctx), false);
});

test('022 trigger: fires when an added line carries a banned glyph', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: thing',
    files: [{ path: 'fsi-app/src/foo.mjs', additions: 1, deletions: 0 }],
    addedLines: { 'fsi-app/src/foo.mjs': [`// note ${EM_DASH} detail`] },
  });
  assert.equal(rule.trigger(ctx), true);
});

// ---------------------------------------------------------------------------
// Check: fail cases
// ---------------------------------------------------------------------------

test('022 check: FAIL when an added em dash appears in a .mjs file', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: thing',
    files: [{ path: 'fsi-app/src/foo.mjs', additions: 1, deletions: 0 }],
    addedLines: { 'fsi-app/src/foo.mjs': [`// note ${EM_DASH} detail`] },
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'FAIL');
  assert.ok(result.message.includes('1 added line'));
  assert.ok(result.remediation.includes('fsi-app/src/foo.mjs'));
});

test('022 check: FAIL when an added section sign appears in a .md file', () => {
  const ctx = buildContextFromFixture({
    message: 'docs: thing',
    files: [{ path: 'docs/runbooks/SOME-RUNBOOK.md', additions: 1, deletions: 0 }],
    addedLines: { 'docs/runbooks/SOME-RUNBOOK.md': [`See ${SECTION_SIGN}3 for detail.`] },
  });
  assert.equal(rule.check(ctx).status, 'FAIL');
});

test('022 check: aggregates multiple offending lines across multiple files', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: multi',
    files: [
      { path: 'fsi-app/src/a.mjs', additions: 2, deletions: 0 },
      { path: 'fsi-app/src/b.mjs', additions: 1, deletions: 0 },
    ],
    addedLines: {
      'fsi-app/src/a.mjs': [`one ${EM_DASH} two`, `three ${EN_DASH} four`],
      'fsi-app/src/b.mjs': [`five ${SECTION_SIGN} six`],
    },
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'FAIL');
  assert.ok(result.message.includes('3 added line'));
});

// ---------------------------------------------------------------------------
// Check: pass cases (the four exemptions + clean input)
// ---------------------------------------------------------------------------

test('022 check: PASS for clean added lines', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: clean',
    files: [{ path: 'fsi-app/src/foo.mjs', additions: 1, deletions: 0 }],
    addedLines: { 'fsi-app/src/foo.mjs': ['const a = 1, b = 2.'] },
  });
  assert.equal(rule.check(ctx).status, 'PASS');
});

test('022 check: PASS when the offending line carries the glyph:verbatim marker', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: thing',
    files: [{ path: 'fsi-app/src/foo.mjs', additions: 1, deletions: 0 }],
    addedLines: { 'fsi-app/src/foo.mjs': [`// note ${EM_DASH} detail  ${_MARKER}`] },
  });
  assert.equal(rule.check(ctx).status, 'PASS');
});

test('022 check: PASS for an added dash inside a record-briefs batches file (exempt path)', () => {
  const path = 'fsi-app/scripts/turns/record-briefs/batches/002/item-00a8c0d9.json';
  const ctx = buildContextFromFixture({
    message: 'record-briefs apply: batch 002',
    files: [{ path, additions: 1, deletions: 0 }],
    addedLines: { [path]: [`{"captured_text": "verbatim clause ${EM_DASH} unedited"}`] },
  });
  assert.equal(rule.trigger(ctx), false);
  assert.equal(rule.check(ctx).status, 'PASS');
});

test('022 check: PASS for an added glyph inside any fixtures/ directory', () => {
  const path = 'fsi-app/scripts/verify/lib/fixtures/sample.json';
  const ctx = buildContextFromFixture({
    message: 'test: fixture',
    files: [{ path, additions: 1, deletions: 0 }],
    addedLines: { [path]: [`{"note": "a ${EM_DASH} b"}`] },
  });
  assert.equal(rule.trigger(ctx), false);
  assert.equal(rule.check(ctx).status, 'PASS');
});

test('022 check: PASS for an added glyph under docs/archive/', () => {
  const path = 'docs/archive/OLD-NOTES.md';
  const ctx = buildContextFromFixture({
    message: 'docs: archive note',
    files: [{ path, additions: 1, deletions: 0 }],
    addedLines: { [path]: [`old note ${EM_DASH} superseded`] },
  });
  assert.equal(rule.trigger(ctx), false);
  assert.equal(rule.check(ctx).status, 'PASS');
});

test('022 check: PASS for an added glyph under the fsi-app-nested docs/archive/', () => {
  const path = 'fsi-app/docs/archive/OLD-NOTES.md';
  const ctx = buildContextFromFixture({
    message: 'docs: archive note',
    files: [{ path, additions: 1, deletions: 0 }],
    addedLines: { [path]: [`old note ${EM_DASH} superseded`] },
  });
  assert.equal(rule.trigger(ctx), false);
  assert.equal(rule.check(ctx).status, 'PASS');
});

// ---------------------------------------------------------------------------
// Check: design-handoff bundle exemption (lane R22, 2026-09-20)
// ---------------------------------------------------------------------------

test('022 check: PASS for an added dash in the design-handoff bundle .dc.html file', () => {
  const path = 'docs/design/handoff-2026-09-07/Caros Ledge UI System.dc.html';
  const ctx = buildContextFromFixture({
    message: 'docs: design handoff bundle',
    files: [{ path, additions: 1, deletions: 0 }],
    addedLines: { [path]: [`<p>a ${EM_DASH} b</p>`] },
  });
  assert.equal(rule.trigger(ctx), false);
  assert.equal(rule.check(ctx).status, 'PASS');
});

test('022 check: PASS for an added dash in the design-handoff bundle README.md', () => {
  const path = 'docs/design/handoff-2026-09-07/README.md';
  const ctx = buildContextFromFixture({
    message: 'docs: design handoff bundle',
    files: [{ path, additions: 1, deletions: 0 }],
    addedLines: { [path]: [`note ${EM_DASH} detail`] },
  });
  assert.equal(rule.trigger(ctx), false);
  assert.equal(rule.check(ctx).status, 'PASS');
});

test('022 check: PASS for an added dash in the design-handoff bundle support.js', () => {
  const path = 'docs/design/handoff-2026-09-07/support.js';
  const ctx = buildContextFromFixture({
    message: 'docs: design handoff bundle',
    files: [{ path, additions: 1, deletions: 0 }],
    addedLines: { [path]: [`// note ${EM_DASH} detail`] },
  });
  assert.equal(rule.trigger(ctx), false);
  assert.equal(rule.check(ctx).status, 'PASS');
});

test('022 check: FAIL (attack) for an added dash in a repo-authored file beside the bundle (DEVIATION-LOG.md)', () => {
  const path = 'docs/design/handoff-2026-09-07/DEVIATION-LOG.md';
  const ctx = buildContextFromFixture({
    message: 'docs: deviation log',
    files: [{ path, additions: 1, deletions: 0 }],
    addedLines: { [path]: [`note ${EM_DASH} detail`] },
  });
  assert.equal(rule.trigger(ctx), true);
  assert.equal(rule.check(ctx).status, 'FAIL');
});

test('022 check: FAIL (attack) for an added dash in docs/design/README.md (not under a dated handoff folder)', () => {
  const path = 'docs/design/README.md';
  const ctx = buildContextFromFixture({
    message: 'docs: design readme',
    files: [{ path, additions: 1, deletions: 0 }],
    addedLines: { [path]: [`note ${EM_DASH} detail`] },
  });
  assert.equal(rule.trigger(ctx), true);
  assert.equal(rule.check(ctx).status, 'FAIL');
});

test('022 check: FAIL (attack) for an added dash in a nested README.md under the dated handoff folder', () => {
  const path = 'docs/design/handoff-2026-09-07/nested/README.md';
  const ctx = buildContextFromFixture({
    message: 'docs: nested readme',
    files: [{ path, additions: 1, deletions: 0 }],
    addedLines: { [path]: [`note ${EM_DASH} detail`] },
  });
  assert.equal(rule.trigger(ctx), true);
  assert.equal(rule.check(ctx).status, 'FAIL');
});

test('022 check: FAIL (attack) for an added dash in an undated handoff-notes folder', () => {
  const path = 'docs/design/handoff-notes/README.md';
  const ctx = buildContextFromFixture({
    message: 'docs: undated handoff notes',
    files: [{ path, additions: 1, deletions: 0 }],
    addedLines: { [path]: [`note ${EM_DASH} detail`] },
  });
  assert.equal(rule.trigger(ctx), true);
  assert.equal(rule.check(ctx).status, 'FAIL');
});

test('022 check: PASS for an UNCHANGED line containing a glyph (context, not added)', () => {
  // The file carries a glyph somewhere in its full content, but addedLines for this path is empty
  // (or omits that line) -- rule 022 reads ONLY ctx.getAddedLines, never full file content, so a
  // pre-existing/context line is invisible to it by construction.
  const ctx = buildContextFromFixture({
    message: 'feat: touch a file that already has a dash elsewhere',
    files: [{ path: 'fsi-app/src/foo.mjs', additions: 1, deletions: 0 }],
    fileContents: { 'fsi-app/src/foo.mjs': `// pre-existing note ${EM_DASH} unchanged\nconst a = 1;\n` },
    addedLines: { 'fsi-app/src/foo.mjs': ['const a = 1;'] },
  });
  assert.equal(rule.trigger(ctx), false);
  assert.equal(rule.check(ctx).status, 'PASS');
});

test('022 check: PASS when a file is staged for deletion even if its old content had glyphs', () => {
  const ctx = buildContextFromFixture({
    message: 'refactor: remove old file',
    files: [{ path: 'fsi-app/src/old.mjs', additions: 0, deletions: 5, status: 'D' }],
    addedLines: { 'fsi-app/src/old.mjs': [`leftover ${EM_DASH} text`] },
  });
  assert.equal(rule.trigger(ctx), false);
});

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

test('022: has required metadata fields', () => {
  assert.equal(rule.id, '022');
  assert.equal(typeof rule.name, 'string');
  assert.equal(typeof rule.description, 'string');
  assert.ok(rule.ruleSource.includes('defect-fix-plan-2026-09-12'));
});
