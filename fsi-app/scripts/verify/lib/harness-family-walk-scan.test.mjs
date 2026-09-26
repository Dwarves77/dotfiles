// Selftests for the harness-family schedule/dispatch-walker pure core (fixtures only, no fs, no DB).
// Calibrated on the audit's own known finding shape (PROD-2: most loop-hop families are "built-not-fired",
// i.e. zero dispatch history) plus a labelled negative (a family WITH dispatch history is not flagged).
// Run: node --test fsi-app/scripts/verify/lib/harness-family-walk-scan.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  runArtifactNames,
  summarizeFamilyDispatchHistory,
  findZeroDispatchProducers,
  staleHarnessWalkAllowlistEntries,
} from './harness-family-walk-scan.mjs';

test('runArtifactNames: matches only this family\'s own <family>-run-NNN.json entries', () => {
  const entries = [
    'family.json', 'FAMILY.md', 'pending', 'traces',
    'brief-export-run-001.json', 'brief-export-run-002.json',
    'other-family-run-001.json', // a stray entry from a different family must never match
  ];
  const names = runArtifactNames('brief-export', entries);
  assert.deepEqual(names, ['brief-export-run-001.json', 'brief-export-run-002.json']);
});

test('summarizeFamilyDispatchHistory: KNOWN POSITIVE (PROD-2 shape), zero artifacts means everDispatched=false', () => {
  const s = summarizeFamilyDispatchHistory('gate-a-rescan', []);
  assert.equal(s.everDispatched, false);
  assert.equal(s.runCount, 0);
  assert.equal(s.lastRunId, null);
});

test('summarizeFamilyDispatchHistory: LABELLED NEGATIVE, a family with artifacts is dispatched, picks the latest by started_at', () => {
  const artifacts = [
    { name: 'source-sweep-run-001.json', parsed: { run_id: 'source-sweep-run-001', started_at: '2026-09-01T00:00:00Z', trigger: 'manual' } },
    { name: 'source-sweep-run-002.json', parsed: { run_id: 'source-sweep-run-002', started_at: '2026-09-05T01:44:14Z', trigger: 'workflow_run' } },
  ];
  const s = summarizeFamilyDispatchHistory('source-sweep', artifacts);
  assert.equal(s.everDispatched, true);
  assert.equal(s.runCount, 2);
  assert.equal(s.lastRunId, 'source-sweep-run-002');
  assert.equal(s.lastTrigger, 'workflow_run');
});

test('summarizeFamilyDispatchHistory: an unparseable artifact counts as a parse failure, not a silent drop, and does not count as a run', () => {
  const artifacts = [{ name: 'x-run-001.json', parsed: null }];
  const s = summarizeFamilyDispatchHistory('x', artifacts);
  assert.equal(s.runCount, 0);
  assert.equal(s.parseFailures, 1);
  assert.equal(s.everDispatched, false);
});

test('summarizeFamilyDispatchHistory: a run missing started_at is still counted and does not crash "latest" selection', () => {
  const artifacts = [
    { name: 'x-run-001.json', parsed: { run_id: 'x-run-001' } },
    { name: 'x-run-002.json', parsed: { run_id: 'x-run-002', started_at: '2026-09-01T00:00:00Z' } },
  ];
  const s = summarizeFamilyDispatchHistory('x', artifacts);
  assert.equal(s.runCount, 2);
  assert.equal(s.everDispatched, true);
});

test('findZeroDispatchProducers: flags only the families with everDispatched=false', () => {
  const summaries = [
    { family: 'source-sweep', everDispatched: true },
    { family: 'gate-a-rescan', everDispatched: false },
    { family: 'brief-apply', everDispatched: false },
  ];
  const got = findZeroDispatchProducers(summaries).map((s) => s.family);
  assert.deepEqual(got, ['gate-a-rescan', 'brief-apply']);
});

test('staleHarnessWalkAllowlistEntries: flags an allowlisted family with no match, and one that now has dispatch history', () => {
  const summaries = [
    { family: 'gate-a-rescan', everDispatched: false },
    { family: 'brief-apply', everDispatched: true }, // now fired since the allowlist entry was written
  ];
  const stale = staleHarnessWalkAllowlistEntries({
    summaries,
    allowlist: { 'brief-apply': { reason: 'was zero-dispatch' }, 'retired-family': { reason: 'gone' } },
  });
  assert.deepEqual(stale.map((s) => s.family).sort(), ['brief-apply', 'retired-family']);
});

test('staleHarnessWalkAllowlistEntries: a still-zero-dispatch allowlisted family is not flagged as stale', () => {
  const summaries = [{ family: 'gate-a-rescan', everDispatched: false }];
  const stale = staleHarnessWalkAllowlistEntries({
    summaries,
    allowlist: { 'gate-a-rescan': { reason: 'still zero-dispatch, tracked under build order step 6' } },
  });
  assert.deepEqual(stale, []);
});
