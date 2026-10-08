// UX smoke spec: the generated Coverage page and the coverage-state renderer (lane COV-1, 2026-10-08; spec 00
// section 4; coordinator grant 2026-10-08). Mounts the REAL CoveragePageView (/dashboard/coverage's presentational
// half), CoverageDenominatorLineView (the line under each list page), PortfolioCoverageLine (the portfolio-add line)
// and CoverageState in all six of its states, via ux-harness.mjs's `runUxSpec`, measured at 375, 768, 1024 and 1280
// (and the 1440 cell-bounds sweep) for overflow, a title squeezed under its longest word, placeholder literals and
// the law-2 target floor (ux-assert.mjs). Fixture data only; no network, no database.
//
// MOUNTS THE VIEWS, NOT THE PAGE: /dashboard/coverage is an async server component that reads the cached loader, which
// this bundle has no request context for (the same reason portfolio-smoke.mjs mounts the views).
//
// STATE AXIS. Page: the whole matrix (forty instruments over six places, one place with a deliberately very long
// label), a gap cell selected, a present cell selected, the error state, an empty matrix, and a matrix whose
// instruments carry modes and a check date. Line: read, and error. Portfolio line: a surface with a count, an item
// with no census surface, an uncatalogued surface. States: all six treatments stacked. The first run of this spec
// (throwaway, before commit) failed at 768, 1024 and 1280 with the long place name squeezed beside its cell chips; the
// row now stacks the title above the chips, which is the fix this spec keeps honest.

import { fileURLToPath } from 'node:url';
import { runUxSpec } from './ux-harness.mjs';
import { fullAppCss } from './smoke-fixtures.mjs';
import { buildCoverageMatrix, buildCoverageView, parseCoverageQuery, surfaceDenominator } from '../../../src/lib/coverage/coverage-matrix.mjs';

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
import { CoveragePageView } from '@/components/coverage/CoveragePageView';
import { CoverageDenominatorLineView } from '@/components/coverage/CoverageDenominatorLineView';
import { PortfolioCoverageLine } from '@/components/portfolio/PortfolioAddSearch';
import { CoverageState } from '@/components/ui/CoverageState';

const SIX = ['not_applicable', 'not_covered', 'no_data_yet', 'suppressed', 'not_filtered_in', 'error'];
let root = null;
window.__mount = (props) => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  if (props.kind === 'page') root.render(React.createElement(CoveragePageView, props.props));
  else if (props.kind === 'line') root.render(React.createElement(CoverageDenominatorLineView, props.props));
  else if (props.kind === 'portfolio') {
    root.render(
      React.createElement(
        'ul',
        { style: { listStyle: 'none', padding: 16, margin: 0 } },
        [['regulation'], [null], ['research_finding']].map((a, i) =>
          React.createElement(
            'li',
            { key: i },
            'Some long item title that wraps onto more lines for the narrow viewport check',
            React.createElement(PortfolioCoverageLine, { itemType: a[0], classes: props.classes })
          )
        )
      )
    );
  } else if (props.kind === 'states') {
    root.render(
      React.createElement(
        'div',
        { style: { padding: 16, display: 'flex', flexDirection: 'column', gap: 12 } },
        SIX.map((s) =>
          React.createElement(CoverageState, {
            key: s, state: s, subject: 'The obligation register', variant: 'block',
            reason: 'A reason sentence that is long enough to wrap onto a second line at the narrow viewport width.',
            requestRef: '/dashboard/coverage', reasonClass: 'licence', hiddenCount: 7, noun: 'obligation', onWiden: () => {}, onRetry: () => {},
            statusHref: '/status', expectedRefresh: '2026-11-01', lastValue: 'EUR 71.2', asOf: '2026-09-30',
          })
        )
      )
    );
  }
};
`;

const API_ROUTES = [
  { urlGlob: '**/api/dashboard/coverage/**', handler: (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({}) }) },
];

const NOW_ISO = '2026-10-08T09:00:00.000Z';
const LABELS = {
  EU: 'European Union',
  GB: 'United Kingdom',
  'US-CA': 'California, United States of America and a deliberately long label to test wrapping behaviour',
};
const labelOf = (code) => LABELS[code] ?? code;
const entry = (id, jurisdiction, surfaces, relevance, identity, extra = {}) => ({ id, jurisdiction, surfaces, relevance, identity, ...extra });

const PLACES = ['EU', 'GB', 'US-CA', 'DE', 'FR', 'NL'];
const SURFACE_SETS = [['regulations'], ['operations'], ['market_intel', 'research'], []];
const ENTRIES = Array.from({ length: 40 }, (_, i) =>
  entry(`a${i}`, PLACES[i % 6], SURFACE_SETS[i % 4], i % 3 ? 'firm' : 'soft', i % 2 ? 'verified' : 'pending')
);
const MATRIX = buildCoverageMatrix(ENTRIES, { generatedAt: NOW_ISO, verifiedBriefs: 41, labelOf });
const MODED = buildCoverageMatrix(
  ENTRIES.map((e, i) => ({ ...e, modes: i % 3 === 0 ? [] : i % 3 === 1 ? ['air', 'road'] : ['ocean'], checkedAt: '2026-10-02T00:00:00Z' })),
  { generatedAt: NOW_ISO, verifiedBriefs: 41, labelOf }
);
const EMPTY = buildCoverageMatrix([], { generatedAt: NOW_ISO });

function pageProps(matrix, search = '', over = {}) {
  const query = parseCoverageQuery(new URLSearchParams(search));
  return { matrix, view: buildCoverageView(matrix, query), query, error: null, dateLabel: 'Thursday, October 8, 2026', nowIso: NOW_ISO, ...over };
}

export async function runSmoke(browser) {
  return runUxSpec(browser, {
    name: 'coverage',
    entry: ENTRY,
    apiRoutes: API_ROUTES,
    alias: ALIAS,
    states: [
      { label: 'page', props: { kind: 'page', props: pageProps(MATRIX) }, expectTitles: 3 },
      { label: 'page-with-modes', props: { kind: 'page', props: pageProps(MODED, 'mode=air') }, expectTitles: 3 },
      { label: 'page-gap-cell', props: { kind: 'page', props: pageProps(MATRIX, 'data_class=research&geography=EU') }, expectTitles: 1 },
      { label: 'page-present-cell', props: { kind: 'page', props: pageProps(MATRIX, 'data_class=regulations&geography=EU') }, expectTitles: 1 },
      { label: 'page-error', props: { kind: 'page', props: pageProps(MATRIX, '', { error: 'Coverage could not be read just now.' }) } },
      { label: 'page-empty', props: { kind: 'page', props: pageProps(EMPTY) } },
      {
        label: 'line',
        props: { kind: 'line', props: { denominator: surfaceDenominator('regulations', { total: 340, dualVerified: 120, verifiedBriefs: 56 }), error: null, surfacePath: '/regulations' } },
      },
      { label: 'line-error', props: { kind: 'line', props: { denominator: null, error: 'x', surfacePath: '/regulations' } } },
      {
        label: 'portfolio-line',
        props: { kind: 'portfolio', classes: [{ code: 'regulations', label: 'Regulations', numerator: 120, denominator: 340 }] },
      },
      { label: 'six-states', props: { kind: 'states' } },
    ],
  });
}
