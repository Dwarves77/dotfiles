// Selftests for the duplicate-table pure core: unit tests on small synthetic fixtures (no DB, no network)
// PLUS the calibration test against a real live-schema snapshot (fixtures/duplicate-table-schema-snapshot.json,
// captured 2026-09-25, kwrsbpiseruzbfwjpvsp) and DUP-1's own confirmed pairs (POSITIVES) plus 15 hand-labelled
// negatives (NEGATIVES) from the pre-calibration cut's noisiest output, per the coordinator's ruling: "an
// allowlist is for accepted non-issues, not known positives", the 8 positives are NOT allowlisted; they must
// independently clear CANDIDATE_THRESHOLD every time this test runs, locking the calibration against drift.
// Run: node --test fsi-app/scripts/verify/lib/duplicate-table-scan.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildColumnTypeMaps,
  columnDocFrequency,
  columnWeight,
  sharedSignificantColumns,
  weightedColumnJaccard,
  weightedColumnOverlap,
  tableNameOverlap,
  commentSimilarity,
  commentMentionsOther,
  scorePair,
  findCandidatePairs,
  staleAllowlistEntries,
  CANDIDATE_THRESHOLD,
} from './duplicate-table-scan.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------------------------------
// Unit tests: small synthetic fixtures, isolate one signal at a time.
// ---------------------------------------------------------------------------------------------------

test('columnWeight: structural columns are 0 regardless of df; others are 1/df', () => {
  const df = new Map([['id', 100], ['status', 20], ['grid_region', 1]]);
  assert.equal(columnWeight('id', df), 0);
  assert.equal(columnWeight('created_at', df), 0); // structural even with no df entry
  assert.equal(columnWeight('status', df), 1 / 20);
  assert.equal(columnWeight('grid_region', df), 1);
});

test('weightedColumnJaccard: a pair sharing ONLY structural/ubiquitous columns scores 0 (the org_memberships<->user_watchlist defect this module fixes)', () => {
  const columns = [
    { table: 'org_memberships', column: 'id', udtName: 'uuid' },
    { table: 'org_memberships', column: 'org_id', udtName: 'uuid' },
    { table: 'org_memberships', column: 'user_id', udtName: 'uuid' },
    { table: 'org_memberships', column: 'role', udtName: 'text' },
    { table: 'org_memberships', column: 'created_at', udtName: 'timestamptz' },
    { table: 'user_watchlist', column: 'id', udtName: 'uuid' },
    { table: 'user_watchlist', column: 'user_id', udtName: 'uuid' },
    { table: 'user_watchlist', column: 'org_id', udtName: 'uuid' },
    { table: 'user_watchlist', column: 'item_type', udtName: 'text' },
    { table: 'user_watchlist', column: 'item_id', udtName: 'text' },
    { table: 'user_watchlist', column: 'created_at', udtName: 'timestamptz' },
  ];
  const maps = buildColumnTypeMaps(columns);
  const df = columnDocFrequency(maps);
  assert.equal(weightedColumnJaccard('org_memberships', 'user_watchlist', maps, df), 0);
});

test('sharedSignificantColumns: excludes structural, excludes type mismatches, excludes columns above RARE_DF_CEILING', () => {
  const columns = [];
  // 25 unrelated tables all carrying a common "status" text column (df=25, above the ceiling of 20)
  for (let i = 0; i < 25; i++) columns.push({ table: `filler_${i}`, column: 'status', udtName: 'text' });
  columns.push({ table: 'a', column: 'status', udtName: 'text' });
  columns.push({ table: 'b', column: 'status', udtName: 'text' });
  columns.push({ table: 'a', column: 'grid_region', udtName: 'text' });
  columns.push({ table: 'b', column: 'grid_region', udtName: 'text' });
  columns.push({ table: 'a', column: 'mismatched_type', udtName: 'text' });
  columns.push({ table: 'b', column: 'mismatched_type', udtName: 'numeric' });
  columns.push({ table: 'a', column: 'id', udtName: 'uuid' });
  columns.push({ table: 'b', column: 'id', udtName: 'uuid' });
  const maps = buildColumnTypeMaps(columns);
  const df = columnDocFrequency(maps);
  const shared = sharedSignificantColumns('a', 'b', maps, df);
  assert.deepEqual(shared, ['grid_region']); // status excluded (too common), mismatched_type excluded (type differs), id excluded (structural)
});

test('weightedColumnOverlap: rewards a small table fully explained by a bigger table\'s envelope, unlike symmetric Jaccard', () => {
  const columns = [
    { table: 'small_envelope', column: 'id', udtName: 'uuid' },
    { table: 'small_envelope', column: 'value_numeric', udtName: 'numeric' },
    { table: 'small_envelope', column: 'source_key', udtName: 'text' },
    { table: 'big_table', column: 'id', udtName: 'uuid' },
    { table: 'big_table', column: 'value_numeric', udtName: 'numeric' },
    { table: 'big_table', column: 'source_key', udtName: 'text' },
    { table: 'big_table', column: 'extra_a', udtName: 'text' },
    { table: 'big_table', column: 'extra_b', udtName: 'text' },
    { table: 'big_table', column: 'extra_c', udtName: 'text' },
    { table: 'big_table', column: 'extra_d', udtName: 'text' },
  ];
  const maps = buildColumnTypeMaps(columns);
  const df = columnDocFrequency(maps);
  const overlap = weightedColumnOverlap('small_envelope', 'big_table', maps, df);
  const jaccard = weightedColumnJaccard('small_envelope', 'big_table', maps, df);
  assert.ok(overlap > jaccard, `overlap (${overlap}) should exceed jaccard (${jaccard}) when one table embeds the other's envelope`);
  assert.equal(overlap, 1); // small_envelope's every non-structural column is present, type-matched, in big_table
});

test('tableNameOverlap: shared distinctive name tokens (case: the census/coverage-gap family), generic tokens excluded', () => {
  assert.ok(tableNameOverlap('coverage_gap_candidates', 'coverage_gap_census_findings') > 0);
  assert.equal(tableNameOverlap('org_memberships', 'user_watchlist'), 0); // no shared tokens once "org"/"user" are stopped
});

test('commentSimilarity: gated at >=2 shared distinctive tokens; a single coincidental word scores 0', () => {
  const comments = new Map([
    ['a', 'Discovery lane census artifact tracking corpus rollup state.'],
    ['b', 'Full corpus census enumeration and rollup discipline.'],
    ['c', 'Some other unrelated table about pricing tiers.'],
  ]);
  assert.ok(commentSimilarity('a', 'b', comments) > 0); // shares corpus/census/rollup
  assert.equal(commentSimilarity('a', 'c', comments), 0);
});

test('commentMentionsOther: a table naming the other table in its own comment is detected either direction', () => {
  const comments = new Map([
    ['intelligence_item_citations', 'edge table parallel to source_citations (source-to-source).'],
    ['source_citations', 'which sources cite which other sources.'],
  ]);
  assert.equal(commentMentionsOther('intelligence_item_citations', 'source_citations', comments), true);
  assert.equal(commentMentionsOther('source_citations', 'intelligence_item_citations', comments), true);
});

test('commentMentionsOther: a bare single-word table name is NOT trusted as a mention (coincidental substring, live-schema defect this fixes)', () => {
  const comments = new Map([
    ['bulk_imports', 'Audit log for /api/admin/sources/bulk-import.'], // contains "sources" with no relation to the sources table
    ['sources', 'Layer 1: public portals where legislation is published.'],
  ]);
  assert.equal(commentMentionsOther('bulk_imports', 'sources', comments), false);
});

test('findCandidatePairs: respects an allowlist by pair key (order-independent)', () => {
  const columns = [
    { table: 'x', column: 'id', udtName: 'uuid' }, { table: 'x', column: 'grid_region', udtName: 'text' }, { table: 'x', column: 'co2_fossil', udtName: 'numeric' },
    { table: 'y', column: 'id', udtName: 'uuid' }, { table: 'y', column: 'grid_region', udtName: 'text' }, { table: 'y', column: 'co2_fossil', udtName: 'numeric' },
  ];
  const tables = [{ table: 'x', comment: null }, { table: 'y', comment: null }];
  const withoutAllowlist = findCandidatePairs({ columns, tables });
  assert.ok(withoutAllowlist.some((p) => p.a === 'x' && p.b === 'y'));
  const withAllowlist = findCandidatePairs({ columns, tables, allowlist: { 'x|y': { reason: 'test' } } });
  assert.equal(withAllowlist.length, 0);
});

test('staleAllowlistEntries: flags a dropped table and a pair whose score fell below threshold', () => {
  const columns = [
    { table: 'still_similar_a', column: 'id', udtName: 'uuid' }, { table: 'still_similar_a', column: 'grid_region', udtName: 'text' }, { table: 'still_similar_a', column: 'co2_fossil', udtName: 'numeric' },
    { table: 'still_similar_b', column: 'id', udtName: 'uuid' }, { table: 'still_similar_b', column: 'grid_region', udtName: 'text' }, { table: 'still_similar_b', column: 'co2_fossil', udtName: 'numeric' },
    { table: 'alpha_widget', column: 'id', udtName: 'uuid' }, { table: 'alpha_widget', column: 'only_a', udtName: 'text' },
    { table: 'beta_gadget', column: 'id', udtName: 'uuid' }, { table: 'beta_gadget', column: 'only_b', udtName: 'text' },
  ];
  const tables = [
    { table: 'still_similar_a', comment: null }, { table: 'still_similar_b', comment: null },
    { table: 'alpha_widget', comment: null }, { table: 'beta_gadget', comment: null },
  ];
  const allowlist = {
    'still_similar_a|still_similar_b': { reason: 'ok' },
    'alpha_widget|beta_gadget': { reason: 'was similar once' },
    'dropped_a|dropped_b': { reason: 'dropped table' },
  };
  const stale = staleAllowlistEntries({ columns, tables, allowlist });
  const keys = stale.map((s) => s.key);
  assert.ok(keys.includes('dropped_a|dropped_b'));
  assert.ok(keys.includes('alpha_widget|beta_gadget'));
  assert.ok(!keys.includes('still_similar_a|still_similar_b'));
});

// ---------------------------------------------------------------------------------------------------
// CALIBRATION: real live-schema snapshot + DUP-1's own confirmed pairs + hand-labelled negatives.
// Locks the tuning against drift, if a future edit to the weights/thresholds regresses recall or
// precision on this labelled set, this test catches it.
// ---------------------------------------------------------------------------------------------------

const snapshot = JSON.parse(readFileSync(resolve(HERE, 'fixtures/duplicate-table-schema-snapshot.json'), 'utf8'));

// POSITIVES: the 8 pairs DUP-1 (docs/audits/supabase-integrity-and-wiring-audit-2026-09-25.md, finding
// DUP-1) itself reviewed and confirmed worth a human look, NOT allowlisted (coordinator ruling: an
// allowlist is for accepted non-issues, not known positives). Each must independently clear
// CANDIDATE_THRESHOLD.
const POSITIVES = [
  ['intelligence_item_citations', 'source_citations'],
  ['regional_data_facts', 'state_cost_facts'],
  ['market_series', 'published_price_statistics'],
  ['assumption_register', 'emission_factors'],
  ['org_watchlist', 'user_watchlist'],
  ['coverage_gap_candidates', 'coverage_gap_census_findings'],
  ['census_worklist', 'coverage_gap_candidates'],
  ['census_worklist', 'coverage_gap_census_findings'],
];

// NEGATIVES: the top 15 candidates from the PRE-calibration cut's live output (docs/ops/session-log.d/
// 2026-09-25-tool-gap-2.md), hand-labelled [CONFIRMED] by reading each pair's table comments/migrations/
// consumers. Each one-line reason is the actual disposition, not a placeholder.
const NEGATIVES = [
  ['org_memberships', 'user_watchlist', 'org_memberships maps users to orgs (membership); user_watchlist is a personal saved-item list. Different roles; share only structural id/org_id/user_id/created_at.'],
  ['assumption_register', 'market_series', "Both use the shared numeric-fact envelope (value_numeric/unit/derivation/source_key/etc.), but assumption_register holds this product's own modelling constants (WO-20) while market_series holds externally-published time-series observations (WO-16), a shared design pattern, not accidental duplication."],
  ['market_series', 'regional_data_facts', 'market_series is a published time-series spine (WO-16); regional_data_facts is a per-cell Operations fact store (region/dimension/fact_label, Q7). Different domains sharing the same envelope pattern.'],
  ['user_item_state', 'user_watchlist', 'user_item_state is personal per-user item state (archive scope, migration 239); user_watchlist is a personal saved-item list. Both personal/per-user but distinct purposes.'],
  ['user_item_state', 'workspace_item_overrides', "user_item_state's own comment states it is explicitly \"distinct from the org-scoped workspace_item_overrides\", an intentional personal/org two-tier design, not an accidental duplicate."],
  ['org_memberships', 'user_item_state', 'org_memberships is a user-org membership map; user_item_state is personal per-user item state. Different roles, share only structural columns.'],
  ['org_memberships', 'workspace_tags', 'org_memberships is a user-org membership map; workspace_tags is org-owned tag definitions (migration 313). Different roles.'],
  ['org_memberships', 'org_watchlist', 'org_memberships is a user-org membership map; org_watchlist is a team-shared watchlist (migration 077). Different roles.'],
  ['org_watchlist', 'user_item_state', 'org_watchlist is a team-shared watchlist; user_item_state is personal per-user item state. Different roles/grain despite both being watchlist-adjacent.'],
  ['org_watchlist', 'workspace_tags', 'org_watchlist is a team-shared watchlist; workspace_tags is org-owned tag definitions. Different roles.'],
  ['user_item_state', 'workspace_tags', 'user_item_state is personal per-user item state; workspace_tags is org-owned tag definitions. Different roles.'],
  ['org_watchlist', 'workspace_item_overrides', 'org_watchlist is a team-shared watchlist; workspace_item_overrides is per-org overrides (priority/archive/notes) on platform items (migration-documented, "platform data is never mutated"). Different roles.'],
  ['org_invitations', 'org_memberships', 'org_invitations is the pending-invite lifecycle (migration 076); org_memberships is confirmed membership. Related lifecycle stages (an invitation becomes a membership) but intentionally distinct tables, not a duplicate.'],
  ['holdings_quality', 'intelligence_item_citations', 'holdings_quality is a per-capture completeness audit index; intelligence_item_citations is a brief-to-source citation edge table. Entirely different roles, sharing only structural/generic id-shaped columns.'],
  ['org_invitations', 'workspace_tags', 'org_invitations is the pending-invite lifecycle; workspace_tags is org-owned tag definitions. Unrelated roles.'],
];

test('CALIBRATION: recall on the 8 DUP-1-confirmed positives (live schema snapshot, no allowlist)', () => {
  const scored = POSITIVES.map(([a, b]) => {
    const columnTypeMaps = buildColumnTypeMaps(snapshot.columns);
    const df = columnDocFrequency(columnTypeMaps);
    const commentByTable = new Map(snapshot.tables.map((t) => [t.table, t.comment]));
    const evidence = scorePair(a, b, { columnTypeMaps, df, commentByTable });
    return { a, b, score: evidence.score };
  });
  const caught = scored.filter((s) => s.score >= CANDIDATE_THRESHOLD);
  const missed = scored.filter((s) => s.score < CANDIDATE_THRESHOLD);
  // Recall target: 7 of 8 (87.5%). The one miss (census_worklist<->coverage_gap_candidates) was
  // investigated, not silently dropped (see this file's calibration data above, and this lane's
  // session-log): the two tables share ZERO non-structural columns, ZERO table-name tokens, and no
  // code file references both directly, a real, verified gap, not a tuning failure. A future edit that
  // widens or narrows recall must update this assertion deliberately, not by accident.
  assert.equal(caught.length, 7, `expected 7/8 positives caught, got ${caught.length}: missed ${missed.map((m) => `${m.a}<->${m.b} (${m.score.toFixed(3)})`).join(', ')}`);
  assert.deepEqual(missed.map((m) => [m.a, m.b].sort()), [['census_worklist', 'coverage_gap_candidates']]);
});

test('CALIBRATION: precision on the 15 hand-labelled negatives (live schema snapshot, no allowlist)', () => {
  const columnTypeMaps = buildColumnTypeMaps(snapshot.columns);
  const df = columnDocFrequency(columnTypeMaps);
  const commentByTable = new Map(snapshot.tables.map((t) => [t.table, t.comment]));
  const scored = NEGATIVES.map(([a, b, reason]) => {
    const evidence = scorePair(a, b, { columnTypeMaps, df, commentByTable });
    return { a, b, reason, score: evidence.score };
  });
  const stillFlagged = scored.filter((s) => s.score >= CANDIDATE_THRESHOLD);
  // Target: 14 of 15 correctly drop below threshold (precision on this labelled set = 7/(7+1) = 0.875 when
  // combined with the 7 true positives above). The one that remains (user_item_state<->
  // workspace_item_overrides) is itself a legitimate "parallel-by-design" pair per its own table comment,
  // not embarrassing noise like the pre-calibration top pair (org_memberships<->user_watchlist, now 0).
  assert.equal(stillFlagged.length, 1, `expected only 1/15 negatives to still clear the threshold, got ${stillFlagged.length}: ${stillFlagged.map((s) => `${s.a}<->${s.b} (${s.score.toFixed(3)})`).join(', ')}`);
  assert.deepEqual([stillFlagged[0].a, stillFlagged[0].b].sort(), ['user_item_state', 'workspace_item_overrides']);
});

test('CALIBRATION: the previously-worst false positive (org_memberships<->user_watchlist) now scores 0', () => {
  const columnTypeMaps = buildColumnTypeMaps(snapshot.columns);
  const df = columnDocFrequency(columnTypeMaps);
  const commentByTable = new Map(snapshot.tables.map((t) => [t.table, t.comment]));
  const evidence = scorePair('org_memberships', 'user_watchlist', { columnTypeMaps, df, commentByTable });
  assert.equal(evidence.score, 0);
});
