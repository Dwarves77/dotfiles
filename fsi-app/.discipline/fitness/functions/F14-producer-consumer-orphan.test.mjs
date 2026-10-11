// F14 negative self-test — RED-then-GREEN on a simulated orphan (same discipline as F13 / the meta-gate).
// The "tree" is injected file records fed to the PURE core (buildOrphanReport): deterministic, no real
// file mutation racing CI. Proves the detector goes RED with a named writer file:line, and GREEN once the
// orphan gains a reader OR is allowlisted — the catching behaviour is itself proven, not assumed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitnessFunction, checkDbObjectReference, scanTree, UNREFERENCED_TABLES_CEILING, UNREAD_TABLES_CEILING, ALLOWLIST } from './F14-producer-consumer-orphan.mjs';
import { replaySchema, buildReferenceReport, tableSqlReferences, functionSqlReferences } from '../../governance/db-object-reference.mjs';
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

// ---- Facet B, formerly F47 (REG-1, 2026-10-11): the former F47 test file, moved here with its function. ----
const mig = (file, content) => ({ file, content });


test('replaySchema: statement order wins (drop then recreate keeps the object; a later drop removes it; rename follows)', () => {
  const s = replaySchema([
    mig('001.sql', 'create table a (id int);\ncreate table b (id int);\ncreate or replace function f_one(x int) returns int language sql as $$ select 1 $$;'),
    mig('002.sql', 'drop function if exists f_one(int);\ncreate or replace function f_one(x int, y int) returns int language sql as $$ select 2 $$;\ndrop table b;\nalter table a rename to a2;'),
    mig('003.sql', '-- drop table a2;\n/* create table ghost (id int); */'),
  ]);
  assert.deepEqual([...s.tables.keys()].sort(), ['a2']);
  assert.deepEqual([...s.functions.keys()], ['f_one']);
});

test('tableSqlReferences: own DDL, indexes, policies, triggers and grants do not count; a FROM in a function body does', () => {
  const sql = 'create table t (id int);\ncreate index idx_t on t (id);\ncreate policy p on t for select using (true);\ncreate trigger trg before insert on t execute function g();\ngrant select on t to anon;\ncreate function h() returns int language sql as $$ select count(*) from t $$;';
  assert.equal(tableSqlReferences('t', sql), 1);
});

test('functionSqlReferences: CREATE, DROP, COMMENT, GRANT are DDL; a trigger EXECUTE FUNCTION is a reference', () => {
  const sql = 'create or replace function g() returns trigger language plpgsql as $$ begin return new; end $$;\ncomment on function g() is \'x\';\ngrant execute on function g() to anon;\ncreate trigger trg before insert on t execute function g();';
  assert.equal(functionSqlReferences('g', sql), 1);
  assert.equal(functionSqlReferences('never_called', 'create function never_called() returns int language sql as $$ select 1 $$;\ndrop function never_called();'), 0);
});

test('buildReferenceReport: a table nothing names is UNREFERENCED; a trigger-written table nothing reads is UNREAD; the allowlist is audited', () => {
  const migrationTexts = [mig('001.sql', [
    'create table orphan (id int);',
    'create table audit_trail (id int);',
    'create table used (id int);',
    'create function write_trail() returns trigger language plpgsql as $$ begin insert into audit_trail values (1); return new; end $$;',
    'create trigger t1 after insert on used execute function write_trail();',
    'create function dead_fn() returns int language sql as $$ select 1 $$;',
  ].join('\n'))];
  const codeFiles = [{ file: 'src/x.ts', content: 'const r = await supabase.from("used").select("id");\n// orphan is only mentioned in this comment\n' }];
  const schema = replaySchema(migrationTexts);
  const r = buildReferenceReport({ schema, codeFiles, migrationTexts, allowlist: { tables: { used: { reason: 'stale on purpose', decidedOn: '2026-01-01' }, ghost: { reason: 'gone', decidedOn: '2026-01-01' } }, functions: {} } });
  assert.deepEqual(r.unreferencedTables.map((t) => t.name), ['orphan']);
  assert.deepEqual(r.unreadTables.map((t) => t.name), ['audit_trail']);
  assert.deepEqual(r.unreferencedFunctions.map((f) => f.name), ['dead_fn']);
  assert.deepEqual(r.allowlistIssues.map((a) => a.name + ':' + a.issue.split(' (')[0]).sort(), ['ghost:allowlisted but not in the committed schema', 'used:allowlisted but referenced and read']);
});

test('ALLOWLIST shape: every entry carries a reason and a decidedOn date', () => {
  for (const group of ['tables', 'functions']) for (const [name, e] of Object.entries(ALLOWLIST[group])) {
    assert.ok(e.reason && e.reason.length > 20, name);
    assert.match(e.decidedOn, /^\d{4}-\d{2}-\d{2}$/, name);
  }
});

// GATE-4 (2026-10-07): this test runs the fitness function against the live repo, which the Fitness
// functions job already does on every pull request (gate evaluation B section 7.6: it failed the unit-test
// step while the gate itself passed in the fitness job). It stays runnable here with FITNESS_LIVE_TESTS=1.

test('LIVE ratchet: the committed schema replays, the counts equal the ceilings, no dead function, no allowlist issue', LIVE_TREE, () => {
  const r = scanTree();
  assert.ok(r.schema.tables.size > 100 && r.schema.functions.size > 50, `schema replay looks wrong: ${r.schema.tables.size} tables, ${r.schema.functions.size} functions`);
  assert.deepEqual(r.allowlistIssues, []);
  assert.equal(r.unreferencedTables.length, UNREFERENCED_TABLES_CEILING, `unreferenced tables: ${r.unreferencedTables.map((t) => t.name).join(', ')}. Above: wire or drop. Below: re-seed UNREFERENCED_TABLES_CEILING.`);
  assert.equal(r.unreadTables.length, UNREAD_TABLES_CEILING, `unread tables: ${r.unreadTables.map((t) => t.name).join(', ')}. Above: build the reader or allowlist the sink. Below: re-seed UNREAD_TABLES_CEILING.`);
  assert.deepEqual(r.unreferencedFunctions.map((f) => f.name), [], 'dead functions');
  assert.deepEqual(checkDbObjectReference(), []);
});

// ---- lane GATE-8 (2026-10-08): the honest forms the AUD-AT-4 register found ACCEPTED, red then green ----

test('F47 B6-13: a write-only table whose only reader is a comment (trailing, block or JSDoc) stays unread', () => {
  const migrationTexts = [mig('001.sql', 'create table zz_t (id int);')];
  const codeFiles = [
    { file: 'src/w.ts', content: 'await supabase.from("zz_t").insert({ id: 1 });' },
    { file: 'src/c.ts', content: 'const a = 1; // await supabase.from("zz_t").select("id");\n/* sb.from("zz_t").select("*") */\n/**\n * reads zz_t\n */\n' },
  ];
  const r = buildReferenceReport({ schema: replaySchema(migrationTexts), codeFiles, migrationTexts });
  assert.deepEqual(r.unreadTables.map((t) => t.name), ['zz_t']);
  const real = buildReferenceReport({ schema: replaySchema(migrationTexts), codeFiles: [...codeFiles, { file: 'src/r.ts', content: 'await supabase.from("zz_t").select("id");' }], migrationTexts });
  assert.deepEqual(real.unreadTables, []);
});

test('F47 B6-14: a dead function referenced only in a workflow YAML comment is still unreferenced', () => {
  const migrationTexts = [mig('001.sql', 'create function zz_fn() returns int language sql as $$ select 1 $$;')];
  const codeFiles = [{ file: '.github/workflows/x.yml', content: 'jobs:\n  a:\n    steps:\n      # calls zz_fn through rpc\n      - run: echo hi # zz_fn\n      - run: echo "zz_fn"\n' }];
  const r = buildReferenceReport({ schema: replaySchema(migrationTexts), codeFiles, migrationTexts });
  assert.deepEqual(r.unreferencedFunctions.map((f) => f.name), ['zz_fn']);
  const real = buildReferenceReport({ schema: replaySchema(migrationTexts), codeFiles: [{ file: 'src/c.ts', content: 'await sb.rpc("zz_fn");' }], migrationTexts });
  assert.deepEqual(real.unreferencedFunctions, []);
});

test('F47: a SQL comment cannot hide or fake a statement, and a -- inside a string is not a comment', () => {
  const s = replaySchema([mig('001.sql', "create table a (note text default '--');\n/* drop table a; */\n-- create table ghost (id int);")]);
  assert.deepEqual([...s.tables.keys()], ['a']);
});
