// UX smoke spec: Research rows. Lane MOBILE, 2026-09-03, RD-60/F35. Mounts the REAL
// `ResearchLedger` (src/components/research/ResearchLedger.tsx) via ux-harness.mjs's `runUxSpec`
// in its empty / one-row / extreme-length-title states, measured at 375x812 and 1280x800 for
// law-2 targets and squeezed-title wrap (ux-assert.mjs).
//
// ROOT CAUSE FIXED (screenshot 03-research-findings, confirmed in the pre-UILISTS
// ResearchLedger.tsx's FindingRow, same shape as MarketIntelLedger's SignalRow ~L900): an
// inline-styled flex row put a non-shrinking aside beside a flex:1/minWidth:0 title. Fixed with
// the shared `.cl-row` / `.cl-row__main` / `.cl-row__aside` / `.cl-row__figure` /
// `.cl-row__actions` classes (globals.css).
//
// REWRITTEN this lane (UILISTS, 2026-09-06). ResearchLedger no longer consumes a
// `ResearchPipelineItem[]` under an `items` prop (its own severity-tile vocabulary, a second
// competing tile system per artboard 06's own note): it now consumes `getPublicResearchItems()`'s
// `Resource[]` under `resources`, the SAME shape every other surface's fixture already uses (see
// regulations-rows-smoke.mjs's `reg()` / market-rows-smoke.mjs's `signal()`), through
// ListSurfaceShell's shared ListRow — one urgency band, one ImpactMeter/MilestoneTimeline/TierChip,
// Themes as a facet (`theme` column, src/lib/research/taxonomy.mjs's THEME_COLUMN_TO_KEY) instead
// of a second tile row. This fixture is rewritten to match; the old ResearchPipelineItem fixture
// shape (`items`, `pipelineStage`, `baseTier`/`effectiveTier`, `sourceName`, ...) is gone with it.

import { runUxSpec } from './ux-harness.mjs';
import { fileURLToPath } from 'node:url';
import { ROW_SYSTEM_CSS } from './smoke-fixtures.mjs';

// See smoke-fixtures.mjs's ROW_SYSTEM_CSS header: the harness never loads globals.css, so this
// injects a disclosed verbatim copy of the row-system CSS as a <style> tag at module-eval time.
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

// COUNTS-61 (2026-09-08): the ledger now reads its facet state from the URL through
// useListSurfaceFilter (useSearchParams/useRouter/usePathname), so every facet is linkable rather
// than only the band. Outside a real Next App Router tree those hooks throw ("invariant expected app
// router to be mounted"), so this spec aliases them to the same stub regulations-rows-smoke.mjs and
// community-smoke.mjs already use, rather than a third copy of it.
const HERE = fileURLToPath(new URL('.', import.meta.url));
const ALIAS = { 'next/navigation': `${HERE}stub-next-navigation.mjs` };

const EMPTY_AGGREGATES = {
  totalItems: 0,
  byPriority: { CRITICAL: 0, HIGH: 0, MODERATE: 0, LOW: 0 },
  byStatus: {},
  byJurisdiction: {},
  totalJurisdictions: 0,
  lastUpdatedAt: null,
};

const LONG = (n, word = 'extremely-long-research-finding-title-token') =>
  Array.from({ length: n }, (_, i) => `${word}-${i}`).join(' ');

function finding(i, { long = false } = {}) {
  return {
    id: `find-${i}`,
    // `theme` (migration-102 DB column, THEME_COLUMN_TO_KEY in taxonomy.mjs) short-circuits the
    // title/summary keyword classifier so every fixture row lands in the same theme band
    // deterministically, same posture as the pre-rewrite fixture's own comment on this field.
    theme: 'emissions_accounting',
    title: long ? `${LONG(9)} #${i}` : `Methodology shift in Scope 3 reporting #${i}`,
    note: long ? LONG(15, 'long-note-word') : 'Short finding note.',
    type: 'research_finding',
    priority: 'HIGH',
    added: '2026-08-01',
    jurisdiction: 'EU',
    jurisdictionIso: ['EU'],
    sourceTier: (i % 7) + 1,
    citationCount: i % 4 === 0 ? null : 2,
    biasTags: i % 3 === 0 ? [{ dimension: 'funding', tag: 'industry_funded', confidence: 0.7 }] : [],
    itemGrade: i % 5 === 4 ? undefined : 'record',
    reasoning: '',
    // `tags` deliberately carries a real cost/client-facing keyword (src/lib/scoring.ts's
    // scoreResource): a research_finding's `type` is not in scoreResource's `isReg` list and an
    // empty `tags`/generic `cat` legitimately scores all-zero (the honest "Impact not scored"
    // em-dash, ImpactMeter.tsx's own `isScored` check) — real, working-as-designed behaviour, not
    // a defect, but it starves this ROW-LAYOUT spec's every row of the populated-impact-bar shape
    // the other three surfaces' fixtures already exercise (reg()/opsItem()'s `type: 'regulation'`,
    // signal()'s `cat: 'ocean'` + HIGH priority). "scope 3" is real research-finding content
    // (Methodology shift in Scope 3 reporting, this fixture's own title) that also happens to
    // score client=3 in scoreResource's client bucket.
    tags: ['scope 3'],
    whatIsIt: long ? LONG(20, 'long-summary-word') : 'What this finding is about.',
    whyMatters: '',
    timeline: [{ date: '2027-06-01', label: 'Next review', status: 'future' }],
  };
}

const EMPTY_STATE = { resources: [], aggregates: EMPTY_AGGREGATES, sourceCoverage: [] };
const ONE_ROW_STATE = { resources: [finding(0)], aggregates: EMPTY_AGGREGATES, sourceCoverage: [] };
const EXTREME_STATE = {
  resources: Array.from({ length: 10 }, (_, i) => finding(i, { long: true })),
  aggregates: EMPTY_AGGREGATES,
  sourceCoverage: [],
};

// UILISTS lane (2026-09-06): "Action" is BAND_ORDER's real, static band-tile label
// (src/lib/urgency/bands.ts), rendered by every one of this lane's five surfaces via the
// shared ListSurfaceShell/BandTile — a disclosed, confirmed-safe match against
// source-entry-filter.mjs's HEADER_LITERALS vocabulary (built for an unrelated table-header
// case), same carve-out regulations-rows-smoke.mjs established per-spec.
const KNOWN_SAFE_PLACEHOLDERS = ['Action'];

const SPEC = {
  knownSafePlaceholders: KNOWN_SAFE_PLACEHOLDERS,
  name: 'research-rows',
  entry: ENTRY,
  states: [
    { label: 'empty', props: EMPTY_STATE },
    { label: 'one-row', props: ONE_ROW_STATE, expectTitles: 1 },
    // ResearchLedger (via ListSurfaceShell) collapses each band to PER_BAND_CAP (5) shown by
    // default — all 10 extreme-length fixture rows share one priority band (HIGH -> "Action"), so
    // 5 render (correct, pre-existing collapse behaviour, not a defect).
    { label: 'extreme', props: EXTREME_STATE, expectTitles: 5 },
  ],
};

export async function runSmoke(browser) {
  return runUxSpec(browser, { ...SPEC, alias: ALIAS });
}
