// Fire-tests for F63 (migration applied-status truth).
// Run: node --test fsi-app/.discipline/fitness/functions/F63-migration-applied-status.test.mjs
//
// RED FIRST, F23/F25/F27/F28 style: the pure comparators (parseHeaderStatus, extractHeaderBlock,
// extractTableOps, auditStatusAgainstLiveSchema) are driven with CONSTRUCTED fixtures that reproduce the
// exact CF-DATA-1 shape (header says NOT APPLIED, live says present) before any control/pass test runs.
// The self-skip path is proven against a real temp directory standing in for the gitignored
// fsi-app/scripts/tmp/ scratch location, via findLatestLiveSchemaFile's own root parameter - no
// monkeypatching of fs internals.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  extractHeaderBlock,
  parseHeaderStatus,
  extractTableOps,
  stripSqlComments,
  auditStatusAgainstLiveSchema,
  findLatestLiveSchemaFile,
  fitnessFunction,
  _resetLiveSchemaCache,
} from './F63-migration-applied-status.mjs';

// -- extractHeaderBlock / parseHeaderStatus ----------------------------------------------------------

test('extractHeaderBlock stops at the first non-comment, non-blank line', () => {
  const content = '-- subject: migration X. NOT YET APPLIED.\n-- more header prose\n\nCREATE TABLE foo (id int);\n';
  const header = extractHeaderBlock(content);
  assert.match(header, /NOT YET APPLIED/);
  assert.doesNotMatch(header, /CREATE TABLE/);
});

test('parseHeaderStatus: "NOT YET APPLIED" wins over a bare APPLIED substring match', () => {
  assert.equal(parseHeaderStatus('-- subject: foo. NOT YET APPLIED, coordinator applies later.'), 'not_applied');
});

test('parseHeaderStatus: "NOT APPLIED" (no YET) also reads as not_applied', () => {
  assert.equal(parseHeaderStatus('-- DRAFT / NOT APPLIED -- sketch'), 'not_applied');
});

test('parseHeaderStatus: AUTHOR-ONLY reads as draft', () => {
  assert.equal(parseHeaderStatus('-- subject: foo. AUTHOR-ONLY, rides coordinator approval.'), 'draft');
});

test('parseHeaderStatus: APPLIED-PENDING is its own status, never bare applied', () => {
  assert.equal(parseHeaderStatus('-- subject: foo. APPLIED-PENDING, coordinator named as applier.'), 'applied_pending');
});

test('parseHeaderStatus: bare APPLIED with evidence text reads as applied', () => {
  assert.equal(parseHeaderStatus('-- subject: foo. APPLIED (confirmed live, 38 rows, 2026-09-30).'), 'applied');
});

test('parseHeaderStatus: no status token at all returns null', () => {
  assert.equal(parseHeaderStatus('-- subject: foo. Adds a column.'), null);
});

// -- extractTableOps ----------------------------------------------------------------------------------

test('extractTableOps finds a CREATE TABLE target, ignores one mentioned only in a comment', () => {
  const body = stripSqlComments('-- CREATE TABLE mentioned_in_comment (x int);\nCREATE TABLE IF NOT EXISTS public.harness_runs (id uuid);\n');
  const { created, dropped } = extractTableOps(body);
  assert.deepEqual(created, ['harness_runs']);
  assert.deepEqual(dropped, []);
});

test('extractTableOps finds multiple DROP TABLE targets', () => {
  const body = stripSqlComments('DROP TABLE IF EXISTS public.notification_deliveries;\nDROP TABLE IF EXISTS public.notification_events;\n');
  const { created, dropped } = extractTableOps(body);
  assert.deepEqual(created, []);
  assert.deepEqual(dropped.sort(), ['notification_deliveries', 'notification_events']);
});

// -- auditStatusAgainstLiveSchema - the CF-DATA-1 attack shape ---------------------------------------

test('ATTACK: status not_applied + created table present live = CF-DATA-1 mismatch', () => {
  const problems = auditStatusAgainstLiveSchema('not_applied', ['harness_runs'], [], { harness_runs: 38 });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /HEADER SAYS NOT APPLIED, LIVE SAYS PRESENT/);
  assert.match(problems[0], /38 row/);
});

test('ATTACK: status applied + created table absent live = mismatch the other direction', () => {
  const problems = auditStatusAgainstLiveSchema('applied', ['corpus_turn_requests'], [], {});
  assert.equal(problems.length, 1);
  assert.match(problems[0], /HEADER SAYS APPLIED, LIVE SAYS ABSENT/);
});

test('ATTACK: status applied + dropped table still present live = mismatch (drop never happened)', () => {
  const problems = auditStatusAgainstLiveSchema('applied', [], ['case_studies'], { case_studies: 6 });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /HEADER SAYS APPLIED \(DROP\), LIVE SAYS STILL PRESENT/);
});

test('ATTACK: status not_applied + dropped table already absent live = mismatch (ambiguous drop)', () => {
  const problems = auditStatusAgainstLiveSchema('not_applied', [], ['notification_events'], {});
  assert.equal(problems.length, 1);
  assert.match(problems[0], /HEADER SAYS NOT APPLIED \(DROP\), LIVE SAYS ALREADY ABSENT/);
});

// -- CONTROL: consistent header/live pairs report nothing -------------------------------------------

test('CONTROL: status applied + created table present live = consistent, no problems', () => {
  assert.deepEqual(auditStatusAgainstLiveSchema('applied', ['harness_runs'], [], { harness_runs: 38 }), []);
});

test('CONTROL: status not_applied + created table absent live = consistent (genuinely not applied yet)', () => {
  assert.deepEqual(auditStatusAgainstLiveSchema('not_applied', ['some_future_table'], [], {}), []);
});

test('CONTROL: draft status never produces a live-schema problem even on a stark mismatch', () => {
  assert.deepEqual(auditStatusAgainstLiveSchema('draft', ['harness_runs'], [], {}), []);
});

test('CONTROL: applied_pending status never produces a live-schema problem', () => {
  assert.deepEqual(auditStatusAgainstLiveSchema('applied_pending', [], ['sources_reliability_score_holder'], { sources_reliability_score_holder: 1 }), []);
});

// -- findLatestLiveSchemaFile - self-skip precondition -----------------------------------------------

test('findLatestLiveSchemaFile returns null when the scratch directory does not exist at all', () => {
  const root = mkdtempSync(join(tmpdir(), 'f63-noscratch-'));
  try {
    assert.equal(findLatestLiveSchemaFile(root), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('findLatestLiveSchemaFile picks the newest-dated export when several are present', () => {
  const root = mkdtempSync(join(tmpdir(), 'f63-multi-'));
  try {
    const dir = join(root, 'fsi-app', 'scripts', 'tmp');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'live-schema-2026-08-01.json'), '{}');
    writeFileSync(join(dir, 'live-schema-2026-09-30.json'), '{}');
    writeFileSync(join(dir, 'not-a-live-schema-file.json'), '{}');
    const found = findLatestLiveSchemaFile(root);
    assert.match(found.replace(/\\/g, '/'), /live-schema-2026-09-30\.json$/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// -- CONTROL: fitnessFunction.check() self-skips (PASS, no throw) with no export reachable ----------
// The live repo tree this runs against may or may not carry a fresh export (gitignored scratch, never
// committed) - either way check() must never throw and must never report a violation purely because the
// export is missing. This is the mechanical proof of the self-skip contract described in the file's own
// header, run against the function as the runner actually calls it (not the pure comparator alone).

test('CONTROL: fitnessFunction.check() never throws on a real migration-shaped fixture, self-skip or not', () => {
  _resetLiveSchemaCache();
  const fixture =
    '-- subject: Migration 999 (fixture). NOT YET APPLIED.\n' +
    'CREATE TABLE IF NOT EXISTS public.fixture_only_table (id uuid primary key);\n';
  assert.doesNotThrow(() => fitnessFunction.check('fsi-app/supabase/migrations/999_fixture.sql', fixture));
  _resetLiveSchemaCache();
});

test('CONTROL: a migration with no self-declared status and no table ops passes cleanly', () => {
  _resetLiveSchemaCache();
  const fixture = '-- subject: Migration 998 (fixture). Adds a column, no status marker.\nALTER TABLE public.sources ADD COLUMN x text;\n';
  assert.deepEqual(fitnessFunction.check('fsi-app/supabase/migrations/998_fixture.sql', fixture), []);
  _resetLiveSchemaCache();
});
