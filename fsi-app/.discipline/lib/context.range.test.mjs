// Regression test for lane MASTER-022 (2026-09-26): buildContextForRange must see a glyph line
// added inside an EARLIER commit of a range even when a per-commit walk over the identical commits
// does not. See buildContextForRange's own header in context.mjs for the full mechanism; this test
// replays the REAL sequence of file snapshots that produced the miss on PR #800 (a squash-merge of
// lane/parity-parts), captured verbatim from the repo's own history as three fixture files, so the
// test reproduces the real git diff/Myers-LCS behavior rather than a hand-tuned synthetic case that
// might not trigger the same pairing choice.
//
// Fixtures (fsi-app/.discipline/fixtures/rd-master-022/, exempt from rule 022 by path -- any
// `fixtures` directory -- so they may carry the literal glyph they exist to test):
//   base.tsx.txt  the file at the PR's real fork point (commit 98d0032c, #803)
//   c1.tsx.txt    the file after an interior commit (3d30f3f) that merges two rendering branches,
//                 reusing the base's own glyph line for both -- ITS OWN isolated diff adds no new
//                 glyph line, correctly
//   c2.tsx.txt    the file at the PR's real branch tip (aea9f70) -- an unrelated LATER commit
//                 (e2169400) changes what sits at the reused glyph line's position; ITS OWN isolated
//                 diff also adds no new glyph line
// Verified 2026-09-26 with `git diff --no-index -U0 base c1` and `c1 c2`: zero added lines contain
// the glyph in EITHER isolated diff. `git diff --no-index -U0 base c2` (the same net change, one
// diff): ONE added line contains it. Root cause: a duplicate literal (the glyph appears twice in
// the base file, once as a real character and once escaped inside a CSS string) gives git's diff
// algorithm more than one valid, minimal alignment, and a whole-range diff is free to choose a
// DIFFERENT alignment than two chained per-commit diffs would -- this is a general property of text
// diffing, not specific to this file. The push-to-master check runs the squash commit vs its real
// parent, i.e. ONE diff over the whole net change, so it must be modelled the same way here.
//
// Run: node --test fsi-app/.discipline/lib/context.range.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildContextForRange, _clearRepoRootCache } from './context.mjs';
import { rule as rule022 } from '../rules/022-no-dash-glyphs.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, '..', 'fixtures', 'rd-master-022');
const REL_PATH = 'fsi-app/src/components/ui/Absence.tsx';
// Built at runtime, never typed literally, per the same convention rule 022's own test file uses
// (see 022-no-dash-glyphs.test.mjs's header): this file's source text must not itself contain the
// glyph it exists to detect.
const EM_DASH_RE = new RegExp(String.fromCharCode(0x2014));

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' });
}

// Builds a throwaway repo with base -> c1 -> c2 commits replaying the three fixture snapshots at
// REL_PATH, and returns { dir, shas: { base, c1, c2 } }. Caller is responsible for cleanup
// (rmSync(dir, { recursive: true, force: true })).
function commitSnapshots() {
  const dir = mkdtempSync(join(tmpdir(), 'discipline-range-test-'));
  git(dir, ['init', '-q']);
  git(dir, ['config', 'user.email', 'test@example.com']);
  git(dir, ['config', 'user.name', 'Discipline Test']);
  git(dir, ['config', 'commit.gpgsign', 'false']);
  git(dir, ['config', 'core.autocrlf', 'false']);

  const targetDir = join(dir, 'fsi-app', 'src', 'components', 'ui');
  execFileSync(process.platform === 'win32' ? 'cmd' : 'mkdir', process.platform === 'win32' ? ['/c', 'mkdir', targetDir] : ['-p', targetDir]);
  const target = join(targetDir, 'Absence.tsx');

  const shas = {};
  for (const [label, fixture] of [['base', 'base.tsx.txt'], ['c1', 'c1.tsx.txt'], ['c2', 'c2.tsx.txt']]) {
    cpSync(join(FIXTURES, fixture), target);
    git(dir, ['add', REL_PATH]);
    git(dir, ['commit', '-q', '-m', label, '--allow-empty']);
    shas[label] = git(dir, ['rev-parse', 'HEAD']).trim();
  }
  return { dir, shas };
}

test('reproduction: per-commit isolated diffs each add zero glyph lines', () => {
  const { dir, shas } = commitSnapshots();
  try {
    for (const sha of [shas.c1, shas.c2]) {
      const patch = git(dir, ['show', '--format=', '-U0', sha, '--', REL_PATH]);
      const addedGlyphLines = patch
        .split(/\r?\n/)
        .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
        .filter((l) => EM_DASH_RE.test(l));
      assert.equal(addedGlyphLines.length, 0, `commit ${sha.slice(0, 8)} should add zero glyph lines in isolation`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('reproduction: the whole-range diff over the SAME commits adds one glyph line', () => {
  const { dir, shas } = commitSnapshots();
  try {
    const patch = git(dir, ['diff', '-U0', `${shas.base}..${shas.c2}`, '--', REL_PATH]);
    const addedGlyphLines = patch
      .split(/\r?\n/)
      .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
      .filter((l) => EM_DASH_RE.test(l));
    assert.equal(addedGlyphLines.length, 1, 'the whole-range diff over the identical net change must surface the added glyph line');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('buildContextForRange: ctx.getAddedLines sees the glyph line the per-commit walk would miss', () => {
  const { dir, shas } = commitSnapshots();
  const savedCwd = process.cwd();
  try {
    process.chdir(dir);
    _clearRepoRootCache();
    const ctx = buildContextForRange({ range: `${shas.base}..${shas.c2}` });
    const added = ctx.getAddedLines(REL_PATH);
    const glyphLines = added.filter((l) => EM_DASH_RE.test(l));
    assert.ok(glyphLines.length >= 1, 'buildContextForRange must surface the added glyph line');
  } finally {
    process.chdir(savedCwd);
    _clearRepoRootCache();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('rule 022: FAILS against the whole-range context for this exact historical miss', () => {
  const { dir, shas } = commitSnapshots();
  const savedCwd = process.cwd();
  try {
    process.chdir(dir);
    _clearRepoRootCache();
    const ctx = buildContextForRange({ range: `${shas.base}..${shas.c2}` });
    assert.equal(rule022.trigger(ctx), true, 'rule 022 must trigger against the whole-range context');
    assert.equal(rule022.check(ctx).status, 'FAIL', 'rule 022 must FAIL against the whole-range context');
  } finally {
    process.chdir(savedCwd);
    _clearRepoRootCache();
    rmSync(dir, { recursive: true, force: true });
  }
});
