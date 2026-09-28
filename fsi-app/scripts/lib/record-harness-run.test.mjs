// Selftests for record-harness-run.mjs's recordHarnessRun (fixtures only, no real DB -- a fake `sb`
// stands in for the Supabase client, same pattern io-preflight.test.mjs uses for recordApplyRunStart).
// Run: node --test fsi-app/scripts/lib/record-harness-run.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordHarnessRun } from './record-harness-run.mjs';

const SAMPLE_ARTIFACT = {
  harness_family: 'gate-a-rescan',
  harness_version: 'sha256:deadbeef',
  run_id: 'gate-a-rescan-run-012',
  started_at: '2026-09-27T00:00:00Z',
  trigger: 'workflow_dispatch',
  config: { mode: 'dry', github_run_id: '99999' },
  inputs_ref: [],
  per_item: [{ id: 'x', outcome: 'checked', error: null }],
  metrics: { checked: 1 },
  defects_found: [],
  full_trace_refs: ['scripts/harness-runs/gate-a-rescan/traces/x.json'],
};

function fakeSb({ error = null } = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      return {
        async insert(row) {
          calls.push({ table, row });
          return { error };
        },
      };
    },
  };
}

test('recordHarnessRun: happy path inserts one row into harness_runs with every mapped field, github_run_id pulled from config', async () => {
  const sb = fakeSb();
  const logs = [];
  const outcome = await recordHarnessRun(sb, SAMPLE_ARTIFACT, { log: (m) => logs.push(m) });
  assert.equal(outcome.ok, true);
  assert.equal(outcome.run_id, 'gate-a-rescan-run-012');
  assert.equal(sb.calls.length, 1);
  assert.equal(sb.calls[0].table, 'harness_runs');
  assert.equal(sb.calls[0].row.run_id, 'gate-a-rescan-run-012');
  assert.equal(sb.calls[0].row.harness_family, 'gate-a-rescan');
  assert.equal(sb.calls[0].row.github_run_id, '99999');
  assert.deepEqual(sb.calls[0].row.per_item, SAMPLE_ARTIFACT.per_item);
  assert.ok(logs.some((l) => l.includes('landed gate-a-rescan-run-012')));
});

test('recordHarnessRun: best-effort on an insert error -- returns {ok:false}, logs, never throws', async () => {
  const sb = fakeSb({ error: { message: 'duplicate key value violates unique constraint' } });
  const logs = [];
  const outcome = await recordHarnessRun(sb, SAMPLE_ARTIFACT, { log: (m) => logs.push(m) });
  assert.equal(outcome.ok, false);
  assert.match(outcome.error, /duplicate key/);
  assert.ok(logs.some((l) => l.includes('insert failed')));
});

test('recordHarnessRun: best-effort when the client itself throws (e.g. network error) -- caught, never propagates', async () => {
  const sb = { from() { throw new Error('ECONNRESET'); } };
  const logs = [];
  const outcome = await recordHarnessRun(sb, SAMPLE_ARTIFACT, { log: (m) => logs.push(m) });
  assert.equal(outcome.ok, false);
  assert.match(outcome.error, /ECONNRESET/);
});

test('recordHarnessRun: missing optional fields default to null/empty rather than throwing', async () => {
  const sb = fakeSb();
  const minimal = { harness_family: 'meta-harness', run_id: 'meta-harness-run-001', started_at: '2026-09-27T00:00:00Z' };
  const outcome = await recordHarnessRun(sb, minimal, { log: () => {} });
  assert.equal(outcome.ok, true);
  const row = sb.calls[0].row;
  assert.equal(row.harness_version, null);
  assert.equal(row.github_run_id, null);
  assert.deepEqual(row.per_item, []);
  assert.deepEqual(row.config, {});
});
