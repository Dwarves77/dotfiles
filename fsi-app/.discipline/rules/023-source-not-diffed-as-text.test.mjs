// Tests for rule 023 (source file not diffed as text).
// Run: node --test fsi-app/.discipline/rules/023-source-not-diffed-as-text.test.mjs
// Attacks from the AUD-AT-3 register: A012-8 / A015-12 / A017-9 / A019-7 (binary or -diff attribute), A012-9 /
// A022-7 (a NUL byte), A022-8 (UTF-16), A-CI-binary / A-CI-022 (the same in CI mode).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { rule } from './023-source-not-diffed-as-text.mjs';
import { buildContextFromFixture } from '../lib/context.mjs';

const RUNNER = resolve(import.meta.dirname, '..', 'runner.mjs');
const EM = String.fromCharCode(0x2014);
const NUL = String.fromCharCode(0);

function fixtureCtx(path, extra = {}) {
  return buildContextFromFixture({ message: 'x', files: [{ path }], changes: [{ path, ...extra }] });
}

test('023 trigger and check: a source file git did not diff as text FAILS, naming the path', () => {
  const ctx = fixtureCtx('fsi-app/scripts/a.mjs', { binary: true, status: 'A' });
  assert.equal(rule.trigger(ctx), true);
  const r = rule.check(ctx);
  assert.equal(r.status, 'FAIL');
  assert.deepEqual(r.locations, [{ path: 'fsi-app/scripts/a.mjs', line: 1 }]);
  assert.ok(r.remediation.includes('.gitattributes'));
});

test('023: a text source file, a binary asset and a revert pass or skip; every source extension triggers', () => {
  assert.equal(rule.trigger(fixtureCtx('fsi-app/scripts/a.mjs', { added: ['x'] })), false);
  assert.equal(rule.check(fixtureCtx('fsi-app/scripts/a.mjs', { added: ['x'] })).status, 'PASS');
  assert.equal(rule.trigger(fixtureCtx('public/logo.png', { binary: true, status: 'A' })), false);
  const reverted = buildContextFromFixture({ message: 'Revert "x"', files: [{ path: 'a.md' }], changes: [{ path: 'a.md', binary: true }] });
  assert.equal(rule.trigger(reverted), false);
  for (const p of ['docs/notes/a.md', 'fsi-app/src/a.tsx', 'fsi-app/supabase/migrations/001.sql', 'a.yml']) {
    assert.equal(rule.trigger(fixtureCtx(p, { binary: true })), true, p);
  }
});

function git(dir, args) { return execFileSync('git', args, { cwd: dir, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }); }
function newRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'rule023-'));
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
function stage(dir, rel, content) {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  writeFileSync(join(dir, rel), content);
  git(dir, ['add', '-A']);
}
function commitMsg(dir) {
  const msg = join(dir, '.git', 'COMMIT_EDITMSG');
  writeFileSync(msg, 'chore: x');
  return engine(dir, ['--mode=commit-msg', `--message-file=${msg}`]);
}

test('023 real git, commit-msg: a NUL byte hides an em dash from rule 022; rule 023 refuses the file (A022-7, A012-9)', () => {
  const dir = newRepo();
  try {
    stage(dir, 'docs/notes/a.md', `text ${EM} dash${NUL}more\n`);
    const r = commitMsg(dir);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /FAIL\s+\[023\]/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('023 real git, commit-msg: a UTF-16LE file with a BOM is refused (A022-8)', () => {
  const dir = newRepo();
  try {
    stage(dir, 'docs/notes/b.md', Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(`text ${EM} dash\n`, 'utf16le')]));
    const r = commitMsg(dir);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /FAIL\s+\[023\]/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('023 real git, commit-msg: a .gitattributes -diff mark on a source path is refused (A012-8, A015-12, A017-9, A019-7)', () => {
  const dir = newRepo();
  try {
    writeFileSync(join(dir, '.gitattributes'), 'fsi-app/scripts/hidden.mjs -diff\n');
    stage(dir, 'fsi-app/scripts/hidden.mjs', 'const a = 1;\n');
    const r = commitMsg(dir);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /FAIL\s+\[023\]/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('023 real git, CI mode over the pushed commit: the same NUL-byte file is refused (A-CI-022, A-CI-binary)', () => {
  const dir = newRepo();
  try {
    stage(dir, 'docs/notes/a.md', `text ${EM} dash${NUL}more\n`);
    git(dir, ['commit', '-q', '-m', 'add']);
    const r = engine(dir, ['--mode=ci', '--commit=HEAD']);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /FAIL\s+\[023\]/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('023 real git: an ordinary text source file passes', () => {
  const dir = newRepo();
  try {
    stage(dir, 'fsi-app/scripts/ok.mjs', 'const a = 1;\n');
    const r = commitMsg(dir);
    assert.equal(r.code, 0, r.out);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
