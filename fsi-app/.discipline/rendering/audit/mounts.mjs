// Design-audit mount registry (lane uxaudit-harness, 2026-09-07).
//
// WHAT THIS IS. The rendering guard's smoke specs (../smoke/*-smoke.mjs) already bundle and mount
// the REAL `src/components/**` modules in a Playwright page — see ../smoke/harness.mjs's header for
// the full contract (esbuild bundle, fake same-origin URL, page.route for every fetch, no network,
// no database, no credential). Those specs measure LAYOUT SURVIVAL (overflow, placeholder leakage,
// law-2 targets). This registry reuses the identical machinery to measure DESIGN FIDELITY: a spec
// JSON in ./spec names a mount here, a CSS selector into it, and the exact value the design source
// states for each property.
//
// A mount is GUARD CODE, not product code. Adding one is additive and never touches `src/**`.
//
// EACH ENTRY: { id, description, viewport, entry, alias?, apiRoutes? }
//   entry     a TSX module string defining `window.__mount()`, bundled by ../smoke/harness.mjs
//   viewport  the width the design states for this part (1440 for everything in this bundle;
//             docs/design/handoff-2026-09-06/README.md: "desktop 1440 only, by decision")
//   alias     esbuild alias overrides on top of harness.mjs's DEFAULT_ALIAS
//
// FIXTURE DATA. Every value below is invented sample data with the SHAPE the real props take. It is
// never shipped and never asserted on — the audit asserts on GEOMETRY, COLOUR and TYPE, which is
// what the design states. Where a spec does assert on text (a fixed design label like "Fact"), the
// text is the component's own literal, not fixture data.

import { fileURLToPath } from 'node:url';
import { fullAppCss } from '../smoke/smoke-fixtures.mjs';

const SMOKE = fileURLToPath(new URL('../smoke/', import.meta.url));

const STYLE_INJECT = `
(() => {
  const style = document.createElement('style');
  style.textContent = ${JSON.stringify(fullAppCss())};
  document.head.appendChild(style);
  document.body.style.margin = '0';
})();
`;

// ── FactCard ────────────────────────────────────────────────────────────────────────────────────
// Three variants side by side, each wrapped in its own `[data-audit]` box so a spec can address one
// variant by selector. The wrapper is a plain block with no styling of its own; `> div` inside it is
// the FactCard's own root element.
const FACTCARD_ENTRY = `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { FactCard } from '@/components/ui/FactCard';

let root = null;
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(
    React.createElement('div', { style: { width: 778, padding: 20, background: 'var(--page)' } },
      React.createElement('div', { 'data-audit': 'sourced' },
        React.createElement(FactCard, {
          variant: 'sourced',
          text: 'Shipping companies must monitor, report and surrender ETS allowances for each tonne of reported CO2 from ships of 5,000 GT and above calling at EEA ports.',
          source: { title: 'ETS Extension to Maritime', issuer: 'EMSA', date: 'accessed 2026', url: 'https://example.com/source', tier: 2 },
        })),
      React.createElement('div', { 'data-audit': 'inference' },
        React.createElement(FactCard, {
          variant: 'inference',
          label: 'Analytical inference',
          text: 'Forwarders sit outside the direct surrender chain; exposure arrives as carrier surcharge pass-through on any EEA-touching lane.',
        })),
      React.createElement('div', { 'data-audit': 'counsel' },
        React.createElement(FactCard, {
          variant: 'counsel',
          text: 'Whether a workspace entity operating its own vessel is a "shipping company" under the amended Directive.',
        })),
    ),
  );
};
`;

// ── ListRow at 1440 ─────────────────────────────────────────────────────────────────────────────
// Mounted inside a 778px box — the content column the frame produces at 1440 (README §0.3: "At 1440
// that is a 778px content column and a 300px rail"), so the 1fr title track resolves to the width it
// actually has in the product rather than to the full viewport.
const LISTROW_ENTRY = `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ListRow, ListRowColumnHeader } from '@/components/ui/ListRow';
import { BAND_ORDER } from '@/lib/urgency/bands';

const action = BAND_ORDER.find((b) => b.key === 'action');

let root = null;
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(
    React.createElement('div', { style: { width: 778, background: 'var(--card)' } },
      React.createElement(ListRowColumnHeader, { dueLabel: 'Next date' }),
      React.createElement('div', { 'data-audit': 'row' },
        React.createElement(ListRow, {
          href: '/regulations/eu-ets-maritime',
          band: action,
          jurisdiction: 'EU',
          title: 'EU Emissions Trading System (ETS) extension to maritime transport',
          meta: 'Regulation \\u00b7 Ocean \\u00b7 emissions',
          impact: { cost: 1, compliance: 1, client: 2, operational: 3 },
          due: { label: 'Sep 30 2026', days: '24 days' },
          timeline: [
            { date: '2023-01-01', label: 'Adopted', status: 'past' },
            { date: '2024-01-01', label: 'In force', status: 'past' },
            { date: '2026-09-30', label: 'Surrender', status: 'current' },
            { date: '2027-01-01', label: 'Phase 2', status: 'future' },
          ],
          tier: 1,
          overflow: React.createElement('button', { type: 'button', 'aria-label': 'Row actions', style: { width: 28, height: 28 } }, '\\u22ef'),
        })),
      React.createElement('div', { 'data-audit': 'row-endstat' },
        React.createElement(ListRow, {
          href: '/regulations?jurisdiction=EU',
          band: BAND_ORDER.find((b) => b.key === 'immediate'),
          jurisdiction: 'EU',
          title: 'EU',
          meta: 'Emissions \\u00b7 Reporting \\u00b7 Packaging',
          endStat: { label: 'Immediate', value: 392, band: BAND_ORDER.find((b) => b.key === 'immediate') },
        })),
    ),
  );
};
`;

// ── ImpactMeter ─────────────────────────────────────────────────────────────────────────────────
// Row + full variants, each scored and unscored, wrapped in `[data-audit]` boxes.
const IMPACTMETER_ENTRY = `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ImpactMeter } from '@/components/ui/ImpactMeter';

let root = null;
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(
    React.createElement('div', { style: { width: 420, padding: 20, background: 'var(--page)', display: 'flex', flexDirection: 'column', gap: 24 } },
      React.createElement('div', { 'data-audit': 'row-scored' },
        React.createElement(ImpactMeter, { variant: 'row', scores: { cost: 1, compliance: 1, client: 2, operational: 3 } })),
      React.createElement('div', { 'data-audit': 'row-unscored' },
        React.createElement(ImpactMeter, { variant: 'row', scores: null })),
      React.createElement('div', { 'data-audit': 'full-scored', style: { width: 380 } },
        React.createElement(ImpactMeter, { variant: 'full', scores: { cost: 1, compliance: 3, client: 1, operational: 2 } })),
      React.createElement('div', { 'data-audit': 'full-unscored', style: { width: 380 } },
        React.createElement(ImpactMeter, { variant: 'full', scores: null })),
    ),
  );
};
`;

// ── MilestoneTimeline (row variant) ────────────────────────────────────────────────────────────
// Five entries reproducing the #sys row example's dot pattern (2 passed, 1 next, 2 ahead) plus the
// empty (no entries) state, wrapped in `[data-audit]` boxes.
const MILESTONETIMELINE_ENTRY = `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MilestoneTimeline } from '@/components/ui/MilestoneTimeline';
import { BAND_ORDER } from '@/lib/urgency/bands';

const action = BAND_ORDER.find((b) => b.key === 'action');
const entries = [
  { date: '2022-01-01', label: 'A', status: 'past' },
  { date: '2023-06-01', label: 'B', status: 'past' },
  { date: '2026-09-30', label: 'C', status: 'current' },
  { date: '2027-01-01', label: 'D', status: 'future' },
  { date: '2027-06-01', label: 'E', status: 'future' },
];

let root = null;
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(
    React.createElement('div', { style: { width: 200, padding: 20, background: 'var(--page)', display: 'flex', flexDirection: 'column', gap: 24 } },
      React.createElement('div', { 'data-audit': 'row-populated' },
        React.createElement(MilestoneTimeline, { variant: 'row', bandHex: action.hex, entries })),
      React.createElement('div', { 'data-audit': 'row-empty' },
        React.createElement(MilestoneTimeline, { variant: 'row', bandHex: '#F97316', entries: [] })),
    ),
  );
};
`;

// ── FilterChipGroup / FilterChip ───────────────────────────────────────────────────────────────
const FILTERCHIP_ENTRY = `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { FilterChipGroup, FilterChip } from '@/components/ui/Chips';

let root = null;
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(
    React.createElement('div', { style: { width: 420, padding: 20, background: 'var(--page)' } },
      React.createElement('div', { 'data-audit': 'group' },
        React.createElement(FilterChipGroup, { label: 'Mode' },
          React.createElement(FilterChip, { active: false }, 'Air'),
          React.createElement(FilterChip, { active: true }, 'Ocean'),
        )),
    ),
  );
};
`;

// ── ListSurfaceShell rail facets + Legend + DismissedStash foot ───────────────────────────────
// Assembled from the real shared parts (ListSurfaceShell, ListSurfaceRailCards, DismissedStash),
// minimal fixture data — guard code, not a page mount.
const LISTSURFACE_ENTRY = `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ListSurfaceShell } from '@/components/list-surface/ListSurfaceShell';
import { LegendRailCard } from '@/components/list-surface/ListSurfaceRailCards';
import { DismissedStash } from '@/components/regulations/DismissedStash';
import { BAND_ORDER } from '@/lib/urgency/bands';

const facetGroups = [
  { key: 'mode', label: 'Mode', options: [
      { value: 'air', label: 'Air', count: 212 },
      { value: 'ocean', label: 'Ocean', count: 388 },
    ], selected: 'ocean', onSelect: () => {} },
];

const dismissed = [
  { id: 'd1', jurisdiction: 'EU', title: 'Dismissed regulation title one' },
  { id: 'd2', jurisdiction: 'GB', title: 'Dismissed regulation title two' },
];

let root = null;
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(
    React.createElement('div', { style: { width: 1180 } },
      React.createElement(ListSurfaceShell, {
        title: "Regulations",
        dateLabel: 'Vol IV · No. 36 · Sunday 6 September 2026',
        itemCount: 1316,
        scope: 'regulations',
        bandCounts: { immediate: 14, action: 31, monitor: 1135, awareness: 254 },
        selectedBand: null,
        onSelectBand: () => {},
        facetGroups,
        rowsByBand: BAND_ORDER.map((band) => ({ band, rows: [], total: 0 })),
        perBandCap: 5,
        belowRows: React.createElement('div', { 'data-audit': 'dismissed-stash' },
          React.createElement(DismissedStash, { dismissed, onRestore: () => {} })),
        rail: React.createElement('div', { 'data-audit': 'legend-rail' },
          React.createElement(LegendRailCard, null)),
      }),
    ),
  );
};
`;

// ── WatchButton (row variant) — watched / unwatched (operator ruling 3.5) ──────────────────────
// initialWatched bypasses the client-side fetch entirely (useWatchMembership's own
// hasServerState = initialWatched !== undefined short-circuit), so this mounts the REAL component
// in a deterministic state with no network stub needed — not a fork of its logic.
const WATCHBUTTON_ENTRY = `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { WatchButton } from '@/components/ui/WatchButton';

let root = null;
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(
    React.createElement('div', { style: { display: 'flex', gap: 20, padding: 20 } },
      React.createElement('div', { 'data-audit': 'watched' },
        React.createElement(WatchButton, { itemType: 'regulation', itemId: 'r1', variant: 'row', initialWatched: true })),
      React.createElement('div', { 'data-audit': 'unwatched' },
        React.createElement(WatchButton, { itemType: 'regulation', itemId: 'r2', variant: 'row', initialWatched: false })),
    ),
  );
};
`;

// ── Market + Research list rows — signal-kind / theme tag (real components) ───────────────────
// README §0.4: "Market and Research rows add a signal-kind tag after the type — a tag, never a
// band." Fixtures reproduce the shapes ../smoke/market-rows-smoke.mjs and research-rows-smoke.mjs
// already use (one real row each, EMPTY_AGGREGATES), so the audit exercises the SAME data path
// those smoke specs proved renders without crashing, not an audit-invented shape.
const MARKETRESEARCH_ROWS_ENTRY = `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MarketIntelLedger } from '@/components/market/MarketIntelLedger';
import { ResearchLedger } from '@/components/research/ResearchLedger';

const EMPTY_AGGREGATES = {
  totalItems: 0,
  byPriority: { CRITICAL: 0, HIGH: 0, MODERATE: 0, LOW: 0 },
  byStatus: {},
  byJurisdiction: {},
  totalJurisdictions: 0,
  lastUpdatedAt: null,
};

const signal = {
  id: 'sig-0',
  cat: 'ocean',
  sub: 'freight',
  title: 'SAF cost outlook',
  url: 'https://example.com',
  note: 'Short signal note.',
  type: 'market_signal',
  priority: 'HIGH',
  added: '2026-08-01',
  reasoning: '',
  tags: [],
  whatIsIt: 'What this signal is about.',
  whyMatters: '',
  severity: 'cost_alert',
  signalBand: 'price',
  jurisdictionIso: ['EU'],
  sourceTier: 3,
  citationCount: 2,
  biasTags: [],
  priceStat: { valueDisplay: '$42.10/t', label: 'spot price' },
  whatItChanges: '',
  conversionTrigger: '',
};

const finding = {
  id: 'find-0',
  theme: 'emissions_accounting',
  title: 'Methodology shift in Scope 3 reporting',
  note: 'Short finding note.',
  type: 'research_finding',
  priority: 'HIGH',
  added: '2026-08-01',
  jurisdiction: 'EU',
  jurisdictionIso: ['EU'],
  sourceTier: 2,
  citationCount: 2,
  biasTags: [],
  itemGrade: 'record',
  reasoning: '',
  tags: ['scope 3'],
  whatIsIt: 'What this finding is about.',
  whyMatters: '',
  timeline: [{ date: '2027-06-01', label: 'Next review', status: 'future' }],
};

let root = null;
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(
    React.createElement('div', { style: { width: 1180 } },
      React.createElement('div', { 'data-audit': 'market-row' },
        React.createElement(MarketIntelLedger, { initialResources: [signal], aggregates: EMPTY_AGGREGATES, seriesBoard: undefined })),
      React.createElement('div', { 'data-audit': 'research-row' },
        React.createElement(ResearchLedger, { resources: [finding], aggregates: EMPTY_AGGREGATES, sourceCoverage: [] })),
    ),
  );
};
`;

// ── Operations region x dimension matrix (real component, real prop shape) ────────────────────
// Reproduces the EXACT dimensions list OperationsLedger.tsx passes in production. Fix lane
// fix58-detail (2026-09-07, operator ruling 3.3): OperationsLedger.tsx's `MATRIX_DIMENSIONS`
// (fed to RegionDimensionMatrix's `dimensions` prop, ~line 356) is now `= DIMENSIONS` unfiltered
// -- the prior `SOURCED_DIMENSIONS` derivation this mount reproduced (dropping "regulatory") was
// removed from the product when ruling 3.3 landed. This mount was left pointed at that retired
// 5-item shape, which made the audit measure a prop the product no longer passes; corrected to
// mirror the real `MATRIX_DIMENSIONS = DIMENSIONS` (all six, in order).
const OPSMATRIX_ENTRY = `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { RegionDimensionMatrix } from '@/components/operations/RegionDimensionMatrix';

const regions = [
  { key: 'EU', label: 'European Union' },
  { key: 'US', label: 'United States' },
];

// Verbatim copy of OperationsLedger.tsx's own DIMENSIONS constant (all 6) -- the audit reproduces
// the production data shape exactly rather than asserting an invented one.
const DIMENSIONS = [
  { num: 1, key: 'regulatory', db: 'regulatory_feasibility', name: 'Regulatory feasibility' },
  { num: 2, key: 'resources', db: 'regional_resources', name: 'Regional resource availability' },
  { num: 3, key: 'labor', db: 'labor_markets', name: 'Labor markets' },
  { num: 4, key: 'materials', db: 'materials_sourcing', name: 'Materials sourcing' },
  { num: 5, key: 'infrastructure', db: 'infrastructure', name: 'Infrastructure capacity' },
  { num: 6, key: 'cost', db: 'operational_cost', name: 'Operational cost data' },
];

let root = null;
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(
    React.createElement('div', { style: { width: 900 }, 'data-audit': 'ops-matrix' },
      React.createElement(RegionDimensionMatrix, {
        regions,
        dimensions: DIMENSIONS.map((d) => ({ key: d.key, db: d.db, name: d.name })),
        facts: [],
        coverageRows: [],
      }),
    ),
  );
};
`;

// ── Community peer-org directory table ─────────────────────────────────────────────────────────
// Not one of the 17 UI-system artboards (the component's own header comment: "spec 05 §5 component
// 3" — a different spec doc; confirmed absent from both README.md and every dc.html page artboard,
// including p12/Community, by grep). Mounted so the audit can at least check it against the GENERAL
// sitewide rules (no literal UNSCORED, hit targets), never an invented per-pixel design value.
const PEERORGTABLE_ENTRY = `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { PeerOrgDirectoryTable } from '@/components/community/PeerOrgDirectoryTable';

const byOrgTypeAndRegion = [
  { orgType: 'Forwarder', region: 'EU', members: 12, verified: 4 },
  { orgType: 'Carrier', region: 'US', members: 7, verified: 2 },
];
const bySector = [
  { sector: 'Ocean freight', members: 9 },
  { sector: 'Air freight', members: 5 },
];

let root = null;
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(
    React.createElement('div', { style: { width: 700, padding: 20, background: 'var(--page)' }, 'data-audit': 'peer-org-table' },
      React.createElement(PeerOrgDirectoryTable, { byOrgTypeAndRegion, bySector, totalMembers: 19 }),
    ),
  );
};
`;

// ── ListSurfaceShell — PERF-12 virtualized remainder, real row anatomy ─────────────────────────
// One band with 35 rows (> VirtualizedRowList's VIRTUALIZE_THRESHOLD of 30), expanded, so
// ListSurfaceShell mounts the real VirtualizedRowList path (DEVIATION-LOG 2026-09-07, "PERF-12
// remainder virtualization restored": "Row anatomy is unchanged either way — renderRow still
// returns one <ListRow/>"). VirtualizedRowList renders every row PLAINLY (no windowing) until its
// useNearestScrollParent effect resolves an ancestor — in this no-scroll-container mount that
// effect never finds one, so the FIRST paint (measured here, no waitForTimeout needed) is exactly
// the windowing mechanism's own documented pre-resolution fallback, not an audit workaround.
const LISTSURFACE_VIRTUALIZED_ENTRY = `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ListSurfaceShell } from '@/components/list-surface/ListSurfaceShell';
import { BAND_ORDER } from '@/lib/urgency/bands';

const action = BAND_ORDER.find((b) => b.key === 'action');
const rows = Array.from({ length: 35 }, (_, i) => ({
  key: 'r' + i,
  href: '/regulations/item-' + i,
  band: action,
  jurisdiction: 'EU',
  title: 'Virtualized row title ' + i,
  meta: 'Regulation \\u00b7 Ocean \\u00b7 emissions',
  impact: { cost: 1, compliance: 1, client: 2, operational: 3 },
  due: { label: 'Sep 30 2026', days: '24 days' },
  timeline: [],
  tier: 1,
}));

let root = null;
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(
    React.createElement('div', { style: { width: 1180 }, 'data-audit': 'virtualized-band' },
      React.createElement(ListSurfaceShell, {
        title: "Regulations",
        dateLabel: 'Vol IV · No. 36 · Sunday 6 September 2026',
        itemCount: 35,
        scope: 'regulations',
        bandCounts: { immediate: 0, action: 35, monitor: 0, awareness: 0 },
        selectedBand: null,
        onSelectBand: () => {},
        facetGroups: [],
        rowsByBand: [{ band: action, rows, total: 35 }],
        perBandCap: 5,
        expandedBands: new Set(['action']),
        rail: null,
      }),
    ),
  );
};
`;

// ── Page frame at 1440 ──────────────────────────────────────────────────────────────────────────
// The real AppShell (nav card, content column, footer, the floating assistant) wrapping the two page
// surfaces whose own chrome the frame rulings govern: the dashboard (the worked example page, its
// section cards carry the 5.1 section treatment) and the regulation detail surface (whose header and
// action row carry three of the four forbid targets). Composing both under ONE AppShell is a
// deliberate audit fixture, not a claim that the product renders them together: it puts every frame
// and forbid target named by the operator's rulings in a single measured tree.
const PAGE_FRAME_FIXTURES = {
  dashboard: {
    resources: [
      {
        id: 'r0',
        title: 'Corporate Sustainability Reporting Directive',
        priority: 'CRITICAL',
        jurisdiction: 'EU',
        jurisdictionIso: ['EU'],
        sourceTier: 2,
        complianceDeadline: '2027-01-01',
        impactScores: { cost: 3, compliance: 2, client: 3, operational: 2 },
        timeline: [],
        domain: 1,
        type: 'regulation',
        modes: ['Ocean'],
        topic: 'reporting',
        note: '',
        tags: [],
      },
    ],
    recentChanges: [],
    auditDate: '2026-09-07',
    aggregates: {
      totalItems: 1434,
      byPriority: { CRITICAL: 14, HIGH: 31, MODERATE: 1135, LOW: 254 },
      byStatus: {},
      byJurisdiction: {},
      totalJurisdictions: 61,
      lastUpdatedAt: null,
    },
    surfaceCoverage: {
      intelligence: { regulations: 0, marketIntel: 0, research: 0, operations: 0, uncategorized: 0, totalIntelligence: 0 },
      community: { activeGroups: 0, activeThreads: 0 },
    },
  },
  regulation: {
    resource: {
      id: 'detail-1',
      cat: 'ocean',
      sub: 'ocean freight',
      title: 'EU Emissions Trading System (ETS) extension to maritime transport',
      url: 'https://example.com/source',
      note: 'Short regulation note for the card preview.',
      type: 'regulation',
      priority: 'CRITICAL',
      added: '2026-08-01',
      reasoning: 'Binding surrender obligations begin next fiscal year.',
      tags: ['ocean', 'compliance'],
      whatIsIt: 'Short summary of what this regulation is and why it applies to the workspace.',
      whyMatters: 'Binding disclosure obligations begin next fiscal year.',
      keyData: [],
      modes: ['ocean'],
      jurisdiction: 'EU',
      jurisdictionIso: ['EU'],
      sourceTier: 2,
      sourceName: 'EUR-Lex',
      sourceUrl: 'https://example.com/source',
      legalInstrument: 'Directive (EU) 2023/959',
      fullBrief: '## What it is\n\nA long-form regulatory brief paragraph describing the instrument.\n\n## Sources\n\n- EUR-Lex — primary source',
      recommendedActions: [],
      timeline: [
        { date: '2026-10-01', label: 'Consultation close', status: 'past' },
        { date: '2027-01-01', label: 'Entry into force', status: 'current' },
        { date: '2027-06-01', label: 'Compliance deadline', status: 'future' },
      ],
      agentIntegrityFlag: false,
      agentIntegrityPhrase: null,
      itemGrade: null,
      penaltyRange: null,
      costMechanism: null,
      enforcementBody: 'National maritime authority',
      complianceDeadline: '2027-06-01',
    },
    changelog: [],
    dispute: null,
    supersessions: [],
    connections: [],
    relevance: null,
    resourceLookup: {},
    sections: ['3', '4', '8'].map((section_key, i) => ({
      section_key,
      section_order: i,
      content_md: `A long-form paragraph of prose for section ${section_key}.`,
      is_conditional: false,
      source_ids: [],
    })),
    groupLabel: 'European Union · EUR-Lex',
    deck: 'EUR-Lex · adopted 16 October 2024 · in force',
    initialOwner: null,
    upcomingObligations: null,
  },
};

const PAGE_FRAME_ENTRY = `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { AppShell } from '@/components/AppShell';
import { DashboardBrief } from '@/components/dashboard/DashboardBrief';
import { RegulationDetailSurface } from '@/components/regulations/RegulationDetailSurface';

const F = ${JSON.stringify(PAGE_FRAME_FIXTURES)};

let root = null;
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(
    React.createElement(AppShell, null,
      React.createElement('div', { 'data-audit': 'dashboard' },
        React.createElement(DashboardBrief, { ...F.dashboard, watchlistPromise: Promise.resolve([]) })),
      React.createElement('div', { 'data-audit': 'regulation-detail' },
        React.createElement(RegulationDetailSurface, F.regulation)),
    ),
  );
};
`;

/**
 * Every request the mounted tree issues is answered here, never by the network — the same
 * no-network posture as ../smoke/harness.mjs. A catch-all empty JSON body is correct for this
 * harness: the audit measures rendered geometry and type, not data-dependent content.
 */
const EMPTY_API = [
  { urlGlob: '**/api/**', handler: (route) => route.fulfill({ contentType: 'application/json', body: '{}' }) },
];


// ── AuthFrame + AuthPanel tabs (lane uxaudit-d, 2026-09-07, README screen 16) ──────────────────────
// The real logged-out identity frame plus the Sign in / Create account tab strip both /login and
// /signup share. `next/link` and `@/lib/supabase-browser` use harness.mjs's DEFAULT_ALIAS; AuthFrame
// and AuthTabs take no data props (AuthFrame reads Date.now() itself, matching the artboard's own
// "never captured, designed from the system" note — no fixture invented here).
const AUTH_FRAME_ENTRY = `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { AuthFrame } from '@/components/auth/AuthFrame';
import { AuthTabs, AuthField, AUTH_INPUT_STYLE } from '@/components/auth/AuthPanel';

let root = null;
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(
    React.createElement('div', { 'data-audit': 'auth-frame' },
      React.createElement(AuthFrame, null,
        React.createElement('div', { style: { width: 380, display: 'flex', flexDirection: 'column', gap: 14 } },
          React.createElement(AuthTabs, { active: 'signin' }),
          React.createElement(AuthField, { label: 'Work email' },
            React.createElement('div', { 'data-audit': 'input', style: AUTH_INPUT_STYLE }, 'name@company.com')),
        ),
      ),
    ),
  );
};
`;

// ── AccountCard, two real page sections (lane uxaudit-d, 2026-09-07, README screens 14/15) ─────────
// The 5.1 section-card treatment as it actually renders on Account/Settings, via the same shared
// `AccountCard` wrapper both pages import from `@/components/account/AccountPrimitives` — not a
// reproduction, the real wrapper. Two real bodies inside it: NotificationPreferences (Settings'
// "Notifications" section, in the compact/full layout SettingsPage.tsx itself uses) and MembersPanel
// (Account's "Members & roles" section) — both fetch through `fetch()`/the supabase-browser stub, so
// each gets its own `apiRoutes` fixture below rather than sharing EMPTY_API's `{}` body, which would
// leave both stuck in their own loading state and nothing to measure.
const NOTIFICATIONS_ENTRY = `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { AccountCard } from '@/components/account/AccountPrimitives';
import { NotificationPreferences } from '@/components/profile/NotificationPreferences';

let root = null;
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(
    React.createElement('div', { style: { width: 620, padding: 20, background: 'var(--page)' } },
      React.createElement('div', { 'data-audit': 'card' },
        React.createElement(AccountCard, { title: 'Notifications', meta: 'In-app now \u00b7 email and push coming' },
          React.createElement(NotificationPreferences, { userId: 'u1' }),
        ),
      ),
    ),
  );
};
`;

const MEMBERS_FIXTURE = {
  members: [
    { id: 'm1', user_id: 'u1', role: 'owner', joined_at: '2026-04-04T00:00:00Z', display_name: 'Jason', avatar_url: null },
    { id: 'm2', user_id: 'u2', role: 'owner', joined_at: '2026-05-28T00:00:00Z', display_name: 'jasonlosh@gmail.com', avatar_url: null },
  ],
  caller_role: 'owner',
  caller_membership_id: 'm1',
};

const MEMBERS_ENTRY = `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MembersPanel } from '@/components/profile/MembersPanel';

let root = null;
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(
    React.createElement('div', { style: { width: 620, padding: 20, background: 'var(--page)' } },
      React.createElement('div', { 'data-audit': 'card' },
        React.createElement(MembersPanel, { orgId: 'org1', callerUserId: 'u1' }),
      ),
    ),
  );
};
`;

const MEMBERS_API = [
  { urlGlob: '**/api/orgs/*/members', handler: (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(MEMBERS_FIXTURE) }) },
  { urlGlob: '**/api/orgs/*/invitations', handler: (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ invitations: [] }) }) },
];

// ── SectionIndex on Settings (lane uxaudit-d, 2026-09-07) ──────────────────────────────────────────
// The real shared `SectionIndex` (`@/components/detail/DetailShell`), given the exact six-entry list
// `SettingsPage.tsx`'s own `SETTINGS_SECTIONS` constant defines — the settings-specific instance
// named in this lane's PARTS list, of a part that is otherwise generic (detail surfaces reuse it too,
// out of this lane's scope).
const SETTINGS_SECTION_INDEX_ENTRY = `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { SectionIndex } from '@/components/detail/DetailShell';

const SECTIONS = [
  { id: 'general', label: 'General' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'saved', label: 'Saved searches' },
  { id: 'data', label: 'Data \u0026 supersessions' },
  { id: 'archive', label: 'Archive' },
  { id: 'help', label: 'Help' },
];

let root = null;
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(
    React.createElement('div', { style: { width: 1060 }, 'data-audit': 'index' },
      React.createElement(SectionIndex, { sections: SECTIONS }),
    ),
  );
};
`;

// ── Detail shell (lane uxaudit-c, 2026-09-07) ──────────────────────────────────────────────────
// DetailHeader, ActionRow, DetailTagRow (+TagPopover, forced open so its geometry is measurable
// without a click), SectionIndex + SummaryDepthSwitch, DetailTimeline, DetailSection, and every
// rail card (InThisListStat, ImpactRailCard, AtAGlanceCard, RailLegend) — the ONE shared
// components/detail/DetailShell.tsx module every one of the four detail surfaces assembles from
// (that file's own header: "the ONE detail architecture... shared by all four detail surfaces").
// One mount instead of four, since the shell is the SAME code on every surface; each real detail
// surface's OWN section content and rail composition is audited separately where it differs
// (factblocks mount, below).
const DETAIL_SHELL_ENTRY = `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  DetailHeader,
  DetailTimeline,
  SectionIndex,
  SummaryDepthSwitch,
  DetailSection,
  ImpactRailCard,
  InThisListStat,
  AtAGlanceCard,
  RailLegend,
  DetailPageWrapper,
  DetailLayout,
} from '@/components/detail/DetailShell';
import { ActionRow, ActionButton } from '@/components/ui/ActionRow';
import { DetailTagRow } from '@/components/ui/DetailTagRow';
import { BAND_ORDER } from '@/lib/urgency/bands';

const band = BAND_ORDER.find((b) => b.key === 'action');

function Demo() {
  const [depth, setDepth] = React.useState('summary');
  return React.createElement(DetailPageWrapper, null,
    React.createElement('div', { 'data-audit': 'header' },
      React.createElement(DetailHeader, {
        band,
        tier: 1,
        title: 'EU Emissions Trading System (ETS) extension to maritime transport',
        meta: 'Regulations \\u00b7 European Union',
        tagRow: React.createElement('div', { 'data-audit': 'tagrow' },
          React.createElement(DetailTagRow, { itemId: 'demo-item', open: true, onOpenChange: () => {} })),
        actions: React.createElement('div', { 'data-audit': 'actionrow' },
          React.createElement(ActionRow, {
            onExport: () => {},
            onShare: () => {},
            onTag: () => {},
            watch: React.createElement(ActionButton, { key: 'watch', variant: 'secondary' }, '\\u2606 Watch'),
          })),
      })),
    React.createElement('div', { 'data-audit': 'timeline' },
      React.createElement(DetailTimeline, {
        band,
        entries: [
          { date: '2023-01-01', label: 'Adopted', status: 'past' },
          { date: '2026-09-30', label: 'Surrender', status: 'current' },
          { date: '2027-01-01', label: 'Phase 2', status: 'future' },
        ],
      })),
    React.createElement('div', { 'data-audit': 'sectionindex' },
      React.createElement(SectionIndex, {
        sections: [
          { id: 'summary', label: 'Summary' },
          { id: 'obligations', label: 'Obligations' },
        ],
        trailing: React.createElement('div', { 'data-audit': 'depthswitch' },
          React.createElement(SummaryDepthSwitch, { depth, onChange: setDepth })),
      })),
    React.createElement(DetailLayout, {
      rail: React.createElement(React.Fragment, null,
        React.createElement('div', { key: 'r1', 'data-audit': 'inthislist' },
          React.createElement(InThisListStat, { backHref: '/regulations', backLabel: 'Back to list', band })),
        React.createElement('div', { key: 'r2', 'data-audit': 'impactrail' },
          React.createElement(ImpactRailCard, { scores: { cost: 1, compliance: 2, client: 3, operational: 1 } })),
        React.createElement('div', { key: 'r3', 'data-audit': 'atglance' },
          React.createElement(AtAGlanceCard, { rows: [{ label: 'Band', value: 'Action' }, { label: 'Tier', value: 'T1' }] })),
        React.createElement('div', { key: 'r4', 'data-audit': 'raillegend' },
          React.createElement(RailLegend, null)),
      ),
    },
      React.createElement('div', { 'data-audit': 'section' },
        React.createElement(DetailSection, { id: 'summary', title: 'Summary' },
          React.createElement('p', null, 'Body text for the summary section.'))),
    ),
  );
}

let root = null;
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(React.createElement(Demo));
};
`;


// ── FactBlocks in context (lane uxaudit-c, 2026-09-07) ─────────────────────────────────────────
// FactBlocks.tsx is the ONE renderer all four detail surfaces route section content_md through
// (that file's own header) — mounting it directly, fed markdown carrying a FACT/ANALYSIS/LEGAL
// paragraph plus a GFM table, measures the SAME FactCard variants and the SAME concession-table
// rendering (09-operations-profile's port-dues table, per that file's own header: "a structured
// concession table... renders as a real table") that regulation/market/research/operations detail
// (03/05/07/09) all use, without mounting all four heavy detail surfaces separately.
const FACTBLOCKS_ENTRY = `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { FactBlocks } from '@/components/detail/FactBlocks';

const MARKDOWN = [
  'Shipping companies must monitor, report and surrender ETS allowances for each tonne of reported CO2 from ships of 5,000 GT and above calling at EEA ports. *Source: ETS Extension to Maritime, EMSA, accessed 2026. https://example.com/source.*',
  '*Analytical inference:* Forwarders sit outside the direct surrender chain; exposure arrives as carrier surcharge pass-through on any EEA-touching lane.',
  '*Legal Confirmation Required:* Whether a workspace entity operating its own vessel is a "shipping company" under the amended Directive.',
  '| Qualifying fuel / technology | Condition | Concession |\\n| --- | --- | --- |\\n| Zero-emission (hydrogen, full electrification) | \\u2014 | 100% |\\n| Zero-carbon (ammonia) | pilot fuel <= 25% | 50% |',
].join('\\n\\n');

let root = null;
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(
    React.createElement('div', { style: { width: 778, padding: 20, background: 'var(--page)' }, 'data-audit': 'factblocks' },
      React.createElement(FactBlocks, { markdown: MARKDOWN }),
    ),
  );
};
`;


// ── "HIGH RELEVANCE" chip (lane uxaudit-c, 2026-09-07) ─────────────────────────────────────────
// RelevanceBadge.tsx — operator ruling 3.4 (DO NOT TOUCH): "leave it live and unstyled as is...
// Claude Design is defining the relevance component and will send it with the overlays." No
// dc.html artboard carries this element (confirmed by grep across every extracted page section
// this session) so this spec asserts PRESENCE ONLY (a removal would violate 3.4) and records its
// current measured values as a baseline for whenever the real spec lands — never a pass/fail
// judgment on its current styling.
const RELEVANCEBADGE_ENTRY = `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { RelevanceBadge } from '@/components/shell/RelevanceBadge';

let root = null;
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(
    React.createElement('div', { style: { width: 300, padding: 20, background: 'var(--page)' }, 'data-audit': 'relevance' },
      React.createElement(RelevanceBadge, {
        relevance: { band: 'high', summary: 'Directly affects two active EEA ocean lanes.' },
      }),
    ),
  );
};
`;

// ── Masthead + CommandBar ───────────────────────────────────────────────────────────────────────
// The real Masthead (list-size title, dek, command bar) in the 778px content column.
const MASTHEAD_ENTRY = `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Masthead } from '@/components/ui/Masthead';

let root = null;
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(
    React.createElement('div', { style: { width: 778, padding: 20, background: 'var(--page)' } },
      React.createElement(Masthead, {
        title: "Jason's brief",
        dateLabel: 'Sunday 6 September 2026',
        volNumber: 36,
        commandBar: { itemCount: 1434, scope: 'dashboard' },
      }),
    ),
  );
};
`;

// ── BandTile, four bands ────────────────────────────────────────────────────────────────────────
const BANDTILE_ENTRY = `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BandTile } from '@/components/ui/BandTile';
import { BAND_ORDER } from '@/lib/urgency/bands';

let root = null;
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(
    React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, width: 778, padding: 20, background: 'var(--page)' } },
      BAND_ORDER.map((band, i) => React.createElement('div', { key: band.key, 'data-audit': band.key },
        React.createElement(BandTile, { band, count: 14 + i, selected: i === 0 }))),
    ),
  );
};
`;

// ── StatBlock, stack + row layouts ──────────────────────────────────────────────────────────────
const STATBLOCK_ENTRY = `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { StatBlock } from '@/components/ui/StatBlock';

let root = null;
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(
    React.createElement('div', { style: { width: 400, padding: 20, background: 'var(--page)', display: 'flex', flexDirection: 'column', gap: 20 } },
      React.createElement('div', { 'data-audit': 'stack' },
        React.createElement(StatBlock, { label: 'Sources', value: '212', note: 'Across the platform' })),
      React.createElement('div', { 'data-audit': 'row' },
        React.createElement(StatBlock, { layout: 'row', label: 'Jurisdictions', value: '61', note: 'Scoped to workspace' })),
    ),
  );
};
`;

// ── Skeleton, all three shapes ──────────────────────────────────────────────────────────────────
const SKELETON_ENTRY = `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { SkeletonListRow, SkeletonBandTile, SkeletonStatBlock } from '@/components/ui/Skeleton';

let root = null;
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(
    React.createElement('div', { style: { width: 778, padding: 20, background: 'var(--page)', display: 'flex', flexDirection: 'column', gap: 16 } },
      React.createElement('div', { 'data-audit': 'row' }, React.createElement(SkeletonListRow, null)),
      React.createElement('div', { 'data-audit': 'tile', style: { width: 180 } }, React.createElement(SkeletonBandTile, null)),
      React.createElement('div', { 'data-audit': 'stat' }, React.createElement(SkeletonStatBlock, null)),
    ),
  );
};
`;

// ── TabRow ──────────────────────────────────────────────────────────────────────────────────────
const TABROW_ENTRY = `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { TabRow } from '@/components/ui/TabRow';

let root = null;
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(
    React.createElement('div', { style: { width: 778, padding: 20, background: 'var(--page)' } },
      React.createElement(TabRow, {
        ariaLabel: 'Account',
        tabs: [
          { key: 'personal', label: 'Personal', href: '/profile' },
          { key: 'members', label: 'Members & roles · 2', href: '/profile?tab=members', active: true },
          { key: 'settings', label: 'Settings', href: '/settings' },
        ],
      }),
    ),
  );
};
`;

// ── Absence ─────────────────────────────────────────────────────────────────────────────────────
const ABSENCE_ENTRY = `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Absence } from '@/components/ui/Absence';

let root = null;
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(
    React.createElement('div', { style: { padding: 20, background: 'var(--page)' } },
      React.createElement('div', { 'data-audit': 'reason' },
        React.createElement(Absence, { reason: 'not in primary source' })),
    ),
  );
};
`;

// ── StateNote, band + neutral ───────────────────────────────────────────────────────────────────
const STATENOTE_ENTRY = `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { StateNote } from '@/components/ui/StateNote';
import { BAND_ORDER } from '@/lib/urgency/bands';

const action = BAND_ORDER.find((b) => b.key === 'action');

let root = null;
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(
    React.createElement('div', { style: { width: 778, padding: 20, background: 'var(--page)', display: 'flex', flexDirection: 'column', gap: 12 } },
      React.createElement('div', { 'data-audit': 'band' },
        React.createElement(StateNote, { band: action, action: { label: 'See history', href: '#' } }, 'Reclassified from Monitor on 2 Sep.')),
      React.createElement('div', { 'data-audit': 'neutral' },
        React.createElement(StateNote, { action: { label: 'See audit log', href: '#' } }, 'Applies workspace-wide.')),
    ),
  );
};
`;

// ── Chips, all four families ────────────────────────────────────────────────────────────────────
const CHIPS_ENTRY = `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BandChip, TierChip, TagChip, WorkspaceTagPill, FilterChipGroup, FilterChip } from '@/components/ui/Chips';
import { BAND_ORDER } from '@/lib/urgency/bands';

const action = BAND_ORDER.find((b) => b.key === 'action');

let root = null;
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(
    React.createElement('div', { style: { padding: 20, background: 'var(--page)', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' } },
      React.createElement('div', { 'data-audit': 'band' }, React.createElement(BandChip, { band: action })),
      React.createElement('div', { 'data-audit': 'tier' }, React.createElement(TierChip, { tier: 1 })),
      React.createElement('div', { 'data-audit': 'tag' }, React.createElement(TagChip, null, 'Ocean')),
      React.createElement('div', { 'data-audit': 'workspace-tag' }, React.createElement(WorkspaceTagPill, { name: 'Cost alert', onRemove: () => {} })),
      React.createElement('div', { 'data-audit': 'filter-group' },
        React.createElement(FilterChipGroup, { label: 'Mode' },
          React.createElement(FilterChip, { active: true }, 'Ocean'),
          React.createElement(FilterChip, { active: false }, 'Air'),
        )),
    ),
  );
};
`;

// ── BandGradientRule, deterministic even counts ─────────────────────────────────────────────────
const BANDGRADIENTRULE_ENTRY = `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BandGradientRule } from '@/components/ui/BandGradientRule';

let root = null;
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(
    React.createElement('div', { style: { width: 252, background: 'var(--page)' } },
      React.createElement('div', { 'data-audit': 'rule' },
        React.createElement(BandGradientRule, { counts: { immediate: 14, action: 31, monitor: 1135, awareness: 254 } })),
    ),
  );
};
`;

// ── RailCard / LegendRailCard — the list surfaces' panel card (ruling 5.1 applies to it too) ─────
const RAILCARD_ENTRY = `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { RailCard, LegendRailCard } from '@/components/list-surface/ListSurfaceRailCards';

let root = null;
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(
    React.createElement('div', { style: { width: 300, padding: 20, background: 'var(--page)', display: 'flex', flexDirection: 'column', gap: 16 } },
      React.createElement('div', { 'data-audit': 'legend' }, React.createElement(LegendRailCard, null)),
    ),
  );
};
`;

export const AUDIT_MOUNTS = {
  factcard: {
    id: 'factcard',
    description: 'FactCard, three variants (sourced / inference / counsel), in a 778px content column.',
    viewport: 1440,
    entry: FACTCARD_ENTRY,
  },
  'listrow-1440': {
    id: 'listrow-1440',
    description: 'ListRow + ListRowColumnHeader in the 778px content column the 1440 frame produces.',
    viewport: 1440,
    entry: LISTROW_ENTRY,
  },
  masthead: {
    id: 'masthead',
    description: 'Masthead (list size) + its real CommandBar, in the 778px content column.',
    viewport: 1440,
    entry: MASTHEAD_ENTRY,
  },
  bandtile: {
    id: 'bandtile',
    description: 'BandTile, all four bands, in a 4-column row.',
    viewport: 1440,
    entry: BANDTILE_ENTRY,
  },
  statblock: {
    id: 'statblock',
    description: 'StatBlock, stack and row layouts.',
    viewport: 1440,
    entry: STATBLOCK_ENTRY,
  },
  skeleton: {
    id: 'skeleton',
    description: 'SkeletonListRow, SkeletonBandTile, SkeletonStatBlock — final geometry, README §0.6.',
    viewport: 1440,
    entry: SKELETON_ENTRY,
  },
  tabrow: {
    id: 'tabrow',
    description: 'TabRow, account/settings tab row.',
    viewport: 1440,
    entry: TABROW_ENTRY,
  },
  absence: {
    id: 'absence',
    description: 'Absence, the one absence convention.',
    viewport: 1440,
    entry: ABSENCE_ENTRY,
  },
  statenote: {
    id: 'statenote',
    description: 'StateNote, band-coloured and neutral variants.',
    viewport: 1440,
    entry: STATENOTE_ENTRY,
  },
  chips: {
    id: 'chips',
    description: 'BandChip, TierChip, TagChip, WorkspaceTagPill, FilterChipGroup/FilterChip.',
    viewport: 1440,
    entry: CHIPS_ENTRY,
  },
  bandgradientrule: {
    id: 'bandgradientrule',
    description: 'BandGradientRule with deterministic even-split counts, in a 252px box (nav card width).',
    viewport: 1440,
    entry: BANDGRADIENTRULE_ENTRY,
  },
  railcard: {
    id: 'railcard',
    description: 'RailCard/LegendRailCard, the panel card shared by the four list surfaces’ rail.',
    viewport: 1440,
    entry: RAILCARD_ENTRY,
  },
  impactmeter: {
    id: 'impactmeter',
    description: 'ImpactMeter, row + full variants, scored + unscored.',
    viewport: 1440,
    entry: IMPACTMETER_ENTRY,
  },
  milestonetimeline: {
    id: 'milestonetimeline',
    description: 'MilestoneTimeline row variant, populated (2 passed/1 next/2 ahead) + empty.',
    viewport: 1440,
    entry: MILESTONETIMELINE_ENTRY,
  },
  filterchipgroup: {
    id: 'filterchipgroup',
    description: 'FilterChipGroup + FilterChip, one active + one inactive chip.',
    viewport: 1440,
    entry: FILTERCHIP_ENTRY,
  },
  'peer-org-table': {
    id: 'peer-org-table',
    description: 'PeerOrgDirectoryTable (community), not in the 17 artboards — general-rule checks only.',
    viewport: 1440,
    entry: PEERORGTABLE_ENTRY,
  },
  watchbutton: {
    id: 'watchbutton',
    description: 'WatchButton row variant, watched=true + watched=false (operator ruling 3.5).',
    viewport: 1440,
    entry: WATCHBUTTON_ENTRY,
  },
  'market-research-rows': {
    id: 'market-research-rows',
    description: 'MarketIntelLedger + ResearchLedger, one real row each (README §0.4 signal-kind/theme tag).',
    viewport: 1440,
    entry: MARKETRESEARCH_ROWS_ENTRY,
  },
  'ops-matrix': {
    id: 'ops-matrix',
    description: 'RegionDimensionMatrix, fed OperationsLedger.tsx\'s own MATRIX_DIMENSIONS (all 6 DIMENSIONS, ruling 3.3).',
    viewport: 1440,
    entry: OPSMATRIX_ENTRY,
  },
  'list-surface-virtualized': {
    id: 'list-surface-virtualized',
    description: 'ListSurfaceShell, one band at 35 rows / expanded (> VIRTUALIZE_THRESHOLD 30) — real VirtualizedRowList path.',
    viewport: 1440,
    entry: LISTSURFACE_VIRTUALIZED_ENTRY,
  },
  'list-surface-1440': {
    id: 'list-surface-1440',
    description: 'ListSurfaceShell (real assembly): facets card, Legend rail card, DismissedStash foot.',
    viewport: 1440,
    entry: LISTSURFACE_ENTRY,
  },
  'page-frame-1440': {
    id: 'page-frame-1440',
    description: 'The real AppShell frame wrapping DashboardBrief and RegulationDetailSurface.',
    viewport: 1440,
    entry: PAGE_FRAME_ENTRY,
    alias: {
      'next/navigation': `${SMOKE}stub-next-navigation.mjs`,
      '@/components/auth/AuthProvider': `${SMOKE}stub-auth-provider.mjs`,
    },
    apiRoutes: EMPTY_API,
  },
  'detail-shell': {
    id: 'detail-shell',
    description: 'DetailHeader/ActionRow/DetailTagRow+TagPopover/SectionIndex/SummaryDepthSwitch/DetailTimeline/DetailSection/rail cards, real components from DetailShell.tsx.',
    viewport: 1440,
    entry: DETAIL_SHELL_ENTRY,
    alias: {
      'next/navigation': `${SMOKE}stub-next-navigation.mjs`,
    },
    apiRoutes: EMPTY_API,
  },
  factblocks: {
    id: 'factblocks',
    description: 'FactBlocks (FactCard variants + GFM concession table) in context, the shared renderer all four detail surfaces use.',
    viewport: 1440,
    entry: FACTBLOCKS_ENTRY,
  },
  relevancebadge: {
    id: 'relevancebadge',
    description: 'RelevanceBadge ("HIGH RELEVANCE" chip) — presence-only per operator ruling 3.4 (DO NOT TOUCH).',
    viewport: 1440,
    entry: RELEVANCEBADGE_ENTRY,
  },
  'auth-frame': {
    id: 'auth-frame',
    description: 'AuthFrame identity panel + AuthTabs (Sign in / Create account), README screen 16.',
    viewport: 1440,
    entry: AUTH_FRAME_ENTRY,
  },
  'settings-notifications': {
    id: 'settings-notifications',
    description: 'AccountCard("Notifications") wrapping the real NotificationPreferences, README screen 15.',
    viewport: 1440,
    entry: NOTIFICATIONS_ENTRY,
  },
  'account-members': {
    id: 'account-members',
    description: 'The real MembersPanel (AccountCard("Members & roles") + table), README screen 14.',
    viewport: 1440,
    entry: MEMBERS_ENTRY,
    apiRoutes: MEMBERS_API,
  },
  'settings-section-index': {
    id: 'settings-section-index',
    description: "The real SectionIndex with Settings's own six-entry SETTINGS_SECTIONS list.",
    viewport: 1440,
    entry: SETTINGS_SECTION_INDEX_ENTRY,
  },
};
