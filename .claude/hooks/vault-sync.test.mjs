// vault-sync tests: the pure decision table, and the real thing against throwaway repositories
// (a bare origin, a vault clone, a writer clone, one worktree). Git identity is passed per
// command with -c so no fixture ever writes user.name/email into any config (the 2026-09-11
// identity-leak class). Run by fsi-app/.discipline/run-test-suite.sh.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { decide, locateVault, syncVault } from './vault-sync.mjs';

const ID = ['-c', 'user.name=vault-sync-test', '-c', 'user.email=vault-sync-test@example.invalid'];
const sh = (dir, args) =>
  execFileSync('git', ['-C', dir, ...ID, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const norm = (p) => realpathSync(p).replace(/\\/g, '/').toLowerCase();

test('decide: the guard order is bare, fetch, branch, dirty, ahead, then behind', () => {
  const ok = { bare: false, branch: 'master', dirty: 0, ahead: 0, behind: 3, fetched: true };
  assert.equal(decide({ ...ok, bare: true }).action, 'skip');
  assert.match(decide({ ...ok, bare: true }).reason, /core\.bare/);
  assert.equal(decide({ ...ok, fetched: false }).action, 'skip');
  assert.equal(decide({ ...ok, branch: 'lane/x' }).action, 'skip');
  assert.equal(decide({ ...ok, branch: 'HEAD' }).action, 'skip');
  assert.equal(decide({ ...ok, dirty: 2 }).action, 'skip');
  assert.equal(decide({ ...ok, ahead: 1 }).action, 'skip');
  assert.equal(decide({ ...ok, behind: 0 }).action, 'noop');
  assert.deepEqual(decide(ok), { action: 'ff', reason: '3 commit(s) behind origin/master' });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'vault-sync-'));
  const origin = join(root, 'origin.git');
  const vault = join(root, 'vault');
  const writer = join(root, 'writer');
  execFileSync('git', ['init', '--bare', '-q', '-b', 'master', origin]);
  execFileSync('git', ['clone', '-q', origin, writer]);
  writeFileSync(join(writer, 'README.md'), 'one\n');
  sh(writer, ['add', 'README.md']);
  sh(writer, ['commit', '-q', '-m', 'one']);
  sh(writer, ['push', '-q', '-u', 'origin', 'master']);
  execFileSync('git', ['clone', '-q', origin, vault]);
  return { root, origin, vault, writer };
}

test('syncVault: a clean master vault fast-forwards to what the writer pushed', () => {
  const f = fixture();
  try {
    writeFileSync(join(f.writer, 'README.md'), 'two\n');
    sh(f.writer, ['commit', '-q', '-am', 'two']);
    sh(f.writer, ['push', '-q']);
    const line = syncVault(f.vault);
    assert.match(line, /^vault-sync: [0-9a-f]+\.\.[0-9a-f]+ \(1 commit\(s\) behind origin\/master\)/);
    assert.equal(sh(f.vault, ['rev-parse', 'HEAD']), sh(f.writer, ['rev-parse', 'HEAD']));
    assert.match(syncVault(f.vault), /^vault-sync: up to date/);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('syncVault: a modified tracked file blocks the sync and is left untouched; untracked files never count', () => {
  const f = fixture();
  try {
    writeFileSync(join(f.writer, 'README.md'), 'two\n');
    sh(f.writer, ['commit', '-q', '-am', 'two']);
    sh(f.writer, ['push', '-q']);
    writeFileSync(join(f.vault, 'README.md'), 'local edit\n');
    writeFileSync(join(f.vault, 'scratch.bin'), 'untracked\n');
    const line = syncVault(f.vault);
    assert.match(line, /^vault-sync: SKIPPED \(1 tracked file\(s\) modified/);
    assert.equal(sh(f.vault, ['rev-parse', 'HEAD']), sh(f.vault, ['rev-parse', 'HEAD~0']));
    assert.notEqual(sh(f.vault, ['rev-parse', 'HEAD']), sh(f.writer, ['rev-parse', 'HEAD']));
    sh(f.vault, ['checkout', '--', 'README.md']);
    assert.match(syncVault(f.vault), /^vault-sync: [0-9a-f]+\.\.[0-9a-f]+/);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('syncVault: a vault marked bare or sitting on a branch is skipped with the fix named', () => {
  const f = fixture();
  try {
    sh(f.vault, ['checkout', '-q', '-b', 'lane/other']);
    assert.match(syncVault(f.vault), /SKIPPED \(vault is on lane\/other, not master/);
    sh(f.vault, ['checkout', '-q', 'master']);
    sh(f.vault, ['config', 'core.bare', 'true']);
    assert.match(syncVault(f.vault), /SKIPPED \(core\.bare=true/);
    sh(f.vault, ['config', 'core.bare', 'false']);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('locateVault: a worktree resolves to the checkout that owns the shared .git', () => {
  const f = fixture();
  try {
    const wt = join(f.root, 'wt-a');
    sh(f.vault, ['worktree', 'add', '-q', '-b', 'lane/a', wt]);
    assert.equal(norm(locateVault(wt)), norm(f.vault));
    assert.equal(norm(locateVault(f.vault)), norm(f.vault));
    sh(f.vault, ['worktree', 'remove', '--force', wt]);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});
