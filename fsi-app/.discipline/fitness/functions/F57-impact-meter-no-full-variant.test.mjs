// Red-then-green for F57 (impact-meter-no-full-variant). Rule 15: a guard is proven by attack, not
// by presence, this feeds the pure check() function synthetic source text carrying the exact
// forbidden mount, before asserting anything about the live repo tree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { fitnessFunction, findFullVariantMounts } from './F57-impact-meter-no-full-variant.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../');

test('RED: <ImpactMeter variant="full"> in a live surface is flagged with file:line', () => {
  const src = 'export function Rail() {\n  return <ImpactMeter scores={s} variant="full" />;\n}';
  const v = fitnessFunction.check('fsi-app/src/components/ui/SomeRailCard.tsx', src);
  assert.equal(v.length, 1);
  assert.equal(v[0].line, 2);
  assert.match(v[0].message, /variant="full"/);
});

test('RED: extra props before/after variant="full" are still flagged', () => {
  const src = '<ImpactMeter scores={scores} band={band} variant="full" className="x" />';
  const v = fitnessFunction.check('fsi-app/src/components/detail/SomeSurface.tsx', src);
  assert.equal(v.length, 1);
});

test('RED: a mount formatted one prop per line (the prevailing style in larger components) is still flagged, at its own opening line', () => {
  const src = [
    'export function Rail() {',
    '  return (',
    '    <ImpactMeter',
    '      scores={scores}',
    '      variant="full"',
    '    />',
    '  );',
    '}',
  ].join('\n');
  const v = fitnessFunction.check('fsi-app/src/components/ui/SomeRailCard.tsx', src);
  assert.equal(v.length, 1);
  assert.equal(v[0].line, 3, 'reports the line the tag OPENS on, not the line variant="full" sits on');
});

test('GREEN: a multi-line mount with an inline `{}` expression carrying its own ">" (e.g. a comparison) does not confuse the tag-close scan', () => {
  const src = [
    '<ImpactMeter',
    '  scores={scores}',
    '  label={n > 3 ? "many" : "few"}',
    '/>',
  ].join('\n');
  assert.deepEqual(fitnessFunction.check('fsi-app/src/components/detail/SomeSurface.tsx', src), []);
});

test('GREEN: the default (row/stepped) variant is never flagged', () => {
  const src = '<ImpactMeter scores={scores} />';
  assert.deepEqual(fitnessFunction.check('fsi-app/src/components/detail/SomeSurface.tsx', src), []);
});

test('GREEN: variant="row" (or any non-"full" value) is never flagged', () => {
  const src = '<ImpactMeter scores={scores} variant="row" />';
  assert.deepEqual(fitnessFunction.check('fsi-app/src/components/detail/SomeSurface.tsx', src), []);
});

test('a comment mentioning variant="full" (documenting the retirement) is never flagged, only live code', () => {
  const src = '// the old block used <ImpactMeter variant="full" /> here\nconst x = 1;';
  assert.deepEqual(fitnessFunction.check('fsi-app/src/components/detail/SomeSurface.tsx', src), []);
});

test('findFullVariantMounts: multiple instances in one file are each reported', () => {
  const src = '<ImpactMeter variant="full" />\n<div />\n<ImpactMeter variant="full" />';
  assert.deepEqual(findFullVariantMounts(src), [1, 3]);
});

test('ImpactMeter.tsx itself (the variant\'s own declaration) is excluded from enumeration', () => {
  for (const f of fitnessFunction.enumerate()) {
    assert.notEqual(f, 'fsi-app/src/components/ui/ImpactMeter.tsx');
  }
});

test('test files are excluded from enumeration', () => {
  for (const f of fitnessFunction.enumerate()) {
    assert.doesNotMatch(f, /\.(?:test|selftest|npmtest)\.mjs$/);
  }
});

test('LIVE: the whole scoped tree passes F57 clean as of lane PARITY-PARTS, 2026-09-24', () => {
  const problems = [];
  for (const f of fitnessFunction.enumerate()) {
    const content = readFileSync(resolve(REPO_ROOT, f), 'utf8');
    const v = fitnessFunction.check(f, content);
    if (v.length) problems.push(`${f}: ${v.map((x) => `${x.line}: ${x.message}`).join(' | ')}`);
  }
  assert.deepEqual(problems, []);
});
