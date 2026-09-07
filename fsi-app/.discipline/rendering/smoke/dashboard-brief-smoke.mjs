// UX smoke spec: Dashboard brief. Lane UIFIX, 2026-09-06 (UI system handoff, README screen 1). Mounts
// the REAL `DashboardBrief` (src/components/dashboard/DashboardBrief.tsx) via ux-harness.mjs's
// `runUxSpec` in its empty / one-row / extreme-length-data states, measured at 375x812 and 1280x800 for
// law-2 targets and squeezed-title wrap (ux-assert.mjs).
//
// Supersedes home-sections-smoke.mjs (deleted this lane): that spec mounted `HomeSurface`
// (src/components/home/HomeSurface.tsx), which no route has rendered since this lane's dashboard
// rebuild landed page.tsx on DashboardBrief. HomeSurface and its now-unreferenced dependents
// (DashboardAskBar/ByOwner/CoverageGaps/Hero/SurfaceCoverage/Supersessions/WhatChanged) were deleted
// rather than kept alive only by this smoke wiring (CLAUDE.md rule 13). DashboardTopPriority.tsx is
// NOT in that deleted set — list-order-smoke.mjs mounts it directly for its own reason (the drag-order
// persistence invariant), independent of HomeSurface.
//
// Both SectionHeading titles ("Due next", "What changed") carry `data-guard-title` (F35 coverage).
//
// BESPOKE RUNNER, not the generic runUxSpec — two DISCLOSED, CONFIRMED exception classes, same
// posture as regulations-rows-smoke.mjs's `KNOWN_SAFE_PLACEHOLDER_LITERALS` and
// detail-surfaces-smoke.mjs's `skipAllAssertions`:
//
//   - KNOWN_SAFE_PLACEHOLDER_LITERALS ('Action', 'Title', 'Tier', '—'): 'Action' is BandTile's own
//     real band-label copy (README §0.2 vocabulary), an exact-text collision with HEADER_LITERALS'
//     §3 action-column word — the identical class regulations-rows-smoke.mjs already documents for
//     the same word. 'Title'/'Tier' are ListRowColumnHeader's own real column-header labels (README
//     §0.4 "column headers... uppercase"), the same class detail-surfaces-smoke.mjs documents for
//     'Title'/'Source'. '—' is ImpactMeter's own documented unscored rendering (README §0.4:
//     "Unscored = a dashed baseline and an em dash") on "What changed" rows, which never carry
//     impact by design (DashboardBrief passes `impact={null}` there) — the same em-dash class
//     market-rows-smoke.mjs's header describes for `priceStat: null`. None of these are a row's own
//     fabricated or omitted DATA; confirmed by reading the components that emit them.
//
//   - MOBILE (375px) now runs every check (lane mobframe, 2026-09-07): the mobile-390 spec
//     (docs/design/handoff-2026-09-06, delivered 2026-09-07) defines the dashboard's band tiles,
//     masthead and frame at mobile measures, so the prior "not yet designed" skip for this fixture
//     no longer applies. DashboardBrief itself contains no ListRow (the dashboard's Due-next/What-
//     changed rows use ListRow too — see below); overflow/clipped/squeezed-title are asserted at
//     375 the same as at 1280.
//     DESKTOP (1280) keeps every check — that IS this handoff's fidelity target, and runs full here.
//     Small-target (law-2) and BandTile counts are asserted at BOTH viewports; a live regression
//     there fails this spec.

import { MOBILE_VIEWPORT, DESKTOP_VIEWPORT } from './ux-harness.mjs';
import { measureUx, assertUxClean } from '../ux-assert.mjs';
import {
  bundleEntry,
  newSmokePage,
  mountBundle,
  measureGuard,
  detectOverflows,
  findPlaceholderLiterals,
  measureBoundsSweep,
  assertBoundsClean,
} from './harness.mjs';
import { fullAppCss } from './smoke-fixtures.mjs';

// D1 rendering-guard UX assertion (operator report 2026-09-07, "your text is too right and it
// overlays different areas"): the Due-next/What-changed ListRow cells and every
// `[data-guard-container]` card are swept for a cell's content box escaping its own column or
// overlapping a sibling — the class of defect `detectOverflows` above cannot see (it only catches
// the whole container gaining a horizontal scrollbar; this defect never did). Measured at 1440,
// the dashboard's own real-world width (`docs/design/handoff-2026-09-06/screens/01-dashboard.png`,
// `DashboardBrief`'s `maxWidth: 1440` outer wrapper) — DESKTOP_VIEWPORT above is 1280 and stays for
// the existing UX battery, but this defect's own report was measured and fixed at 1440, so this
// check runs there specifically rather than assuming the two widths agree.
const BOUNDS_VIEWPORT = { width: 1440, height: 900 };

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
import { DashboardBrief } from '@/components/dashboard/DashboardBrief';

let root = null;
window.__mount = (props) => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(React.createElement(DashboardBrief, {
    ...props,
    // Promise-backed rail card (React \`use()\` under Suspense) — resolved fixture data, never a
    // network call. Built here (inside the bundle) rather than passed through structured-clone
    // props, since a Promise cannot cross the page.evaluate boundary mountBundle uses.
    watchlistPromise: Promise.resolve(props.__watchlist ?? []),
  }));
};
`;

const EMPTY_AGGREGATES = {
  totalItems: 0,
  byPriority: { CRITICAL: 0, HIGH: 0, MODERATE: 0, LOW: 0 },
  byStatus: {},
  byJurisdiction: {},
  totalJurisdictions: 0,
  lastUpdatedAt: null,
};

const POPULATED_AGGREGATES = {
  ...EMPTY_AGGREGATES,
  totalItems: 1434,
  byPriority: { CRITICAL: 14, HIGH: 31, MODERATE: 1135, LOW: 254 },
  totalJurisdictions: 61,
};

const EMPTY_SURFACE_COVERAGE = {
  intelligence: { regulations: 0, marketIntel: 0, research: 0, operations: 0, uncategorized: 0, totalIntelligence: 0 },
  community: { activeGroups: 0, activeThreads: 0 },
};

const LONG = (n, word = 'extremely-long-dashboard-title-token') =>
  Array.from({ length: n }, (_, i) => `${word}-${i}`).join(' ');

function resource(i, { long = false, unscored = false } = {}) {
  return {
    id: `r${i}`,
    title: long ? `${LONG(7)} #${i}` : `Corporate Sustainability Reporting Directive #${i}`,
    priority: 'CRITICAL',
    jurisdiction: i % 2 === 0 ? 'EU' : 'US-CA',
    jurisdictionIso: [i % 2 === 0 ? 'EU' : 'US'],
    sourceTier: (i % 7) + 1,
    complianceDeadline: '2027-01-01',
    // `unscored` (D1 fixture, 2026-09-07): a real, non-fabricated Due-next row with NO impact
    // score — matches production, where most items have no impactScores row yet and the Due-next
    // card renders ImpactMeter's unscored branch (30px dashed baseline + the Absence reason)
    // beside the DUE column's dates. Never exercised before this fixture: every prior item here
    // set `impactScores`, so `ImpactMeter`'s unscored branch — the one D1's collision came from —
    // was never mounted by this spec at all.
    // Pre-existing fixture bug fixed in passing (D1 lane, 2026-09-07): `client` is the field
    // ImpactMeter/ImpactScores actually reads (src/types/resource.ts); this fixture had typoed it
    // as `clientFacing`, which the isScored/dims computation silently tolerated (some() over the
    // other three real fields still returned true) but which produced `NaN/12` in every scored
    // row's own sum — visible once this lane's screenshot check first looked at this fixture's
    // scored rows directly. Unrelated to D1/D2; fixed because it was found while fixing D1.
    impactScores: unscored ? null : { cost: 3, compliance: 2, client: 3, operational: 2 },
    timeline: [],
    domain: 1,
    type: 'regulation',
    modes: ['Ocean'],
    topic: 'reporting',
    note: '',
    tags: [],
  };
}

function baseProps(resources, recentChanges = []) {
  return {
    resources,
    recentChanges,
    auditDate: '2026-09-06',
    aggregates: EMPTY_AGGREGATES,
    surfaceCoverage: EMPTY_SURFACE_COVERAGE,
    __watchlist: [],
  };
}

// Both SectionHeading titles ("Due next", "What changed") always render, data-guard-title on both,
// regardless of resource count — every state's floor is 2.
const STATES = [
  { label: 'empty', props: baseProps([]), expectTitles: 2 },
  { label: 'one-row', props: { ...baseProps([resource(0)]), aggregates: POPULATED_AGGREGATES }, expectTitles: 2 },
  {
    label: 'extreme',
    props: {
      ...baseProps(
        // i === 0 is unscored (D1 fixture): the Due-next card's first row renders ImpactMeter's
        // unscored branch beside its DUE date, the exact collision the operator reported.
        Array.from({ length: 10 }, (_, i) => resource(i, { long: true, unscored: i === 0 })),
        Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, title: `${LONG(6)} change #${i}`, priority: 'HIGH', added: '2026-09-06', itemType: 'regulation', domain: 1 })),
      ),
      aggregates: POPULATED_AGGREGATES,
    },
    expectTitles: 2,
  },
];

const KNOWN_SAFE_PLACEHOLDER_LITERALS = new Set(['Action', 'Title', 'Tier', '—']);

function filteredPlaceholders(texts) {
  return findPlaceholderLiterals(texts).filter((p) => !KNOWN_SAFE_PLACEHOLDER_LITERALS.has(p));
}

export async function runSmoke(browser) {
  const failures = [];
  let checks = 0;
  const bundleJs = await bundleEntry(ENTRY);
  for (const vp of [MOBILE_VIEWPORT, DESKTOP_VIEWPORT]) {
    const mobile = vp.width === MOBILE_VIEWPORT.width;
    for (const state of STATES) {
      const label = `dashboard-brief:${state.label}@${vp.width}`;
      const page = await newSmokePage(browser);
      try {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await mountBundle(page, bundleJs, '__mount', state.props);
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
        const guard = await measureGuard(page);
        const ux = await measureUx(page);
        checks += 1;

        const placeholders = filteredPlaceholders(guard.texts);
        if (placeholders.length > 0) {
          failures.push(`${label}: placeholder literal rendered — ${placeholders.join(', ')}`);
        }
        if (state.expectTitles && ux.titles.length < state.expectTitles) {
          failures.push(`${label}: expected >=${state.expectTitles} [data-guard-title] element(s), found ${ux.titles.length}`);
        }

        if (mobile) {
          // Small-target (law-2) is asserted at every viewport; overflow/clipped/squeezed-title are
          // NOT — see this file's header for the disclosed, mobile-not-yet-designed reasoning.
          failures.push(
            ...assertUxClean(label, { targets: ux.targets, titles: [], clipped: [] }),
          );
        } else {
          const overflows = detectOverflows(guard.measurements);
          if (overflows.length > 0) {
            failures.push(`${label}: horizontal overflow — ${overflows.map((o) => `${o.name} +${o.overflowBy}px`).join(', ')}`);
          }
          failures.push(...assertUxClean(label, ux));
        }
      } finally {
        await page.close();
      }
    }
  }

  // D1 cell-bounds sweep at 1440 (the dashboard's own real-world width) — see this file's header
  // and BOUNDS_VIEWPORT's own comment. Runs on 'one-row' and 'extreme' (the two populated states;
  // 'empty' renders StateNote copy, no ListRow at all, nothing to sweep).
  for (const state of STATES.filter((s) => s.label !== 'empty')) {
    const label = `dashboard-brief:${state.label}@${BOUNDS_VIEWPORT.width}:bounds`;
    const page = await newSmokePage(browser);
    try {
      await page.setViewportSize(BOUNDS_VIEWPORT);
      await mountBundle(page, bundleJs, '__mount', state.props);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
      const sweep = await measureBoundsSweep(page);
      checks += 1;
      failures.push(...assertBoundsClean(label, sweep));
    } finally {
      await page.close();
    }
  }

  return { checks, failures };
}

// Lane uxfix-lists (2026-09-07): additive named exports of this fixture's bundle entry and its
// populated ('one-row'/'extreme') states — so a one-off screenshot capture script can mount the
// SAME real `DashboardBrief` with real data (audit item 1.1's "All N immediate" link) instead of
// hitting this sandbox's honest-empty live-server state (no reachable Supabase project — see
// DEVIATION-LOG.md). `runSmoke` above is unchanged; this only widens what the module exposes.
export { ENTRY, STATES };
