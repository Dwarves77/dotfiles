// One-off capture script (lane compose-lists, 2026-09-08): screenshots of the REAL
// RegulationsLedger/MarketIntelLedger/ResearchLedger/OperationsLedger/WatchlistSurface components
// (bundled and mounted the SAME way the rendering guard's own SM smoke specs do — harness.mjs's
// bundleEntry/newSmokePage/mountBundle, real esbuild bundle of the actual src/components/**
// module, no reproduction) at 1440px with POPULATED fixture data, for a side-by-side comparison
// against each artboard PNG under docs/design/handoff-2026-09-06/screens/. No live Supabase
// project in this sandbox (confirmed by prior lanes' DEVIATION-LOG entries) means a real
// `next dev` navigation to /regulations etc. renders the honest empty/Absence state, not the
// artboard's example data — this harness sidesteps that the same way the guard's own smoke specs
// already do, by mounting the real component with fixture props instead of going through a live
// route.
//
// Usage: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node .discipline/rendering/capture-compose-lists-screenshots.mjs

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

const EMPTY_AGGREGATES = {
  totalItems: 0,
  byPriority: { CRITICAL: 0, HIGH: 0, MODERATE: 0, LOW: 0 },
  byStatus: {},
  byJurisdiction: {},
  totalJurisdictions: 0,
  lastUpdatedAt: null,
};

const JURISDICTIONS = ['EU', 'US', 'UK', 'Global'];
const MODES = [['ocean'], ['air'], ['road'], ['ocean', 'air'], ['rail']];
const TOPICS = ['Emissions & carbon pricing', 'Sustainable fuels & energy', 'Green transport standards', 'ESG reporting'];
const BANDS = ['CRITICAL', 'CRITICAL', 'CRITICAL', 'HIGH', 'HIGH', 'HIGH', 'MODERATE', 'MODERATE', 'LOW'];

function reg(i) {
  const jurisdiction = JURISDICTIONS[i % JURISDICTIONS.length];
  return {
    id: `reg-${i}`,
    domain: 1,
    title: `Regulation fixture ${i}: cross-border reporting duty amendment`,
    note: 'Short regulation note.',
    type: 'regulation',
    priority: BANDS[i % BANDS.length],
    added: `2026-0${(i % 8) + 1}-0${(i % 9) + 1}`,
    jurisdiction,
    jurisdictionIso: [jurisdiction],
    modes: MODES[i % MODES.length],
    topic: TOPICS[i % TOPICS.length],
    sourceTier: (i % 6) + 1,
    citationCount: i % 4 === 0 ? null : 2,
    biasTags: [],
    itemGrade: 'record',
    reasoning: '',
    tags: [],
    complianceDeadline: `2026-${String(9 + (i % 3)).padStart(2, '0')}-${String(5 + (i % 20)).padStart(2, '0')}`,
    timeline: [{ date: '2027-06-01', label: 'Compliance deadline', status: 'future' }],
  };
}

const REG_ROWS = Array.from({ length: 24 }, (_, i) => reg(i));

function byPriorityOf(rows) {
  const counts = { CRITICAL: 0, HIGH: 0, MODERATE: 0, LOW: 0 };
  for (const r of rows) counts[r.priority] = (counts[r.priority] ?? 0) + 1;
  return counts;
}
function byJurisdictionOf(rows) {
  const counts = {};
  for (const r of rows) counts[r.jurisdiction] = (counts[r.jurisdiction] ?? 0) + 1;
  return counts;
}

const REGULATIONS_ENTRY = `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { RegulationsLedger } from '@/components/regulations/RegulationsLedger';
let root = null;
window.__mount = (props) => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(React.createElement(RegulationsLedger, props));
};
`;

function marketRow(i) {
  const jurisdiction = JURISDICTIONS[i % JURISDICTIONS.length];
  return {
    id: `mkt-${i}`,
    domain: 4,
    title: `Market signal fixture ${i}: spot-rate divergence on the trans-Pacific lane`,
    note: 'Short signal note.',
    type: 'signal',
    priority: BANDS[i % BANDS.length],
    added: `2026-0${(i % 8) + 1}-1${i % 9}`,
    jurisdiction,
    jurisdictionIso: [jurisdiction],
    modes: MODES[i % MODES.length],
    sourceTier: (i % 6) + 1,
    severity: ['action_required', 'cost_alert', 'window_closing', 'competitive_edge', 'monitoring'][i % 5],
    tags: [],
    reasoning: '',
    complianceDeadline: `2026-${String(9 + (i % 3)).padStart(2, '0')}-${String(5 + (i % 20)).padStart(2, '0')}`,
    timeline: [{ date: '2027-03-01', label: 'Window closes', status: 'future' }],
  };
}
const MARKET_ROWS = Array.from({ length: 20 }, (_, i) => marketRow(i));

const MARKET_ENTRY = `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MarketIntelLedger } from '@/components/market/MarketIntelLedger';
let root = null;
window.__mount = (props) => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(React.createElement(MarketIntelLedger, props));
};
`;

const CAPTURES = [
  {
    out: 'compose-02-regulations-list.png',
    entry: REGULATIONS_ENTRY,
    props: {
      initialResources: REG_ROWS,
      initialArchived: [],
      aggregates: {
        ...EMPTY_AGGREGATES,
        totalItems: REG_ROWS.length,
        byPriority: byPriorityOf(REG_ROWS),
        byJurisdiction: byJurisdictionOf(REG_ROWS),
        totalJurisdictions: 4,
        lastUpdatedAt: '2026-09-04T00:00:00Z',
      },
      hasMore: false,
    },
  },
  {
    out: 'compose-04-market-list.png',
    entry: MARKET_ENTRY,
    props: {
      initialResources: MARKET_ROWS,
      aggregates: {
        ...EMPTY_AGGREGATES,
        totalItems: MARKET_ROWS.length,
        byPriority: byPriorityOf(MARKET_ROWS),
        byJurisdiction: byJurisdictionOf(MARKET_ROWS),
        totalJurisdictions: 4,
        lastUpdatedAt: '2026-09-03T00:00:00Z',
      },
    },
  },
];

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch(
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {},
  );
  for (const cap of CAPTURES) {
    const bundleJs = await bundleEntry(cap.entry);
    const page = await newSmokePage(browser, {
      apiRoutes: [{ urlGlob: '**/api/listings/rest**', handler: (route) => route.fulfill({ json: { resources: [], archived: [] } }) }],
    });
    await page.setViewportSize({ width: 1440, height: 1200 });
    await mountBundle(page, bundleJs, '__mount', cap.props);
    await page.evaluate(() => new Promise((r) => setTimeout(r, 300)));
    const outPath = join(OUT_DIR, cap.out);
    await page.screenshot({ path: outPath, fullPage: true });
    console.log(`wrote ${outPath}`);
    await page.close();
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
