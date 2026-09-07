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

// ── Operations region x dimension matrix (real component, real prop shape) ────────────────────
// Reproduces the EXACT dimensions list OperationsLedger.tsx passes in production
// (SOURCED_DIMENSIONS: DIMENSIONS filtered to exclude "regulatory") so the matrix's rendered row
// count is measured against the same 6-dimension DIMENSIONS array the operator's ruling 3.3 names,
// not an audit-invented list.
const OPSMATRIX_ENTRY = `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { RegionDimensionMatrix } from '@/components/operations/RegionDimensionMatrix';

const regions = [
  { key: 'EU', label: 'European Union' },
  { key: 'US', label: 'United States' },
];

// Verbatim copy of OperationsLedger.tsx's own DIMENSIONS constant (all 6) and its
// SOURCED_DIMENSIONS derivation (filters out "regulatory") -- the audit reproduces the production
// data shape exactly rather than asserting an invented one.
const DIMENSIONS = [
  { num: 1, key: 'regulatory', db: 'regulatory_feasibility', name: 'Regulatory feasibility' },
  { num: 2, key: 'resources', db: 'regional_resources', name: 'Regional resource availability' },
  { num: 3, key: 'labor', db: 'labor_markets', name: 'Labor markets' },
  { num: 4, key: 'materials', db: 'materials_sourcing', name: 'Materials sourcing' },
  { num: 5, key: 'infrastructure', db: 'infrastructure', name: 'Infrastructure capacity' },
  { num: 6, key: 'cost', db: 'operational_cost', name: 'Operational cost data' },
];
const SOURCED_DIMENSIONS = DIMENSIONS.filter((d) => d.key !== 'regulatory');

let root = null;
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(
    React.createElement('div', { style: { width: 900 }, 'data-audit': 'ops-matrix' },
      React.createElement(RegionDimensionMatrix, {
        regions,
        dimensions: SOURCED_DIMENSIONS.map((d) => ({ key: d.key, db: d.db, name: d.name })),
        facts: [],
        coverageRows: [],
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
  'ops-matrix': {
    id: 'ops-matrix',
    description: 'RegionDimensionMatrix, fed OperationsLedger.tsx\'s own SOURCED_DIMENSIONS (5 of the real 6 DIMENSIONS).',
    viewport: 1440,
    entry: OPSMATRIX_ENTRY,
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
};
