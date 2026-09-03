// UX smoke spec: detail surfaces. Lane MOBILE-2, 2026-09-03, coordinator's round-2 probe (a
// same-origin iframe against the deployed production build, 2026-09-03) — `/regulations/g14`
// (RegulationDetailSurface.tsx) was the ONE detail page actually broken on production (breadcrumb
// clipped past the right edge, no scrolling ancestor, AND the last crumb — the full title, truncated
// — sitting directly above the real H1, read as the title doubling; the header's 36px side padding
// had no responsive escape at a 390px phone; ZERO `[data-guard-title]` anywhere on the page, so
// nothing was measured there before this lane). Fixed in that file (see its own module header for the
// root cause and fix); the other three detail surfaces (Operations/Research, already reasonably solid
// per PageMasthead.tsx's own responsive handling — read, out of this lane's write set — plus a
// `px-9`->responsive padding sweep fix and a `data-guard-title`/`data-guard-container` instrumentation
// pass this lane made while reading them; Market, entirely out of write set, see below) are mounted
// here for the SAME stress fixture so a regression on any of the four is caught the same way.
//
// Mounts the four REAL detail surfaces:
//   - RegulationDetailSurface.tsx        (src/components/regulations/) — fixed this lane.
//   - OperationsDetailSurface.tsx        (src/components/operations/) — padding/guard-title fixed.
//   - ResearchFindingDetailSurface.tsx   (src/components/research/) — padding/guard-title fixed.
//   - MarketSignalDetailSurface.tsx      (src/components/pages/) — OUTSIDE this lane's write set
//     (`src/components/pages/**` is not in the lane brief's write set, which lists
//     `src/components/{regulations,market,operations,research,home,dashboard,shared}/**`). Mounted
//     READ-ONLY here for coverage/regression-proof only; this spec does NOT edit it and any finding on
//     it is reported as NEEDS WRITE-SET EXPANSION rather than fixed in place.
//
// Each surface is mounted with a long official title (>80 chars, the length threshold
// RegulationDetailSurface itself uses to switch from the Anton poster face to the wrapping body
// face), a long breadcrumb group (Regulations only — the only one of the four with a breadcrumb; see
// this spec's own per-surface comments below for why the other three have none), and six section
// rows, at 375x812 and 1280x800. None of the four surfaces fetch on mount (confirmed by reading each
// file — MarketSignalDetailSurface's one client fetch is a debounced notes-save fired by user typing,
// never on mount), so no apiRoutes/route mocking is needed here.

import { MOBILE_VIEWPORT, DESKTOP_VIEWPORT } from './ux-harness.mjs';
import { measureUx, assertUxClean } from '../ux-assert.mjs';
import {
  bundleEntry,
  newSmokePage,
  mountBundle,
  measureGuard,
  detectOverflows,
  findPlaceholderLiterals,
} from './harness.mjs';
import { fullAppCss } from './smoke-fixtures.mjs';

const STYLE_INJECT = `
(() => {
  const style = document.createElement('style');
  style.textContent = ${JSON.stringify(fullAppCss())};
  document.head.appendChild(style);
})();
`;

const LONG = (n, word = 'extremely-long-official-instrument-title-token') =>
  Array.from({ length: n }, (_, i) => `${word}-${i}`).join(' ');

// >80 chars — RegulationDetailSurface's own threshold (r.title.length > 80) for switching from the
// Anton poster face to the wrapping body face; long enough to stress every surface's title wrap.
const LONG_TITLE = `Commission Delegated Regulation amending the rules for the monitoring of greenhouse gas emissions from offshore ships and the zero-rating of sustainable fuels ${LONG(4)}`;
const LONG_GROUP = 'Mexico · Diario Oficial de la Federación · Secretaría de Medio Ambiente y Recursos Naturales';

const EMPTY_MATRIX_ELIGIBILITY = {
  s3Eligible: true,
  s4Eligible: true,
  dimensions: [],
  resolvedRegionCodes: ['EU'],
};

function baseResource(overrides = {}) {
  return {
    id: 'detail-1',
    cat: 'ocean',
    sub: 'ocean freight',
    title: LONG_TITLE,
    url: 'https://example.com/source',
    note: 'Short regulation note for the card preview.',
    type: 'regulation',
    priority: 'HIGH',
    added: '2026-08-01',
    reasoning: 'High priority: binding disclosure obligations begin next fiscal year.',
    tags: ['ocean', 'compliance'],
    whatIsIt: 'Short summary of what this regulation is and why it applies to the workspace.',
    whyMatters: 'Binding disclosure obligations begin next fiscal year.',
    keyData: [],
    modes: ['ocean'],
    jurisdiction: 'EU',
    jurisdictionIso: ['EU'],
    sourceTier: 3,
    sourceName: 'EUR-Lex',
    sourceUrl: 'https://example.com/source',
    legalInstrument: LONG_TITLE,
    fullBrief:
      '## What it is\n\nA long-form regulatory brief paragraph describing the instrument in detail, ' +
      'covering scope, applicability, and the compliance chain the workspace sits in.\n\n' +
      '## Sources\n\n- EUR-Lex — primary source',
    recommendedActions: [
      { action: 'File the quarterly emissions disclosure.', owner: 'Compliance', timeframe: 'Q4 2026' },
      { action: 'Update the carrier contract addenda.', owner: 'Legal', timeframe: 'Q1 2027' },
    ],
    timeline: [
      { date: '2026-10-01', label: 'Consultation close', status: 'past' },
      { date: '2027-01-01', label: 'Entry into force', status: 'current' },
      { date: '2027-06-01', label: 'Compliance deadline', status: 'future' },
    ],
    agentIntegrityFlag: false,
    agentIntegrityPhrase: null,
    itemGrade: null,
    penaltyRange: '€500,000 or 2% of annual turnover',
    costMechanism: 'Fixed penalty per non-compliant shipment.',
    enforcementBody: 'National maritime authority',
    complianceDeadline: '2027-06-01',
    ...overrides,
  };
}

// Six sections per surface's own key vocabulary (see this file's header). Regulations' seven
// KNOWN_KEYS (SectionCard.tsx / RegulationSections.tsx) — six of the seven, plain prose content
// (parseRegulationSection falls back to a prose render when no special format is matched; a section
// that fails to parse is silently omitted per that component's own doctrine, not a crash). Operations
// and Research render `content_md` through GfmSection directly — plain markdown is sufficient.
function regulationSections() {
  const keys = ['3', '4', '8', '10', '11', '14'];
  return keys.map((section_key, i) => ({
    section_key,
    section_order: i,
    content_md: `A long-form paragraph of prose for section ${section_key}, stressing the section card's own heading wrap and body layout at both viewports.`,
    is_conditional: false,
    source_ids: [],
  }));
}

function operationsSections() {
  return ['1', '2', '3', '4', '5', '6'].map((section_key, i) => ({
    section_key,
    section_order: i,
    content_md: `Operations section ${section_key} body prose, long enough to stress wrap at a phone width.`,
    is_conditional: false,
    source_ids: [],
  }));
}

function researchSections() {
  return ['1', '2', '3', '4', '5', '6'].map((section_key, i) => ({
    section_key,
    section_order: i,
    content_md: `Research section ${section_key} body prose, long enough to stress wrap at a phone width.`,
    is_conditional: false,
    source_ids: [],
  }));
}

// ── Regulations ─────────────────────────────────────────────────────────────────────────────────
const REGULATION_ENTRY = `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { RegulationDetailSurface } from '@/components/regulations/RegulationDetailSurface';

let root = null;
window.__mount = (props) => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(React.createElement(RegulationDetailSurface, props));
};
`;

const REGULATION_STATES = [
  {
    label: 'long-title-long-breadcrumb-six-sections',
    props: {
      resource: baseResource(),
      changelog: [],
      dispute: null,
      supersessions: [],
      connections: [],
      relevance: null,
      resourceLookup: {},
      sections: regulationSections(),
      groupLabel: LONG_GROUP,
      deck: 'EUR-Lex · adopted 16 October 2024 · in force',
      initialOwner: null,
      upcomingObligations: null,
    },
    expectTitles: 1,
  },
];

// ── Operations ──────────────────────────────────────────────────────────────────────────────────
const OPERATIONS_ENTRY = `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { OperationsDetailSurface } from '@/components/operations/OperationsDetailSurface';

let root = null;
window.__mount = (props) => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(React.createElement(OperationsDetailSurface, props));
};
`;

const OPERATIONS_STATES = [
  {
    // OperationsDetailSurface has NO breadcrumb of its own — the title (r.title, via
    // EditorialMasthead -> PageMasthead.tsx) is rendered by the page (src/app/operations/[slug]/
    // page.tsx), outside this component; see this file's own module header. This state stresses
    // what IS inside the write set: the six section cards + their own headings.
    label: 'six-sections',
    props: {
      resource: baseResource({ id: 'ops-1' }),
      related: [],
      relatedReason: 'none',
      sections: operationsSections(),
      matrixEligibility: EMPTY_MATRIX_ELIGIBILITY,
      sourceFetchStatus: null,
      supersessions: [],
      connections: [],
      relevance: null,
      resourceLookup: {},
    },
    expectTitles: 6, // one data-guard-title per OperationsSectionCard heading
  },
];

// ── Research ────────────────────────────────────────────────────────────────────────────────────
const RESEARCH_ENTRY = `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ResearchFindingDetailSurface } from '@/components/research/ResearchFindingDetailSurface';

let root = null;
window.__mount = (props) => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(React.createElement(ResearchFindingDetailSurface, props));
};
`;

const RESEARCH_STATES = [
  {
    // Same shape as Operations: no breadcrumb inside this component (see module header).
    label: 'six-sections',
    props: {
      resource: baseResource({ id: 'res-1' }),
      related: [],
      relatedReason: 'none',
      sections: researchSections(),
      supersessions: [],
      connections: [],
      relevance: null,
      resourceLookup: {},
      themeBrief: undefined,
    },
    expectTitles: 6,
  },
];

// ── Market (read-only mount — src/components/pages/, outside this lane's write set) ───────────────
const MARKET_ENTRY = `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MarketSignalDetailSurface } from '@/components/pages/MarketSignalDetailSurface';

let root = null;
window.__mount = (props) => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(React.createElement(MarketSignalDetailSurface, props));
};
`;

const MARKET_STATES = [
  {
    label: 'long-title-long-breadcrumb',
    props: {
      resource: baseResource({ id: 'mkt-1', signalBand: 'price' }),
      relatedPool: [],
      sections: [],
      convergence: null,
      priceBoard: [],
      carbonFactors: [],
      groupLabel: LONG_GROUP,
      deck: 'U.S. EIA · published May 9, 2026',
      initialNote: '',
      supersessions: [],
      connections: [],
      relevance: null,
      resourceLookup: {},
    },
    // Not asserted — MarketSignalDetailSurface.tsx is outside this lane's write set and was not
    // audited for a data-guard-title on its own H1 (that would be a write-set-expansion item, not a
    // guaranteed pass); the state still mounts and is measured for overflow/law-2, just not titles.
  },
];

// Bespoke runner (same shape as regulations-rows-smoke.mjs's runLedgerSpec) rather than the generic
// ux-harness.mjs `runUxSpec`, because two of this spec's four surfaces carry DISCLOSED, CONFIRMED
// false positives / out-of-write-set findings runUxSpec's unconditional assertGuardClean/assertUxClean
// would fail on:
//   - `knownSafePlaceholders` — static field-label text ("Type": AtAGlanceCard's own row label,
//     RegulationDetailSurface.tsx; "Source": the source-attribution label, Operations/Research) that
//     exact-matches the placeholder-literal scanner's HEADER_LITERALS set (the SAME false-positive
//     class regulations-rows-smoke.mjs's own KNOWN_SAFE_PLACEHOLDER_LITERALS documents for "Action") —
//     confirmed by reading: real, working-as-designed navigational/label copy, never a row's own
//     fabricated or omitted data.
//   - `skipSmallTargetSubstrings` — interactive targets belonging to a component OUTSIDE this lane's
//     write set (`@/components/ui/AiPromptBar`, mounted by RegulationDetailSurface but not editable
//     here) or to MarketSignalDetailSurface.tsx itself (src/components/pages/, outside the write set
//     entirely — see this file's own header). Named explicitly, not a blanket exclusion, so a NEW
//     small-target regression inside a write-set file still fails this spec.
async function runDetailSpec(browser, { name, entry, states, knownSafePlaceholders = [], skipSmallTargetSubstrings = [], skipAllAssertions = false }) {
  const failures = [];
  let checks = 0;
  const bundleJs = await bundleEntry(entry);
  for (const vp of [MOBILE_VIEWPORT, DESKTOP_VIEWPORT]) {
    for (const state of states) {
      const label = `${name}:${state.label}@${vp.width}`;
      const page = await newSmokePage(browser, { apiRoutes: state.apiRoutes || [] });
      try {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await mountBundle(page, bundleJs, '__mount', state.props);
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
        const guard = await measureGuard(page);
        const ux = await measureUx(page);
        checks += 1;
        if (!skipAllAssertions) {
          const overflows = detectOverflows(guard.measurements);
          if (overflows.length > 0) {
            failures.push(`${label}: horizontal overflow — ${overflows.map((o) => `${o.name} +${o.overflowBy}px`).join(', ')}`);
          }
          const placeholders = findPlaceholderLiterals(guard.texts).filter((p) => !knownSafePlaceholders.includes(p));
          if (placeholders.length > 0) {
            failures.push(`${label}: placeholder literal rendered — ${placeholders.join(', ')}`);
          }
          const uxFiltered = {
            ...ux,
            targets: ux.targets.filter((t) => !skipSmallTargetSubstrings.some((s) => t.name.includes(s))),
          };
          failures.push(...assertUxClean(label, uxFiltered));
          if (state.expectTitles && ux.titles.length < state.expectTitles) {
            failures.push(`${label}: expected >=${state.expectTitles} [data-guard-title] element(s), found ${ux.titles.length}`);
          }
        }
      } finally {
        await page.close();
      }
    }
  }
  return { checks, failures };
}

// AiPromptBar (@/components/ui/AiPromptBar) was excluded by the lane (outside its write set; its
// controls were 17-21px tall). The coordinator sized it to the floor at integration (input and Ask
// 44px, chips 36px with an 8px gap), so it is measured like everything else now.
const AI_PROMPT_BAR_TARGETS = [];

export async function runSmoke(browser) {
  const results = await Promise.all([
    runDetailSpec(browser, {
      name: 'detail-regulations',
      entry: REGULATION_ENTRY,
      states: REGULATION_STATES,
      knownSafePlaceholders: ['Type'],
      skipSmallTargetSubstrings: AI_PROMPT_BAR_TARGETS,
    }),
    runDetailSpec(browser, {
      name: 'detail-operations',
      entry: OPERATIONS_ENTRY,
      states: OPERATIONS_STATES,
      knownSafePlaceholders: ['Source'],
    }),
    runDetailSpec(browser, {
      name: 'detail-research',
      entry: RESEARCH_ENTRY,
      states: RESEARCH_STATES,
      knownSafePlaceholders: ['Source'],
    }),
    // Market: MarketSignalDetailSurface.tsx was outside the lane's write set; the coordinator brought its
    // header to the same fix (crumb wrap, last crumb omitted at <=640, pad token, data-guard-title on the
    // H1, 44px tabs) at integration, so it is asserted like the other three.
    runDetailSpec(browser, {
      name: 'detail-market',
      entry: MARKET_ENTRY,
      states: MARKET_STATES,
      knownSafePlaceholders: ['Severity', 'Status'], // column headers of the signal's own table, not data
    }),
  ]);
  return {
    checks: results.reduce((n, r) => n + r.checks, 0),
    failures: results.flatMap((r) => r.failures),
  };
}
