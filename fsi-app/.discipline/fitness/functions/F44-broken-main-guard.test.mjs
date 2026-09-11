// Red-then-green for F44 (broken-main-guard). A NEW instance of the broken
// `import.meta.url === (backtick)file://${process.argv[1]}(backtick)` idiom anywhere under
// fsi-app/scripts/** or fsi-app/.discipline/** is RED, with or without the `|| argv[1]?.endsWith(...)`
// fallback some call sites had already grown. See this function's own header for the defect.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { fitnessFunction, findBrokenMainGuards } from './F44-broken-main-guard.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../');

// The broken idiom is built from parts at test time so this file itself never carries the literal
// text (which would make it, unhelpfully, an instance of its own fixture).
const BROKEN_LITERAL = 'import.meta.url === `file://${process.argv[1]}`';

test('RED: the bare broken idiom in an `if` guard is flagged with file:line', () => {
  const src = `if (${BROKEN_LITERAL}) {\n  main();\n}`;
  const v = fitnessFunction.check('fsi-app/scripts/new-script.mjs', src);
  assert.equal(v.length, 1);
  assert.equal(v[0].line, 1);
  assert.match(v[0].message, /isMainModule/);
});

test('RED: the broken idiom with a trailing endsWith fallback is still flagged', () => {
  const src = `if (${BROKEN_LITERAL} || process.argv[1]?.endsWith('new-script.mjs')) {`;
  const v = fitnessFunction.check('fsi-app/scripts/new-script.mjs', src);
  assert.equal(v.length, 1);
});

test('RED: the assignment-to-variable shape is also flagged', () => {
  const src = `const isMain = Boolean(process.argv[1]) && ${BROKEN_LITERAL};`;
  const v = fitnessFunction.check('fsi-app/.discipline/governance/new-map.mjs', src);
  assert.equal(v.length, 1);
});

test('GREEN: isMainModule(import.meta.url) is never flagged', () => {
  const src = 'if (isMainModule(import.meta.url)) {\n  main();\n}';
  assert.deepEqual(fitnessFunction.check('fsi-app/scripts/new-script.mjs', src), []);
});

test('GREEN: the inlined pathToFileURL/resolve idiom (the .discipline/governance carve-out) is never flagged', () => {
  const src = 'if (Boolean(process.argv[1]) && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {';
  assert.deepEqual(fitnessFunction.check('fsi-app/.discipline/governance/new-map.mjs', src), []);
});

test('a comment mentioning the broken idiom (documenting history) is never flagged, only live code', () => {
  const src = `// the old bug used ${BROKEN_LITERAL} here\nconst x = 1;`;
  assert.deepEqual(fitnessFunction.check('fsi-app/scripts/new-script.mjs', src), []);
});

test('findBrokenMainGuards: multiple instances in one file are each reported', () => {
  const src = `if (${BROKEN_LITERAL}) {}\nif (${BROKEN_LITERAL}) {}`;
  const lines = findBrokenMainGuards(src);
  assert.deepEqual(lines, [1, 2]);
});

test('test files are excluded from enumeration (a fixture constructing the broken idiom as a literal string is not a live call site)', () => {
  for (const f of fitnessFunction.enumerate()) {
    assert.doesNotMatch(f, /\.(?:test|selftest|npmtest)\.mjs$/);
  }
});

test('LIVE: the whole scoped tree (fsi-app/scripts + fsi-app/.discipline) passes F44 clean as of task 0.3b', () => {
  const problems = [];
  for (const f of fitnessFunction.enumerate()) {
    const content = readFileSync(resolve(REPO_ROOT, f), 'utf8');
    const v = fitnessFunction.check(f, content);
    if (v.length) problems.push(`${f}: ${v.map((x) => `${x.line}: ${x.message}`).join(' | ')}`);
  }
  assert.deepEqual(problems, []);
});
