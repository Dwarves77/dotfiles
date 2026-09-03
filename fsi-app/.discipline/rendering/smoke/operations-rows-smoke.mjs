// UX smoke spec: Operations rows. Lane MOBILE, 2026-09-03, RD-60/F35. Mounts the REAL
// `OperationsLedger`, `OperationsItemsView` and `RegionDimensionMatrix`
// (src/components/operations/{OperationsLedger,OperationsItemsView,RegionDimensionMatrix}.tsx)
// via ux-harness.mjs's `runUxSpec`, each in its empty / one-row / extreme-length-title states,
// measured at 375x812 and 1280x800 for law-2 targets and squeezed-title wrap (ux-assert.mjs).
//
// ROOT CAUSE FIXED, OperationsLedger / OperationsItemsView (screenshot 02-operations-items, one
// word per line): OperationsItemsView's item card used a fixed `1fr 220px` grid — at 375px the
// title column got ~1fr of a 375px card minus padding/gap/220px, so every word wrapped onto its
// own line. Fixed with `.cl-ops-item-card` (globals.css): the right column drops below the title,
// full width, at <=640px. OperationsLedger's own region-card head row already used the shared
// `.cl-row`-style flex-wrap pattern; its region title carries `data-guard-title`.
//
// ROOT CAUSE FIXED, RegionDimensionMatrix (screenshot 01-operations-regions, text off the right
// edge): the region x dimension table is wider than a phone viewport by design (5 regions x 6
// dimensions); it was ALREADY wrapped in its own `overflowX: auto` container (pre-existing, not
// this lane's change) so the table scrolls inside itself rather than the page overflowing
// horizontally — this spec's guard (assertGuardClean, body scrollWidth vs clientWidth) proves that
// holds for real data. What this lane added: the dimension-name `<td>` carries `data-guard-title`
// and `overflowWrap: anywhere` (it previously carried neither, so the squeezed-title detector had
// nothing to measure on this component and a very long dimension name had no wrap escape).
//
// ONE SPEC FILE, THREE MOUNTS: F35's coverage scan is a text match on each component's `@/components/...`
// import string inside an ACTIVE registry entry's spec file — nothing requires one spec per
// component, and these three share one shape (Operations row/table components) and one root cause
// family, so one file registers under one name and covers all three exports (same posture as
// notifications-smoke.mjs mounting two components side by side).

import { runUxSpec } from './ux-harness.mjs';
import { fullAppCss } from './smoke-fixtures.mjs';

// OperationsLedger's own top-level layout depends on a PRE-EXISTING responsive class
// (`.cl-ops-grid`, globals.css, predates this lane) to collapse content+rail at a phone width —
// injecting only this lane's new row-system CSS subset left it un-collapsed and produced a FALSE
// overflow/squeeze failure (see smoke-fixtures.mjs's `fullAppCss` header for the full story).
// Reading the real globals.css + theme.css avoids that drift entirely.
const STYLE_INJECT = `
(() => {
  const style = document.createElement('style');
  style.textContent = ${JSON.stringify(fullAppCss())};
  document.head.appendChild(style);
})();
`;

const LEDGER_ENTRY = `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { OperationsLedger } from '@/components/operations/OperationsLedger';

let root = null;
window.__mount = (props) => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(React.createElement(OperationsLedger, props));
};
`;

const ITEMS_ENTRY = `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { OperationsItemsView } from '@/components/operations/OperationsItemsView';

let root = null;
window.__mount = (props) => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(React.createElement(OperationsItemsView, props));
};
`;

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

// `/api/listings/rest` — OperationsLedger fetches the remainder of the regulations-by-region page
// once on mount (cost-constrained first paint; see the file's own useEffect). Fail-soft on error
// (never blanks the already-rendered region cards), so an empty fixture answer is a legitimate
// "nothing more to load" response, not a special case this spec has to reproduce.
const LEDGER_API_ROUTES = [
  { urlGlob: '**/api/listings/rest**', handler: (route) => route.fulfill({ json: { resources: [] } }) },
];

const EMPTY_AGGREGATES = {
  totalItems: 0,
  byPriority: { CRITICAL: 0, HIGH: 0, MODERATE: 0, LOW: 0 },
  byStatus: {},
  byJurisdiction: {},
  totalJurisdictions: 0,
  lastUpdatedAt: null,
};

const LONG = (n, word = 'extremely-long-operations-title-token') =>
  Array.from({ length: n }, (_, i) => `${word}-${i}`).join(' ');

function opsItem(i, { long = false } = {}) {
  return {
    id: `ops-${i}`,
    title: long ? `${LONG(9)} #${i}` : `Border carbon adjustment filing window #${i}`,
    note: long ? LONG(15, 'long-note-word') : 'Short operations note.',
    type: 'regulation',
    priority: 'HIGH',
    severity: 'action_required',
    added: '2026-08-01',
    jurisdiction: 'EU',
    jurisdictionIso: ['EU'],
    sourceTier: 3,
    reasoning: '',
    tags: [],
  };
}

// ── OperationsLedger states (region cards render from DEFAULT_REGIONS regardless of
//    initialResources, so even the empty state has 5 titled region cards) ──
const LEDGER_STATES = [
  { label: 'empty', props: { initialResources: [], aggregates: EMPTY_AGGREGATES }, expectTitles: 5 },
  { label: 'one-row', props: { initialResources: [opsItem(0)], aggregates: EMPTY_AGGREGATES }, expectTitles: 5 },
  {
    label: 'extreme',
    props: { initialResources: Array.from({ length: 10 }, (_, i) => opsItem(i, { long: true })), aggregates: EMPTY_AGGREGATES },
    expectTitles: 5,
  },
];

// ── OperationsItemsView states ──
const ITEMS_STATES = [
  { label: 'empty', props: { items: [] } },
  { label: 'one-row', props: { items: [opsItem(0)] }, expectTitles: 1 },
  { label: 'extreme', props: { items: Array.from({ length: 10 }, (_, i) => opsItem(i, { long: true })) }, expectTitles: 10 },
];

// ── RegionDimensionMatrix states (dimension-name titles render from `dimensions`
//    regardless of `facts`, so all three states carry the same expectTitles) ──
const REGIONS = [
  { key: 'EU', label: 'European Union' },
  { key: 'US', label: 'United States' },
  { key: 'ASIA', label: 'Asia' },
  { key: 'UK', label: 'United Kingdom' },
  { key: 'UAE', label: 'UAE' },
];
const DIMENSIONS = [
  { key: 'labor', db: 'labor_cost', name: 'Labor cost' },
  { key: 'energy', db: 'energy_cost', name: 'Energy cost' },
  {
    key: 'long',
    db: 'long_dimension',
    name: 'extremely-long-dimension-name-token-0 extremely-long-dimension-name-token-1 extremely-long-dimension-name-token-2',
  },
];
const MATRIX_STATES = [
  { label: 'empty', props: { regions: REGIONS, dimensions: DIMENSIONS, facts: [] }, expectTitles: 3 },
  {
    label: 'one-row',
    props: {
      regions: REGIONS,
      dimensions: DIMENSIONS,
      facts: [{ region_code: 'EU', dimension: 'labor_cost', fact_label: 'Minimum wage', value: '€12/hr', status: 'sourced', source_note: null, source_name: 'EU Council', source_url: 'https://example.com', last_updated: '2026-08-01', freshness: 'current' }],
    },
    expectTitles: 3,
  },
  { label: 'extreme', props: { regions: REGIONS, dimensions: DIMENSIONS, facts: [] }, expectTitles: 3 },
];

export async function runSmoke(browser) {
  const results = await Promise.all([
    runUxSpec(browser, { name: 'operations-ledger', entry: LEDGER_ENTRY, apiRoutes: LEDGER_API_ROUTES, states: LEDGER_STATES }),
    runUxSpec(browser, { name: 'operations-items', entry: ITEMS_ENTRY, states: ITEMS_STATES }),
    runUxSpec(browser, { name: 'operations-matrix', entry: MATRIX_ENTRY, states: MATRIX_STATES }),
  ]);
  return {
    checks: results.reduce((n, r) => n + r.checks, 0),
    failures: results.flatMap((r) => r.failures),
  };
}
