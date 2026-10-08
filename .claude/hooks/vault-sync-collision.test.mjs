// vault-sync never overwrites a gitignored local file an upstream commit adds as tracked (lane GATE-7,
// 2026-10-08, register attack A-V-7). Run: node --test .claude/hooks/vault-sync-collision.test.mjs
// Real throwaway repositories (a bare origin, a vault clone, a writer clone); git identity per command.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { syncVault, ignoredCollisions } from './vault-sync.mjs';

const ID = ['-c', 'user.name=vault-sync-test', '-c', 'user.email=vault-sync-test@example.invalid'];
const sh = (dir, args) => execFileSync('git', ['-C', dir, ...ID, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'vault-sync-coll-'));
  const origin = join(root, 'origin.git');
  const vault = join(root, 'vault');
  const writer = join(root, 'writer');
  execFileSync('git', ['init', '--bare', '-q', '-b', 'master', origin]);
  execFileSync('git', ['clone', '-q', origin, writer]);
  writeFileSync(join(writer, 'README.md'), 'one\n');
  writeFileSync(join(writer, '.gitignore'), 'local-notes.txt\n');
  sh(writer, ['add', '-A']);
  sh(writer, ['commit', '-q', '-m', 'one']);
  sh(writer, ['push', '-q', '-u', 'origin', 'master']);
  execFileSync('git', ['clone', '-q', origin, vault]);
  return { root, vault, writer };
}

test('A-V-7: a gitignored local file that origin adds as tracked stops the sync, names the path, and survives', () => {
  const f = fixture();
  const fired = [];
  try {
    writeFileSync(join(f.vault, 'local-notes.txt'), 'my private notes\n');
    assert.equal(sh(f.vault, ['status', '--porcelain']), '', 'the file is ignored, so the vault looks clean');
    writeFileSync(join(f.writer, 'local-notes.txt'), 'upstream tracked scratch\n');
    sh(f.writer, ['add', '-f', 'local-notes.txt']);
    sh(f.writer, ['commit', '-q', '-m', 'track the scratch file']);
    sh(f.writer, ['push', '-q']);

    sh(f.vault, ['fetch', '-q', 'origin']);
    assert.deepEqual(ignoredCollisions(f.vault), ['local-notes.txt']);
    const line = syncVault(f.vault, { logFiring: (e) => fired.push(e) });
    assert.match(line, /^vault-sync: SKIPPED \(the fast-forward would overwrite 1 gitignored local file/);
    assert.match(line, /local-notes\.txt/);
    assert.equal(readFileSync(join(f.vault, 'local-notes.txt'), 'utf8'), 'my private notes\n', 'local content untouched');
    assert.notEqual(sh(f.vault, ['rev-parse', 'HEAD']), sh(f.writer, ['rev-parse', 'HEAD']), 'no fast-forward happened');
    assert.equal(fired.length, 1);
    assert.equal(fired[0].rule, 'vault-sync:ignored-collision');

    // once the local file is moved away the same sync goes through
    rmSync(join(f.vault, 'local-notes.txt'));
    assert.match(syncVault(f.vault), /^vault-sync: [0-9a-f]+\.\.[0-9a-f]+/);
    assert.equal(readFileSync(join(f.vault, 'local-notes.txt'), 'utf8').replace(/\r\n/g, '\n'), 'upstream tracked scratch\n');
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('control: an upstream-added file with no local counterpart fast-forwards as before', () => {
  const f = fixture();
  try {
    writeFileSync(join(f.writer, 'new.md'), 'fresh\n');
    sh(f.writer, ['add', 'new.md']);
    sh(f.writer, ['commit', '-q', '-m', 'add new']);
    sh(f.writer, ['push', '-q']);
    assert.match(syncVault(f.vault), /^vault-sync: [0-9a-f]+\.\.[0-9a-f]+/);
    assert.equal(readFileSync(join(f.vault, 'new.md'), 'utf8').replace(/\r\n/g, '\n'), 'fresh\n');
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});
