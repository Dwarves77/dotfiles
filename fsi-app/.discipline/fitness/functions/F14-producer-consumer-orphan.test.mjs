// F14 negative self-test — RED-then-GREEN on a simulated orphan (same discipline as F13 / the meta-gate).
// The "tree" is injected file records fed to the PURE core (buildOrphanReport): deterministic, no real
// file mutation racing CI. Proves the detector goes RED with a named writer file:line, and GREEN once the
// orphan gains a reader OR is allowlisted — the catching behaviour is itself proven, not assumed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitnessFunction } from './F14-producer-consumer-orphan.mjs';
import {
  buildOrphanReport,
  scanCode,
  scanSchema,
  scanSql,
} from '../../governance/producer-consumer-orphan.mjs';

const SCHEMA = [{ file: 'm.sql', content: 'CREATE TABLE sim_orphan (id uuid);' }];
const WRITER = { file: 'sim/writer.ts', content: 'await sb.from("sim_orphan").insert({ id });' };

test('F14: RED on a simulated write-orphan, with a named writer file:line', () => {
  const r = buildOrphanReport({
    schema: scanSchema(SCHEMA),
    code: scanCode([WRITER]),
    sql: scanSql(SCHEMA), // CREATE TABLE has no FROM/JOIN → no SQL reader
    allowlist: {},
  });
  const hit = r.gatingOrphans.find((o) => o.table === 'sim_orphan');
  assert.ok(hit, 'the simulated orphan must be flagged as a gating write-orphan');
  assert.equal(hit.writers[0].file, 'sim/writer.ts');
  assert.ok(hit.writers[0].line >= 1, 'the finding must name the writer line');
  assert.equal(r.ok, false);
});

test('F14: GREEN once the orphan gains a reader (remove the orphan → clean)', () => {
  const r = buildOrphanReport({
    schema: scanSchema(SCHEMA),
    code: scanCode([WRITER, { file: 'sim/reader.ts', content: 'await sb.from("sim_orphan").select("id");' }]),
    sql: scanSql([{ content: '' }]),
    allowlist: {},
  });
  assert.equal(r.gatingOrphans.length, 0, 'a reader removes the orphan');
  assert.equal(r.ok, true);
});

test('F14: GREEN when the orphan is allowlisted WITH a reason + reviewByPhase', () => {
  const r = buildOrphanReport({
    schema: scanSchema(SCHEMA),
    code: scanCode([WRITER]),
    sql: scanSql([{ content: '' }]),
    allowlist: { sim_orphan: { reason: 'append-only test audit sink', reviewByPhase: 'Phase 7' } },
  });
  assert.equal(r.gatingOrphans.length, 0);
  assert.equal(r.allowlistIssues.length, 0);
  assert.equal(r.ok, true);
});

test('F14: allowlist audit RED on a stale entry (table not in schema)', () => {
  const r = buildOrphanReport({
    schema: scanSchema(SCHEMA),
    code: scanCode([WRITER]),
    sql: scanSql([{ content: '' }]),
    allowlist: {
      sim_orphan: { reason: 'sink', reviewByPhase: 'Phase 7' },
      ghost_table: { reason: 'gone', reviewByPhase: 'Phase 7' },
    },
  });
  assert.ok(r.allowlistIssues.some((i) => /ghost_table/.test(i)), 'a stale allowlist entry must be reported');
  assert.equal(r.ok, false);
});

test('F14: RED on a write-orphan reached only through a guarded-write helper (guardedInsert/guardedUpdate/guardedDelete/guardedInsertMany/archiveRows, scripts/lib/db.mjs)', () => {
  const schema = [{ file: 'm.sql', content: 'CREATE TABLE sim_guarded_orphan (id uuid);' }];
  const writer = { file: 'sim/guarded-writer.mjs', content: 'await guardedInsert("sim_guarded_orphan", row, { cite });' };
  const r = buildOrphanReport({
    schema: scanSchema(schema),
    code: scanCode([writer]),
    sql: scanSql(schema),
    allowlist: {},
  });
  const hit = r.gatingOrphans.find((o) => o.table === 'sim_guarded_orphan');
  assert.ok(hit, 'a table written only through guardedInsert must still be flagged as a gating write-orphan');
  assert.equal(hit.writers[0].file, 'sim/guarded-writer.mjs');
  assert.equal(hit.writers[0].op, 'guarded');
  assert.equal(r.ok, false);
});

test('F14: RED on a write-orphan reached only through the dependency-injected insertFn pattern (emission-factors-common.mjs / assumption-register-common.mjs)', () => {
  const schema = [{ file: 'm.sql', content: 'CREATE TABLE sim_injected_orphan (id uuid);' }];
  const writer = { file: 'sim/injected-writer.mjs', content: 'const res = await insertFn("sim_injected_orphan", toWrite, { cite, select: "id" });' };
  const r = buildOrphanReport({
    schema: scanSchema(schema),
    code: scanCode([writer]),
    sql: scanSql(schema),
    allowlist: {},
  });
  const hit = r.gatingOrphans.find((o) => o.table === 'sim_injected_orphan');
  assert.ok(hit, 'a table written only through the injected insertFn(...) call site must still be flagged');
  assert.equal(hit.writers[0].file, 'sim/injected-writer.mjs');
  assert.equal(r.ok, false);
});

test('F14: guardedUpdate/guardedDelete/guardedInsertMany/archiveRows are ALL recognized as writers (GREEN once a reader exists)', () => {
  const schema = [
    { file: 'm.sql', content: 'CREATE TABLE sim_a (id uuid); CREATE TABLE sim_b (id uuid); CREATE TABLE sim_c (id uuid); CREATE TABLE sim_d (id uuid);' },
  ];
  const code = [
    { file: 'sim/a.mjs', content: 'await guardedUpdate("sim_a", (qb) => qb.eq("id", id), patch, { cite });' },
    { file: 'sim/b.mjs', content: 'await guardedDelete("sim_b", ids, { cite });' },
    { file: 'sim/c.mjs', content: 'await guardedInsertMany("sim_c", rows, { cite });' },
    { file: 'sim/d.mjs', content: 'await archiveRows("sim_d", ids, { cite, archive_reason });' },
    { file: 'sim/readers.mjs', content: [
      'await sb.from("sim_a").select("id");',
      'await sb.from("sim_b").select("id");',
      'await sb.from("sim_c").select("id");',
      'await sb.from("sim_d").select("id");',
    ].join('\n') },
  ];
  const r = buildOrphanReport({
    schema: scanSchema(schema),
    code: scanCode(code),
    sql: scanSql([{ content: '' }]),
    allowlist: {},
  });
  assert.equal(r.gatingOrphans.length, 0, `all four guarded tables have a reader; got: ${JSON.stringify(r.gatingOrphans)}`);
  assert.equal(r.ok, true);
});

test('F14: PostgREST embedded-resource reads (`.select("id, child_table ( col )")`) count as a real read of the child table', () => {
  const schema = [{ file: 'm.sql', content: 'CREATE TABLE sim_parent (id uuid); CREATE TABLE sim_child (id uuid);' }];
  const code = [
    { file: 'sim/writer.mjs', content: 'await guardedInsert("sim_child", row, { cite });' },
    { file: 'sim/reader.ts', content: 'await sb.from("sim_parent").select("id, sim_child ( id )");' },
  ];
  const r = buildOrphanReport({
    schema: scanSchema(schema),
    code: scanCode(code),
    sql: scanSql([{ content: '' }]),
    allowlist: {},
  });
  const hit = r.writeOrphans.find((o) => o.table === 'sim_child');
  assert.equal(hit, undefined, 'an embedded-resource select of sim_child is a real read, not an orphan');
  assert.equal(r.ok, true);
});

test('F14: live tree is GREEN (grandfathered allowlist; no NEW orphan)', () => {
  const v = fitnessFunction.check('sentinel', '');
  assert.deepEqual(v, [], `F14 must be green on the current tree; got: ${JSON.stringify(v)}`);
});

test('F14: metadata', () => {
  assert.equal(fitnessFunction.id, 'F14');
  assert.ok(fitnessFunction.source.length > 0);
  assert.ok(typeof fitnessFunction.check === 'function');
});
