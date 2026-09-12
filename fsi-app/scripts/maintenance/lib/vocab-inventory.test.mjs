// Tests for vocab-inventory.mjs (D7, docs/plans/defect-fix-plan-2026-09-12.md). node:test, no npm deps.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractQuotedValues,
  parseCheckConstraintDef,
  looksListValued,
  normalizeTableName,
  buildLiveInventoryEntry,
  stripSqlComments,
  findMatchingParen,
  extractCreateTableRegions,
  extractChecksFromRegion,
  extractCheckConstraintCandidates,
  buildVocabularyFromMigrationSources,
} from './vocab-inventory.mjs';

// ---------------------------------------------------------------------------
// extractQuotedValues
// ---------------------------------------------------------------------------

test('extractQuotedValues: extracts simple single-quoted literals in order', () => {
  assert.deepEqual(extractQuotedValues("'a', 'b', 'c'"), ['a', 'b', 'c']);
});

test('extractQuotedValues: unescapes doubled single quotes', () => {
  assert.deepEqual(extractQuotedValues("'it''s ok', 'plain'"), ["it's ok", 'plain']);
});

test('extractQuotedValues: empty input yields empty array', () => {
  assert.deepEqual(extractQuotedValues(''), []);
  assert.deepEqual(extractQuotedValues(undefined), []);
});

// ---------------------------------------------------------------------------
// parseCheckConstraintDef
// ---------------------------------------------------------------------------

test('parseCheckConstraintDef: live-style ANY(ARRAY[...]) with ::text casts', () => {
  const def = "CHECK ((status = ANY (ARRAY['pending_review'::text, 'confirmed'::text, 'rejected'::text, 'needs_more_data'::text])))";
  assert.deepEqual(parseCheckConstraintDef(def), {
    column: 'status',
    allowed: ['pending_review', 'confirmed', 'rejected', 'needs_more_data'],
  });
});

test('parseCheckConstraintDef: migration-style IN (...) list, multi-line', () => {
  const def = `CHECK (status IN (
      'proposed', 'adopted', 'in_force', 'monitoring',
      'superseded', 'repealed', 'expired'
    ))`;
  const result = parseCheckConstraintDef(def);
  assert.equal(result.column, 'status');
  assert.deepEqual(result.allowed, ['proposed', 'adopted', 'in_force', 'monitoring', 'superseded', 'repealed', 'expired']);
});

test('parseCheckConstraintDef: single-value IN list', () => {
  assert.deepEqual(parseCheckConstraintDef("CHECK (kind IN ('solo'))"), { column: 'kind', allowed: ['solo'] });
});

test('parseCheckConstraintDef: BETWEEN (no list) returns nulls, never guessed', () => {
  assert.deepEqual(parseCheckConstraintDef('CHECK ((tier BETWEEN 1 AND 7))'), { column: null, allowed: null });
});

test('parseCheckConstraintDef: unrecognized shape returns nulls', () => {
  assert.deepEqual(parseCheckConstraintDef('CHECK ((length(title) > 0))'), { column: null, allowed: null });
});

test('parseCheckConstraintDef: ambiguous (two ANY(ARRAY) matches) returns nulls rather than guessing', () => {
  const def = "CHECK ((a = ANY (ARRAY['x'::text])) OR (b = ANY (ARRAY['y'::text])))";
  assert.deepEqual(parseCheckConstraintDef(def), { column: null, allowed: null });
});

test('parseCheckConstraintDef: integer ANY(ARRAY) with no quoted values returns nulls (not guessed)', () => {
  assert.deepEqual(parseCheckConstraintDef('CHECK ((choice = ANY (ARRAY[1, 2, 3])))'), { column: null, allowed: null });
});

// ---------------------------------------------------------------------------
// looksListValued
// ---------------------------------------------------------------------------

test('looksListValued: true for ANY(ARRAY) and IN(...) shapes', () => {
  assert.equal(looksListValued("status = ANY (ARRAY['a'::text])"), true);
  assert.equal(looksListValued("status IN ('a', 'b')"), true);
});

test('looksListValued: false for BETWEEN / arbitrary expressions, including a false-positive-prone substring', () => {
  assert.equal(looksListValued('tier BETWEEN 1 AND 7'), false);
  assert.equal(looksListValued('within(x)'), false); // "in(" appears as a substring but not word-bounded
  assert.equal(looksListValued('min(x) > 0'), false);
});

// ---------------------------------------------------------------------------
// normalizeTableName / buildLiveInventoryEntry
// ---------------------------------------------------------------------------

test('normalizeTableName: strips a schema qualifier and quotes', () => {
  assert.equal(normalizeTableName('public.sources'), 'sources');
  assert.equal(normalizeTableName('"sources"'), 'sources');
  assert.equal(normalizeTableName('sources'), 'sources');
});

test('buildLiveInventoryEntry: parseable row', () => {
  const row = {
    tbl: 'public.provisional_sources',
    conname: 'provisional_sources_status_check',
    def: "CHECK ((status = ANY (ARRAY['pending_review'::text, 'confirmed'::text, 'rejected'::text, 'needs_more_data'::text])))",
  };
  assert.deepEqual(buildLiveInventoryEntry(row), {
    table: 'provisional_sources',
    column: 'status',
    constraint: 'provisional_sources_status_check',
    allowed: ['pending_review', 'confirmed', 'rejected', 'needs_more_data'],
  });
});

test('buildLiveInventoryEntry: unparseable row records allowed:null + unparsed, never guessed', () => {
  const row = { tbl: 'sources', conname: 'sources_tier_check', def: 'CHECK ((tier BETWEEN 1 AND 7))' };
  const entry = buildLiveInventoryEntry(row);
  assert.equal(entry.table, 'sources');
  assert.equal(entry.column, null);
  assert.equal(entry.constraint, 'sources_tier_check');
  assert.equal(entry.allowed, null);
  assert.equal(entry.unparsed, 'CHECK ((tier BETWEEN 1 AND 7))');
});

// ---------------------------------------------------------------------------
// stripSqlComments / findMatchingParen
// ---------------------------------------------------------------------------

test('stripSqlComments: removes line and block comments', () => {
  const sql = "SELECT 1; -- a comment\n/* block\n comment */ SELECT 'a--b';";
  const cleaned = stripSqlComments(sql);
  assert.ok(!cleaned.includes('a comment'));
  assert.ok(!cleaned.includes('block'));
  // best-effort residual (documented in the module header): a comment marker inside a string literal is
  // not specially preserved; this repo's migrations do not do that at authoring time.
});

test('findMatchingParen: finds the balanced close, skipping parens inside a quoted literal', () => {
  const text = "CHECK (status IN ('a)', 'b'))";
  const openIdx = text.indexOf('(');
  const closeIdx = findMatchingParen(text, openIdx);
  assert.equal(text[closeIdx], ')');
  assert.equal(text.slice(openIdx, closeIdx + 1), "(status IN ('a)', 'b'))");
});

test('findMatchingParen: throws when openIdx does not point at "("', () => {
  assert.throws(() => findMatchingParen('abc', 0));
});

// ---------------------------------------------------------------------------
// extractCreateTableRegions / extractChecksFromRegion
// ---------------------------------------------------------------------------

const SOURCES_TABLE_SQL = `
CREATE TABLE sources (
  id UUID PRIMARY KEY,
  tier INT NOT NULL CHECK (tier BETWEEN 1 AND 7),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'stale', 'inaccessible', 'provisional', 'suspended'))
);
`;

test('extractCreateTableRegions: finds the table and its body', () => {
  const regions = extractCreateTableRegions(SOURCES_TABLE_SQL);
  assert.equal(regions.length, 1);
  assert.equal(regions[0].table, 'sources');
  assert.ok(regions[0].body.includes('status'));
});

test('extractChecksFromRegion: finds both CHECK clauses, no explicit constraint names', () => {
  const region = extractCreateTableRegions(SOURCES_TABLE_SQL)[0];
  const checks = extractChecksFromRegion(region.body);
  assert.equal(checks.length, 2);
  assert.equal(checks[0].explicitName, null);
  assert.ok(checks[1].checkText.includes('status IN'));
});

test('extractChecksFromRegion: finds an explicit CONSTRAINT name', () => {
  const body = "status text, CONSTRAINT my_status_check CHECK (status IN ('a', 'b'))";
  const checks = extractChecksFromRegion(body);
  assert.equal(checks.length, 1);
  assert.equal(checks[0].explicitName, 'my_status_check');
});

// ---------------------------------------------------------------------------
// buildVocabularyFromMigrationSources -- end-to-end over synthetic migration files
// ---------------------------------------------------------------------------

test('buildVocabularyFromMigrationSources: anonymous CREATE-TABLE check synthesizes <table>_<column>_check', () => {
  const files = [{ name: '001_sources.sql', sql: SOURCES_TABLE_SQL }];
  const inventory = buildVocabularyFromMigrationSources(files);
  // the BETWEEN check on tier is not list-valued and is excluded entirely
  assert.equal(inventory.length, 1);
  assert.deepEqual(inventory[0], {
    table: 'sources',
    column: 'status',
    constraint: 'sources_status_check',
    allowed: ['active', 'stale', 'inaccessible', 'provisional', 'suspended'],
  });
});

test('buildVocabularyFromMigrationSources: a later ALTER TABLE DROP+ADD CONSTRAINT widens the vocabulary (last wins)', () => {
  const files = [
    { name: '004_source_trust_framework.sql', sql: SOURCES_TABLE_SQL },
    {
      name: '317_provisional_sources_status_promoted.sql',
      sql: `
        ALTER TABLE public.sources DROP CONSTRAINT IF EXISTS sources_status_check;
        ALTER TABLE public.sources ADD CONSTRAINT sources_status_check
          CHECK (status IN ('active', 'stale', 'inaccessible', 'provisional', 'suspended', 'promoted'));
      `,
    },
  ];
  const inventory = buildVocabularyFromMigrationSources(files);
  assert.equal(inventory.length, 1);
  assert.deepEqual(inventory[0].allowed, ['active', 'stale', 'inaccessible', 'provisional', 'suspended', 'promoted']);
  assert.equal(inventory[0].constraint, 'sources_status_check');
});

test('buildVocabularyFromMigrationSources: a DROP with no later re-ADD removes the constraint entirely', () => {
  const files = [
    { name: '001_sources.sql', sql: SOURCES_TABLE_SQL },
    { name: '002_drop.sql', sql: 'ALTER TABLE sources DROP CONSTRAINT sources_status_check;' },
  ];
  const inventory = buildVocabularyFromMigrationSources(files);
  assert.equal(inventory.length, 0);
});

test('buildVocabularyFromMigrationSources: comments are stripped before scanning (a commented-out CHECK is ignored)', () => {
  const sql = `
    CREATE TABLE t (
      -- status text CHECK (status IN ('x'))
      status text CHECK (status IN ('real'))
    );
  `;
  const inventory = buildVocabularyFromMigrationSources([{ name: '001.sql', sql }]);
  assert.equal(inventory.length, 1);
  assert.deepEqual(inventory[0].allowed, ['real']);
});

test('buildVocabularyFromMigrationSources: sorted by table then constraint for deterministic output', () => {
  const sql = `
    CREATE TABLE b_table ( status text CHECK (status IN ('b1')) );
    CREATE TABLE a_table ( status text CHECK (status IN ('a1')) );
  `;
  const inventory = buildVocabularyFromMigrationSources([{ name: '001.sql', sql }]);
  assert.deepEqual(inventory.map((e) => e.table), ['a_table', 'b_table']);
});

test('extractCheckConstraintCandidates: an ADD CONSTRAINT for a non-CHECK constraint type is skipped', () => {
  const sql = 'ALTER TABLE t ADD CONSTRAINT t_fk_check FOREIGN KEY (x) REFERENCES y (id);';
  const candidates = extractCheckConstraintCandidates(sql);
  assert.equal(candidates.length, 0);
});
