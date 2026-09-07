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

// ── Operations region x dimension matrix (lane uxaudit-c, 2026-09-07) ──────────────────────────
// Reproduces OperationsLedger.tsx's own DIMENSIONS constant (all 6, D1-D6) and its
// SOURCED_DIMENSIONS derivation VERBATIM (copied here, not re-derived) so the row count measured
// is the same one a real page render produces — confirmed by reading OperationsLedger.tsx
// (DIMENSIONS at ~line 84, SOURCED_DIMENSIONS = DIMENSIONS.filter(d => d.key !== 'regulatory') at
// line 93, passed to RegionDimensionMatrix's dimensions prop at line 346) this session, not a
// harness invention.
const OPSMATRIX_ENTRY = `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { RegionDimensionMatrix } from '@/components/operations/RegionDimensionMatrix';

const regions = [
  { key: 'EU', label: 'European Union' },
  { key: 'US', label: 'United States' },
];

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
  'ops-matrix': {
    id: 'ops-matrix',
    description: 'RegionDimensionMatrix fed OperationsLedger.tsx\'s own SOURCED_DIMENSIONS (verbatim reproduction).',
    viewport: 1440,
    entry: OPSMATRIX_ENTRY,
  },
  relevancebadge: {
    id: 'relevancebadge',
    description: 'RelevanceBadge ("HIGH RELEVANCE" chip) — presence-only per operator ruling 3.4 (DO NOT TOUCH).',
    viewport: 1440,
    entry: RELEVANCEBADGE_ENTRY,
  },
};
