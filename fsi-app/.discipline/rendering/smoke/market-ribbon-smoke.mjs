// UX smoke spec: the Market headline ribbon and the scoped policy timeline view (lane MKT-1, 2026-10-08;
// VERIFY-1 register rows 02S6 r1, r9, r10, r11; operator rulings of 2026-10-08). Two real components,
// mounted through ux-harness.mjs's `runUxSpec` (law-2 targets, overflow, squeezed and broken titles,
// clipped text, the declared-strip rule, at 375, 768, 1024 and 1280, plus the 1440 cell-bounds sweep):
//
//   1. `src/components/market/MarketComparativeRibbon.tsx`, over a board built by the REAL pipeline
//      (buildSeriesBoard over raw market_series-shaped rows), in two states: a full board (every window
//      computes, one series has too little history for 1m and YoY, one has a unit change, one a zero
//      prior) and a thin board (one series, three observations). Bespoke text checks then prove each state
//      renders what is unique to it and never a dash or the retired word "pending" where a number would be.
//   2. `src/components/regulations/UpcomingObligationsStripView.tsx` in its SCOPED form (the Market policy
//      timeline): the filter as text, the "N hidden by your scope" control, and a real click that widens
//      and narrows, so the one-click widen is proven in a browser and not only in markup.
//
// Registered in ux-smoke-specs.mjs; F35's ROW_COMPONENTS carries the ribbon line.

import { runUxSpec } from './ux-harness.mjs';
import { bundleEntry, newSmokePage, mountBundle } from './harness.mjs';
import { fullAppCss } from './smoke-fixtures.mjs';
import { buildSeriesBoard } from '../../../src/lib/market/series-board-view-model.mjs';

const STYLE_INJECT = `
(() => {
  const style = document.createElement('style');
  style.textContent = ${JSON.stringify(fullAppCss())};
  document.head.appendChild(style);
})();
`;

const RIBBON_ENTRY = `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MarketComparativeRibbon } from '@/components/market/MarketComparativeRibbon';

let root = null;
window.__mount = (props) => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(React.createElement(MarketComparativeRibbon, props));
};
`;

const SCOPE_ENTRY = `
${STYLE_INJECT}
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { UpcomingObligationsStripView } from '@/components/regulations/UpcomingObligationsStripView';

function Scoped({ events, label, hidden }) {
  const [widened, setWidened] = useState(false);
  return React.createElement(UpcomingObligationsStripView, {
    variant: 'list',
    events,
    scopeInfo: { label, hiddenByScope: hidden, widened, onToggleWiden: () => setWidened((w) => !w) },
  });
}

let root = null;
window.__mount = (props) => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(React.createElement(Scoped, props));
};
`;

const NOW = '2026-09-08';

function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function row(seriesKey, date, value, extra = {}) {
  return {
    id: `${seriesKey}@${date}`,
    series_key: seriesKey,
    label: seriesKey,
    reference_period: date,
    as_at_date: date,
    value_numeric: value,
    unit: extra.unit ?? 'EUR/1000L',
    currency: extra.currency ?? 'EUR',
    source_key: 'ec_weekly_oil_bulletin',
    source_ref: 'oil-bulletin-fixture',
    derivation: 'observed',
    origin_class: 'official',
    method_version: 'v1',
    n_observations: 27,
  };
}

function weekly(seriesKey, last, count, valueAt) {
  return Array.from({ length: count }, (_, i) => row(seriesKey, addDays(last, -7 * (count - 1 - i)), valueAt(i)));
}

const DIESEL = 'eu-oil-bulletin:automotive-diesel';
const SUPER = 'eu-oil-bulletin:eurosuper-95';
const HFO = 'eu-oil-bulletin:heavy-fuel-oil-3-5pct';
const RESID = 'eu-oil-bulletin:residual-fuel-oil-1pct';

const FULL_BOARD = buildSeriesBoard([
  ...weekly(DIESEL, '2026-09-07', 58, (i) => 1100 + i * 2 + (i % 5) * 3),
  ...weekly(SUPER, '2026-09-07', 3, (i) => 1000 + i * 4),
  row(HFO, '2026-08-03', 500, { unit: 'EUR/t' }),
  row(HFO, '2026-08-31', 510, { unit: 'USD/t', currency: 'USD' }),
  row(HFO, '2026-09-07', 520, { unit: 'EUR/t' }),
  row(RESID, '2026-08-03', 0, { unit: 'EUR/t' }),
  row(RESID, '2026-08-31', 0, { unit: 'EUR/t' }),
  row(RESID, '2026-09-07', 646, { unit: 'EUR/t' }),
]);

const THIN_BOARD = buildSeriesBoard([
  row(DIESEL, '2026-08-24', 1200),
  row(DIESEL, '2026-08-31', 1210),
  row(DIESEL, '2026-09-07', 1220),
]);

const FULL_STATE = { label: 'full-board', props: { board: FULL_BOARD, embedded: true, nowIso: NOW }, expectTitles: 4 };
const THIN_STATE = { label: 'thin-board', props: { board: THIN_BOARD, embedded: true, nowIso: NOW }, expectTitles: 1 };

const EVENTS = [1, 2, 3].map((n) => ({
  id: `e${n}`,
  event_date: `2026-11-0${n}`,
  date_precision: 'day',
  event_kind: 'compliance_deadline',
  obligation_text: `Obligation ${n} for the fixture item`,
  item: { id: `i${n}`, title: `Fixture regulation ${n}`, legacy_id: null, jurisdiction_iso: ['EU'] },
}));

const SCOPED_STATE = { label: 'scoped-3-hidden', props: { events: EVENTS, label: 'Ocean, EU', hidden: 3 }, expectTitles: 3 };
const SCOPED_EMPTY_STATE = { label: 'scoped-empty', props: { events: [], label: 'Ocean, EU', hidden: 5 } };

export async function runSmoke(browser) {
  const ribbon = await runUxSpec(browser, { name: 'market-ribbon', entry: RIBBON_ENTRY, states: [FULL_STATE, THIN_STATE] });
  const scope = await runUxSpec(browser, { name: 'market-policy-scope', entry: SCOPE_ENTRY, states: [SCOPED_STATE, SCOPED_EMPTY_STATE] });
  const failures = [...ribbon.failures, ...scope.failures];
  let checks = ribbon.checks + scope.checks;

  const ribbonBundle = await bundleEntry(RIBBON_ENTRY);
  const scopeBundle = await bundleEntry(SCOPE_ENTRY);

  async function withPage(bundle, props, fn) {
    const page = await newSmokePage(browser);
    try {
      await mountBundle(page, bundle, '__mount', props);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
      return await fn(page);
    } finally {
      await page.close();
    }
  }

  // Ribbon, full board: every window and the trend are on the Diesel card, the states are named, the
  // retired word and a bare dash never stand where a number would be.
  checks += 1;
  const full = await withPage(ribbonBundle, FULL_STATE.props, (page) =>
    page.evaluate(() => {
      const text = (sel) => [...document.querySelectorAll(sel)].map((e) => e.textContent.trim());
      return {
        body: document.body.innerText,
        w1: text('[data-audit="headline-card-delta"]'),
        m1: text('[data-audit="headline-card-delta-1m"]'),
        yoy: text('[data-audit="headline-card-delta-yoy"]'),
        spark: document.querySelectorAll('[data-audit="headline-card-spark"] svg polyline').length,
        badges: document.querySelectorAll('[data-audit="series-freshness-badge"]').length,
        panel: !!document.querySelector('[data-audit="series-freshness-panel"]'),
        drawerOpen: document.querySelector('[data-audit="headline-method-drawer"]')?.hasAttribute('open') ?? null,
        blocks: document.querySelectorAll('[data-audit="headline-method-block"]').length,
      };
    }),
  );
  if (!full.w1.some((t) => /^[▲▼]\d+\.\d% 1w$/.test(t))) failures.push(`market-ribbon:full-board, no 1w change in the card's own form (${JSON.stringify(full.w1)})`);
  if (!full.m1.some((t) => /% 1m$/.test(t))) failures.push(`market-ribbon:full-board, no 1m change rendered (${JSON.stringify(full.m1)})`);
  if (!full.yoy.some((t) => /% YoY$/.test(t))) failures.push(`market-ribbon:full-board, no YoY change rendered (${JSON.stringify(full.yoy)})`);
  if (full.spark < 1) failures.push('market-ribbon:full-board, no sparkline polyline rendered');
  if (full.badges !== 4) failures.push(`market-ribbon:full-board, expected 4 freshness badges, found ${full.badges}`);
  if (!full.panel) failures.push('market-ribbon:full-board, freshness panel summary missing');
  if (full.drawerOpen !== false) failures.push('market-ribbon:full-board, the methodology disclosure must exist and be closed by default');
  if (full.blocks !== 4) failures.push(`market-ribbon:full-board, expected 4 provenance blocks, found ${full.blocks}`);
  if (!/no data yet/i.test(full.body)) failures.push('market-ribbon:full-board, the short-history series must name "no data yet"');
  if (!/suppressed/i.test(full.body)) failures.push('market-ribbon:full-board, the unit change must name "suppressed"');
  if (!/not applicable/i.test(full.body)) failures.push('market-ribbon:full-board, the zero prior must name "not applicable"');
  if (/pending/i.test(full.body)) failures.push('market-ribbon:full-board, the retired word "pending" rendered');

  // Ribbon, thin board: one series, three observations: 1w computes, 1m and YoY say no data yet, never a dash.
  checks += 1;
  const thin = await withPage(ribbonBundle, THIN_STATE.props, (page) => page.evaluate(() => document.body.innerText));
  if (!/1m · no data yet/i.test(thin) || !/yoy · no data yet/i.test(thin)) failures.push('market-ribbon:thin-board, expected "1m" and "YoY" to name no data yet');

  // Scoped timeline: a real click widens, the same control narrows back.
  checks += 1;
  const widen = await withPage(scopeBundle, SCOPED_STATE.props, async (page) => {
    const before = await page.evaluate(() => ({
      label: document.querySelector('[data-audit="policy-scope-label"]')?.textContent,
      widen: document.querySelector('[data-audit="policy-scope-widen"]')?.textContent,
    }));
    await page.click('[data-audit="policy-scope-widen"]');
    const widened = await page.evaluate(() => ({
      label: document.querySelector('[data-audit="policy-scope-label"]')?.textContent,
      widen: !!document.querySelector('[data-audit="policy-scope-widen"]'),
      narrow: document.querySelector('[data-audit="policy-scope-narrow"]')?.textContent,
    }));
    await page.click('[data-audit="policy-scope-narrow"]');
    const back = await page.evaluate(() => ({
      label: document.querySelector('[data-audit="policy-scope-label"]')?.textContent,
      widen: !!document.querySelector('[data-audit="policy-scope-widen"]'),
    }));
    return { before, widened, back };
  });
  if (widen.before.label !== 'Ocean, EU' || !/3 hidden by your scope/.test(widen.before.widen ?? '')) failures.push(`market-policy-scope: initial state wrong (${JSON.stringify(widen.before)})`);
  if (widen.widened.label !== 'All modes and regions' || widen.widened.widen || !/Back to your scope/.test(widen.widened.narrow ?? '')) failures.push(`market-policy-scope: clicking widen did not widen (${JSON.stringify(widen.widened)})`);
  if (widen.back.label !== 'Ocean, EU' || !widen.back.widen) failures.push(`market-policy-scope: clicking back did not restore the scope (${JSON.stringify(widen.back)})`);

  return { checks, failures };
}
