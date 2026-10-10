// Selftests for record-harness-run.mjs's recordHarnessRun AND runCli (fixtures only, no real DB -- a
// fake `sb`/`readAllFn` stands in for the Supabase client, same pattern io-preflight.test.mjs uses for
// recordApplyRunStart; plan-quarantine-disposition.mjs/write-statutory.mjs use the identical readAllFn
// deps-injection shape for the same table).
//
// EXTENDED (lane HARNESS-RUN-NUMBER, 2026-09-29, coordinator finding from GitHub run 36610847827): the
// old claim-then-write path (scripts/lib/run-artifact.mjs's `claimRunId`, a local filesystem scan) went
// stale the moment PR #824 stopped committing harness-run artifacts back to the tree -- every family's
// landing now funnels through THIS module, so this module renumbers against harness_runs' own max at
// land time and fails loud (non-zero exit) on any real insert failure. New cases below: the collision/
// renumber case, the fail-loud case, and the no-cred self-skip case, per this module's own header.
// Run: node --test fsi-app/scripts/lib/record-harness-run.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { recordHarnessRun, runCli } from './record-harness-run.mjs';

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

// ── collision/renumber case (lane HARNESS-RUN-NUMBER, 2026-09-29) ─────────────────────────────────────
// A deps-injected `readAllFn` stands in for harness_runs -- no real DB, same shape
// plan-quarantine-disposition.mjs/write-statutory.mjs already inject for this exact table.

test('recordHarnessRun: renumbers against harness_runs\' own max+1 when the artifact\'s own run_id is stale, and lands under the derived number', async () => {
  const existingRows = [{ run_id: 'gate-a-rescan-run-012' }, { run_id: 'gate-a-rescan-run-013' }];
  const readAllFn = async (table) => {
    assert.equal(table, 'harness_runs');
    return existingRows;
  };
  const sb = fakeSb();
  const logs = [];
  const staleArtifact = { ...SAMPLE_ARTIFACT, run_id: 'gate-a-rescan-run-005' };
  const outcome = await recordHarnessRun(sb, staleArtifact, { log: (m) => logs.push(m), readAllFn });
  assert.equal(outcome.ok, true);
  assert.equal(outcome.run_id, 'gate-a-rescan-run-014');
  assert.equal(outcome.renumbered, true);
  assert.equal(sb.calls[0].row.run_id, 'gate-a-rescan-run-014');
  assert.ok(logs.some((l) => l.includes('renumbering gate-a-rescan-run-005 -> gate-a-rescan-run-014')));
});

test('recordHarnessRun: an artifact already carrying the correct next number is landed unchanged (renumbered: false)', async () => {
  const readAllFn = async () => [{ run_id: 'gate-a-rescan-run-011' }];
  const sb = fakeSb();
  const outcome = await recordHarnessRun(sb, SAMPLE_ARTIFACT, { log: () => {}, readAllFn }); // SAMPLE_ARTIFACT is -run-012
  assert.equal(outcome.ok, true);
  assert.equal(outcome.run_id, 'gate-a-rescan-run-012');
  assert.equal(outcome.renumbered, false);
});

test('recordHarnessRun: a duplicate-key collision on the DB-derived number re-derives and retries, then lands', async () => {
  let readCalls = 0;
  const readAllFn = async () => {
    readCalls += 1;
    return readCalls === 1 ? [{ run_id: 'gate-a-rescan-run-012' }] : [{ run_id: 'gate-a-rescan-run-013' }];
  };
  let insertCalls = 0;
  const sb = {
    calls: [],
    from(table) {
      return {
        async insert(row) {
          sb.calls.push({ table, row });
          insertCalls += 1;
          if (insertCalls === 1) return { error: { message: 'duplicate key value violates unique constraint "harness_runs_pkey"' } };
          return { error: null };
        },
      };
    },
  };
  const logs = [];
  const outcome = await recordHarnessRun(sb, SAMPLE_ARTIFACT, { log: (m) => logs.push(m), readAllFn });
  assert.equal(outcome.ok, true);
  assert.equal(outcome.run_id, 'gate-a-rescan-run-014');
  assert.equal(sb.calls.length, 2, 'one collision, one retry');
  assert.ok(logs.some((l) => l.includes('insert collided on gate-a-rescan-run-013')));
});

// ── fail-loud case: a real (non-collision) insert failure is never retried and is reported as ok:false ──

test('recordHarnessRun: a non-collision insert error against a DB-derived number is reported once, never retried', async () => {
  const readAllFn = async () => [{ run_id: 'gate-a-rescan-run-012' }];
  const sb = fakeSb({ error: { message: 'permission denied for table harness_runs' } });
  const logs = [];
  const outcome = await recordHarnessRun(sb, SAMPLE_ARTIFACT, { log: (m) => logs.push(m), readAllFn });
  assert.equal(outcome.ok, false);
  assert.match(outcome.error, /permission denied/);
  assert.equal(sb.calls.length, 1, 'no retry for a non-collision error');
});

// ── runCli: the exit-code contract (rule 15: fail loud, self-skip only for a missing credential) ───────
// Deps-injected -- never spawns a process, never touches @supabase/supabase-js, so this stays inside the
// no-npm discipline glob (fsi-app/.discipline/run-test-suite.sh) with no separate wiring needed.

test('runCli: no --file is a usage error -- exit 1, never the old best-effort exit 0', async () => {
  const errors = [];
  const code = await runCli([], { errorLog: (m) => errors.push(m) });
  assert.equal(code, 1);
  assert.ok(errors.some((m) => m.includes('--file <path-to-artifact.json> is required')));
});

test('runCli: an unreadable/unparseable artifact file is a real failure -- exit 1', async () => {
  const errors = [];
  const code = await runCli(['--file', 'nope.json'], {
    errorLog: (m) => errors.push(m),
    readFileFn: () => { throw new Error('ENOENT: no such file'); },
    envUrl: 'https://example.supabase.co',
    envKey: 'service-role-key',
  });
  assert.equal(code, 1);
  assert.ok(errors.some((m) => m.includes('could not read/parse nope.json')));
});

test('runCli: missing credentials outside GitHub Actions is a self-skip -- exit 2, not a failure (rule 15)', async () => {
  const errors = [];
  const code = await runCli(['--file', 'x.json'], {
    errorLog: (m) => errors.push(m),
    readFileFn: () => JSON.stringify(SAMPLE_ARTIFACT),
    envUrl: undefined,
    envKey: undefined,
    isGitHubActions: false, // forced: this test must not flip when it happens to run under real CI
  });
  assert.equal(code, 2);
  assert.ok(errors.some((m) => m.includes('self-skip')));
});

// ── CI no-cred fail-loud (lane RW-WF, 2026-10-03): the research-walker.yml defect, closed at the module
// so no future caller can reproduce it by forgetting job-level secrets wiring ────────────────────────

test('runCli: missing credentials IN GitHub Actions is a FAILURE -- exit 1, never silently self-skipped', async () => {
  const errors = [];
  const code = await runCli(['--file', 'x.json'], {
    errorLog: (m) => errors.push(m),
    readFileFn: () => JSON.stringify(SAMPLE_ARTIFACT),
    envUrl: undefined,
    envKey: undefined,
    isGitHubActions: true,
  });
  assert.equal(code, 1);
  assert.ok(errors.some((m) => m.includes('GitHub Actions') && m.includes('FAILURE')));
  assert.ok(!errors.some((m) => m.includes('diagnosable, never a false red'))); // the local-only self-skip marker never fires here
});

test('runCli: isGitHubActions defaults to reading process.env.GITHUB_ACTIONS, not hardcoded', async () => {
  const prior = process.env.GITHUB_ACTIONS;
  try {
    process.env.GITHUB_ACTIONS = 'true';
    const errors = [];
    const code = await runCli(['--file', 'x.json'], {
      errorLog: (m) => errors.push(m),
      readFileFn: () => JSON.stringify(SAMPLE_ARTIFACT),
      envUrl: undefined,
      envKey: undefined,
      // isGitHubActions deliberately NOT passed -- proving the real default reads process.env
    });
    assert.equal(code, 1);
  } finally {
    if (prior === undefined) delete process.env.GITHUB_ACTIONS;
    else process.env.GITHUB_ACTIONS = prior;
  }
});

test('runCli: a real insert failure (credentials present, insert rejected) is fail-loud -- exit 1', async () => {
  const errors = [];
  const logs = [];
  const code = await runCli(['--file', 'x.json'], {
    log: (m) => logs.push(m),
    errorLog: (m) => errors.push(m),
    readFileFn: () => JSON.stringify(SAMPLE_ARTIFACT),
    envUrl: 'https://example.supabase.co',
    envKey: 'service-role-key',
    createClientFn: () => fakeSb({ error: { message: 'relation "harness_runs" does not exist' } }),
  });
  assert.equal(code, 1);
  assert.ok(errors.some((m) => m.includes('relation "harness_runs" does not exist')));
});

test('runCli: a real landed row exits 0 (the artifact file is real, so it is reconciled with the landed id)', () =>
  withDir(async (dir) => {
    const file = join(dir, 'gate-a-rescan-run-012.json');
    writeFileSync(file, JSON.stringify(SAMPLE_ARTIFACT));
    const code = await runCli(['--file', file], {
      log: () => {},
      errorLog: () => {},
      envUrl: 'https://example.supabase.co',
      envKey: 'service-role-key',
      createClientFn: () => fakeSb(),
    });
    assert.equal(code, 0);
    assert.ok(existsSync(file), 'the id did not change (no readAll rows are reachable through the fake), so the file stays');
  }));

// ── HARNESS-1 (2026-10-10): the ledger id and the artifact file name are ONE value ─────────────────────
// [CONFIRMED] A local `node scripts/turns/dry-run-structured-actions.mjs` wrote structured-actions-run-003.json
// (claimRunId: the directory's own max+1) while the recorder stored `structured-actions-run-001` with
// renumbered: true (harness_runs' own max+1), so the artifact could not be found from the ledger row. The
// recorder now owns the reconciliation: given the artifact's path, it makes the file carry the id it landed.

const SA = 'structured-actions';
const saArtifact = (n) => ({ ...SAMPLE_ARTIFACT, harness_family: SA, run_id: `${SA}-run-${String(n).padStart(3, '0')}` });
const saPath = (dir, n) => join(dir, `${SA}-run-${String(n).padStart(3, '0')}.json`);

function withDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'rhr-'));
  return Promise.resolve(fn(dir)).finally(() => rmSync(dir, { recursive: true, force: true }));
}

test('recordHarnessRun + artifactPath: a pre-existing run-002 file plus a new run (local claim 003, ledger empty) yields MATCHING id and filename', () =>
  withDir(async (dir) => {
    writeFileSync(saPath(dir, 2), JSON.stringify(saArtifact(2)));
    writeFileSync(saPath(dir, 3), JSON.stringify(saArtifact(3)));
    const sb = fakeSb();
    const outcome = await recordHarnessRun(sb, saArtifact(3), { log: () => {}, readAllFn: async () => [], artifactPath: saPath(dir, 3) });
    assert.equal(outcome.ok, true);
    assert.equal(outcome.run_id, `${SA}-run-001`);
    assert.equal(sb.calls[0].row.run_id, `${SA}-run-001`);
    assert.equal(outcome.artifact_path, saPath(dir, 1));
    assert.ok(existsSync(saPath(dir, 1)), 'the artifact file is named after the ledger id');
    assert.equal(existsSync(saPath(dir, 3)), false, 'the stale-numbered file is gone, not duplicated');
    assert.equal(JSON.parse(readFileSync(saPath(dir, 1), 'utf8')).run_id, `${SA}-run-001`, 'the file content carries the ledger id');
    assert.equal(readFileSync(saPath(dir, 2), 'utf8'), JSON.stringify(saArtifact(2)), 'an unrelated artifact is untouched');
  }));

test('recordHarnessRun + artifactPath: a ledger number whose filename is already held by ANOTHER artifact is skipped, never clobbered (id still equals filename)', () =>
  withDir(async (dir) => {
    for (const n of [1, 2]) writeFileSync(saPath(dir, n), JSON.stringify({ ...saArtifact(n), marker: `historical-${n}` }));
    writeFileSync(saPath(dir, 3), JSON.stringify(saArtifact(3)));
    const sb = fakeSb();
    const outcome = await recordHarnessRun(sb, saArtifact(3), { log: () => {}, readAllFn: async () => [], artifactPath: saPath(dir, 3) });
    assert.equal(outcome.ok, true);
    assert.equal(outcome.run_id, `${SA}-run-003`, 'ledger empty would say 001, but 001 and 002 are held by other artifacts');
    assert.equal(sb.calls[0].row.run_id, `${SA}-run-003`);
    assert.equal(JSON.parse(readFileSync(saPath(dir, 1), 'utf8')).marker, 'historical-1');
    assert.equal(JSON.parse(readFileSync(saPath(dir, 2), 'utf8')).marker, 'historical-2');
    assert.deepEqual(readdirSync(dir).sort(), [1, 2, 3].map((n) => `${SA}-run-00${n}.json`));
  }));

test('recordHarnessRun + artifactPath: ledger ahead of the directory renames UP and the file follows', () =>
  withDir(async (dir) => {
    writeFileSync(saPath(dir, 1), JSON.stringify(saArtifact(1)));
    const sb = fakeSb();
    const outcome = await recordHarnessRun(sb, saArtifact(1), {
      log: () => {}, artifactPath: saPath(dir, 1),
      readAllFn: async () => [{ run_id: `${SA}-run-004` }, { run_id: `${SA}-run-005` }],
    });
    assert.equal(outcome.run_id, `${SA}-run-006`);
    assert.deepEqual(readdirSync(dir), [`${SA}-run-006.json`]);
    assert.equal(JSON.parse(readFileSync(saPath(dir, 6), 'utf8')).run_id, `${SA}-run-006`);
  }));

test('recordHarnessRun + artifactPath: a failed insert leaves the file exactly as written (nothing landed, nothing renamed)', () =>
  withDir(async (dir) => {
    writeFileSync(saPath(dir, 3), JSON.stringify(saArtifact(3)));
    const sb = fakeSb({ error: { message: 'connection refused' } });
    const outcome = await recordHarnessRun(sb, saArtifact(3), { log: () => {}, readAllFn: async () => [], artifactPath: saPath(dir, 3) });
    assert.equal(outcome.ok, false);
    assert.deepEqual(readdirSync(dir), [`${SA}-run-003.json`]);
  }));

test('recordHarnessRun + artifactPath: a landed row whose file cannot be reconciled is reported (artifact_error), never silent', () =>
  withDir(async (dir) => {
    const sb = fakeSb();
    const outcome = await recordHarnessRun(sb, saArtifact(3), { log: () => {}, readAllFn: async () => [], artifactPath: saPath(dir, 3) }); // file does not exist
    assert.equal(outcome.ok, true);
    assert.match(outcome.artifact_error, /artifact/i);
  }));

test('runCli: --file is the artifact path, so a renumbered landing renames that file to the ledger id and exits 0', () =>
  withDir(async (dir) => {
    writeFileSync(saPath(dir, 3), JSON.stringify(saArtifact(3)));
    const code = await runCli(['--file', saPath(dir, 3)], {
      log: () => {}, errorLog: () => {}, envUrl: 'https://example.supabase.co', envKey: 'k',
      createClientFn: () => Object.assign(fakeSb(), {
        // the default reader selects from harness_runs; an empty table is enough to make the ledger id 001
        from(table) {
          return {
            select() { const q = { order() { return q; }, eq() { return q; }, then(r) { r({ data: [], error: null }); } }; return q; },
            async insert() { return { error: null }; },
          };
        },
      }),
    });
    assert.equal(code, 0);
    assert.deepEqual(readdirSync(dir), [`${SA}-run-001.json`]);
  }));
