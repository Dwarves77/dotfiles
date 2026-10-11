// Selftests for the UI-orphan pure core (fixtures only, no DB, no fs). Calibrated on the audit's own
// known finding (RW-2/UI-3: state_cost_facts, read by /api/ask and supabase-server.ts, written by
// nothing) plus labelled negatives, per docs/plans/data-machine-tool-gaps-2026-09-25.md build order step 3
// ("known UI-orphan cases and known unrun producers must be detected; add labelled negatives").
// Run: node --test fsi-app/scripts/verify/lib/ui-orphan-scan.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSelectList,
  scanUiSelects,
  extractCodeWriteColumns,
  extractOpaqueWriteTables,
  extractSqlWriteColumns,
  extractFunctionBodies,
  findUiOrphanFields,
  staleUiOrphanAllowlistEntries,
} from './ui-orphan-scan.mjs';

test('parseSelectList: bare columns, alias:column, and embed_table(nested) recursion', () => {
  const got = parseSelectList('id, jurisdiction_code:jurisdiction, sources ( id, tier )');
  assert.deepEqual(got.map((f) => f.column), ['id', 'jurisdiction', 'sources', 'id', 'tier']);
});

test('GATE-FIX-2 parseSelectList: alias:column carries the alias as the prop name, the column stays the bound column', () => {
  const got = parseSelectList('id, jurisdiction_code:jurisdiction, label : name!inner, v::text, a:b::int');
  assert.deepEqual(got, [
    { column: 'id' },
    { column: 'jurisdiction', alias: 'jurisdiction_code' },
    { column: 'name', alias: 'label' },
    { column: 'v' },
    { column: 'b', alias: 'a' },
  ]);
});

test('GATE-FIX-2 scanUiSelects: the alias reaches the selected entry, a bare column carries none', () => {
  const content = 'await supabase.from("t").select("shown:real_col, plain_col");';
  const { selected } = scanUiSelects([{ file: 'src/components/A.tsx', content }]);
  assert.deepEqual(selected, [
    { table: 't', column: 'real_col', file: 'src/components/A.tsx', alias: 'shown' },
    { table: 't', column: 'plain_col', file: 'src/components/A.tsx' },
  ]);
});

test('parseSelectList: does not fragment on commas nested inside an embed', () => {
  const got = parseSelectList('id, child ( a, b, c )');
  assert.deepEqual(got.map((f) => f.column), ['id', 'child', 'a', 'b', 'c']);
});

test('scanUiSelects: extracts (table, column) pairs and rpc calls from UI-facing file text', () => {
  const content = [
    'const { data } = await supabase.from("state_cost_facts").select("id, value_numeric, currency");',
    'const { data: r } = await supabase.rpc("compute_thing", { id });',
  ].join('\n');
  const { selected, rpcCalls } = scanUiSelects([{ file: 'src/app/api/ask/route.ts', content }]);
  assert.deepEqual(
    selected.map((s) => `${s.table}.${s.column}`),
    ['state_cost_facts.id', 'state_cost_facts.value_numeric', 'state_cost_facts.currency'],
  );
  assert.deepEqual(rpcCalls.map((r) => r.name), ['compute_thing']);
});

test('extractCodeWriteColumns: resolves table from the nearest preceding .from(), keys from the object literal', () => {
  const content = 'await supabase.from("sources").update({ tier: 2, base_tier: 1 }).eq("id", id);';
  const got = extractCodeWriteColumns(content);
  assert.deepEqual(got.map((w) => `${w.table}.${w.column}`).sort(), ['sources.base_tier', 'sources.tier']);
});

test('extractCodeWriteColumns: recognizes guarded-write helpers with an explicit table-name argument', () => {
  const content = 'await guardedInsert("regional_data_facts", { value_numeric: 1, unit: "t" }, { cite });';
  const got = extractCodeWriteColumns(content);
  assert.deepEqual(got.map((w) => `${w.table}.${w.column}`).sort(), ['regional_data_facts.unit', 'regional_data_facts.value_numeric']);
});

test('extractCodeWriteColumns: a bare-variable insert with no nearby object literal yields nothing (conservative)', () => {
  const content = 'await supabase.from("sources").insert(payload);';
  assert.deepEqual(extractCodeWriteColumns(content), []);
});

test('extractOpaqueWriteTables: a variable payload (emission_factors-common.mjs shape) is caught as opaque, an object literal is not', () => {
  const content = [
    'const toWrite = rows.map(buildRow);',
    'const res = await insertFn("emission_factors", toWrite, { cite, select: "factor_id" });',
    'await supabase.from("sources").update({ tier: 2 });',
  ].join('\n');
  const tables = extractOpaqueWriteTables(content);
  assert.ok(tables.has('emission_factors'));
  assert.ok(!tables.has('sources')); // literal-payload write, resolved by extractCodeWriteColumns instead
});

test('extractOpaqueWriteTables: .from(T).insert(variable) is opaque', () => {
  const content = 'await supabase.from("sources").insert(payload);';
  assert.ok(extractOpaqueWriteTables(content).has('sources'));
});

test('extractSqlWriteColumns: INSERT INTO column list and UPDATE SET columns', () => {
  const sql = [
    "INSERT INTO public.sources (id, tier, base_tier) VALUES ($1, $2, $3);",
    "UPDATE sources SET tier = 3, base_tier = 2 WHERE id = $1;",
  ].join('\n');
  const got = extractSqlWriteColumns(sql).map((w) => `${w.table}.${w.column}`).sort();
  assert.deepEqual(got, ['sources.base_tier', 'sources.base_tier', 'sources.id', 'sources.tier', 'sources.tier']);
});

test('extractFunctionBodies: extracts a named function body between AS $tag$ ... $tag$', () => {
  const sql = [
    'CREATE OR REPLACE FUNCTION compute_thing(id uuid)',
    'RETURNS void AS $$',
    'BEGIN',
    '  UPDATE sources SET tier = 5 WHERE sources.id = id;',
    'END;',
    '$$ LANGUAGE plpgsql;',
  ].join('\n');
  const bodies = extractFunctionBodies(sql);
  assert.ok(bodies.get('compute_thing').includes('UPDATE sources SET tier = 5'));
});

test('findUiOrphanFields: KNOWN POSITIVE (RW-2/UI-3 shape), state_cost_facts.value_numeric is UI-selected, ' +
  'in scope, and has zero writers anywhere; flagged', () => {
  const uiSelected = [{ table: 'state_cost_facts', column: 'value_numeric', file: 'src/app/api/ask/route.ts' }];
  const scopedKeys = new Set(['state_cost_facts.value_numeric']);
  const orphans = findUiOrphanFields({
    uiSelected,
    rpcCalls: [],
    writerColumns: new Set(), // no writer anywhere in the corpus, the audit's own live finding
    rpcFunctionBodies: new Map(),
    scopedKeys,
    allowlist: {},
  });
  assert.deepEqual(orphans.map((o) => `${o.table}.${o.column}`), ['state_cost_facts.value_numeric']);
  assert.match(orphans[0].evidence, /0 writers/);
});

test('findUiOrphanFields: LABELLED NEGATIVE, a UI-selected field WITH a code writer is not flagged', () => {
  const uiSelected = [{ table: 'sources', column: 'tier', file: 'src/lib/supabase-server.ts' }];
  const scopedKeys = new Set(['sources.tier']);
  const orphans = findUiOrphanFields({
    uiSelected,
    rpcCalls: [],
    writerColumns: new Set(['sources.tier']),
    rpcFunctionBodies: new Map(),
    scopedKeys,
    allowlist: {},
  });
  assert.deepEqual(orphans, []);
});

test('findUiOrphanFields: LABELLED NEGATIVE, a field out of scope (PK/FK/generated/timestamp) is never flagged', () => {
  const uiSelected = [{ table: 'sources', column: 'created_at', file: 'src/lib/supabase-server.ts' }];
  const orphans = findUiOrphanFields({
    uiSelected,
    rpcCalls: [],
    writerColumns: new Set(),
    rpcFunctionBodies: new Map(),
    scopedKeys: new Set(), // created_at excluded upstream by scopedColumns (timestamp type)
    allowlist: {},
  });
  assert.deepEqual(orphans, []);
});

test('findUiOrphanFields: LABELLED NEGATIVE, an allowlisted zero-writer field is not flagged', () => {
  const uiSelected = [{ table: 'estimated_values', column: 'value', file: 'src/app/api/ask/route.ts' }];
  const scopedKeys = new Set(['estimated_values.value']);
  const orphans = findUiOrphanFields({
    uiSelected,
    rpcCalls: [],
    writerColumns: new Set(),
    rpcFunctionBodies: new Map(),
    scopedKeys,
    allowlist: { 'estimated_values.value': { reason: 'ADR-xyz: designed-only, awaiting W4 writer' } },
  });
  assert.deepEqual(orphans, []);
});

test('findUiOrphanFields: an RPC-joined write covers a UI-selected field (coarse whole-body join)', () => {
  const uiSelected = [{ table: 'sources', column: 'tier', file: 'src/app/api/ask/route.ts' }];
  const rpcCalls = [{ name: 'compute_thing', file: 'src/app/api/ask/route.ts' }];
  const rpcFunctionBodies = new Map([['compute_thing', 'UPDATE sources SET tier = 5 WHERE id = $1;']]);
  const orphans = findUiOrphanFields({
    uiSelected,
    rpcCalls,
    writerColumns: new Set(),
    rpcFunctionBodies,
    scopedKeys: new Set(['sources.tier']),
    allowlist: {},
  });
  assert.deepEqual(orphans, []);
});

test('findUiOrphanFields: LABELLED NEGATIVE, a table with an opaque write call (emission_factors shape) ' +
  'is never flagged, even with zero literal writer-column keys', () => {
  const uiSelected = [{ table: 'emission_factors', column: 'tier', file: 'src/app/admin/factors/page.tsx' }];
  const orphans = findUiOrphanFields({
    uiSelected,
    rpcCalls: [],
    writerColumns: new Set(), // the helper-built row's keys are not literal, so writerColumns is empty
    opaqueWriteTables: new Set(['emission_factors']),
    rpcFunctionBodies: new Map(),
    scopedKeys: new Set(['emission_factors.tier']),
    allowlist: {},
  });
  assert.deepEqual(orphans, []);
});

test('findUiOrphanFields: dedupes a repeated orphan pair selected from multiple files into one report row', () => {
  const uiSelected = [
    { table: 'state_cost_facts', column: 'value_numeric', file: 'src/app/api/ask/route.ts' },
    { table: 'state_cost_facts', column: 'value_numeric', file: 'src/lib/supabase-server.ts' },
  ];
  const orphans = findUiOrphanFields({
    uiSelected,
    rpcCalls: [],
    writerColumns: new Set(),
    rpcFunctionBodies: new Map(),
    scopedKeys: new Set(['state_cost_facts.value_numeric']),
    allowlist: {},
  });
  assert.equal(orphans.length, 1);
});

test('staleUiOrphanAllowlistEntries: flags an entry that now has a writer, and one no longer in scope', () => {
  const stale = staleUiOrphanAllowlistEntries({
    scopedKeys: new Set(['t.a']),
    writerColumns: new Set(['t.a']),
    allowlist: { 't.a': { reason: 'was orphan' }, 't.dropped': { reason: 'gone' } },
  });
  assert.deepEqual(stale.map((s) => s.key).sort(), ['t.a', 't.dropped']);
});

// ---- DATA-1 (2026-10-11): an injected guarded-write alias (`guardedInsertFn(`) is a writer ------------------------------

test('RED then GREEN: guardedInsertFn / guardedUpdateFn aliases are write calls (opaque payload marks the table, literal payload gives columns)', () => {
  const opaque = 'const res = await guardedInsertFn("state_cost_facts", row, { cite: CITE });';
  assert.ok(extractOpaqueWriteTables(opaque).has('state_cost_facts'), 'a variable payload through the alias is an opaque write');
  const literal = 'await deps.guardedInsertFn("regional_data_facts", { ...rest, region_id: regionId, source_id: rated.source_id }, { cite: CITE });';
  assert.deepEqual(extractCodeWriteColumns(literal).map((w) => `${w.table}.${w.column}`).sort(), ['regional_data_facts.region_id', 'regional_data_facts.source_id']);
  // the lowercase-i alias and the bare names keep working
  assert.ok(extractOpaqueWriteTables('await insertFn("emission_factors", toWrite, { cite });').has('emission_factors'));
  assert.ok(extractOpaqueWriteTables('await guardedInsert("t_one", payload, { cite });').has('t_one'));
  // a name that merely CONTAINS the alias is not one
  assert.ok(!extractOpaqueWriteTables('await myguardedInsertFn("t_two", payload, { cite });').has('t_two'));
});

test('the real state-cost-facts producer is seen as a writer of state_cost_facts (the nightly reported its 9 fields as write-orphans)', async () => {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const src = readFileSync(fileURLToPath(new URL('../../producers/regional/state-cost-facts-producer.mjs', import.meta.url)), 'utf8');
  assert.ok(extractOpaqueWriteTables(src).has('state_cost_facts'));
});
