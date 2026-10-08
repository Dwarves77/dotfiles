// docs-only-range.test.mjs (lane R22, 2026-10-01; GATE-9 additions 2026-10-08). Tests for the shared
// docs-only filter pre-push and discipline.yml both call. node:test + node:assert/strict, no npm deps.
// The GATE-9 cases carry the AUD-AT-5 register's attack id in the test name (DO-1, DO-2, DO-3, DO-5).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isDocsOnlyPath,
  isDocsOnlyDiff,
  isGoverningDocPath,
  parseNameStatusZ,
  changedFiles,
} from './docs-only-range.mjs';
import { TEST_FILE_RE } from '../lib/test-discovery.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, 'docs-only-range.mjs');

test('isDocsOnlyPath accepts anything under docs/', () => {
  assert.equal(isDocsOnlyPath('docs/runbooks/fleet-budget-control.md'), true);
  assert.equal(isDocsOnlyPath('docs/census/some-export.json'), true);
});

test('isDocsOnlyPath accepts an ordinary *.md file anywhere in the repo', () => {
  assert.equal(isDocsOnlyPath('fsi-app/STATUS.md'), true);
  assert.equal(isDocsOnlyPath('fsi-app/README.md'), true);
  assert.equal(isDocsOnlyPath('design_handoff_2026-05/README.md'), true);
});

test('isDocsOnlyPath rejects code and workflow files', () => {
  assert.equal(isDocsOnlyPath('fsi-app/src/lib/trust.ts'), false);
  assert.equal(isDocsOnlyPath('.github/workflows/discipline.yml'), false);
  assert.equal(isDocsOnlyPath('fsi-app/scripts/lib/db.mjs'), false);
});

test('isDocsOnlyPath normalizes backslash paths and a leading slash', () => {
  assert.equal(isDocsOnlyPath('docs\\runbooks\\fleet-budget-control.md'), true);
  assert.equal(isDocsOnlyPath('/docs/INDEX.md'), true);
});

test('isDocsOnlyPath rejects an empty or blank path', () => {
  assert.equal(isDocsOnlyPath(''), false);
  assert.equal(isDocsOnlyPath('   '), false);
});

test('isDocsOnlyDiff is true when every changed file is docs-only', () => {
  assert.equal(
    isDocsOnlyDiff(['docs/runbooks/fleet-budget-control.md', 'docs/ops/session-log.d/2026-10-01-r22.md', 'fsi-app/STATUS.md']),
    true,
  );
});

test('isDocsOnlyDiff is false when even one changed file is code (the mixed-diff attack)', () => {
  assert.equal(
    isDocsOnlyDiff(['docs/runbooks/fleet-budget-control.md', '.github/workflows/discipline.yml']),
    false,
  );
});

test('isDocsOnlyDiff is false for an empty changed-file list (no diff is not "provably docs-only")', () => {
  assert.equal(isDocsOnlyDiff([]), false);
  assert.equal(isDocsOnlyDiff(['', '   ']), false);
});

test('isDocsOnlyDiff ignores blank entries mixed into an otherwise docs-only list', () => {
  assert.equal(isDocsOnlyDiff(['docs/INDEX.md', '', 'fsi-app/STATUS.md']), true);
});

// ── GATE-9: rename source (DO-1) ────────────────────────────────────────────────────────────────────

test('DO-1: parseNameStatusZ names BOTH paths of a rename and of a copy, one path for the rest', () => {
  const raw = ['R100', 'fsi-app/src/lib/api/auth.ts', 'docs/auth-moved.ts', 'M', 'docs/a.md', 'C75', 'x/src.mjs', 'docs/copy.mjs', 'D', 'fsi-app/y.ts', ''].join('\0');
  assert.deepEqual(parseNameStatusZ(raw), [
    'fsi-app/src/lib/api/auth.ts',
    'docs/auth-moved.ts',
    'docs/a.md',
    'x/src.mjs',
    'docs/copy.mjs',
    'fsi-app/y.ts',
  ]);
});

test('DO-1: a rename of production code into docs/ is not docs-only (the source path is code)', () => {
  const paths = parseNameStatusZ(['R100', 'fsi-app/src/lib/api/auth.ts', 'docs/auth-moved.ts', ''].join('\0'));
  assert.equal(isDocsOnlyDiff(paths), false);
  // the destination alone, which is all the old `--name-only` listing carried, read as docs
  assert.equal(isDocsOnlyPath('docs/auth-moved.ts'), false);
});

function gitFixture(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'docs-only-range-'));
  const git = (...args) =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], { cwd: dir, encoding: 'utf8' });
  try {
    git('init', '-q', '-b', 'main');
    return fn({ dir, git });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('DO-1: through real git, a `git mv` of code into docs/ yields both paths and the CLI says docs-only: false', () => {
  gitFixture(({ dir, git }) => {
    mkdirSync(join(dir, 'fsi-app', 'src', 'lib', 'api'), { recursive: true });
    mkdirSync(join(dir, 'docs'), { recursive: true });
    writeFileSync(join(dir, 'fsi-app', 'src', 'lib', 'api', 'auth.ts'), 'export const requireAuth = () => 1;\nexport const more = () => 2;\nexport const third = () => 3;\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'base');
    git('mv', 'fsi-app/src/lib/api/auth.ts', 'docs/auth-moved.ts');
    git('commit', '-q', '-m', 'move code into docs');
    const files = changedFiles('HEAD~1..HEAD', dir);
    assert.ok(files.includes('fsi-app/src/lib/api/auth.ts'), `the rename SOURCE must be listed, got ${JSON.stringify(files)}`);
    assert.ok(files.includes('docs/auth-moved.ts'));
    assert.equal(isDocsOnlyDiff(files), false);
    const r = spawnSync(process.execPath, [SCRIPT, '--range=HEAD~1..HEAD'], { cwd: dir, encoding: 'utf8', env: { ...process.env, DISCIPLINE_REPO_ROOT: dir } });
    assert.equal(r.status, 1, `exit status 1 (not docs-only), got ${r.status}: ${r.stderr}`);
    assert.match(r.stdout, /docs-only: false/);
  });
});

test('DO-1: a rename between two docs paths stays docs-only, and the CLI exits 0', () => {
  gitFixture(({ dir, git }) => {
    mkdirSync(join(dir, 'docs'), { recursive: true });
    writeFileSync(join(dir, 'docs', 'old-name.md'), '# a doc\n\nwith enough lines to be detected as a rename\nline three\nline four\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'base');
    git('mv', 'docs/old-name.md', 'docs/new-name.md');
    git('commit', '-q', '-m', 'rename a doc');
    const r = spawnSync(process.execPath, [SCRIPT, '--range=HEAD~1..HEAD'], { cwd: dir, encoding: 'utf8', env: { ...process.env, DISCIPLINE_REPO_ROOT: dir } });
    assert.equal(r.status, 0, `exit status 0 (docs-only), got ${r.status}: ${r.stderr}`);
    assert.match(r.stdout, /docs-only: true/);
  });
});

// ── GATE-9: governing docs (DO-2, DO-3) ─────────────────────────────────────────────────────────────

test('DO-2: the lane contract is a governing doc, so editing its heading is never docs-only', () => {
  assert.equal(isGoverningDocPath('docs/dispatches/lane-common-contract.md'), true);
  assert.equal(isDocsOnlyPath('docs/dispatches/lane-common-contract.md'), false);
  assert.equal(isDocsOnlyDiff(['docs/dispatches/lane-common-contract.md']), false);
});

test('DO-2: the COMMON terms briefs, the build plan, PROGRAM-BOARD and the maintenance runbook index are governing', () => {
  for (const p of [
    'docs/dispatches/lane-briefs/2026-09-18/brief-common-cloud.md',
    'docs/dispatches/lane-briefs/2026-09-19/brief-common-local.md',
    'docs/dispatches/COMMON.md',
    'docs/plans/complete-system-build-plan-2026-09-04.md',
    'docs/PROGRAM-BOARD.md',
    'docs/runbooks/MAINTENANCE-RUNBOOK.md',
    'docs/runbooks/maintenance.d/64-chain-proof.md',
  ]) {
    assert.equal(isDocsOnlyPath(p), false, `${p} is read by a skipped gate`);
  }
});

test('DO-2: the doctrine files the contradiction scan reads (CLAUDE.md, the skills) are governing', () => {
  assert.equal(isDocsOnlyPath('CLAUDE.md'), false);
  assert.equal(isDocsOnlyPath('fsi-app/.claude/CLAUDE.md'), false);
});

test('DO-3: any SKILL.md is governing, and a DELETED pinned SKILL.md is a code change', () => {
  const deleted = parseNameStatusZ(['D', 'fsi-app/.claude/skills/remediation-discipline/SKILL.md', ''].join('\0'));
  assert.deepEqual(deleted, ['fsi-app/.claude/skills/remediation-discipline/SKILL.md']);
  assert.equal(isDocsOnlyDiff(deleted), false);
  assert.equal(isDocsOnlyPath('fsi-app/.claude/skills/some-new-skill/SKILL.md'), false);
  assert.equal(isDocsOnlyPath('.claude/skills/ledger/SKILL.md'), false);
});

test('DO-3: through real git, deleting a pinned SKILL.md gives docs-only: false', () => {
  gitFixture(({ dir, git }) => {
    const skill = join(dir, 'fsi-app', '.claude', 'skills', 'remediation-discipline');
    mkdirSync(skill, { recursive: true });
    writeFileSync(join(skill, 'SKILL.md'), '# skill\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'base');
    git('rm', '-q', 'fsi-app/.claude/skills/remediation-discipline/SKILL.md');
    git('commit', '-q', '-m', 'delete the pinned skill');
    const r = spawnSync(process.execPath, [SCRIPT, '--range=HEAD~1..HEAD'], { cwd: dir, encoding: 'utf8', env: { ...process.env, DISCIPLINE_REPO_ROOT: dir } });
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stdout, /docs-only: false/);
  });
});

// ── GATE-9: code and tests that sit under docs/ (DO-1 destination, TD-4) ────────────────────────────

test('TD-4: an executable file or a test under docs/ is code, an ordinary design script is not', () => {
  assert.equal(isDocsOnlyPath('docs/at5-e.test.mjs'), false);
  assert.equal(isDocsOnlyPath('docs/x/helper.mjs'), false);
  assert.equal(isDocsOnlyPath('docs/tools/run.sh'), false);
  assert.equal(isDocsOnlyPath('docs/a.test.js'), false);
  assert.equal(isDocsOnlyPath('docs/design/handoff-2026-09-07/support.js'), true);
  assert.equal(isDocsOnlyPath('docs/design/handoff-2026-09-07/preview.html'), true);
});

test('TEST_FILE_RE names every test and golden spelling, in any directory', () => {
  for (const p of [
    'fsi-app/a.test.ts', 'scripts/b.test.mjs', 'fsi-app/src/lib/c.spec.mjs', 'docs/d.test.mjs', 'x/e.test.cjs',
    'fsi-app/f.npmtest.ts', 'fsi-app/g.selftest.mjs', 'v/x.golden.cjs', 'v/y.goldens.mjs', 'v/golden-z.mjs', 'v/funded-pass-lock-golden.mjs',
  ]) assert.ok(TEST_FILE_RE.test(p), `${p} is a test or golden`);
  for (const p of ['fsi-app/scripts/verify/run-goldens.mjs', 'docs/golden-path.md', 'fsi-app/src/lib/testing.mjs', 'a/b.test.json']) {
    assert.ok(!TEST_FILE_RE.test(p), `${p} is not a test file`);
  }
});

// ── GATE-9: the verdict's exit status (DO-5) ────────────────────────────────────────────────────────

test('DO-5: the CLI exit status is the verdict: 0 docs-only, 1 code, 1 empty, 2 bad range, 2 missing --range', () => {
  gitFixture(({ dir, git }) => {
    mkdirSync(join(dir, 'docs'), { recursive: true });
    mkdirSync(join(dir, 'fsi-app', 'src'), { recursive: true });
    writeFileSync(join(dir, 'docs', 'a.md'), '# a\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'c0');
    writeFileSync(join(dir, 'docs', 'a.md'), '# a\n\nmore\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'c1 docs only');
    writeFileSync(join(dir, 'fsi-app', 'src', 'x.ts'), 'export const x = 1;\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'c2 code');
    const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, DISCIPLINE_REPO_ROOT: dir } });
    const docs = run('--range=HEAD~2..HEAD~1');
    assert.equal(docs.status, 0, docs.stderr);
    assert.match(docs.stdout, /docs-only: true/);
    const code = run('--range=HEAD~1..HEAD');
    assert.equal(code.status, 1, code.stderr);
    assert.match(code.stdout, /docs-only: false/);
    const empty = run('--range=HEAD..HEAD');
    assert.equal(empty.status, 1, 'an empty diff is not provably docs-only');
    assert.equal(run('--range=no-such-ref..HEAD').status, 2);
    assert.equal(run().status, 2);
  });
});
