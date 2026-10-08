// vault-sync tests: the pure decision table, and the real thing against throwaway repositories
// (a bare origin, a vault clone, a writer clone, one worktree). Git identity is passed per
// command with -c so no fixture ever writes user.name/email into any config (the 2026-09-11
// identity-leak class). Run by fsi-app/.discipline/run-test-suite.sh.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { decide, locateVault, syncVault, parsePorcelainZ, partitionByContent, disciplineFilesChanged } from './vault-sync.mjs';

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

// ---- 2026-09-18: git reports byte-identical files as modified; the hook locked itself out -------------
// The cause of git's phantom report is not established, so no fixture can honestly reproduce one. These tests
// pin what THIS code decides: by content ids, conservatively, and never from a trimmed porcelain line.

test('parsePorcelainZ: a leading-space first entry keeps its status and its whole path', () => {
  const out = ' M docs/a b.md\0 M docs/c.md\0';
  assert.deepEqual(parsePorcelainZ(out), [
    { status: ' M', path: 'docs/a b.md' },
    { status: ' M', path: 'docs/c.md' },
  ]);
  assert.deepEqual(parsePorcelainZ(''), []);
  assert.deepEqual(parsePorcelainZ(null), []);
});

test('parsePorcelainZ: a rename consumes its origin token and keeps the R status', () => {
  const out = 'R  new.md\0old.md\0 M other.md\0';
  assert.deepEqual(parsePorcelainZ(out), [
    { status: 'R ', path: 'new.md' },
    { status: ' M', path: 'other.md' },
  ]);
});

test('partitionByContent: only a plain worktree modification with two known, equal ids is a phantom', () => {
  const A = 'a'.repeat(40);
  const B = 'b'.repeat(40);
  const r = partitionByContent([
    { status: ' M', path: 'phantom.md', indexId: A, workingId: A },
    { status: ' M', path: 'edited.md', indexId: A, workingId: B },
    { status: 'M ', path: 'staged-same-ids.md', indexId: A, workingId: A },
    { status: ' M', path: 'no-working-id.md', indexId: A, workingId: null },
    { status: ' M', path: 'no-index-id.md', indexId: null, workingId: A },
    { status: 'R ', path: 'renamed.md', indexId: A, workingId: A },
    { status: ' D', path: 'deleted.md', indexId: A, workingId: null },
  ]);
  assert.deepEqual(r.phantom, ['phantom.md']);
  assert.deepEqual(r.real, ['edited.md', 'staged-same-ids.md', 'no-working-id.md', 'no-index-id.md', 'renamed.md', 'deleted.md']);
});

test('reportedModified: against real git, the FIRST entry reads as " M" with its exact path (the trim bug)', async () => {
  const { reportedModified } = await import('./vault-sync.mjs');
  const f = fixture();
  try {
    writeFileSync(join(f.vault, 'README.md'), 'a real local edit\n');
    const got = reportedModified(f.vault);
    assert.equal(got.length, 1);
    assert.equal(got[0].status, ' M', 'a trimmed porcelain line reads this as "M " (staged)');
    assert.equal(got[0].path, 'README.md', 'a trimmed porcelain line cuts the first character of the path');
    assert.match(got[0].indexId, /^[0-9a-f]{40}$/);
    assert.match(got[0].workingId, /^[0-9a-f]{40}$/);
    assert.notEqual(got[0].indexId, got[0].workingId, 'a real edit stores a different blob');
    assert.deepEqual(partitionByContent(got), { phantom: [], real: ['README.md'] });
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('syncVault: a file git reports as modified but identical by content does not block the sync', () => {
  const f = fixture();
  try {
    writeFileSync(join(f.writer, 'README.md'), 'two\n');
    sh(f.writer, ['commit', '-q', '-am', 'two']);
    sh(f.writer, ['push', '-q']);
    const id = sh(f.vault, ['hash-object', '--', 'README.md']);
    const phantom = () => [{ status: ' M', path: 'README.md', indexId: id, workingId: id }];
    const line = syncVault(f.vault, { reportedModified: phantom });
    assert.match(line, /^vault-sync: [0-9a-f]+\.\.[0-9a-f]+ /, 'the sync must proceed');
    assert.match(line, /1 phantom-modified file\(s\) restored, identical to HEAD by content/);
    assert.equal(sh(f.vault, ['rev-parse', 'HEAD']), sh(f.writer, ['rev-parse', 'HEAD']));
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('syncVault: the SAME reported path with different ids is a real edit and still blocks (the inverse)', () => {
  const f = fixture();
  try {
    writeFileSync(join(f.writer, 'README.md'), 'two\n');
    sh(f.writer, ['commit', '-q', '-am', 'two']);
    sh(f.writer, ['push', '-q']);
    const before = sh(f.vault, ['rev-parse', 'HEAD']);
    const edited = () => [{ status: ' M', path: 'README.md', indexId: 'a'.repeat(40), workingId: 'b'.repeat(40) }];
    const line = syncVault(f.vault, { reportedModified: edited });
    assert.match(line, /^vault-sync: SKIPPED \(1 tracked file\(s\) modified/);
    assert.equal(sh(f.vault, ['rev-parse', 'HEAD']), before, 'a real edit must leave the vault where it was');
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

// ---- WIRE-1 (2026-10-08): a fast-forward that changed fsi-app/.discipline/ re-runs the idempotent installer ----
// The installed gate shim, matcher and git hook trampolines then follow master with no human step. The installer
// is a seam in the pure tests (it touches git hooks and the user home); one test runs a real fixture script.

function pushFile(f, rel, text, msg) {
  const abs = join(f.writer, rel);
  mkdirSync(join(abs, '..'), { recursive: true });
  writeFileSync(abs, text);
  sh(f.writer, ['add', rel]);
  sh(f.writer, ['commit', '-q', '-m', msg]);
  sh(f.writer, ['push', '-q']);
}

test('WIRE-1 syncVault: a fast-forward that changed a file under fsi-app/.discipline/ runs the installer from the vault and prints its summary', () => {
  const f = fixture();
  try {
    pushFile(f, 'fsi-app/.discipline/governance/pretooluse-entry.mjs', '// v2\n', 'change the gate');
    const calls = [];
    const line = syncVault(f.vault, { runInstaller: (vault) => { calls.push(vault); return { ok: true, summary: 'Summary: 1 unchanged; gate wiring: nothing to write' }; } });
    assert.equal(calls.length, 1);
    assert.equal(norm(calls[0]), norm(f.vault), 'run from the vault (main) checkout');
    const lines = line.split('\n');
    assert.match(lines[0], /^vault-sync: [0-9a-f]+\.\.[0-9a-f]+ /);
    assert.match(lines[1], /^vault-sync: 1 file\(s\) under fsi-app\/\.discipline\/ changed; installer ran: Summary: 1 unchanged; gate wiring: nothing to write$/);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('WIRE-1 syncVault: no change under fsi-app/.discipline/ means no installer run', () => {
  const f = fixture();
  try {
    pushFile(f, 'docs/note.md', 'a\n', 'docs only');
    pushFile(f, 'fsi-app/src/x.mjs', '// not the gate\n', 'app code');
    let ran = false;
    const line = syncVault(f.vault, { runInstaller: () => { ran = true; return { ok: true, summary: '' }; } });
    assert.equal(ran, false);
    assert.equal(line.includes('\n'), false);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('WIRE-1 syncVault: a SKIPPED sync and an up-to-date vault never run the installer', () => {
  const f = fixture();
  try {
    pushFile(f, 'fsi-app/.discipline/hooks/pre-push', '# v2\n', 'change a hook');
    writeFileSync(join(f.vault, 'README.md'), 'local edit\n');
    let ran = 0;
    const deps = { runInstaller: () => { ran++; return { ok: true, summary: '' }; } };
    assert.match(syncVault(f.vault, deps), /^vault-sync: SKIPPED/);
    sh(f.vault, ['checkout', '--', 'README.md']);
    assert.match(syncVault(f.vault, deps), /installer ran/);
    assert.equal(ran, 1);
    assert.match(syncVault(f.vault, deps), /^vault-sync: up to date/);
    assert.equal(ran, 1, 'already at origin/master: no change, no run');
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('WIRE-1 syncVault: an installer failure is reported on the second line and never throws', () => {
  const f = fixture();
  try {
    pushFile(f, 'fsi-app/.discipline/lib/x.mjs', '// v2\n', 'change lib');
    const line = syncVault(f.vault, { runInstaller: () => ({ ok: false, summary: 'boom' }) });
    assert.match(line.split('\n')[1], /installer FAILED: boom$/);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('WIRE-1 syncVault: the default runner executes the vault\'s own install-hooks.mjs and reports its Summary line', () => {
  const f = fixture();
  try {
    pushFile(f, 'fsi-app/.discipline/install-hooks.mjs', "console.log('noise');\nconsole.log('  Summary: 2 created');\nconsole.log('  gate wiring: skip, settings.json is not present');\n", 'add the installer');
    const line = syncVault(f.vault);
    assert.match(line.split('\n')[1], /installer ran: Summary: 2 created; gate wiring: skip, settings\.json is not present$/);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('WIRE-1 syncVault: the default runner reports a missing installer as a failure, and a failing one with its first stderr line', () => {
  const f = fixture();
  try {
    pushFile(f, 'fsi-app/.discipline/lib/y.mjs', '// v2\n', 'change lib');
    assert.match(syncVault(f.vault).split('\n')[1], /installer FAILED: fsi-app\/\.discipline\/install-hooks\.mjs is missing$/);
    pushFile(f, 'fsi-app/.discipline/install-hooks.mjs', "console.error('cannot install');\nprocess.exit(2);\n", 'broken installer');
    assert.match(syncVault(f.vault).split('\n')[1], /installer FAILED: cannot install$/);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('disciplineFilesChanged: only paths under fsi-app/.discipline/, empty for equal or missing shas', () => {
  const f = fixture();
  try {
    const a = sh(f.writer, ['rev-parse', 'HEAD']);
    pushFile(f, 'docs/a.md', 'a\n', 'a');
    pushFile(f, 'fsi-app/.discipline/rules/r.mjs', '// r\n', 'rule');
    const b = sh(f.writer, ['rev-parse', 'HEAD']);
    sh(f.vault, ['fetch', '-q', 'origin']);
    assert.deepEqual(disciplineFilesChanged(f.vault, a, b), ['fsi-app/.discipline/rules/r.mjs']);
    assert.deepEqual(disciplineFilesChanged(f.vault, b, b), []);
    assert.deepEqual(disciplineFilesChanged(f.vault, null, b), []);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});
