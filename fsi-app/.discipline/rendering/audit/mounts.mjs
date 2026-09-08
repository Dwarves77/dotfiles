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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fullAppCss } from '../smoke/smoke-fixtures.mjs';
import { getRepoRoot } from '../../lib/context.mjs';

const SMOKE = fileURLToPath(new URL('../smoke/', import.meta.url));

/**
 * `styleFiles` on a mount: real stylesheets a mount needs at RUNTIME that the esbuild bundle
 * cannot carry. A bare `.css` import has no output path in this harness's `write:false` bundle, so
 * such imports are aliased away in `alias` (see compose-map's `leaflet/dist/leaflet.css`) and the
 * stylesheet is read off disk and injected with `page.addStyleTag` instead, the exact technique
 * ../smoke/map-smoke.mjs has used since lane uimapcomm. Repo-relative paths, read at call time.
 *
 * WHY IT MATTERS, measured (lane map60, 2026-09-08): with leaflet's stylesheet aliased to an empty
 * module and nothing injected in its place, Leaflet still BUILDS its panes and markers, the four
 * fixture markers were in the DOM with correct `translate3d` transforms, but nothing gives
 * `.leaflet-pane` / `.leaflet-marker-icon` their `position:absolute`, so every marker laid out in
 * normal flow ~2700px BELOW the 420px map card and the canvas photographed empty. It was the
 * FIXTURE, not the product.
 */
export function mountExtraCss(mount) {
  const files = mount && Array.isArray(mount.styleFiles) ? mount.styleFiles : [];
  return files.map((rel) => readFileSync(join(getRepoRoot(), rel), 'utf8')).join('\n');
}

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
          minHeight: 44,
          // Lane map60 (2026-09-08): the register row is ListRow's own \`variant="register"\`, p10's
          // six-column grid. The merged \`4 / span 4\` endStat cell this mount used to exercise no
          // longer exists (deleted with it, rule 13); map-register.json's targets move with it.
          variant: 'register',
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
  { num: 6, key: 'cost', db: 'operational_cost', name: 'Operational cost' },
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
      // D1 fixture (operator report 2026-09-07, page-frame boundsCheck below): a real, unscored
      // Due-next row — `impactScores` omitted, matching production where most items have no
      // impact score yet. Without this the audit's page-frame mount, like the pre-fix rendering-
      // guard smoke fixture, never mounted ImpactMeter's unscored branch (the 30px dashed baseline
      // + Absence "unscored" reason) at all, so it could not have caught the collision either.
      {
        id: 'r1',
        title: 'EUDR — EU Deforestation Regulation',
        priority: 'CRITICAL',
        jurisdiction: 'EU',
        jurisdictionIso: ['EU'],
        sourceTier: 1,
        complianceDeadline: '2026-12-30',
        timeline: [],
        domain: 1,
        type: 'regulation',
        modes: ['Ocean', 'Road'],
        topic: 'reporting',
        note: '',
        tags: [],
      },
    ],
    // Non-empty so the "What changed" card renders its ListRow rows (always `impact={null}` —
    // DashboardBrief.tsx — i.e. always the unscored branch) instead of the empty-state StateNote.
    recentChanges: [
      { id: 'c0', title: 'Delegated Regulation (EU) 2016/2071 — CO2 monitoring methods', priority: 'HIGH', added: '2026-09-06', itemType: 'regulation', domain: 1 },
    ],
    auditDate: '2026-09-07',
    aggregates: {
      totalItems: 1434,
      byPriority: { CRITICAL: 14, HIGH: 31, MODERATE: 1135, LOW: 254 },
      byStatus: {},
      byJurisdiction: {},
      totalJurisdictions: 61,
      lastUpdatedAt: null,
    },
    // COUNTS-61 (2026-09-08): the regulations surface's own counts, the figures /regulations puts
    // on its identical four tiles. Deliberately DIFFERENT from `aggregates` above, so this mount
    // renders the case the production defect turned on rather than one where the two agree.
    bandCounts: {
      totalItems: 1317,
      byPriority: { CRITICAL: 15, HIGH: 14, MODERATE: 1119, LOW: 169 },
      byStatus: {},
      byJurisdiction: {},
      totalJurisdictions: 32,
      lastUpdatedAt: null,
    },
    surfaceCoverage: {
      intelligence: { regulations: 0, marketIntel: 0, research: 0, operations: 0, uncategorized: 0, totalIntelligence: 0 },
      community: { regionalRooms: 7, joinedGroups: 0, activeThreads: 0 },
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
      // Artboard 03's EXPOSURE row "Who pays" and its "Emissions" topic chip. Lane details60
      // (2026-09-08): both are real Resource fields the regulation fixture simply left empty, so
      // the 03 capture rendered an EXPOSURE region of four Absence cells and a chip row with no
      // topic chip while 09's rendered in full. Populated from the artboard's own EU ETS example.
      costMechanism: 'Vessel operator is obligated; forwarders and shippers receive it as carrier ETS surcharge',
      topic: 'Emissions',
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
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { buildDueNextRows, buildChangedRows } from '@/lib/dashboard/brief-rows';

// 'owner' so Sidebar's nav-card footer renders BOTH rows (Account + the
// role-gated Admin row, R2) — sidebar.json's footer assertions need both
// present. Same role the admin-issues-rail/account-members entries already
// set, for the same reason.
useWorkspaceStore.getState().setUserRole('owner');

const F = ${JSON.stringify(PAGE_FRAME_FIXTURES)};
// One fixed instant for every date this fixture derives, so a row never changes band or its
// "N days" label between runs (the same reason brief-rows.ts takes an injected now).
const NOW_ISO = '2026-09-07T00:00:00.000Z';

let root = null;
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  // ONE SURFACE OR BOTH (lane layoutguard, 2026-09-08). This entry has always rendered the
  // dashboard AND the regulation detail stacked in one AppShell, which is right for a component
  // audit reading getComputedStyle per selector and wrong for a per-ROUTE layout guard: two page
  // bodies in one content column make every card-vs-column and card-order measurement meaningless.
  // \`window.__ONLY_AUDIT\` lets the two route mounts render one surface each from this SAME entry
  // and these SAME fixtures rather than forking a second copy of either. Unset (every existing
  // caller) renders both, exactly as before.
  const only = window.__ONLY_AUDIT || null;
  const want = (name) => !only || only === name;
  root.render(
    React.createElement(AppShell, null,
      want('dashboard') && React.createElement('div', { 'data-audit': 'dashboard' },
        React.createElement(DashboardBrief, {
          // FOLD-59: <DashboardBrief/> takes SERVER-SELECTED BriefRow[] since HYDRATION-59, not a
          // Resource[] it derives from itself. The fixture keeps its Resource rows and runs them
          // through the SAME derivation the route runs (src/lib/dashboard/brief-rows.ts) against
          // one fixed instant, so this mount measures the real shape rather than rows hand-shaped
          // to match it.
          dueNextRows: buildDueNextRows(F.dashboard.resources, new Date(NOW_ISO)),
          changedRows: buildChangedRows(F.dashboard.recentChanges, F.dashboard.resources, new Date(NOW_ISO)),
          totalChanges: F.dashboard.recentChanges.length,
          aggregates: F.dashboard.aggregates,
          // COUNTS-61: the band tiles read the regulations surface's own counts, because that is
          // where every tile navigates. The fixture supplies the real /regulations figures
          // (15/14/1119/169, get_surface_counts of regulations on 2026-09-08), which is exactly the
          // divergence from the workspace aggregates (14/31/1135/254) the defect consisted of.
          bandCounts: F.dashboard.bandCounts,
          auditDate: F.dashboard.auditDate,
          surfaceCoverage: F.dashboard.surfaceCoverage,
          nowIso: NOW_ISO,
          watchlistPromise: Promise.resolve([]),
        })),
      want('regulation-detail') && React.createElement('div', { 'data-audit': 'regulation-detail' },
        React.createElement(RegulationDetailSurface, F.regulation)),
    ),
  );
};
`;

// ── Per-ROUTE page mounts for the site-wide layout guard (lane layoutguard, 2026-09-08) ──────────
// Same entry, same fixtures, one surface each - see the `window.__ONLY_AUDIT` comment inside
// PAGE_FRAME_ENTRY for why a per-route guard cannot measure the stacked pair. The prelude sits
// before the entry's imports, which ESM allows and esbuild preserves.
const DASHBOARD_ROUTE_ENTRY = `window.__ONLY_AUDIT = 'dashboard';\n${PAGE_FRAME_ENTRY}`;
const REGULATION_DETAIL_ROUTE_ENTRY = `window.__ONLY_AUDIT = 'regulation-detail';\n${PAGE_FRAME_ENTRY}`;

// ── Market / research / operations detail — page-composition mounts ──────────────────────────────
// Lane compose-dashboard-details (2026-09-08). Mirrors the regulation-detail fixture above,
// populated from the same artboard examples this lane's compose specs check against
// (05-market-detail.png / 07-research-detail.png / 09-operations-profile.png) rather than invented
// generic data — the compose specs assert against real artboard strings, so the fixture carries them.

const MARKET_FIXTURE = {
  resource: {
    id: 'm-detail-1',
    cat: 'ocean',
    sub: 'packaging',
    title: 'Packaging material input costs',
    url: 'https://example.com/market-source',
    note: '',
    type: 'market_signal',
    priority: 'HIGH',
    added: '2026-04-11',
    reasoning: '',
    tags: [],
    whatIsIt: 'BLS WPU066 for plastic resins and materials rose sharply in four months.',
    keyData: [],
    modes: ['ocean'],
    jurisdiction: null,
    jurisdictionIso: [],
    sourceTier: 1,
    sourceName: 'U.S. Bureau of Labor Statistics / FRED',
    sourceUrl: 'https://example.com/market-source',
    topic: 'Packaging',
    signalBand: 'B2',
    severity: 'cost',
    timeline: [
      { date: '2026-01-26', label: 'January reading', status: 'past' },
      { date: '2026-04-11', label: 'April reading published', status: 'current' },
      { date: '2026-06-11', label: 'BLS PPI release', status: 'future' },
    ],
    impactScores: { cost: 3, compliance: 1, client: 2, operational: 2 },
  },
  relatedPool: [],
  sections: [],
  convergence: { independent_citers: 4, confirmation_count: 4 },
  priceBoard: [],
  carbonFactors: [],
  groupLabel: 'Global',
  deck: 'U.S. Bureau of Labor Statistics / FRED · published Apr 11 2026',
  initialNote: '',
  supersessions: [],
  connections: [],
  relevance: null,
  resourceLookup: {},
};

const RESEARCH_FIXTURE = {
  resource: {
    id: 'r-detail-1',
    cat: 'ocean',
    sub: 'emissions',
    title: 'Mission Innovation Shipping Mission: Net-Zero Industries Award 2024 and MI-9 Global Collaboration Framework',
    url: 'https://example.com/research-source',
    note: '',
    type: 'research_finding',
    priority: 'LOW',
    added: '2026-05-10',
    reasoning: '',
    tags: [],
    whatIsIt: 'Coalition goals for zero-emission shipping by 2030.',
    keyData: [],
    modes: [],
    jurisdiction: null,
    jurisdictionIso: [],
    sourceTier: 3,
    sourceName: 'Mission Innovation',
    sourceUrl: 'https://example.com/research-source',
    topic: 'Emissions accounting',
    // Artboard 07's third header chip and its At a glance "Theme" row both read "Emissions
    // accounting. `theme` is the intelligence_items THEME COLUMN value, which assignTheme maps to
    // the canonical key through THEME_COLUMN_TO_KEY (src/lib/research/taxonomy.mjs); without it the
    // classifier fell through to keyword matching, returned null, and both chip and row were absent.
    theme: 'emissions_accounting',
    timeline: [
      { date: '2024-04-24', label: 'Mission announced', status: 'past' },
      { date: '2026-Q4', label: 'IMO MEPC extraordinary session', status: 'current' },
      { date: '2028', label: 'GFI targets', status: 'future' },
    ],
    impactScores: { cost: 1, compliance: 1, client: 2, operational: 1 },
  },
  related: [],
  relatedReason: 'none',
  sections: [],
  // Artboard 07's CLUSTER SYNTHESIS rail card, in the artboard's own values ("Maritime
  // decarbonisation: ... green-corridor economy", "85 items · density 0.180 · stale · membership
  // changed"). Shaped as selectThemeBriefForItem returns it (src/lib/research/theme-brief.mjs), so
  // this mount measures the real view-model, not a hand-shaped card. Lane details60, 2026-09-08.
  themeBrief: {
    themeId: 'theme-maritime-decarb',
    title: 'Maritime decarbonisation: the IMO net-zero arc, EU MRV and ETS-for-shipping machinery, and the green-corridor economy',
    briefMd: '',
    generatedAt: '2026-05-01T00:00:00.000Z',
    memberCount: 85,
    density: 0.18,
    stale: true,
  },
  groupLabel: 'Global',
  deck: 'Mission Innovation · published May 10 2026 · theme: Emissions accounting',
  connections: [],
  supersessions: [],
  relevance: null,
  resourceLookup: {},
};

const OPERATIONS_FIXTURE = {
  resource: {
    id: 'o-detail-1',
    cat: 'ocean',
    sub: 'ports',
    title: 'Singapore regional operations profile',
    url: 'https://example.com/operations-source',
    note: '',
    type: 'operations_profile',
    priority: 'LOW',
    added: '2026-04-11',
    reasoning: '',
    tags: [],
    whatIsIt: 'Singapore port dues concession for zero- and low-carbon fuels.',
    keyData: [],
    modes: ['ocean', 'air'],
    jurisdiction: 'SG',
    jurisdictionIso: ['SG'],
    sourceTier: 2,
    sourceName: 'Singapore Ministry of Transport (MOT)',
    sourceUrl: 'https://example.com/operations-source',
    topic: 'Corridors',
    timeline: [
      { date: '2025-01-01', label: 'MSGI window opens', status: 'past' },
      { date: '2027-03-31', label: 'EEG base-tier window closes', status: 'current' },
      { date: '2027-12-31', label: 'MSGI window closes', status: 'future' },
    ],
    impactScores: { cost: 1, compliance: 1, client: 1, operational: 2 },
  },
  // Artboard 09's RELATED IN ASIA rail card, in the artboard's own three rows. Lane details60,
  // 2026-09-08 — the card is product code (RelatedRegionCard) and always was; the fixture carried
  // no related rows, so it returned null and the capture showed no card at all.
  related: [
    { id: 'o-detail-au', title: 'Australia Regional Operations Profile', summary: null, sourceName: null, addedDate: null },
    { id: 'o-detail-jp', title: 'Japan Regional Operations Profile', summary: null, sourceName: null, addedDate: null },
    { id: 'o-detail-in', title: 'India Regional Operations Profile', summary: null, sourceName: null, addedDate: null },
  ],
  relatedReason: 'jurisdiction',
  sections: [],
  groupLabel: 'Asia',
  deck: 'Singapore Ministry of Transport (MOT) · Maritime and Port Authority · published Apr 11 2026 · Ocean · Air',
  connections: [],
  supersessions: [],
  relevance: null,
  resourceLookup: {},
};

const MARKET_DETAIL_ENTRY = `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { AppShell } from '@/components/AppShell';
import { MarketSignalDetailSurface } from '@/components/pages/MarketSignalDetailSurface';

const F = ${JSON.stringify(MARKET_FIXTURE)};

let root = null;
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(
    React.createElement(AppShell, null,
      React.createElement('div', { 'data-audit': 'market-detail' },
        React.createElement(MarketSignalDetailSurface, F)),
    ),
  );
};
`;

const RESEARCH_DETAIL_ENTRY = `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { AppShell } from '@/components/AppShell';
import { ResearchFindingDetailSurface } from '@/components/research/ResearchFindingDetailSurface';

const F = ${JSON.stringify(RESEARCH_FIXTURE)};

let root = null;
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(
    React.createElement(AppShell, null,
      React.createElement('div', { 'data-audit': 'research-detail' },
        React.createElement(ResearchFindingDetailSurface, F)),
    ),
  );
};
`;

const OPERATIONS_DETAIL_ENTRY = `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { AppShell } from '@/components/AppShell';
import { OperationsDetailSurface } from '@/components/operations/OperationsDetailSurface';

const F = ${JSON.stringify(OPERATIONS_FIXTURE)};

let root = null;
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(
    React.createElement(AppShell, null,
      React.createElement('div', { 'data-audit': 'operations-detail' },
        React.createElement(OperationsDetailSurface, F)),
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

// RegulationsLedger/MarketIntelLedger both call /api/listings/rest for archived/infinite-scroll
// reads, and (via useWorkspaceBootstrap's stubbed-authenticated client, DEFAULT_ALIAS's
// stub-supabase-browser.mjs) /api/workspace/bootstrap on mount — usePersonalStateHydration.ts
// calls `data.personalState.map(...)` unconditionally once `data` is non-null, matching every
// other WorkspaceBootstrapData field's real API contract (always present, never optional except
// where the type itself says so). A bare '{}' body (EMPTY_API's catch-all) crashes on that '.map'
// over 'undefined'. Both routes get their real empty-but-shaped response before the generic '{}'
// catch-all for anything else under /api/**.
// Playwright registers overlapping page.route() handlers LIFO — the LAST one registered is tried
// FIRST — so the generic '**/api/**' catch-all must be registered BEFORE the two specific routes
// below, or it would shadow them and this array's whole point (a shaped, non-crashing response for
// the two endpoints these ledgers actually depend on) would silently do nothing.
const COMPOSE_LEDGER_API = [
  ...EMPTY_API,
  { urlGlob: '**/api/listings/rest**', handler: (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ resources: [], archived: [] }) }) },
  { urlGlob: '**/api/workspace/bootstrap**', handler: (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ personalState: [], listOrders: {}, members: null, adminAttention: null, overrides: [] }) }) },
];

// GET /api/obligations/upcoming, the read behind the Regulations rail card "Obligations · next 30
// days" (artboard 02/id="p2"). Dates are generated RELATIVE TO THE RUN (+3/+12/+22/+29 days) because
// the card's own 30-day window is computed against `new Date()` — a hard-coded fixture date would
// silently fall out of the window and turn this spec into an assertion about the Absence state
// instead of about the four rows the artboard draws. The last entry (+90 days) is deliberately
// OUTSIDE the window: it proves the window is applied here, in the real composition, and not only in
// obligation-rail-select.npmtest.mjs.
const composeObligationDate = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const composeObligationEvent = (days, title, obligation) => ({
  id: `oblig-${days}`,
  event_date: composeObligationDate(days),
  date_precision: 'day',
  event_kind: 'compliance_deadline',
  obligation_text: obligation,
  item: { id: `item-${days}`, title, legacy_id: null, jurisdiction_iso: ['eu'] },
});
const COMPOSE_REGULATIONS_API = [
  ...COMPOSE_LEDGER_API,
  {
    urlGlob: '**/api/obligations/upcoming**',
    handler: (route) => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        hasJurisdictionFilter: false,
        events: [
          composeObligationEvent(3, 'Fixture regulation A', 'Member State reporting'),
          composeObligationEvent(12, 'Fixture regulation B', '70% surrender of prior-year emissions'),
          composeObligationEvent(22, 'Fixture regulation C', 'annual compliance certification'),
          composeObligationEvent(29, 'Fixture regulation D', 'due-diligence policy in place'),
          composeObligationEvent(90, 'Fixture regulation E', 'outside the 30-day window'),
        ],
      }),
    }),
  },
];
// ── Page composition mounts (lane compose-other, 2026-09-08) ───────────────────────────────────────
// Full-page mounts (AppShell + Masthead + the page's real body component) for the seven pages this
// lane owns (README screens 10/12/13/14/15/16/17). Same technique as PAGE_FRAME_ENTRY above: bundle
// the REAL page-level components with populated fixture props, never a reproduction. Each mount's
// `[data-audit="<page>"]` wrapper is what its compose-*.json spec selects into.

const MAP_FIXTURE_RESOURCES = Array.from({ length: 6 }, (_, i) => ({
  id: `map-r${i}`,
  title: `Fixture regulation ${i}`,
  priority: i < 2 ? 'CRITICAL' : i < 4 ? 'HIGH' : 'MODERATE',
  jurisdiction: ['eu', 'eu', 'us', 'us', 'global', 'uk'][i],
  jurisdictionIso: [['EU'], ['EU'], ['US'], ['US'], [], ['GB']][i],
  sourceTier: 2,
  complianceDeadline: '2027-01-01',
  impactScores: { cost: 2, compliance: 2, client: 1, operational: 2 },
  timeline: [],
  domain: 1,
  type: 'regulation',
  modes: ['Ocean'],
  topic: ['emissions', 'reporting', 'packaging', 'transport', 'reporting', 'transport'][i],
  note: '',
  tags: [],
}));

const MAP_COVERAGE_GAPS = [
  { region: { id: 'us-sub', name: 'US sub-national' }, gap: 54, partial: 0, covered: 0, total: 54 },
  { region: { id: 'canada', name: 'Canada' }, gap: 13, partial: 0, covered: 0, total: 13 },
  { region: { id: 'australia', name: 'Australia' }, gap: 9, partial: 0, covered: 0, total: 9 },
];

// No STYLE_INJECT here (unlike every other ENTRY in this file): these page-composition mounts
// render Tailwind-utility-styled components (Sidebar/TopBar), which STYLE_INJECT's raw globals.css
// read cannot style (see fullAppCssCompiled's header in smoke-fixtures.mjs) — capture-compose-
// page.mjs injects the compiled CSS itself via page.addStyleTag before mounting.
// The map (10), community (12) and account (14) compose mounts of lane compose-other are NOT
// carried on this branch: this lane cherry-picked only that lane's admin (13) and settings (15)
// commits, so their fixtures and smoke stubs are not here. They land with their own lane.

// ── Admin (13) full-page composition mount ───────────────────────────────────────────────────────
// Reuses the SAME real AdminDashboard mount ADMIN_STAT_TILES_ENTRY already proved out (it needs no
// STYLE_INJECT of its own here — the compiled-CSS path supplies it), wrapped in AppShell for the
// nav card + Masthead's frame position, exactly as compose-map/compose-community do.
// dc.html p13's own four provisional rows, shaped as real ProvisionalSource records so artboard
// 13's table renders with populated data (Sources / Provisional review is the default landing
// view). `created_at` is computed at mount time, not frozen, because the Discovered column is a
// live RelativeTime.
const ADMIN_PROVISIONAL_FIXTURE = [
  { name: 'European Maritime Safety Agency — Reducing emissions', url: 'https://emsa.europa.eu/emissions', tier: 2, days: 2 },
  { name: 'Maritime and Port Authority of Singapore — MSGI', url: 'https://mpa.gov.sg/msgi', tier: 2, days: 2 },
  { name: 'Plastics News — resin price tracker', url: 'https://plasticsnews.com/resin', tier: 5, days: 5 },
  { name: 'Federal Register — EPA Clean Trucks', url: 'https://federalregister.gov/epa-clean-trucks', tier: 1, days: 6 },
];

const COMPOSE_ADMIN_ENTRY = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { AppShell } from '@/components/AppShell';
import { AdminDashboard } from '@/components/admin/AdminDashboard';
import { useWorkspaceStore } from '@/stores/workspaceStore';

const DAY = 86400000;
const PROVISIONAL = ${JSON.stringify(ADMIN_PROVISIONAL_FIXTURE)}.map((r, i) => ({
  id: 'prov-' + (i + 1),
  name: r.name,
  url: r.url,
  domain: 1,
  description: '',
  discovered_via: 'citation_detection',
  cited_by_source_id: 'src-1',
  cited_by_source_tier: 1,
  citation_count: 3,
  independent_citers: 2,
  citing_source_ids: ['src-1'],
  highest_citing_tier: 1,
  provisional_tier: r.tier,
  recommended_tier: r.tier,
  accessibility_verified: true,
  publishes_structured_content: true,
  entity_identified: true,
  status: 'pending_review',
  reviewer_notes: '',
  created_at: new Date(Date.now() - r.days * DAY).toISOString(),
  reviewed_at: null,
}));

useWorkspaceStore.getState().setUserRole('owner');

let root = null;
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(
    React.createElement(AppShell, null,
      React.createElement('div', { 'data-audit': 'admin' },
        React.createElement(AdminDashboard, {
          userId: 'smoke-user',
          userEmail: 'smoke@example.com',
          dateLabel: 'Sunday 6 September 2026',
          initialOrgs: [{ id: 'org-1', name: "Dietl / Rockit", slug: 'dietl-rockit', plan: 'enterprise', created_at: '2026-01-01' }],
          // dc.html p13's own ORGANIZATIONS row reads "1 ORG · 2 MEMBERSHIPS" with a
          // MEMBERS cell of "2 · owners", so the mount seeds those two memberships:
          // without them the region rendered a bare 0 and the artboard's role summary
          // could not be measured at all (lane admin60, 2026-09-08).
          initialMembers: [
            { id: 'mem-1', org_id: 'org-1', user_id: 'a0764ff3-0000-0000-0000-000000000001', role: 'owner', created_at: '2026-04-04T00:00:00Z' },
            { id: 'mem-2', org_id: 'org-1', user_id: 'a0764ff3-0000-0000-0000-000000000002', role: 'owner', created_at: '2026-05-28T00:00:00Z' },
          ],
          initialProvisionalSources: PROVISIONAL,
          initialEmissionFactorsLiveCount: 13,
        }),
      ),
    ),
  );
};
`;

// ── Account (14) full-page composition mount ─────────────────────────────────────────────────────
// Reuses the SAME real UserProfilePage the /profile route mounts (README screen 14 / dc.html p14),
// wrapped in AppShell for the nav card + Masthead's frame position. Seeds workspaceStore's
// orgId/orgName/userRole (UserProfilePage reads these directly, same as COMPOSE_ADMIN_ENTRY seeds
// userRole for AdminDashboard) so the rail's isOwner/isAdmin gate and the Organization tab have a
// real org to key off; the three direct supabase.from(...) reads (profiles / organizations.plan /
// org_memberships count) are answered by stub-supabase-browser-account.mjs's fixture rows, and
// getWorkspaceProfile (Sector-profile tab + "Sectors followed" tile) by
// stub-workspace-profile-account.mjs — no live Supabase project reachable in this sandbox
// (DEVIATION-LOG.md).
const COMPOSE_ACCOUNT_ENTRY = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { AppShell } from '@/components/AppShell';
import { UserProfilePage } from '@/components/profile/UserProfilePage';
import { useWorkspaceStore } from '@/stores/workspaceStore';

useWorkspaceStore.getState().setWorkspace('org-1', 'Dietl / Rockit');
useWorkspaceStore.getState().setUserRole('owner');
// dc.html p14's own illustrated tab is "Members & roles" (with Organization stacked below it,
// its own artboard-matched behavior — see UserProfilePage.tsx's "members" tab branch); the initial
// tab reads from the URL's ?tab= param on first render (UserProfilePage.tsx / initial-tab.ts),
// which this mount's page has none of by default, so set it before mounting.
window.history.replaceState(null, '', '/profile?tab=members');

let root = null;
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(
    React.createElement(AppShell, null,
      React.createElement('div', { 'data-audit': 'account' },
        React.createElement(UserProfilePage, {
          userId: 'audit-user',
          userEmail: 'jason@dietl-rockit.example',
        }),
      ),
    ),
  );
};
`;

// ── Settings (15) full-page composition mount ────────────────────────────────────────────────────
// Reuses the SAME real SettingsPage the /settings route mounts (README screen 15 / dc.html p15),
// wrapped in AppShell. Per operator ruling R9 (DEVIATION-LOG.md), this page's second-level items
// (General/Notifications/Saved searches/Data & supersessions/Archive/Help) are ALREADY correctly
// built as one scrolling page under a sticky SectionIndex, not the artboard's literal 300px rail —
// that structural deviation is binding and NOT reproduced/asserted against here.
// ── Auth (16) full-page composition mounts (/login, /signup) ─────────────────────────────────────
// Reuses the SAME real page components the routes mount (README screen 16 / dc.html p16), wrapped
// in AppShell-free AuthFrame (both pages already render their own full-frame chrome, no Sidebar).
// ── Onboarding (17) full-page composition mount ──────────────────────────────────────────────────
// The real OnboardingWizard (README screen 17 / dc.html p17), inside AuthFrame. Its own `step` state
// defaults to 2 ("Modes & jurisdictions") already — the artboard's own illustrated step — so no
// forced navigation is needed. Step 4 "Briefing" has no artboard yet (operator ruling, dispatch) and
// is out of this mount's scope.
const ONBOARDING_AGGREGATES_FIXTURE = {
  totalItems: 742,
  byPriority: { CRITICAL: 12, HIGH: 21, MODERATE: 611, LOW: 98 },
  byStatus: {},
  byJurisdiction: {},
  totalJurisdictions: 58,
  lastUpdatedAt: '2026-09-06T00:00:00Z',
};

const COMPOSE_ONBOARDING_ENTRY = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard';

const AGGREGATES = ${JSON.stringify(ONBOARDING_AGGREGATES_FIXTURE)};

let root = null;
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(
    React.createElement('div', { 'data-audit': 'onboarding' },
      React.createElement(OnboardingWizard, {
        userId: 'audit-user',
        userEmail: 'jason@dietl-rockit.example',
        orgId: 'org-1',
        aggregates: AGGREGATES,
      }),
    ),
  );
};
`;

const COMPOSE_LOGIN_ENTRY = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import LoginPage from '@/app/login/page';

let root = null;
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(
    React.createElement('div', { 'data-audit': 'login' },
      React.createElement(LoginPage, null),
    ),
  );
};
`;

const COMPOSE_SIGNUP_ENTRY = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import SignupPage from '@/app/signup/page';

let root = null;
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(
    React.createElement('div', { 'data-audit': 'signup' },
      React.createElement(SignupPage, null),
    ),
  );
};
`;

const COMPOSE_SETTINGS_ENTRY = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { AppShell } from '@/components/AppShell';
import { SettingsPage } from '@/components/pages/SettingsPage';
import { useWorkspaceStore } from '@/stores/workspaceStore';

useWorkspaceStore.getState().setWorkspace('org-1', 'Dietl / Rockit');
useWorkspaceStore.getState().setUserRole('owner');
useWorkspaceStore.getState().setSectorProfile(['fine-art', 'live-events', 'luxury-goods', 'film-tv', 'automotive', 'humanitarian']);

let root = null;
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(
    React.createElement(AppShell, null,
      React.createElement('div', { 'data-audit': 'settings' },
        React.createElement(SettingsPage, {
          initialResources: [],
          initialArchived: [],
          supersessions: [],
          userId: 'audit-user',
          userEmail: 'jason@dietl-rockit.example',
        }),
      ),
    ),
  );
};
`;


// No STYLE_INJECT here (unlike every other ENTRY in this file): these page-composition mounts
// render Tailwind-utility-styled components (Sidebar/TopBar), which STYLE_INJECT's raw globals.css
// read cannot style (see fullAppCssCompiled's header in smoke-fixtures.mjs) — capture-compose-
// page.mjs injects the compiled CSS itself via page.addStyleTag before mounting.
const COMPOSE_MAP_ENTRY = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { AppShell } from '@/components/AppShell';
import { Masthead } from '@/components/ui/Masthead';
import { MapPageView } from '@/components/map/MapPageView';

const RESOURCES = ${JSON.stringify(MAP_FIXTURE_RESOURCES)};
const COVERAGE_GAPS = ${JSON.stringify(MAP_COVERAGE_GAPS)};

let root = null;
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(
    React.createElement(AppShell, null,
      React.createElement('div', { 'data-audit': 'map' },
        React.createElement('div', { style: { padding: '20px 40px 0' } },
          React.createElement(Masthead, {
            title: 'Regulatory map',
            dateLabel: 'Sunday 6 September 2026',
            dek: '3 jurisdictions live \\u00b7 6 active items \\u00b7 2 jurisdictions with immediate items \\u00b7 marker size = item count \\u00b7 colour = highest band present',
            commandBar: { itemCount: 6, scope: 'map', placeholder: 'Search a jurisdiction \\u2014 or ask "where are my immediate items?"' },
          }),
        ),
        React.createElement(MapPageView, {
          resources: RESOURCES,
          coverageGaps: COVERAGE_GAPS,
          initialRegionFilter: null,
          communityActivity: [],
        }),
      ),
    ),
  );
};
`;

// ── Community (12) full-page composition mount ──────────────────────────────────────────────────
const COMMUNITY_ROOMS_FIXTURE = [
  {
    key: 'GLOBAL', name: 'Global', short: 'GLO', groupId: 'g-global', joined: true, youHere: true,
    itemCount: 9, itemCountKnown: true, hue: 'moderate', themes: ['Research', 'Fuels', 'Corridors'],
    liveItems: [], roster: [{ name: 'Jason', isYou: true, isOwner: true }],
    threads: [
      { id: 't1', groupId: 'g-global', title: 'How are you handling the CH4 and N2O scope changes?', body: '', replyCount: 14, createdAt: '2026-09-04T09:00:00Z', lastActivityAt: '2026-09-06T14:00:00Z', referencedItemIds: [], authorName: 'A. Weiss', authorOrg: 'Dietl', isYou: false, isOwner: false, signedOff: false },
      { id: 't2', groupId: 'g-global', title: 'Ocean rate spike: what your clients are asking this week', body: '', replyCount: 23, createdAt: '2026-09-04T09:00:00Z', lastActivityAt: '2026-09-04T09:00:00Z', referencedItemIds: [], authorName: 'S. Patel', authorOrg: 'Dietl', isYou: false, isOwner: false, signedOff: false },
      { id: 't3', groupId: 'g-global', title: 'Template: customer letter for the CBAM cost pass-through', body: '', replyCount: 5, createdAt: '2026-09-02T09:00:00Z', lastActivityAt: '2026-09-02T09:00:00Z', referencedItemIds: [], authorName: 'M. Ruiz', authorOrg: 'Dietl', isYou: false, isOwner: false, signedOff: false },
    ],
  },
  { key: 'EU', name: 'EU', short: 'EU', groupId: 'g-eu', joined: false, youHere: false, itemCount: 753, itemCountKnown: true, hue: 'critical', themes: ['Emissions', 'Reporting', 'Packaging'], liveItems: [], roster: [],
    threads: [{ id: 't4', groupId: 'g-eu', title: 'FuelEU pooling — anyone modelled the 2027 penalty exposure?', body: '', replyCount: 8, createdAt: '2026-09-05T09:12:00Z', lastActivityAt: '2026-09-05T09:12:00Z', referencedItemIds: [], authorName: 'J. Nowak', authorOrg: 'Rockit', isYou: false, isOwner: false, signedOff: false }] },
  { key: 'US', name: 'US', short: 'US', groupId: 'g-us', joined: false, youHere: false, itemCount: 24, itemCountKnown: true, hue: 'high', themes: ['Reporting', 'Emissions', 'Transport'], liveItems: [], roster: [], threads: [] },
  { key: 'UK', name: 'UK', short: 'UK', groupId: 'g-uk', joined: false, youHere: false, itemCount: 210, itemCountKnown: true, hue: 'moderate', themes: ['Transport', 'Research', 'Emissions'], liveItems: [], roster: [], threads: [] },
  { key: 'APAC', name: 'APAC', short: 'APAC', groupId: 'g-apac', joined: false, youHere: false, itemCount: 2, itemCountKnown: true, hue: 'low', themes: ['Reporting'], liveItems: [], roster: [], threads: [] },
  { key: 'LATAM', name: 'LATAM', short: 'LATAM', groupId: 'g-latam', joined: false, youHere: false, itemCount: 1, itemCountKnown: true, hue: 'low', themes: ['Emissions'], liveItems: [], roster: [], threads: [] },
  { key: 'MEAF', name: 'MEAF', short: 'MEAF', groupId: 'g-meaf', joined: false, youHere: false, itemCount: 0, itemCountKnown: true, hue: 'low', themes: [], liveItems: [], roster: [], threads: [] },
];

const COMPOSE_COMMUNITY_ENTRY = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { AppShell } from '@/components/AppShell';
import { Masthead } from '@/components/ui/Masthead';
import { CommunityRooms } from '@/components/community/CommunityRooms';

const ROOMS = ${JSON.stringify(COMMUNITY_ROOMS_FIXTURE)};

let root = null;
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(
    React.createElement(AppShell, null,
      React.createElement('div', { 'data-audit': 'community' },
        React.createElement('div', { style: { padding: '20px 40px 0' } },
          React.createElement(Masthead, {
            title: 'Community',
            dateLabel: 'Sunday 6 September 2026',
            dek: '7 regional rooms \\u00b7 999 active items across them \\u00b7 you are in 1 \\u00b7 peer signal is unverified until a verifier signs off',
            commandBar: { itemCount: 999, scope: 'community', placeholder: 'Search posts, groups, members \\u2014 or ask "what did the EU room flag this week?"' },
          }),
        ),
        React.createElement(CommunityRooms, {
          rooms: ROOMS,
          seeded: true,
          currentUserId: 'u1',
          currentUserName: 'Jason',
          currentUserIsOwner: true,
          currentUserIsVerifier: false,
          verifierStatus: 'none',
          pendingPickups: 0,
          nowIso: '2026-09-06T16:00:00Z',
          verticalGroups: [],
          verticalOptions: [],
        }),
      ),
    ),
  );
};
`;


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
        // FOLD-59: the MONITOR tile (i === 2) carries a FOUR-DIGIT count, as artboard 01 does
        // ("1,135"). Every tile here was two digits, so the numeral's thousands separator was
        // unmeasurable and its absence went unseen until the side-by-side showed "1135".
        React.createElement(BandTile, { band, count: i === 2 ? 1135 : 14 + i, selected: i === 0 }))),
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

// ── AdminIssuesRail (README screen 13 / dc.html p13) ──────────────────────────────────────────────
// Real component, real `useAdminAttention` hook — its `@/components/auth/AuthProvider` import is
// aliased to the shared auth stub (a signed-in user), and its `useWorkspaceStore` userRole is set to
// 'owner' before mount so the hook's `enabled` gate opens and the real fetch fires against a fixture
// api route matching dc.html p13's own example numbers exactly (489 / 4576 / 6 / 3 non-zero, the rest
// zero — total 5,074).
const ADMIN_ISSUES_RAIL_FIXTURE = {
  provisional_sources_pending: 489,
  staged_updates_pending: 0,
  staged_updates_materialization_failed: 0,
  integrity_flags_unresolved: 3,
  platform_integrity_flags_open: 4576,
  source_attribution_mismatches: 0,
  auto_approved_awaiting_spotcheck: 6,
  coverage_gaps_critical: 0,
  total: 5074,
};

const ADMIN_ISSUES_RAIL_API = [
  { urlGlob: '**/api/admin/attention', handler: (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(ADMIN_ISSUES_RAIL_FIXTURE) }) },
];

// Account (14) — /api/orgs/org-1 fixture responses (lane compose-other, 2026-09-08). MembersPanel
// and OrganizationPanel (the "Members & roles" and "Organization" tabs) both fetch these directly —
// values match dc.html p14's own illustrated Members & roles state exactly (2 members, both Owner;
// org name/slug/plan).
const ACCOUNT_ORG_API = [
  {
    urlGlob: '**/api/orgs/org-1/members',
    handler: (route) => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        members: [
          { id: 'm-1', user_id: 'audit-user', role: 'owner', joined_at: '2026-04-04T00:00:00Z', display_name: 'Jason', avatar_url: null },
          { id: 'm-2', user_id: 'u-2', role: 'owner', joined_at: '2026-05-28T00:00:00Z', display_name: 'jasonlosh@gmail.com', avatar_url: null },
        ],
        caller_role: 'owner',
        caller_membership_id: 'm-1',
      }),
    }),
  },
  {
    urlGlob: '**/api/orgs/org-1/invitations',
    handler: (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ invitations: [] }) }),
  },
  {
    urlGlob: '**/api/orgs/org-1',
    handler: (route) => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        org: { id: 'org-1', name: 'Dietl / Rockit', slug: 'dietl-rockit', plan: 'enterprise', created_at: '2026-04-04T00:00:00Z' },
        caller_role: 'owner',
        owner: { user_id: 'audit-user', display_name: 'Jason', owner_since: '2026-04-04T00:00:00Z' },
        member_count: 2,
      }),
    }),
  },
];

const ADMIN_ISSUES_RAIL_ENTRY = `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { AdminIssuesRail } from '@/components/admin/redesign/AdminIssuesRail';
import { useWorkspaceStore } from '@/stores/workspaceStore';

useWorkspaceStore.getState().setUserRole('owner');

let root = null;
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(
    React.createElement('div', { style: { width: 300, padding: 20, background: 'var(--page)' } },
      React.createElement(AdminIssuesRail, { onNavigate: () => {} }),
    ),
  );
};
`;

// ── Admin stat tiles (README screen 13 / dc.html p13, the 8-tile summary grid) ────────────────────
// Real AdminDashboard, same auth-stub + fixture technique as AdminIssuesRail above (they share one
// page, one useAdminAttention fetch) — mounts the actual `.cl-admin-stat-tile` wrapper + `StatBlock
// size="tile"` the product renders, not a copy.
const ADMIN_STAT_TILES_ENTRY = `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { AdminDashboard } from '@/components/admin/AdminDashboard';
import { useWorkspaceStore } from '@/stores/workspaceStore';

useWorkspaceStore.getState().setUserRole('owner');

let root = null;
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(
    React.createElement(AdminDashboard, {
      userId: 'smoke-user',
      userEmail: 'smoke@example.com',
      dateLabel: 'Vol IV · No. 36 · Sunday 6 September 2026',
      initialOrgs: [{ id: 'org-1', name: 'Rockit', slug: 'rockit', plan: 'team', created_at: '2026-01-01' }],
      initialEmissionFactorsLiveCount: 13,
    }),
  );
};
`;

// ── OnboardingStepper (README screen 17 / dc.html p17) ─────────────────────────────────────────────
const ONBOARDING_STEPPER_ENTRY = `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { OnboardingStepper } from '@/components/onboarding/OnboardingStepper';

let root = null;
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(
    React.createElement('div', { style: { width: 620, padding: 20, background: '#fff' }, 'data-audit': 'stepper' },
      React.createElement(OnboardingStepper, { current: 2 }),
    ),
  );
};
`;

// ── Compose-lists page composition: RegulationsLedger / MarketIntelLedger (lane compose-lists,
// 2026-09-08, artboards 02/id="p2" and 04/id="p4"). Real page-composition components, not the raw
// ListSurfaceShell primitive `list-surface-1440` above mounts — this exercises facetGroups (incl.
// Topic/Source-tier), the real sortRow/flat wiring, and (Market only) the embedded Headline Series
// card, the exact regions the operator's screenshot audit named ("filters were on the right ...
// you are NOT matching the images directly"). Fixture shape matches
// ../capture-compose-lists-screenshots.mjs's own fixture (same rows, same SERIES_BOARD), so the
// audit and the evidence screenshot measure the identical mount.
const COMPOSE_EMPTY_AGGREGATES = {
  totalItems: 0,
  byPriority: { CRITICAL: 0, HIGH: 0, MODERATE: 0, LOW: 0 },
  byStatus: {},
  byJurisdiction: {},
  totalJurisdictions: 0,
  lastUpdatedAt: null,
};

function composeRegRow(i) {
  const jurisdictions = ['EU', 'US', 'UK', 'Global'];
  const modes = [['ocean'], ['air'], ['road'], ['ocean', 'air'], ['rail']];
  const topics = ['Emissions & carbon pricing', 'Sustainable fuels & energy', 'Green transport standards', 'ESG reporting'];
  const bands = ['CRITICAL', 'CRITICAL', 'CRITICAL', 'HIGH', 'HIGH', 'HIGH', 'MODERATE', 'MODERATE', 'LOW'];
  const jurisdiction = jurisdictions[i % jurisdictions.length];
  return {
    id: `reg-${i}`, domain: 1,
    title: `Regulation fixture ${i}: cross-border reporting duty amendment`,
    note: 'Short regulation note.', type: 'regulation', priority: bands[i % bands.length],
    added: `2026-0${(i % 8) + 1}-0${(i % 9) + 1}`, jurisdiction, jurisdictionIso: [jurisdiction],
    modes: modes[i % modes.length], topic: topics[i % topics.length], sourceTier: (i % 6) + 1,
    citationCount: i % 4 === 0 ? null : 2, biasTags: [], itemGrade: 'record', reasoning: '', tags: [],
    complianceDeadline: `2026-${String(9 + (i % 3)).padStart(2, '0')}-${String(5 + (i % 20)).padStart(2, '0')}`,
    timeline: [{ date: '2027-06-01', label: 'Compliance deadline', status: 'future' }],
  };
}
const COMPOSE_REG_ROWS = Array.from({ length: 24 }, (_, i) => composeRegRow(i));

function composeCountsBy(rows, field) {
  const counts = {};
  for (const r of rows) counts[r[field]] = (counts[r[field]] ?? 0) + 1;
  return counts;
}

const COMPOSE_REGULATIONS_ENTRY = `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { RegulationsLedger } from '@/components/regulations/RegulationsLedger';

const REG_ROWS = ${JSON.stringify(COMPOSE_REG_ROWS)};
const props = {
  initialResources: REG_ROWS,
  initialArchived: [],
  aggregates: {
    ...${JSON.stringify(COMPOSE_EMPTY_AGGREGATES)},
    totalItems: REG_ROWS.length,
    byPriority: ${JSON.stringify(composeCountsBy(COMPOSE_REG_ROWS, 'priority'))},
    byJurisdiction: ${JSON.stringify(composeCountsBy(COMPOSE_REG_ROWS, 'jurisdiction'))},
    totalJurisdictions: 4,
    lastUpdatedAt: '2026-09-04T00:00:00Z',
  },
  hasMore: false,
};

let root = null;
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(React.createElement(RegulationsLedger, props));
};
`;

function composeMarketRow(i) {
  const jurisdictions = ['EU', 'US', 'UK', 'Global'];
  const modes = [['ocean'], ['air'], ['road'], ['ocean', 'air'], ['rail']];
  const bands = ['CRITICAL', 'CRITICAL', 'CRITICAL', 'HIGH', 'HIGH', 'HIGH', 'MODERATE', 'MODERATE', 'LOW'];
  const jurisdiction = jurisdictions[i % jurisdictions.length];
  return {
    id: `mkt-${i}`, domain: 4,
    title: `Market signal fixture ${i}: spot-rate divergence on the trans-Pacific lane`,
    note: 'Short signal note.', type: 'signal', priority: bands[i % bands.length],
    added: `2026-0${(i % 8) + 1}-1${i % 9}`, jurisdiction, jurisdictionIso: [jurisdiction],
    modes: modes[i % modes.length], sourceTier: (i % 6) + 1,
    severity: ['action_required', 'cost_alert', 'window_closing', 'competitive_edge', 'monitoring'][i % 5],
    tags: [], reasoning: '',
    complianceDeadline: `2026-${String(9 + (i % 3)).padStart(2, '0')}-${String(5 + (i % 20)).padStart(2, '0')}`,
    timeline: [{ date: '2027-03-01', label: 'Window closes', status: 'future' }],
  };
}
const COMPOSE_MARKET_ROWS = Array.from({ length: 20 }, (_, i) => composeMarketRow(i));

// `referencePeriod` is a real value here, not null: artboard 04's NEXT DATA DROPS card derives its
// dates from the latest observed period per producer (lane lists60, 2026-09-08). It defaults to the
// EU Weekly Oil Bulletin's own last published week in this fixture.
function composeSeriesRow(key, label, displayValue, pct1w, referencePeriod = '2026-09-03') {
  return {
    seriesKey: key, id: key, label, displayValue, emptyReason: null, asAtDate: '2026-09-03',
    referencePeriod, observationCount: 12, sourceKey: 'fixture', sourceRef: null, unit: null,
    currency: null, derivation: null, originClass: null, methodVersion: null, nObservations: 12,
    deltas: {
      count: 12,
      latest: { date: '2026-09-03', value: 1, unit: null, currency: null },
      sparkline: Array.from({ length: 6 }, (_, i) => ({ date: `2026-0${i + 1}-01`, value: 1 + i * 0.05 })),
      delta1w: { value: pct1w / 100, pct: pct1w, fromDate: '2026-08-27' },
      delta1m: { value: (pct1w * 2) / 100, pct: pct1w * 2, fromDate: '2026-08-03' },
      deltaYoY: { insufficientHistory: true },
      message: null,
    },
  };
}
// The two producer groups use REAL registry keyPrefixes ('eu-oil-bulletin', 'ecb-fx') and carry a
// `referencePeriod` on each series row, because artboard 04's NEXT DATA DROPS card derives its rows
// from exactly those two fields (latest observed period + that producer's own registered
// cadenceDays — src/lib/market/market-rail-select.mjs). A made-up prefix has no registry entry and
// would make the card render Absence, measuring nothing (lane lists60, 2026-09-08).
const COMPOSE_SERIES_BOARD = {
  groups: [
    {
      keyPrefix: 'eu-oil-bulletin', name: 'EU Weekly Oil Bulletin', implemented: true, cadence: 'weekly',
      sourceName: 'Fixture', sourceUrl: '', licenceStatus: 'ok', state: 'populated',
      series: [
        composeSeriesRow('eu-oil-bulletin:diesel', 'Diesel · EU avg benchmark', '€1,217/1000L', -1.7),
        composeSeriesRow('eu-oil-bulletin:e95', 'Euro-Super 95', '€1,014/1000L', 0.7),
        composeSeriesRow('eu-oil-bulletin:hfo', 'Heavy Fuel Oil 3.5%', '€535/t', -8.1),
        composeSeriesRow('eu-oil-bulletin:rfo', 'Residual Fuel Oil', '€646/t', 1.8),
      ],
    },
    {
      keyPrefix: 'ecb-fx', name: 'ECB euro foreign exchange reference rates', implemented: true, cadence: 'daily',
      sourceName: 'Fixture', sourceUrl: '', licenceStatus: 'ok', state: 'populated',
      series: [composeSeriesRow('ecb-fx:eurusd', 'EUR/USD · ECB ref.', '$1.16', 0, '2026-09-04')],
    },
  ],
  unregistered: [], totalObservedSeries: 5, totalProducers: 2, implementedProducerCount: 2, isEmpty: false,
};

// Artboard 04's CARBON COST PER FEU rows, in the shape summariseCarbonCorridors() returns from the
// overlay entries src/app/market/page.tsx already builds: a corridor label from
// formatCorridorLabel() plus the count of inputs still missing. Both entries carry the four-gap
// state every LIVE corridor is in today (see carbon-cost-per-feu.mjs's header), which is the state
// the artboard itself draws.
const COMPOSE_CARBON_CORRIDORS = [
  { label: 'Shanghai (CN) → Rotterdam (NL), ocean', pending: 4, point: null, currency: null },
  { label: 'Shanghai (CN) → Genoa (IT), ocean', pending: 4, point: null, currency: null },
];

const COMPOSE_MARKET_ENTRY = `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MarketIntelLedger } from '@/components/market/MarketIntelLedger';
import { MarketComparativeRibbon } from '@/components/market/MarketComparativeRibbon';

const MARKET_ROWS = ${JSON.stringify(COMPOSE_MARKET_ROWS)};
const SERIES_BOARD = ${JSON.stringify(COMPOSE_SERIES_BOARD)};
const props = {
  initialResources: MARKET_ROWS,
  aggregates: {
    ...${JSON.stringify(COMPOSE_EMPTY_AGGREGATES)},
    totalItems: MARKET_ROWS.length,
    byPriority: ${JSON.stringify(composeCountsBy(COMPOSE_MARKET_ROWS, 'priority'))},
    byJurisdiction: ${JSON.stringify(composeCountsBy(COMPOSE_MARKET_ROWS, 'jurisdiction'))},
    totalJurisdictions: 4,
    lastUpdatedAt: '2026-09-03T00:00:00Z',
  },
  seriesBoard: SERIES_BOARD,
  headlineSeries: React.createElement(MarketComparativeRibbon, { board: SERIES_BOARD, embedded: true }),
  // Artboard 04 rail card 2: the same reduced rows /market passes from its own overlay entries.
  carbonCorridors: ${JSON.stringify(COMPOSE_CARBON_CORRIDORS)},
  // The instant every date on this surface derives from — including NEXT DATA DROPS, so the audit
  // measures a fixed calendar rather than one that moves with the day the audit is run.
  nowIso: '2026-09-06T00:00:00Z',
};

let root = null;
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(React.createElement(MarketIntelLedger, props));
};
`;

// ── /research page composition (lane comp-06, 2026-09-08, artboard 06/id="p6") ─────────────────────
// The REAL ResearchLedger, fed a 20-row fixture in getPublicResearchItems()'s own `Resource` shape
// (a migration-102 `theme` column value, a `severity` value, a `sub` kind label, an `added` date),
// so the theme card row, the Window row, the band-card foot rows and the transition strip are all
// measured as the page composes them, not as isolated parts fed invented props.
const COMPOSE_RESEARCH_THEMES = ['emissions_accounting', 'fuels_saf', 'last_mile_electrification', 'disclosure_regimes'];
const COMPOSE_RESEARCH_SUBS = ['initiative', 'think tank', 'active data platform', 'peer-reviewed journal'];
const COMPOSE_RESEARCH_BANDS = ['HIGH', 'MODERATE', 'LOW', 'LOW', 'LOW', 'LOW'];

function composeResearchRow(i) {
  const jurisdictions = ['EU', 'US', 'UK', 'Global'];
  const modes = [['ocean'], ['air'], ['road'], ['ocean', 'air'], ['rail']];
  const jurisdiction = jurisdictions[i % jurisdictions.length];
  return {
    id: `res-${i}`, domain: 7,
    title: `Research finding fixture ${i}: measured abatement across the ocean leg`,
    note: 'Short finding note.', type: 'Finding', sub: COMPOSE_RESEARCH_SUBS[i % COMPOSE_RESEARCH_SUBS.length],
    priority: COMPOSE_RESEARCH_BANDS[i % COMPOSE_RESEARCH_BANDS.length],
    // Fixed dates (never Date.now()): the audit is a measurement, and a fixture whose rows drift
    // in and out of the Window row's buckets by wall clock is not reproducible. "all" is the
    // default window, so every row is in view whatever today is.
    added: `2026-08-${String((i % 28) + 1).padStart(2, '0')}`,
    jurisdiction, jurisdictionIso: [jurisdiction], modes: modes[i % modes.length],
    theme: COMPOSE_RESEARCH_THEMES[i % COMPOSE_RESEARCH_THEMES.length],
    severity: ['cost_alert', 'monitoring', 'competitive_edge'][i % 3],
    sourceTier: 3, tags: [], reasoning: '',
    timeline: i % 3 === 0 ? [{ date: '2026-12-01', label: 'MEPC session', status: 'future' }] : undefined,
  };
}
const COMPOSE_RESEARCH_ROWS = Array.from({ length: 20 }, (_, i) => composeResearchRow(i));

const COMPOSE_RESEARCH_ENTRY = `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ResearchLedger } from '@/components/research/ResearchLedger';

const RESEARCH_ROWS = ${JSON.stringify(COMPOSE_RESEARCH_ROWS)};
const props = {
  resources: RESEARCH_ROWS,
  aggregates: {
    ...${JSON.stringify(COMPOSE_EMPTY_AGGREGATES)},
    totalItems: RESEARCH_ROWS.length,
    byPriority: ${JSON.stringify(composeCountsBy(COMPOSE_RESEARCH_ROWS, 'priority'))},
    byJurisdiction: ${JSON.stringify(composeCountsBy(COMPOSE_RESEARCH_ROWS, 'jurisdiction'))},
    totalJurisdictions: 4,
    lastUpdatedAt: '2026-09-06T00:00:00Z',
  },
  sourceCoverage: [
    { transportMode: 'ocean', jurisdictionIso: 'EU', sourceCount: 18 },
    { transportMode: 'road', jurisdictionIso: 'US', sourceCount: 14 },
    { transportMode: 'air', jurisdictionIso: 'UK', sourceCount: 11 },
    { transportMode: 'rail', jurisdictionIso: 'Global', sourceCount: 3 },
  ],
};

let root = null;
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(React.createElement(ResearchLedger, props));
};
`;

// ── Compose-08: the real OperationsLedger page composition (lane comp-08, 2026-09-08, artboard
// 08/id="p8"). The `ops-matrix` mount above measures RegionDimensionMatrix ALONE, fed empty facts;
// this one measures the COMPOSED /operations page — masthead scope line, band tiles, the matrix in
// its artboard placement (first in the content column, above the band cards), the band-grouped
// rows, the By-state disclosure's R7 placement at the card foot, and the rail's Region/Dimension
// filters + Coverage gaps + Legend order. Fixture is populated (25 rows, 5 regions, real coverage/
// fact row shapes) because an empty matrix cannot show a placement defect.
function composeOpsRow(i) {
  // 0 immediate / 4 action / 2 monitor / 19 awareness — the artboard's own band split.
  const priority = i < 4 ? 'HIGH' : i < 6 ? 'MODERATE' : 'LOW';
  const regions = ['EU', 'US', 'SG', 'GB', 'AE'];
  const jurisdiction = regions[i % regions.length];
  return {
    id: `ops-${i}`, domain: 6,
    title: `${jurisdiction} Regional Operations Profile ${i}`,
    note: 'Regional profile note.', type: 'operations', priority,
    added: `2026-0${(i % 8) + 1}-1${i % 9}`, jurisdiction, jurisdictionIso: [jurisdiction],
    modes: [['ocean'], ['air'], ['road'], ['ocean', 'air']][i % 4], sourceTier: 2,
    tags: [], reasoning: '',
    complianceDeadline: `2026-${String(9 + (i % 3)).padStart(2, '0')}-${String(5 + (i % 20)).padStart(2, '0')}`,
    timeline: [{ date: '2027-03-01', label: 'Window closes', status: 'future' }],
  };
}
const COMPOSE_OPS_ROWS = Array.from({ length: 25 }, (_, i) => composeOpsRow(i));

const COMPOSE_OPS_REGIONS = [
  { code: 'EU', label: 'European Union', severity: 'critical', isoCodes: ['EU', 'DE', 'NL'] },
  { code: 'US', label: 'United States', severity: 'critical', isoCodes: ['US'] },
  { code: 'ASIA', label: 'Asia · SG + HK', severity: 'high', isoCodes: ['SG', 'HK'] },
  { code: 'UK', label: 'United Kingdom', severity: 'high', isoCodes: ['GB'] },
  { code: 'UAE', label: 'UAE · Dubai', severity: 'moderate', isoCodes: ['AE'] },
];

// The artboard's own matrix body: EU/US hold facts on a couple of dimensions only, ASIA/UK/UAE are
// sourced across the rest, D1 (regulatory_feasibility) is structurally empty everywhere.
const COMPOSE_OPS_DIM_DBS = ['regional_resources', 'labor_markets', 'materials_sourcing', 'infrastructure', 'operational_cost'];
const COMPOSE_OPS_COVERAGE = [];
const COMPOSE_OPS_FACTS = [];
for (const region of ['EU', 'US', 'ASIA', 'UK', 'UAE']) {
  for (const db of COMPOSE_OPS_DIM_DBS) {
    const sourced = region === 'EU' ? db === 'labor_markets' || db === 'operational_cost'
      : region === 'US' ? db === 'labor_markets'
      : true;
    const factCount = sourced ? (db === 'labor_markets' && region === 'US' ? 6 : 5) : 0;
    COMPOSE_OPS_COVERAGE.push({ region_code: region, dimension: db, state: sourced ? 'populated' : 'missing', fact_count: factCount, notes: null });
    for (let n = 0; n < factCount; n += 1) {
      COMPOSE_OPS_FACTS.push({
        region_code: region, dimension: db,
        fact_label: ['Labour cost, business economy, mean across member states', 'Warehouse worker monthly wage', 'Class 1 driver-handler with overtime', 'Private-sector salary growth, logistics', 'First-line supervisors, median'][n % 5],
        value: ['€40.4 / hr', 'HKD 14,747 / mo', '£40–42k / yr', '3–6% / yr', '$60,000 / yr'][n % 5],
        status: null, trend: null,
        source_name: ['Eurostat lc_lci_lev', 'Indeed HK', 'Talent.com / Glassdoor UK', 'Hays GCC Salary Guide', 'BLS OEWS 53-1047'][n % 5],
        source_url: 'https://example.com/fixture', source_note: null,
        last_updated: '2026-05-28', freshness: region === 'EU' && db === 'operational_cost' ? 'ageing' : 'current',
        value_numeric: null, unit: null, currency: null, derivation: null, origin_class: null,
        source_key: null, source_ref: null, n_observations: null, method_version: null,
        as_at_date: null, reference_period: null,
      });
    }
  }
}

const COMPOSE_OPS_STATE_COSTS = [
  { stateCode: 'US-CA', factLabel: 'Minimum wage', value: '$16.50', unit: '/hr', trend: null, statuteCitation: 'Cal. Lab. Code § 1182.12', sourceName: 'California DIR', effectiveDate: '2026-01-01' },
  { stateCode: 'US-NY', factLabel: 'Minimum wage', value: '$16.00', unit: '/hr', trend: null, statuteCitation: 'NY Lab. Law § 652', sourceName: 'NY DOL', effectiveDate: '2026-01-01' },
];

const COMPOSE_OPERATIONS_ENTRY = `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { OperationsLedger } from '@/components/operations/OperationsLedger';

const OPS_ROWS = ${JSON.stringify(COMPOSE_OPS_ROWS)};
const props = {
  initialResources: OPS_ROWS,
  aggregates: {
    ...${JSON.stringify(COMPOSE_EMPTY_AGGREGATES)},
    totalItems: OPS_ROWS.length,
    byPriority: ${JSON.stringify(composeCountsBy(COMPOSE_OPS_ROWS, 'priority'))},
    byJurisdiction: ${JSON.stringify(composeCountsBy(COMPOSE_OPS_ROWS, 'jurisdiction'))},
    totalJurisdictions: 18,
    lastUpdatedAt: '2026-09-06T00:00:00Z',
  },
  regulationsByRegion: [],
  operationsCoverage: {
    regions: ${JSON.stringify(COMPOSE_OPS_REGIONS)},
    coverage: ${JSON.stringify(COMPOSE_OPS_COVERAGE)},
    facts: ${JSON.stringify(COMPOSE_OPS_FACTS)},
  },
  stateCosts: ${JSON.stringify(COMPOSE_OPS_STATE_COSTS)},
};

let root = null;
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(React.createElement(OperationsLedger, props));
};
`;

// ── /watchlist, the real page composition (lane comp-11, 2026-09-08, artboard 11 / dc.html p11) ──
// The REAL `WatchlistSurface` fed a populated `WatchlistItem[]`, so the composition spec measures
// the page as assembled — masthead scope line, Watched card (head, column header, rows, foot, the
// changed-since-last-visit strip), the Recalculation notices card, and the rail's three cards in
// artboard order — rather than a shell primitive fed invented props.
//
// TWO API fixtures matter here, and both must return SHAPED bodies, not EMPTY_API's '{}':
//   /api/notices          feeds `useRecalculationNotices`; a populated list is what makes the
//                         state-note strip and the notices list render at all.
//   /api/workspace/tags   feeds `useWorkspaceTagsFacet`; its tags are the rail Filters card's
//                         "Workspace tags" group.
// Playwright tries overlapping page.route handlers LIFO, so the generic catch-all is registered
// first (the EMPTY_API spread) and these two after it, exactly as COMPOSE_LEDGER_API does.
const COMPOSE_WATCHLIST_NOTICES = Array.from({ length: 4 }, (_, i) => ({
  newValueId: `nv-${i}`,
  entityId: `ent-${i}`,
  entityLabel: `Fixture entity ${i}`,
  href: null,
  oldValue: 1200 + i,
  newValue: 1180 + i,
  unit: 'EUR/1000L',
  currency: null,
  methodId: 'fixture-method',
  oldMethodVersion: '1.0.0',
  newMethodVersion: '1.0.0',
  supersededAt: '2026-09-05T09:00:00Z',
  triggeringEvent: null,
}));

const COMPOSE_WATCHLIST_TAGS = {
  tags: [
    { id: 'tag-1', name: 'Packaging', itemCount: 3 },
    { id: 'tag-2', name: 'Fuel', itemCount: 2 },
  ],
  itemTags: { 'wl-0': ['tag-1'], 'wl-2': ['tag-2'] },
};

const COMPOSE_WATCHLIST_API = [
  ...EMPTY_API,
  // COUNTS-61 (2026-09-08): the route has always returned `since` alongside `notices` — the window
  // start it actually applied. The stub returns it too, so this mount renders the real label the
  // card now states ("Since Aug 9, 2026") instead of the "Since your last visit" the surface used to
  // assert without any instant behind it. 30 days before the fixture's own instant, which is what
  // GET /api/notices' own DEFAULT_WINDOW_DAYS produces for a caller that sends no ?since=.
  { urlGlob: '**/api/notices**', handler: (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ notices: COMPOSE_WATCHLIST_NOTICES, since: '2026-08-08T00:00:00.000Z' }) }) },
  { urlGlob: '**/api/workspace/tags**', handler: (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(COMPOSE_WATCHLIST_TAGS) }) },
];

function composeWatchRow(i) {
  const jurisdictions = ['EU', 'US', 'UK', 'Global'];
  const priorities = ['CRITICAL', 'HIGH', 'HIGH', 'MODERATE', 'LOW'];
  // The real WatchlistItemType vocabulary (src/lib/watchlist-links.ts) — 'reg', not 'regulation'.
  // An unknown type resolves to a null href and drops the row into the surface's Absence fallback,
  // which is the correct behaviour for a type the app has no route for and the WRONG fixture for
  // measuring the composed row.
  const types = ['reg', 'reg', 'research', 'operations'];
  return {
    id: `wl-${i}`,
    type: types[i % types.length],
    title: `Watched fixture ${i}: packaging and packaging waste regulation`,
    source: 'fixture',
    jurisdiction: jurisdictions[i % jurisdictions.length],
    lastChangedAt: '2026-08-06T00:00:00Z',
    scope: i % 4 === 3 ? 'team' : 'personal',
    addedBy: i % 4 === 3 ? 'A. Member' : undefined,
    priority: priorities[i % priorities.length],
    impactScores: { cost: 3, compliance: 3, client: 2, operational: 2 },
    sourceTier: (i % 6) + 1,
    complianceDeadline: `2026-12-${String(5 + (i % 20)).padStart(2, '0')}`,
    timeline: [
      { date: '2026-03-01', status: 'past' },
      { date: '2026-12-10', status: 'current' },
      { date: '2027-06-01', status: 'ahead' },
    ],
  };
}
const COMPOSE_WATCH_ROWS = Array.from({ length: 6 }, (_, i) => composeWatchRow(i));

const COMPOSE_WATCHLIST_ENTRY = `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { WatchlistSurface } from '@/components/watchlist/WatchlistSurface';

const ITEMS = ${JSON.stringify(COMPOSE_WATCH_ROWS)};

let root = null;
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(React.createElement(WatchlistSurface, { items: ITEMS, limit: 250 }));
};
`;

// ── Mobile 390 drawer (lane mobile60, 2026-09-08) ────────────────────────────────────────────────
// The mobile 390 spec's DRAWER section states measures that only exist while the drawer is OPEN,
// and AppShell owns that state (it is opened by <TopBar/>'s hamburger, never by a prop). Rather
// than add a test-only prop to product code, this mount renders the SAME AppShell + DashboardBrief
// tree as `page-frame-1440` and then clicks the real hamburger, so what the spec measures is the
// drawer a reader actually opens. No new product surface, no fixture of its own: it reuses
// PAGE_FRAME_FIXTURES.
const MOBILE_DRAWER_ENTRY = PAGE_FRAME_ENTRY.replace(
  'window.__mount = () => {',
  `window.__mount = () => {
  // React commits asynchronously, so poll for the real hamburger rather than assuming
  // it exists on the next frame; run-audit.mjs waits two frames plus 80ms before it
  // probes, which this comfortably fits inside.
  let tries = 0;
  const openDrawer = () => {
    const hamburger = document.querySelector('button[aria-label="Open navigation"]');
    if (hamburger) { hamburger.click(); return; }
    if (tries++ < 40) setTimeout(openDrawer, 5);
  };
  setTimeout(openDrawer, 0);`,
);

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
    // COUNTS-61 (2026-09-08): both ledgers now read their facet state from the URL through
    // useListSurfaceFilter; outside a real Next App Router tree those hooks throw.
    alias: {
      'next/navigation': `${SMOKE}stub-next-navigation.mjs`,
    },
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
  'mobile-drawer': {
    id: 'mobile-drawer',
    description: 'AppShell + DashboardBrief with the mobile nav drawer OPENED by clicking the real hamburger — the mobile 390 spec\'s DRAWER measures.',
    viewport: 390,
    entry: MOBILE_DRAWER_ENTRY,
    alias: {
      'next/navigation': `${SMOKE}stub-next-navigation.mjs`,
      '@/components/auth/AuthProvider': `${SMOKE}stub-auth-provider.mjs`,
    },
    apiRoutes: EMPTY_API,
  },
  'compose-01-dashboard': {
    id: 'compose-01-dashboard',
    description: 'The real AppShell frame wrapping DashboardBrief ALONE - the /-route mount the site-wide layout guard measures (artboard 01/id="p1").',
    viewport: 1440,
    entry: DASHBOARD_ROUTE_ENTRY,
    needsCompiledCss: true,
    alias: {
      'next/navigation': `${SMOKE}stub-next-navigation.mjs`,
      '@/components/auth/AuthProvider': `${SMOKE}stub-auth-provider.mjs`,
    },
    apiRoutes: EMPTY_API,
  },
  'compose-03-regulation-detail': {
    id: 'compose-03-regulation-detail',
    description: 'The real AppShell frame wrapping RegulationDetailSurface ALONE - the /regulations/[slug] mount the site-wide layout guard measures (artboard 03/id="p3").',
    viewport: 1440,
    entry: REGULATION_DETAIL_ROUTE_ENTRY,
    needsCompiledCss: true,
    alias: {
      'next/navigation': `${SMOKE}stub-next-navigation.mjs`,
      '@/components/auth/AuthProvider': `${SMOKE}stub-auth-provider.mjs`,
    },
    apiRoutes: EMPTY_API,
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
  'market-detail-1440': {
    id: 'market-detail-1440',
    description: 'The real AppShell frame wrapping MarketSignalDetailSurface, fixture data drawn from artboard 05.',
    viewport: 1440,
    entry: MARKET_DETAIL_ENTRY,
    alias: {
      'next/navigation': `${SMOKE}stub-next-navigation.mjs`,
      '@/components/auth/AuthProvider': `${SMOKE}stub-auth-provider.mjs`,
    },
    apiRoutes: EMPTY_API,
  },
  'research-detail-1440': {
    id: 'research-detail-1440',
    description: 'The real AppShell frame wrapping ResearchFindingDetailSurface, fixture data drawn from artboard 07.',
    viewport: 1440,
    entry: RESEARCH_DETAIL_ENTRY,
    alias: {
      'next/navigation': `${SMOKE}stub-next-navigation.mjs`,
      '@/components/auth/AuthProvider': `${SMOKE}stub-auth-provider.mjs`,
    },
    apiRoutes: EMPTY_API,
  },
  'operations-detail-1440': {
    id: 'operations-detail-1440',
    description: 'The real AppShell frame wrapping OperationsDetailSurface, fixture data drawn from artboard 09.',
    viewport: 1440,
    entry: OPERATIONS_DETAIL_ENTRY,
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
  'admin-issues-rail': {
    id: 'admin-issues-rail',
    description: 'The real AdminIssuesRail (Admin surface right rail), README screen 13 / dc.html p13.',
    viewport: 1440,
    entry: ADMIN_ISSUES_RAIL_ENTRY,
    alias: {
      '@/components/auth/AuthProvider': `${SMOKE}stub-auth-provider.mjs`,
    },
    apiRoutes: ADMIN_ISSUES_RAIL_API,
  },
  'admin-stat-tiles': {
    id: 'admin-stat-tiles',
    description: 'The real AdminDashboard 8-tile summary grid (.cl-admin-stat-tile + StatBlock size="tile"), README screen 13 / dc.html p13.',
    viewport: 1440,
    entry: ADMIN_STAT_TILES_ENTRY,
    alias: {
      '@/components/auth/AuthProvider': `${SMOKE}stub-auth-provider.mjs`,
    },
    apiRoutes: ADMIN_ISSUES_RAIL_API,
  },
  'onboarding-stepper': {
    id: 'onboarding-stepper',
    description: 'The real OnboardingStepper (4-pill progress row), README screen 17 / dc.html p17.',
    viewport: 1440,
    entry: ONBOARDING_STEPPER_ENTRY,
  },
  'compose-02-regulations': {
    id: 'compose-02-regulations',
    description: 'The real RegulationsLedger page composition (24-row fixture): rail Filters/Obligations/Legend, sort/count row, band-sectioned rows — artboard 02/id="p2".',
    viewport: 1440,
    entry: COMPOSE_REGULATIONS_ENTRY,
    // COUNTS-61 (2026-09-08): the ledger reads its facet state from the URL through
    // useListSurfaceFilter, so every facet is linkable and not only the band. Outside a real Next
    // App Router tree those hooks throw; this is the same stub the smoke specs already use.
    alias: {
      'next/navigation': `${SMOKE}stub-next-navigation.mjs`,
    },
    apiRoutes: COMPOSE_REGULATIONS_API,
  },
  'compose-06-research': {
    id: 'compose-06-research',
    description: 'The real ResearchLedger page composition (20-row fixture): theme cards, Window row, band-foot rows + transition strip, rail Filters/Source coverage/Legend, artboard 06/id="p6".',
    viewport: 1440,
    entry: COMPOSE_RESEARCH_ENTRY,
    // COUNTS-61 (2026-09-08): the ledger reads its facet state from the URL through
    // useListSurfaceFilter, so every facet is linkable and not only the band. Outside a real Next
    // App Router tree those hooks throw; this is the same stub the smoke specs already use.
    alias: {
      'next/navigation': `${SMOKE}stub-next-navigation.mjs`,
    },
    apiRoutes: COMPOSE_LEDGER_API,
  },
  'compose-04-market': {
    id: 'compose-04-market',
    description: 'The real MarketIntelLedger page composition (20-row fixture): rail Filters/Legend, embedded Headline Series card, sort/count row, band-sectioned rows — artboard 04/id="p4".',
    viewport: 1440,
    entry: COMPOSE_MARKET_ENTRY,
    // COUNTS-61 (2026-09-08): the ledger reads its facet state from the URL through
    // useListSurfaceFilter, so every facet is linkable and not only the band. Outside a real Next
    // App Router tree those hooks throw; this is the same stub the smoke specs already use.
    alias: {
      'next/navigation': `${SMOKE}stub-next-navigation.mjs`,
    },
    apiRoutes: COMPOSE_LEDGER_API,
  },
  'compose-08-operations': {
    id: 'compose-08-operations',
    description: 'The real OperationsLedger page composition (25-row fixture, 5 regions, populated coverage/facts): masthead scope line, band tiles, "Regions side by side" matrix card, band-sectioned rows, By-state disclosure at the card foot, rail Filters/Coverage gaps/Legend — artboard 08/id="p8".',
    viewport: 1440,
    entry: COMPOSE_OPERATIONS_ENTRY,
    // COUNTS-61 (2026-09-08): the ledger reads its facet state from the URL through
    // useListSurfaceFilter, so every facet is linkable and not only the band. Outside a real Next
    // App Router tree those hooks throw; this is the same stub the smoke specs already use.
    alias: {
      'next/navigation': `${SMOKE}stub-next-navigation.mjs`,
    },
    apiRoutes: COMPOSE_LEDGER_API,
  },
  'compose-11-watchlist': {
    id: 'compose-11-watchlist',
    description: 'The real WatchlistSurface page composition (6-row fixture, populated notices + tags): masthead scope line, Watched card head/column header/rows/foot/state note, Recalculation notices card, rail Filters/Share/Legend — artboard 11/id="p11".',
    viewport: 1440,
    entry: COMPOSE_WATCHLIST_ENTRY,
    apiRoutes: COMPOSE_WATCHLIST_API,
  },
  'compose-map': {
    id: 'compose-map',
    description: 'Full-page composition mount: AppShell + Masthead + MapPageView, populated fixture data, README screen 10 / dc.html p10.',
    viewport: 1440,
    entry: COMPOSE_MAP_ENTRY,
    needsCompiledCss: true,
    alias: {
      'next/navigation': `${SMOKE}stub-next-navigation-map.mjs`,
      '@/components/auth/AuthProvider': `${SMOKE}stub-auth-provider.mjs`,
      'leaflet/dist/leaflet.css': `${SMOKE}stub-empty-css.mjs`,
    },
    // The alias above keeps esbuild from needing an output path for leaflet's stylesheet; this
    // puts the REAL stylesheet back at runtime (see mountExtraCss above). leaflet is already an
    // app dependency, so this adds no new one and reaches no network.
    styleFiles: ['fsi-app/node_modules/leaflet/dist/leaflet.css'],
    apiRoutes: EMPTY_API,
  },
  'compose-community': {
    id: 'compose-community',
    description: 'Full-page composition mount: AppShell + Masthead + CommunityRooms, populated fixture data, README screen 12 / dc.html p12.',
    viewport: 1440,
    entry: COMPOSE_COMMUNITY_ENTRY,
    needsCompiledCss: true,
    alias: {
      'next/navigation': `${SMOKE}stub-next-navigation-community.mjs`,
      '@/components/auth/AuthProvider': `${SMOKE}stub-auth-provider.mjs`,
      '@/lib/supabase-browser': `${SMOKE}stub-supabase-browser.mjs`,
    },
    apiRoutes: EMPTY_API,
  },
  'compose-admin': {
    id: 'compose-admin',
    description: 'Full-page composition mount: AppShell + the real AdminDashboard (own internal Masthead), populated fixture data, README screen 13 / dc.html p13.',
    viewport: 1440,
    entry: COMPOSE_ADMIN_ENTRY,
    needsCompiledCss: true,
    alias: {
      'next/navigation': `${SMOKE}stub-next-navigation-admin.mjs`,
      '@/components/auth/AuthProvider': `${SMOKE}stub-auth-provider.mjs`,
    },
    apiRoutes: ADMIN_ISSUES_RAIL_API,
  },
  'compose-account': {
    id: 'compose-account',
    description: 'Full-page composition mount: AppShell + the real UserProfilePage (own internal Masthead), populated fixture data, README screen 14 / dc.html p14.',
    viewport: 1440,
    entry: COMPOSE_ACCOUNT_ENTRY,
    needsCompiledCss: true,
    alias: {
      'next/navigation': `${SMOKE}stub-next-navigation-account.mjs`,
      '@/components/auth/AuthProvider': `${SMOKE}stub-auth-provider.mjs`,
      '@/lib/supabase-browser': `${SMOKE}stub-supabase-browser-account.mjs`,
      '@/lib/workspace/profile': `${SMOKE}stub-workspace-profile-account.mjs`,
    },
    apiRoutes: [...ADMIN_ISSUES_RAIL_API, ...ACCOUNT_ORG_API],
  },
  'compose-settings': {
    id: 'compose-settings',
    description: 'Full-page composition mount: AppShell + the real SettingsPage (own internal Masthead + SectionIndex), populated fixture data, README screen 15 / dc.html p15.',
    viewport: 1440,
    entry: COMPOSE_SETTINGS_ENTRY,
    needsCompiledCss: true,
    alias: {
      'next/navigation': `${SMOKE}stub-next-navigation-settings.mjs`,
      '@/components/auth/AuthProvider': `${SMOKE}stub-auth-provider.mjs`,
      '@/lib/supabase-browser': `${SMOKE}stub-supabase-browser.mjs`,
    },
    // Playwright checks page.route handlers most-recently-registered-first, so the specific
    // /api/workspace/bootstrap mock (usePersonalStateHydration needs a real `personalState` array,
    // not EMPTY_API's bare `{}`) must be registered AFTER the EMPTY_API catch-all, not before.
    apiRoutes: [
      ...EMPTY_API,
      {
        urlGlob: '**/api/workspace/bootstrap',
        handler: (route) => route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ personalState: [], overrides: [] }),
        }),
      },
    ],
  },
  'compose-login': {
    id: 'compose-login',
    // Artboards 16/17 draw a 900px-tall frame with a vertically centred right column; the
    // capture is pinned to it so the evidence measures the artboard's own geometry rather than
    // the harness's default 1400px viewport (lane lists60, 2026-09-08).
    captureHeight: 900,
    description: 'Full-page composition mount: the real /login page (AuthFrame + AuthPanel), README screen 16 / dc.html p16.',
    viewport: 1440,
    entry: COMPOSE_LOGIN_ENTRY,
    needsCompiledCss: true,
    alias: {
      'next/navigation': `${SMOKE}stub-next-navigation-login.mjs`,
      '@/lib/supabase-browser': `${SMOKE}stub-supabase-browser-auth.mjs`,
    },
    apiRoutes: EMPTY_API,
  },
  'compose-signup': {
    id: 'compose-signup',
    // Artboards 16/17 draw a 900px-tall frame with a vertically centred right column; the
    // capture is pinned to it so the evidence measures the artboard's own geometry rather than
    // the harness's default 1400px viewport (lane lists60, 2026-09-08).
    captureHeight: 900,
    description: 'Full-page composition mount: the real /signup page (AuthFrame + AuthPanel), README screen 16 / dc.html p16.',
    viewport: 1440,
    entry: COMPOSE_SIGNUP_ENTRY,
    needsCompiledCss: true,
    alias: {
      'next/navigation': `${SMOKE}stub-next-navigation-signup.mjs`,
      '@/lib/supabase-browser': `${SMOKE}stub-supabase-browser-auth.mjs`,
    },
    apiRoutes: EMPTY_API,
  },
  'compose-onboarding': {
    id: 'compose-onboarding',
    // Artboards 16/17 draw a 900px-tall frame with a vertically centred right column; the
    // capture is pinned to it so the evidence measures the artboard's own geometry rather than
    // the harness's default 1400px viewport (lane lists60, 2026-09-08).
    captureHeight: 900,
    description: 'Full-page composition mount: the real OnboardingWizard (AuthFrame + OnboardingStepper), step 2 (its own default), README screen 17 / dc.html p17.',
    viewport: 1440,
    entry: COMPOSE_ONBOARDING_ENTRY,
    needsCompiledCss: true,
    alias: {
      'next/navigation': `${SMOKE}stub-next-navigation-onboarding.mjs`,
      '@/lib/supabase-browser': `${SMOKE}stub-supabase-browser-auth.mjs`,
    },
    apiRoutes: EMPTY_API,
  },
};
