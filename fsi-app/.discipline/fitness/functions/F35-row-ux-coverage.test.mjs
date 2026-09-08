// Fire-tests for F35 (row UX coverage). Run: node --test fsi-app/.discipline/fitness/functions/F35-row-ux-coverage.test.mjs
// Behavioural on constructed registry/spec texts (red-then-green), plus the live-repo check that every
// ROW_COMPONENTS entry exists on disk (a listed component that was renamed would otherwise be "covered"
// by a spec importing a path that no longer exists).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { activeSpecFiles, specMounts, uncoveredComponents, stripComments, ROW_COMPONENTS, TITLE_DELEGATES, delegatesTitle, fitnessFunction } from './F35-row-ux-coverage.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REPO = join(HERE, '..', '..', '..', '..');

const REGISTRY_ACTIVE = `import { runSmoke as runMarketRowsSmoke } from './market-rows-smoke.mjs';
import { runSmoke as runHomeSmoke } from './home-sections-smoke.mjs';
export const UX_SMOKE_SPECS = [
  { name: "market-rows", run: runMarketRowsSmoke },
  // { name: "home-sections", run: runHomeSmoke },
];`;

// The alias prefix is assembled at runtime so the discipline glob-portability scanner (which reads test
// files for bare-package import strings) does not mistake these FIXTURE strings for real imports.
const AT = '@/' + 'components';
const FROM = ['fr', 'om'].join('') + " '"; // `from '` assembled, for the same reason
const imp = (rest) => `${FROM}${AT}/${rest}'`;
const SPEC_MARKET = `const ENTRY = \`\nimport { MarketIntelLedger } ${imp('market/MarketIntelLedger')};\n\`;`;

test('RED: a commented-out registry entry is not coverage; only active entries resolve to spec files', () => {
  const specs = activeSpecFiles(REGISTRY_ACTIVE);
  assert.deepEqual(specs.map((s) => s.name), ['market-rows']);
  assert.equal(specs[0].file, 'fsi-app/.discipline/rendering/smoke/market-rows-smoke.mjs');
});

test('specMounts: matches the @/components alias import with or without extension, never a name-alike', () => {
  assert.equal(specMounts(SPEC_MARKET, 'src/components/market/MarketIntelLedger.tsx'), true);
  assert.equal(specMounts(imp('market/MarketIntelLedger.tsx'), 'src/components/market/MarketIntelLedger.tsx'), true);
  assert.equal(specMounts(imp('market/MarketIntelLedgerRow'), 'src/components/market/MarketIntelLedger.tsx'), false);
});

test('RED then GREEN: uncovered components are exactly those no active spec imports', () => {
  const read = (file) => (file.endsWith('market-rows-smoke.mjs') ? SPEC_MARKET : null);
  const comps = ['src/components/market/MarketIntelLedger.tsx', 'src/components/home/HomeSurface.tsx'];
  assert.deepEqual(uncoveredComponents(REGISTRY_ACTIVE, read, comps), ['src/components/home/HomeSurface.tsx']);
  const registryBoth = REGISTRY_ACTIVE.replace('// { name: "home-sections"', '{ name: "home-sections"');
  const readBoth = (file) => (file.endsWith('home-sections-smoke.mjs') ? imp('home/HomeSurface') : read(file));
  assert.deepEqual(uncoveredComponents(registryBoth, readBoth, comps), []);
});

test('check(): a row component without data-guard-title is a violation; with it, PASS', () => {
  const file = 'fsi-app/src/components/market/MarketIntelLedger.tsx';
  assert.equal(fitnessFunction.check(file, '<p>{item.title}</p>').length, 1);
  assert.deepEqual(fitnessFunction.check(file, '<p data-guard-title>{item.title}</p>'), []);
  assert.deepEqual(fitnessFunction.check('fsi-app/src/components/market/Other.tsx', '<p>x</p>'), []);
});

// Title DELEGATION (lane comp-11, 2026-09-08). Attacked, not asserted present: each of these
// constructs the exact shape that must NOT pass alongside the one that must.
test('delegatesTitle(): importing a tracked title component is not enough — it must be rendered', () => {
  // Same assembled-string trick as SPEC_MARKET above: the portability scanner must not read these
  // FIXTURE import strings as real imports (glob-portability.test.mjs).
  const importOnly = `import { SectionHeading } ${imp("ui/SectionHeading")};\nexport function X(){ return <div/>; }`;
  assert.equal(delegatesTitle(importOnly), false, 'an unused import must not satisfy the rule');
  const rendered = `${importOnly}\n<SectionHeading title="Due next" />`;
  assert.equal(delegatesTitle(rendered), true);
});

test('delegatesTitle(): a commented-out mount does not count', () => {
  const src = `import { ListRow } ${imp("ui/ListRow")};\n// <ListRow />\n/* <ListRow /> */`;
  assert.equal(delegatesTitle(src), false);
});

test('delegatesTitle(): rendering a same-named LOCAL component with no tracked import does not count', () => {
  const src = `function SectionHeading(){ return <h2/>; }\n<SectionHeading title="x" />`;
  assert.equal(delegatesTitle(src), false, 'a page-local copy is exactly what this rule must keep failing');
});

test('check(): a tracked row component passes by delegation, and still fails with neither attribute nor delegate', () => {
  const file = 'fsi-app/src/components/dashboard/DashboardBrief.tsx';
  assert.equal(fitnessFunction.check(file, '<div>{title}</div>').length, 1);
  assert.deepEqual(
    fitnessFunction.check(file, `import { SectionHeading } ${imp("ui/SectionHeading")};\n<SectionHeading title="Due next" />`),
    [],
  );
});

test('LIVE: every TITLE_DELEGATES entry exists on disk and really carries data-guard-title', () => {
  for (const path of Object.keys(TITLE_DELEGATES)) {
    const p = join(REPO, 'fsi-app', path);
    assert.ok(existsSync(p), `${path} missing on disk`);
    assert.match(readFileSync(p, 'utf8'), /data-guard-title/, `${path} is tracked as a title delegate but carries no data-guard-title`);
  }
});

test('stripComments keeps line count', () => {
  const s = 'a\n/* b\nc */ d // e\nf';
  assert.equal(stripComments(s).split('\n').length, s.split('\n').length);
});

test('LIVE: every ROW_COMPONENTS entry exists on disk', () => {
  for (const c of Object.keys(ROW_COMPONENTS)) {
    assert.ok(existsSync(join(REPO, 'fsi-app', c)), `${c} missing on disk`);
  }
});
