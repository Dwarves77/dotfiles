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
