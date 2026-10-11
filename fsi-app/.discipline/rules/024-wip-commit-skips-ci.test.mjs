// Tests for rule 024 (WIP commit carries [skip ci], and only a WIP commit does).
// Run: node --test fsi-app/.discipline/rules/024-wip-commit-skips-ci.test.mjs
// Both directions plus the normal subject, at fixture level and through the real runner (commit-msg and CI).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { rule, hasSkipToken, RULE_024_LANDED } from './024-wip-commit-skips-ci.mjs';
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

// Cutoff (lane CI-MIN-0b): the rule judges only commits made at or after RULE_024_LANDED.
function dated(message, commitDate) {
  const ctx = ctxFor(message);
  ctx.commitDate = commitDate;
  return rule.trigger(ctx) ? rule.check(ctx) : { status: 'SKIP' };
}

test('024 cutoff: the landing instant is the merge time of PR 1102', () => {
  assert.equal(RULE_024_LANDED, '2026-10-11T02:52:00Z');
});

test('024 cutoff, fixture: a WIP commit without the token dated before the cutoff is SKIPPED; after it, FAILS', () => {
  const before = dated('WIP cifix2: step', '2026-10-10T12:00:00Z');
  assert.equal(before.status, 'SKIP');
  assert.match(before.reason, /predates the rule/);
  assert.equal(dated('WIP cifix2: step', '2026-10-12T12:00:00Z').status, 'FAIL');
  assert.equal(dated('WIP cifix2: step', RULE_024_LANDED).status, 'FAIL');
});

test('024 cutoff, fixture: a normal commit passes on either side; a token on a non-WIP commit before the cutoff is skipped, after it fails', () => {
  assert.equal(dated('lane: step', '2026-10-10T12:00:00Z').status, 'SKIP');
  assert.equal(dated('lane: step', '2026-10-12T12:00:00Z').status, 'PASS');
  assert.equal(dated('lane: step [skip ci]', '2026-10-10T12:00:00Z').status, 'SKIP');
  assert.equal(dated('lane: step [skip ci]', '2026-10-12T12:00:00Z').status, 'FAIL');
});

test('024 cutoff, fixture: an unparseable date is judged, never skipped', () => {
  assert.equal(dated('WIP cifix2: step', 'not a date').status, 'FAIL');
});

function commitAt(dir, file, message, isoDate) {
  writeFileSync(join(dir, file), `${message}\n`);
  git(dir, ['add', '-A']);
  const r = spawnSync('git', ['commit', '-q', '-m', message], {
    cwd: dir, encoding: 'utf-8',
    env: { ...process.env, GIT_AUTHOR_DATE: isoDate, GIT_COMMITTER_DATE: isoDate },
  });
  assert.equal(r.status, 0, r.stderr);
}

test('024 cutoff, real git CI mode: the same WIP commit is skipped dated 2026-10-10 and fails dated 2026-10-12; a normal commit passes either side', () => {
  const dir = newRepo();
  try {
    commitAt(dir, 'a.md', 'WIP lane: old', '2026-10-10T12:00:00Z');
    const old = engine(dir, ['--mode=ci', '--commit=HEAD', '--verbose']);
    assert.equal(old.code, 0, old.out);
    assert.match(old.out, /024 skip: commit predates the rule/);
    assert.doesNotMatch(old.out, /FAIL\s+\[024\]/);
    commitAt(dir, 'b.md', 'WIP lane: new', '2026-10-12T12:00:00Z');
    const fresh = engine(dir, ['--mode=ci', '--commit=HEAD']);
    assert.equal(fresh.code, 1, fresh.out);
    assert.match(fresh.out, /FAIL\s+\[024\]/);
    commitAt(dir, 'c.md', 'lane: normal after', '2026-10-12T13:00:00Z');
    assert.equal(engine(dir, ['--mode=ci', '--commit=HEAD']).code, 0);
    commitAt(dir, 'd.md', 'lane: normal before', '2026-10-09T13:00:00Z');
    assert.equal(engine(dir, ['--mode=ci', '--commit=HEAD']).code, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('024 cutoff, real git commit-msg mode: WIP-without-token fails regardless of date (a proposed commit is always judged)', () => {
  const dir = newRepo();
  try {
    writeFileSync(join(dir, 'note.md'), 'x\n');
    git(dir, ['add', '-A']);
    const file = join(dir, '.git', 'COMMIT_EDITMSG');
    writeFileSync(file, 'WIP lane: step');
    const r = spawnSync('node', [RUNNER, '--mode=commit-msg', `--message-file=${file}`], {
      cwd: dir, encoding: 'utf-8',
      env: { ...process.env, DISCIPLINE_FIRING_LOG: 'off', GIT_COMMITTER_DATE: '2026-10-10T12:00:00Z', GIT_AUTHOR_DATE: '2026-10-10T12:00:00Z' },
    });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout + r.stderr, /FAIL\s+\[024\]/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
