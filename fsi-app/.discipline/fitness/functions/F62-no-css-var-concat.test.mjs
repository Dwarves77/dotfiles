// Red-then-green for F62 (no-css-var-concat). Rule 15: a guard is proven by attack, not by
// presence - this feeds the pure check() function synthetic source text carrying the exact
// forbidden shape (both the original `+`-concatenation and the `nextDotStyle`-style template
// literal form), before asserting anything about the live repo tree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { fitnessFunction, findCssVarConcat } from './F62-no-css-var-concat.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../');

test('RED: a string-literal concatenation of var(--token) + digits is flagged', () => {
  const src = 'const x = { backgroundColor: "var(--color-error)15" };';
  const v = fitnessFunction.check('fsi-app/src/components/sources/Fixture.tsx', src);
  assert.equal(v.length, 1);
  assert.equal(v[0].line, 1);
  assert.match(v[0].message, /var\(--token\)/);
});

test('RED: the nextDotStyle-style template-literal alpha suffix is flagged', () => {
  const src = 'const style = `0 0 0 3px var(--immediate)33`;';
  const v = fitnessFunction.check('fsi-app/src/components/ui/Fixture.ts', src);
  assert.equal(v.length, 1);
  assert.equal(v[0].line, 1);
});

test('RED: a genuine `+` concatenation of the two pieces as separate literals is flagged once joined', () => {
  // The defect as originally written: two adjacent string literals. By the time this reaches a
  // .tsx file as source text the pieces already sit next to each other on one line.
  const src = 'const x = "var(--color-primary)" + "20";\nconst y = "var(--color-primary)20";';
  const v = fitnessFunction.check('fsi-app/src/components/sources/Fixture.tsx', src);
  assert.equal(v.length, 1, 'only the already-joined literal on line 2 matches; two separate string tokens on line 1 do not form the shape');
  assert.equal(v[0].line, 2);
});

test('GREEN: tint(cssVar, percent) call sites are never flagged', () => {
  const src = 'const x = { backgroundColor: tint("var(--color-error)", 15) };';
  assert.deepEqual(fitnessFunction.check('fsi-app/src/components/sources/Fixture.tsx', src), []);
});

test('GREEN: a real color-mix() argument (space before the number) is never flagged', () => {
  const src = 'const x = `color-mix(in srgb, var(--color-error) 15%, transparent)`;';
  assert.deepEqual(fitnessFunction.check('fsi-app/src/lib/Fixture.ts', src), []);
});

test('GREEN: a bare var(--token) reference with no trailing digit is never flagged', () => {
  const src = 'const x = { color: "var(--color-error)" };';
  assert.deepEqual(fitnessFunction.check('fsi-app/src/components/sources/Fixture.tsx', src), []);
});

test('GREEN: nextDotStyle called with a raw hex literal (the fixed shape) is never flagged', () => {
  const src = 'const style = `0 0 0 3px #DC262633`;';
  assert.deepEqual(fitnessFunction.check('fsi-app/src/components/ui/Fixture.ts', src), []);
});

test('tint.ts itself is exempt (it documents the defect shape verbatim in its own header comment)', () => {
  assert.ok(!fitnessFunction.enumerate().includes('fsi-app/src/lib/tint.ts'));
});

test('findCssVarConcat: multiple instances in one file are each reported', () => {
  const src = '"var(--a)10"\n"clean"\n"var(--b)50"';
  assert.deepEqual(findCssVarConcat(src), [1, 3]);
});

test('LIVE: the whole src/**/*.{ts,tsx} scope passes F62 clean as of lane R12-13, 2026-10-01', () => {
  const problems = [];
  for (const f of fitnessFunction.enumerate()) {
    const content = readFileSync(resolve(REPO_ROOT, f), 'utf8');
    const v = fitnessFunction.check(f, content);
    if (v.length) problems.push(`${f}: ${v.map((x) => `${x.line}: ${x.message}`).join(' | ')}`);
  }
  assert.deepEqual(problems, []);
});
