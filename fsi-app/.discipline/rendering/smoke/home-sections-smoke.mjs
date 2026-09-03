// UX smoke spec: Home sections. Lane MOBILE, 2026-09-03, RD-60/F35. Mounts the REAL `HomeSurface`
// (src/components/home/HomeSurface.tsx) via ux-harness.mjs's `runUxSpec` in its empty / one-row /
// extreme-length-data states, measured at 375x812 and 1280x800 for law-2 targets and squeezed-title
// wrap (ux-assert.mjs).
//
// ROOT CAUSE FIXED (screenshots 06-home-what-changed / 07-home-five-surfaces, confirmed in
// HomeSurface.tsx's own `SectionHeading`): the section-header aside carried `whiteSpace: nowrap`
// with no `max-width` and no `minWidth: 0` on either flex child. At 375px the aside's forced-nowrap
// subtitle ("Source and theme monitoring, change log across the registry") claimed its own full
// text width as its flex minimum, leaving the title only its longest single word — "WHAT" /
// "CHANGED" stacked — while the subtitle itself ran off the right edge. Fixed with `.cl-section-
// head` / `.cl-section-head__title` / `.cl-section-head__aside` (globals.css): the subtitle now
// wraps like prose and the two stack at <=640px instead of squeezing onto one row. Both
// SectionHeading calls named in the screenshots ("What changed", "Across your five surfaces") carry
// `data-guard-title` on the `<h2>`.

import { runUxSpec } from './ux-harness.mjs';
import { fullAppCss } from './smoke-fixtures.mjs';

const STYLE_INJECT = `
(() => {
  const style = document.createElement('style');
  style.textContent = ${JSON.stringify(fullAppCss())};
  document.head.appendChild(style);
})();
`;

const ENTRY = `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { HomeSurface } from '@/components/home/HomeSurface';

let root = null;
window.__mount = (props) => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(React.createElement(HomeSurface, {
    ...props,
    // Promise-backed rail cards (React \`use()\` under Suspense) — resolved fixture data, never a
    // network call. Built here (inside the bundle) rather than passed through structured-clone
    // props, since a Promise cannot cross the page.evaluate boundary mountBundle uses.
    watchlistPromise: Promise.resolve(props.__watchlist ?? []),
    coverageGapsPromise: Promise.resolve(props.__coverageGaps ?? []),
  }));
};
`;

// HomeSurface hydrates the personal-archive layer on mount (usePersonalStateHydration) and its
// child DashboardTopPriority reads/writes the drag-order list (useListOrder) — both auth-gated
// fetches that must be answered rather than left to hit the real network (same posture as
// list-order-smoke.mjs, the spec this drag-order stub was proven against first).
const API_ROUTES = [
  { urlGlob: '**/api/workspace/personal-state**', handler: (route) => route.fulfill({ json: { items: [] } }) },
  { urlGlob: '**/api/user/list-order**', handler: (route) => route.fulfill({ json: { order: [] } }) },
];

const EMPTY_AGGREGATES = {
  totalItems: 0,
  byPriority: { CRITICAL: 0, HIGH: 0, MODERATE: 0, LOW: 0 },
  byStatus: {},
  byJurisdiction: {},
  totalJurisdictions: 0,
  lastUpdatedAt: null,
};

const EMPTY_SURFACE_COVERAGE = {
  intelligence: { regulations: 0, marketIntel: 0, research: 0, operations: 0, uncategorized: 0, totalIntelligence: 0 },
  community: { activeGroups: 0, activeThreads: 0 },
};

const LONG = (n, word = 'extremely-long-dashboard-title-token') =>
  Array.from({ length: n }, (_, i) => `${word}-${i}`).join(' ');

function resource(i, { long = false } = {}) {
  return {
    id: `r${i}`,
    title: long ? `${LONG(7)} #${i}` : `Corporate Sustainability Reporting Directive #${i}`,
    priority: 'CRITICAL',
    urgencyScore: 100 - i,
    jurisdiction: i % 2 === 0 ? 'EU' : 'US-CA',
    jurisdictionIso: [i % 2 === 0 ? 'EU' : 'US'],
    sourceTier: (i % 7) + 1,
    whyMatters: long ? LONG(20, 'long-analysis-word') : 'Binding disclosure obligations begin next fiscal year.',
    actionOwner: long ? LONG(3, 'Very-Long-Owner-Name-Segment') : 'Jane Doe',
    complianceDeadline: '2027-01-01',
    domain: 1,
    type: 'regulation',
    note: '',
    tags: [],
  };
}

function baseProps(resources) {
  return {
    initialResources: resources,
    initialArchived: [],
    recentChanges: [],
    changelog: {},
    supersessions: [],
    auditDate: '2026-09-01',
    aggregates: EMPTY_AGGREGATES,
    jurisdictionsCount: 6,
    surfaceCoverage: EMPTY_SURFACE_COVERAGE,
    __watchlist: [],
    __coverageGaps: [],
  };
}

// The two SectionHeading titles ("What changed", "Across your five surfaces") always render,
// `data-guard-title` on both, regardless of resource count — every state's floor is 2.
const STATES = [
  { label: 'empty', props: baseProps([]), expectTitles: 2 },
  { label: 'one-row', props: baseProps([resource(0)]), expectTitles: 2 },
  {
    label: 'extreme',
    props: baseProps(Array.from({ length: 10 }, (_, i) => resource(i, { long: true }))),
    expectTitles: 2,
  },
];

const SPEC = { name: 'home-sections', entry: ENTRY, apiRoutes: API_ROUTES, states: STATES };

export async function runSmoke(browser) {
  return runUxSpec(browser, SPEC);
}
