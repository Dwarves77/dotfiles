// Selftests for the duplicate-table pure core (fixtures only, no DB, no fs).
// Run: node --test fsi-app/scripts/verify/lib/duplicate-table-scan.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jaccard, buildTableShapes, findCandidatePairs, staleAllowlistEntries } from './duplicate-table-scan.mjs';

test('jaccard: identical sets = 1, disjoint sets = 0, empty/empty = 0', () => {
  assert.equal(jaccard(new Set(['a', 'b']), new Set(['a', 'b'])), 1);
  assert.equal(jaccard(new Set(['a']), new Set(['b'])), 0);
  assert.equal(jaccard(new Set(), new Set()), 0);
  assert.equal(jaccard(new Set(['a', 'b']), new Set(['b', 'c'])), 1 / 3);
});

test('buildTableShapes: groups columns and FK targets per table', () => {
  const columns = [
    { table: 'a', column: 'id' }, { table: 'a', column: 'source_id' },
    { table: 'b', column: 'id' }, { table: 'b', column: 'source_id' },
  ];
  const fks = [{ table: 'a', refTable: 'sources' }, { table: 'b', refTable: 'sources' }];
  const shapes = buildTableShapes(columns, fks);
  assert.deepEqual([...shapes.get('a').columnNames].sort(), ['id', 'source_id']);
  assert.deepEqual([...shapes.get('a').fkTargets], ['sources']);
  assert.deepEqual([...shapes.get('b').fkTargets], ['sources']);
});

test('findCandidatePairs: flags a pair with near-identical column-name sets', () => {
  const columns = [
    { table: 'source_citations', column: 'id' }, { table: 'source_citations', column: 'source_id' }, { table: 'source_citations', column: 'cited_source_id' },
    { table: 'intelligence_item_citations', column: 'id' }, { table: 'intelligence_item_citations', column: 'source_id' }, { table: 'intelligence_item_citations', column: 'cited_source_id' },
    { table: 'unrelated_table', column: 'id' }, { table: 'unrelated_table', column: 'title' },
  ];
  const shapes = buildTableShapes(columns, []);
  const pairs = findCandidatePairs({ shapes });
  const keys = pairs.map((p) => `${p.a}|${p.b}`);
  assert.ok(keys.includes('intelligence_item_citations|source_citations'));
  assert.ok(!keys.some((k) => k.includes('unrelated_table')));
  const pair = pairs.find((p) => p.a === 'intelligence_item_citations');
  assert.equal(pair.columnNameSimilarity, 1);
  assert.deepEqual(pair.sharedColumns.sort(), ['cited_source_id', 'id', 'source_id']);
});

test('findCandidatePairs: flags a pair via FK-target overlap even with different column names', () => {
  const columns = [
    { table: 'a_edges', column: 'id' }, { table: 'a_edges', column: 'left_id' }, { table: 'a_edges', column: 'right_id' },
    { table: 'b_edges', column: 'id' }, { table: 'b_edges', column: 'origin_id' }, { table: 'b_edges', column: 'target_id' },
  ];
  const fks = [
    { table: 'a_edges', refTable: 'nodes' }, { table: 'a_edges', refTable: 'kinds' },
    { table: 'b_edges', refTable: 'nodes' }, { table: 'b_edges', refTable: 'kinds' },
  ];
  const shapes = buildTableShapes(columns, fks);
  const pairs = findCandidatePairs({ shapes, columnNameThreshold: 0.9 }); // column names alone would NOT clear a high bar
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].fkTargetSimilarity, 1);
});

test('findCandidatePairs: does NOT flag two single-FK tables that merely point at the same one table', () => {
  // The most common shape in the schema: an edge table with one FK. Two such tables pointing at the
  // same target table have fkTargetSimilarity=1.0 by construction but share no structural role beyond
  // "an FK column exists", MIN_FK_TARGETS_FOR_SIGNAL exists to keep this out of the candidate list.
  const columns = [
    { table: 'thing_a', column: 'id' }, { table: 'thing_a', column: 'source_id' },
    { table: 'thing_b', column: 'id' }, { table: 'thing_b', column: 'note' },
  ];
  const fks = [{ table: 'thing_a', refTable: 'sources' }, { table: 'thing_b', refTable: 'sources' }];
  const shapes = buildTableShapes(columns, fks);
  const pairs = findCandidatePairs({ shapes });
  assert.equal(pairs.length, 0);
});

test('findCandidatePairs: respects an allowlist by pair key (order-independent)', () => {
  const columns = [
    { table: 'x', column: 'id' }, { table: 'x', column: 'val' },
    { table: 'y', column: 'id' }, { table: 'y', column: 'val' },
  ];
  const shapes = buildTableShapes(columns, []);
  const pairs = findCandidatePairs({ shapes, allowlist: { 'x|y': { reason: 'intentional, see ADR' } } });
  assert.equal(pairs.length, 0);
});

test('staleAllowlistEntries: flags a pair with a dropped table, and a pair that no longer clears either threshold', () => {
  const columns = [
    { table: 'still_similar_a', column: 'id' }, { table: 'still_similar_a', column: 'val' },
    { table: 'still_similar_b', column: 'id' }, { table: 'still_similar_b', column: 'val' },
    { table: 'diverged_a', column: 'id' }, { table: 'diverged_a', column: 'only_a' },
    { table: 'diverged_b', column: 'id' }, { table: 'diverged_b', column: 'only_b' },
  ];
  const shapes = buildTableShapes(columns, []);
  const allowlist = {
    'still_similar_a|still_similar_b': { reason: 'ok' },
    'diverged_a|diverged_b': { reason: 'was similar once' },
    'dropped_a|dropped_b': { reason: 'dropped table' },
  };
  const stale = staleAllowlistEntries({ shapes, allowlist, columnNameThreshold: 0.5, fkTargetThreshold: 0.6 });
  const keys = stale.map((s) => s.key);
  assert.ok(keys.includes('dropped_a|dropped_b'));
  assert.ok(keys.includes('diverged_a|diverged_b'));
  assert.ok(!keys.includes('still_similar_a|still_similar_b'));
});
