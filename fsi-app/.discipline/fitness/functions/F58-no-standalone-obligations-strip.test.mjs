// Red-then-green for F58 (no-standalone-obligations-strip). Rule 15: a guard is proven by attack,
// not by presence - this feeds the pure check() function synthetic source text carrying the exact
// forbidden mount, before asserting anything about the live repo tree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { fitnessFunction, findDetailVariantMounts } from './F58-no-standalone-obligations-strip.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../');

test('RED: <UpcomingObligationsStrip variant="detail"> on a detail surface is flagged with file:line', () => {
  const src = 'export function Page() {\n  return <UpcomingObligationsStrip variant="detail" itemId={r.id} />;\n}';
  const v = fitnessFunction.check('fsi-app/src/components/regulations/RegulationDetailSurface.tsx', src);
  assert.equal(v.length, 1);
  assert.equal(v[0].line, 2);
  assert.match(v[0].message, /variant="detail"/);
});

test('RED: a mount formatted one prop per line is still flagged, at its own opening line', () => {
  const src = [
    'export function Page() {',
    '  return (',
    '    <UpcomingObligationsStrip',
    '      variant="detail"',
    '      itemId={r.id}',
    '    />',
    '  );',
    '}',
  ].join('\n');
  const v = fitnessFunction.check('fsi-app/src/components/pages/MarketSignalDetailSurface.tsx', src);
  assert.equal(v.length, 1);
  assert.equal(v[0].line, 3, 'reports the line the tag OPENS on, not the line variant="detail" sits on');
});

test('GREEN: variant="list" (the unaffected list-strip mount) is never flagged', () => {
  const src = '<UpcomingObligationsStrip variant="list" />';
  assert.deepEqual(fitnessFunction.check('fsi-app/src/app/regulations/page.tsx', src), []);
});

test('GREEN: no variant prop at all (defaults to "list" per the component itself) is never flagged', () => {
  const src = '<UpcomingObligationsStrip />';
  assert.deepEqual(fitnessFunction.check('fsi-app/src/app/market/page.tsx', src), []);
});

test('a comment mentioning variant="detail" (documenting the removal) is never flagged, only live code', () => {
  const src = '// the old block used <UpcomingObligationsStrip variant="detail" /> here\nconst x = 1;';
  assert.deepEqual(fitnessFunction.check('fsi-app/src/components/regulations/RegulationDetailSurface.tsx', src), []);
});

test('findDetailVariantMounts: multiple instances in one file are each reported', () => {
  const src = '<UpcomingObligationsStrip variant="detail" />\n<div />\n<UpcomingObligationsStrip variant="detail" />';
  assert.deepEqual(findDetailVariantMounts(src), [1, 3]);
});

test('enumerate(): exactly the four detail-surface files, nothing else', () => {
  assert.deepEqual(
    fitnessFunction.enumerate().slice().sort(),
    [
      'fsi-app/src/components/operations/OperationsDetailSurface.tsx',
      'fsi-app/src/components/pages/MarketSignalDetailSurface.tsx',
      'fsi-app/src/components/regulations/RegulationDetailSurface.tsx',
      'fsi-app/src/components/research/ResearchFindingDetailSurface.tsx',
    ].sort()
  );
});

test('LIVE: all four detail surfaces pass F58 clean as of lane PARITY-PARTS, 2026-09-25', () => {
  const problems = [];
  for (const f of fitnessFunction.enumerate()) {
    const content = readFileSync(resolve(REPO_ROOT, f), 'utf8');
    const v = fitnessFunction.check(f, content);
    if (v.length) problems.push(`${f}: ${v.map((x) => `${x.line}: ${x.message}`).join(' | ')}`);
  }
  assert.deepEqual(problems, []);
});
