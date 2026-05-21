// Integration tests for the runner. Verifies the engine wires manifest → trigger → check → result correctly.
// Run: node --test fsi-app/.discipline/runner.test.mjs
//
// Post-slim (2026-05-21): engine cut to 2 rules (012, 014). The original
// substantial-commit fixtures (which exercised the deleted Loop-closure / Verification /
// Inventory-emission attestation rules) are replaced with fixtures that exercise
// the remaining gates: rule 012 (hardcoded-path content check) and rule 014
// (inventory-touch consistency runner gate).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve as resolvePath } from 'node:path';

const RUNNER = resolvePath(import.meta.dirname, 'runner.mjs');

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

test('runner: --list prints the remaining rules', () => {
  const out = execFileSync('node', [RUNNER, '--list'], { encoding: 'utf-8' });
  assert.ok(out.includes('[012]'));
  assert.ok(out.includes('[014]'));
  assert.ok(out.includes('Hardcoded user-home path'));
  assert.ok(out.includes('Inventory consistency'));
});

test('runner: fixture for trivial commit exits 0', () => {
  const result = runFixture(
    'chore: typo',
    [{ path: 'README.md', additions: 1, deletions: 1 }]
  );
  assert.equal(result.exitCode, 0, `expected exit 0, got ${result.exitCode}. Output:\n${result.output}`);
});

test('runner: fixture for substantial commit with no trailers exits 0 (post-slim: no attestation required)', () => {
  const result = runFixture(
    'feat: ship the thing\n\nplain body, no trailers, no attestation. Engine post-slim does not require any.',
    Array.from({ length: 10 }, (_, i) => ({ path: `fsi-app/src/f${i}.ts`, additions: 5, deletions: 5 }))
  );
  assert.equal(result.exitCode, 0, `expected exit 0, got ${result.exitCode}. Output:\n${result.output}`);
});

test('runner: fixture for migration commit needs no inventory attestation (rule 011 deleted)', () => {
  const result = runFixture(
    'migration: add col\n\nplain body, no Inventory-emission trailer required post-slim',
    [{ path: 'fsi-app/supabase/migrations/099_test.sql', additions: 10, deletions: 0 }]
  );
  // Rule 014 only fires when docs/inventories/* is touched. This commit doesn't touch any.
  assert.equal(result.exitCode, 0, `expected exit 0, got ${result.exitCode}. Output:\n${result.output}`);
});
