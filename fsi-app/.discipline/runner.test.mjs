// Integration tests for the runner. Verifies the engine wires manifest → trigger → check → result correctly.
// Run: node --test fsi-app/.discipline/runner.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const RUNNER = 'C:/Users/jason/dotfiles/fsi-app/.discipline/runner.mjs';

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

test('runner: --list prints both rules', () => {
  const out = execFileSync('node', [RUNNER, '--list'], { encoding: 'utf-8' });
  assert.ok(out.includes('[008]'));
  assert.ok(out.includes('[011]'));
  assert.ok(out.includes('Dispatch-artifact commit-summary'));
  assert.ok(out.includes('Inventory-artifact emission'));
});

test('runner: fixture for trivial commit exits 0', () => {
  const result = runFixture(
    'fix: typo',
    [{ path: 'README.md', additions: 1, deletions: 1 }]
  );
  assert.equal(result.exitCode, 0);
});

test('runner: fixture for substantial commit missing both lines exits 1', () => {
  const result = runFixture(
    'feat: ship the thing\n\nbody paragraph without closure or inventory line.',
    Array.from({ length: 10 }, (_, i) => ({ path: `fsi-app/src/f${i}.ts`, additions: 5, deletions: 5 }))
  );
  // Fixture mode: context.branch defaults to 'master' in buildContextFromFixture
  assert.equal(result.exitCode, 1);
  assert.ok(result.output.includes('[008]'));
  assert.ok(result.output.includes('[011]'));
});

test('runner: fixture for substantial commit with both lines exits 0', () => {
  const result = runFixture(
    [
      'feat: ship the thing',
      '',
      'body paragraph.',
      '',
      'Loop-closure: OBS-1 COVER; DP-1 PASS',
      'Inventory-emission: no inventory surfaces touched',
    ].join('\n'),
    Array.from({ length: 10 }, (_, i) => ({ path: `fsi-app/src/f${i}.ts`, additions: 5, deletions: 5 }))
  );
  assert.equal(result.exitCode, 0, `expected exit 0, got ${result.exitCode}. Output:\n${result.output}`);
});

test('runner: fixture for substantial commit with Loop-closure but missing Inventory-emission exits 1', () => {
  const result = runFixture(
    'feat: ship\n\nLoop-closure: OBS-1 COVER',
    Array.from({ length: 10 }, (_, i) => ({ path: `fsi-app/src/f${i}.ts`, additions: 5, deletions: 5 }))
  );
  assert.equal(result.exitCode, 1);
  assert.ok(result.output.includes('[011]'));
  assert.ok(!result.output.includes('FAIL  [008]'));
});

test('runner: fixture for migration commit needs migrations.md coverage', () => {
  // Has both closure lines but inventory line points to wrong surface
  const result = runFixture(
    'migration: add col\n\nLoop-closure: OBS-1 COVER\nInventory-emission: docs/inventories/routes.md no changes',
    [{ path: 'fsi-app/supabase/migrations/099.sql', additions: 10, deletions: 0 }]
  );
  assert.equal(result.exitCode, 1);
  assert.ok(result.output.includes('[011]'));
  assert.ok(result.output.includes('migrations'));
});
