// Selftests for the dead-column pure core (fixtures only, no DB, no fs).
// Run: node --test fsi-app/scripts/verify/lib/dead-column-scan.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isTimestampType,
  scopedColumns,
  stripCreatingDdl,
  buildTokenSet,
  findDeadColumns,
  staleAllowlistEntries,
} from './dead-column-scan.mjs';

test('isTimestampType: matches timestamp/timestamptz/date, not text or int', () => {
  assert.equal(isTimestampType('timestamp with time zone', 'timestamptz'), true);
  assert.equal(isTimestampType('date', 'date'), true);
  assert.equal(isTimestampType('text', 'text'), false);
  assert.equal(isTimestampType('integer', 'int4'), false);
});

test('scopedColumns: excludes PK, FK, generated, and timestamp columns', () => {
  const columns = [
    { table: 'sources', column: 'id', dataType: 'uuid', udtName: 'uuid' },
    { table: 'sources', column: 'created_at', dataType: 'timestamp with time zone', udtName: 'timestamptz' },
    { table: 'sources', column: 'owner_id', dataType: 'uuid', udtName: 'uuid' },
    { table: 'sources', column: 'row_num', dataType: 'integer', udtName: 'int4', isGenerated: true },
    { table: 'sources', column: 'tier', dataType: 'integer', udtName: 'int4' },
  ];
  const pks = new Set(['sources.id']);
  const fks = [{ table: 'sources', column: 'owner_id', refTable: 'organisations', refColumn: 'id' }];
  const got = scopedColumns(columns, pks, fks);
  assert.deepEqual(got.map((c) => c.column).sort(), ['tier']);
});

test('stripCreatingDdl: blanks the CREATE TABLE column list but keeps CREATE VIEW/FUNCTION bodies', () => {
  const sql = [
    'CREATE TABLE sources (id uuid, tier int, base_tier int);',
    'CREATE VIEW source_health AS SELECT id, tier FROM sources WHERE base_tier > 0;',
  ].join('\n');
  const stripped = stripCreatingDdl(sql);
  // the CREATE TABLE column list is blanked out (its "tier"/"base_tier" tokens no longer appear there)...
  const createTableLine = stripped.split('\n')[0];
  assert.ok(!createTableLine.includes('tier'));
  // ...but the CREATE VIEW body (a real read of tier/base_tier) is untouched.
  assert.ok(stripped.includes('SELECT id, tier FROM sources WHERE base_tier > 0'));
});

test('stripCreatingDdl: blanks ADD COLUMN clauses', () => {
  const sql = 'ALTER TABLE sources ADD COLUMN IF NOT EXISTS ai_confidence numeric;\nSELECT 1;';
  const stripped = stripCreatingDdl(sql);
  assert.ok(!stripped.includes('ai_confidence'));
  assert.ok(stripped.includes('SELECT 1;'));
});

test('stripCreatingDdl: handles nested parens inside the column list without truncating', () => {
  const sql = 'CREATE TABLE t (id uuid, amount numeric(12,2) DEFAULT (0), CHECK (amount >= 0));\nSELECT amount FROM t;';
  const stripped = stripCreatingDdl(sql);
  const firstLine = stripped.split('\n')[0];
  assert.ok(!firstLine.includes('amount'));
  assert.ok(stripped.includes('SELECT amount FROM t;'));
});

test('buildTokenSet: extracts bare identifiers from arbitrary text', () => {
  const set = buildTokenSet(['const x = row.tier;', '"base_tier"', '// mentions legacy_id in a comment']);
  assert.ok(set.has('tier'));
  assert.ok(set.has('base_tier'));
  assert.ok(set.has('legacy_id'));
  assert.ok(!set.has('never_mentioned'));
});

test('findDeadColumns: flags zero-hit columns, skips ones present in the token set, skips allowlisted', () => {
  const columns = [
    { table: 'sources', column: 'tier' },
    { table: 'sources', column: 'orphan_column' },
    { table: 'sources', column: 'allowlisted_column' },
  ];
  const tokenSet = new Set(['tier', 'somethingElse']);
  const allowlist = { 'sources.allowlisted_column': { reason: 'test' } };
  const dead = findDeadColumns({ columns, tokenSet, allowlist });
  assert.deepEqual(dead.map((d) => `${d.table}.${d.column}`), ['sources.orphan_column']);
  assert.match(dead[0].evidence, /0 occurrences/);
});

test('staleAllowlistEntries: flags an allowlist entry whose column is no longer in scope', () => {
  const scopedKeys = new Set(['sources.tier']);
  const allowlist = { 'sources.tier': { reason: 'ok' }, 'sources.dropped_column': { reason: 'stale' } };
  const stale = staleAllowlistEntries({ scopedKeys, allowlist });
  assert.deepEqual(stale.map((s) => s.key), ['sources.dropped_column']);
});
