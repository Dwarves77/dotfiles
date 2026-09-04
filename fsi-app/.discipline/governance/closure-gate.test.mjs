// Red-then-green for the closure gate's four pure cores, plus a LIVE run over the real tree (same
// pattern as doctrine-contradiction.test.mjs / producer-consumer-orphan.mjs's own live evidence: the
// live assertion is the actual enforcement — if this ever goes red, the gate itself has caught something
// real, and the fix is a new allowlist entry with a disposition + expiry train, not a test edit).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTrainCommits,
  parseMaintenanceSteps,
  isDispatchable,
  hasRunEvidence,
  checkNeverRun,
  findNextRows,
  hasOwningTrain,
  checkStaleNext,
  migrationNumber,
  checkWriterReader,
  LANE_CONTRACT_MARKER,
  checkLaneContract,
  NEVER_RUN_ALLOWLIST,
  STALE_NEXT_ALLOWLIST,
  WRITER_READER_ALLOWLIST,
  runClosureGate,
  runNeverRunLive,
  runStaleNextLive,
  runWriterReaderLive,
  runLaneContractLive,
} from './closure-gate.mjs';

// ── shared parsers ──────────────────────────────────────────────────────────────────────────────────

test('parseTrainCommits: extracts train/waveN commits, ascending by wave, ignores non-train commits', () => {
  const log = [
    'e8cb748f train/wave36 2026 09 04 (#583)',
    'aaaaaaaa fix: something unrelated',
    'f2800ea9 train/wave35 2026 09 04 (#582)',
    'bbbbbbbb train/wave9 2026 09 03 (#556)',
  ].join('\n');
  assert.deepEqual(parseTrainCommits(log), [
    { hash: 'bbbbbbbb', wave: 9 },
    { hash: 'f2800ea9', wave: 35 },
    { hash: 'e8cb748f', wave: 36 },
  ]);
});

test('parseMaintenanceSteps: extracts the options[] step list, drops "all"', () => {
  const yaml = `
      step:
        description: 'x'
        options: [all, community-topics-seed, tier-opinions]
`;
  assert.deepEqual(parseMaintenanceSteps(yaml), ['community-topics-seed', 'tier-opinions']);
});

test('parseMaintenanceSteps: empty on missing options block', () => {
  assert.deepEqual(parseMaintenanceSteps('on:\n  push:\n'), []);
});

test('isDispatchable: true only when workflow_dispatch is in the on: block', () => {
  assert.equal(isDispatchable('on:\n  workflow_dispatch:\n    inputs: {}\n'), true);
  assert.equal(isDispatchable('on:\n  push:\n    branches: [master]\n'), false);
  assert.equal(isDispatchable(''), false);
});

test('hasRunEvidence: any one of the three sources is enough', () => {
  assert.equal(hasRunEvidence({ harnessArtifact: true, runbookRecord: false, ledgerEntry: false }), true);
  assert.equal(hasRunEvidence({ harnessArtifact: false, runbookRecord: true, ledgerEntry: false }), true);
  assert.equal(hasRunEvidence({ harnessArtifact: false, runbookRecord: false, ledgerEntry: true }), true);
  assert.equal(hasRunEvidence({ harnessArtifact: false, runbookRecord: false, ledgerEntry: false }), false);
});

// ── CHECK 1: NEVER-RUN ──────────────────────────────────────────────────────────────────────────────

test('RED: an overdue target with no evidence and no allowlist entry fails', () => {
  const r = checkNeverRun({
    targets: [{ id: 'maintenance:foo', introducedTrain: 10, evidence: { harnessArtifact: false, runbookRecord: false, ledgerEntry: false } }],
    currentTrain: 20,
    allowlist: {},
  });
  assert.equal(r.ok, false);
  assert.equal(r.failures.length, 1);
  assert.match(r.failures[0].reason, /NEVER-RUN/);
});

test('GREEN: within grace (N=3 trains) passes with no evidence', () => {
  const r = checkNeverRun({
    targets: [{ id: 'maintenance:foo', introducedTrain: 18, evidence: { harnessArtifact: false, runbookRecord: false, ledgerEntry: false } }],
    currentTrain: 20,
    allowlist: {},
  });
  assert.equal(r.ok, true);
});

test('GREEN: any evidence source clears an overdue target', () => {
  for (const ev of [{ harnessArtifact: true }, { runbookRecord: true }, { ledgerEntry: true }]) {
    const r = checkNeverRun({
      targets: [{ id: 'maintenance:foo', introducedTrain: 5, evidence: { harnessArtifact: false, runbookRecord: false, ledgerEntry: false, ...ev } }],
      currentTrain: 20,
      allowlist: {},
    });
    assert.equal(r.ok, true, JSON.stringify(ev));
  }
});

test('RATCHET: an allowlisted overdue target passes until its expiry train, then fails', () => {
  const target = { id: 'maintenance:foo', introducedTrain: 5, evidence: { harnessArtifact: false, runbookRecord: false, ledgerEntry: false } };
  const allowlist = { 'maintenance:foo': { disposition: 'tracked to W3.3', expiryTrain: 20 } };
  assert.equal(checkNeverRun({ targets: [target], currentTrain: 20, allowlist }).ok, true, 'at expiry train, still passes');
  const failing = checkNeverRun({ targets: [target], currentTrain: 21, allowlist });
  assert.equal(failing.ok, false);
  assert.match(failing.failures[0].reason, /allowlist EXPIRED/);
});

test('ALLOWLIST AUDIT: a stale entry (target now has evidence) is reported, not silently accepted', () => {
  const r = checkNeverRun({
    targets: [{ id: 'maintenance:foo', introducedTrain: 5, evidence: { harnessArtifact: true, runbookRecord: false, ledgerEntry: false } }],
    currentTrain: 20,
    allowlist: { 'maintenance:foo': { disposition: 'x', expiryTrain: 30 } },
  });
  assert.equal(r.ok, false);
  assert.match(r.allowlistIssues[0], /stale/);
});

test('ALLOWLIST AUDIT: an entry naming a target that no longer exists is reported', () => {
  const r = checkNeverRun({ targets: [], currentTrain: 20, allowlist: { 'maintenance:ghost': { disposition: 'x', expiryTrain: 30 } } });
  assert.equal(r.ok, false);
  assert.match(r.allowlistIssues[0], /no longer exists/);
});

// ── CHECK 2: STALE-NEXT ─────────────────────────────────────────────────────────────────────────────

test('findNextRows: matches bold NEXT and lowercase next: status cells, ignores non-status text', () => {
  const board = [
    '| **NEXT** | do the thing | scope §4 |',
    '| DONE | already shipped | — |',
    '| **NEXT (coordinator)** | dispatch it | Addendum 9 |',
    'This paragraph mentions NEXT in prose, not a table row.',
  ].join('\n');
  const rows = findNextRows(board);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].line, 1);
  assert.equal(rows[1].line, 3);
});

test('hasOwningTrain: recognises train/waveN, TNN, and "train N", nothing else', () => {
  assert.equal(hasOwningTrain('landed as train/wave36'), true);
  assert.equal(hasOwningTrain('closes under T46'), true);
  assert.equal(hasOwningTrain('folded into Train 8'), true);
  assert.equal(hasOwningTrain('no train reference here at all'), false);
});

test('RED: a NEXT row with no owning train, older than grace, fails', () => {
  const r = checkStaleNext({ rows: [{ line: 5, raw: '| **NEXT** | do it | — |', lastTouchedTrain: 10 }], currentTrain: 20, allowlist: {} });
  assert.equal(r.ok, false);
  assert.equal(r.failures[0].line, 5);
});

test('GREEN: a NEXT row naming its own owning train passes regardless of age', () => {
  const r = checkStaleNext({ rows: [{ line: 5, raw: '| **NEXT (train/wave9)** | do it | — |', lastTouchedTrain: 5 }], currentTrain: 30, allowlist: {} });
  assert.equal(r.ok, true);
});

test('GREEN: within grace passes with no owning train', () => {
  const r = checkStaleNext({ rows: [{ line: 5, raw: '| **NEXT** | do it | — |', lastTouchedTrain: 18 }], currentTrain: 20, allowlist: {} });
  assert.equal(r.ok, true);
});

test('RATCHET: allowlisted stale row fails once its expiry train passes', () => {
  const row = { line: 5, raw: '| **NEXT** | do it | — |', lastTouchedTrain: 10 };
  const allowlist = { '| **NEXT** | do it | — |': { disposition: 'T46 closes it', expiryTrain: 20 } };
  assert.equal(checkStaleNext({ rows: [row], currentTrain: 20, allowlist }).ok, true);
  const failing = checkStaleNext({ rows: [row], currentTrain: 21, allowlist });
  assert.equal(failing.ok, false);
  assert.match(failing.failures[0].reason, /allowlist EXPIRED/);
});

test('ALLOWLIST AUDIT: an entry whose row text no longer matches (edited or resolved) is reported', () => {
  const r = checkStaleNext({ rows: [], currentTrain: 20, allowlist: { '| **NEXT** | ghost row | — |': { disposition: 'x', expiryTrain: 30 } } });
  assert.equal(r.ok, false);
  assert.match(r.allowlistIssues[0], /no longer matches/);
});

// ── CHECK 3: WRITER-READER (reuses producer-consumer-orphan.mjs's own pure core) ───────────────────

test('migrationNumber: parses the leading numeric prefix, null on no match', () => {
  assert.equal(migrationNumber('fsi-app/supabase/migrations/271_assumption_register.sql'), 271);
  assert.equal(migrationNumber('fsi-app/supabase/migrations/README.md'), null);
});

test('RED: a table created by a migration >= the window with a writer and no reader fails', () => {
  const migrationTexts = [{ file: 'fsi-app/supabase/migrations/270_orphan.sql', content: 'CREATE TABLE public.orphan_table (id uuid);' }];
  const codeFiles = [{ file: 'fsi-app/scripts/x.mjs', content: 'sb.from("orphan_table").insert(row);' }];
  const r = checkWriterReader({ migrationTexts, codeFiles, allowlist: {}, minMigration: 266 });
  assert.equal(r.ok, false);
  assert.equal(r.failures.length, 1);
  assert.match(r.failures[0].reason, /writer, no reader/);
});

test('RED: reader-with-no-writer also fails (the direction producer-consumer-orphan.mjs itself only reports as informational)', () => {
  const migrationTexts = [{ file: 'fsi-app/supabase/migrations/270_readonly.sql', content: 'CREATE TABLE public.readonly_table (id uuid);' }];
  const codeFiles = [{ file: 'fsi-app/scripts/x.mjs', content: 'sb.from("readonly_table").select("id");' }];
  const r = checkWriterReader({ migrationTexts, codeFiles, allowlist: {}, minMigration: 266 });
  assert.equal(r.ok, false);
  assert.match(r.failures[0].reason, /reader, no writer/);
});

test('GREEN: a table with both a writer and a reader passes', () => {
  const migrationTexts = [{ file: 'fsi-app/supabase/migrations/270_both.sql', content: 'CREATE TABLE public.both_table (id uuid);' }];
  const codeFiles = [{ file: 'fsi-app/scripts/x.mjs', content: 'sb.from("both_table").insert(row); sb.from("both_table").select("id");' }];
  const r = checkWriterReader({ migrationTexts, codeFiles, allowlist: {}, minMigration: 266 });
  assert.equal(r.ok, true);
});

test('GREEN: a table created before the migration window is out of scope even if orphaned', () => {
  const migrationTexts = [{ file: 'fsi-app/supabase/migrations/100_old.sql', content: 'CREATE TABLE public.old_table (id uuid);' }];
  const codeFiles = [{ file: 'fsi-app/scripts/x.mjs', content: 'sb.from("old_table").insert(row);' }];
  const r = checkWriterReader({ migrationTexts, codeFiles, allowlist: {}, minMigration: 266 });
  assert.equal(r.ok, true);
});

test('RATCHET: an allowlisted orphan passes until its expiry train', () => {
  const migrationTexts = [{ file: 'fsi-app/supabase/migrations/270_orphan.sql', content: 'CREATE TABLE public.orphan_table (id uuid);' }];
  const codeFiles = [{ file: 'fsi-app/scripts/x.mjs', content: 'sb.from("orphan_table").insert(row);' }];
  const allowlist = { orphan_table: { disposition: 'W5.1 gives it a reader', expiryTrain: 20 } };
  assert.equal(checkWriterReader({ migrationTexts, codeFiles, allowlist, minMigration: 266, currentTrain: 20 }).ok, true);
  const failing = checkWriterReader({ migrationTexts, codeFiles, allowlist, minMigration: 266, currentTrain: 21 });
  assert.equal(failing.ok, false);
  assert.match(failing.failures[0].reason, /allowlist EXPIRED/);
});

test('ALLOWLIST AUDIT: an entry for a table that is no longer orphaned is reported', () => {
  const migrationTexts = [{ file: 'fsi-app/supabase/migrations/270_both.sql', content: 'CREATE TABLE public.both_table (id uuid);' }];
  const codeFiles = [{ file: 'fsi-app/scripts/x.mjs', content: 'sb.from("both_table").insert(row); sb.from("both_table").select("id");' }];
  const r = checkWriterReader({ migrationTexts, codeFiles, allowlist: { both_table: { disposition: 'x', expiryTrain: 99 } }, minMigration: 266 });
  assert.equal(r.ok, false);
  assert.match(r.allowlistIssues[0], /no longer a writer\/reader orphan/);
});

test('ALLOWLIST AUDIT: an entry for a table outside the migration window is reported', () => {
  const r = checkWriterReader({ migrationTexts: [], codeFiles: [], allowlist: { nonexistent_table: { disposition: 'x', expiryTrain: 99 } }, minMigration: 266 });
  assert.equal(r.ok, false);
  assert.match(r.allowlistIssues[0], /not created by any migration/);
});

// ── CHECK 4: LANE-CONTRACT ──────────────────────────────────────────────────────────────────────────

test('RED: contract text missing the §0 marker fails', () => {
  const r = checkLaneContract('# Lane common contract\n\nSome other text.');
  assert.equal(r.ok, false);
  assert.match(r.failures[0].reason, /LANE-CONTRACT/);
});

test('GREEN: contract text carrying the marker verbatim passes', () => {
  const r = checkLaneContract(`# Lane common contract\n\n${LANE_CONTRACT_MARKER}\n\nbody`);
  assert.equal(r.ok, true);
});

// ── LIVE: the real tree, via the real allowlists ────────────────────────────────────────────────────

test('LIVE: NEVER-RUN is green on this tree (real allowlist, real trains, real dispatch evidence)', () => {
  const r = runNeverRunLive();
  assert.equal(r.ok, true, `NEVER-RUN failures:\n${r.failures.map((f) => `  ${f.id}: ${f.reason}`).join('\n')}\nallowlist issues:\n${r.allowlistIssues.join('\n')}`);
});

test('LIVE: STALE-NEXT is green on this tree', () => {
  const r = runStaleNextLive();
  assert.equal(r.ok, true, `STALE-NEXT failures:\n${r.failures.map((f) => `  line ${f.line}: ${f.reason}`).join('\n')}\nallowlist issues:\n${r.allowlistIssues.join('\n')}`);
});

test('LIVE: WRITER-READER is green on this tree', () => {
  const r = runWriterReaderLive();
  assert.equal(r.ok, true, `WRITER-READER failures:\n${r.failures.map((f) => `  ${f.table}: ${f.reason}`).join('\n')}\nallowlist issues:\n${r.allowlistIssues.join('\n')}`);
});

test('LIVE: LANE-CONTRACT is green on this tree', () => {
  const r = runLaneContractLive();
  assert.equal(r.ok, true, r.failures.map((f) => f.reason).join('\n'));
});

test('LIVE: the combined closure gate is green', () => {
  const r = runClosureGate();
  assert.equal(r.ok, true);
});

test('LIVE: every allowlist entry names a non-empty disposition and a numeric expiryTrain (the ratchet shape itself is honest)', () => {
  for (const [id, e] of Object.entries(NEVER_RUN_ALLOWLIST)) {
    assert.ok(e.disposition && e.disposition.length > 10, `NEVER_RUN_ALLOWLIST["${id}"] needs a real disposition`);
    assert.ok(Number.isInteger(e.expiryTrain), `NEVER_RUN_ALLOWLIST["${id}"] needs a numeric expiryTrain`);
  }
  for (const [key, e] of Object.entries(STALE_NEXT_ALLOWLIST)) {
    assert.ok(e.disposition && e.disposition.length > 10, `STALE_NEXT_ALLOWLIST["${key.slice(0, 40)}…"] needs a real disposition`);
    assert.ok(Number.isInteger(e.expiryTrain), `STALE_NEXT_ALLOWLIST["${key.slice(0, 40)}…"] needs a numeric expiryTrain`);
  }
  for (const [table, e] of Object.entries(WRITER_READER_ALLOWLIST)) {
    assert.ok(e.disposition && e.disposition.length > 10, `WRITER_READER_ALLOWLIST["${table}"] needs a real disposition`);
    assert.ok(Number.isInteger(e.expiryTrain), `WRITER_READER_ALLOWLIST["${table}"] needs a numeric expiryTrain`);
  }
});
