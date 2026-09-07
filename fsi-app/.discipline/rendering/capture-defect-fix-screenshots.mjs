// One-off capture script (DEFECT-FIX lane uxfix-detail, 2026-09-07). Screenshots the surfaces items
// 2.3/3.1/3.2/1.2/3.3 touched, at 1440 wide, for artboard comparison. Reuses the SAME fixture data
// other guard files already mount — never a second copy of a fixture — via harness.mjs's
// bundleEntry/newSmokePage/mountBundle, the same mechanism capture-detail-mobile-screenshots.mjs
// uses for the mobile legs. Not part of the discipline gate set; run by hand.
//
// Usage: NO_PROXY="$NO_PROXY,smoke-guard.internal" PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers \
//   node .discipline/rendering/capture-defect-fix-screenshots.mjs

import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { bundleEntry, newSmokePage, mountBundle } from './smoke/harness.mjs';
import { REGULATION_ENTRY, REGULATION_STATES, ALIAS } from './smoke/detail-surfaces-smoke.mjs';
import { fullAppCss } from './smoke/smoke-fixtures.mjs';
import { getRepoRoot } from '../lib/context.mjs';

const STYLE_INJECT = `
(() => {
  const style = document.createElement('style');
  style.textContent = ${JSON.stringify(fullAppCss())};
  document.head.appendChild(style);
})();
`;

const { chromium } = createRequire(import.meta.url)('playwright');
const OUT_DIR = join(getRepoRoot(), 'docs/design/handoff-2026-09-06/built');

// Real OperationsLedger DIMENSIONS (six, regulatory_feasibility first) — mirrors the module's own
// array so this screenshot proves the ACTUAL production dimension set, not a spec's abbreviated
// 3-dimension fixture (operations-rows-smoke.mjs's MATRIX_STATES uses labor/energy/long for wrap
// stress, a different purpose). regulatory_feasibility carries NO facts (its real production shape,
// per region-grid.test.mjs) so the empty cells prove the Absence convention (item 3.3).
const MATRIX_ENTRY = `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { RegionDimensionMatrix } from '@/components/operations/RegionDimensionMatrix';
let root = null;
window.__mount = (props) => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(React.createElement(RegionDimensionMatrix, props));
};
`;
const REGIONS = [
  { key: 'EU', label: 'European Union' },
  { key: 'US', label: 'United States' },
  { key: 'ASIA', label: 'Asia' },
  { key: 'UK', label: 'United Kingdom' },
  { key: 'UAE', label: 'UAE' },
];
const DIMENSIONS = [
  { key: 'regulatory', db: 'regulatory_feasibility', name: 'Regulatory feasibility' },
  { key: 'regional', db: 'regional_resources', name: 'Regional resources' },
  { key: 'labor', db: 'labor_markets', name: 'Labor markets' },
  { key: 'materials', db: 'materials_sourcing', name: 'Materials sourcing' },
  { key: 'infra', db: 'infrastructure', name: 'Infrastructure' },
  { key: 'cost', db: 'operational_cost', name: 'Operational cost' },
];
const FACTS = [
  { region_code: 'EU', dimension: 'regional_resources', fact_label: 'Renewable share', value: '42%', status: 'sourced', source_note: null, source_name: 'Eurostat', source_url: 'https://example.com', last_updated: '2026-08-01', freshness: 'current' },
  { region_code: 'US', dimension: 'labor_markets', fact_label: 'Median manufacturing wage', value: '$24/hr', status: 'sourced', source_note: null, source_name: 'BLS', source_url: 'https://example.com', last_updated: '2026-08-01', freshness: 'current' },
  { region_code: 'ASIA', dimension: 'operational_cost', fact_label: 'Industrial power price', value: '$0.09/kWh', status: 'sourced', source_note: null, source_name: 'IEA', source_url: 'https://example.com', last_updated: '2026-08-01', freshness: 'current' },
];

async function shot(browser, { name, entry, alias, props, width = 1440, height = 1400 }) {
  const bundleJs = await bundleEntry(entry, alias ? { alias } : undefined);
  const page = await newSmokePage(browser, { apiRoutes: [] });
  await page.setViewportSize({ width, height });
  await mountBundle(page, bundleJs, '__mount', props);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
  const out = join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: out, fullPage: true });
  console.log(`wrote ${out}`);
  await page.close();
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch(
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}
  );

  // Items 2.3 (no second ask box), 3.1 (no Immediate dropdown in the action row), 3.2 (+ Tag is the
  // one trigger), 1.2 (title style unconditional) — all four live on RegulationDetailSurface's
  // long-title-long-breadcrumb state, the same fixture detail-surfaces-smoke.mjs's own guard mounts.
  await shot(browser, {
    name: '2.3-3.1-3.2-1.2-regulation-detail',
    entry: REGULATION_ENTRY,
    alias: ALIAS,
    props: REGULATION_STATES[0].props,
  });

  // Item 3.3 — the real six-dimension matrix, regulatory_feasibility (D1) carrying zero facts so its
  // column renders the Absence convention end to end.
  await shot(browser, {
    name: '3.3-operations-regions-matrix',
    entry: MATRIX_ENTRY,
    props: { regions: REGIONS, dimensions: DIMENSIONS, facts: FACTS },
    height: 900,
  });

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
