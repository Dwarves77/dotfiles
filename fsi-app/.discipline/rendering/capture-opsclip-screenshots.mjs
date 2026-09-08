// One-off capture script (lane opsclip, train 61, 2026-09-08). Screenshots the two surfaces this
// lane's defect fixes change shape on, at 1440 wide, and MEASURES the two numbers the production
// click-through measured, so the fix is proven against the same yardstick that found the defect:
//
//   - the matrix scroll container (.cl-scroll-shadow): production clientWidth 750, scrollWidth 948;
//   - the IMPACT column header: production rendered "IMPACT LOW → H", losing the word HIGH.
//
// Reuses the same fixture mechanism the other capture scripts use (harness.mjs's bundleEntry /
// newSmokePage / mountBundle) rather than a second copy of a fixture. The matrix fixture carries
// PROSE values of the shape the audit read off production's United Kingdom column, because a
// short-figure fixture cannot reproduce the defect this lane fixes. Not part of the gate set; run
// by hand.
//
// Usage: NO_PROXY="$NO_PROXY,smoke-guard.internal" PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers \
//   node .discipline/rendering/capture-opsclip-screenshots.mjs

import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { bundleEntry, newSmokePage, mountBundle } from './smoke/harness.mjs';
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

const MATRIX_ENTRY = `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { RegionDimensionMatrix } from '@/components/operations/RegionDimensionMatrix';
let root = null;
window.__mount = (props) => {
  const el = document.getElementById('smoke-root');
  el.style.maxWidth = '780px';
  el.style.margin = '20px auto';
  if (!root) root = createRoot(el);
  root.render(React.createElement(RegionDimensionMatrix, props));
};
`;

const HEADER_ENTRY = `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ListRow, ListRowColumnHeader } from '@/components/ui/ListRow';
import { BAND_ORDER } from '@/lib/urgency/bands';
let root = null;
window.__mount = (props) => {
  const el = document.getElementById('smoke-root');
  el.style.maxWidth = '780px';
  el.style.margin = '20px auto';
  el.style.background = '#fff';
  if (!root) root = createRoot(el);
  root.render(
    React.createElement(
      'div',
      { 'data-guard-container': 'opsclip-header-card' },
      React.createElement(ListRowColumnHeader, { dueLabel: 'Due' }),
      ...props.rows.map((r, i) =>
        React.createElement(ListRow, {
          key: i,
          href: '/regulations/x',
          band: BAND_ORDER[i % BAND_ORDER.length],
          jurisdiction: r.jurisdiction,
          title: r.title,
          meta: r.meta,
          impact: r.impact,
          due: r.due,
          timeline: null,
          tier: r.tier,
        }),
      ),
    ),
  );
};
`;

// The artboard's own five regions (dc.html p8 header row).
const REGIONS = [
  { key: 'EU', label: 'European Union' },
  { key: 'US', label: 'United States' },
  { key: 'ASIA', label: 'Asia · SG + HK' },
  { key: 'UK', label: 'United Kingdom' },
  { key: 'UAE', label: 'UAE · Dubai' },
];
// The real six-dimension set (OperationsLedger's DIMENSIONS), D1 first and carrying no facts.
const DIMENSIONS = [
  { key: 'regulatory', db: 'regulatory_feasibility', name: 'Regulatory feasibility' },
  { key: 'regional', db: 'regional_resources', name: 'Regional resource availability' },
  { key: 'labor', db: 'labor_markets', name: 'Labor markets' },
  { key: 'materials', db: 'materials_sourcing', name: 'Materials sourcing' },
  { key: 'infra', db: 'infrastructure', name: 'Infrastructure capacity' },
  { key: 'cost', db: 'operational_cost', name: 'Operational cost' },
];
const f = (region, dimension, fact_label, value) => ({
  region_code: region, dimension, fact_label, value, status: 'sourced', source_note: null,
  source_name: 'Eurostat lc_lci_lev', source_url: 'https://example.com', last_updated: '2026-05-28',
  freshness: 'current',
});
// Two shapes, both real: a short figure (the artboard's own case) and a full sentence (the shape
// the audit read off the United Kingdom column, which is what the display face turned into a wall).
const FACTS = [
  f('EU', 'labor_markets', 'Labour cost, business economy, mean across member states', '€40.4 / hr'),
  f('US', 'labor_markets', 'First-line supervisors, transportation and material moving, median', '$60,000 / yr'),
  f('ASIA', 'labor_markets', 'Warehouse worker monthly wage; top earners to HKD 30,000', 'HKD 14,747 / mo'),
  f('UK', 'labor_markets', 'Class 1 driver-handler plus overtime; handler average GBP 26,725', '£40-42k / yr'),
  f('UAE', 'labor_markets', 'Private-sector salary growth, logistics and warehousing', '3-6% / yr'),
  f('UK', 'materials_sourcing', 'Extended producer responsibility', 'EPR compliance costs reached GBP 1.1 billion in 2023 and the recovered fibre market stayed volatile: household collections delivered 1.894M tonnes in 2023, compressing gate fees.'),
  f('UK', 'materials_sourcing', 'Wood packaging', 'All wood packaging entering the market requires ISPM-15 heat treatment and a registered mark, with spot checks at the border.'),
  f('ASIA', 'materials_sourcing', 'Recycled content', 'Recycled content mandates apply from 2027 for beverage containers placed on the Singapore market.'),
];

const ROWS = [
  { jurisdiction: 'EU', title: 'EU Emissions Trading System (ETS) extension to maritime transport', meta: 'directive · ocean · reporting', impact: { evidence: 2, agreement: 2, authority: 2, relevance: 2, urgency: 2, breadth: 2 }, due: { label: 'Sep 30, 2026', days: '22 days' }, tier: 1 },
  { jurisdiction: 'US', title: 'Iowa DNR air quality programs and compliance monitoring dashboard', meta: 'programme · road', impact: null, due: null, tier: null },
];

async function shot(browser, { name, entry, props, width = 1440, height = 1200, measure }) {
  const bundleJs = await bundleEntry(entry);
  const page = await newSmokePage(browser, { apiRoutes: [] });
  await page.setViewportSize({ width, height });
  await mountBundle(page, bundleJs, '__mount', props);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
  if (measure) console.log(`${name}:`, JSON.stringify(await page.evaluate(measure)));
  const out = join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: out, fullPage: true });
  console.log(`wrote ${out}`);
  await page.close();
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch(
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {},
  );

  await shot(browser, {
    name: 'opsclip-01-operations-matrix-1440',
    entry: MATRIX_ENTRY,
    props: { regions: REGIONS, dimensions: DIMENSIONS, facts: FACTS },
    height: 1000,
    measure: () => {
      const el = document.querySelector('.cl-scroll-shadow');
      const ths = [...document.querySelectorAll('thead th')].map((t) => t.getBoundingClientRect().width);
      return { clientWidth: el.clientWidth, scrollWidth: el.scrollWidth, overflowBy: el.scrollWidth - el.clientWidth, columnWidths: ths.map(Math.round) };
    },
  });

  // The PROSE case on its own: only the materials_sourcing rows are supplied, so that dimension is
  // the first holding facts and opens by default. This is the shape the audit read off production's
  // United Kingdom column — the one that was set in the display face at ~17px over 15+ lines.
  await shot(browser, {
    name: 'opsclip-03-operations-matrix-prose-1440',
    entry: MATRIX_ENTRY,
    props: { regions: REGIONS, dimensions: DIMENSIONS, facts: FACTS.filter((x) => x.dimension === 'materials_sourcing') },
    height: 800,
  });

  await shot(browser, {
    name: 'opsclip-02-list-row-header-1440',
    entry: HEADER_ENTRY,
    props: { rows: ROWS },
    height: 320,
    measure: () => {
      const cells = [...document.querySelectorAll('.cl-list-row-header > span')];
      return cells.map((c) => ({
        text: (c.textContent || '').trim(),
        w: Math.round(c.getBoundingClientRect().width),
        overflowX: c.scrollWidth - c.clientWidth,
        overflowY: c.scrollHeight - c.clientHeight,
      })).filter((c) => c.text);
    },
  });

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
