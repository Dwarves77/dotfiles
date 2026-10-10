// Red-then-green for the closure gate's four pure cores, plus a LIVE run over the real tree (same
// pattern as doctrine-contradiction.test.mjs / producer-consumer-orphan.mjs's own live evidence: the
// live assertion is the actual enforcement — if this ever goes red, the gate itself has caught something
// real, and the fix is the dispatch or the code, not a test edit).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMaintenanceSteps,
  isDispatchable,
  checkNeverRun,
  findNextRows,
  hasOwningTrain,
  checkStaleNext,
  ledgerClock,
  STALE_NEXT_WINDOW_DAYS,
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

// ── shared parsers ──────────────────────────────────────────────────────────────────────────────────

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

// ── CHECK 1: NEVER-RUN (lane GATE-3, 2026-10-08): the clock is the newest harness_runs row date ────────

const NOW = new Date('2026-10-08T00:00:00Z');
const at = (iso) => new Date(iso);
const never = (over) => checkNeverRun({ targets: [{ id: 'workflow:x.yml', introducedAt: at('2026-01-01T00:00:00Z'), newestRunAt: null, ...over }], now: NOW, windowDays: 30 });

test('RED: a target whose newest ledger row is older than the window is overdue, and the reason says how old', () => {
  const r = never({ newestRunAt: at('2026-08-20T00:00:00Z') }); // 49 days
  assert.equal(r.ok, false);
  assert.match(r.failures[0].reason, /NEVER-RUN: newest harness_runs row is 49 days old \(window 30 days\)/);
});

test('GREEN: a ledger row inside the window clears the target, however old the target and whatever else is on record', () => {
  assert.equal(never({ newestRunAt: at('2026-09-20T00:00:00Z') }).ok, true);
});

test('RED: no ledger row and the target older than the window - overdue', () => {
  const r = never({});
  assert.equal(r.ok, false);
  assert.match(r.failures[0].reason, /introduced 280 days ago and the harness ledger export holds no run of it/);
});

test('GREEN: no row, no evidence, but the target is younger than the window - it has had no chance to run yet', () => {
  assert.equal(never({ introducedAt: at('2026-09-20T00:00:00Z') }).ok, true);
});

test('GREEN: a target of unknown age with no evidence is not measurable, so it is not failed', () => {
  assert.equal(never({ introducedAt: null }).ok, true);
});

test('the window is a parameter: 49 days is overdue at 30 and clear at 90 (BUILD_MODE)', () => {
  const target = { id: 'workflow:x.yml', introducedAt: at('2026-01-01T00:00:00Z'), newestRunAt: at('2026-08-20T00:00:00Z') };
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

const STALE_NOW = new Date('2026-10-08T00:00:00Z');
const daysAgo = (n) => new Date(STALE_NOW.getTime() - n * 24 * 60 * 60 * 1000);
const NEXT_ROW = '| **NEXT** | do it | x |';

test('RED: a NEXT row with no owning train, untouched past the window by ledger date, fails', () => {
  const r = checkStaleNext({ rows: [{ line: 5, raw: NEXT_ROW, lastTouchedAt: daysAgo(STALE_NEXT_WINDOW_DAYS + 5) }], now: STALE_NOW, allowlist: {} });
  assert.equal(r.ok, false);
  assert.equal(r.failures[0].line, 5);
  assert.match(r.failures[0].reason, /untouched for 26 days/);
});

test('GREEN: a NEXT row naming its own owning train passes regardless of age', () => {
  const r = checkStaleNext({ rows: [{ line: 5, raw: '| **NEXT (train/wave9)** | do it | x |', lastTouchedAt: daysAgo(400) }], now: STALE_NOW, allowlist: {} });
  assert.equal(r.ok, true);
});

test('GREEN: within the window passes with no owning train', () => {
  const r = checkStaleNext({ rows: [{ line: 5, raw: NEXT_ROW, lastTouchedAt: daysAgo(STALE_NEXT_WINDOW_DAYS - 1) }], now: STALE_NOW, allowlist: {} });
  assert.equal(r.ok, true);
});

test('RED: an undated NEXT row cannot be proven fresh and fails', () => {
  const r = checkStaleNext({ rows: [{ line: 5, raw: NEXT_ROW, lastTouchedAt: null }], now: STALE_NOW, allowlist: {} });
  assert.equal(r.ok, false);
  assert.match(r.failures[0].reason, /undated row/);
});

test('AUD-AT-5: STALE-NEXT ages by the ledger clock, not a counter: the same row is fresh then stale as the export advances', () => {
  const row = { line: 5, raw: NEXT_ROW, lastTouchedAt: new Date('2026-09-11T00:00:00Z') };
  const early = ledgerClock({ present: true, capturedAt: '2026-09-20T00:00:00Z', rows: [] });
  const late = ledgerClock({ present: true, capturedAt: '2026-10-20T00:00:00Z', rows: [] });
  assert.equal(checkStaleNext({ rows: [row], now: early.now, allowlist: {} }).ok, true);
  assert.equal(checkStaleNext({ rows: [row], now: late.now, allowlist: {} }).ok, false);
});

test('RATCHET: an allowlisted stale row fails once its until date passes', () => {
  const row = { line: 5, raw: NEXT_ROW, lastTouchedAt: daysAgo(90) };
  const allowlist = { [NEXT_ROW]: { disposition: 'T46 closes it', until: '2026-10-09' } };
  assert.equal(checkStaleNext({ rows: [row], now: STALE_NOW, allowlist }).ok, true);
  const failing = checkStaleNext({ rows: [row], now: new Date('2026-10-10T00:00:00Z'), allowlist });
  assert.equal(failing.ok, false);
  assert.match(failing.failures[0].reason, /EXPIRED on 2026-10-09/);
  // an entry with no ISO until date is refused outright (no numeric train expiry survives)
  const legacy = checkStaleNext({ rows: [row], now: STALE_NOW, allowlist: { [NEXT_ROW]: { disposition: 'T46 closes it', expiryTrain: 99 } } });
  assert.equal(legacy.ok, false);
  assert.match(legacy.failures[0].reason, /needs a disposition and an ISO until date/);
});

test('ALLOWLIST AUDIT: an entry whose row text no longer matches (edited or resolved) is reported', () => {
  const r = checkStaleNext({ rows: [], now: STALE_NOW, allowlist: { '| **NEXT** | ghost row | x |': { disposition: 'x', until: '2027-01-01' } } });
  assert.equal(r.ok, false);
  assert.match(r.allowlistIssues[0], /no longer matches/);
});

test('AUD-AT-5: ledgerClock reads capturedAt, else the newest run date, else the wall clock', () => {
  const wall = new Date('2026-12-01T00:00:00Z');
  assert.deepEqual(ledgerClock({ capturedAt: '2026-10-03T00:00:00Z', rows: [{ started_at: '2026-10-05T00:00:00Z' }] }, wall), { now: new Date('2026-10-03T00:00:00Z'), source: 'ledger-captured-at' });
  assert.deepEqual(ledgerClock({ capturedAt: null, rows: [{ started_at: '2026-09-01T00:00:00Z' }, { started_at: '2026-10-05T00:00:00Z' }, { started_at: 'junk' }] }, wall), { now: new Date('2026-10-05T00:00:00Z'), source: 'ledger-newest-run' });
  assert.deepEqual(ledgerClock({ present: false, capturedAt: null, rows: [] }, wall), { now: wall, source: 'wall-clock' });
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

test('RATCHET: an allowlisted orphan passes until its until date', () => {
  const migrationTexts = [{ file: 'fsi-app/supabase/migrations/270_orphan.sql', content: 'CREATE TABLE public.orphan_table (id uuid);' }];
  const codeFiles = [{ file: 'fsi-app/scripts/x.mjs', content: 'sb.from("orphan_table").insert(row);' }];
  const allowlist = { orphan_table: { disposition: 'W5.1 gives it a reader', until: '2026-10-09' } };
  assert.equal(checkWriterReader({ migrationTexts, codeFiles, allowlist, minMigration: 266, now: STALE_NOW }).ok, true);
  const failing = checkWriterReader({ migrationTexts, codeFiles, allowlist, minMigration: 266, now: new Date('2026-10-10T00:00:00Z') });
  assert.equal(failing.ok, false);
  assert.match(failing.failures[0].reason, /EXPIRED on 2026-10-09/);
});

test('ALLOWLIST AUDIT: an entry for a table that is no longer orphaned is reported', () => {
  const migrationTexts = [{ file: 'fsi-app/supabase/migrations/270_both.sql', content: 'CREATE TABLE public.both_table (id uuid);' }];
  const codeFiles = [{ file: 'fsi-app/scripts/x.mjs', content: 'sb.from("both_table").insert(row); sb.from("both_table").select("id");' }];
  const r = checkWriterReader({ migrationTexts, codeFiles, allowlist: { both_table: { disposition: 'x', until: '2099-01-01' } }, minMigration: 266 });
  assert.equal(r.ok, false);
  assert.match(r.allowlistIssues[0], /no longer a writer\/reader orphan/);
});

test('ALLOWLIST AUDIT: an entry for a table outside the migration window is reported', () => {
  const r = checkWriterReader({ migrationTexts: [], codeFiles: [], allowlist: { nonexistent_table: { disposition: 'x', until: '2099-01-01' } }, minMigration: 266 });
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
  const six = ['Reachable', 'Run', 'Populated', 'Visible', 'Gated', 'Documented'].map((n, i) => `${i + 1}. **${n}**: x`).join('\n');
  const r = checkLaneContract(`# Lane common contract\n\n${LANE_CONTRACT_MARKER}\n\n${six}\n`);
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
  // Lane MASTER-RED-1: STANDING-RED reads the live state of master's Actions runs, which is outside any diff; a unit
  // test must not go red on it. Its verdict is the gate step's (closure-gate.mjs in discipline.yml) and its logic is
  // proven on fixtures at the end of this file. The four tree-derived checks are asserted here as before.
  const treeChecks = r.neverRun.ok && r.staleNext.ok && r.writerReader.ok && r.laneContract.ok;
  assert.equal(treeChecks, true);
  assert.equal(r.ok, treeChecks && r.standingRed.ok);
});

test('LIVE: every allowlist entry names a non-empty disposition and an ISO until date (the ratchet shape itself is honest)', () => {
  for (const [key, e] of Object.entries(STALE_NEXT_ALLOWLIST)) {
    assert.ok(e.disposition && e.disposition.length > 10, `STALE_NEXT_ALLOWLIST["${key.slice(0, 40)}..."] needs a real disposition`);
    assert.ok(!Number.isNaN(Date.parse(e.until)), `STALE_NEXT_ALLOWLIST["${key.slice(0, 40)}..."] needs an ISO until date`);
  }
  for (const [table, e] of Object.entries(WRITER_READER_ALLOWLIST)) {
    assert.ok(e.disposition && e.disposition.length > 10, `WRITER_READER_ALLOWLIST["${table}"] needs a real disposition`);
    assert.ok(!Number.isNaN(Date.parse(e.until)), `WRITER_READER_ALLOWLIST["${table}"] needs an ISO until date`);
  }
});

// ---- lane GATE-8 (2026-10-08): the honest forms the AUD-AT-4 register found ACCEPTED, red then green ----

const SIX_CONDITIONS = [
  '1. **Reachable**: invoked by a runtime step.',
  '2. **Run**: it has executed for real at least once.',
  '3. **Populated**: the table has rows.',
  '4. **Visible**: a surface renders it.',
  '5. **Gated**: a fitness function fails CI.',
  '6. **Documented**: runbook section.',
].join('\n');

test('closure B7-02: isDispatchable reads the on: key in scalar, list, flow-mapping and block form', () => {
  assert.equal(isDispatchable('name: x\non: workflow_dispatch\njobs: {}\n'), true);
  assert.equal(isDispatchable('on: [push, workflow_dispatch]\n'), true);
  assert.equal(isDispatchable('on: { workflow_dispatch: {}, push: { branches: [master] } }\n'), true);
  assert.equal(isDispatchable('on:\n  workflow_dispatch:\n'), true);
  assert.equal(isDispatchable('on:\n  - workflow_dispatch\n'), true);
  assert.equal(isDispatchable('on: push\n'), false);
  assert.equal(isDispatchable('on: [push, pull_request]\n'), false);
});

test('closure B7-02: a column-0 comment inside the on: block does not end it (the old reader stopped there)', () => {
  const yml = 'on:\n# the schedule is commented out\n  # schedule:\n  workflow_dispatch:\n';
  assert.equal(isDispatchable(yml), true);
});

test('closure B7-02: workflow_dispatch named in a job step or a comment is not the trigger', () => {
  const yml = 'on:\n  push:\njobs:\n  a:\n    steps:\n      - run: |\n          echo "workflow_dispatch:"\n# workflow_dispatch:\n';
  assert.equal(isDispatchable(yml), false);
});

test('closure B7-03: evidence is the ledger export only; a runbook sentence or a tracked artifact does not clear an old target', () => {
  // the targets carry no evidence field any more; a target with no ledger row and an old introduction fails
  const r = checkNeverRun({ targets: [{ id: 'maintenance:x', introducedAt: new Date('2026-01-01T00:00:00Z'), newestRunAt: null, evidence: { harnessArtifact: true, runbookRecord: true } }], now: NOW, windowDays: 30 });
  assert.equal(r.ok, false);
  assert.equal(closureGate.hasRunEvidence, undefined);
  assert.equal(closureGate.runbookHasRecord, undefined);
});

test('closure: a dormant exemption holds a target out of the window until its date, expires, and is audited for staleness', () => {
  const target = { id: 'workflow:dormant.yml', introducedAt: new Date('2026-01-01T00:00:00Z'), newestRunAt: null };
  const ex = { 'workflow:dormant.yml': { reason: 'dormant by ruling', until: '2026-11-30' } };
  assert.equal(checkNeverRun({ targets: [target], now: NOW, windowDays: 30, dormant: ex }).ok, true);
  const expired = checkNeverRun({ targets: [target], now: new Date('2026-12-01T00:00:00Z'), windowDays: 30, dormant: ex });
  assert.equal(expired.ok, false);
  assert.match(expired.failures[0].reason, /EXPIRED on 2026-11-30/);
  // a target that is no longer overdue (it ran) leaves a stale entry, which fails
  const ran = checkNeverRun({ targets: [{ ...target, newestRunAt: new Date('2026-10-01T00:00:00Z') }], now: NOW, windowDays: 30, dormant: ex });
  assert.equal(ran.ok, false);
  assert.match(ran.allowlistIssues[0], /no longer overdue/);
  // an entry with no reason or no valid date does not exempt
  assert.equal(checkNeverRun({ targets: [target], now: NOW, windowDays: 30, dormant: { 'workflow:dormant.yml': { until: '2026-11-30' } } }).ok, false);
  assert.equal(checkNeverRun({ targets: [target], now: NOW, windowDays: 30, dormant: { 'workflow:dormant.yml': { reason: 'x', until: 'soon' } } }).ok, false);
});

test('closure: every shipped NEVER_RUN_DORMANT entry carries a reason and a valid until date', () => {
  for (const [id, e] of Object.entries(closureGate.NEVER_RUN_DORMANT)) {
    assert.ok(e.reason && e.reason.length > 20, id);
    assert.ok(!Number.isNaN(Date.parse(e.until)), id);
  }
});

test('closure B7-08: the lane-contract marker must be a heading line over the six conditions, not a quoted line over a gutted section', () => {
  const good = `# Lane common contract\n\n${LANE_CONTRACT_MARKER}\n\nA component is done only when all six hold:\n\n${SIX_CONDITIONS}\n\n## Where you work\n`;
  assert.equal(checkLaneContract(good).ok, true);
  const quoted = `# Lane common contract\n\n> ${LANE_CONTRACT_MARKER}\n\n${SIX_CONDITIONS}\n`;
  assert.equal(checkLaneContract(quoted).ok, false, 'a quoted marker is not the heading');
  const gutted = `# Lane common contract\n\n${LANE_CONTRACT_MARKER}\n\nnothing here\n\n## Where you work\n${SIX_CONDITIONS}\n`;
  assert.equal(checkLaneContract(gutted).ok, false, 'the six conditions must sit under the heading');
  const partial = `# Lane common contract\n\n${LANE_CONTRACT_MARKER}\n\n1. **Reachable**: x\n2. **Run**: y\n`;
  assert.equal(checkLaneContract(partial).ok, false);
});

// ---- coordinator addition (AUD-AT-5): the ledger export decides "has it ever run" when it exists ----

test('NEVER-RUN: with the ledger export present, a brand-new workflow with no ledger run FAILS (no window, no train counter)', () => {
  const fresh = { id: 'workflow:brand-new.yml', introducedAt: new Date('2026-10-08T00:00:00Z'), newestRunAt: null };
  const r = checkNeverRun({ targets: [fresh], now: NOW, windowDays: 90, ledgerPresent: true });
  assert.equal(r.ok, false);
  assert.match(r.failures[0].reason, /holds no run of workflow:brand-new\.yml/);
  // an unknown introduction date does not rescue it either
  assert.equal(checkNeverRun({ targets: [{ ...fresh, introducedAt: null }], now: NOW, windowDays: 90, ledgerPresent: true }).ok, false);
  // a run inside the window clears it
  assert.equal(checkNeverRun({ targets: [{ ...fresh, newestRunAt: new Date('2026-10-01T00:00:00Z') }], now: NOW, windowDays: 90, ledgerPresent: true }).ok, true);
});

test('NEVER-RUN: with no ledger export there is nothing to ask, so a young target still rides the age window', () => {
  const fresh = { id: 'workflow:brand-new.yml', introducedAt: new Date('2026-10-08T00:00:00Z'), newestRunAt: null };
  assert.equal(checkNeverRun({ targets: [fresh], now: NOW, windowDays: 90, ledgerPresent: false }).ok, true);
});

test('NEVER-RUN: the verdict reads no train counter', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('./closure-gate.mjs', import.meta.url), 'utf8');
  const fn = src.slice(src.indexOf('export function checkNeverRun'), src.indexOf('export const NEVER_RUN_DORMANT'));
  assert.equal(/[Tt]rain/.test(fn.replace(/\/\/.*$/gm, '')), false);
});

// ---- coordinator ruling on AUD-AT-5 item 5: the train counter is deleted; its consumers read the ledger clock ----

test('AUD-AT-5: the train counter is gone from the closure gate (no symbol, no git train walk), and the gate runs without it', async () => {
  const { readFileSync } = await import('node:fs');
  const code = readFileSync(new URL('./closure-gate.mjs', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
  for (const gone of ['parseTrainCommits', 'currentTrain', 'trainOf', 'isAncestorOfTrain', 'lastTouchedTrain', 'expiryTrain', 'merge-base']) {
    assert.equal(code.includes(gone), false, `${gone} must not survive in closure-gate.mjs`);
  }
  assert.equal(typeof closureGate.parseTrainCommits, 'undefined');
  const r = runClosureGate();
  assert.equal(r.ok, true);
  assert.ok(r.clock.now instanceof Date && ['ledger-captured-at', 'ledger-newest-run', 'wall-clock'].includes(r.clock.source));
  assert.equal('currentTrain' in r, false);
});

test('AUD-AT-5: no other module reads the train counter (the closure gate was its only consumer)', async () => {
  const { readdirSync, readFileSync, statSync } = await import('node:fs');
  const { join } = await import('node:path');
  const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  const offenders = [];
  const walk = (dir) => {
    for (const n of readdirSync(dir)) {
      if (n === 'node_modules' || n === 'out') continue;
      const f = join(dir, n);
      if (statSync(f).isDirectory()) { walk(f); continue; }
      if (!/\.mjs$/.test(n) || /closure-gate\.test\.mjs$/.test(n)) continue;
      if (/parseTrainCommits|currentTrain\(|lastTouchedTrain|expiryTrain/.test(readFileSync(f, 'utf8'))) offenders.push(f);
    }
  };
  walk(root);
  assert.deepEqual(offenders, []);
});

// ── lane GATE-9 (2026-10-08, AUD-AT-5 gate-script neuter row): the CLI's EXIT STATUS, not only its output ──────
test("GATE-9 exit status: closure-gate.mjs exits 0 on the committed tree, and its source has exactly one exit, the verdict (r.ok ? 0 : 1)", async () => {
  const { spawnSync } = await import("node:child_process");
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { withoutCredentials } = await import("../../scripts/lib/env-file.mjs");
  const script = fileURLToPath(new URL("./closure-gate.mjs", import.meta.url));
  const r = spawnSync(process.execPath, [script], { encoding: "utf8", env: withoutCredentials() });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /closure gate PASS/);
  const src = readFileSync(script, "utf8");
  assert.deepEqual([...src.matchAll(/process\.exit\(([^)]*)\)/g)].map((m) => m[1]), ["r.ok ? 0 : 1"]);
  assert.doesNotMatch(src, /process\.exit\s*=[^=]|process\.exitCode\s*=/, "the exit status is never reassigned");
});

// ---- lane DORMANT-1 (2026-10-09): every workflow has run; the dormant list is empty and stays empty ----
// Operator, 2026-10-09: "We do not do workarounds we fix the problem fix it." An exemption for a workflow that
// never ran is a workaround; the workflow is dispatched, and its run is the evidence.

test('DORMANT-1: NEVER_RUN_DORMANT is empty - an entry is a defect (the workflow is run, not exempted)', () => {
  assert.deepEqual(Object.keys(closureGate.NEVER_RUN_DORMANT), []);
  assert.equal(Object.isFrozen(closureGate.NEVER_RUN_DORMANT), true, 'the empty list cannot be added to at runtime');
});

test('DORMANT-1: every workflow family the map names is a registered harness family, and the ten formerly exempt recorders are mapped', async () => {
  const { FAMILIES } = await import('../../scripts/harness-runs/family-registry.mjs');
  const registered = new Set(FAMILIES.map((f) => f.family));
  const map = closureGate.HARNESS_FAMILY_BY_WORKFLOW;
  for (const [wf, fam] of Object.entries(map)) assert.ok(registered.has(fam), `${wf} maps to "${fam}", which is not a registered family`);
  for (const wf of ['brief-apply', 'brief-export', 'corpus-turn', 'fetch-drain', 'gate-a-rescan', 'needs-search', 'question-answers', 'research-assessment', 'research-walker', 'theme-briefs']) {
    assert.ok(map[`${wf}.yml`], `${wf}.yml records a harness family and must be mapped so its ledger rows count`);
  }
  assert.equal(map['corpus-turn.yml'], 'corpus-turn', 'corpus-turn.yml lands corpus-turn rows (forward-events has none)');
});

const liveTarget = (over) => ({ id: 'workflow:live.yml', introducedAt: at('2026-01-01T00:00:00Z'), newestRunAt: null, liveRunAt: null, ...over });

test('DORMANT-1: a run found live satisfies the check when the ledger export has none; a workflow with neither fails', () => {
  const ok = checkNeverRun({ targets: [liveTarget({ liveRunAt: at('2026-10-07T00:00:00Z') })], now: NOW, windowDays: 90, ledgerPresent: true });
  assert.equal(ok.ok, true);
  const neither = checkNeverRun({ targets: [liveTarget()], now: NOW, windowDays: 90, ledgerPresent: true });
  assert.equal(neither.ok, false);
  assert.match(neither.failures[0].reason, /holds no run of workflow:live\.yml/);
});

test('DORMANT-1: a live run older than the window does not satisfy the check, and the newer of ledger and live evidence decides', () => {
  const old = checkNeverRun({ targets: [liveTarget({ liveRunAt: at('2026-06-01T00:00:00Z') })], now: NOW, windowDays: 90, ledgerPresent: true });
  assert.equal(old.ok, false);
  assert.match(old.failures[0].reason, /days old \(window 90 days\)/);
  const mixed = checkNeverRun({ targets: [liveTarget({ newestRunAt: at('2026-05-01T00:00:00Z'), liveRunAt: at('2026-10-01T00:00:00Z') })], now: NOW, windowDays: 90, ledgerPresent: true });
  assert.equal(mixed.ok, true, 'a stale ledger row does not hide a fresh live run');
});

test('DORMANT-1: liveRunEvidence counts a run that executed (success, failure, in progress) and not one that did not (skipped, cancelled, queued)', () => {
  const run = (over) => ({ workflow_runs: [{ status: 'completed', conclusion: 'success', created_at: '2026-10-07T00:00:00Z', run_started_at: '2026-10-07T00:01:00Z', ...over }] });
  assert.equal(closureGate.liveRunEvidence(run({})).toISOString(), '2026-10-07T00:01:00.000Z');
  assert.ok(closureGate.liveRunEvidence(run({ conclusion: 'failure' })), 'a failed run still ran');
  assert.ok(closureGate.liveRunEvidence(run({ status: 'in_progress', conclusion: null })), 'a run in progress is running');
  assert.equal(closureGate.liveRunEvidence(run({ conclusion: 'skipped' })), null);
  assert.equal(closureGate.liveRunEvidence(run({ conclusion: 'cancelled' })), null);
  assert.equal(closureGate.liveRunEvidence(run({ status: 'queued', conclusion: null })), null);
  assert.equal(closureGate.liveRunEvidence({ workflow_runs: [] }), null);
  assert.equal(closureGate.liveRunEvidence(null), null);
});

test('DORMANT-1: the live lookup runs only with GITHUB_TOKEN, asks the workflow-runs endpoint for the newest run, and fails to no evidence', () => {
  const calls = [];
  const exec = (cmd, args) => { calls.push([cmd, args]); return JSON.stringify({ workflow_runs: [{ status: 'completed', conclusion: 'success', created_at: '2026-10-07T00:00:00Z' }] }); };
  assert.equal(closureGate.fetchLiveRun('x.yml', { env: {}, exec }), null, 'no token, no lookup');
  assert.equal(calls.length, 0);
  const got = closureGate.fetchLiveRun('x.yml', { env: { GITHUB_TOKEN: 't', GITHUB_REPOSITORY: 'o/r' }, exec });
  assert.equal(got.toISOString(), '2026-10-07T00:00:00.000Z');
  assert.equal(calls[0][0], 'gh');
  assert.equal(calls[0][1][0], 'api');
  assert.equal(calls[0][1][1], 'repos/o/r/actions/workflows/x.yml/runs?per_page=1');
  const boom = () => { throw new Error('api down'); };
  assert.equal(closureGate.fetchLiveRun('x.yml', { env: { GITHUB_TOKEN: 't' }, exec: boom }), null, 'an unreadable API is zero evidence, never a pass');
});

test('DORMANT-1: the live gatherer asks only about workflows the ledger cannot date, and records what the API returns', () => {
  const ledger = { present: true, capturedAt: '2026-10-08', rows: [{ family: 'fetch-drain', started_at: '2026-10-07T00:00:00Z', config: {} }] };
  const asked = [];
  const liveRunFn = (name) => { asked.push(name); return new Date('2026-10-07T12:00:00Z'); };
  const byId = new Map(gatherNeverRunTargets({ ledger, liveRunFn, windowDays: 90, now: NOW }).map((t) => [t.id, t]));
  assert.equal(asked.includes('fetch-drain.yml'), false, 'a ledger row inside the window answers it; no API call');
  assert.equal(asked.includes('uptime-probes.yml'), true, 'uptime-probes records no family, so the API is asked');
  assert.equal(byId.get('workflow:uptime-probes.yml').liveRunAt.toISOString(), '2026-10-07T12:00:00.000Z');
  assert.equal(byId.get('workflow:fetch-drain.yml').liveRunAt, null);
  assert.ok(byId.get('workflow:fetch-drain.yml').newestRunAt, 'fetch-drain.yml is dated by its fetch-drain family rows');
});

// ---- DORMANT-1 ruling 3 (2026-10-09): GitHub's own workflow state is a live fact; a disabled workflow is dormant by the platform's record ----

test('DORMANT-1: a workflow GitHub reports as disabled is dormant by the platform record: it does not fail, and the result says so by name', () => {
  const r = checkNeverRun({ targets: [liveTarget({ id: 'workflow:off.yml', platformState: 'disabled_manually' })], now: NOW, windowDays: 90, ledgerPresent: true });
  assert.equal(r.ok, true);
  assert.equal(r.dormantByPlatform.length, 1);
  assert.equal(r.dormantByPlatform[0].id, 'workflow:off.yml');
  assert.match(r.dormantByPlatform[0].reason, /disabled_manually/);
  assert.match(r.dormantByPlatform[0].reason, /dormant by the platform's record/);
});

test('DORMANT-1: an enabled, never-run workflow still fails; an unknown state (no token) never excuses', () => {
  for (const platformState of ['active', null, undefined]) {
    const r = checkNeverRun({ targets: [liveTarget({ platformState })], now: NOW, windowDays: 90, ledgerPresent: true });
    assert.equal(r.ok, false, String(platformState));
    assert.deepEqual(r.dormantByPlatform, []);
  }
});

test('DORMANT-1: a disabled workflow with in-window evidence is simply current, not listed as dormant', () => {
  const r = checkNeverRun({ targets: [liveTarget({ platformState: 'disabled_manually', liveRunAt: at('2026-10-01T00:00:00Z') })], now: NOW, windowDays: 90, ledgerPresent: true });
  assert.equal(r.ok, true);
  assert.deepEqual(r.dormantByPlatform, []);
});

test('DORMANT-1: the platform state is no exemption list: only a state starting "disabled" excuses (attack: active_x, enabled, "")', () => {
  for (const platformState of ['enabled', '', 'active_disabled', 'deleted']) {
    assert.equal(checkNeverRun({ targets: [liveTarget({ platformState })], now: NOW, windowDays: 90, ledgerPresent: true }).ok, false, platformState);
  }
});

test('DORMANT-1: fetchWorkflowState reads the workflow endpoint only with a token and fails to unknown', () => {
  const calls = [];
  const exec = (cmd, args) => { calls.push(args); return JSON.stringify({ state: 'disabled_manually' }); };
  assert.equal(closureGate.fetchWorkflowState('x.yml', { env: {}, exec }), null);
  assert.equal(calls.length, 0);
  assert.equal(closureGate.fetchWorkflowState('x.yml', { env: { GITHUB_TOKEN: 't', GITHUB_REPOSITORY: 'o/r' }, exec }), 'disabled_manually');
  assert.equal(calls[0][1], 'repos/o/r/actions/workflows/x.yml');
  assert.equal(closureGate.fetchWorkflowState('x.yml', { env: { GITHUB_TOKEN: 't' }, exec: () => { throw new Error('down'); } }), null);
});

test('DORMANT-1: the gatherer asks for the platform state only of a workflow with no in-window evidence', () => {
  const ledger = { present: true, capturedAt: '2026-10-08', rows: [] };
  const stateAsked = [];
  const byId = new Map(gatherNeverRunTargets({
    ledger, windowDays: 90, now: NOW,
    liveRunFn: (name) => (name === 'uptime-probes.yml' ? new Date('2026-10-07T00:00:00Z') : null),
    stateFn: (name) => { stateAsked.push(name); return 'disabled_manually'; },
  }).map((t) => [t.id, t]));
  assert.equal(stateAsked.includes('uptime-probes.yml'), false, 'a fresh live run answers it');
  assert.equal(stateAsked.includes('data-audit-lane.yml'), true);
  assert.equal(byId.get('workflow:data-audit-lane.yml').platformState, 'disabled_manually');
  assert.equal(byId.get('workflow:uptime-probes.yml').platformState, null);
});

// ---- lane MASTER-RED-1 (2026-10-10): CHECK 5, STANDING-RED. A workflow red twice running on master fails a PR ----
// Fixture-only: every Actions answer below comes from a fake client (injected exec / runsFn / stateFn); no live call.

const run = (id, conclusion, sha = `sha${id}`, status = 'completed') => ({ id, conclusion, head_sha: sha, status });
const wf = (file, runs, extra = {}) => ({ file, runs, state: 'active', governing: closureGate.workflowGoverningPaths(file), ...extra });
const standing = (workflows, changedFiles = null) => closureGate.checkStandingRed({ workflows, changedFiles });

test('MASTER-RED-1: one red and one green passes, in either order', () => {
  assert.equal(standing([wf('live-smoke.yml', [run(2, 'failure'), run(1, 'success')])]).ok, true, 'latest red, previous green');
  assert.equal(standing([wf('live-smoke.yml', [run(2, 'success'), run(1, 'failure')])]).ok, true, 'latest green, previous red');
  assert.equal(standing([wf('live-smoke.yml', [run(1, 'failure')])]).ok, true, 'one run only is not a standing red');
  assert.equal(standing([wf('live-smoke.yml', [])]).ok, true, 'no run on master');
});

test('MASTER-RED-1: two consecutive reds FAIL, and the text names the workflow, both run ids and both head shas', () => {
  const r = standing([wf('live-smoke.yml', [run(222, 'failure', 'aaaa1111'), run(111, 'failure', 'bbbb2222')])]);
  assert.equal(r.ok, false);
  assert.equal(r.failures.length, 1);
  const text = r.failures[0].reason;
  for (const needle of ['live-smoke.yml', '222', '111', 'aaaa1111', 'bbbb2222', 'STANDING-RED']) assert.ok(text.includes(needle), `${needle} in: ${text}`);
});

test('MASTER-RED-1: timed_out and startup_failure are reds too; skipped and cancelled runs are not in the sequence', () => {
  assert.equal(standing([wf('a.yml', [run(2, 'timed_out'), run(1, 'startup_failure')])]).ok, false);
  assert.equal(standing([wf('a.yml', [run(3, 'failure'), run(2, 'cancelled'), run(1, 'failure')])]).ok, false, 'a cancelled run between two reds does not break the streak');
  assert.equal(standing([wf('a.yml', [run(3, 'skipped'), run(2, 'failure'), run(1, 'success')])]).ok, true, 'a skipped run is not the latest');
  assert.equal(standing([wf('a.yml', [run(2, 'failure', 'x', 'in_progress'), run(1, 'failure')])]).ok, true, 'an unfinished run is not a completed run');
});

test('MASTER-RED-1: two reds plus a PR touching the workflow file passes, and the result says why', () => {
  const r = standing([wf('live-smoke.yml', [run(2, 'failure'), run(1, 'failure')])], ['.github/workflows/live-smoke.yml', 'README.md']);
  assert.equal(r.ok, true);
  assert.equal(r.exempt.length, 1);
  assert.deepEqual(r.exempt[0].touched, ['.github/workflows/live-smoke.yml']);
});

test('MASTER-RED-1: a PR touching one of the family governing files (family.json governing_files) is exempt', () => {
  const gov = closureGate.workflowGoverningPaths('live-smoke.yml');
  assert.ok(gov.includes('fsi-app/.discipline/rendering/live/live-assertions.mjs'), gov.join());
  assert.ok(gov.includes('fsi-app/scripts/turns/emit-live-smoke-artifact.mjs'));
  const reds = [run(2, 'failure'), run(1, 'failure')];
  assert.equal(standing([wf('live-smoke.yml', reds)], ['fsi-app/.discipline/rendering/live/live-assertions.mjs']).ok, true);
});

test('MASTER-RED-1: the exemption is per workflow and needs a real touch (attacks: unrelated file, another workflow, unknown diff)', () => {
  const reds = [run(2, 'failure'), run(1, 'failure')];
  assert.equal(standing([wf('live-smoke.yml', reds)], ['fsi-app/src/app/page.tsx']).ok, false, 'an unrelated change does not exempt');
  assert.equal(standing([wf('live-smoke.yml', reds)], ['.github/workflows/other.yml']).ok, false, 'a different workflow does not exempt');
  assert.equal(standing([wf('live-smoke.yml', reds)], null).ok, false, 'an unreadable diff grants no exemption');
  assert.equal(standing([wf('live-smoke.yml', reds)], []).ok, false, 'an empty diff grants no exemption');
  const two = standing([wf('live-smoke.yml', reds), wf('chain-proof.yml', reds)], ['.github/workflows/live-smoke.yml']);
  assert.equal(two.ok, false, 'touching live-smoke does not excuse chain-proof');
  assert.deepEqual(two.failures.map((f) => f.id), ['workflow:chain-proof.yml']);
});

test('MASTER-RED-1: two reds on a disabled workflow pass (DORMANT-1); only a state starting "disabled" excuses', () => {
  const reds = [run(2, 'failure'), run(1, 'failure')];
  for (const state of ['disabled_manually', 'disabled_inactivity']) {
    const r = standing([wf('live-smoke.yml', reds, { state })]);
    assert.equal(r.ok, true, state);
    assert.deepEqual(r.ignoredDisabled, ['live-smoke.yml']);
  }
  for (const state of ['active', null, undefined, 'enabled', '', 'deleted']) assert.equal(standing([wf('live-smoke.yml', reds, { state })]).ok, false, String(state));
});

test('MASTER-RED-1: the gatherer asks the platform state only of a standing red, and skips a workflow whose runs are unknown', () => {
  const stateAsked = [];
  const runsByFile = {
    'live-smoke.yml': [run(2, 'failure'), run(1, 'failure')],
    'chain-proof.yml': [run(4, 'success'), run(3, 'failure')],
    'unknown.yml': null,
  };
  const out = closureGate.gatherStandingRedWorkflows({
    files: ['.github/workflows/live-smoke.yml', '.github/workflows/chain-proof.yml', '.github/workflows/unknown.yml'],
    runsFn: (name) => runsByFile[name],
    stateFn: (name) => { stateAsked.push(name); return 'disabled_manually'; },
  });
  assert.deepEqual(out.map((w) => w.file), ['live-smoke.yml', 'chain-proof.yml'], 'unknown evidence is skipped, never a red');
  assert.deepEqual(stateAsked, ['live-smoke.yml']);
  assert.equal(standing(out).ok, true, 'the standing red is disabled on the platform');
});

test('MASTER-RED-1: the master-runs lookup uses the shared Actions client, asks for completed master runs, and fails to unknown', () => {
  const calls = [];
  const exec = (cmd, args) => { calls.push([cmd, args]); return JSON.stringify({ workflow_runs: [run(9, 'failure')] }); };
  assert.equal(closureGate.fetchMasterRuns('x.yml', { env: {}, exec }), null, 'no token, no lookup');
  assert.equal(calls.length, 0);
  const got = closureGate.fetchMasterRuns('x.yml', { env: { GITHUB_TOKEN: 't', GITHUB_REPOSITORY: 'o/r' }, exec });
  assert.equal(got[0].id, 9);
  assert.equal(calls[0][0], 'gh');
  assert.equal(calls[0][1][0], 'api');
  assert.equal(calls[0][1][1], 'repos/o/r/actions/workflows/x.yml/runs?branch=master&status=completed&per_page=10');
  assert.equal(closureGate.fetchMasterRuns('x.yml', { env: { GITHUB_TOKEN: 't' }, exec: () => { throw new Error('down'); } }), null);
  assert.equal(closureGate.fetchMasterRuns('x.yml', { env: { GITHUB_TOKEN: 't' }, exec: () => '{"message":"Not Found"}' }), null, 'a body with no workflow_runs is unknown');
});

test('MASTER-RED-1: the PR diff is read only in a pull_request run (GITHUB_BASE_REF) and an unreadable diff is unknown', () => {
  const seen = [];
  const exec = (args) => { seen.push(args); return 'a.txt\n\n.github/workflows/live-smoke.yml\n'; };
  assert.equal(closureGate.fetchChangedFiles({ env: {}, exec }), null);
  assert.equal(seen.length, 0);
  assert.deepEqual(closureGate.fetchChangedFiles({ env: { GITHUB_BASE_REF: 'master' }, exec }), ['a.txt', '.github/workflows/live-smoke.yml']);
  assert.deepEqual(seen[0], ['diff', '--name-only', 'origin/master...HEAD']);
  assert.equal(closureGate.fetchChangedFiles({ env: { GITHUB_BASE_REF: 'master' }, exec: () => { throw new Error('no base'); } }), null);
});

test('MASTER-RED-1: with no token the live check can neither fabricate a red nor fail the committed tree', () => {
  const before = process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_TOKEN;
  try {
    const r = closureGate.runStandingRedLive();
    assert.equal(r.ok, true);
    assert.deepEqual(r.failures, []);
  } finally {
    if (before !== undefined) process.env.GITHUB_TOKEN = before;
  }
});
