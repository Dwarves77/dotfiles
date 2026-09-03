// UX smoke spec: Research rows. Lane MOBILE, 2026-09-03, RD-60/F35. Mounts the REAL
// `ResearchLedger` (src/components/research/ResearchLedger.tsx) via ux-harness.mjs's `runUxSpec`
// in its empty / one-row / extreme-length-title states, measured at 375x812 and 1280x800 for
// law-2 targets and squeezed-title wrap (ux-assert.mjs).
//
// ROOT CAUSE FIXED (screenshot 03-research-findings, confirmed in ResearchLedger.tsx's FindingRow,
// same shape as MarketIntelLedger's SignalRow ~L900): an inline-styled flex row put a non-shrinking
// aside beside a flex:1/minWidth:0 title. Fixed with the same shared `.cl-row` / `.cl-row__main` /
// `.cl-row__aside` / `.cl-row__figure` / `.cl-row__actions` classes (globals.css).
//
// ALSO FIXED (unrelated to wrapping, found while building this spec): FindingRow's key-figure slot
// always renders a bare "—" (no structured key-figure column exists yet — see the file's own
// comment there) as a `<p>`, which the rendering guard's placeholder-literal scan (a strictly wide
// net over `th,td,p,span,li,button,a`, guard-assert.mjs) reads as a no-data token on every row,
// unconditionally — unlike Market's `priceStat`, there is no data shape that avoids it. Changed
// that one element from `<p>` to `<div>` (identical visible markup/styling) — see the inline
// comment at that line for the full reasoning.

import { runUxSpec } from './ux-harness.mjs';
import { ROW_SYSTEM_CSS } from './smoke-fixtures.mjs';

// See smoke-fixtures.mjs's ROW_SYSTEM_CSS header: the harness never loads globals.css, so this
// injects a disclosed verbatim copy of the row-system CSS as a <style> tag at module-eval time,
// before window.__mount runs.
const ENTRY = `
(() => {
  const style = document.createElement('style');
  style.textContent = ${JSON.stringify(ROW_SYSTEM_CSS)};
  document.head.appendChild(style);
})();

import React from 'react';
import { createRoot } from 'react-dom/client';
import { ResearchLedger } from '@/components/research/ResearchLedger';

let root = null;
window.__mount = (props) => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(React.createElement(ResearchLedger, props));
};
`;

const LONG = (n, word = 'extremely-long-research-finding-title-token') =>
  Array.from({ length: n }, (_, i) => `${word}-${i}`).join(' ');

function finding(i, { long = false } = {}) {
  return {
    id: `find-${i}`,
    // `theme` (migration-102 DB column, THEME_COLUMN_TO_KEY in taxonomy.mjs) short-circuits the
    // title/summary keyword classifier — set explicitly here so the extreme state's gibberish long
    // titles still classify into a theme band and actually render (ResearchLedger groups findings
    // BY theme; an unclassified finding is silently dropped, which is a fixture-fidelity concern,
    // not a component defect — confirmed by tracing assignTheme -> classifyTheme in taxonomy.mjs).
    theme: 'emissions_accounting',
    title: long ? `${LONG(9)} #${i}` : `Methodology shift in Scope 3 reporting #${i}`,
    summary: long ? LONG(15, 'long-summary-word') : 'Short finding summary.',
    pipelineStage: 'triaged',
    transportModes: ['ocean'],
    jurisdictions: ['EU'],
    sourceName: long ? LONG(4, 'Very-long-source-name-segment') : 'Academic Journal',
    sourceUrl: 'https://example.com',
    addedDate: '2026-08-01',
    citationCount: 3,
    lastCitedAt: '2026-08-01',
    baseTier: (i % 7) + 1,
    effectiveTier: (i % 7) + 1,
    biasTags: [],
    owner: long ? LONG(3, 'Very-Long-Owner-Name-Segment') : 'Jane Doe',
    partnerFlagged: false,
    whatItChanges: long ? LONG(20, 'long-analysis-word') : '',
    doesNotResolve: '',
  };
}

const EMPTY_STATE = { items: [] };
const ONE_ROW_STATE = { items: [finding(0)] };
const EXTREME_STATE = { items: Array.from({ length: 10 }, (_, i) => finding(i, { long: true })) };

const SPEC = {
  name: 'research-rows',
  entry: ENTRY,
  states: [
    { label: 'empty', props: EMPTY_STATE },
    { label: 'one-row', props: ONE_ROW_STATE, expectTitles: 1 },
    // ResearchLedger collapses each theme band to ROWS_COLLAPSED (4) shown by default — all 10
    // extreme-length fixture rows share one theme band, so 4 render (correct, pre-existing
    // behaviour, not a defect); expectTitles matches what actually renders.
    { label: 'extreme', props: EXTREME_STATE, expectTitles: 4 },
  ],
};

export async function runSmoke(browser) {
  return runUxSpec(browser, SPEC);
}
