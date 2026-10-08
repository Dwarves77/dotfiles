// UX smoke spec: the portfolio pages (lane S8-D, 2026-10-07; spec 00 section 5; migration 362). Mounts the REAL
// PortfolioIndexView and the REAL PortfolioDetailView (src/components/portfolio/*) via ux-harness.mjs's
// `runUxSpec` in their empty / one-row / extreme states, measured at 375, 768, 1024 and 1280 (and the 1440
// cell-bounds sweep) for overflow, a title squeezed under its longest word, placeholder literals and the law-2
// target floor (ux-assert.mjs). Fixture data only; no network, no database.
//
// MOUNTS THE VIEWS, NOT THE PAGES: /dashboard/portfolio and /dashboard/portfolio/[id] are async server
// components reading the session cookie, which this bundle has no request context for (the same reason
// search-results-smoke.mjs mounts SearchResultsView). The views are the presentational halves: pure props in,
// the real shared parts out (Masthead, PageFrame, SectionCard, RowTable, ListRow, RailCard, StatBlock).
//
// STATE AXIS. Index: signed-out / empty / three portfolios (one with a very long name). Detail: empty,
// one row, and an extreme state (four surface groups, long titles, corridors and entities, members the
// platform no longer holds, and every roll-up populated).

import { fileURLToPath } from 'node:url';
import { runUxSpec } from './ux-harness.mjs';
import { fullAppCss } from './smoke-fixtures.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ALIAS = { 'next/navigation': `${HERE}stub-next-navigation.mjs` };

const ENTRY = `
(() => {
  const style = document.createElement('style');
  style.textContent = ${JSON.stringify(fullAppCss())};
  document.head.appendChild(style);
})();
import React from 'react';
import { createRoot } from 'react-dom/client';
import { PortfolioIndexView } from '@/components/portfolio/PortfolioIndexView';
import { PortfolioDetailView } from '@/components/portfolio/PortfolioDetailView';

let root = null;
window.__mount = (props) => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  const Comp = props.kind === 'detail' ? PortfolioDetailView : PortfolioIndexView;
  root.render(React.createElement(Comp, props.props));
};
`;

const API_ROUTES = [
  {
    urlGlob: '**/api/search**',
    handler: (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ results: [] }) }),
  },
  {
    urlGlob: '**/api/workspace/portfolios**',
    handler: (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({}) }),
  },
];

const NOW_ISO = '2026-10-07T09:00:00.000Z';

const LONG = (n, word = 'extremely-long-portfolio-member-title-token') => Array.from({ length: n }, (_, i) => `${word}-${i}`).join(' ');

function itemRow(i, surface, { long = false } = {}) {
  return {
    id: `item-${surface}-${i}`,
    itemUuid: `00000000-0000-4000-8000-${String(i + (surface === 'regulations' ? 100 : surface === 'market' ? 200 : surface === 'research' ? 300 : 400)).padStart(12, '0')}`,
    surface,
    href: `/${surface}/item-${surface}-${i}`,
    priority: i % 3 === 0 ? 'CRITICAL' : i % 3 === 1 ? 'HIGH' : 'MODERATE',
    jurisdiction: i % 2 === 0 ? 'EU' : 'US',
    title: long ? `${LONG(8)} #${i}` : `Packaging and packaging waste amendment ${i}`,
    meta: long ? 'regulation · air, road, ocean, rail · packaging and extended producer responsibility' : 'regulation · ocean',
    impact: { cost: 2, compliance: 3, client: 1, operational: 2 },
    due: i % 4 === 3 ? null : { label: 'Nov 18, 2026', days: `${40 + i} days` },
    timeline: null,
    tier: i % 2 === 0 ? 1 : 3,
    watchType: 'reg',
    originClass: i % 4 === 3 ? null : 'official',
    dueDays: i % 4 === 3 ? null : 40 + i,
  };
}

const ROLLUP_EMPTY = {
  total: 0,
  items: { members: 0, held: 0, notHeld: [] },
  entities: { corridors: 0, other: 0 },
  bySurface: { regulations: 0, market: 0, research: 0, operations: 0 },
  otherSurface: 0,
  byPriority: { CRITICAL: 0, HIGH: 0, MODERATE: 0, LOW: 0, unscored: 0 },
  nextDue: null,
  origin: { weakest: null, classified: 0, unclassified: 0 },
};

const PORTFOLIO = { id: '00000000-0000-4000-8000-0000000000aa', name: 'Asia to Europe lanes', createdAt: '2026-09-01T00:00:00Z' };

const DETAIL_EMPTY = { portfolio: PORTFOLIO, rollup: ROLLUP_EMPTY, groups: [], entityRows: [], entitiesUnread: 0 };

const ONE = itemRow(0, 'regulations');
const DETAIL_ONE = {
  portfolio: PORTFOLIO,
  rollup: {
    ...ROLLUP_EMPTY,
    total: 1,
    items: { members: 1, held: 1, notHeld: [] },
    bySurface: { regulations: 1, market: 0, research: 0, operations: 0 },
    byPriority: { CRITICAL: 1, HIGH: 0, MODERATE: 0, LOW: 0, unscored: 0 },
    nextDue: { itemId: ONE.itemUuid, days: 40 },
    origin: { weakest: 'official', classified: 1, unclassified: 0 },
  },
  groups: [{ surface: 'regulations', rows: [ONE] }],
  entityRows: [],
  entitiesUnread: 0,
};

const SURFACES = ['regulations', 'market', 'research', 'operations'];
const EXTREME_GROUPS = SURFACES.map((s) => ({ surface: s, rows: [0, 1, 2].map((i) => itemRow(i, s, { long: true })) }));
const DETAIL_EXTREME = {
  portfolio: { ...PORTFOLIO, name: `${LONG(4, 'asia-to-europe')} lanes` },
  rollup: {
    total: 17,
    items: { members: 14, held: 12, notHeld: ['00000000-0000-4000-8000-0000000009a1', '00000000-0000-4000-8000-0000000009a2'] },
    entities: { corridors: 2, other: 1 },
    bySurface: { regulations: 3, market: 3, research: 3, operations: 3 },
    otherSurface: 0,
    byPriority: { CRITICAL: 4, HIGH: 4, MODERATE: 4, LOW: 0, unscored: 0 },
    nextDue: { itemId: EXTREME_GROUPS[0].rows[0].itemUuid, days: 40 },
    origin: { weakest: 'modelled', classified: 9, unclassified: 3 },
  },
  groups: EXTREME_GROUPS,
  entityRows: [
    { entityId: 'cl:corridor:f5bf8ebf91e1298c', kind: 'corridor', entityKind: 'corridor', label: 'Shanghai (CN) to Rotterdam (NL), ocean via a very long routing description' },
    { entityId: 'cl:corridor:0123456789abcdef', kind: 'corridor', entityKind: 'corridor', label: 'Singapore (SG) to Hamburg (DE), ocean' },
    { entityId: 'cl:jurisdiction:0123456789abcdef', kind: 'entity', entityKind: 'jurisdiction', label: 'European Union' },
  ],
  entitiesUnread: 0,
};

const summary = (i, { long = false } = {}) => ({
  id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
  // A long real name (the migration's limit is 80 characters; 60 is already well past a typical one).
  name: long ? `${LONG(5, 'asia-europe')}`.slice(0, 60) : `Portfolio ${i}`,
  createdAt: '2026-09-01T00:00:00Z',
  memberCount: i * 3,
});

export async function runSmoke(browser) {
  return runUxSpec(browser, {
    name: 'portfolio',
    entry: ENTRY,
    apiRoutes: API_ROUTES,
    alias: ALIAS,
    states: [
      { label: 'index-signed-out', props: { kind: 'index', props: { state: 'signed-out', portfolios: [], nowIso: NOW_ISO } }, expectTitles: 1 },
      { label: 'index-empty', props: { kind: 'index', props: { state: 'ok', portfolios: [], nowIso: NOW_ISO } }, expectTitles: 1 },
      {
        label: 'index-three',
        props: { kind: 'index', props: { state: 'ok', portfolios: [summary(1), summary(2, { long: true }), summary(3)], nowIso: NOW_ISO } },
        expectTitles: 4,
      },
      { label: 'detail-empty', props: { kind: 'detail', props: { view: DETAIL_EMPTY, nowIso: NOW_ISO } }, expectTitles: 1 },
      { label: 'detail-one-row', props: { kind: 'detail', props: { view: DETAIL_ONE, nowIso: NOW_ISO } }, expectTitles: 2 },
      { label: 'detail-extreme', props: { kind: 'detail', props: { view: DETAIL_EXTREME, nowIso: NOW_ISO } }, expectTitles: 12 },
    ],
  });
}
