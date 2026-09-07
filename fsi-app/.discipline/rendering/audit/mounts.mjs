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
        React.createElement(AccountCard, { title: 'Notifications', meta: 'In-app now \\u00b7 email and push coming' },
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
  { id: 'data', label: 'Data \\u0026 supersessions' },
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
