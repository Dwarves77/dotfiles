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
//
// The committed evidence under built/ is the SIDE-BY-SIDE composite (artboard | built), not the raw
// built PNG this script writes. Compose one from a `*-built.png` this script produced with:
//   python3 -c "from PIL import Image,ImageDraw; a=Image.open(A); b=Image.open(B); \
//     o=Image.new('RGB',(a.width+24+b.width,max(a.height,b.height)+44),(240,238,234)); \
//     o.paste(a,(0,44)); o.paste(b,(a.width+24,44)); o.save(OUT)"

import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { bundleEntry, newSmokePage, mountBundle } from './smoke/harness.mjs';
import { AUDIT_MOUNTS } from './audit/mounts.mjs';
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

function seriesRow(key, label, displayValue, pct1w) {
  return {
    seriesKey: key,
    id: key,
    label,
    displayValue,
    emptyReason: null,
    asAtDate: '2026-09-03',
    referencePeriod: null,
    observationCount: 12,
    sourceKey: 'fixture',
    sourceRef: null,
    unit: null,
    currency: null,
    derivation: null,
    originClass: null,
    methodVersion: null,
    nObservations: 12,
    deltas: {
      count: 12,
      latest: { date: '2026-09-03', value: 1, unit: null, currency: null },
      sparkline: Array.from({ length: 6 }, (_, i) => ({ date: `2026-0${i + 1}-01`, value: 1 + i * 0.05 })),
      delta1w: { value: pct1w / 100, pct: pct1w, fromDate: '2026-08-27' },
      delta1m: { value: (pct1w * 2) / 100, pct: pct1w * 2, fromDate: '2026-08-03' },
      deltaYoY: { insufficientHistory: true },
      message: null,
    },
  };
}
const SERIES_BOARD = {
  groups: [
    {
      keyPrefix: 'fixture',
      name: 'Fixture producer',
      implemented: true,
      cadence: 'weekly',
      sourceName: 'Fixture',
      sourceUrl: '',
      licenceStatus: 'ok',
      state: 'populated',
      series: [
        seriesRow('diesel', 'Diesel · EU avg benchmark', '€1,217/1000L', -1.7),
        seriesRow('e95', 'Euro-Super 95', '€1,014/1000L', 0.7),
        seriesRow('hfo', 'Heavy Fuel Oil 3.5%', '€535/t', -8.1),
        seriesRow('rfo', 'Residual Fuel Oil', '€646/t', 1.8),
      ],
    },
  ],
  unregistered: [],
  totalObservedSeries: 4,
  totalProducers: 1,
  implementedProducerCount: 1,
  isEmpty: false,
};

// SERIES_BOARD is embedded as a literal in the bundle entry (not passed through mountBundle's
// props, which are structured-cloned across the page.evaluate boundary and cannot carry a React
// element) so headlineSeries can be built INSIDE the bundle from the real MarketComparativeRibbon.
const MARKET_ENTRY = `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MarketIntelLedger } from '@/components/market/MarketIntelLedger';
import { MarketComparativeRibbon } from '@/components/market/MarketComparativeRibbon';
const SERIES_BOARD = ${JSON.stringify(SERIES_BOARD)};
let root = null;
window.__mount = (props) => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(React.createElement(MarketIntelLedger, {
    ...props,
    seriesBoard: SERIES_BOARD,
    headlineSeries: React.createElement(MarketComparativeRibbon, { board: SERIES_BOARD, embedded: true }),
  }));
};
`;

// Research fixture (lane comp-06, 2026-09-08, artboard 06/id="p6"). Real `Resource` shape as
// getPublicResearchItems() returns it: a `theme` DB-column value (migration 102, mapped by
// THEME_COLUMN_TO_KEY), a `severity` value, a `sub` kind label and an `added` date spread across
// the Window row's own 7d/30d/90d buckets, so the theme cards, the Window row and the band
// sections all have something true to render.
const RESEARCH_THEMES = ['emissions_accounting', 'fuels_saf', 'last_mile_electrification', 'disclosure_regimes'];
const RESEARCH_SUBS = ['initiative', 'think tank', 'active data platform', 'peer-reviewed journal'];
const RESEARCH_BANDS = ['HIGH', 'MODERATE', 'LOW', 'LOW', 'LOW', 'LOW'];

function researchRow(i, today) {
  const jurisdiction = JURISDICTIONS[i % JURISDICTIONS.length];
  const added = new Date(today.getTime() - (i * 6 + 1) * 86400000).toISOString().slice(0, 10);
  return {
    id: `res-${i}`,
    domain: 7,
    title: `Research finding fixture ${i}: measured abatement across the ocean leg`,
    note: 'Short finding note.',
    type: 'Finding',
    sub: RESEARCH_SUBS[i % RESEARCH_SUBS.length],
    priority: RESEARCH_BANDS[i % RESEARCH_BANDS.length],
    added,
    jurisdiction,
    jurisdictionIso: [jurisdiction],
    modes: MODES[i % MODES.length],
    theme: RESEARCH_THEMES[i % RESEARCH_THEMES.length],
    severity: ['cost_alert', 'monitoring', 'competitive_edge'][i % 3],
    sourceTier: 3,
    tags: [],
    reasoning: '',
    timeline: i % 3 === 0 ? [{ date: '2026-12-01', label: 'MEPC session', status: 'future' }] : undefined,
  };
}
const RESEARCH_ROWS = Array.from({ length: 20 }, (_, i) => researchRow(i, new Date()));

const RESEARCH_ENTRY = `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ResearchLedger } from '@/components/research/ResearchLedger';
let root = null;
window.__mount = (props) => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(React.createElement(ResearchLedger, props));
};
`;

const CAPTURES = [
  {
    out: 'compose-06-research-built.png',
    entry: RESEARCH_ENTRY,
    props: {
      resources: RESEARCH_ROWS,
      aggregates: {
        ...EMPTY_AGGREGATES,
        totalItems: RESEARCH_ROWS.length,
        byPriority: byPriorityOf(RESEARCH_ROWS),
        byJurisdiction: byJurisdictionOf(RESEARCH_ROWS),
        totalJurisdictions: 4,
        lastUpdatedAt: '2026-09-06T00:00:00Z',
      },
      sourceCoverage: [
        { transportMode: 'ocean', jurisdictionIso: 'EU', sourceCount: 18 },
        { transportMode: 'road', jurisdictionIso: 'US', sourceCount: 14 },
        { transportMode: 'air', jurisdictionIso: 'UK', sourceCount: 11 },
        { transportMode: 'rail', jurisdictionIso: 'Global', sourceCount: 3 },
      ],
    },
  },
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
  {
    // Artboard 08 (lane comp-08, 2026-09-08). Entry and fixture come from the audit mount registry
    // rather than a third copy here, so the compose-08 spec and this evidence PNG measure the
    // IDENTICAL mount: one fixture, two readers.
    out: 'compose-08-operations-built.png',
    entry: AUDIT_MOUNTS['compose-08-operations'].entry,
    props: null,
  },
];

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch(
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {},
  );
  // Optional substring filter (argv[2]) so a lane re-capturing ONE page does not pay for all of
  // them; no argument keeps the original behaviour (capture every entry).
  const only = process.argv[2];
  for (const cap of CAPTURES.filter((c) => !only || c.out.includes(only))) {
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
