// Unit tests for the guarded source-registration helpers (db.mjs). Proves the load-bearing ORDER
// guarantee of reclassifyToSource WITHOUT a DB: it REGISTERS + read-back-verifies the source ACTIVE
// BEFORE it archives the item, and THROWS (never archives) if registration is not confirmed. This is
// what makes the source-registration invariant real rather than honor-system. Run:
//   node --test fsi-app/scripts/lib/db.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DISCIPLINE_SNAP_DIR = join(tmpdir(), 'db-test-snapshots'); // redirect prior-value snapshots
const { reclassifyToSource, registerSource, readAll, guardedDelete, guardedUpdateByIds, readClient, institutionKey, archivePatch, __setWriteClientForTest, withTransientRetry } = await import('./db.mjs');

// GOLDEN (operator ruling 2026-07-13, Part A root-cause): archiving an intelligence_item resets its
// provenance_status off 'verified' (the stale-verified cache class — 168 archived rows read 'verified'
// while the live validator quarantines them). RED before the fix (patch had only is_archived + reason);
// GREEN now (intelligence_items archive patch carries provenance_status:'unverified'). Other tables are
// untouched (only intelligence_items has provenance_status).
test('archivePatch resets provenance_status off verified for intelligence_items only', () => {
  const item = archivePatch('intelligence_items', 'reclassified_to_source');
  assert.equal(item.is_archived, true);
  assert.equal(item.archive_reason, 'reclassified_to_source');
  assert.equal(item.provenance_status, 'unverified'); // the reset — a verified row cannot survive archive
  const src = archivePatch('sources', 'source_not_item');
  assert.equal(src.is_archived, true);
  assert.equal(src.provenance_status, undefined); // sources carry no provenance_status — no spurious column
});

// Minimal chainable Supabase mock. handler({table, verb, ops}) -> { data, error }. Records calls.
function makeClient(handler, calls) {
  function from(table) {
    const state = { table, verb: 'select', ops: [] };
    const settle = () => { calls.push({ table: state.table, verb: state.verb, ops: state.ops.slice() }); return Promise.resolve(handler(state)); };
    const b = {
      select(c) { if (state.verb !== 'insert' && state.verb !== 'update' && state.verb !== 'delete') state.verb = 'select'; state.ops.push(['select', c]); return b; },
      insert(r) { state.verb = 'insert'; state.ops.push(['insert', r]); return b; },
      update(p) { state.verb = 'update'; state.ops.push(['update', p]); return b; },
      delete() { state.verb = 'delete'; state.ops.push(['delete']); return b; },
      eq(c, v) { state.ops.push(['eq', c, v]); return b; },
      in(c, v) { state.ops.push(['in', c, v]); return b; },
      order(c) { state.ops.push(['order', c]); return b; },
      range(a, z) { state.ops.push(['range', a, z]); return settle(); },
      limit() { return settle(); },
      single() { return settle(); },
      then(res, rej) { return settle().then(res, rej); },
    };
    return b;
  }
  return { from };
}

const cite = { skill: 'source-credibility-model', reason: 'test' };

test('reclassifyToSource: REGISTERS before it ARCHIVES (order guarantee)', async () => {
  const calls = [];
  __setWriteClientForTest(() => makeClient((s) => {
    if (s.table === 'sources' && s.verb === 'select') {
      // first call = list (no existing); later eq-verify = active
      if (s.ops.some((o) => o[0] === 'eq')) return { data: { id: 's1', status: 'active' }, error: null };
      return { data: [], error: null };
    }
    if (s.table === 'sources' && s.verb === 'insert') return { data: { id: 's1' }, error: null };
    if (s.table === 'intelligence_items' && s.verb === 'select') return { data: [{ id: 'i1' }], error: null };
    if (s.table === 'intelligence_items' && s.verb === 'update') return { data: [{ id: 'i1', is_archived: true }], error: null };
    return { data: null, error: null };
  }, calls));

  const r = await reclassifyToSource(['i1'], { url: 'https://eia.gov/data', name: 'EIA', base_tier: 3 }, { cite });
  assert.equal(r.archived, 1);

  const insertIdx = calls.findIndex((c) => c.table === 'sources' && c.verb === 'insert');
  const archiveIdx = calls.findIndex((c) => c.table === 'intelligence_items' && c.verb === 'update');
  assert.ok(insertIdx >= 0, 'source must be inserted');
  assert.ok(archiveIdx >= 0, 'item must be archived');
  assert.ok(insertIdx < archiveIdx, `register (idx ${insertIdx}) must precede archive (idx ${archiveIdx})`);
});

test('reclassifyToSource: THROWS and NEVER archives when registration is not confirmed active', async () => {
  const calls = [];
  __setWriteClientForTest(() => makeClient((s) => {
    if (s.table === 'sources' && s.verb === 'select') {
      if (s.ops.some((o) => o[0] === 'eq')) return { data: { id: 's1', status: 'provisional' }, error: null }; // NOT active
      return { data: [], error: null };
    }
    if (s.table === 'sources' && s.verb === 'insert') return { data: { id: 's1' }, error: null };
    return { data: null, error: null };
  }, calls));

  await assert.rejects(
    () => reclassifyToSource(['i1'], { url: 'https://eia.gov/data' }, { cite }),
    /not confirmed active/,
  );
  assert.ok(!calls.some((c) => c.table === 'intelligence_items' && c.verb === 'update'),
    'item must NOT be archived when the source is not confirmed active');
});

test('registerSource: idempotent — existing active host is reused, no insert', async () => {
  const calls = [];
  __setWriteClientForTest(() => makeClient((s) => {
    if (s.table === 'sources' && s.verb === 'select') return { data: [{ id: 's9', url: 'https://www.eia.gov/', status: 'active' }], error: null };
    return { data: null, error: null };
  }, calls));

  const r = await registerSource({ url: 'https://eia.gov/natural-gas' }, { cite });
  assert.equal(r.created, false);
  assert.equal(r.source_id, 's9');
  assert.ok(!calls.some((c) => c.verb === 'insert'), 'must not insert when host already registered');
});

test('reclassifyToSource: refuses without a cite (guard intact)', async () => {
  __setWriteClientForTest(() => makeClient(() => ({ data: null, error: null }), []));
  await assert.rejects(() => reclassifyToSource(['i1'], { url: 'https://x.gov' }, {}), /requires \{ cite/);
});

test('readAll: pages PAST the 1000-row cap (the bug that created 27 dup sources)', async () => {
  __setWriteClientForTest(() => makeClient((s) => {
    const rg = s.ops.find((o) => o[0] === 'range');
    const from = rg ? rg[1] : 0;
    if (from === 0) return { data: Array.from({ length: 1000 }, (_, i) => ({ id: 'a' + i })), error: null };
    if (from === 1000) return { data: Array.from({ length: 146 }, (_, i) => ({ id: 'b' + i })), error: null };
    return { data: [], error: null };
  }, []));
  const rows = await readAll('sources', 'id');
  assert.equal(rows.length, 1146, 'readAll must return ALL rows across pages, not the 1000-row cap');
});

test('guardedDelete: snapshots then deletes by id; requires cite; sources delete-protected', async () => {
  const calls = [];
  __setWriteClientForTest(() => makeClient((s) => {
    if (s.verb === 'select') return { data: [{ id: 'd1', url: 'https://x' }], error: null };
    if (s.verb === 'delete') return { data: [{ id: 'd1' }], error: null };
    return { data: null, error: null };
  }, calls));
  // delete works on a NON-protected table
  const r = await guardedDelete('intelligence_items', ['d1'], { cite: { skill: 'remediation-discipline', reason: 'test' } });
  assert.equal(r.deleted, 1);
  assert.ok(calls.some((c) => c.verb === 'select'), 'must snapshot (select) before delete');
  assert.ok(calls.some((c) => c.verb === 'delete'), 'must delete');
  // cite still required
  await assert.rejects(() => guardedDelete('intelligence_items', ['d1'], {}), /requires \{ cite/);
  // SOURCES are delete-protected (suspend-not-delete) even WITH a valid cite
  await assert.rejects(
    () => guardedDelete('sources', ['d1'], { cite: { skill: 'remediation-discipline', reason: 'test' } }),
    /delete-protected/,
    'sources must never be hard-deletable via guardedDelete'
  );
});

test('guardedUpdateByIds: chunks the id list (run #6 statement timeout), snapshots per chunk, re-applies applyMatch on every chunk', async () => {
  const calls = [];
  const ids = Array.from({ length: 60 }, (_, i) => `id-${String(i).padStart(3, '0')}`);
  __setWriteClientForTest(() => makeClient((s) => {
    const inOp = s.ops.find((o) => o[0] === 'in');
    const rows = inOp[2].map((id) => ({ id, archive_reason: s.verb === 'update' ? 'x' : null }));
    return { data: rows, error: null };
  }, calls));
  const res = await guardedUpdateByIds('intelligence_items', ids, { archive_reason: 'x' }, {
    cite, select: 'id, archive_reason', chunk: 25, applyMatch: (qb) => qb.eq('is_archived', true),
  });
  const updates = calls.filter((c) => c.verb === 'update');
  assert.equal(updates.length, 3);
  assert.deepEqual(updates.map((u) => u.ops.find((o) => o[0] === 'in')[2].length), [25, 25, 10]);
  assert.ok(updates.every((u) => u.ops.some((o) => o[0] === 'eq' && o[1] === 'is_archived')), 'applyMatch re-applied per chunk');
  assert.equal(res.updated, 60);
  assert.equal(res.chunks, 3);
  assert.equal(res.snapshots.length, 3);
  assert.equal(calls.filter((c) => c.verb === 'select').length, 3, 'one snapshot read per chunk');
  await assert.rejects(() => guardedUpdateByIds('intelligence_items', ids, { a: 1 }, {}), /cite/i);
});

test('guardedUpdateByIds: a chunk cancelled by the API statement timeout is halved and retried down to single rows (run #7)', async () => {
  const calls = [];
  const ids = Array.from({ length: 10 }, (_, i) => `id-${i}`);
  // the API "times out" any update carrying more than 3 ids; a non-timeout error propagates unchanged
  __setWriteClientForTest(() => makeClient((s) => {
    const inOp = s.ops.find((o) => o[0] === 'in');
    if (s.verb === 'update' && inOp[2].length > 3) return { data: null, error: { message: 'canceling statement due to statement timeout' } };
    return { data: inOp[2].map((id) => ({ id })), error: null };
  }, calls));
  const res = await guardedUpdateByIds('intelligence_items', ids, { archive_reason: 'x' }, { cite, chunk: 10 });
  const updates = calls.filter((c) => c.verb === 'update').map((u) => u.ops.find((o) => o[0] === 'in')[2].length);
  assert.deepEqual(updates, [10, 5, 3, 2, 5, 3, 2]);
  assert.equal(res.updated, 10);
  assert.equal(res.halvings, 3);
  assert.equal(res.chunks, 4);
  __setWriteClientForTest(() => makeClient(() => ({ data: null, error: { message: 'permission denied for table' } }), []));
  await assert.rejects(() => guardedUpdateByIds('intelligence_items', ids, { a: 1 }, { cite }), /permission denied/);
  __setWriteClientForTest(() => makeClient(() => ({ data: null, error: { message: 'canceling statement due to statement timeout' } }), []));
  await assert.rejects(() => guardedUpdateByIds('intelligence_items', ['one'], { a: 1 }, { cite }), /statement timeout/);
});

test('institutionKey: shared-portal hosts key by path prefix; other hosts by bare host', () => {
  // non-portal host -> bare host (backward-compatible for the majority)
  assert.equal(institutionKey('https://eur-lex.europa.eu/eli/reg/2024/1257/oj'), 'eur-lex.europa.eu');
  // shared portal depth 1: DISTINCT ministries must NOT share a key
  assert.equal(institutionKey('https://gob.mx/semarnat'), 'gob.mx/semarnat');
  assert.equal(institutionKey('https://gob.mx/economia/normalizacion'), 'gob.mx/economia');
  assert.notEqual(institutionKey('https://gob.mx/semarnat'), institutionKey('https://gob.mx/economia'));
  // SAME institution, deeper path -> SAME key (reuse, not duplicate)
  assert.equal(institutionKey('https://gob.mx/semarnat/acciones-y-programas'), 'gob.mx/semarnat');
  // depth 2 (/web/<agency>) and depth 3 (slovenian ministries)
  assert.equal(institutionKey('https://www.gov.pl/web/gios'), 'gov.pl/web/gios');
  assert.notEqual(institutionKey('https://gov.pl/web/gios'), institutionKey('https://gov.pl/web/klimat'));
  assert.equal(
    institutionKey('https://gov.si/drzavni-organi/ministrstva/ministrstvo-za-okolje-podnebje-in-energijo'),
    'gov.si/drzavni-organi/ministrstva/ministrstvo-za-okolje-podnebje-in-energijo'
  );
  assert.notEqual(
    institutionKey('https://gov.si/drzavni-organi/ministrstva/ministrstvo-za-okolje-podnebje-in-energijo'),
    institutionKey('https://gov.si/drzavni-organi/ministrstva/ministrstvo-za-finance')
  );
  // SI != SK: different jurisdictions, different hosts -> never adjacent
  assert.notEqual(institutionKey('https://gov.si/x'), institutionKey('https://minzp.sk/x'));
});

test('registerSource: shared-portal ministries do NOT collapse; same institution reuses (re-group regression)', async () => {
  // registry already holds gob.mx/semarnat; a DIFFERENT ministry on the same portal host must create a
  // NEW row, not dedup into semarnat (the host-keyed collapse this guards).
  __setWriteClientForTest(() => makeClient((s) => {
    if (s.verb === 'select') return { data: [{ id: 'sem', url: 'https://gob.mx/semarnat', status: 'active' }], error: null };
    if (s.verb === 'insert') return { data: { id: 'eco' }, error: null };
    return { data: null, error: null };
  }, []));
  const rNew = await registerSource(
    { url: 'https://gob.mx/economia/normalizacion', name: 'Economia', base_tier: 2 },
    { cite: { skill: 'source-credibility-model', reason: 'test' } }
  );
  assert.equal(rNew.created, true, 'a different ministry on the same portal host must register a NEW source');

  // the SAME institution (deeper path) must REUSE the existing row, not duplicate
  __setWriteClientForTest(() => makeClient((s) => {
    if (s.verb === 'select') return { data: [{ id: 'sem', url: 'https://gob.mx/semarnat', status: 'active' }], error: null };
    return { data: null, error: null };
  }, []));
  const rReuse = await registerSource(
    { url: 'https://gob.mx/semarnat/programas', name: 'SEMARNAT', base_tier: 2 },
    { cite: { skill: 'source-credibility-model', reason: 'test' } }
  );
  assert.equal(rReuse.created, false, 'same institution (deeper path) must reuse the existing source');
  assert.equal(rReuse.source_id, 'sem');
});

// ---------------------------------------------------------------------------
// readClient() hardening (g3): the read client refuses writes (rule-015 bypass closed),
// while every select/read caller still works.
// ---------------------------------------------------------------------------

test('readClient: SELECT still works (readAll pages, filters chain)', async () => {
  __setWriteClientForTest(() => makeClient((s) => {
    if (s.verb === 'select') return { data: [{ id: 'x1' }], error: null };
    return { data: null, error: null };
  }, []));
  const sb = readClient();
  const res = await sb.from('sources').select('id').eq('status', 'active').limit(1);
  assert.deepEqual(res.data, [{ id: 'x1' }], 'a select through readClient must return data unchanged');
});

test('readClient: .insert / .update / .delete / .upsert THROW with a guarded-path message', async () => {
  __setWriteClientForTest(() => makeClient(() => ({ data: null, error: null }), []));
  const sb = readClient();
  for (const m of ['insert', 'update', 'delete', 'upsert']) {
    assert.throws(
      () => sb.from('intelligence_items')[m]({ x: 1 }),
      /READ-ONLY|guarded/,
      `readClient().from(t).${m}() must throw (rule-015 bypass)`,
    );
  }
});

test('readClient: does NOT mutate when a write is attempted (throw happens before any settle)', async () => {
  const calls = [];
  __setWriteClientForTest(() => makeClient((s) => { calls.push(s.verb); return { data: null, error: null }; }, []));
  const sb = readClient();
  assert.throws(() => sb.from('sources').update({ status: 'active' }));
  assert.ok(!calls.includes('update'), 'no update verb should reach the client — the proxy throws first');
});

// ---------------------------------------------------------------------------
// withTransientRetry: retry logic for transient network failures
// ---------------------------------------------------------------------------

test('withTransientRetry: succeeds on first try', async () => {
  let calls = 0;
  const result = await withTransientRetry(async () => {
    calls += 1;
    return 'success';
  }, { label: 'test-immediate' });
  assert.equal(result, 'success');
  assert.equal(calls, 1);
});

test('withTransientRetry: retries once on fetch failed, then succeeds', async () => {
  let calls = 0;
  const stderrLines = [];
  const origWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (line) => { stderrLines.push(String(line)); return true; };
  try {
    const result = await withTransientRetry(async () => {
      calls += 1;
      if (calls === 1) throw new TypeError('fetch failed');
      return 'success';
    }, { label: 'test-retry-once', attempts: 3, delaysMs: [1] });
    assert.equal(result, 'success');
    assert.equal(calls, 2);
    assert.ok(stderrLines.some((l) => l.includes('test-retry-once')), 'must log retry to stderr');
    assert.ok(stderrLines.some((l) => l.includes('attempt 1/3')), 'must log attempt number');
  } finally {
    process.stderr.write = origWrite;
  }
});

test('withTransientRetry: retries on transient errors (ECONNRESET, ETIMEDOUT, EAI_AGAIN, socket hang up, ECONNREFUSED, UND_ERR)', async () => {
  const transientErrors = [
    new Error('ECONNRESET'),
    new Error('ETIMEDOUT'),
    new Error('EAI_AGAIN'),
    new Error('socket hang up'),
    new Error('ECONNREFUSED'),
    new Error('UND_ERR_SOCKET'),
  ];
  for (const errTemplate of transientErrors) {
    let calls = 0;
    const result = await withTransientRetry(async () => {
      calls += 1;
      if (calls === 1) throw errTemplate;
      return 'ok';
    }, { label: `test-${errTemplate.message}`, attempts: 2, delaysMs: [1] });
    assert.equal(result, 'ok', `must retry on ${errTemplate.message}`);
    assert.equal(calls, 2);
  }
});

test('withTransientRetry: does NOT retry on PostgREST error (has .error.message)', async () => {
  let calls = 0;
  const postgrestErr = new Error('outer');
  postgrestErr.error = { message: 'permission denied' };

  await assert.rejects(
    () => withTransientRetry(async () => {
      calls += 1;
      throw postgrestErr;
    }, { label: 'test-postgrest', attempts: 3, delaysMs: [1] }),
    /permission denied/
  );
  assert.equal(calls, 1, 'must not retry PostgREST errors');
});

test('withTransientRetry: does NOT retry on regular application errors', async () => {
  let calls = 0;
  await assert.rejects(
    () => withTransientRetry(async () => {
      calls += 1;
      throw new Error('some app error');
    }, { label: 'test-app-error', attempts: 3, delaysMs: [1] }),
    /some app error/
  );
  assert.equal(calls, 1, 'must not retry non-transient errors');
});

test('withTransientRetry: exhausts all attempts and throws with count', async () => {
  let calls = 0;
  const stderrLines = [];
  const origWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (line) => { stderrLines.push(String(line)); return true; };
  try {
    await assert.rejects(
      () => withTransientRetry(async () => {
        calls += 1;
        throw new Error('fetch failed');
      }, { label: 'test-exhaust', attempts: 3, delaysMs: [1, 1, 1] }),
      /gave up after 3 attempts/
    );
    assert.equal(calls, 3);
    assert.equal(stderrLines.filter((l) => l.includes('test-exhaust')).length, 2, 'must log attempts 1 and 2 (not the final failure)');
  } finally {
    process.stderr.write = origWrite;
  }
});

test('withTransientRetry: retries on 502/503/504 status', async () => {
  let calls = 0;
  const statuses = [502, 503, 504];
  for (const status of statuses) {
    calls = 0;
    const err = new Error(`status ${status}`);
    err.status = status;
    const result = await withTransientRetry(async () => {
      calls += 1;
      if (calls === 1) throw err;
      return 'ok';
    }, { label: `test-${status}`, attempts: 2, delaysMs: [1] });
    assert.equal(result, 'ok', `must retry on ${status} status`);
    assert.equal(calls, 2);
  }
});

test('withTransientRetry: does NOT retry on non-transient status codes', async () => {
  let calls = 0;
  const err = new Error('client error');
  err.status = 400;
  await assert.rejects(
    () => withTransientRetry(async () => {
      calls += 1;
      throw err;
    }, { label: 'test-400', attempts: 3, delaysMs: [1] }),
    /client error/
  );
  assert.equal(calls, 1, 'must not retry 400 status');
});

test.after(() => __setWriteClientForTest(null)); // restore real client factory
