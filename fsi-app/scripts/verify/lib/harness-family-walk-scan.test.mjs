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
  extractProducerRoster,
  summarizeProducerDispatchHistory,
  findNeverDispatchedIndividualProducers,
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

test('extractProducerRoster: KNOWN POSITIVE (real repo shape) -- picks up one PRODUCER_NAME per file, ' +
  'a duplicate name declared twice reports only its first file', () => {
  const corpus = [
    { file: 'scripts/producers/market/ecb-fx-producer.mjs', content: 'const PRODUCER_NAME = "ecb-fx";\nrest of file' },
    { file: 'scripts/producers/regional/bls-oews-producer.mjs', content: '// header\nconst PRODUCER_NAME = "bls-oews";' },
    { file: 'scripts/producers/lib/producer-summary.mjs', content: 'no producer name constant here' },
    { file: 'scripts/producers/market/dup-a.mjs', content: 'const PRODUCER_NAME = "dup";' },
    { file: 'scripts/producers/market/dup-b.mjs', content: 'const PRODUCER_NAME = "dup";' },
  ];
  const roster = extractProducerRoster(corpus);
  assert.deepEqual(
    roster.map((r) => r.producer).sort(),
    ['bls-oews', 'dup', 'ecb-fx'],
  );
  assert.equal(roster.find((r) => r.producer === 'dup').file, 'scripts/producers/market/dup-a.mjs');
});

test('summarizeProducerDispatchHistory: KNOWN POSITIVE (live-shape) -- zero producers-run-NNN.json ' +
  'artifacts means every producer is never-dispatched', () => {
  const s = summarizeProducerDispatchHistory('ecb-fx', []);
  assert.equal(s.everDispatched, false);
  assert.equal(s.runCount, 0);
});

test('summarizeProducerDispatchHistory: LABELLED NEGATIVE -- a producer whose name appears in a ' +
  'per_item[] entry of a real firing is dispatched, latest by started_at, records the outcome', () => {
  const artifacts = [
    {
      name: 'producers-run-001.json',
      parsed: {
        run_id: 'producers-run-001', started_at: '2026-09-01T00:00:00Z',
        per_item: [{ id: 'ecb-fx', outcome: 'clean' }, { id: 'bls-oews', outcome: 'clean' }],
      },
    },
    {
      name: 'producers-run-002.json',
      parsed: {
        run_id: 'producers-run-002', started_at: '2026-09-10T00:00:00Z',
        per_item: [{ id: 'ecb-fx', outcome: 'failed' }],
      },
    },
  ];
  const ecbFx = summarizeProducerDispatchHistory('ecb-fx', artifacts);
  assert.equal(ecbFx.everDispatched, true);
  assert.equal(ecbFx.runCount, 2);
  assert.equal(ecbFx.lastRunId, 'producers-run-002');
  assert.equal(ecbFx.lastOutcome, 'failed');

  // a producer NOT run in either firing (present in the roster, absent from every per_item[]) stays
  // never-dispatched even though the FAMILY itself clearly has dispatch history -- the exact distinction
  // the coordinator's ruling asked for (family-grain != per-producer-grain).
  const eiaV2 = summarizeProducerDispatchHistory('eia-v2-petroleum-spot', artifacts);
  assert.equal(eiaV2.everDispatched, false);
});

test('summarizeProducerDispatchHistory: an artifact with no per_item array (or a malformed one) is skipped, never throws', () => {
  const artifacts = [
    { name: 'producers-run-001.json', parsed: { run_id: 'producers-run-001' } }, // no per_item at all
    { name: 'producers-run-002.json', parsed: null }, // unparseable
  ];
  const s = summarizeProducerDispatchHistory('ecb-fx', artifacts);
  assert.equal(s.everDispatched, false);
});

test('findNeverDispatchedIndividualProducers: flags only producers with everDispatched=false', () => {
  const summaries = [
    { producer: 'ecb-fx', everDispatched: true },
    { producer: 'bls-oews', everDispatched: false },
    { producer: 'eia-v2-petroleum-spot', everDispatched: false },
  ];
  const got = findNeverDispatchedIndividualProducers(summaries).map((s) => s.producer);
  assert.deepEqual(got, ['bls-oews', 'eia-v2-petroleum-spot']);
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
