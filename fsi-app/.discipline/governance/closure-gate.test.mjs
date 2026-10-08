// Red-then-green for the closure gate's four pure cores, plus a LIVE run over the real tree (same
// pattern as doctrine-contradiction.test.mjs / producer-consumer-orphan.mjs's own live evidence: the
// live assertion is the actual enforcement — if this ever goes red, the gate itself has caught something
// real, and the fix is the dispatch or the code, not a test edit).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTrainCommits,
  parseMaintenanceSteps,
  isDispatchable,
  hasRunEvidence,
  assembleRunbookCorpus,
  runbookHasRecord,
  checkNeverRun,
  findNextRows,
  hasOwningTrain,
  checkStaleNext,
  migrationNumber,
  checkWriterReader,
  LANE_CONTRACT_MARKER,
  checkLaneContract,
  NEVER_RUN_WINDOW_DAYS,
  NEVER_RUN_WINDOW_DAYS_BUILD_MODE,
  gatherNeverRunTargets,
  STALE_NEXT_ALLOWLIST,
  WRITER_READER_ALLOWLIST,
  runClosureGate,
  runNeverRunLive,
  runStaleNextLive,
  runWriterReaderLive,
  runLaneContractLive,
} from './closure-gate.mjs';
import * as closureGate from './closure-gate.mjs';

// ── runbook corpus (RB-SPLIT, 2026-10-04): index plus one file per step ─────────────────────────────

const STEP_FILES = [
  { name: '08-provenance-heal.md', text: '## 8. `provenance-heal`\n\nDispatched, run #41 landed.\n\n' },
  { name: '04a-source-type-backfill.md', text: '## 4a. `source-type-backfill`\n\nNever dispatched yet.\n\n' },
  { name: '04-origin-class-backfill.md', text: '## 4. `origin-class-backfill`\n\nDispatched, landed live.\n\n' },
  { name: 'A1-holdings-audit.md', text: '## Appendix: `holdings-audit`\n\nrun 123456789\n' },
];

test('assembleRunbookCorpus: index first, then step files in filename order (04 before 04a before 08 before A1)', () => {
  const corpus = assembleRunbookCorpus('# Index\n', STEP_FILES);
  const at = (needle) => corpus.indexOf(needle);
  assert.ok(at('# Index') < at('`origin-class-backfill`'));
  assert.ok(at('`origin-class-backfill`') < at('`source-type-backfill`'));
  assert.ok(at('`source-type-backfill`') < at('`provenance-heal`'));
  assert.ok(at('`provenance-heal`') < at('`holdings-audit`'));
});

test("runbookHasRecord over the assembled corpus: evidence is read from the step's OWN file only", () => {
  const corpus = assembleRunbookCorpus('# Index\n\n- [8. `provenance-heal`](maintenance.d/08-provenance-heal.md)\n', STEP_FILES);
  assert.equal(runbookHasRecord(corpus, 'provenance-heal'), true);
  assert.equal(runbookHasRecord(corpus, 'origin-class-backfill'), true);
  // a neighbour's run number must not count for a step whose own file has none
  assert.equal(runbookHasRecord(corpus, 'source-type-backfill'), false);
  // an index list line is not a section heading, so it never stands in for a step's section
  assert.equal(runbookHasRecord(assembleRunbookCorpus('- [8. `provenance-heal`](x.md) run #5\n', []), 'provenance-heal'), false);
});

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

test('hasRunEvidence: a tracked harness artifact or a runbook run record is enough (undated evidence); nothing else counts', () => {
  assert.equal(hasRunEvidence({ harnessArtifact: true, runbookRecord: false }), true);
  assert.equal(hasRunEvidence({ harnessArtifact: false, runbookRecord: true }), true);
  assert.equal(hasRunEvidence({ harnessArtifact: false, runbookRecord: false }), false);
  assert.equal(hasRunEvidence({ ledgerEntry: true }), false, 'a ledger row is DATED evidence, judged by checkNeverRun, not by this predicate');
});

// ── CHECK 1: NEVER-RUN (lane GATE-3, 2026-10-08): the clock is the newest harness_runs row date ────────

const NOW = new Date('2026-10-08T00:00:00Z');
const NO_EVIDENCE = { harnessArtifact: false, runbookRecord: false };
const at = (iso) => new Date(iso);
const never = (over) => checkNeverRun({ targets: [{ id: 'workflow:x.yml', introducedAt: at('2026-01-01T00:00:00Z'), newestRunAt: null, evidence: NO_EVIDENCE, ...over }], now: NOW, windowDays: 30 });

test('RED: a target whose newest ledger row is older than the window is overdue, and the reason says how old', () => {
  const r = never({ newestRunAt: at('2026-08-20T00:00:00Z') }); // 49 days
  assert.equal(r.ok, false);
  assert.match(r.failures[0].reason, /NEVER-RUN: newest harness_runs row is 49 days old \(window 30 days\)/);
});

test('GREEN: a ledger row inside the window clears the target, however old the target and whatever else is on record', () => {
  assert.equal(never({ newestRunAt: at('2026-09-20T00:00:00Z') }).ok, true);
});

test('RED: no ledger row, no undated evidence, and the target older than the window - overdue', () => {
  const r = never({});
  assert.equal(r.ok, false);
  assert.match(r.failures[0].reason, /introduced 280 days ago, no harness_runs row/);
});

test('GREEN: no row, no evidence, but the target is younger than the window - it has had no chance to run yet', () => {
  assert.equal(never({ introducedAt: at('2026-09-20T00:00:00Z') }).ok, true);
});

test('GREEN: no ledger row but undated evidence (a tracked artifact, or a runbook run record) - it has run, the ledger cannot date it', () => {
  for (const ev of [{ harnessArtifact: true }, { runbookRecord: true }]) {
    assert.equal(never({ evidence: { ...NO_EVIDENCE, ...ev } }).ok, true, JSON.stringify(ev));
  }
});

test('RED: undated evidence does not rescue a target whose newest dated row is outside the window', () => {
  const r = never({ newestRunAt: at('2026-06-01T00:00:00Z'), evidence: { harnessArtifact: true, runbookRecord: true } });
  assert.equal(r.ok, false);
});

test('GREEN: a target of unknown age with no evidence is not measurable, so it is not failed', () => {
  assert.equal(never({ introducedAt: null }).ok, true);
});

test('the window is a parameter: 49 days is overdue at 30 and clear at 90 (BUILD_MODE)', () => {
  const target = { id: 'workflow:x.yml', introducedAt: at('2026-01-01T00:00:00Z'), newestRunAt: at('2026-08-20T00:00:00Z'), evidence: NO_EVIDENCE };
  assert.equal(checkNeverRun({ targets: [target], now: NOW, windowDays: NEVER_RUN_WINDOW_DAYS }).ok, false);
  assert.equal(checkNeverRun({ targets: [target], now: NOW, windowDays: NEVER_RUN_WINDOW_DAYS_BUILD_MODE }).ok, true);
  assert.equal(NEVER_RUN_WINDOW_DAYS, 30);
  assert.equal(NEVER_RUN_WINDOW_DAYS_BUILD_MODE, 90);
});

test('GATE-3: there is no NEVER-RUN allowlist and no train grace any more (no stale-entry audit, nothing to expire)', () => {
  assert.equal(closureGate.NEVER_RUN_ALLOWLIST, undefined);
  assert.deepEqual(never({ newestRunAt: at('2026-09-20T00:00:00Z') }).allowlistIssues, []);
});

test('the live gatherer dates a maintenance step by its own config.step row or by an `all` row, and a workflow by its family', () => {
  const ledger = {
    present: true,
    capturedAt: '2026-10-08',
    rows: [
      { family: 'maintenance', started_at: '2026-10-01T00:00:00Z', config: { step: 'tier-opinions' } },
      { family: 'maintenance', started_at: '2026-10-05T00:00:00Z', config: { step: 'all' } },
      { family: 'maintenance', started_at: '2026-09-01T00:00:00Z', config: { step: 'other-step' } },
      { family: 'mint', started_at: '2026-10-02T00:00:00Z', config: {} },
    ],
  };
  const targets = gatherNeverRunTargets({ ledger });
  const byId = new Map(targets.map((t) => [t.id, t]));
  const tier = byId.get('maintenance:tier-opinions');
  assert.ok(tier, 'maintenance:tier-opinions is a real step on this tree');
  assert.equal(tier.newestRunAt.toISOString(), '2026-10-05T00:00:00.000Z', 'the newer `all` row wins over the step-specific one');
  const pop = byId.get('workflow:population-turn.yml');
  assert.equal(pop.newestRunAt.toISOString(), '2026-10-02T00:00:00.000Z', 'population-turn.yml is the mint family');
  assert.ok(tier.introducedAt instanceof Date && !Number.isNaN(tier.introducedAt.getTime()), 'introduction date comes from git, not a train number');
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

test('LIVE: NEVER-RUN is green on this tree (real ledger export if present, real git introduction dates, real undated evidence)', () => {
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
  for (const [key, e] of Object.entries(STALE_NEXT_ALLOWLIST)) {
    assert.ok(e.disposition && e.disposition.length > 10, `STALE_NEXT_ALLOWLIST["${key.slice(0, 40)}…"] needs a real disposition`);
    assert.ok(Number.isInteger(e.expiryTrain), `STALE_NEXT_ALLOWLIST["${key.slice(0, 40)}…"] needs a numeric expiryTrain`);
  }
  for (const [table, e] of Object.entries(WRITER_READER_ALLOWLIST)) {
    assert.ok(e.disposition && e.disposition.length > 10, `WRITER_READER_ALLOWLIST["${table}"] needs a real disposition`);
    assert.ok(Number.isInteger(e.expiryTrain), `WRITER_READER_ALLOWLIST["${table}"] needs a numeric expiryTrain`);
  }
});
