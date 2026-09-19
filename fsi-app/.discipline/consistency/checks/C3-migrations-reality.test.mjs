// Proves C3 (migrations.md reality, plan 6.8 Rule A, lane N5): passes GREEN against the live tree, and
// actually CATCHES both shapes of drift it exists to catch (rule 15: proven by attack, not by presence).
// The negative cases write a real throwaway file into the LIVE fsi-app/supabase/migrations/ directory
// (there is no injectable root on consistencyCheck.run() today, matching every other check in this
// directory) and remove it in a finally block, so a failure mid-test never leaves the tree dirty.
//
// Run: node --test fsi-app/.discipline/consistency/checks/C3-migrations-reality.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { getRepoRoot } from '../../lib/context.mjs';
import { consistencyCheck } from './C3-migrations-reality.mjs';
import { MIG_DIR_REL, DOC_PATH_REL } from '../../../scripts/inventories/generate-migrations-inventory.mjs';

const ROOT = getRepoRoot();
const MIG_DIR = resolve(ROOT, MIG_DIR_REL);
const DOC_PATH = resolve(ROOT, DOC_PATH_REL);
// A number no real migration uses (the corpus tops out in the 320s as of this writing) and a name that
// sorts and reads unmistakably as a throwaway fixture, never mistaken for a real migration.
const FIXTURE_FILE = '999999_c3_test_fixture_never_committed.sql';
const FIXTURE_PATH = resolve(MIG_DIR, FIXTURE_FILE);

function withFixtureFile(content, fn) {
  writeFileSync(FIXTURE_PATH, content);
  try {
    return fn();
  } finally {
    rmSync(FIXTURE_PATH, { force: true });
  }
}

test('C3 passes GREEN against the live tree', () => {
  const drifts = consistencyCheck.run();
  assert.deepEqual(drifts, [], `C3 found drift on the live tree:\n${drifts.map((d) => '  - ' + d.detail).join('\n')}`);
});

test('NEGATIVE (well-formedness): a migration file with no "-- subject:" line is caught, naming the file (RED-then-GREEN: present only for the duration of this test)', () => {
  withFixtureFile('-- just a plain comment, no subject line\nSELECT 1;\n', () => {
    const drifts = consistencyCheck.run();
    assert.ok(
      drifts.some((d) => d.kind === 'malformed' && d.location === `${MIG_DIR_REL}/${FIXTURE_FILE}`),
      `expected a malformed-subject-line drift naming ${FIXTURE_FILE}, got: ${JSON.stringify(drifts)}`,
    );
  });
  // Confirms the fixture is really gone and C3 is GREEN again (the RED was the fixture, not a leak).
  assert.equal(existsSync(FIXTURE_PATH), false);
  assert.deepEqual(consistencyCheck.run(), []);
});

test('NEGATIVE (parity): a well-formed new migration with no matching table row is caught as stale-status', () => {
  withFixtureFile('-- subject: A fixture migration C3 must catch as missing from the page\nSELECT 1;\n', () => {
    const drifts = consistencyCheck.run();
    assert.ok(
      drifts.some((d) => d.kind === 'stale-status' && d.location === DOC_PATH_REL),
      `expected a stale-status parity drift naming ${DOC_PATH_REL}, got: ${JSON.stringify(drifts)}`,
    );
  });
  assert.deepEqual(consistencyCheck.run(), []);
});

test('NEGATIVE (parity): editing the committed page without regenerating it is caught', () => {
  const before = readFileSync(DOC_PATH, 'utf8');
  try {
    writeFileSync(DOC_PATH, before.replace('# Migrations Inventory', '# Migrations Inventory (hand-edited)'));
    const drifts = consistencyCheck.run();
    assert.ok(
      drifts.some((d) => d.kind === 'stale-status' && d.location === DOC_PATH_REL),
      `expected a stale-status parity drift after a hand edit, got: ${JSON.stringify(drifts)}`,
    );
  } finally {
    writeFileSync(DOC_PATH, before);
  }
  assert.deepEqual(consistencyCheck.run(), []);
});
