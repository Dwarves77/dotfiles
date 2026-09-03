// UX smoke spec: Market rows. Lane MOBILE, 2026-09-03, RD-60/F35. Mounts the REAL
// `MarketIntelLedger` (src/components/market/MarketIntelLedger.tsx) via ux-harness.mjs's
// `runUxSpec` in its empty / one-row / extreme-length-title states, measured at 375x812 and
// 1280x800 for law-2 targets and squeezed-title wrap (ux-assert.mjs).
//
// ROOT CAUSE FIXED (screenshot 04-market-signals, confirmed in MarketIntelLedger.tsx's SignalRow,
// ~L900): an inline-styled flex row put a non-shrinking aside (flexShrink:0, minWidth:120, a nowrap
// figure + "Full analysis ->" link + "+" toggle, ~330px) beside a flex:1/minWidth:0 title. At 375px
// the title got ~40px and every word wrapped onto its own line. Fixed with the shared `.cl-row` /
// `.cl-row__main` / `.cl-row__aside` / `.cl-row__figure` / `.cl-row__actions` classes (globals.css):
// the aside stacks BELOW the title at <=640px, full width, figure + actions back on one line.

import { runUxSpec } from './ux-harness.mjs';
import { ROW_SYSTEM_CSS } from './smoke-fixtures.mjs';

// See smoke-fixtures.mjs's ROW_SYSTEM_CSS header: the harness never loads globals.css, so this
// injects a disclosed verbatim copy of the row-system CSS as a <style> tag at module-eval time,
// before window.__mount runs — otherwise this spec would measure the unstyled, pre-fix layout.
const ENTRY = `
(() => {
  const style = document.createElement('style');
  style.textContent = ${JSON.stringify(ROW_SYSTEM_CSS)};
  document.head.appendChild(style);
})();

import React from 'react';
import { createRoot } from 'react-dom/client';
import { MarketIntelLedger } from '@/components/market/MarketIntelLedger';

let root = null;
window.__mount = (props) => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(React.createElement(MarketIntelLedger, props));
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

const LONG = (n, word = 'extremely-long-market-signal-title-token') =>
  Array.from({ length: n }, (_, i) => `${word}-${i}`).join(' ');

function signal(i, { long = false } = {}) {
  return {
    id: `sig-${i}`,
    cat: 'ocean',
    sub: 'freight',
    title: long ? `${LONG(9)} #${i}` : `SAF cost outlook #${i}`,
    url: 'https://example.com',
    note: long ? LONG(15, 'long-note-word') : 'Short signal note.',
    type: 'market_signal',
    priority: 'HIGH',
    added: '2026-08-01',
    reasoning: '',
    tags: [],
    whatIsIt: long ? LONG(20, 'long-summary-word') : 'What this signal is about.',
    whyMatters: '',
    severity: i % 5 === 0 ? 'action_required' : i % 5 === 1 ? 'cost_alert' : i % 5 === 2 ? 'window_closing' : i % 5 === 3 ? 'competitive_edge' : 'monitoring',
    signalBand: i % 3 === 0 ? 'price' : i % 3 === 1 ? 'corporate' : 'corridor',
    jurisdictionIso: ['EU'],
    // Always a real priceStat (never null) here: MarketIntelLedger's own honest-state design
    // (file header, ~L31) renders an em-dash "—" for `priceStat: null` — legitimate, pre-existing,
    // out of this lane's scope — which the rendering guard's placeholder-literal scan (a strictly
    // wide net over every p/span/li/button/a text node, guard-assert.mjs) correctly flags as a
    // no-data token wherever it appears. This spec measures ROW LAYOUT, not the empty-price path,
    // so every fixture row carries a priceStat to keep that unrelated, working-as-designed path out
    // of the measured states.
    priceStat: long
      ? { valueDisplay: '$1,234.56/t', label: 'a very long price label describing the release window and methodology' }
      : { valueDisplay: '$42.10/t', label: 'spot price' },
    whatItChanges: long ? LONG(25, 'analysis-word') : '',
    conversionTrigger: '',
  };
}

const EMPTY_STATE = { initialResources: [], aggregates: EMPTY_AGGREGATES, seriesBoard: undefined };
const ONE_ROW_STATE = { initialResources: [signal(0)], aggregates: EMPTY_AGGREGATES, seriesBoard: undefined };
const EXTREME_STATE = {
  initialResources: Array.from({ length: 10 }, (_, i) => signal(i, { long: true })),
  aggregates: EMPTY_AGGREGATES,
  seriesBoard: undefined,
};

const SPEC = {
  name: 'market-rows',
  entry: ENTRY,
  states: [
    { label: 'empty', props: EMPTY_STATE },
    { label: 'one-row', props: ONE_ROW_STATE, expectTitles: 1 },
    { label: 'extreme', props: EXTREME_STATE, expectTitles: 10 },
  ],
};

export async function runSmoke(browser) {
  return runUxSpec(browser, SPEC);
}
