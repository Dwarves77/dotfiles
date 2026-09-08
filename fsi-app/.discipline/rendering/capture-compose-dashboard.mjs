// One-off capture (lane compose-dashboard-details, 2026-09-08): populated fixture screenshot of
// DashboardBrief for the page-composition side-by-side against artboard 01-dashboard.png. This
// sandbox has no reachable Supabase project (DEVIATION-LOG.md), so mounts the REAL component with
// fixture data — same in-process esbuild+Playwright technique dashboard-brief-smoke.mjs's own
// exported ENTRY/bundle already uses, with a fuller state (5 due-next rows, 6 changed rows,
// populated aggregates 14/31/1135/254) than the existing 'one-row' fixture, to match artboard
// content depth for the composition side-by-side.
//
// Usage: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node .discipline/rendering/capture-compose-dashboard.mjs

import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { bundleEntry, newSmokePage, mountBundle } from './smoke/harness.mjs';
import { ENTRY as DASHBOARD_ENTRY } from './smoke/dashboard-brief-smoke.mjs';
import { getRepoRoot } from '../lib/context.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');

const OUT_DIR = join(getRepoRoot(), 'docs/design/handoff-2026-09-06/built');

const POPULATED_AGGREGATES = {
  totalItems: 1434,
  byPriority: { CRITICAL: 14, HIGH: 31, MODERATE: 1135, LOW: 254 },
  byStatus: {},
  byJurisdiction: {},
  totalJurisdictions: 61,
  lastUpdatedAt: null,
};

const SURFACE_COVERAGE = {
  intelligence: { regulations: 1316, marketIntel: 55, research: 39, operations: 25, uncategorized: 0, totalIntelligence: 1435 },
  community: { activeGroups: 7, activeThreads: 0 },
};

const TITLES = [
  'Mexico SEMARNAT — emissions reporting requirements for maritime carriers',
  'Regulation (EU) 2024/1157 on shipment of waste',
  'EUDR — EU Deforestation Regulation',
  'EU PPWR 2025/40 — Packaging and Packaging Waste Regulation',
  'EU Emissions Trading System (ETS) extension to maritime transport',
];

function dueResource(i) {
  return {
    id: `r${i}`,
    title: TITLES[i],
    priority: 'CRITICAL',
    jurisdiction: i % 2 === 0 ? 'MX' : 'EU',
    jurisdictionIso: [i % 2 === 0 ? 'MX' : 'EU'],
    sourceTier: (i % 2) + 1,
    complianceDeadline: '2026-11-18',
    impactScores: { cost: 2, compliance: 3, client: 1, operational: 2 },
    timeline: [],
    domain: 1,
    type: 'regulation',
    modes: ['Ocean'],
    topic: 'reporting',
    note: '',
    tags: [],
  };
}

const CHANGE_TITLES = [
  'Regulation (EU) 2026/1030 — GHG accounting',
  'Delegated Regulation (EU) 2016/2071',
  'OECD ITF Decarbonising Transport Initiative',
  'The Road Traffic (Vehicle Emissions) (Fixed Penalty)',
  'The Single Use Carrier Bags Charge (Wales)',
  'Application for Authorization to Transmit',
];

function changeRow(i) {
  return {
    id: `c${i}`,
    title: CHANGE_TITLES[i],
    priority: i < 1 ? 'HIGH' : i < 2 ? 'MODERATE' : 'LOW',
    added: '2026-09-06',
    itemType: 'regulation',
    domain: 1,
  };
}

const PROPS = {
  resources: Array.from({ length: 5 }, (_, i) => dueResource(i)),
  recentChanges: Array.from({ length: 6 }, (_, i) => changeRow(i)),
  auditDate: '2026-09-06',
  aggregates: POPULATED_AGGREGATES,
  surfaceCoverage: SURFACE_COVERAGE,
  __watchlist: [
    { id: 'w1', title: 'EU PPWR 2025/40', href: '/regulations/eu-ppwr-2025-40', band: 'immediate', dueLabel: 'Next: Dec 31', days: 116, watchedAgo: '1 mo ago' },
  ],
};

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch(
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}
  );
  const bundleJs = await bundleEntry(DASHBOARD_ENTRY);
  const page = await newSmokePage(browser);
  await page.setViewportSize({ width: 1440, height: 1400 });
  await mountBundle(page, bundleJs, '__mount', PROPS);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
  const out = join(OUT_DIR, 'compose-01-dashboard-brief.png');
  await page.screenshot({ path: out, fullPage: true });
  console.log(`wrote ${out}`);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
