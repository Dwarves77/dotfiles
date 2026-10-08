// UX smoke spec: the cross-page surfaces (lane S3-B, 2026-10-05). Mounts the REAL
// `CrossPageSection` (src/components/detail/CrossPageSection.tsx, the "Connected intelligence" section every detail
// page mounts) and the REAL `ThemeStripView` (src/components/shell/ThemeStripView.tsx, the themes strip on
// the four list pages), measured at 375x812 and 1280x800 for law-2 targets, overflow and squeezed or
// word-broken titles (ux-assert.mjs), on fixture data only, per the UX contract
// (docs/dispatches/lane-common-contract.md) and F35 (row-ux-coverage).
//
// Two runUxSpec calls, one result: the section and the strip are different components with different
// entries. The dashboard's theme rows live inside DashboardBrief and are measured by
// dashboard-brief-smoke.mjs (a state with themes was added there).
//
// STATES (CrossPageSection): full (stated summary, a strong and a medium intersection inline, a weak one in
// the collapsed group, a stale structured brief with members past the per-page cap), extreme (long unbroken
// tokens in every title, the squeeze class), no-brief (a theme with no brief: members plus the absence
// wording), legacy (a brief written before migration 351: markdown only), intersections-only (no theme).
// The empty state asserts the section renders NOTHING (the "never break existing display" rule).

import { fileURLToPath } from 'node:url';
import { runUxSpec, MOBILE_VIEWPORT } from './ux-harness.mjs';
import { bundleEntry, newSmokePage, mountBundle } from './harness.mjs';
import { fullAppCss } from './smoke-fixtures.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
// DetailShell.tsx (home of DetailSection) also exports an InThisListStat that calls next/navigation's
// useSearchParams; the section does not render it, but the bundle still resolves the import, so the same
// stub detail-surfaces-smoke.mjs uses stands in for it. The spec-09 stylesheet import is stubbed likewise.
const ALIAS = {
  'next/navigation': `${HERE}stub-next-navigation.mjs`,
  '@/components/market/spec09.css': `${HERE}stub-empty-css.mjs`,
};

const css = `
(() => {
  const style = document.createElement('style');
  style.textContent = ${JSON.stringify(fullAppCss())};
  document.head.appendChild(style);
})();
`;

const SECTION_ENTRY = `${css}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { CrossPageSection } from '@/components/detail/CrossPageSection';

let root = null;
window.__mount = (props) => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(React.createElement(CrossPageSection, props));
};
`;

const STRIP_ENTRY = `${css}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeStripView } from '@/components/shell/ThemeStripView';

let root = null;
window.__mount = (props) => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(React.createElement(ThemeStripView, props));
};
`;

// Lane P3 (2026-10-05): the strip as the list pages mount it. ThemeStripView is a flex-column item of the list
// shell (ListSurfaceShell: a column with minWidth 0 inside a minmax(0,1fr) grid), and the app scrolls inside
// <main> with overflow-x auto. Mounted bare, the strip never reproduced the live defect (<main> scrolling
// sideways at 375, scrollWidth 1196), because the defect needs the strip to be a flex-column item. This entry
// mounts it in that exact nesting so the guard below can measure <main>.
const SHELL_ENTRY = `${css}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeStripView } from '@/components/shell/ThemeStripView';

let root = null;
window.__mount = (props) => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(
    React.createElement('main', { id: 'smoke-main', style: { overflowX: 'auto', height: '100vh' } },
      React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr)' } },
        React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 } },
          React.createElement(ThemeStripView, props)))));
};
`;

/** <main> must never scroll sideways at the phone width: the strip scrolls inside itself. */
async function measureMainOverflow(browser, props) {
  const bundle = await bundleEntry(SHELL_ENTRY, { alias: ALIAS });
  const page = await newSmokePage(browser);
  try {
    await page.setViewportSize({ width: MOBILE_VIEWPORT.width, height: MOBILE_VIEWPORT.height });
    await mountBundle(page, bundle, '__mount', props);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    await page.waitForTimeout(50);
    return await page.evaluate(() => {
      const main = document.getElementById('smoke-main');
      const strip = document.querySelector('[data-guard-strip]');
      return { mainScroll: main.scrollWidth, mainClient: main.clientWidth, stripClient: strip ? strip.clientWidth : 0, stripScroll: strip ? strip.scrollWidth : 0 };
    });
  } finally {
    await page.close();
  }
}

const LONG_UNBROKEN = 'euregulationonpackagingandpackagingwastecomprehensiverevisiontwentytwentysix1234567890';

const ix = (scenarios, objects, strength, tier) => ({ signal: 'intersection', detail: { scenarios, objects, strength, tier }, weight: 0.9 });
const conn = (id, surface, basis) => ({ id, direction: 'outgoing', relationship: 'related', origin: 'provenance_discovery', basis, score: 0.9, surface });

function lookupFor(ids, titleOf) {
  return Object.fromEntries(ids.map((id, i) => [id, { id, title: titleOf(i), priority: 'HIGH' }]));
}

const STRUCTURED = {
  connection: 'The items share the ETS allowance surrender scenario and the ocean carrier compliance object.',
  meaning: 'Over the long term the surcharge is structural rather than cyclical, which changes how contracts are priced.',
  forThisPage: 'File the surrender and keep the evidence for the verifier.',
  watch: '- A consultation closes later this year.\n- The next verifier cycle opens in the spring.',
  gaps: 'No operations coverage for the Asian ports yet.',
};

const members = (n, label) =>
  Array.from({ length: Math.min(n, 6) }, (_, i) => ({ id: `${label}-${i}`, title: `${label} item ${i} on the corridor`, href: `/${label}/${label}-${i}` }));

function theme({ hasBrief = true, stale = false, sections = STRUCTURED, briefMd = null, long = false } = {}) {
  const t = (s) => (long ? `${LONG_UNBROKEN} ${s}` : s);
  return {
    themeId: 'theme-1',
    title: hasBrief ? t('Surcharge theme across the corridor') : null,
    briefMd,
    generatedAt: '2026-10-04T00:00:00Z',
    memberCount: 14,
    density: 0.4,
    stale,
    supersedesThemeId: stale ? 'old-theme' : null,
    hasBrief,
    absence: hasBrief ? null : 'A brief for this theme has not been written yet, so what this connection means is not stated here.',
    sections: hasBrief ? sections : null,
    ramificationsMissing: false,
    pages: [
      { surface: 'regulations', label: 'Regulations' },
      { surface: 'market', label: 'Market Intel' },
      { surface: 'research', label: 'Research' },
    ],
    membersByPage: [
      { surface: 'market', label: 'Market Intel', samePage: false, total: 9, items: members(9, 'market').map((m) => ({ ...m, title: t(m.title) })), moreHref: '/market' },
      { surface: 'research', label: 'Research', samePage: false, total: 2, items: members(2, 'research'), moreHref: null },
      { surface: 'regulations', label: 'Regulations', samePage: true, total: 1, items: members(1, 'regulations'), moreHref: null },
    ],
  };
}

function intersections(long) {
  const t = (s) => (long ? `${LONG_UNBROKEN} ${s}` : s);
  const ids = ['m1', 'm2', 'r1', 'g1'];
  const titles = [t('Bunker surcharge signal for the Asia Europe corridor'), t('Second market signal'), t('Methanol engine trial result'), t('A second regulation on the same instrument')];
  return {
    connections: [
      conn('m1', 'market', [ix(['ocean-bunkering', 'ets-allowance-surrender'], ['carrier-ocean', 'vessel-operator'], 14, 'strong')]),
      conn('m2', 'market', [ix(['ets-allowance-surrender'], ['carrier-ocean', 'shipper'], 9, 'medium')]),
      conn('r1', 'research', [ix(['saf-blending'], ['carrier-air'], 5, 'weak')]),
      conn('g1', 'regulations', [ix(['ets-allowance-surrender'], ['vessel-operator'], 9, 'medium')]),
    ],
    resourceLookup: lookupFor(ids, (i) => titles[i]),
  };
}

const base = { surfaceKey: 'regulations', surfaceLabel: 'Regulations' };

const CHIP = (i, long = false) => ({
  themeId: `theme-${i}`,
  href: `/market/item-${i}`,
  // Lane P2: a theme with no brief shows a derived label (theme-brief.mjs deriveThemeLabel), never the pivot's
  // title; the long unbroken pivot title now only sits on the link's title attribute, and a long BRIEF title
  // (the squeeze class) is the one that can still be long, so the extreme state carries it on every other chip.
  label: i % 2 === 0 && long ? `${LONG_UNBROKEN} brief ${i}` : `Shared scenarios across Regulations and Market Intel`,
  itemTitle: long ? `${LONG_UNBROKEN} theme ${i}` : `Bunker surcharge signal ${i}`,
  briefTitle: null,
  memberCount: 10 + i,
  pages: [
    { surface: 'regulations', label: 'Regulations' },
    { surface: 'market', label: 'Market Intel' },
    { surface: 'research', label: 'Research' },
    { surface: 'operations', label: 'Operations' },
  ],
  hasBrief: i % 2 === 0,
  stale: i % 4 === 0,
  links: [
    { title: long ? `${LONG_UNBROKEN} linked one` : 'A linked regulation on the instrument', href: `/regulations/a${i}` },
    { title: 'A linked research finding', href: `/research/b${i}` },
    { title: 'A linked operations profile', href: `/operations/c${i}` },
  ],
});

export async function runSmoke(browser) {
  const section = await runUxSpec(browser, {
    name: 'cross-page-section',
    entry: SECTION_ENTRY,
    alias: ALIAS,
    states: [
      { label: 'empty', props: { ...base, connections: [], resourceLookup: {}, crossPage: null } },
      { label: 'full', props: { ...base, ...intersections(false), crossPage: { intersectionSummary: 'Both items turn on how the surrender obligation reaches ocean carriers.', theme: theme({ stale: true }) } }, expectTitles: 8 },
      { label: 'extreme', props: { ...base, ...intersections(true), crossPage: { intersectionSummary: 'Both items turn on how the surrender obligation reaches ocean carriers.', theme: theme({ long: true }) } }, expectTitles: 8 },
      { label: 'no-brief', props: { ...base, connections: [], resourceLookup: {}, crossPage: { intersectionSummary: null, theme: theme({ hasBrief: false }) } }, expectTitles: 2 },
      { label: 'legacy-brief', props: { ...base, connections: [], resourceLookup: {}, crossPage: { intersectionSummary: null, theme: theme({ sections: null, briefMd: '# Surcharge theme\n\nA synthesis written before the structured sections existed.' }) } }, expectTitles: 2 },
      { label: 'intersections-only', props: { ...base, ...intersections(false), crossPage: { intersectionSummary: null, theme: null } }, expectTitles: 3 },
    ],
  });
  const strip = await runUxSpec(browser, {
    name: 'theme-strip',
    entry: STRIP_ENTRY,
    alias: ALIAS,
    states: [
      { label: 'empty', props: { chips: [] } },
      { label: 'one', props: { chips: [CHIP(1)] }, expectTitles: 1 },
      { label: 'extreme', props: { chips: [CHIP(1, true), CHIP(2, true), CHIP(3), CHIP(4), CHIP(5), CHIP(6)] }, expectTitles: 6 },
    ],
  });
  const failures = [...section.failures, ...strip.failures];
  const m = await measureMainOverflow(browser, { chips: [CHIP(1), CHIP(2), CHIP(3), CHIP(4), CHIP(5), CHIP(6)] });
  if (m.mainScroll > m.mainClient) {
    failures.push(`theme-strip:in-shell@${MOBILE_VIEWPORT.width}: <main> scrolls sideways (scrollWidth ${m.mainScroll} > clientWidth ${m.mainClient}); the strip must contain its own overflow`);
  }
  if (m.stripScroll <= m.stripClient) {
    failures.push(`theme-strip:in-shell@${MOBILE_VIEWPORT.width}: the strip does not scroll inside itself (scrollWidth ${m.stripScroll} <= clientWidth ${m.stripClient}), so its cards are clipped or the measurement is empty`);
  }
  return { checks: section.checks + strip.checks + 2, failures };
}
