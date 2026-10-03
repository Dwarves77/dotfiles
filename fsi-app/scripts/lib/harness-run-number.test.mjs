// Selftests for harness-run-number.mjs (lane HARNESS-RUN-NUMBER, 2026-09-29) -- no test file existed for
// this module before this lane, even though it already had two callers (plan-quarantine-disposition.mjs,
// write-statutory.mjs) and gained a third (record-harness-run.mjs) in this same lane, per task 4's "a
// test for the number-claim helper with a fake harness_runs." Deps-injected `readAllFn` throughout, same
// shape the real callers already use -- no real DB anywhere in this file.
// Run: node --test fsi-app/scripts/lib/harness-run-number.test.mjs
// buildHarnessRunsClient is NOT exercised here: its real dynamic `import("@supabase/supabase-js")` is
// unresolvable under this file's no-npm discipline-suite membership (run-test-suite.sh) -- the existing
// precedent (plan-quarantine-disposition.test.mjs's own header) puts that ONE test in its own
// `.npmtest.mjs` file instead, wired into discipline.yml's separate npm-deps step. Out of this lane's
// write set; not duplicated here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextRunNumberFromHarnessRuns, formatRunId } from './harness-run-number.mjs';

/** A fake `harness_runs` table, keyed by family, standing in for a real readAllFn's rows. */
function fakeReadAllFn(rowsByFamily) {
  return async (table, columns, { match: _match } = {}) => {
    assert.equal(table, 'harness_runs');
    assert.equal(columns, 'run_id');
    // The real readAllFn applies `match` as a Supabase query-builder filter; this fake just returns the
    // rows for whichever family the test set up -- callers here only ever ask for one family at a time,
    // and every real caller's own `match` is `q => q.eq("harness_family", family)`, exercised for real
    // shape by the fixture Supabase clients in record-harness-run.test.mjs and
    // plan-quarantine-disposition.test.mjs, not re-proven here.
    return rowsByFamily;
  };
}

test('nextRunNumberFromHarnessRuns: no existing rows -> 1 (first run for a family)', async () => {
  const n = await nextRunNumberFromHarnessRuns(fakeReadAllFn([]), 'gate-a-rescan');
  assert.equal(n, 1);
});

test('nextRunNumberFromHarnessRuns: returns max+1 across a set of existing rows, order-independent', async () => {
  const rows = [{ run_id: 'gate-a-rescan-run-003' }, { run_id: 'gate-a-rescan-run-001' }, { run_id: 'gate-a-rescan-run-002' }];
  const n = await nextRunNumberFromHarnessRuns(fakeReadAllFn(rows), 'gate-a-rescan');
  assert.equal(n, 4);
});

test('nextRunNumberFromHarnessRuns: skips a malformed/foreign-shaped run_id rather than throwing', async () => {
  const rows = [{ run_id: 'gate-a-rescan-run-005' }, { run_id: 'not-a-real-run-id' }, { run_id: null }, {}];
  const n = await nextRunNumberFromHarnessRuns(fakeReadAllFn(rows), 'gate-a-rescan');
  assert.equal(n, 6);
});

test('nextRunNumberFromHarnessRuns: never matches a DIFFERENT family\'s run_id shape (the family is part of the regex, not just a filter hint)', async () => {
  // A fake that ignores the family filter entirely (worse than any real readAllFn) still can't produce a
  // wrong answer here, because the regex itself is anchored to the family name.
  const rows = [{ run_id: 'fetch-drain-run-099' }, { run_id: 'gate-a-rescan-run-002' }];
  const n = await nextRunNumberFromHarnessRuns(fakeReadAllFn(rows), 'gate-a-rescan');
  assert.equal(n, 3);
});

test('nextRunNumberFromHarnessRuns: three-digit rollover is handled by plain integer parsing, not string comparison', async () => {
  const rows = [{ run_id: 'gate-a-rescan-run-099' }, { run_id: 'gate-a-rescan-run-100' }];
  const n = await nextRunNumberFromHarnessRuns(fakeReadAllFn(rows), 'gate-a-rescan');
  assert.equal(n, 101);
});

test('formatRunId: zero-pads to 3 digits, matching CONVENTION.md\'s <family>-run-NNN shape', () => {
  assert.equal(formatRunId('gate-a-rescan', 1), 'gate-a-rescan-run-001');
  assert.equal(formatRunId('gate-a-rescan', 12), 'gate-a-rescan-run-012');
  assert.equal(formatRunId('gate-a-rescan', 101), 'gate-a-rescan-run-101');
});

test('formatRunId + nextRunNumberFromHarnessRuns compose to the exact next run_id', async () => {
  const rows = [{ run_id: 'source-sweep-run-021' }];
  const n = await nextRunNumberFromHarnessRuns(fakeReadAllFn(rows), 'source-sweep');
  assert.equal(formatRunId('source-sweep', n), 'source-sweep-run-022');
});

