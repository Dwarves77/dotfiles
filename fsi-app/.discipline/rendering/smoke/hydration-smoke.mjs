// Hydration smoke (lane HYDRATION-59, 2026-09-07; extended lane HYDRA-1, 2026-10-10). GOVERNING skill:
// caros-ledge-platform-intent.
//
// WHAT IT PROVES, AND WHY NOTHING ELSE IN THIS ENGINE DID. The rendering guard's fixture legs feed
// `page.setContent(hand-written HTML)`, no React, so no hydration. The SM/UX smoke specs mount
// real components with `createRoot`, a client-only render, so again no hydration. Neither could
// ever have caught React error #418, which needs the actual two-pass sequence: an SSR string
// produced by ONE environment, then `hydrateRoot` over it in ANOTHER. That gap is why the 2026-09-07
// clickthrough audit found #418 (and its `$RS ... parentNode` follow-on) live on production
// /regulations and /map with every gate green, and why live smoke run 38027370806 (2026-10-10) found
// it again on the home page at 375px while this leg was still green: the leg only ever hydrated the
// shared <Masthead/>, at one 25h skew, in the SAME locale and zone as the SSR pass.
//
// THE MECHANISM. Two Playwright pages in the same chromium the rest of the guard uses, each in its
// own browser context so the SERVER environment and the CLIENT environment really differ:
//   1. SERVER page (en-US, UTC, 1280x800, what a Vercel function is): patch the global `Date` so
//      `new Date()` / `Date.now()` answer instant A, then `renderToString(<C {...props} />)`;
//   2. CLIENT page (a different locale, IANA zone and viewport width): put that exact HTML in the
//      mount point, patch `Date` to instant B = A + skew, then `hydrateRoot(host, <C {...props} />,
//      { onRecoverableError })` and collect what React reports. A text mismatch surfaces as a
//      recoverable error, the un-minified form of #418.
// Skew and environment are independent axes of the same defect: skew catches a value read from the
// clock (the server rendered at T, the browser hydrates at T+delta, and delta is unbounded when the
// HTML came from a cache); the environment catches a value read from the host (locale, zone, width).
//
// RED-THEN-GREEN (CLAUDE.md rule 15, a guard is proven by attack, not by presence). Two RED controls
// MUST report a hydration error or this spec fails LOUDLY (a silent detector is worse than none):
//   - `ClockReader`: the pre-HYDRATION-59 shape, an ISO week number from local field getters.
//   - `TimeStringReader` (lane HYDRA-1): `new Date().toLocaleTimeString()` rendered directly, the
//     textbook form of the class, which the 25h skew alone never exercised at second resolution.
// The GREEN cases are real production components: the shared <Masthead/> and the whole home route
// tree (<DashboardMasthead/> + <DashboardBrief/>, exactly as src/app/page.tsx composes them) across
// the environment matrix below, including a 90 second skew, a different locale and zone, and 375px.
//
// COST: the shared chromium process, no network (every request is fulfilled locally), no database,
// no credential, same posture as every other file in this directory.

import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundleEntry } from './harness.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
/** The home route mounts <DashboardBrief/>, which calls `useRouter()`; the real hook needs an App
 *  Router context a bundle does not have (same stub dashboard-brief-smoke.mjs aliases). */
const BUNDLE_ALIAS = { alias: { 'next/navigation': join(HERE, 'stub-next-navigation.mjs') } };

const SMOKE_BASE_URL = 'https://smoke-guard.internal';

/** A = a Sunday near midnight UTC (so A+25h falls in a different day AND a different ISO week). */
const INSTANT_A = '2026-09-06T23:30:00.000Z';
const SECOND = 1000;
const HOUR = 60 * 60 * SECOND;

/** What the Vercel function that renders the page looks like. */
const SERVER_ENV = { locale: 'en-US', timezoneId: 'UTC', viewport: { width: 1280, height: 800 } };

/** What real viewers look like. Each differs from SERVER_ENV on the axes the lane brief names. */
const CLIENT_ENVS = {
  mobileSame: { locale: 'en-US', timezoneId: 'UTC', viewport: { width: 375, height: 812 }, skewMs: 90 * SECOND },
  mobileFar: { locale: 'de-DE', timezoneId: 'Pacific/Kiritimati', viewport: { width: 375, height: 812 }, skewMs: 90 * SECOND },
  /** The server's own environment, for a control: a component that differs only by environment is clean here. */
  serverTwin: { locale: 'en-US', timezoneId: 'UTC', viewport: { width: 1280, height: 800 }, skewMs: 0 },
  desktopWest: { locale: 'ja-JP', timezoneId: 'America/Los_Angeles', viewport: { width: 1440, height: 900 }, skewMs: 25 * HOUR },
};

const ENTRY = `
import React from 'react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { Masthead } from '@/components/ui/Masthead';
import { DashboardMasthead } from '@/components/dashboard/DashboardMasthead';
import { DashboardBrief } from '@/components/dashboard/DashboardBrief';
import { formatLocaleDate } from '@/lib/format';

// RED control 1: the defect class HYDRATION-59 removed, kept alive HERE (and only here) so the
// detector is exercised on every run. Local field getters + this component's own clock.
function isoWeekLocal(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
function ClockReader() {
  return React.createElement('p', null, 'VOL IV \\u00b7 No. ' + isoWeekLocal(new Date()));
}

// RED control 2 (lane HYDRA-1): the textbook form of the class. Renders the host's clock and locale
// straight into text, which a 90 second skew alone changes.
function TimeStringReader() {
  return React.createElement('p', null, 'Updated ' + new Date().toLocaleTimeString());
}

// RED control 3 (lane HYDRA-1): the ENVIRONMENT axis on its own, with no clock skew at all. A fixed
// instant formatted with the host's default locale and zone: identical text on a server in en-US/UTC,
// different text in any browser set to another locale or zone.
function LocaleDateReader() {
  return React.createElement('p', null, 'As of ' + new Date('2026-09-06T23:30:00.000Z').toLocaleString());
}

// The home route, composed the way src/app/page.tsx composes it: the server computes the instant
// ONCE, formats the date label with the UTC-pinned shared helper, and hands both to the client
// components as plain props. The fixture rows are the BriefRow shape the route's server derivation
// produces (dashboard-brief-smoke.mjs states the same shape).
const BAND_COUNTS = {
  totalItems: 1317,
  byPriority: { CRITICAL: 15, HIGH: 14, MODERATE: 1119, LOW: 169 },
  byStatus: {},
  byJurisdiction: {},
  totalJurisdictions: 32,
  lastUpdatedAt: null,
};
const AGGREGATES = { ...BAND_COUNTS, totalItems: 1434, totalJurisdictions: 61 };
const BIAS_TAGS = [
  { dimension: 'funding', tag: 'subscription-supported', confidence: 0.95 },
  { dimension: 'methodology', tag: 'methodologically-transparent', confidence: 0.9 },
  { dimension: 'stakeholder', tag: 'environmental-advocate', confidence: 0.7 },
];
const THEME_PAGES = [
  { surface: 'regulations', label: 'Regulations' },
  { surface: 'market', label: 'Market Intel' },
  { surface: 'research', label: 'Research' },
];
function row(i, kind) {
  const changed = kind !== 'due';
  return {
    id: kind + i,
    href: '/regulations/' + kind + i,
    priority: i % 2 === 0 ? 'CRITICAL' : 'HIGH',
    jurisdiction: i % 2 === 0 ? 'EU' : 'US',
    title: 'Corporate Sustainability Reporting Directive #' + i,
    meta: 'regulation \\u00b7 Ocean \\u00b7 reporting',
    impact: i === 0 ? null : { cost: 3, compliance: 2, client: 3, operational: 2 },
    due: kind === 'due' ? { label: 'Jan 1, 2027', days: '116 days' } : null,
    dueDays: kind === 'due' ? 116 : undefined,
    timeline: [
      { date: '2026-03-01', label: 'Adopted', status: 'past' },
      { date: '2027-01-01', label: 'Applies', status: 'future' },
    ],
    tier: (i % 7) + 1,
    watchType: 'reg',
    // Every optional field the route's derivation can attach, on alternating rows, so each
    // conditional branch inside a row renders under the hydration matrix, not only the plain one.
    ...(i % 2 === 0 ? { biasTags: BIAS_TAGS } : {}),
    ...(i % 3 === 0 ? { itemGrade: 'record' } : {}),
    ...(changed && kind === 'new' ? { isNew: true } : {}),
    ...(changed && kind === 'upd' ? { isUpdated: true, updatedField: 'full_brief', changeDate: '2026-09-05' } : {}),
  };
}
function homeProps(iso, variant) {
  const now = new Date(iso);
  return {
    variant,
    dateStr: formatLocaleDate(now, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }),
    weekOf: formatLocaleDate(now, { month: 'short', day: 'numeric', timeZone: 'UTC' }),
    nowIso: iso,
    watchlist: [
      { id: 'w1', type: 'reg', title: 'EU Methane Regulation', source: 'EUR-Lex', scope: 'personal', lastChangedAt: '2026-09-04T10:00:00.000Z' },
      { id: 'w2', type: 'reg', title: 'IMO Net-Zero Framework', source: 'IMO', scope: 'team', addedBy: 'A. Member', note: 'Check the annex.', lastChangedAt: '2026-08-30T10:00:00.000Z' },
    ],
  };
}
function Home({ p }) {
  // An already-fulfilled thenable: React's use() reads it synchronously, so the rail card renders in
  // the SSR string (a pending promise would take the Suspense fallback path, which is a different
  // axis than this spec measures).
  const populated = p.variant === 'populated';
  const watchlistPromise = Object.assign(Promise.resolve(p.watchlist), { status: 'fulfilled', value: p.watchlist });
  return React.createElement(React.Fragment, null,
    React.createElement('div', { className: 'cl-dashboard-masthead-wrap', style: { padding: '20px 40px 0' } },
      React.createElement(DashboardMasthead, { dateLabel: p.dateStr, nowIso: p.nowIso, itemCount: AGGREGATES.totalItems, aggregatesLoaded: true, totalJurisdictions: AGGREGATES.totalJurisdictions })),
    React.createElement(DashboardBrief, {
      dueNextRows: populated ? [0, 1, 2, 3, 4].map((i) => row(i, 'due')) : [],
      dueNextWindow: 'By next binding date \\u00b7 week of ' + p.weekOf + (populated ? ', reaching to Jan 1, 2027' : ''),
      changedRows: populated ? [0, 1, 2, 3, 4, 5].map((i) => row(i, i % 2 === 0 ? 'new' : 'upd')) : [],
      fetchError: p.variant === 'failed' ? 'Data temporarily unavailable. Refresh to retry.' : undefined,
      fetchErrorReason: p.variant === 'failed' ? 'The intelligence read did not return within its time limit.' : undefined,
      aggregates: AGGREGATES,
      bandCounts: BAND_COUNTS,
      totalChanges: 2,
      auditDate: '2026-09-05',
      surfaceCoverage: { intelligence: { regulations: 900, marketIntel: 200, research: 150, operations: 84, uncategorized: 0, totalIntelligence: 1334 }, community: { regionalRooms: 7, joinedGroups: 0, activeThreads: 0 } },
      watchlistPromise,
      nowIso: p.nowIso,
      crossPageThemes: populated
        ? [
            { themeId: 't1', href: '/market/m1', label: 'Surcharge theme across the corridor', itemTitle: 'Bunker surcharge signal', briefTitle: 'Surcharge theme across the corridor', pages: THEME_PAGES },
            { themeId: 't2', href: '/regulations/r2', label: 'Shared jurisdiction and topic across 2 pages', itemTitle: 'Methane intensity', briefTitle: null, pages: THEME_PAGES.slice(0, 2) },
          ]
        : [],
    }));
}

const CASES = {
  'red-clock-reader': () => React.createElement(ClockReader),
  'red-time-string': () => React.createElement(TimeStringReader),
  'red-locale-date': () => React.createElement(LocaleDateReader),
  masthead: (p) => React.createElement(Masthead, p),
  home: (p) => React.createElement(Home, { p }),
  'home-empty': (p) => React.createElement(Home, { p }),
  'home-failed': (p) => React.createElement(Home, { p }),
};

// Freeze the global clock at \`iso\`, run \`fn\`, restore. Both \`new Date()\` and \`Date.now()\` are
// covered, and \`new Date(x)\` keeps working.
function atInstant(iso, fn) {
  const Real = Date;
  const fixed = new Real(iso).getTime();
  function Fake(...args) {
    return args.length === 0 ? new Real(fixed) : new Real(...args);
  }
  Fake.prototype = Real.prototype;
  Fake.now = () => fixed;
  Fake.UTC = Real.UTC;
  Fake.parse = Real.parse;
  globalThis.Date = Fake;
  try {
    return fn();
  } finally {
    globalThis.Date = Real;
  }
}

// SERVER pass: build the props the route would build at \`iso\`, render to a string. The props travel
// back to Node with the HTML because the real flow serialises them into the RSC payload the client
// hydrates from: the client must not re-derive them.
window.__ssr = ({ name, iso, props }) =>
  atInstant(iso, () => {
    const p = name.startsWith('home') ? homeProps(iso, name.slice(5) || 'populated') : props;
    return { html: renderToString(CASES[name](p)), props: p };
  });

// CLIENT pass: the server's HTML is already in the mount point; hydrate it at a different instant.
window.__hydrate = async ({ name, iso, props }) => {
  const host = document.getElementById('smoke-root');
  const errors = [];
  await new Promise((resolve) => {
    atInstant(iso, () => {
      hydrateRoot(host, CASES[name](props), {
        onRecoverableError: (err) => errors.push(String((err && err.message) || err)),
      });
    });
    // Two frames: hydration is scheduled, not synchronous.
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
  return { errors };
};
`;

const MASTHEAD_PROPS = {
  title: 'Regulations',
  dateLabel: 'Sunday, September 6, 2026',
  nowIso: INSTANT_A,
  commandBar: { itemCount: 1316, scope: 'regulations' },
};

/** A page at the smoke origin with an empty mount point, inside a context of the given environment. */
async function newEnvPage(browser, env, bundleJs) {
  const context = await browser.newContext({
    locale: env.locale,
    timezoneId: env.timezoneId,
    viewport: env.viewport,
  });
  const page = await context.newPage();
  const body = '<!doctype html><html><body><div id="smoke-root"></div></body></html>';
  await page.route(`${SMOKE_BASE_URL}/`, (route) => route.fulfill({ contentType: 'text/html', body }));
  await page.goto(`${SMOKE_BASE_URL}/`);
  await page.addScriptTag({ content: bundleJs });
  return { page, context };
}

const HYDRATION_ERROR = /hydrat|did not match|didn't match/i;

/** The cases. `mustError` marks a RED control; `envs` names the CLIENT_ENVS keys it is run under. */
export const HYDRATION_RUNS = [
  { name: 'red-clock-reader', label: 'hydration:red-clock-reader', mustError: true, envs: ['desktopWest'] },
  { name: 'red-time-string', label: 'hydration:red-time-string', mustError: true, envs: ['mobileSame'] },
  { name: 'red-locale-date', label: 'hydration:red-locale-date', mustError: true, envs: ['mobileFar'], skewMs: 0 },
  { name: 'masthead', label: 'hydration:masthead', props: MASTHEAD_PROPS, mustError: false, envs: ['mobileSame', 'desktopWest'] },
  { name: 'home', label: 'hydration:home', mustError: false, envs: ['mobileSame', 'mobileFar', 'desktopWest'] },
  { name: 'home-empty', label: 'hydration:home-empty', mustError: false, envs: ['mobileFar'] },
  { name: 'home-failed', label: 'hydration:home-failed', mustError: false, envs: ['mobileFar'] },
];

export async function runSmoke(browser) {
  return runHydrationRuns(browser, HYDRATION_RUNS);
}

/** Run an explicit list of cases. Exported so the guard's own attack test can hand it a deliberately
 *  wrong declaration (a broken component declared clean, a clean one declared broken) and assert the
 *  detector refuses both: a detector is proven by attack, never by its own green run. */
export async function runHydrationRuns(browser, runs) {
  const failures = [];
  let checks = 0;
  const bundleJs = await bundleEntry(ENTRY, BUNDLE_ALIAS);

  const server = await newEnvPage(browser, SERVER_ENV, bundleJs);
  try {
    for (const c of runs) {
      const { html, props } = await server.page.evaluate(
        ({ name, iso, p }) => window.__ssr({ name, iso, props: p }),
        { name: c.name, iso: INSTANT_A, p: c.props ?? null },
      );
      for (const envKey of c.envs) {
        const env = CLIENT_ENVS[envKey];
        const skewMs = c.skewMs ?? env.skewMs;
        const clientIso = new Date(new Date(INSTANT_A).getTime() + skewMs).toISOString();
        const client = await newEnvPage(browser, env, bundleJs);
        try {
          await client.page.evaluate((h) => {
            document.getElementById('smoke-root').innerHTML = h;
          }, html);
          const result = await client.page.evaluate(
            ({ name, iso, p }) => window.__hydrate({ name, iso, props: p }),
            { name: c.name, iso: clientIso, p: props },
          );
          checks += 1;
          const where = `${envKey} (${env.locale}, ${env.timezoneId}, ${env.viewport.width}px, +${skewMs / SECOND}s)`;
          const hydrationErrors = result.errors.filter((e) => HYDRATION_ERROR.test(e));
          if (c.mustError && hydrationErrors.length === 0) {
            failures.push(
              `${c.label} @ ${where}: RED control did not reproduce a hydration mismatch, the detector is ` +
                'broken, not the app. Do not treat the GREEN results as meaningful.',
            );
          }
          if (!c.mustError && hydrationErrors.length > 0) {
            failures.push(`${c.label} @ ${where}: hydration mismatch, ${hydrationErrors.join(' | ').slice(0, 1500)}`);
          }
        } finally {
          await client.context.close();
        }
      }
    }
  } finally {
    await server.context.close();
  }
  return { checks, failures };
}
