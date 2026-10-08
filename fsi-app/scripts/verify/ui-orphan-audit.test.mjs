// ui-orphan-audit.test.mjs (lane AUDWIRE-1, 2026-10-08): the attack proof for the UI-orphan audit and its
// B-3 register. Fixtures only, every dependency injected, no database. One attack row per failure class:
// a field bound to a column with no producer fails; the same field with a producer passes.
// Run: node --test fsi-app/scripts/verify/ui-orphan-audit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRegister, buildWriterIndex, renderRegister, writeRegisterFile, runAudit, ARTIFACT_PATH } from './ui-orphan-audit.mjs';
import { deriveAudits } from './run-data-audit-lane.mjs';
import { scanUiSelects } from './lib/ui-orphan-scan.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

// A UI component that binds two columns of orphan_facts (nothing writes them) and two of good_facts (written).
const UI_FILE = {
  file: 'src/components/Fixture.tsx',
  content: [
    'const a = await supabase.from("orphan_facts").select("id, value_numeric, currency");',
    'const b = await supabase.from("good_facts").select("id, label, note");',
  ].join('\n'),
};
const SCHEMA = [
  { table: 'orphan_facts', column: 'id', dataType: 'uuid', udtName: 'uuid' },
  { table: 'orphan_facts', column: 'value_numeric', dataType: 'numeric', udtName: 'numeric' },
  { table: 'orphan_facts', column: 'currency', dataType: 'text', udtName: 'text' },
  { table: 'good_facts', column: 'id', dataType: 'uuid', udtName: 'uuid' },
  { table: 'good_facts', column: 'label', dataType: 'text', udtName: 'text' },
  { table: 'good_facts', column: 'note', dataType: 'text', udtName: 'text' },
];
const PKS = new Set(['orphan_facts.id', 'good_facts.id']);
const WRITER_CODE = 'await supabase.from("good_facts").update({ label: "x", note: "y" }).eq("id", 1);';

function fakeClient() {
  const state = { ended: false };
  return { state, end: async () => { state.ended = true; } };
}

function harness(over = {}) {
  const out = { logs: [], errs: [], artifacts: [] };
  const client = fakeClient();
  const deps = {
    log: (m) => out.logs.push(m),
    errorLog: (m) => out.errs.push(m),
    loadEnv: () => {},
    connect: async () => client,
    readSchema: async () => [SCHEMA, PKS, []],
    readUi: () => [UI_FILE],
    readCorpus: () => ({ codeTexts: [WRITER_CODE], sqlTexts: [] }),
    readAllowlist: () => ({}),
    writeArtifact: (p, t) => out.artifacts.push({ path: p, text: t }),
    now: () => '2026-10-08T00:00:00.000Z',
    ...over,
  };
  return { out, client, deps };
}

function registerArgs({ code = [WRITER_CODE], sql = [], allowlist = {}, schema = SCHEMA } = {}) {
  const { selected, rpcCalls } = scanUiSelects([UI_FILE]);
  const idx = buildWriterIndex({ codeTexts: code, sqlTexts: sql });
  const scopedKeys = new Set(schema.filter((c) => !PKS.has(`${c.table}.${c.column}`)).map((c) => `${c.table}.${c.column}`));
  return { uiSelected: selected, rpcCalls, ...idx, scopedKeys, allowlist };
}

test('ATTACK: a UI field bound to a column with no producer is producer=no and a finding', () => {
  const { rows, findings } = buildRegister(registerArgs());
  const orphan = rows.find((r) => r.boundColumn === 'orphan_facts.value_numeric');
  assert.deepEqual(orphan, { component: 'src/components/Fixture.tsx', prop: 'value_numeric', boundColumn: 'orphan_facts.value_numeric', producer: 'no', basis: 'none' });
  assert.deepEqual(findings.map((f) => `${f.table}.${f.column}`).sort(), ['orphan_facts.currency', 'orphan_facts.value_numeric']);
});

test('a UI field bound to a column with a code producer is producer=yes and not a finding', () => {
  const { rows, findings } = buildRegister(registerArgs());
  const good = rows.filter((r) => r.boundColumn.startsWith('good_facts.'));
  assert.deepEqual(good.map((r) => [r.boundColumn, r.producer, r.basis]), [
    ['good_facts.label', 'yes', 'column-writer'],
    ['good_facts.note', 'yes', 'column-writer'],
  ]);
  assert.equal(findings.some((f) => f.table === 'good_facts'), false);
});

test('a SQL producer and an RPC producer each turn an orphan into producer=yes', () => {
  const sql = [
    'INSERT INTO orphan_facts (value_numeric) VALUES (1);',
    "CREATE OR REPLACE FUNCTION fill_currency() RETURNS void AS $$ UPDATE orphan_facts SET currency = 'EUR'; $$ LANGUAGE sql;",
  ];
  const args = registerArgs({ sql });
  args.rpcCalls = [{ name: 'fill_currency', file: 'src/components/Fixture.tsx' }];
  const { rows, findings } = buildRegister(args);
  assert.deepEqual(rows.filter((r) => r.boundColumn.startsWith('orphan_facts.')).map((r) => r.producer), ['yes', 'yes']);
  assert.equal(findings.length, 0);
});

test('an allowlisted field is producer=no but not a finding; an opaque table write is producer=yes', () => {
  const allow = { 'orphan_facts.value_numeric': { reason: 'ruled operator-typed' } };
  const r1 = buildRegister(registerArgs({ allowlist: allow }));
  assert.equal(r1.rows.find((r) => r.boundColumn === 'orphan_facts.value_numeric').basis, 'allowlisted');
  assert.equal(r1.rows.find((r) => r.boundColumn === 'orphan_facts.value_numeric').producer, 'no');
  assert.deepEqual(r1.findings.map((f) => f.column), ['currency']);

  const r2 = buildRegister(registerArgs({ code: [WRITER_CODE, 'await supabase.from("orphan_facts").insert(rows);'] }));
  assert.deepEqual(r2.rows.filter((r) => r.boundColumn.startsWith('orphan_facts.')).map((r) => [r.producer, r.basis]), [['yes', 'opaque-table-write'], ['yes', 'opaque-table-write']]);
  assert.equal(r2.findings.length, 0);
});

test('the register and the finding list agree on every fixture shape (producer=no with basis none == findings)', () => {
  for (const args of [registerArgs(), registerArgs({ allowlist: { 'orphan_facts.currency': { reason: 'r' } } }),
    registerArgs({ code: [WRITER_CODE, 'await supabase.from("orphan_facts").insert(rows);'] })]) {
    const { rows, findings } = buildRegister(args);
    const fromRows = rows.filter((r) => r.basis === 'none').map((r) => r.boundColumn).sort();
    assert.deepEqual(fromRows, findings.map((f) => `${f.table}.${f.column}`).sort());
  }
});

test('PK and out-of-scope columns are not in the register and are counted', () => {
  const { rows, outOfScope } = buildRegister(registerArgs());
  assert.equal(rows.some((r) => r.prop === 'id'), false);
  assert.equal(outOfScope, 2);
});

test('rows list producer=no first and renderRegister carries the four B-3 columns plus the basis', () => {
  const { rows } = buildRegister(registerArgs());
  assert.equal(rows[0].producer, 'no');
  const md = renderRegister(rows, { generatedAt: '2026-10-08T00:00:00.000Z' });
  assert.match(md, /\| component \| prop \| bound column \| producer present \| basis \|/);
  assert.match(md, /\| src\/components\/Fixture\.tsx \| value_numeric \| orphan_facts\.value_numeric \| no \| none \|/);
  assert.match(md, /Rows: 4 in-scope UI-selected fields; producer present no: 2 \(findings 2, allowlisted 0\)/);
});

test('ATTACK: runAudit exits 1 on an orphan, prints the producer=no list, and writes the register artifact', async () => {
  const { out, client, deps } = harness();
  const code = await runAudit(deps);
  assert.equal(code, 1);
  assert.equal(client.state.ended, true);
  assert.equal(out.artifacts.length, 1);
  assert.equal(out.artifacts[0].path, ARTIFACT_PATH);
  assert.match(out.artifacts[0].text, /orphan_facts\.value_numeric \| no \| none/);
  assert.match(out.logs.join('\n'), /src\/components\/Fixture\.tsx \| value_numeric \| orphan_facts\.value_numeric \| none/);
  assert.match(out.errs.join('\n'), /UI-ORPHAN FIELD\(S\), 2 UI-selected in-scope field\(s\) with zero writers/);
});

test('runAudit exits 0 when every UI-selected field has a producer, and still writes the register', async () => {
  const { out, deps } = harness({
    readCorpus: () => ({ codeTexts: [WRITER_CODE, 'await supabase.from("orphan_facts").update({ value_numeric: 1, currency: "x" });'], sqlTexts: [] }),
  });
  const code = await runAudit(deps);
  assert.equal(code, 0);
  assert.equal(out.artifacts.length, 1);
  assert.match(out.logs.join('\n'), /^PASS|\nPASS, every UI-selected/m);
  assert.equal(out.errs.length, 0);
});

test('runAudit exits 1 on a stale allowlist entry (a key that now has a writer)', async () => {
  const { out, deps } = harness({
    readCorpus: () => ({ codeTexts: [WRITER_CODE, 'await supabase.from("orphan_facts").update({ value_numeric: 1, currency: "x" });'], sqlTexts: [] }),
    readAllowlist: () => ({ 'orphan_facts.currency': { reason: 'r' } }),
  });
  assert.equal(await runAudit(deps), 1);
  assert.match(out.errs.join('\n'), /STALE ALLOWLIST/);
});

test('no credentials: self-skip exit 2, nothing written, no schema read', async () => {
  let schemaRead = false;
  const { out, deps } = harness({ connect: async () => null, readSchema: async () => { schemaRead = true; return [[], new Set(), []]; } });
  assert.equal(await runAudit(deps), 2);
  assert.equal(schemaRead, false);
  assert.equal(out.artifacts.length, 0);
  assert.match(out.errs.join('\n'), /no direct-Postgres connection/);
});

test('an engine error is exit 2 (cannot verify) and the connection is closed', async () => {
  const { out, client, deps } = harness({ readSchema: async () => { throw new Error('boom'); } });
  assert.equal(await runAudit(deps), 2);
  assert.equal(client.state.ended, true);
  assert.match(out.errs.join('\n'), /engine error, boom/);
});

test('a failed artifact write does not change the verdict and the list is still printed', async () => {
  const { out, deps } = harness({ writeArtifact: () => { throw new Error('disk full'); } });
  assert.equal(await runAudit(deps), 1);
  assert.match(out.errs.join('\n'), /could not write the register/);
  assert.match(out.logs.join('\n'), /orphan_facts\.value_numeric \| none/);
});

test('writeRegisterFile creates the directory and writes the text (temp dir, never the real tree)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ui-orphan-register-'));
  try {
    const abs = writeRegisterFile(dir, ARTIFACT_PATH, 'hello\n');
    assert.equal(readFileSync(abs, 'utf8'), 'hello\n');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('REGISTRATION: the data-audit lane derives ui-orphan as a HARD audit pointing at this script', () => {
  const entry = deriveAudits().find((a) => a[0] === 'ui-orphan');
  assert.ok(entry, 'ui-orphan must be derived from its data-audit marker');
  assert.equal(entry[1], 'scripts/verify/ui-orphan-audit.mjs');
  assert.equal(entry[2], true, 'must be hard=true');
  assert.match(readFileSync(resolve(HERE, 'ui-orphan-audit.mjs'), 'utf8').split('\n')[0], /^\/\/ data-audit: label=ui-orphan hard=true$/);
});
