// Red-then-green for F47 (db-object-reference): the pure core over synthetic migrations and code, then the
// LIVE ratchet against the tree. No DB, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replaySchema, buildReferenceReport, tableSqlReferences, functionSqlReferences } from '../../governance/db-object-reference.mjs';
import { scanTree, UNREFERENCED_TABLES_CEILING, UNREAD_TABLES_CEILING, ALLOWLIST, fitnessFunction } from './F47-db-object-reference.mjs';

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

test('LIVE ratchet: the committed schema replays, the counts equal the ceilings, no dead function, no allowlist issue', () => {
  const r = scanTree();
  assert.ok(r.schema.tables.size > 100 && r.schema.functions.size > 50, `schema replay looks wrong: ${r.schema.tables.size} tables, ${r.schema.functions.size} functions`);
  assert.deepEqual(r.allowlistIssues, []);
  assert.equal(r.unreferencedTables.length, UNREFERENCED_TABLES_CEILING, `unreferenced tables: ${r.unreferencedTables.map((t) => t.name).join(', ')}. Above: wire or drop. Below: re-seed UNREFERENCED_TABLES_CEILING.`);
  assert.equal(r.unreadTables.length, UNREAD_TABLES_CEILING, `unread tables: ${r.unreadTables.map((t) => t.name).join(', ')}. Above: build the reader or allowlist the sink. Below: re-seed UNREAD_TABLES_CEILING.`);
  assert.deepEqual(r.unreferencedFunctions.map((f) => f.name), [], 'dead functions');
  assert.deepEqual(fitnessFunction.check(), []);
});
