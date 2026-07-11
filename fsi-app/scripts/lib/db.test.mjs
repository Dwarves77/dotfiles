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
const { reclassifyToSource, registerSource, readAll, guardedDelete, readClient, __setWriteClientForTest } = await import('./db.mjs');

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

test('guardedDelete: snapshots then deletes by id; requires cite', async () => {
  const calls = [];
  __setWriteClientForTest(() => makeClient((s) => {
    if (s.verb === 'select') return { data: [{ id: 'd1', url: 'https://x' }], error: null };
    if (s.verb === 'delete') return { data: [{ id: 'd1' }], error: null };
    return { data: null, error: null };
  }, calls));
  const r = await guardedDelete('sources', ['d1'], { cite: { skill: 'remediation-discipline', reason: 'test' } });
  assert.equal(r.deleted, 1);
  assert.ok(calls.some((c) => c.verb === 'select'), 'must snapshot (select) before delete');
  assert.ok(calls.some((c) => c.verb === 'delete'), 'must delete');
  await assert.rejects(() => guardedDelete('sources', ['d1'], {}), /requires \{ cite/);
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

test.after(() => __setWriteClientForTest(null)); // restore real client factory
