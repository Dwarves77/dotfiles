// Tests for the shared fitness reading helpers added by lane GATE-8 (2026-10-08): code-scan.mjs, table-access.mjs,
// sql-mask.mjs, yml-read.mjs. Each case is a form the AUD-AT-4 register found a per-function regex missing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { views, overrideLines, lineOfIndex, foldedText, hasCodeIdentifier, isTestOrFixturePath } from './code-scan.mjs';
import { tableCalls, tableWriteLines, rawSqlLines, stringConstants, matchClose } from './table-access.mjs';
import { maskSql, sqlLineOf } from './sql-mask.mjs';
import { readWorkflowTriggers, extractWorkflowRunNames, hasWorkflowTrigger, workflowInvocationText, packageCommandInvocationText } from './yml-read.mjs';
import { isOverridden } from './file-content.mjs';

// ── code-scan ───────────────────────────────────────────────────────────────────────────────────────

test('overrideLines: a marker in a real comment counts; the same text inside a string does not; line numbers are 1-based', () => {
  const src = 'a();\nconst s = "// fitness-allow: F9 (forged)";\nb(); // fitness-allow: F9 (real reason)\n/* fitness-allow: F9 (block) */';
  assert.deepEqual([...overrideLines(src, 'F9')], [3, 4]);
  assert.deepEqual([...overrideLines(src, 'F10')], []);
  assert.deepEqual([...overrideLines('x(); // fitness-allow: F9 ()', 'F9')], [], 'a marker needs a non-empty reason');
});

test('isOverridden (the per-line form every function uses) reads only the comment text of the line', () => {
  assert.equal(isOverridden('go(); // fitness-allow: F13 (one-shot)', 'F13'), true);
  assert.equal(isOverridden('const m = "// fitness-allow: F13 (forged)";', 'F13'), false);
  assert.equal(isOverridden('const m = `// fitness-allow: F13 (forged)`; go();', 'F13'), false);
  assert.equal(isOverridden('# fitness-allow: F13 (a hash comment line)', 'F13'), true);
  assert.equal(isOverridden('go(); // fitness-allow: F14 (other function)', 'F13'), false);
});

test('views / foldedText / hasCodeIdentifier / lineOfIndex / isTestOrFixturePath', () => {
  const src = 'const a = "x" + "y"; // note\nuse(thing);';
  const v = views(src);
  assert.equal(v.code.includes('note'), false);
  assert.equal(v.text.includes('x'), true);
  assert.equal(v.comments.trim(), '// note');
  assert.equal(foldedText(src).includes('"xy"'), true);
  assert.equal(hasCodeIdentifier(src, 'thing'), true);
  assert.equal(hasCodeIdentifier('// thing\nconst s = "thing";', 'thing'), false);
  assert.equal(hasCodeIdentifier('const thinger = 1;', 'thing'), false, 'a longer identifier is a different identifier');
  assert.equal(lineOfIndex('a\nb\nc', 4), 3);
  assert.equal(isTestOrFixturePath('a/b.test.mjs'), true);
  assert.equal(isTestOrFixturePath('a/__tests__/b.ts'), true);
  assert.equal(isTestOrFixturePath('a/b.mjs'), false);
});

// ── table-access ────────────────────────────────────────────────────────────────────────────────────

test('tableCalls: literal, template, constant and split-name tables; the whole chain is walked; a comment is not a call', () => {
  const src = [
    'const T = "sources";',
    'sb.from("intelligence_items").select("id").eq("a", 1)',
    '  .eq("b", 2).insert(row);',
    'sb.from(`derived_values`).select("*");',
    'sb.from(T).upsert(row);',
    'sb.from("so" + "urces").update(x);',
    '// sb.from("ghost").insert(1)',
    'const s = \'sb.from("ghost2").insert(1)\';',
  ].join('\n');
  const calls = tableCalls(src);
  assert.deepEqual(calls.map((c) => c.table), ['intelligence_items', 'derived_values', 'sources', 'sources']);
  assert.deepEqual(calls[0].methods.map((m) => m.name), ['select', 'eq', 'eq', 'insert']);
  assert.deepEqual(tableWriteLines(src, 'intelligence_items'), [2]);
  assert.equal(tableWriteLines(src, 'sources').includes(5), true, 'an upsert through a constant is a write');
  assert.equal(tableWriteLines(src, 'sources').includes(6), false, 'an update is not an insert or upsert');
  assert.deepEqual(tableWriteLines(src, 'ghost'), []);
  assert.deepEqual(tableWriteLines(src, 'ghost2'), []);
});

test('rawSqlLines finds INSERT INTO / FROM <table> in strings and templates, not in comments', () => {
  const src = 'q("INSERT INTO sources (a) VALUES (1)");\n// INSERT INTO sources\nq(`SELECT * FROM public.derived_values`);';
  assert.deepEqual(rawSqlLines(src, 'INSERT\\s+INTO', 'sources'), [1]);
  assert.deepEqual(rawSqlLines(src, 'FROM|JOIN', 'derived_values'), [3]);
});

test('stringConstants and matchClose', () => {
  assert.equal(stringConstants('const A = "x"; let B = \'y\'; var C = `z`; const D = `a${1}`;').size, 3);
  assert.equal(matchClose('f(a(b)c)', 1), 7);
  assert.equal(matchClose('f(((', 1), -1);
});

// ── sql-mask ────────────────────────────────────────────────────────────────────────────────────────

test('maskSql: comments are blanked, a -- inside a string is not a comment, dollar-quoted bodies are code', () => {
  const sql = "SELECT 'a--b'; -- real\n/* block */ CREATE FUNCTION f() RETURNS int AS $fn$ BEGIN -- inner\n RETURN 'it''s'; END $fn$;";
  const m = maskSql(sql);
  assert.equal(m.includes('a--b'), true);
  assert.equal(m.includes('real'), false);
  assert.equal(m.includes('block'), false);
  assert.equal(m.includes('inner'), false);
  assert.equal(m.includes('RETURN'), true);
  assert.equal(m.length, sql.length);
  assert.equal(maskSql("SELECT 'a--b'", { keepStrings: false }).includes('a--b'), false);
  assert.equal(sqlLineOf('a\nb\nc', 4), 3);
});

test('maskSql: an apostrophe in dollar-quoted prose does not swallow the rest of the file', () => {
  const sql = "COMMENT ON TABLE t IS $$it's prose$$;\nCREATE TABLE after_it (id int);";
  assert.equal(maskSql(sql).includes('CREATE TABLE after_it'), true);
});

// ── yml-read ────────────────────────────────────────────────────────────────────────────────────────

test('readWorkflowTriggers: scalar, list, flow-mapping and block forms; heredocs and comments are not triggers', () => {
  assert.deepEqual([...readWorkflowTriggers('on: workflow_dispatch\n').triggers], ['workflow_dispatch']);
  assert.deepEqual([...readWorkflowTriggers('on: [push, workflow_dispatch]\n').triggers], ['push', 'workflow_dispatch']);
  assert.deepEqual([...readWorkflowTriggers('on: { push: {}, workflow_run: { workflows: ["A"] } }\n').triggers], ['push', 'workflow_run']);
  assert.deepEqual([...readWorkflowTriggers('on:\n  push:\n    branches: [master]\n  workflow_dispatch:\n').triggers], ['push', 'workflow_dispatch']);
  assert.deepEqual([...readWorkflowTriggers('on:\n  - push\n  - workflow_dispatch\n').triggers], ['push', 'workflow_dispatch']);
  assert.equal(hasWorkflowTrigger('on:\n  push:\njobs:\n  a:\n    steps:\n      - run: |\n          workflow_dispatch:\n', 'workflow_dispatch'), false);
  assert.equal(readWorkflowTriggers('name: x\njobs: {}\n').workflowRun, null);
});

test('extractWorkflowRunNames: inline list, block list, flow mapping, quoted and bare names', () => {
  assert.deepEqual(extractWorkflowRunNames('on:\n  workflow_run:\n    workflows: ["A", \'B\']\n'), ['A', 'B']);
  assert.deepEqual(extractWorkflowRunNames('on:\n  workflow_run:\n    workflows:\n      - "A"\n      - B\n    types: [completed]\n'), ['A', 'B']);
  assert.deepEqual(extractWorkflowRunNames('on:\n  workflow_run: { workflows: [A, B] }\n'), ['A', 'B']);
  assert.deepEqual(extractWorkflowRunNames('on: { workflow_run: { workflows: ["Source sweep"], types: [completed] } }\n'), ['Source sweep']);
  assert.equal(extractWorkflowRunNames('on:\n  push:\n'), null);
});

test('workflowInvocationText and packageCommandInvocationText drop comments and echo lines', () => {
  const t = workflowInvocationText('# a.mjs\n- run: node b.mjs # c.mjs\n- run: echo d.mjs\n- run: printf e.mjs\n  name: f.mjs');
  assert.equal(t.includes('b.mjs'), true);
  for (const gone of ['a.mjs', 'c.mjs', 'd.mjs', 'e.mjs']) assert.equal(t.includes(gone), false, gone);
  assert.equal(t.includes('f.mjs'), true);
  assert.equal(packageCommandInvocationText('echo x.mjs && node y.mjs ; printf z.mjs | cat').includes('y.mjs'), true);
  assert.equal(packageCommandInvocationText('echo x.mjs && node y.mjs').includes('x.mjs'), false);
});
