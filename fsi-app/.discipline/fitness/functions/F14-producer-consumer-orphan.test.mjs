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

test('F14: a table whose only read is the guarded readAll helper is NOT an orphan; with no read at all it still IS (red-then-green)', () => {
  const schema = [{ file: 'm.sql', content: 'CREATE TABLE sim_readall (id uuid);' }];
  const writer = { file: 'sim/w.mjs', content: 'await guardedInsertMany("sim_readall", rows, { cite });' };
  const reader = { file: 'sim/r.mjs', content: 'const rows = await readAll("sim_readall", "id", { orderBy: "id" });' };
  const mk = (files) => buildOrphanReport({ schema: scanSchema(schema), code: scanCode(files), sql: scanSql(schema), allowlist: {} });
  const red = mk([writer]);
  assert.ok(red.gatingOrphans.find((o) => o.table === 'sim_readall'), 'no read anywhere: still a write-orphan');
  assert.equal(red.ok, false);
  const green = mk([writer, reader]);
  assert.equal(green.gatingOrphans.find((o) => o.table === 'sim_readall'), undefined, 'a readAll read counts as a reader');
  assert.equal(green.ok, true);
});

// GATE-4 (2026-10-07): this test runs the fitness function against the live repo, which the Fitness
// functions job already does on every pull request (gate evaluation B section 7.6: it failed the unit-test
// step while the gate itself passed in the fitness job). It stays runnable here with FITNESS_LIVE_TESTS=1.
const LIVE_TREE = process.env.FITNESS_LIVE_TESTS === '1' ? {} : { skip: 'live-tree self-test, run by the Fitness functions job; set FITNESS_LIVE_TESTS=1 to run it here' };

test('F14: live tree is GREEN (grandfathered allowlist; no NEW orphan)', LIVE_TREE, () => {
  const v = fitnessFunction.check('sentinel', '');
  assert.deepEqual(v, [], `F14 must be green on the current tree; got: ${JSON.stringify(v)}`);
});

test('F14: metadata', () => {
  assert.equal(fitnessFunction.id, 'F14');
  assert.ok(fitnessFunction.source.length > 0);
  assert.ok(typeof fitnessFunction.check === 'function');
});

// ---- lane GATE-8 (2026-10-08): the honest forms the AUD-AT-4 register found ACCEPTED, red then green ----

const orphanReport = (codeFiles, sqlFiles = [{ content: '' }]) => buildOrphanReport({
  schema: scanSchema(SCHEMA),
  code: scanCode(codeFiles),
  sql: scanSql(sqlFiles),
  allowlist: {},
});

test('F14 B3-15: a reader that exists only inside a code comment is not a reader', () => {
  const r = orphanReport([WRITER, { file: 'sim/reader.ts', content: '// await sb.from("sim_orphan").select("id");\n/* sb.from("sim_orphan").select("*") */' }]);
  assert.equal(r.gatingOrphans.length, 1);
});

test('F14 B3-15: a reader whose call text sits inside a string literal is not a reader', () => {
  const r = orphanReport([WRITER, { file: 'sim/reader.ts', content: 'const doc = \'await sb.from("sim_orphan").select("id")\';' }]);
  assert.equal(r.gatingOrphans.length, 1);
});

test('F14 B3-16: a reader that exists only as a SQL comment in a migration is not a reader', () => {
  const r = orphanReport([WRITER], [{ content: '-- SELECT * FROM sim_orphan;\n/* JOIN sim_orphan ON true */' }]);
  assert.equal(r.gatingOrphans.length, 1);
  const real = orphanReport([WRITER], [{ content: 'CREATE VIEW v AS SELECT * FROM sim_orphan;' }]);
  assert.equal(real.gatingOrphans.length, 0);
});

test('F14 B3-17: a writer through a constant table name is a writer (the orphan is computed)', () => {
  const r = orphanReport([{ file: 'sim/writer.ts', content: 'const T = "sim_orphan";\nawait sb.from(T).insert({ id });' }]);
  assert.equal(r.gatingOrphans.length, 1);
  // and a reader through a constant clears it
  const cleared = orphanReport([
    { file: 'sim/writer.ts', content: 'await sb.from("sim_orphan").insert({ id });' },
    { file: 'sim/reader.ts', content: 'const T = `sim_orphan`;\nawait sb.from(T).select("id");' },
  ]);
  assert.equal(cleared.gatingOrphans.length, 0);
});

test('F14 B3-18: runOrphanCheck reads .cjs and .jsx code files, not only .ts .tsx .mjs .js', async () => {
  const src = await (await import('node:fs/promises')).readFile(new URL('../../governance/producer-consumer-orphan.mjs', import.meta.url), 'utf8');
  assert.match(src, /cjs\|jsx/);
});
