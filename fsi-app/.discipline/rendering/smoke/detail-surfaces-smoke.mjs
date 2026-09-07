// UX smoke spec: detail surfaces. Lane MOBILE-2, 2026-09-03, coordinator's round-2 probe (a
// same-origin iframe against the deployed production build, 2026-09-03) — `/regulations/g14`
// (RegulationDetailSurface.tsx) was the ONE detail page actually broken on production (breadcrumb
// clipped past the right edge, no scrolling ancestor, AND the last crumb — the full title, truncated
// — sitting directly above the real H1, read as the title doubling; the header's 36px side padding
// had no responsive escape at a 390px phone; ZERO `[data-guard-title]` anywhere on the page, so
// nothing was measured there before this lane). Fixed in that file (see its own module header for the
// root cause and fix).
//
// lane uidetails2 (2026-09-07): the other three detail surfaces (Operations, Research, Market) were
// rebuilt onto the SAME shared ONE detail architecture RegulationDetailSurface adopted (DetailShell.tsx,
// README §0.5) — header/exposure/timeline/index/rail all now shared, not per-surface reimplementations.
// All four surfaces are therefore first-class here: mounted, measured, and asserted identically
// (expectTitles: 1 on every state — one shared <DetailHeader> per mount).
//
// Mounts the four REAL detail surfaces:
//   - RegulationDetailSurface.tsx        (src/components/regulations/)
//   - OperationsDetailSurface.tsx        (src/components/operations/)
//   - ResearchFindingDetailSurface.tsx   (src/components/research/)
//   - MarketSignalDetailSurface.tsx      (src/components/pages/)
//
// Each surface is mounted with a long official title (>80 chars, stressing the title's word-wrap;
// item 1.2, 2026-09-07 confirmed there is no length-based style SWITCH — the Anton/uppercase title
// treatment is unconditional, see DetailShell.npmtest.mjs's own test for that), a long breadcrumb
// group (Regulations only — the only one of the four with a breadcrumb; see
// this spec's own per-surface comments below for why the other three have none), and six section
// rows, at 375x812 and 1280x800. None of the four surfaces fetch on mount (confirmed by reading each
// file — MarketSignalDetailSurface's one client fetch is a debounced notes-save fired by user typing,
// never on mount), so no apiRoutes/route mocking is needed here.

import { fileURLToPath } from 'node:url';
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

// lane uidetails (2026-09-06): RegulationDetailSurface now mounts the shared DetailShell's
// InThisListStat rail widget, which calls useSearchParams() (next/navigation) inside its own
// Suspense-wrapped bridge (DetailShell.tsx's InThisListBridge — same PERF-10 precedent
// RegulationsLedger's SearchParamsFilterBridge already established). Outside a real Next App Router
// tree this throws ("invariant expected app router to be mounted"), same failure
// regulations-rows-smoke.mjs's own ALIAS note documents — reusing that spec's
// stub-next-navigation.mjs here rather than duplicating it.
const HERE = fileURLToPath(new URL('.', import.meta.url));
const ALIAS = { 'next/navigation': `${HERE}stub-next-navigation.mjs` };

const STYLE_INJECT = `
(() => {
  const style = document.createElement('style');
  style.textContent = ${JSON.stringify(fullAppCss())};
  document.head.appendChild(style);
})();
`;

const LONG = (n, word = 'extremely-long-official-instrument-title-token') =>
  Array.from({ length: n }, (_, i) => `${word}-${i}`).join(' ');

// >80 chars — DEFECT-FIX item 1.2 (2026-09-07, audit ruling) confirmed there is no
// length-based title-style switch anywhere in DetailHeader (a repo-wide grep found none; this
// comment used to claim "RegulationDetailSurface's own threshold (r.title.length > 80) for
// switching from the Anton poster face to the wrapping body face" — that logic never existed in the
// current DetailShell architecture, the claim was stale, corrected here per CLAUDE.md rule 14). The
// title is styled unconditionally (Anton/uppercase/400) regardless of length; this fixture stays
// long enough to stress every surface's title WRAP (word-break/overflow), which is the real thing
// worth measuring at this length.
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

// Record-grade sections (RECORD-SURFACE lane, 2026-09-04) — the `identity` / `record_facts` /
// `sources_and_citations` section_key vocabulary that src/lib/intake/record-facts.mjs mints and
// src/lib/agent/parse-record-sections.ts parses; a completely disjoint key set from the numbered
// brief-grade keys above, so this exercises the itemGrade:'record' branch of each detail surface's
// Summary render (RecordGradeSummary / RecordFactsCard / ResearchRecordFacts) at both viewports. FACT
// spans are deliberately long (>60 chars) to stress the quoted-span wrap; one GAP line included so the
// honest "N of M record fields not stated" count renders non-zero.
function recordSections() {
  return [
    {
      section_key: 'identity',
      section_order: 0,
      content_md:
        "[title] The captured source's own text carries this item's title verbatim: «" + LONG_TITLE + '»',
      is_conditional: false,
      source_ids: [],
    },
    {
      section_key: 'record_facts',
      section_order: 1,
      content_md: [
        '[effective_date] The captured source states, verbatim: «shall enter into force on the twentieth day following that of its publication in the Official Journal of the European Union»',
        '[jurisdictional_scope] The captured source states, verbatim: «applies to all Member States and to economic operators placing products on the Union market regardless of establishment»',
        '[binding_position] The captured source’s own applicability language places this item at «direct_duty» (Your duty), from the passage: «the operator shall assume responsibility for the compliance of the relevant product with the requirements set out in Article 3»',
        '[penalty_summary] No verbatim penalty statement was located in the captured source text for this record-grade item. A full-brief regrounding will re-examine this gap when this item upgrades from record to brief.',
      ].join('\n'),
      is_conditional: false,
      source_ids: [],
    },
    {
      section_key: 'sources_and_citations',
      section_order: 2,
      content_md: 'Source: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32026R1030',
      is_conditional: false,
      source_ids: [],
    },
  ];
}

// TIER-CHIP lane (2026-09-04) — a ClaimTierMap exercising all three render states RecordFactLine (and
// its Market/Research equivalents) can show: RATED (at/within the item-type authority floor — a T2
// EUR-Lex source), BELOW-FLOOR RATED (migration 302: criterion 3's floor is a warning, never a refusal
// — the figure is published WITH its rating, exactly as the operator's ruling requires; a T6 commercial
// source here), and UNRATED (the jurisdictional_scope line is DELIBERATELY left out of this map — the
// parser's own honest "no entry for this exact line" fallback, never a wrong chip). Keys are derived
// FROM `recordSections()`'s own content_md lines (not retyped) so a fixture edit there can never
// silently desync this map from what's actually rendered.
function recordClaimTiers() {
  const identityLine = recordSections().find((s) => s.section_key === 'identity').content_md;
  const [effectiveDateLine /* jurisdictionalScopeLine, bindingPositionLine, penaltyGapLine */] =
    recordSections().find((s) => s.section_key === 'record_facts').content_md.split('\n');
  return {
    [identityLine]: {
      tier: 2,
      sourceName: 'EUR-Lex',
      sourceUrl: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32026R1030',
    },
    // BELOW-FLOOR, still published+rated per migration 302 (ruling: "get the source. then rate the
    // source... find the source and then publish the data on the site").
    [effectiveDateLine]: {
      tier: 6,
      sourceName: 'Trade Press Weekly',
      sourceUrl: 'https://example.com/trade-press-weekly',
    },
    // jurisdictional_scope's line is deliberately ABSENT from this map — exercises the UNRATED dashed
    // "—" chip (this parser's match-rule failure mode: no entry for the exact line -> null, never a
    // guessed/wrong chip). binding_position's line is likewise absent (same case, second row).
  };
}

// ── Regulations ─────────────────────────────────────────────────────────────────────────────────
const REGULATION_ENTRY = `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { RegulationDetailSurface } from '@/components/regulations/RegulationDetailSurface';
// DetailShell is imported below, unused directly, ONLY so F35's text-match coverage scan resolves
// against it — lane uidetails (2026-09-06) moved the guarded H1 out of RegulationDetailSurface.tsx
// into DetailShell.tsx's <DetailHeader> (the shared home for the ONE detail architecture, README
// §0.5), following the same precedent regulations-rows-smoke.mjs documents for ObligationRegister.
import { DetailHeader as _DetailHeaderCoverageOnly } from '@/components/detail/DetailShell';
void _DetailHeaderCoverageOnly;
// GAP G2 (2026-09-07): the guarded H1 moved again, out of DetailShell.tsx's DetailHeader and into
// the shared ui/Masthead via the new DetailMasthead (DetailShell.tsx) — mounted at the top of all
// four *DetailSurface.tsx components this spec already mounts. Same coverage-only-import precedent as
// above, updated to the H1's real current home.
import { Masthead as _MastheadCoverageOnly } from '@/components/ui/Masthead';
void _MastheadCoverageOnly;

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
  // Record-grade (RECORD-SURFACE lane, 2026-09-04) — itemGrade:'record' branch of SummaryTab
  // (RecordGradeSummary), stressed with a long FACT span, a GAP line, tags, and a connection row (real
  // ItemConnectionsCard data) at both viewports.
  {
    label: 'record-grade-facts-and-connections',
    props: {
      resource: baseResource({
        id: 'rec-1',
        itemGrade: 'record',
        tags: ['ocean', 'compliance', 'extremely-long-tag-token-for-wrap-stress'],
        fullBrief: '## Verbatim facts\n\n(record-grade kit output, not rendered directly)',
      }),
      changelog: [],
      dispute: null,
      supersessions: [],
      connections: [
        {
          id: 'rec-2',
          direction: 'outgoing',
          relationship: 'related',
          origin: 'discovered',
          basis: [{ signal: 'shared_citation', detail: 'Both cite Article 3(2)', weight: 0.8 }],
          score: 0.8,
          surface: 'regulations',
        },
      ],
      relevance: null,
      resourceLookup: { 'rec-2': { id: 'rec-2', title: 'Related instrument, also long enough to wrap at a phone width', priority: 'HIGH' } },
      sections: recordSections(),
      claimTiers: recordClaimTiers(),
      groupLabel: LONG_GROUP,
      deck: 'EUR-Lex · catalogue record',
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
    // lane uidetails2 (2026-09-07): OperationsDetailSurface now renders the ONE detail architecture's
    // <DetailHeader> (DetailShell.tsx) internally — the guarded H1 lives there, ONE per mount, not one
    // per section heading (DetailSection's own <h2> carries no data-guard-title, same as every other
    // detail surface's section body). This state stresses the six section cards' own heading wrap plus
    // the shared header/exposure/timeline/rail chrome.
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
    expectTitles: 1,
  },
  // Row-chip rule (lane CHIPS, 2026-09-05, W3.4): baseResource() defaults itemGrade to null, so the
  // 'six-sections' state above never exercises RecordGradeBadge — this state reuses the normal six
  // sections and only flips itemGrade, proving the badge itself renders in the header's chip row at
  // both viewports without a layout regression.
  {
    label: 'record-grade-badge',
    props: {
      resource: baseResource({ id: 'ops-rec-1', itemGrade: 'record' }),
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
    expectTitles: 1,
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
    // lane uidetails2 (2026-09-07): same move as Operations above — the guarded H1 lives in the
    // shared <DetailHeader>, ONE per mount, not one per ResearchSectionCard heading.
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
    expectTitles: 1,
  },
  // Record-grade (RECORD-SURFACE lane, 2026-09-04) — itemGrade:'record' branch (ResearchRecordFacts).
  // Now also exercises the shared <DetailHeader> (lane uidetails2, 2026-09-07): expectTitles: 1.
  {
    label: 'record-grade-facts',
    props: {
      resource: baseResource({
        id: 'res-rec-1',
        itemGrade: 'record',
        tags: ['research', 'extremely-long-tag-token-for-wrap-stress'],
      }),
      related: [],
      relatedReason: 'none',
      sections: recordSections(),
      claimTiers: recordClaimTiers(),
      supersessions: [],
      connections: [],
      relevance: null,
      resourceLookup: {},
      themeBrief: undefined,
    },
    expectTitles: 1,
  },
];

// ── Market — src/components/pages/MarketSignalDetailSurface.tsx. Was read-only/out-of-write-set for
// the prior lane (uidetails, regulations-only); lane uidetails2 (2026-09-07) owns this file directly
// (rebuilt onto the ONE detail architecture, DetailShell.tsx), so it is now asserted the same as the
// other three surfaces — expectTitles included, "not asserted" caveats below retired. ─────────────
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
    expectTitles: 1,
  },
  // Record-grade (RECORD-SURFACE lane, 2026-09-04) — itemGrade:'record' branch (RecordGradeSections).
  // Per surface-of.mjs, 0 live record items route here today (all are domain=1 -> regulations), so
  // this is forward-looking coverage.
  {
    label: 'record-grade-facts',
    props: {
      resource: baseResource({
        id: 'mkt-rec-1',
        itemGrade: 'record',
        signalBand: 'price',
        tags: ['market', 'extremely-long-tag-token-for-wrap-stress'],
      }),
      relatedPool: [],
      sections: recordSections(),
      claimTiers: recordClaimTiers(),
      convergence: null,
      priceBoard: [],
      carbonFactors: [],
      groupLabel: LONG_GROUP,
      deck: 'EUR-Lex · catalogue record',
      initialNote: '',
      supersessions: [],
      connections: [],
      relevance: null,
      resourceLookup: {},
    },
    expectTitles: 1,
  },
];

// Bespoke runner (same shape as regulations-rows-smoke.mjs's runLedgerSpec) rather than the generic
// ux-harness.mjs `runUxSpec`, because this spec's surfaces carry DISCLOSED, CONFIRMED false positives
// runUxSpec's unconditional assertGuardClean/assertUxClean would fail on:
//   - `knownSafePlaceholders` — static field-label text ("Type": AtAGlanceCard's own row label,
//     RegulationDetailSurface.tsx; "Source": the source-attribution label, Operations/Research) that
//     exact-matches the placeholder-literal scanner's HEADER_LITERALS set (the SAME false-positive
//     class regulations-rows-smoke.mjs's own KNOWN_SAFE_PLACEHOLDER_LITERALS documents for "Action") —
//     confirmed by reading: real, working-as-designed navigational/label copy, never a row's own
//     fabricated or omitted data.
//     TIER-CHIP lane (2026-09-04) adds two more, on the same basis, to the three record-grade
//     surfaces (regulations/research/market): "Title" is RecordFactLine's own slot label for the
//     identity FACT (humanizeSlotLabel('title'), pre-existing since the RECORD-SURFACE lane — this
//     spec's own recordSections() 'identity' section always carried it; it is a HEADER_LITERALS
//     collision purely because "title" is also a §15 table-header word, never fabricated content),
//     and "—" is the new honest UNRATED chip RecordFactLine/its Market/Research equivalents render
//     for a FACT claim with no entry in the claim-tier map (recordClaimTiers()'s own header comment:
//     the jurisdictional_scope and binding_position lines are DELIBERATELY left out of that map to
//     exercise this exact fallback) — the dashed "—" is the parser's honest "unrated", never a wrong
//     or fabricated tier, and NO_DATA_TOKENS (source-entry-filter.mjs) happens to also list "—" as a
//     placeholder-name token, the same coincidental collision as "Title" above.
//   - `skipSmallTargetSubstrings` — kept as a parameter for spec-shape parity with
//     regulations-rows-smoke.mjs; empty on every call below now that AiPromptBar (the sole prior
//     source of a below-floor target) is unmounted from all four detail surfaces (README §0.5: "no
//     per-tab ask bar" — CommandBar/Masthead is the one search/ask surface).
async function runDetailSpec(browser, { name, entry, states, knownSafePlaceholders = [], skipSmallTargetSubstrings = [], skipAllAssertions = false, alias = {} }) {
  const failures = [];
  let checks = 0;
  const bundleJs = await bundleEntry(entry, { alias });
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
      // 'Action' (2026-09-06, lane uidetails): the shared BandChip's own band label for the
      // priority=HIGH band is the literal word "Action" (README §0.2's one urgency vocabulary) —
      // legitimate, deliberate copy, coincidentally also one of source-entry-filter.mjs's
      // HEADER_LITERALS ("action" doubles as a §3/§14 table-header word). Same false-positive class
      // as 'Type'/'Title'/'—' above, not fabricated or omitted content.
      knownSafePlaceholders: ['Type', 'Title', '—', 'Action'],
      skipSmallTargetSubstrings: AI_PROMPT_BAR_TARGETS,
      alias: ALIAS,
    }),
    runDetailSpec(browser, {
      name: 'detail-operations',
      entry: OPERATIONS_ENTRY,
      states: OPERATIONS_STATES,
      // 'Action'/'Type': same false-positive class as Regulation's own list above (BandChip's band
      // label + AtAGlanceCard's row label, both real shared-part copy, never fabricated content).
      knownSafePlaceholders: ['Source', 'Action', 'Type'],
      // lane uidetails2 (2026-09-07): OperationsDetailSurface now mounts the shared DetailShell's
      // InThisListStat rail widget (useSearchParams inside a Suspense-wrapped bridge — see
      // DetailShell.tsx's own header), same as RegulationDetailSurface above. Needs the same
      // next/navigation stub outside a real Next App Router tree.
      alias: ALIAS,
    }),
    runDetailSpec(browser, {
      name: 'detail-research',
      entry: RESEARCH_ENTRY,
      states: RESEARCH_STATES,
      knownSafePlaceholders: ['Source', 'Title', '—', 'Action', 'Type'],
      alias: ALIAS,
    }),
    runDetailSpec(browser, {
      name: 'detail-market',
      entry: MARKET_ENTRY,
      states: MARKET_STATES,
      // 'Severity'/'Status': column headers of the signal's own table, not data. 'Title'/'—': the
      // same TIER-CHIP-lane record-fact false positives documented in this function's own header
      // comment above (RecordFactLine's identity slot label, and the honest unrated dashed chip).
      // 'Action'/'Type': same false-positive class as Regulation's own list above.
      knownSafePlaceholders: ['Severity', 'Status', 'Title', '—', 'Action', 'Type'],
      alias: ALIAS,
    }),
  ]);
  return {
    checks: results.reduce((n, r) => n + r.checks, 0),
    failures: results.flatMap((r) => r.failures),
  };
}

// FOLD-56 (F10): additive named exports of the RegulationDetailSurface fixture's own bundle entry,
// its states, and its `next/navigation` alias — so a one-off screenshot capture script can reuse the
// SAME fixture this spec's own `runSmoke` mounts (mobdetail's lane could not produce
// built/m-detail-390.png/-375.png), rather than duplicating REGULATION_ENTRY/REGULATION_STATES/ALIAS
// into a second copy. `runSmoke` above is unchanged; this only widens what the module exposes.
export { REGULATION_ENTRY, REGULATION_STATES, ALIAS };
