// Tests for rule 024 (WIP commit carries [skip ci], and only a WIP commit does).
// Run: node --test fsi-app/.discipline/rules/024-wip-commit-skips-ci.test.mjs
// Both directions plus the normal subject, at fixture level and through the real runner (commit-msg and CI).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { rule, hasSkipToken } from './024-wip-commit-skips-ci.mjs';
import { rules, SCOPE, isSquashJudged } from '../manifest.mjs';
import { buildContextFromFixture } from '../lib/context.mjs';

const RUNNER = resolve(import.meta.dirname, '..', 'runner.mjs');

function ctxFor(message) {
  return buildContextFromFixture({ message, files: [{ path: 'docs/a.md' }], addedLines: { 'docs/a.md': ['x'] } });
}
function verdict(message) {
  const ctx = ctxFor(message);
  return rule.trigger(ctx) ? rule.check(ctx) : { status: 'SKIP' };
}

test('024 direction 1: a WIP subject without a skip token FAILS, naming the fix', () => {
  const r = verdict('WIP cimin0: red tests');
  assert.equal(r.status, 'FAIL');
  assert.match(r.remediation, /\[skip ci\]/);
});

test('024 direction 1: a WIP subject whose token is only in the body FAILS (the subject is the contract)', () => {
  assert.equal(verdict('WIP cimin0: red tests\n\nbody [skip ci]').status, 'FAIL');
});

test('024 direction 2: a skip token on a subject that does not start with "WIP " FAILS', () => {
  const r = verdict('CI-MIN-0: enforce it [skip ci]');
  assert.equal(r.status, 'FAIL');
  assert.match(r.message, /silence/);
});

test('024 direction 2: a skip token in the BODY of a normal commit FAILS (GitHub honours it there too)', () => {
  assert.equal(verdict('CI-MIN-0: enforce it\n\nnote: [skip ci] here').status, 'FAIL');
});

test('024 direction 2: every GitHub-documented variant is a token; a lower-case "wip" or "WIP:" subject is not a WIP form', () => {
  for (const t of ['[ci skip]', '[no ci]', '[skip actions]', '[actions skip]', '[SKIP CI]']) {
    assert.equal(verdict(`feat: x ${t}`).status, 'FAIL', t);
  }
  assert.equal(verdict('feat: x\n\nskip-checks: true').status, 'FAIL');
  assert.equal(verdict('wip lane: step [skip ci]').status, 'FAIL');
  assert.equal(verdict('WIP: lane step [skip ci]').status, 'FAIL');
  assert.equal(verdict('WIPE the cache [skip ci]').status, 'FAIL');
});

test('024 normal: a WIP subject with the token, and a normal subject with none, PASS', () => {
  assert.equal(verdict('WIP cimin0: red tests [skip ci]').status, 'PASS');
  assert.equal(verdict('[CI-MIN-0] enforce it\n\nbody text').status, 'PASS');
  assert.equal(verdict('WIP lane: step [ci skip]').status, 'PASS');
  assert.equal(hasSkipToken('plain subject'), false);
});

test('024: a revert and a merge commit are not judged', () => {
  assert.equal(verdict('Revert "WIP x [skip ci]"').status, 'SKIP');
  const merge = buildContextFromFixture({ message: 'Merge branch x [skip ci]', files: [{ path: 'a.md' }], isMergeCommit: true });
  assert.equal(rule.trigger(merge), false);
});

test('024 is registered in the manifest with the whole-commit scope, which a squash merge does not re-judge', () => {
  const entry = rules.find((r) => r.id === '024');
  assert.ok(entry, 'rule 024 is in the manifest');
  assert.equal(entry.scope, SCOPE.WHOLE_COMMIT);
  assert.equal(isSquashJudged(entry), false);
});

function git(dir, args) { return execFileSync('git', args, { cwd: dir, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }); }
function newRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'rule024-'));
  git(dir, ['init', '-q']);
  git(dir, ['config', 'user.email', 't@example.com']);
  git(dir, ['config', 'user.name', 'T']);
  git(dir, ['config', 'commit.gpgsign', 'false']);
  git(dir, ['config', 'core.autocrlf', 'false']);
  writeFileSync(join(dir, 'README.md'), 'base\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'base']);
  return dir;
}
function engine(dir, args) {
  const r = spawnSync('node', [RUNNER, ...args], { cwd: dir, encoding: 'utf-8', env: { ...process.env, DISCIPLINE_FIRING_LOG: 'off' } });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
function commitMsgMode(dir, message) {
  writeFileSync(join(dir, 'note.md'), `${message.length}\n`);
  git(dir, ['add', '-A']);
  const file = join(dir, '.git', 'COMMIT_EDITMSG');
  writeFileSync(file, message);
  return engine(dir, ['--mode=commit-msg', `--message-file=${file}`]);
}

test('024 real git, commit-msg: both directions fail, the WIP form and the normal subject pass', () => {
  const dir = newRepo();
  try {
    const a = commitMsgMode(dir, 'WIP lane: step');
    assert.equal(a.code, 1, a.out);
    assert.match(a.out, /FAIL\s+\[024\]/);
    const b = commitMsgMode(dir, 'lane: step [skip ci]');
    assert.equal(b.code, 1, b.out);
    assert.match(b.out, /FAIL\s+\[024\]/);
    assert.equal(commitMsgMode(dir, 'WIP lane: step [skip ci]').code, 0);
    assert.equal(commitMsgMode(dir, 'lane: step').code, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('024 real git, CI mode over a pushed commit: a WIP commit with no token fails; with the token passes', () => {
  const dir = newRepo();
  try {
    writeFileSync(join(dir, 'a.md'), 'a\n');
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '-m', 'WIP lane: step']);
    const bad = engine(dir, ['--mode=ci', '--commit=HEAD']);
    assert.equal(bad.code, 1, bad.out);
    assert.match(bad.out, /FAIL\s+\[024\]/);
    writeFileSync(join(dir, 'b.md'), 'b\n');
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '-m', 'WIP lane: step [skip ci]']);
    const good = engine(dir, ['--mode=ci', '--commit=HEAD']);
    assert.equal(good.code, 0, good.out);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
