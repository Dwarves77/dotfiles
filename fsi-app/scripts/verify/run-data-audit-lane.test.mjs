// Tests for run-data-audit-lane.mjs's derived AUDITS list (plan 6.8, Rule A): the real corpus of
// `// data-audit:` markers under scripts/verify/ and scripts/ loads correctly, and a malformed marker
// or a duplicate label is refused by name against an isolated temp fixture directory (never the real
// scripts/ tree). Importing deriveAudits() never spawns an audit process (the isMainModule() gate);
// these tests confirm that by simply not hanging or shelling out.
//
// The one-time equality proof against the pre-lane hand-written AUDITS array (scripts/tmp/
// n1-before-audits.json, gitignored scratch per CLAUDE.md rule 5) ran once, live, during this lane's
// own verification and is pasted in its report; it is not a permanent test here, because the snapshot
// it would compare against is scratch that does not exist on a fresh checkout or in CI, and once this
// migration lands there is no "old way" left to keep proving equal to.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deriveAudits } from './run-data-audit-lane.mjs';

test('deriveAudits() finds real, marked scripts and returns [label, path, hard] tuples sorted by label', () => {
  const audits = deriveAudits();
  assert.ok(audits.length >= 30, `expected at least 30 marked audit scripts, got ${audits.length}`);
  for (const [label, rel, hard] of audits) {
    assert.equal(typeof label, 'string');
    assert.match(rel, /^scripts\/(verify\/)?[\w.-]+\.mjs$/);
    assert.equal(typeof hard, 'boolean');
  }
  const labels = audits.map((a) => a[0]);
  assert.deepEqual(labels, [...labels].sort((a, b) => a.localeCompare(b)), 'expected audits sorted by label');
  assert.equal(new Set(labels).size, labels.length, 'expected unique labels');
});

test('a fixture directory markers are read back exactly', () => {
  const dir = mkdtempSync(join(tmpdir(), 'data-audit-lane-fixture-'));
  try {
    writeFileSync(join(dir, 'ok-hard.mjs'), '// data-audit: label=fixture-hard hard=true\nconsole.log("noop");\n');
    writeFileSync(join(dir, 'ok-soft.mjs'), '// data-audit: label=fixture-soft hard=false\nconsole.log("noop");\n');
    writeFileSync(join(dir, 'unmarked.mjs'), 'console.log("no marker, excluded");\n');
    writeFileSync(join(dir, 'ok-hard.test.mjs'), '// data-audit: label=should-be-excluded hard=true\n');
    const audits = deriveAudits([{ abs: dir, prefix: 'fixture' }]);
    assert.deepEqual(audits, [
      ['fixture-hard', 'fixture/ok-hard.mjs', true],
      ['fixture-soft', 'fixture/ok-soft.mjs', false],
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a script with a malformed data-audit marker is refused by name', () => {
  const dir = mkdtempSync(join(tmpdir(), 'data-audit-lane-fixture-'));
  try {
    writeFileSync(join(dir, 'bad.mjs'), '// data-audit: this is not the marker shape\nconsole.log("noop");\n');
    assert.throws(
      () => deriveAudits([{ abs: dir, prefix: 'fixture' }]),
      (err) => {
        assert.match(err.message, /malformed marker/);
        assert.match(err.message, /fixture\/bad\.mjs/);
        return true;
      },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('two fixture scripts sharing a label are refused by name', () => {
  const dir = mkdtempSync(join(tmpdir(), 'data-audit-lane-fixture-'));
  try {
    writeFileSync(join(dir, 'a.mjs'), '// data-audit: label=dup hard=true\n');
    writeFileSync(join(dir, 'b.mjs'), '// data-audit: label=dup hard=false\n');
    assert.throws(
      () => deriveAudits([{ abs: dir, prefix: 'fixture' }]),
      (err) => {
        assert.match(err.message, /duplicate label "dup"/);
        return true;
      },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
