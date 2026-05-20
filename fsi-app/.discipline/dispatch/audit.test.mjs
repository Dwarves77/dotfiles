import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const AUDIT = resolve(import.meta.dirname, 'audit.mjs');

test('audit: --list-recent runs without error', () => {
  // May find 0 or N dispatches depending on git history; just verify it runs cleanly.
  const out = execFileSync('node', [AUDIT, '--list-recent', '--days=1'], { encoding: 'utf-8' });
  assert.ok(typeof out === 'string');
});

test('audit: looking up a non-existent UUID returns exit 1 and explains', () => {
  try {
    execFileSync('node', [AUDIT, '2026-01-01-deadbeef-nonexistent-dispatch'], {
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    assert.fail('expected non-zero exit');
  } catch (err) {
    assert.equal(err.status, 1);
    assert.match(err.stdout + err.stderr, /No commits found/);
  }
});

test('audit: --aggregate-by-skill runs without error', () => {
  const out = execFileSync('node', [AUDIT, '--aggregate-by-skill'], { encoding: 'utf-8' });
  assert.ok(typeof out === 'string');
});

test('audit: no args exits 2 with usage', () => {
  try {
    execFileSync('node', [AUDIT], { encoding: 'utf-8', stdio: 'pipe' });
    assert.fail('expected non-zero exit');
  } catch (err) {
    assert.equal(err.status, 2);
    assert.match(err.stderr, /Usage:/);
  }
});
