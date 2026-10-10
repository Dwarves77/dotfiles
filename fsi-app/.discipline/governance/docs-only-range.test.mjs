// docs-only-range.test.mjs (lane R22, 2026-10-01; GATE-9 additions 2026-10-08). Tests for the shared
// docs-only filter pre-push and discipline.yml both call. node:test + node:assert/strict, no npm deps.
// The GATE-9 cases carry the AUD-AT-5 register's attack id in the test name (DO-1, DO-2, DO-3, DO-5).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isDocsOnlyPath,
  isDocsOnlyDiff,
  isGoverningDocPath,
  extractReadDocPaths,
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

// ── CI-FIX-1 (RULES-X-1 item 10, 2026-10-09): a docs file a test or gate READS is governing ──────────
// The list is DERIVED by scanning the tracked tests and governance modules for the docs paths they name,
// never typed into the module. Cell ids: DO-READ-1 (derivation), DO-READ-2 (real repo), DO-READ-3 (attack).

test('DO-READ-1: extractReadDocPaths takes a path literal and a join of segments, and skips comment lines and prose', () => {
  const sources = [
    {
      path: 'fsi-app/.discipline/x.test.mjs',
      text: [
        "const A = readFileSync('docs/zz/literal-read.md', 'utf8');",
        "const B = readFileSync(join(REPO, 'docs', 'zz', 'segments', 'joined-read.md'), 'utf8');",
        "// a comment naming 'docs/zz/comment-only.md' is not a read",
        " * 'docs/zz/doc-block-only.md' in a block comment is not a read",
        "const msg = 'see docs/zz/prose-only.md for the story';",
        "const C = resolve(ROOT, 'fsi-app/.discipline/governance/some-boundary.md');",
        "const D = 'src/not-a-docs-path/file.json';",
      ].join('\n'),
    },
  ];
  const set = extractReadDocPaths(sources);
  assert.ok(set.has('docs/zz/literal-read.md'));
  assert.ok(set.has('docs/zz/segments/joined-read.md'));
  assert.ok(set.has('fsi-app/.discipline/governance/some-boundary.md'));
  assert.ok(!set.has('docs/zz/comment-only.md'));
  assert.ok(!set.has('docs/zz/doc-block-only.md'));
  assert.ok(!set.has('docs/zz/prose-only.md'));
});

test('DO-READ-1: a plain list of names is not a read, a named path constant is', () => {
  const set = extractReadDocPaths([
    {
      path: 'fsi-app/.discipline/y.mjs',
      text: ["const LIST = ['docs/zz/listed-only.md'];", "const PROGRAM_DOC = 'docs/zz/named-constant.md';", "classify(['docs/zz/argument-only.md']);"].join('\n'),
    },
  ]);
  assert.ok(set.has('docs/zz/named-constant.md'));
  assert.ok(!set.has('docs/zz/listed-only.md'));
  assert.ok(!set.has('docs/zz/argument-only.md'));
});

test('DO-READ-1: a docs file a scanned source reads is governing, an unread one stays docs-only (the set is injected)', () => {
  const reads = extractReadDocPaths([{ path: 'a.test.mjs', text: "readFileSync('docs/zz/read-by-a-test.md')" }]);
  assert.equal(isGoverningDocPath('docs/zz/read-by-a-test.md', reads), true);
  assert.equal(isDocsOnlyPath('docs/zz/read-by-a-test.md', reads), false);
  assert.equal(isDocsOnlyPath('docs/zz/read-by-nothing.md', reads), true);
  assert.equal(isDocsOnlyDiff(['docs/zz/read-by-nothing.md', 'docs/zz/read-by-a-test.md'], reads), false);
});

test('DO-READ-1: the module derives its list by scanning, it does not hand-type the docs it found', () => {
  const src = readFileSync(SCRIPT, 'utf8');
  assert.equal(/AUDIT-2026-09-07/.test(src), false);
  assert.equal(/OUT-OF-REPO-BOUNDARY/.test(src), false);
});

test('DO-READ-2: against the real repo, the docs the existing gates read are governing (OUT-OF-REPO-BOUNDARY, AUDIT-2026-09-07)', () => {
  assert.equal(isGoverningDocPath('fsi-app/.discipline/governance/OUT-OF-REPO-BOUNDARY.md'), true);
  assert.equal(isGoverningDocPath('docs/design/handoff-2026-09-06/AUDIT-2026-09-07.md'), true);
  assert.equal(isDocsOnlyPath('fsi-app/.discipline/governance/OUT-OF-REPO-BOUNDARY.md'), false);
});

test('DO-READ-3 attack: a change to a read docs file classes the diff as code, through real git', () => {
  gitFixture(({ dir, git }) => {
    mkdirSync(join(dir, 'docs', 'zz'), { recursive: true });
    mkdirSync(join(dir, 'fsi-app', '.discipline'), { recursive: true });
    writeFileSync(join(dir, 'docs', 'zz', 'read.md'), '# read\n');
    writeFileSync(join(dir, 'docs', 'zz', 'unread.md'), '# unread\n');
    writeFileSync(join(dir, 'fsi-app', '.discipline', 'reader.test.mjs'), "readFileSync('docs/zz/read.md');\n");
    git('add', '-A');
    git('commit', '-q', '-m', 'base');
    writeFileSync(join(dir, 'docs', 'zz', 'unread.md'), '# unread\n\nedit\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'edit the unread doc');
    writeFileSync(join(dir, 'docs', 'zz', 'read.md'), '# read\n\nedit\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'edit the read doc');
    const run = (range) => spawnSync(process.execPath, [SCRIPT, `--range=${range}`], { cwd: dir, encoding: 'utf8', env: { ...process.env, DISCIPLINE_REPO_ROOT: dir } });
    const unread = run('HEAD~2..HEAD~1');
    assert.equal(unread.status, 0, unread.stderr);
    assert.match(unread.stdout, /docs-only: true/);
    const read = run('HEAD~1..HEAD');
    assert.equal(read.status, 1, read.stderr);
    assert.match(read.stdout, /docs-only: false/);
  });
});

// CIFIX-2 (2026-10-10, rows rw-wf:131 / cifix1 NOT done): the read scan walks the TOKENS of every tracked test and
// governance module (strings, templates, comments, calls), not its lines. A docs path read through a template with
// a variable prefix, across lines, or through a binding read in a later statement is a dependency too.
// Cell ids: DO-AST-1 (template prefix), DO-AST-2 (multi-line call and join), DO-AST-3 (binding then read),
// DO-AST-4 (still skipped: comments, prose, lists, non-read arguments), DO-AST-5 (attack through real git).

const scan = (text, path = 'fsi-app/.discipline/z.test.mjs') => extractReadDocPaths([{ path, text }]);

test('DO-AST-1: a template literal with a variable prefix names the docs file it reads', () => {
  const set = scan(
    [
      'const a = readFileSync(`${root}/docs/zz/template-read.md`, "utf8");',
      'const b = readFileSync(`${join(root, "x")}/fsi-app/.discipline/zz/nested-template.md`, "utf8");',
      'const c = readFileSync(`${root}/docs/zz/${name}.md`, "utf8");',
    ].join('\n'),
  );
  assert.ok(set.has('docs/zz/template-read.md'));
  assert.ok(set.has('fsi-app/.discipline/zz/nested-template.md'));
  assert.ok(![...set].some((p) => p.includes('${') || p.includes('\0')), 'a path with an unresolved interpolation is never listed');
});

test('DO-AST-2: a path on a later line of a read call, and a join spread over lines, are reads', () => {
  const set = scan(
    [
      'const a = readFileSync(',
      '  `docs/zz/multi-line.md`,',
      "  'utf8',",
      ');',
      'const b = readFileSync(join(',
      '  REPO,',
      "  'docs',",
      "  'zz',",
      "  'multi-join.md',",
      "), 'utf8');",
      'const c = path.resolve(REPO, `${dir}/docs/zz/resolved.md`);',
    ].join('\n'),
  );
  assert.ok(set.has('docs/zz/multi-line.md'));
  assert.ok(set.has('docs/zz/multi-join.md'));
  assert.ok(set.has('docs/zz/resolved.md'));
});

test('DO-AST-3: a path bound to a name (any case) and read in a later statement is a read', () => {
  const set = scan(
    [
      'const p = `${root}/docs/zz/bound-template.md`;',
      "let q = 'docs/zz/bound-lower.md';",
      "var r;",
      "r = 'docs/zz/assigned.md';",
      'const body = readFileSync(p, "utf8") + readFileSync(q) + readFileSync(r);',
      "const cfg = { file: 'docs/zz/property.md' };",
    ].join('\n'),
  );
  for (const want of ['docs/zz/bound-template.md', 'docs/zz/bound-lower.md', 'docs/zz/assigned.md', 'docs/zz/property.md']) assert.ok(set.has(want), want);
});

test('DO-AST-4: comments, prose, plain lists and non-read arguments still name no read', () => {
  const set = scan(
    [
      "// readFileSync('docs/zz/line-comment.md')",
      "/* readFileSync('docs/zz/block-comment.md') */ const x = 1;",
      '/**',
      " * readFileSync('docs/zz/doc-block.md')",
      ' */',
      "const msg = 'see docs/zz/prose.md for the story';",
      'const tpl = `see ${who} and docs/zz/template-prose.md for the story`;',
      "const LIST = ['docs/zz/listed.md', 'docs/zz/listed-two.md'];",
      "classify(['docs/zz/array-argument.md']);",
      "report('docs/zz/plain-argument.md');",
      "const re = /readFileSync\('docs\/zz\/in-regex.md'\)/;",
    ].join('\n'),
  );
  assert.deepEqual([...set], []);
});

test('DO-AST-4: a quote, a slash or a backtick inside a comment or regex does not desynchronise the scan', () => {
  const set = scan(
    [
      "// it's a comment with an apostrophe and a `backtick",
      "const re = /['\"`]/g; const x = 4 / 2 / 1;",
      "const ok = readFileSync('docs/zz/after-noise.md');",
    ].join('\n'),
  );
  assert.deepEqual([...set], ['docs/zz/after-noise.md']);
});

test('DO-AST-5 attack: a docs file read only through a ${root} template is governing, through real git', () => {
  gitFixture(({ dir, git }) => {
    mkdirSync(join(dir, 'docs', 'zz'), { recursive: true });
    mkdirSync(join(dir, 'fsi-app', '.discipline'), { recursive: true });
    writeFileSync(join(dir, 'docs', 'zz', 'tpl-read.md'), '# read\n');
    writeFileSync(join(dir, 'docs', 'zz', 'unread.md'), '# unread\n');
    writeFileSync(join(dir, 'fsi-app', '.discipline', 'reader.test.mjs'), 'const root = process.cwd();\nconst body = readFileSync(`${root}/docs/zz/tpl-read.md`, "utf8");\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'base');
    writeFileSync(join(dir, 'docs', 'zz', 'unread.md'), '# unread\n\nedit\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'edit the unread doc');
    writeFileSync(join(dir, 'docs', 'zz', 'tpl-read.md'), '# read\n\nedit\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'edit the template-read doc');
    const run = (range) => spawnSync(process.execPath, [SCRIPT, `--range=${range}`], { cwd: dir, encoding: 'utf8', env: { ...process.env, DISCIPLINE_REPO_ROOT: dir } });
    const unread = run('HEAD~2..HEAD~1');
    assert.equal(unread.status, 0, unread.stderr);
    const read = run('HEAD~1..HEAD');
    assert.equal(read.status, 1, read.stderr);
    assert.match(read.stdout, /docs-only: false/);
  });
});
