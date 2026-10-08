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

// ---------------------------------------------------------------------------
// Check: design-audit generator output exemption (lane DAUDIT-1, coordinator ruling 2026-10-08)
// ---------------------------------------------------------------------------

const GENERATED_AUDIT_PATHS = [
  'fsi-app/.discipline/rendering/audit/results.json',
  'docs/design/handoff-2026-09-06/AUDIT-2026-09-07.md',
  'fsi-app/.discipline/governance/harness-ledger-export.json',
];

for (const path of GENERATED_AUDIT_PATHS) {
  test(`022 check: PASS for an added dash in generator output ${path}`, () => {
    const ctx = buildContextFromFixture({
      message: 'audit: regenerate',
      files: [{ path, additions: 1, deletions: 0 }],
      addedLines: { [path]: [`spec prose ${EM_DASH} copied verbatim`] },
    });
    assert.equal(rule.trigger(ctx), false);
    assert.equal(rule.check(ctx).status, 'PASS');
  });
}

for (const path of [
  'docs/design/handoff-2026-09-06/DEVIATION-LOG.md',
  'fsi-app/.discipline/rendering/audit/spec/factcard.json',
  'fsi-app/.discipline/rendering/audit/README.md',
  'fsi-app/.discipline/rendering/audit/other/results.json',
  'docs/design/handoff-2026-09-06/AUDIT-2026-09-07.md.notes',
  'fsi-app/.discipline/governance/harness-ledger-export.notes.json',
  'docs/ops/session-log.d/2026-10-08-daudit1-mounts.md',
]) {
  test(`022 check: FAIL (attack) for an added dash in authored file ${path} beside the generated outputs`, () => {
    const ctx = buildContextFromFixture({
      message: 'docs: authored',
      files: [{ path, additions: 1, deletions: 0 }],
      addedLines: { [path]: [`note ${EM_DASH} detail`] },
    });
    assert.equal(rule.trigger(ctx), true);
    assert.equal(rule.check(ctx).status, 'FAIL');
  });
}

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

// ---------------------------------------------------------------------------
// Introduced-lines scope (lane GATE-1, 2026-10-08). The rule charges a line only when the pattern is
// absent from the removed line it replaces; an edited line that already carried a glyph, and text moved
// from elsewhere in the diff, pass. 12 of 22 firings in the 30 days before this lane were exactly these.
// ---------------------------------------------------------------------------

function ctxFor(changes, files) {
  return buildContextFromFixture({
    message: 'feat: x',
    files: files || changes.map((c) => ({ path: c.path, status: c.status })),
    changes,
  });
}

test('022 scope: a pre-existing glyph on an EDITED line passes (the line was touched for another reason)', () => {
  const ctx = ctxFor([{
    path: 'fsi-app/src/foo.mjs',
    removed: [`// the loader ${EM_DASH} reads config`],
    added: [`// the loader ${EM_DASH} reads config (apostrophe fixed)`],
  }]);
  assert.equal(rule.trigger(ctx), false);
  assert.equal(rule.check(ctx).status, 'PASS');
});

test('022 scope: an INTRODUCED glyph fails, on a new line and on an edit that adds the glyph', () => {
  const added = ctxFor([{ path: 'fsi-app/src/foo.mjs', added: [`// new ${EM_DASH} note`] }]);
  assert.equal(rule.trigger(added), true);
  assert.equal(rule.check(added).status, 'FAIL');
  const edited = ctxFor([{ path: 'fsi-app/src/foo.mjs', removed: ['// the loader reads config'], added: [`// the loader ${EM_DASH} reads config`] }]);
  assert.equal(rule.check(edited).status, 'FAIL');
  assert.deepEqual(rule.check(edited).locations, [{ path: 'fsi-app/src/foo.mjs', line: 1 }]);
});

test('022 scope: MOVED text with glyphs passes, within a file and across files (a split or a relocation)', () => {
  const across = ctxFor([
    { path: 'docs/runbooks/big.md', removed: [`step one ${EM_DASH} do the thing`, 'other'] },
    { path: 'docs/runbooks/part.md', status: 'A', added: [`step one ${EM_DASH} do the thing`] },
  ]);
  assert.equal(rule.check(across).status, 'PASS');
  const within = ctxFor([{
    path: 'docs/runbooks/big.md',
    hunks: [
      { oldStart: 3, newStart: 3, removed: [`step one ${EM_DASH} do the thing`], added: [] },
      { oldStart: 20, newStart: 19, removed: [], added: [`step one ${EM_DASH} do the thing`] },
    ],
  }]);
  assert.equal(rule.check(within).status, 'PASS');
});

test('022 scope: a COPY of an existing glyph line (nothing removed) is still introduced', () => {
  const ctx = ctxFor([
    { path: 'docs/runbooks/big.md', removed: ['unrelated'] },
    { path: 'docs/runbooks/part.md', status: 'A', added: [`step one ${EM_DASH} do the thing`] },
  ]);
  assert.equal(rule.check(ctx).status, 'FAIL');
});

test('022 scope: editing one glyph line while adding another charges exactly the new one', () => {
  const ctx = ctxFor([{
    path: 'fsi-app/src/foo.mjs',
    removed: [`// loader ${EM_DASH} reads config`],
    added: [`// loader ${EM_DASH} reads the config file`, `// freshly written ${EM_DASH} aside`],
  }]);
  const r = rule.check(ctx);
  assert.equal(r.status, 'FAIL');
  assert.ok(r.message.includes('1 added line'));
});

test('022 scope: a rename carrying glyphs adds no lines and passes', () => {
  const ctx = ctxFor([{ path: 'docs/runbooks/new-name.md', oldPath: 'docs/runbooks/old-name.md', status: 'R' }]);
  assert.equal(rule.trigger(ctx), false);
});

test('022 scope: trigger and check share ONE computation of the diff view', () => {
  const ctx = ctxFor([{ path: 'fsi-app/src/foo.mjs', added: [`// new ${EM_DASH} note`] }]);
  const first = ctx.introducedLines('fsi-app/src/foo.mjs');
  rule.trigger(ctx);
  rule.check(ctx);
  assert.strictEqual(ctx.introducedLines('fsi-app/src/foo.mjs'), first);
});

// ---------------------------------------------------------------------------
// GATE-7 (2026-10-08): honest forms from the AUD-AT-3 attack register. Every glyph form is assembled at
// runtime so this file's own source carries no glyph, no escape and no entity.
// ---------------------------------------------------------------------------

const BSL = String.fromCharCode(92);
const ESC_EM = `${BSL}u${'20'}14`;
const ESC_BRACED = `${BSL}u{${'20'}14}`;
const ENT_NAMED = `&${'md'}ash;`;
const ENT_DEC = `&#${8212};`;
const ENT_HEX = `&#x${'20'}14;`;
const LOOK_BAR = String.fromCharCode(0x2015);
const LOOK_MINUS = String.fromCharCode(0x2212);
const LOOK_NBH = String.fromCharCode(0x2011);

function addedCtx(path, added, removed = null) {
  return buildContextFromFixture({
    message: 'x',
    files: [{ path }],
    changes: [{ path, added, ...(removed ? { removed } : {}) }],
  });
}

test('022 GATE-7 A022-1: escape and entity forms of the glyphs are glyphs', () => {
  for (const form of [ESC_EM, ESC_BRACED, ENT_NAMED, ENT_DEC, ENT_HEX, `${BSL}xA7`, `${BSL}u00a7`]) {
    const r = rule.check(addedCtx('docs/notes/a.md', [`text ${form} more`]));
    assert.equal(r.status, 'FAIL', form);
  }
});

test('022 GATE-7 A022-2: the look-alikes U+2015, U+2212 and U+2011 are banned with the dashes', () => {
  for (const g of [LOOK_BAR, LOOK_MINUS, LOOK_NBH]) {
    assert.equal(rule.check(addedCtx('docs/notes/a.md', [`a ${g} b`])).status, 'FAIL', g.codePointAt(0).toString(16));
  }
});

test('022 GATE-7 A022-3: a docs folder called fixtures is prose; a code-root fixtures directory is data', () => {
  const line = `x ${EM_DASH} y`;
  assert.equal(rule.check(addedCtx('docs/fixtures/notes.md', [line])).status, 'FAIL');
  assert.equal(rule.check(addedCtx('fsi-app/scripts/mint/fixtures/a.json', [line])).status, 'PASS');
  assert.equal(rule.check(addedCtx('fsi-app/src/lib/sources/fixtures/a.json', [line])).status, 'PASS');
});

test('022 GATE-7 A022-4: docs/archive/ is exempt only at the top of docs or of fsi-app', () => {
  const line = `x ${EM_DASH} y`;
  assert.equal(rule.check(addedCtx('docs/specs/docs/archive/a.md', [line])).status, 'FAIL');
  assert.equal(rule.check(addedCtx('docs/archive/a.md', [line])).status, 'PASS');
  assert.equal(rule.check(addedCtx('fsi-app/docs/archive/a.md', [line])).status, 'PASS');
});

test('022 GATE-7 A022-5: the marker is a token, not a substring of a longer word', () => {
  assert.equal(rule.check(addedCtx('docs/notes/a.md', [`x ${EM_DASH} y ${_MARKER}`])).status, 'PASS');
  assert.equal(rule.check(addedCtx('docs/notes/a.md', [`x ${EM_DASH} y not${_MARKER}ish`])).status, 'FAIL');
  assert.equal(rule.check(addedCtx('docs/notes/a.md', [`x ${EM_DASH} y ${_MARKER}-extra`])).status, 'FAIL');
});

test('022 GATE-7 A022-6: an edit that adds glyphs to a line that already had one is charged; an apostrophe fix is not', () => {
  const one = `a ${EM_DASH} b`;
  const four = `a ${EM_DASH} b ${EM_DASH} c ${EM_DASH} d ${EM_DASH} e`;
  assert.equal(rule.check(addedCtx('docs/notes/a.md', [four], [one])).status, 'FAIL');
  assert.equal(rule.check(addedCtx('docs/notes/a.md', [`a ${EM_DASH} b's`], [one])).status, 'PASS');
});

test('022 GATE-7 A022-9: a forged handoff path nested below another directory is not the bundle', () => {
  const line = `x ${EM_DASH} y`;
  assert.equal(rule.check(addedCtx('docs/design/handoff-2026-09-07/README.md', [line])).status, 'PASS');
  assert.equal(rule.check(addedCtx('docs/other/docs/design/handoff-2026-09-07/README.md', [line])).status, 'FAIL');
});
