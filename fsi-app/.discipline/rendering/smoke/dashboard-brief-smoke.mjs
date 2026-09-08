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
//     "Unscored = a dashed baseline and an em dash") on any row whose item carries no score —
//     since HYDRATION-59 that is only a change row whose item is outside the loaded corpus slice
//     (src/lib/dashboard/brief-rows.ts's documented degrade path) — the same em-dash class
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

import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MOBILE_VIEWPORT, DESKTOP_VIEWPORT } from './ux-harness.mjs';
import { measureUx, assertUxClean } from '../ux-assert.mjs';
import { bundleEntry, newSmokePage, mountBundle, measureGuard, detectOverflows, findPlaceholderLiterals } from './harness.mjs';
import { fullAppCss } from './smoke-fixtures.mjs';

// Lane BRIEFDATA (2026-09-08): <DashboardBrief/> calls `useRouter()` — the failure state's Retry
// is a real `router.refresh()`, not a sentence telling the reader to refresh. The real hook reads
// the App Router context this bundle has none of and throws "invariant expected app router to be
// mounted" for EVERY state, so the mount takes the same `next/navigation` stub the audit's
// page-frame mount already uses.
const NEXT_NAVIGATION_STUB = join(fileURLToPath(new URL('.', import.meta.url)), 'stub-next-navigation.mjs');
const BUNDLE_ALIAS = { alias: { 'next/navigation': NEXT_NAVIGATION_STUB } };

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

// FOLD-59 (2026-09-08): a SECOND entry, for the artboard-01 capture. `ENTRY` above takes ready
// `BriefRow[]`, which is right for the smoke spec (it asserts row RENDERING and wants to state each
// row's fields literally). The capture wants the opposite: an artboard-faithful `Resource[]` run
// through the SAME server derivation the route runs, so the side-by-side shows what the page really
// produces. Deriving inside the bundle rather than in Node is what makes that possible at all —
// `brief-rows.ts` is TypeScript, esbuild compiles it here, and a Promise/Date cannot cross the
// structured-clone boundary `mountBundle` uses anyway.
const ENTRY_FROM_RESOURCES = `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { DashboardBrief } from '@/components/dashboard/DashboardBrief';
import { buildDueNextRows, buildChangedRows, mergeBriefCorpus, dueNextWindowLabel } from '@/lib/dashboard/brief-rows';

let root = null;
window.__mount = (props) => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  const now = new Date(props.nowIso);
  // Lane BRIEFDATA (2026-09-08): ONE corpus, assembled the way src/app/page.tsx assembles it —
  // this route's payload plus the bounded by-id backfill (DashboardData.briefResources).
  const corpus = mergeBriefCorpus(props.resources, props.briefResources ?? []);
  const dueNextRows = buildDueNextRows(corpus, now);
  root.render(React.createElement(DashboardBrief, {
    dueNextRows,
    dueNextWindow: dueNextWindowLabel(dueNextRows, props.weekOfLabel ?? 'Sep 7'),
    changedRows: buildChangedRows(props.recentChanges, corpus, now),
    totalChanges: props.totalChanges ?? props.recentChanges.length,
    aggregates: props.aggregates,
    // COUNTS-61 (2026-09-08): the band tiles read the REGULATIONS surface counts, because that is
    // the surface every tile navigates to. The smoke passes the same bundle for both, which is the
    // no-divergence case; the invariant that they come from one call is pinned separately in
    // src/components/dashboard/band-tile-count-source.npmtest.mjs.
    bandCounts: props.bandCounts ?? props.aggregates,
    auditDate: props.auditDate,
    surfaceCoverage: props.surfaceCoverage,
    nowIso: props.nowIso,
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

// COUNTS-61: the regulations surface's own figures (get_surface_counts('regulations'), 2026-09-08),
// deliberately DIFFERENT from POPULATED_AGGREGATES above — the divergence between the two is what
// the production defect consisted of, so the spec measures the tiles in that state.
const POPULATED_BAND_COUNTS = {
  ...EMPTY_AGGREGATES,
  totalItems: 1317,
  byPriority: { CRITICAL: 15, HIGH: 14, MODERATE: 1119, LOW: 169 },
  totalJurisdictions: 32,
};

const EMPTY_SURFACE_COVERAGE = {
  intelligence: { regulations: 0, marketIntel: 0, research: 0, operations: 0, uncategorized: 0, totalIntelligence: 0 },
  community: { regionalRooms: 7, joinedGroups: 0, activeThreads: 0 },
};

const LONG = (n, word = 'extremely-long-dashboard-title-token') =>
  Array.from({ length: n }, (_, i) => `${word}-${i}`).join(' ');

// HYDRATION-59 (2026-09-07): <DashboardBrief/> no longer derives its two row sets from a Resource[]
// and a change feed inside the component — the SERVER selects and shapes them
// (src/lib/dashboard/brief-rows.ts -> src/lib/list-row-fields.ts) so the derivation is shared with
// the list ledgers (defect D3) and runs against one fixed instant (defect D1). This fixture
// therefore supplies ready `BriefRow` objects, which is exactly what the route now passes.
// FOLD-59 (2026-09-08): `unscored` carries lane DASHROW-59's D1 coverage forward onto the BriefRow
// shape. A real, non-fabricated Due-next row with NO impact score, which is production's common
// case: the Due-next card renders ImpactMeter's unscored branch (dashed baseline plus the Absence
// reason) beside the DUE column's dates. Without it, ImpactMeter's unscored branch is never
// mounted by this spec and the collision the operator reported cannot be measured.
function briefRow(i, { long = false, changed = false, unscored = false } = {}) {
  return {
    id: changed ? `c${i}` : `r${i}`,
    href: `/regulations/${changed ? `c${i}` : `r${i}`}`,
    priority: changed ? 'HIGH' : 'CRITICAL',
    jurisdiction: i % 2 === 0 ? 'EU' : 'US',
    title: long ? `${LONG(7)} #${i}` : `Corporate Sustainability Reporting Directive #${i}`,
    meta: 'regulation · Ocean · reporting',
    impact: unscored ? null : { cost: 3, compliance: 2, client: 3, operational: 2 },
    due: { label: 'Jan 1, 2027', days: '116 days' },
    // Lane BRIEFDATA (2026-09-08): the whole-day distance the window label is computed from. 116
    // days is well past the week the aside names, which is the live case (the nearest five binding
    // dates measured 2026-09-08 were Sep 8, Sep 30, Sep 30, Sep 30, Oct 1) and the reason the
    // label has to say how far the card reaches.
    dueDays: 116,
    timeline: [],
    tier: (i % 7) + 1,
    ...(changed ? { isNew: true } : {}),
  };
}

function baseProps(dueNextRows, changedRows = []) {
  return {
    dueNextRows,
    // Lane BRIEFDATA (2026-09-08): the card's aside is SERVER-BUILT now (brief-rows.ts's
    // `dueNextWindowLabel`, called from src/app/page.tsx), because it states which window the
    // selected rows actually SPAN. This module is plain .mjs and cannot import the TS helper, so
    // the fixture states the two forms literally — and `dueNextWindowLabel`'s own output for the
    // same input is pinned in src/lib/dashboard/brief-rows.npmtest.mjs (BRIEFDATA/2, /2b), so the
    // literal here cannot drift from the function without that proof going red.
    dueNextWindow: dueNextRows.length
      ? 'By next binding date · week of Sep 7, reaching to Jan 1, 2027'
      : 'By next binding date · week of Sep 7',
    changedRows,
    totalChanges: changedRows.length,
    auditDate: '2026-09-06',
    aggregates: EMPTY_AGGREGATES,
    // COUNTS-61 (2026-09-08): the band tiles read the REGULATIONS surface's counts, because that is
    // where every tile navigates. A separate prop from `aggregates`, and separately supplied here.
    bandCounts: EMPTY_AGGREGATES,
    surfaceCoverage: EMPTY_SURFACE_COVERAGE,
    nowIso: '2026-09-07T00:00:00.000Z',
    __watchlist: [],
  };
}

// Both SectionHeading titles ("Due next", "What changed") always render, data-guard-title on both,
// regardless of row count — every state's floor is 2.
const STATES = [
  { label: 'empty', props: baseProps([]), expectTitles: 2 },
  { label: 'one-row', props: { ...baseProps([briefRow(0)]), aggregates: POPULATED_AGGREGATES, bandCounts: POPULATED_BAND_COUNTS }, expectTitles: 2 },
  {
    label: 'extreme',
    props: {
      ...baseProps(
        // i === 0 is unscored (DASHROW-59's D1 fixture): the Due-next card's first row renders
        // ImpactMeter's unscored branch beside its DUE date, the exact collision reported.
        Array.from({ length: 5 }, (_, i) => briefRow(i, { long: true, unscored: i === 0 })),
        Array.from({ length: 6 }, (_, i) => briefRow(i, { long: true, changed: true })),
      ),
      aggregates: POPULATED_AGGREGATES,
      bandCounts: POPULATED_BAND_COUNTS,
    },
    expectTitles: 2,
  },
];

// Lane BRIEFDATA (2026-09-08). Two states the spec had no way to reach before, each one a fact the
// operator's ruling turns on:
//
//   'populated'  BOTH cards full, every row carrying its score, date and tier. The spec asserted
//                row COUNT and row CONTENT but never that the two cards are simultaneously
//                non-empty, which is the ruling's actual demand.
//   'failed'     the fetch failed RIGHT NOW. Before this lane both cards rendered their
//                honest-empty copy in this state and the failure note sat on one of them, so
//                "nothing is due" and "we could not look" were the same card. `fetchError` is the
//                real sentinel string (supabase-server.ts's SEED_FALLBACK_ERROR) and the reason
//                clause is a real `describeFallbackTrigger` output.
const FETCH_ERROR = 'Data temporarily unavailable. Refresh to retry.';
const FETCH_ERROR_REASON = 'The intelligence read did not return within its time limit.';

STATES.push(
  {
    label: 'populated',
    props: {
      ...baseProps(
        Array.from({ length: 5 }, (_, i) => briefRow(i)),
        Array.from({ length: 6 }, (_, i) => briefRow(i, { changed: true })),
      ),
      aggregates: POPULATED_AGGREGATES,
      bandCounts: POPULATED_BAND_COUNTS,
    },
    expectTitles: 2,
    bothCardsPopulated: true,
  },
  {
    label: 'failed',
    props: { ...baseProps([]), fetchError: FETCH_ERROR, fetchErrorReason: FETCH_ERROR_REASON },
    expectTitles: 2,
    expectFailureState: true,
  },
);

const KNOWN_SAFE_PLACEHOLDER_LITERALS = new Set(['Action', 'Title', 'Tier', '—']);

function filteredPlaceholders(texts) {
  return findPlaceholderLiterals(texts).filter((p) => !KNOWN_SAFE_PLACEHOLDER_LITERALS.has(p));
}

/**
 * ROW-CONTENT INVARIANT (lane rsc503, 2026-09-08, click-through audit "Blocking finding").
 *
 * The audit measured 11 row anchors on production at 657x55 with correct aria-labels and
 * `innerHTML.length === 0`, and read that as "the client painted empty boxes". Reading
 * ListRow.tsx settles it the other way: `a.cl-row-link` is `position:absolute; inset:0`,
 * `gridColumn: 2 / -1`, `aria-label={title}` and DELIBERATELY childless: it is the stretched
 * overlay that makes the WHOLE ROW one click target (README §0.4). An empty anchor is the design.
 *
 * So the invariant worth guarding is not "the anchor has children" (that would fail on a correct
 * row) but the one the audit was actually reaching for: a row that exists must RENDER something,
 * and the overlay's accessible name must be the title the sighted reader sees. This fails on a
 * genuinely empty row, on a row whose content stopped rendering beside its anchor, and on an
 * overlay whose label drifts from the row it covers, none of which the placeholder, overflow or
 * target checks above can see.
 */
async function measureRowContent(page) {
  return page.evaluate(() => {
    return [...document.querySelectorAll('.cl-list-row')].map((row, i) => {
      const link = row.querySelector('a.cl-row-link');
      const title = row.querySelector('.cl-row-title-text');
      const box = row.getBoundingClientRect();
      return {
        i,
        text: (row.textContent || '').replace(/\s+/g, ' ').trim(),
        hasLink: Boolean(link),
        label: link ? (link.getAttribute('aria-label') || '') : '',
        titleText: title ? (title.textContent || '').replace(/\s+/g, ' ').trim() : '',
        width: Math.round(box.width),
        height: Math.round(box.height),
      };
    });
  });
}

function assertRowContent(label, rows, expectedRows) {
  const failures = [];
  if (rows.length !== expectedRows) {
    failures.push(`${label}: expected ${expectedRows} .cl-list-row element(s), found ${rows.length}`);
  }
  for (const row of rows) {
    if (!row.hasLink) {
      failures.push(`${label}: row ${row.i} has no overlay anchor; the whole row is the click target`);
      continue;
    }
    if (row.text.length === 0) {
      failures.push(
        `${label}: row ${row.i} rendered ${row.width}x${row.height} with NO content: an empty box carrying an aria-label`,
      );
    }
    if (row.label.length === 0) {
      failures.push(`${label}: row ${row.i}'s overlay anchor has no accessible name`);
    }
    if (row.titleText.length === 0) {
      failures.push(`${label}: row ${row.i} rendered no title text`);
    } else if (row.label !== row.titleText) {
      failures.push(
        `${label}: row ${row.i}'s overlay label "${row.label}" is not the title it covers "${row.titleText}"`,
      );
    }
  }
  return failures;
}

export async function runSmoke(browser) {
  const failures = [];
  let checks = 0;
  const bundleJs = await bundleEntry(ENTRY, BUNDLE_ALIAS);
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

        // Row-content invariant: see measureRowContent's header. Every Due-next row and every
        // What-changed row in this state is one .cl-list-row.
        const expectedRows = state.props.dueNextRows.length + state.props.changedRows.length;
        failures.push(...assertRowContent(label, await measureRowContent(page), expectedRows));

        // Lane BRIEFDATA (2026-09-08): the operator's ruling, asserted rather than assumed.
        if (state.bothCardsPopulated) {
          const perCard = await page.evaluate(() =>
            [...document.querySelectorAll('.cl-brief-grid > section')].map(
              (sec) => sec.querySelectorAll('.cl-list-row').length,
            ),
          );
          checks += 1;
          if (perCard.length < 2 || perCard[0] === 0 || perCard[1] === 0) {
            failures.push(
              `${label}: a brief card rendered ZERO rows against a populated fixture (per-card counts: [${perCard}]). ` +
                'The operator ruling is that Due next and What changed stay populated.',
            );
          }
          // One absence token per row at most — the shared model's whole allowance. The degrade
          // path put four in a single row.
          const worst = await page.evaluate(() =>
            Math.max(0, ...[...document.querySelectorAll('.cl-list-row')].map(
              (r) => r.querySelectorAll('.cl-absence').length,
            )),
          );
          checks += 1;
          if (worst > 1) {
            failures.push(`${label}: a row carried ${worst} absence tokens; the shared model allows one.`);
          }
        }

        if (state.expectFailureState) {
          const text = (await page.textContent('.cl-brief-grid')) || '';
          const retries = await page.$$eval('.cl-brief-grid button', (els) =>
            els.filter((e) => (e.textContent || '').trim() === 'Retry').length,
          );
          checks += 1;
          if ((text.match(/Data temporarily unavailable/g) || []).length < 2) {
            failures.push(
              `${label}: a failed fetch must say so on BOTH cards; found ${(text.match(/Data temporarily unavailable/g) || []).length}. ` +
                'An empty card and a failed fetch must not look the same.',
            );
          }
          checks += 1;
          if (retries < 2) {
            failures.push(`${label}: found ${retries} Retry control(s); each failed card must offer a retry that re-requests.`);
          }
          checks += 1;
          if (!text.includes(FETCH_ERROR_REASON)) {
            failures.push(`${label}: the failure state did not name WHAT failed (the describeFallbackTrigger clause).`);
          }
          checks += 1;
          if (text.includes('Nothing added or updated in the last detection pass')) {
            failures.push(`${label}: a FAILED fetch rendered the honest-empty copy, which is the defect this state exists to catch.`);
          }
        }

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
  return { checks, failures };
}

// Lane uxfix-lists (2026-09-07): additive named exports of this fixture's bundle entry and its
// populated ('one-row'/'extreme') states — so a one-off screenshot capture script can mount the
// SAME real `DashboardBrief` with real data (audit item 1.1's "All N immediate" link) instead of
// hitting this sandbox's honest-empty live-server state (no reachable Supabase project — see
// DEVIATION-LOG.md). `runSmoke` above is unchanged; this only widens what the module exposes.
export { ENTRY, ENTRY_FROM_RESOURCES, STATES };
