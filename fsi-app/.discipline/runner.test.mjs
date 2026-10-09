// Integration tests for the runner. Verifies the engine wires manifest -> trigger -> check -> result correctly.
// Run: node --test fsi-app/.discipline/runner.test.mjs
//
// History: post-slim (2026-05-21) the engine had 2 rules; lane GATE-1 (2026-10-08) removed rules 014, 016
// and 020 and moved the content rules to introduced-lines scope. The registered set is now 012, 015, 017,
// 018, 019, 021, 022. The end-to-end tests below build a real throwaway git repository, stage a change and
// run the commit-msg mode the hook runs, so the one-diff context, the introduced-lines scope and the firing
// log are proven through the same entry point a commit uses.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, mkdirSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve as resolvePath } from 'node:path';

const RUNNER = resolvePath(import.meta.dirname, 'runner.mjs');

// Banned characters and a home-directory path are built at runtime: this file's own source must carry none.
const EM = String.fromCharCode(0x2014);
const HOME_PATH = 'C:/Users' + '/' + 'someone/project';

function runFixture(message, files) {
  const dir = mkdtempSync(join(tmpdir(), 'discipline-test-'));
  const msgPath = join(dir, 'msg.txt');
  const filesPath = join(dir, 'files.json');
  writeFileSync(msgPath, message);
  writeFileSync(filesPath, JSON.stringify(files));
  try {
    const out = execFileSync('node', [RUNNER, '--mode=fixture', `--message-file=${msgPath}`, `--files-file=${filesPath}`], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { exitCode: 0, output: out };
  } catch (err) {
    return { exitCode: err.status, output: (err.stdout || '') + (err.stderr || '') };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('runner: --list prints the registered rules and none of the removed ones', () => {
  const out = execFileSync('node', [RUNNER, '--list'], { encoding: 'utf-8' });
  for (const id of ['012', '015', '017', '018', '019', '021', '022', '023']) assert.ok(out.includes(`[${id}]`), `rule ${id} registered`);
  for (const id of ['014', '016', '020']) assert.ok(!out.includes(`[${id}]`), `rule ${id} removed`);
  assert.ok(out.includes('Hardcoded user-home path'));
  assert.ok(out.includes('Registered rules (8)'));
});

test('runner: fixture for trivial commit exits 0', () => {
  const result = runFixture(
    'chore: typo',
    [{ path: 'README.md', additions: 1, deletions: 1 }]
  );
  assert.equal(result.exitCode, 0, `expected exit 0, got ${result.exitCode}. Output:\n${result.output}`);
});

test('runner: fixture for substantial commit with no trailers exits 0 (no attestation required)', () => {
  const result = runFixture(
    'feat: ship the thing\n\nplain body, no trailers, no attestation.',
    Array.from({ length: 10 }, (_, i) => ({ path: `fsi-app/src/f${i}.ts`, additions: 5, deletions: 5 }))
  );
  assert.equal(result.exitCode, 0, `expected exit 0, got ${result.exitCode}. Output:\n${result.output}`);
});

test('runner: an inventory-touching commit needs no consistency run at commit time (rule 014 removed)', () => {
  const result = runFixture(
    'docs: inventory',
    [{ path: 'docs/inventories/migrations.md', additions: 3, deletions: 0 }]
  );
  assert.equal(result.exitCode, 0, `expected exit 0, got ${result.exitCode}. Output:\n${result.output}`);
});

// ---------------------------------------------------------------------------
// End to end on a real repository
// ---------------------------------------------------------------------------

function git(dir, args) {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function write(dir, rel, content) {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  writeFileSync(join(dir, rel), content);
}

function newRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'discipline-e2e-'));
  git(dir, ['init', '-q']);
  git(dir, ['config', 'user.email', 't@example.com']);
  git(dir, ['config', 'user.name', 'T']);
  git(dir, ['config', 'commit.gpgsign', 'false']);
  git(dir, ['config', 'core.autocrlf', 'false']);
  return dir;
}

// The baseline content carries, on lines the later change never touches: a banned glyph, a home path, a
// raw database write and a knob read. Under the old whole-file rules any edit to these files failed.
function baseline(kind, i) {
  const common = [`// file ${kind} ${i}`, `// note ${EM} written long ago`, `const keep = ${i};`];
  if (kind === 'script') {
    return [...common, `const REPO = '${HOME_PATH}';`, 'const sb = createClient(u, k);', 'await sb.from("sources").update({ x: 1 }).eq("id", 1);', 'export {};'].join('\n') + '\n';
  }
  if (kind === 'ts') return [...common, `export const HOME = '${HOME_PATH}';`].join('\n') + '\n';
  if (kind === 'doc') return [`# doc ${i}`, `an old aside ${EM} kept as written`, 'text'].join('\n') + '\n';
  return [...common, 'export default function C() { return null; }'].join('\n') + '\n';
}

function seed77(dir) {
  const files = [];
  for (let i = 0; i < 30; i++) files.push([`fsi-app/scripts/gen/s${i}.mjs`, 'script', i]);
  for (let i = 0; i < 20; i++) files.push([`fsi-app/src/lib/x/t${i}.ts`, 'ts', i]);
  for (let i = 0; i < 10; i++) files.push([`fsi-app/src/components/c${i}.tsx`, 'tsx', i]);
  for (let i = 0; i < 17; i++) files.push([`docs/notes/n${i}.md`, 'doc', i]);
  for (const [rel, kind, i] of files) write(dir, rel, baseline(kind, i));
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'base']);
  return files;
}

function editAll(dir, files, extra = () => null) {
  for (const [rel, kind, i] of files) {
    const added = extra(rel, kind, i);
    write(dir, rel, baseline(kind, i) + (added ?? `// edited ${i}`) + '\n');
  }
  git(dir, ['add', '-A']);
}

function commitMsg(dir, env = {}) {
  const msg = join(dir, '.git', 'COMMIT_EDITMSG');
  writeFileSync(msg, 'chore: touch many files');
  const started = process.hrtime.bigint();
  const r = spawnSync('node', [RUNNER, '--mode=commit-msg', `--message-file=${msg}`], {
    cwd: dir, encoding: 'utf-8', env: { ...process.env, DISCIPLINE_FIRING_LOG: 'off', ...env },
  });
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  return { code: r.status, out: (r.stdout || '') + (r.stderr || ''), ms };
}

test('e2e: 77 staged files whose UNTOUCHED lines carry glyphs, home paths, raw writes and knob reads pass', () => {
  const dir = newRepo();
  try {
    const files = seed77(dir);
    editAll(dir, files);
    assert.equal(git(dir, ['diff', '--cached', '--name-only']).trim().split('\n').length, 77);
    const r = commitMsg(dir, { DISCIPLINE_FIRING_LOG: 'off' });
    assert.equal(r.code, 0, r.out);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('e2e: commit-msg over 77 staged files spawns exactly ONE git diff (the old engine spawned 154 plus a numstat)', () => {
  const dir = newRepo();
  const trace = join(dir, 'git-trace.log');
  try {
    const files = seed77(dir);
    editAll(dir, files);
    const r = commitMsg(dir, { DISCIPLINE_FIRING_LOG: 'off', GIT_TRACE: trace });
    assert.equal(r.code, 0, r.out);
    const diffs = readFileSync(trace, 'utf-8').split('\n').filter((l) => /built-in: git (-c [^ ]+ )?diff\b/.test(l));
    assert.equal(diffs.length, 1, `expected 1 git diff process, saw ${diffs.length}:\n${diffs.join('\n')}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// The budget is 2000 ms on a quiet machine (the register measured 12.5 s for the old engine at this size).
// An absolute number is only meaningful relative to the host, so the limit is the larger of 2000 ms and
// four times this host's own floor: node start plus the single `git diff --cached --numstat` over the same
// 77 files, which any engine must pay. A loaded shared runner raises the floor and the limit with it; a
// regression to per-file git spawns (154 extra processes) exceeds either by an order of magnitude.
test('e2e: commit-msg at 77 staged files runs within budget (2000 ms, or 4x the host floor on a loaded machine)', () => {
  const dir = newRepo();
  try {
    const files = seed77(dir);
    editAll(dir, files);
    const timeIt = (cmd, args) => {
      const t0 = process.hrtime.bigint();
      spawnSync(cmd, args, { cwd: dir, stdio: 'ignore' });
      return Number(process.hrtime.bigint() - t0) / 1e6;
    };
    const floor = Math.min(...[1, 2, 3].map(() => timeIt('node', ['-e', '0']) + timeIt('git', ['diff', '--cached', '--numstat'])));
    const runs = [1, 2, 3].map(() => commitMsg(dir, { DISCIPLINE_FIRING_LOG: 'off' }));
    for (const r of runs) assert.equal(r.code, 0, r.out);
    const best = Math.min(...runs.map((r) => r.ms));
    const limit = Math.max(2000, 4 * floor);
    console.log(`# commit-msg, 77 staged files, best of 3: ${Math.round(best)} ms (runs: ${runs.map((r) => Math.round(r.ms)).join(', ')} ms; host floor ${Math.round(floor)} ms; limit ${Math.round(limit)} ms)`);
    assert.ok(best < limit, `commit-msg took ${Math.round(best)} ms at 77 staged files; the limit on this host is ${Math.round(limit)} ms`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('e2e: an INTRODUCED glyph, home path and raw database write are each blocked, with file and line', () => {
  const dir = newRepo();
  try {
    const files = seed77(dir);
    editAll(dir, files, (rel, kind, i) => {
      if (i !== 3) return null;
      if (kind === 'ts') return `export const BAD = '${HOME_PATH}';`;
      if (kind === 'script') return `// fresh ${EM} aside\nawait sb.from("sources").delete().eq("id", 2);`;
      return null;
    });
    const r = commitMsg(dir, { DISCIPLINE_FIRING_LOG: 'off' });
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /FAIL {2}\[012\]/);
    assert.match(r.out, /FAIL {2}\[015\]/);
    assert.match(r.out, /FAIL {2}\[022\]/);
    assert.match(r.out, /fsi-app\/src\/lib\/x\/t3\.ts:\d+/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('e2e: renaming a file that carries glyphs and a home path is not a violation', () => {
  const dir = newRepo();
  try {
    write(dir, 'docs/notes/old-name.md', baseline('doc', 1).repeat(4));
    write(dir, 'fsi-app/src/lib/x/old.ts', baseline('ts', 1).repeat(3));
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '-m', 'base']);
    git(dir, ['mv', 'docs/notes/old-name.md', 'docs/notes/new-name.md']);
    git(dir, ['mv', 'fsi-app/src/lib/x/old.ts', 'fsi-app/src/lib/x/new.ts']);
    const r = commitMsg(dir, { DISCIPLINE_FIRING_LOG: 'off' });
    assert.equal(r.code, 0, r.out);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('e2e: the firing log gets one line per firing {ts, rule, mode, path, line, verdict, baseline}', () => {
  const dir = newRepo();
  const log = join(dir, 'firings.log');
  try {
    write(dir, 'fsi-app/src/lib/x/a.ts', 'export const a = 1;\n');
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '-m', 'base']);
    write(dir, 'fsi-app/src/lib/x/a.ts', `export const a = 1;\nexport const HOME = '${HOME_PATH}';\n`);
    git(dir, ['add', '-A']);
    const r = commitMsg(dir, { DISCIPLINE_FIRING_LOG: log });
    assert.equal(r.code, 1, r.out);
    assert.ok(existsSync(log), 'the firing log was written');
    const rows = readFileSync(log, 'utf-8').trim().split('\n').map((l) => JSON.parse(l));
    const fail = rows.find((x) => x.rule === '012' && x.verdict === 'FAIL');
    assert.ok(fail, 'rule 012 FAIL logged');
    assert.deepEqual(Object.keys(fail).sort(), ['baseline', 'line', 'mode', 'path', 'rule', 'ts', 'verdict']);
    assert.match(fail.baseline, /^fallback previous commit \(HEAD\): origin\/master does not resolve/, 'a repo with no origin/master names its fallback in the log');
    assert.equal(fail.path, 'fsi-app/src/lib/x/a.ts');
    assert.equal(fail.line, 2);
    assert.equal(fail.mode, 'commit-msg');
    assert.ok(!Number.isNaN(Date.parse(fail.ts)));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('e2e: DISCIPLINE_FIRING_LOG=off writes no log, and fixture mode writes none unless a path is named', () => {
  const dir = newRepo();
  try {
    write(dir, 'fsi-app/src/lib/x/a.ts', 'export const a = 1;\n');
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '-m', 'base']);
    write(dir, 'fsi-app/src/lib/x/a.ts', 'export const a = 2;\n');
    git(dir, ['add', '-A']);
    const r = commitMsg(dir, { DISCIPLINE_FIRING_LOG: 'off' });
    assert.equal(r.code, 0, r.out);
    assert.ok(!existsSync(join(dir, 'off')));

    // fixture mode: no env var means no write even though a rule fires and FAILS
    const msg = join(dir, 'm.txt');
    const filesJson = join(dir, 'f.json');
    writeFileSync(msg, 'feat: x');
    writeFileSync(filesJson, JSON.stringify({ files: [{ path: 'fsi-app/src/a.ts' }], changes: [{ path: 'fsi-app/src/a.ts', added: [`const H = '${HOME_PATH}';`] }] }));
    const env = { ...process.env };
    delete env.DISCIPLINE_FIRING_LOG;
    const defaultLog = join(import.meta.dirname, 'governance', '.hook-firings.log');
    const sizeBefore = existsSync(defaultLog) ? readFileSync(defaultLog).length : -1;
    const fx = spawnSync('node', [RUNNER, '--mode=fixture', `--message-file=${msg}`, `--files-file=${filesJson}`], { cwd: dir, encoding: 'utf-8', env });
    assert.equal(fx.status, 1, 'the fixture diff view reaches the rules through the CLI');
    const sizeAfter = existsSync(defaultLog) ? readFileSync(defaultLog).length : -1;
    assert.equal(sizeAfter, sizeBefore, 'fixture mode left the default firing log untouched');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// The baseline (lane GATE-5, 2026-10-08): "introduced" is measured against the merge base with
// origin/master, not the previous commit. DEAD-1 hit this: rule 022 blocked a byte-identical restore of a
// master file because the branch's previous commit had deleted it.
// ---------------------------------------------------------------------------

const KEEP = 'docs/notes/keep.md';
const HOME_TS = 'fsi-app/src/lib/x/home.ts';

// master holds two files that carry a glyph and a home path; origin/master points at it; the branch's
// first commit deletes both. `withOrigin: false` leaves the repo with no remote-tracking ref (the fallback).
function deletedOnBranch({ withOrigin = true } = {}) {
  const dir = newRepo();
  write(dir, KEEP, `# keep\nan old aside ${EM} kept as written\n`);
  write(dir, HOME_TS, `export const HOME = '${HOME_PATH}';\n`);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'master state']);
  if (withOrigin) git(dir, ['update-ref', 'refs/remotes/origin/master', 'HEAD']);
  git(dir, ['rm', '-q', KEEP, HOME_TS]);
  git(dir, ['commit', '-q', '-m', 'delete both']);
  return dir;
}

const restore = (dir) => git(dir, ['checkout', 'HEAD~1', '--', KEEP, HOME_TS]);

function runnerCi(dir, args, env = {}) {
  const r = spawnSync('node', [RUNNER, '--mode=ci', ...args], {
    cwd: dir, encoding: 'utf-8', env: { ...process.env, DISCIPLINE_FIRING_LOG: 'off', ...env },
  });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || ''), stdout: r.stdout || '', stderr: r.stderr || '' };
}

test('baseline e2e: a byte-identical RESTORE of master files that carry a glyph and a home path passes 022 and 012', () => {
  const dir = deletedOnBranch();
  try {
    restore(dir);
    const r = commitMsg(dir);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /Baseline: merge base with origin\/master \([0-9a-f]{8}\)/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('baseline e2e: a NEW glyph line in the same commit as the restore still fails, and only the new line is charged', () => {
  const dir = deletedOnBranch();
  try {
    restore(dir);
    write(dir, 'docs/notes/fresh.md', `# fresh\nbrand new ${EM} aside\n`);
    git(dir, ['add', '-A']);
    const r = commitMsg(dir);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /FAIL {2}\[022\]/);
    assert.match(r.out, /docs\/notes\/fresh\.md: brand new/);
    assert.ok(!r.out.includes('keep.md'), 'the restored file is not charged');
    assert.ok(!/FAIL {2}\[012\]/.test(r.out), 'the restored home path is not charged');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('baseline e2e: a restore that EDITS a line to add a new glyph is still caught', () => {
  const dir = deletedOnBranch();
  try {
    restore(dir);
    write(dir, KEEP, `# keep\nan old aside ${EM} kept as written\nand a second ${EM} aside\n`);
    git(dir, ['add', '-A']);
    const r = commitMsg(dir);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /docs\/notes\/keep\.md: and a second/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('baseline e2e FALLBACK: with no origin/master the previous commit is the baseline, the restore is charged, and the output names the fallback', () => {
  const dir = deletedOnBranch({ withOrigin: false });
  try {
    restore(dir);
    const r = commitMsg(dir);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /FAIL {2}\[022\]/);
    assert.match(r.out, /FAIL {2}\[012\]/);
    assert.match(r.out, /Baseline: fallback previous commit \(HEAD\): origin\/master does not resolve \(no remote-tracking ref\)/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('baseline e2e: an unchanged block MOVED to another file across two commits of the branch passes 012, a different home path fails', () => {
  const dir = newRepo();
  try {
    const line = `export const HOME = '${HOME_PATH}';`;
    write(dir, 'fsi-app/src/lib/x/a.ts', `export const one = 1;\n${line}\nexport const two = 2;\n`);
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '-m', 'master state']);
    git(dir, ['update-ref', 'refs/remotes/origin/master', 'HEAD']);
    write(dir, 'fsi-app/src/lib/x/a.ts', 'export const one = 1;\nexport const two = 2;\n');
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '-m', 'take the block out of a.ts']);

    write(dir, 'fsi-app/src/lib/x/b.ts', `export const three = 3;\n${line}\n`);
    git(dir, ['add', '-A']);
    const moved = commitMsg(dir);
    assert.equal(moved.code, 0, moved.out);

    write(dir, 'fsi-app/src/lib/x/b.ts', `export const three = 3;\nexport const OTHER = '${HOME_PATH}/elsewhere';\n`);
    git(dir, ['add', '-A']);
    const fresh = commitMsg(dir);
    assert.equal(fresh.code, 1, fresh.out);
    assert.match(fresh.out, /FAIL {2}\[012\]/);
    assert.match(fresh.out, /fsi-app\/src\/lib\/x\/b\.ts:2/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('baseline e2e: the firing log records the baseline used on every row', () => {
  const dir = deletedOnBranch();
  const log = join(dir, 'firings.log');
  try {
    restore(dir);
    write(dir, 'docs/notes/fresh.md', `bad ${EM} line\n`);
    git(dir, ['add', '-A']);
    const r = commitMsg(dir, { DISCIPLINE_FIRING_LOG: log });
    assert.equal(r.code, 1, r.out);
    const rows = readFileSync(log, 'utf-8').trim().split('\n').map((l) => JSON.parse(l));
    assert.ok(rows.length > 0);
    for (const row of rows) assert.match(row.baseline, /^merge base with origin\/master \([0-9a-f]{8}\)$/);
    const fail = rows.find((x) => x.rule === '022' && x.verdict === 'FAIL');
    assert.equal(fail.path, 'docs/notes/fresh.md');
    console.log(`# firing-log sample: ${JSON.stringify(fail)}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('baseline e2e CI: a restore commit passes --commit=<sha> in the pull-request shape (BASE_REF)', () => {
  const dir = deletedOnBranch();
  try {
    restore(dir);
    git(dir, ['commit', '-q', '-m', 'restore both']);
    const sha = git(dir, ['rev-parse', 'HEAD']).trim();
    const r = runnerCi(dir, [`--commit=${sha}`], { BASE_REF: 'master' });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /Baseline: merge base with origin\/master/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('baseline e2e CI: a pull request that deletes then restores passes the per-commit walk and the whole-range pass', () => {
  const dir = deletedOnBranch();
  try {
    restore(dir);
    git(dir, ['commit', '-q', '-m', 'restore both']);
    const head = git(dir, ['rev-parse', 'HEAD']).trim();
    const r = runnerCi(dir, [], { BASE_REF: 'master', PR_HEAD: head });
    assert.equal(r.code, 0, r.out);
    const baselines = r.out.split('\n').filter((l) => l.includes('Baseline:'));
    assert.equal(baselines.length, 3, `two commits plus the whole-range pass:\n${baselines.join('\n')}`);
    assert.ok(baselines.slice(0, 2).every((l) => /merge base with origin\/master/.test(l)));
    assert.match(baselines[2], /Baseline: range [0-9a-f]{40}\.\.[0-9a-f]{40}/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('baseline e2e CI: a commit that is already on origin/master (push to master) is still checked against its parent, not an empty diff', () => {
  const dir = newRepo();
  try {
    write(dir, 'docs/notes/a.md', 'clean\n');
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '-m', 'older']);
    write(dir, 'docs/notes/b.md', `merged ${EM} aside\n`);
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '-m', 'squash commit']);
    git(dir, ['update-ref', 'refs/remotes/origin/master', 'HEAD']);
    const sha = git(dir, ['rev-parse', 'HEAD']).trim();
    const r = runnerCi(dir, [`--commit=${sha}`]);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /Baseline: fallback parent commit: the commit is already on origin\/master/);
    assert.match(r.out, /docs\/notes\/b\.md/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// A pull-request range is judged by its squash for content rules (lane RULE-RANGE-1, 2026-10-08).
// Observed on PR 1031 (head 176519f8e): the whole-range pass was green (the lane marked its two regex-class
// glyph lines glyph:verbatim) while three per-commit runs failed rule 022 on commits made before the marker
// existed. Every pull request merges by squash, so the squash is the only diff that lands; history that never
// lands cannot fail the PR. Commit-form (whole-commit scope) rules, and any range whose commits all land (an
// explicit --range, the local merge-base, the push to master), keep their per-commit verdicts.
// ---------------------------------------------------------------------------

const NOTE = 'docs/notes/aside.md';
const SUPERSEDED = /superseded: content rule 022 is judged on the whole-range diff for a squash-merged pull request/;

// master holds one clean file (origin/master points at it); the branch adds a glyph line in commit 1 and marks
// it glyph:verbatim in commit 2. Returns the dir, the head sha and the base sha.
function glyphThenMarked() {
  const dir = newRepo();
  write(dir, 'docs/notes/base.md', '# base\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'master state']);
  git(dir, ['update-ref', 'refs/remotes/origin/master', 'HEAD']);
  write(dir, NOTE, `# aside\nan aside ${EM} written before the marker existed\n`);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'add the aside']);
  write(dir, NOTE, `# aside\nan aside ${EM} written before the marker existed glyph:verbatim\n`);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'mark the aside']);
  return { dir, head: git(dir, ['rev-parse', 'HEAD']).trim(), base: git(dir, ['rev-parse', 'HEAD~2']).trim() };
}

test('squash verdict (a): PR-shape range, glyph in commit 1 marked in commit 2: whole range passes, exit 0, commit 1 prints its failure then the superseded line', () => {
  const { dir, head } = glyphThenMarked();
  try {
    const r = runnerCi(dir, [], { BASE_REF: 'master', PR_HEAD: head });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /\(ci-pr\)/);
    assert.match(r.stderr, /FAIL {2}\[022\]/, 'commit 1 is still printed as a failure in full');
    const first = r.stdout.split('=== Commit ')[1];
    assert.match(first, SUPERSEDED, 'and is marked superseded');
    assert.equal(r.stdout.split('superseded:').length - 1, 1, 'exactly one superseded line: commit 2 and the whole range pass');
    assert.match(r.stdout.split('=== Whole-range diff')[1], /Summary: \d+ pass, 0 fail/, 'the whole-range pass has no failure');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('squash verdict (c): the same range under an explicit --range, the local merge-base shape or --commit keeps per-commit verdicts, exit 1', () => {
  const { dir, head, base } = glyphThenMarked();
  try {
    const explicit = runnerCi(dir, [`--range=${base}..${head}`]);
    assert.equal(explicit.code, 1, explicit.out);
    assert.match(explicit.out, /FAIL {2}\[022\]/);
    assert.ok(!SUPERSEDED.test(explicit.out), 'an explicit range supersedes nothing');

    const local = runnerCi(dir, []);
    assert.equal(local.code, 1, local.out);
    assert.match(local.out, /\(local-merge-base\)/);
    assert.ok(!SUPERSEDED.test(local.out), 'the local merge-base shape supersedes nothing');

    const first = git(dir, ['rev-parse', 'HEAD~1']).trim();
    const single = runnerCi(dir, [`--commit=${first}`], { BASE_REF: 'master', PR_HEAD: head });
    assert.equal(single.code, 1, single.out);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('squash verdict (d): PR-shape range whose whole-range diff itself fails exits 1', () => {
  const dir = newRepo();
  try {
    write(dir, 'docs/notes/base.md', '# base\n');
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '-m', 'master state']);
    git(dir, ['update-ref', 'refs/remotes/origin/master', 'HEAD']);
    write(dir, NOTE, `# aside\nan aside ${EM} never marked\n`);
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '-m', 'add the aside']);
    write(dir, 'docs/notes/other.md', '# other\n');
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '-m', 'unrelated']);
    const head = git(dir, ['rev-parse', 'HEAD']).trim();
    const r = runnerCi(dir, [], { BASE_REF: 'master', PR_HEAD: head });
    assert.equal(r.code, 1, r.out);
    const whole = r.out.split('=== Whole-range diff')[1];
    assert.match(whole, /FAIL {2}\[022\]/, 'the whole-range pass fails on its own');
    assert.ok(!SUPERSEDED.test(whole), 'the whole-range pass is never superseded');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('squash verdict: every registered rule declares a valid scope, and only the content scopes are squash-judged', async () => {
  const { rules, SCOPE, isSquashJudged } = await import('./manifest.mjs');
  const valid = new Set(Object.values(SCOPE));
  assert.ok(rules.length > 0);
  for (const r of rules) assert.ok(valid.has(r.scope), `rule ${r.id} declares a scope (got ${r.scope})`);
  assert.deepEqual(rules.filter((r) => r.scope === SCOPE.INTRODUCED_LINES).map((r) => r.id), ['012', '015', '017', '019', '022']);
  assert.equal(isSquashJudged({ scope: SCOPE.WHOLE_COMMIT }), false);
  assert.equal(isSquashJudged({ scope: SCOPE.INTRODUCED_LINES }), true);
  assert.equal(isSquashJudged({}), false, 'a rule with no scope keeps failing per commit');
});

// (b) needs a whole-commit rule, and none is registered today (every message-form rule was removed by GATE-1), so
// the rule is injected into runCiRange, which takes its rule list as a dependency; the commits, the diffs and the
// contexts are real.
test('squash verdict (b): a whole-commit rule failing on commit 1 of a PR-shape range exits 1; the same rule scoped as content is superseded', async () => {
  const { runCiRange } = await import('./runner.mjs');
  const { SCOPE } = await import('./manifest.mjs');
  const { _clearRepoRootCache } = await import('./lib/context.mjs');
  const { pass, fail } = await import('./lib/result.mjs');
  const dir = newRepo();
  const savedRoot = process.env.DISCIPLINE_REPO_ROOT;
  const savedLog = process.env.DISCIPLINE_FIRING_LOG;
  const savedOut = console.log;
  const savedErr = console.error;
  try {
    write(dir, 'docs/notes/base.md', '# base\n');
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '-m', 'master state']);
    git(dir, ['update-ref', 'refs/remotes/origin/master', 'HEAD']);
    const base = git(dir, ['rev-parse', 'HEAD']).trim();
    write(dir, 'docs/notes/one.md', '# one\n');
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '-m', 'bad: not in the house form']);
    write(dir, 'docs/notes/two.md', '# two\n');
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '-m', 'chore: fine']);
    const head = git(dir, ['rev-parse', 'HEAD']).trim();

    const formRule = (scope) => ({
      id: 'T01', name: 'Commit message form (test)', description: 'test', ruleSource: 'test', scope,
      trigger: () => true,
      check: (ctx) => (/^bad:/.test(String(ctx.commitSubject || '')) ? fail({ message: 'bad commit form', remediation: 'fix the subject' }) : pass()),
    });

    process.env.DISCIPLINE_REPO_ROOT = dir;
    process.env.DISCIPLINE_FIRING_LOG = 'off';
    _clearRepoRootCache();
    console.log = () => {};
    console.error = () => {};
    const range = `${base}..${head}`;
    const wholeCommit = runCiRange({ range, args: {}, squashMerged: true, ruleList: [formRule(SCOPE.WHOLE_COMMIT)] });
    const asContent = runCiRange({ range, args: {}, squashMerged: true, ruleList: [formRule(SCOPE.INTRODUCED_LINES)] });
    const notSquash = runCiRange({ range, args: {}, squashMerged: false, ruleList: [formRule(SCOPE.INTRODUCED_LINES)] });
    console.log = savedOut;
    console.error = savedErr;
    assert.equal(wholeCommit, 1, 'a whole-commit rule is judged per commit');
    assert.equal(asContent, 0, 'the same failure under a content scope is superseded in a squash-merged range');
    assert.equal(notSquash, 1, 'and is not superseded when the range is not a squash-merged pull request');
  } finally {
    console.log = savedOut;
    console.error = savedErr;
    if (savedRoot === undefined) delete process.env.DISCIPLINE_REPO_ROOT; else process.env.DISCIPLINE_REPO_ROOT = savedRoot;
    if (savedLog === undefined) delete process.env.DISCIPLINE_FIRING_LOG; else process.env.DISCIPLINE_FIRING_LOG = savedLog;
    _clearRepoRootCache();
    rmSync(dir, { recursive: true, force: true });
  }
});
