// UX smoke spec: SearchResultsView (`/search` results page). Lane W10-CommandBar, 2026-09-21,
// undrawn-cases ruling 2 of 2026-09-20 ("Enter opens the results page"). Mounts the REAL
// `SearchResultsView` (src/components/search/SearchResultsView.tsx) directly, per F35's "customer-
// facing ledger/card rows" rule and RD-60 (every row component measured at 375x812 and 1280x800).
// Built on `ux-harness.mjs`'s `runUxSpec`, fixture data only, per the UX contract
// (docs/dispatches/lane-common-contract.md).
//
// MOUNTS SearchResultsView DIRECTLY, NOT `src/app/search/page.tsx`: the page is an async SERVER
// component reading cookies via `createSupabaseServerClient` (no App Router / Next.js request
// context exists in this bundle, the same reason dashboard-brief-smoke.mjs stubs `next/navigation`
// rather than mounting `src/app/page.tsx`). SearchResultsView is the presentational half, pure
// props in, real ListRow rows out; see that file's own header.
//
// The Masthead this view carries mounts a real CommandBar, so the bundle needs the same two fixture
// routes command-bar-search-portal-smoke.mjs stubs: /api/workspace/bootstrap (assistantEnabled) and
// /api/search (the bar's own typeahead, independent of this page's server-resolved `results` prop).
//
// STATE AXIS: no-query (the bar's own landing state) / empty (a query with zero matches) / one-row /
// extreme (MAX_RESULTS-worth of long titles, the honest "showing the top N" banner).

import { runUxSpec } from './ux-harness.mjs';

const ENTRY = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { SearchResultsView } from '@/components/search/SearchResultsView';

let root = null;
window.__mount = (props) => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(React.createElement(SearchResultsView, props));
};
`;

const API_ROUTES = [
  {
    urlGlob: '**/api/workspace/bootstrap**',
    handler: (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({}) }),
  },
  {
    urlGlob: '**/api/search**',
    handler: (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ results: [] }) }),
  },
];

const DATE_LABEL = 'Monday, September 21 2026';

// A single unbroken ~80-char token, the same stress class notices-rail-smoke.mjs / community-smoke.mjs
// use, so a title with no natural wrap point is measured, not just a normal multi-word title.
const LONG_UNBROKEN =
  'euregulationonpackagingandpackagingwastecomprehensiverevisiontwentytwentysix1234567890';

function resultRow(i, { long = false } = {}) {
  return {
    id: `item-${i}`,
    title: long ? `${LONG_UNBROKEN} #${i}` : `EU PPWR 2025/40 amendment ${i}`,
    item_type: i % 2 === 0 ? 'regulation' : 'market_signal',
    domain: 1,
    priority: i % 3 === 0 ? 'CRITICAL' : i % 3 === 1 ? 'HIGH' : 'MODERATE',
    jurisdictions: ['EU'],
    transport_modes: long ? ['air', 'road', 'ocean', 'rail'] : ['ocean'],
    topic: long ? 'packaging and extended producer responsibility' : 'packaging',
  };
}

const MAX_RESULTS = 20;

export async function runSmoke(browser) {
  return runUxSpec(browser, {
    name: 'search-results',
    entry: ENTRY,
    apiRoutes: API_ROUTES,
    states: [
      // No query typed yet: the bar's own landing state (F43: closed by default, nothing opens
      // itself). No data-guard-title in this branch by design (the "type a search" copy is not
      // itself a titled row); expectTitles deliberately omitted, matching notices-rail-smoke.mjs's
      // own empty-state convention.
      { label: 'no-query', props: { q: '', results: [], maxResults: MAX_RESULTS, dateLabel: DATE_LABEL } },
      // A real query, zero matches: the honest "No results" state, distinct from "no query yet".
      { label: 'empty', props: { q: 'no such regulation', results: [], maxResults: MAX_RESULTS, dateLabel: DATE_LABEL } },
      {
        label: 'one-row',
        props: { q: 'ppwr', results: [resultRow(0)], maxResults: MAX_RESULTS, dateLabel: DATE_LABEL },
        expectTitles: 1,
      },
      {
        label: 'extreme',
        // At the bounded read's own ceiling (BOUNDED, F38/F39) with long, unbroken titles: proves
        // the "showing the top N" banner renders at cap AND the row title still wraps cleanly.
        props: {
          q: 'packaging',
          results: Array.from({ length: MAX_RESULTS }, (_, i) => resultRow(i, { long: true })),
          maxResults: MAX_RESULTS,
          dateLabel: DATE_LABEL,
        },
        expectTitles: MAX_RESULTS,
      },
    ],
  });
}
