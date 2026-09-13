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

import { installHooks, buildTrampoline } from './install-hooks.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// D19 (lane L12, defect-fix-plan-2026-09-12.md, 2026-09-13): the installer now writes a TRAMPOLINE for
// each hook name, never a byte-for-byte copy of the tracked hook's own content -- every assertion below
// that used to compare the installed file against the tracked hook's own source text now compares against
// buildTrampoline(name) instead. SOURCE_HOOK_CONTENT (the tracked commit-msg hook's own text) is kept only
// for the one test that still needs it: proving the installer never writes the RAW hook content anymore.
const SOURCE_HOOK_PATH = join(__dirname, 'hooks', 'commit-msg');
const SOURCE_HOOK_CONTENT = readFileSync(SOURCE_HOOK_PATH, 'utf-8');
const COMMIT_MSG_TRAMPOLINE = buildTrampoline('commit-msg');
const PRE_PUSH_TRAMPOLINE = buildTrampoline('pre-push');

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

test('installHooks: creates commit-msg hook in target dir on first run, as a trampoline (not a copy)', () => {
  const dir = makeTempHooksDir();
  try {
    const report = installHooks({ hooksDir: dir, log: () => {} });
    const target = join(dir, 'commit-msg');
    assert.ok(existsSync(target), 'commit-msg should exist in target dir');
    const written = readFileSync(target, 'utf-8');
    assert.equal(written, COMMIT_MSG_TRAMPOLINE, 'written content must be the trampoline shape');
    assert.notEqual(written, SOURCE_HOOK_CONTENT, 'D19: the installer must never write the raw hook content anymore');
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
    assert.equal(written, COMMIT_MSG_TRAMPOLINE, 'target should now hold the trampoline');
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

test('installHooks: installs pre-push hook alongside commit-msg, as a trampoline that execs the tracked file', () => {
  const dir = makeTempHooksDir();
  try {
    const report = installHooks({ hooksDir: dir, log: () => {} });
    const prePush = report.find((r) => r.name === 'pre-push');
    assert.ok(prePush, 'pre-push hook should appear in install report');
    assert.equal(prePush.action, 'created');
    const targetPath = join(dir, 'pre-push');
    assert.ok(existsSync(targetPath), 'pre-push hook should be on disk after install');
    const content = readFileSync(targetPath, 'utf-8');
    assert.equal(content, PRE_PUSH_TRAMPOLINE, 'installed pre-push must be the trampoline, not the tracked hook itself');
    // D19: the raw discipline-engine content (CI-parity gate steps) must NOT be present in the installed
    // file anymore -- that content lives only in the tracked fsi-app/.discipline/hooks/pre-push, which the
    // trampoline execs at run time.
    assert.doesNotMatch(content, /CI-parity gate/);
    assert.doesNotMatch(content, /tsc --noEmit/);
    assert.match(content, /discipline trampoline/, 'installed content must be self-identifying as the trampoline');
    assert.match(content, /DISCIPLINE_HOOK_TRAMPOLINE/, 'trampoline must set the marker variable step 0 checks for');
    assert.match(content, /git rev-parse --show-toplevel/, 'trampoline must resolve the pushing worktree\'s own top level');
    assert.match(content, /exec sh "\$top\/fsi-app\/\.discipline\/hooks\/pre-push" "\$@"/, 'trampoline must exec the TRACKED hook with args/stdin passed through');
  } finally {
    cleanup(dir);
  }
});

// D19's own explicit test: a *.test.mjs file sitting in the hooks dir alongside a real hook name must
// never be installed -- the prior "copy every file" behaviour is what let L3's own
// pre-push-tmpdir.test.mjs get copied into .git/hooks/pre-push-tmpdir.test.mjs.
test("installHooks --dry-run: a source dir with pre-push plus a *.test.mjs file plans exactly one target, and its content is the trampoline shape", () => {
  const sourceDir = makeTempHooksDir();
  const targetDir = makeTempHooksDir();
  try {
    writeFileSync(join(sourceDir, 'pre-push'), '#!/bin/sh\necho real hook\n', 'utf-8');
    writeFileSync(join(sourceDir, 'pre-push-tmpdir.test.mjs'), 'import test from "node:test";\n', 'utf-8');
    const report = installHooks({ hooksDir: targetDir, sourceHooksDir: sourceDir, dryRun: true, log: () => {} });
    assert.equal(report.length, 1, `expected exactly one planned target, got: ${JSON.stringify(report)}`);
    assert.equal(report[0].name, 'pre-push');
    assert.equal(report[0].action, 'would-create');
    assert.equal(report[0].content, buildTrampoline('pre-push'), "the planned content must be the trampoline shape, not the source file's own content");
    assert.equal(readdirSync(targetDir).length, 0, 'dry-run must write nothing to disk');
  } finally {
    cleanup(sourceDir);
    cleanup(targetDir);
  }
});

test('buildTrampoline: shape is a POSIX sh script that resolves the worktree top and execs the named tracked hook, passing stdin/args through', () => {
  const content = buildTrampoline('pre-commit');
  assert.match(content, /^#!\/bin\/sh\n/);
  assert.match(content, /top=\$\(git rev-parse --show-toplevel\) \|\| exit 1/);
  assert.match(content, /export DISCIPLINE_HOOK_TRAMPOLINE/);
  assert.match(content, /exec sh "\$top\/fsi-app\/\.discipline\/hooks\/pre-commit" "\$@"/);
});

// task 0.3b fix round 1, 2026-09-11 ([CONFIRMED] by the coordinator with a throwaway repo): a hook
// invoked from a LINKED WORKTREE inherits GIT_DIR (and GIT_WORK_TREE / GIT_INDEX_FILE) in its
// environment, while the same hook invoked from the main checkout inherits none of them; with GIT_DIR
// exported, scripts/lib/assemble-train.test.mjs's fixture (`git init -q work` + `git remote add
// origin` in a fresh temp dir) ignores the temp dir and mutates the REAL repo instead, failing with
// "remote origin already exists" (reproduced on push from a linked worktree; the identical test passes
// 11/11 run directly). This assertion guards the one-line fix (`unset GIT_DIR GIT_WORK_TREE
// GIT_INDEX_FILE` before step 1) so it cannot be dropped silently in a future edit of the hook.
test('pre-push hook source: unsets GIT_DIR/GIT_WORK_TREE/GIT_INDEX_FILE before any step runs (linked-worktree hook-environment class fix)', () => {
  const prePushPath = join(__dirname, 'hooks', 'pre-push');
  const content = readFileSync(prePushPath, 'utf-8');
  assert.match(
    content,
    /^unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE$/m,
    'pre-push hook must unset GIT_DIR/GIT_WORK_TREE/GIT_INDEX_FILE before running any step, or a ' +
      'linked-worktree invocation inherits them and corrupts any git command a step runs against a ' +
      'fresh temp-dir repo (assemble-train.test.mjs\'s fixture is the confirmed instance)'
  );
  // The unset must precede every numbered step, not merely exist somewhere in the file.
  const unsetIndex = content.indexOf('unset GIT_DIR');
  const step1Index = content.indexOf('Step 1:');
  assert.ok(unsetIndex >= 0 && step1Index >= 0 && unsetIndex < step1Index, 'the unset must run before step 1');
});
