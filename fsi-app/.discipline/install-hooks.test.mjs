// Unit tests for install-hooks.mjs.
// Sprint Foundation Wave 3 (Agent D), 2026-05-20.
//
// Strategy:
//   - Import the exported installHooks() function with a synthetic --hooks-dir
//     pointing at a temp directory, so tests never touch .git/hooks.
//   - Verify: creates hook, idempotent re-run, backup on divergence, --force
//     overwrite, --dry-run is read-only.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { installHooks } from './install-hooks.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_HOOK_PATH = join(__dirname, 'hooks', 'commit-msg');
const SOURCE_HOOK_CONTENT = readFileSync(SOURCE_HOOK_PATH, 'utf-8');

function makeTempHooksDir() {
  return mkdtempSync(join(tmpdir(), 'discipline-hooks-test-'));
}

function cleanup(dir) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // best-effort
  }
}

test('installHooks: creates commit-msg hook in target dir on first run', () => {
  const dir = makeTempHooksDir();
  try {
    const report = installHooks({ hooksDir: dir, log: () => {} });
    const target = join(dir, 'commit-msg');
    assert.ok(existsSync(target), 'commit-msg should exist in target dir');
    const written = readFileSync(target, 'utf-8');
    assert.equal(written, SOURCE_HOOK_CONTENT, 'written content must match source byte-for-byte');
    const commitMsg = report.find((r) => r.name === 'commit-msg');
    assert.ok(commitMsg, 'report should include commit-msg entry');
    assert.equal(commitMsg.action, 'created');
  } finally {
    cleanup(dir);
  }
});

test('installHooks: idempotent re-run reports unchanged and creates no backup', () => {
  const dir = makeTempHooksDir();
  try {
    installHooks({ hooksDir: dir, log: () => {} });
    const before = readdirSync(dir);
    const report = installHooks({ hooksDir: dir, log: () => {} });
    const after = readdirSync(dir);
    assert.deepEqual(after.sort(), before.sort(), 'no new files should appear');
    const commitMsg = report.find((r) => r.name === 'commit-msg');
    assert.equal(commitMsg.action, 'unchanged');
    const backups = after.filter((f) => f.includes('.backup-'));
    assert.equal(backups.length, 0, 'no backups should be created on idempotent re-run');
  } finally {
    cleanup(dir);
  }
});

test('installHooks: backs up existing divergent hook and writes new one', () => {
  const dir = makeTempHooksDir();
  try {
    const target = join(dir, 'commit-msg');
    const stale = '#!/bin/sh\n# stale hook from before discipline engine\nexit 0\n';
    writeFileSync(target, stale, 'utf-8');
    const report = installHooks({ hooksDir: dir, log: () => {} });
    const written = readFileSync(target, 'utf-8');
    assert.equal(written, SOURCE_HOOK_CONTENT, 'target should now hold discipline hook');
    const commitMsg = report.find((r) => r.name === 'commit-msg');
    assert.equal(commitMsg.action, 'replaced-with-backup');
    assert.ok(commitMsg.backupPath, 'a backup path should be reported');
    assert.ok(existsSync(commitMsg.backupPath), 'backup file should exist on disk');
    const backupContent = readFileSync(commitMsg.backupPath, 'utf-8');
    assert.equal(backupContent, stale, 'backup should contain prior contents');
  } finally {
    cleanup(dir);
  }
});

test('installHooks: --force overwrites without backup', () => {
  const dir = makeTempHooksDir();
  try {
    const target = join(dir, 'commit-msg');
    writeFileSync(target, '#!/bin/sh\nexit 0\n', 'utf-8');
    const report = installHooks({ hooksDir: dir, force: true, log: () => {} });
    const commitMsg = report.find((r) => r.name === 'commit-msg');
    assert.equal(commitMsg.action, 'replaced');
    assert.equal(commitMsg.backupPath, null, 'no backup when forced');
    const backups = readdirSync(dir).filter((f) => f.includes('.backup-'));
    assert.equal(backups.length, 0);
  } finally {
    cleanup(dir);
  }
});

test('installHooks: --dry-run writes nothing', () => {
  const dir = makeTempHooksDir();
  try {
    const report = installHooks({ hooksDir: dir, dryRun: true, log: () => {} });
    const files = readdirSync(dir);
    assert.equal(files.length, 0, 'dry run should not create any files');
    const commitMsg = report.find((r) => r.name === 'commit-msg');
    assert.equal(commitMsg.action, 'would-create');
  } finally {
    cleanup(dir);
  }
});

test('installHooks: creates target directory if missing', () => {
  const parent = makeTempHooksDir();
  const dir = join(parent, 'nested', 'hooks');
  try {
    installHooks({ hooksDir: dir, log: () => {} });
    assert.ok(existsSync(join(dir, 'commit-msg')));
  } finally {
    cleanup(parent);
  }
});
