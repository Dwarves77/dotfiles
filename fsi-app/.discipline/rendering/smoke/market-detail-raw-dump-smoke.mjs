// UX smoke spec: Market detail raw-dump guard (workstream 16, lane W2-D, 2026-09-29).
//
// WHY THIS EXISTS: build-plan-2026-09-25.md workstream 16, "A raw text/JSON-like dump renders
// mid-page on the Market detail page, live and on branch", [HYPOTHESIS] until a lane reproduces
// it. Live repro was blocked this lane: /market redirects to a sign-in gate for an unauthenticated
// Playwright session and this lane holds no test credentials (R14, no data writes, and entering
// credentials this lane does not own is out of scope, see session-log.d/2026-09-29-w2d.md). Code
// review of the write-set files (MarketSignalDetailSurface.tsx read in full, market/[slug]/page.tsx
// read in full) found no `JSON.stringify`/template-literal-over-object render path, see the same
// session-log entry. This spec is the standing regression guard the dispatch still required: it
// mounts the REAL MarketSignalDetailSurface (harness.mjs's esbuild+Playwright mount, same pattern
// as detail-surfaces-smoke.mjs) and walks every rendered text node for a JSON-shaped run
// (`"key":` pairs or a bracket/brace cluster). Proven red-then-green below: a deliberately corrupt
// `content_md` fixture (simulating a bad agent write into intelligence_item_sections) DOES trip the
// detector, so the guard is not vacuous; the normal fixtures render clean.
//
// Registered in ux-smoke-specs.mjs (coordinator ruling, 2026-09-29: write set extended to that one
// file for this registration line, rule 15, an unregistered spec is run by nothing).
//
// Legs 7-8 added (lane L12, 2026-10-03, coordinator ruling): a DIFFERENT, adjacent defect found by
// this lane's own executed render while verifying the carbon-cost-per-FEU dispatch - the whole
// "Substantive findings" section (id="findings", MarketSignalDetailSurface.tsx) was wrapped in a bare
// `!isRecord` check, so a record-grade item never showed its carbon-intensity figure even when the
// SAME factors/jurisdictionIso resolved cleanly for a non-record item, and the section-index nav kept
// advertising "S2 Findings" with nothing behind it. Fixed via `showFindings = !isRecord ||
// carbonOverlayResolved`. Reuses this file's mounting infrastructure (MARKET_ENTRY, bundleEntry,
// newSmokePage, mountBundle) rather than building a second one - same component, same harness,
// different assertion.

import { fileURLToPath } from 'node:url';
import { bundleEntry, newSmokePage, mountBundle } from './harness.mjs';

// Same alias detail-surfaces-smoke.mjs uses for every detail surface: DetailShell's
// InThisListBridge/InThisListNeighborsBridge and DetailMastheadBreadcrumb call useSearchParams()
// (next/navigation), which throws "Cannot read properties of null (reading 'get')" outside a real
// Next App Router tree, confirmed by running this spec once without the alias (every bridge threw,
// and BOTH the clean and corrupt fixture legs rendered a blank tree, making leg 2 pass for the wrong
// reason: nothing rendered, not "the detector found no dump"). See this file's own header for the
// red-then-green fix that followed.
const HERE = fileURLToPath(new URL('.', import.meta.url));
const ALIAS = { 'next/navigation': `${HERE}stub-next-navigation.mjs` };

const MARKET_ENTRY = `
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

// Rule 13 flag 1 (coordinator, 2026-09-30): RegulationDetailSurface.tsx carried the identical
// unguarded `{depth === "full" && r.fullBrief && <GfmSection .../>}` pattern this lane fixed in
// Market. Fixed the same way (`!isRecord` guard, src/components/regulations/RegulationDetailSurface.tsx),
// extended here so leg 5 below attacks that surface too, not just Market's.
const REGULATION_ENTRY = `
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

function baseResource(overrides = {}) {
  return {
    id: 'dump-guard-1',
    cat: 'ocean',
    sub: 'ocean freight',
    title: 'EU carbon price signal for containerised ocean freight',
    url: 'https://example.com/source',
    note: 'Short market note for the card preview.',
    type: 'market_signal',
    priority: 'HIGH',
    added: '2026-08-01',
    reasoning: 'High priority: weekly carbon price movement affects Q4 ocean quotes.',
    tags: ['ocean', 'carbon'],
    whatIsIt: 'Short summary of the signal.',
    whyMatters: 'Weekly carbon price movement affects Q4 ocean quotes.',
    keyData: [],
    modes: ['ocean'],
    jurisdiction: 'EU',
    jurisdictionIso: ['EU'],
    sourceTier: 3,
    sourceName: 'ICE Futures Europe',
    sourceUrl: 'https://example.com/source',
    signalBand: 'price',
    agentIntegrityFlag: false,
    agentIntegrityPhrase: null,
    itemGrade: null,
    ...overrides,
  };
}

/** A real signal brief section: prose, never JSON-shaped. */
function cleanSections() {
  return [
    {
      section_key: '1',
      section_order: 0,
      content_md: 'FACT: the weekly EUA settlement rose 4.2% week over week. *Source: ICE Futures Europe*',
      is_conditional: false,
      source_ids: [],
    },
  ];
}

/** Simulates the failure mode workstream 16 hypothesises: a bad agent write lands raw JSON in
 *  `content_md` instead of prose. This is a DATA fixture, not a code path this lane changed, it
 *  exists only to prove the detector below is not vacuous (red-then-green). */
function corruptSections() {
  return [
    {
      section_key: '1',
      section_order: 0,
      content_md:
        '{"label":"EUA settlement","valueDisplay":"€68.40","unit":"EUR/t","contextLine":"week over week","severityTone":"cost"}',
      is_conditional: false,
      source_ids: [],
    },
  ];
}

/** Walks every text node under document.body and flags one shaped like a raw JSON/text dump:
 *  3+ `"key":` pairs, or a run of 3+ consecutive bracket/brace characters. Mirrors the heuristic
 *  used for the live-site repro attempt (scripts/tmp/w2d-repro.mjs), so a future lane with live
 *  access reuses the same definition of "dump". */
async function findRawDumpNodes(page) {
  return page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const results = [];
    let node;
    while ((node = walker.nextNode())) {
      const t = (node.nodeValue || '').trim();
      if (t.length < 40) continue;
      const jsonPairCount = (t.match(/"[a-zA-Z0-9_]+"\s*:/g) || []).length;
      const braceRun = (t.match(/[{}[\]]{3,}/g) || []).length;
      if (jsonPairCount >= 3 || braceRun > 0) {
        results.push({ text: t.slice(0, 200), jsonPairCount, braceRun });
      }
    }
    return results;
  });
}

/** [CONFIRMED] (coordinator SELECT, 2026-09-30): the actual live dump is not JSON. Across
 *  intelligence_item_sections joined to market_signal/initiative items, 631 rows start with "[" or
 *  "{", 430 `record_facts`, 201 `identity`, record-facts.mjs's own `[slot_key] ...` claim_text
 *  format (src/lib/intake/record-facts.mjs's extractSlotFact/extractIdentityFact), never JSON. Walks
 *  every text node and flags one >=20 chars starting with a bare `[slot_key]` prefix, the exact shape
 *  a slot claim line carries before the slot renderer (RecordFactCard/RecordFactsBody) turns it into
 *  a labelled field. */
async function findSlotLabelDumpNodes(page) {
  return page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const results = [];
    let node;
    while ((node = walker.nextNode())) {
      const t = (node.nodeValue || '').trim();
      if (t.length < 20) continue;
      if (/^\[[a-zA-Z][a-zA-Z0-9_]*\]\s/.test(t)) {
        results.push(t.slice(0, 200));
      }
    }
    return results;
  });
}

async function mountAndScan(browser, props) {
  const bundleJs = await bundleEntry(MARKET_ENTRY, { alias: ALIAS });
  const page = await newSmokePage(browser);
  try {
    await mountBundle(page, bundleJs, '__mount', props);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
    return await findRawDumpNodes(page);
  } finally {
    await page.close();
  }
}

/** Mounts, optionally clicks the "Full brief" depth toggle (SummaryDepthSwitch,
 *  src/components/detail/DetailShell.tsx), then runs the slot-label detector. `entry` defaults to
 *  Market's bundle; leg 5 passes REGULATION_ENTRY to attack the same defect class on that surface. */
async function mountAndScanSlotLabels(browser, props, { clickFullBrief = false, entry = MARKET_ENTRY } = {}) {
  const bundleJs = await bundleEntry(entry, { alias: ALIAS });
  const page = await newSmokePage(browser);
  try {
    await mountBundle(page, bundleJs, '__mount', props);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
    if (clickFullBrief) {
      await page.click('button:has-text("Full brief")');
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
    }
    return await findSlotLabelDumpNodes(page);
  } finally {
    await page.close();
  }
}

/** The exact two sample lines the coordinator's live SELECT returned (2026-09-30), reconstructed in
 *  full from the templates that wrote them (record-facts.mjs's extractIdentityFact/extractSlotFact) , 
 *  the coordinator's own message truncated both at ~100 chars for the chat transcript. */
const SAMPLE_IDENTITY_FACT_LINE =
  "[title] The captured source's own text carries this item's title verbatim: «13.2.2020 EN Official Journal of the European Union»";
const SAMPLE_RECORD_FACTS_GAP_LINE =
  '[action_now] No verbatim action now statement was located in the captured source text for this record-grade item. A full-brief regrounding will re-examine this gap when this item upgrades from record to brief.';

/** A record-grade item's two section rows, using the exact live-shaped sample lines above. */
function recordDumpSections() {
  return [
    { section_key: 'identity', section_order: 0, content_md: SAMPLE_IDENTITY_FACT_LINE, is_conditional: false, source_ids: [] },
    { section_key: 'record_facts', section_order: 1, content_md: SAMPLE_RECORD_FACTS_GAP_LINE, is_conditional: false, source_ids: [] },
  ];
}

/** buildRecordFullBrief's own shape (src/lib/intake/record-facts.mjs), reproduced here rather than
 *  imported (that module lives outside this lane's write set, src/lib/intake/**), a bare `- ` bullet
 *  per claim under digit-free headings, byte-identical claim_text to the sections above. */
function recordDumpFullBrief() {
  return [
    '*Catalogue record: extracted facts only, full brief pending.*',
    '',
    '## Verbatim facts',
    '',
    `- ${SAMPLE_IDENTITY_FACT_LINE}`,
    '',
    '## Not stated in the captured source',
    '',
    `- ${SAMPLE_RECORD_FACTS_GAP_LINE}`,
    '',
    'Source: https://example.com/source',
  ].join('\n');
}

export async function runSmoke(browser) {
  const failures = [];
  let checks = 0;

  // Leg 1: clean fixture must render with zero dump-shaped nodes.
  {
    checks += 1;
    const dumps = await mountAndScan(browser, {
      resource: baseResource(),
      relatedPool: [],
      sections: cleanSections(),
      convergence: null,
      priceBoard: [],
      carbonFactors: [],
      groupLabel: 'Market / ICE Futures Europe',
      deck: 'ICE Futures Europe · published Aug 1, 2026',
      initialNote: '',
      supersessions: [],
      connections: [],
      relevance: null,
      resourceLookup: {},
    });
    if (dumps.length > 0) {
      failures.push(
        `market-detail-raw-dump:clean-fixture, raw dump-shaped text node(s) found: ${JSON.stringify(dumps)}`
      );
    }
  }

  // Leg 2: red-then-green proof. A corrupt content_md (raw JSON where prose belongs) DOES trip the
  // detector, confirming leg 1's pass is a real signal, not a vacuous guard.
  {
    checks += 1;
    const dumps = await mountAndScan(browser, {
      resource: baseResource({ id: 'dump-guard-corrupt' }),
      relatedPool: [],
      sections: corruptSections(),
      convergence: null,
      priceBoard: [],
      carbonFactors: [],
      groupLabel: 'Market / ICE Futures Europe',
      deck: 'ICE Futures Europe · published Aug 1, 2026',
      initialNote: '',
      supersessions: [],
      connections: [],
      relevance: null,
      resourceLookup: {},
    });
    if (dumps.length === 0) {
      failures.push(
        'market-detail-raw-dump:corrupt-fixture, expected the detector to flag the deliberately JSON-shaped content_md, found none (guard is vacuous)'
      );
    }
  }

  // Leg 3: red-then-green proof for the slot-label detector itself. A NON-record item whose ordinary
  // signal-brief section (sectionMap["1"], routed through FactBlocks/GfmSection) was mistakenly
  // written with a bare slot-claim line (the shape this workstream's live SELECT actually found) DOES
  // trip the detector, confirming leg 4 below's clean result is a real signal.
  {
    checks += 1;
    const slotDumps = await mountAndScanSlotLabels(browser, {
      resource: baseResource({ id: 'slot-dump-guard-corrupt' }),
      relatedPool: [],
      sections: [
        { section_key: '1', section_order: 0, content_md: SAMPLE_RECORD_FACTS_GAP_LINE, is_conditional: false, source_ids: [] },
      ],
      convergence: null,
      priceBoard: [],
      carbonFactors: [],
      groupLabel: 'Market / ICE Futures Europe',
      deck: 'ICE Futures Europe · published Aug 1, 2026',
      initialNote: '',
      supersessions: [],
      connections: [],
      relevance: null,
      resourceLookup: {},
    });
    if (slotDumps.length === 0) {
      failures.push(
        'market-detail-raw-dump:slot-label-detector-selftest, expected the detector to flag a bare [slot_key] line routed through FactBlocks/GfmSection, found none (guard is vacuous)'
      );
    }
  }

  // Leg 4: workstream 16's [CONFIRMED] fix, Market surface. A record-grade item carrying the
  // coordinator's exact live sample lines (identity's [title] FACT, record_facts' [action_now] GAP)
  // renders zero raw slot-label text at BOTH depths. At "summary" depth (default),
  // RecordGradeSections routes the FACT through RecordFactCard/deriveRecordFactCardModel as a
  // labelled field, and (rule 13 flag 2, 2026-09-30) now renders the GAP through the shared absence
  // TREATMENT ("needs action now from the source", ABSENCE_TEXT_STYLE) instead of dropping it. At
  // "full" depth (the SummaryDepthSwitch click below), the `!isRecord` guard on
  // GfmSection(r.fullBrief) (MarketSignalDetailSurface.tsx) keeps buildRecordFullBrief's raw
  // `- [slot_key] ...` bullets from ever reaching the page, before the fix, this exact fixture (with
  // fullBrief set to recordDumpFullBrief(), the real buildRecordFullBrief shape) rendered both sample
  // lines verbatim as GfmSection prose.
  {
    checks += 1;
    const recordProps = {
      resource: baseResource({ id: 'record-dump-guard', itemGrade: 'record', fullBrief: recordDumpFullBrief() }),
      relatedPool: [],
      sections: recordDumpSections(),
      claimTiers: {},
      convergence: null,
      priceBoard: [],
      carbonFactors: [],
      groupLabel: 'Market / ICE Futures Europe',
      deck: 'ICE Futures Europe · catalogue record',
      initialNote: '',
      supersessions: [],
      connections: [],
      relevance: null,
      resourceLookup: {},
    };
    const summaryDumps = await mountAndScanSlotLabels(browser, recordProps, { clickFullBrief: false });
    if (summaryDumps.length > 0) {
      failures.push(
        `market-detail-raw-dump:record-fixture-summary-depth, raw slot-label text node(s) found: ${JSON.stringify(summaryDumps)}`
      );
    }
    const fullDumps = await mountAndScanSlotLabels(browser, recordProps, { clickFullBrief: true });
    if (fullDumps.length > 0) {
      failures.push(
        `market-detail-raw-dump:record-fixture-full-depth, raw slot-label text node(s) found: ${JSON.stringify(fullDumps)}`
      );
    }
  }

  // Leg 5: positive check for rule 13 flag 2. The [action_now] GAP claim must actually SURFACE as
  // its labelled absence sentence at Summary depth, not merely fail to appear as raw text (leg 4
  // proves absence of the bug; this proves presence of the fix).
  {
    checks += 1;
    const bundleJs = await bundleEntry(MARKET_ENTRY, { alias: ALIAS });
    const page = await newSmokePage(browser);
    try {
      await mountBundle(page, bundleJs, '__mount', {
        resource: baseResource({ id: 'gap-absence-guard', itemGrade: 'record' }),
        relatedPool: [],
        sections: recordDumpSections(),
        claimTiers: {},
        convergence: null,
        priceBoard: [],
        carbonFactors: [],
        groupLabel: 'Market / ICE Futures Europe',
        deck: 'ICE Futures Europe · catalogue record',
        initialNote: '',
        supersessions: [],
        connections: [],
        relevance: null,
        resourceLookup: {},
      });
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
      // ABSENCE_TEXT_STYLE sets `text-transform: uppercase`, and Chromium's `innerText` reflects
      // rendered (CSS-transformed) case, not the DOM's literal text, so this check is
      // case-insensitive (confirmed by reading the rendered text directly while writing this leg).
      const hasAbsenceText = await page.evaluate(() =>
        document.body.innerText.toLowerCase().includes('needs action now from the source')
      );
      if (!hasAbsenceText) {
        failures.push(
          'market-detail-raw-dump:gap-absence-missing, expected "needs action now from the source" (the labelled GAP absence line) to render at Summary depth, found none'
        );
      }
    } finally {
      await page.close();
    }
  }

  // Leg 6: rule 13 flag 1's own attack, on RegulationDetailSurface. The identical `[CONFIRMED]`
  // mechanism (an unguarded `{depth === "full" && r.fullBrief && <GfmSection .../>}` re-rendering
  // record-grade claims raw) was found at RegulationDetailSurface.tsx:385 and fixed the same way
  // (`!isRecord` guard). Same fixture shape, same two sample lines, mounted through
  // REGULATION_ENTRY.
  {
    checks += 1;
    const regulationProps = {
      resource: baseResource({
        id: 'reg-dump-guard',
        itemGrade: 'record',
        type: 'regulation',
        fullBrief: recordDumpFullBrief(),
        legalInstrument: 'EU carbon price signal for containerised ocean freight',
      }),
      changelog: [],
      dispute: null,
      supersessions: [],
      connections: [],
      relevance: null,
      resourceLookup: {},
      sections: recordDumpSections(),
      claimTiers: {},
      groupLabel: 'Regulations · European Union',
      deck: 'EUR-Lex · catalogue record',
      initialOwner: null,
    };
    const regSummaryDumps = await mountAndScanSlotLabels(browser, regulationProps, {
      clickFullBrief: false,
      entry: REGULATION_ENTRY,
    });
    if (regSummaryDumps.length > 0) {
      failures.push(
        `market-detail-raw-dump:regulation-fixture-summary-depth, raw slot-label text node(s) found: ${JSON.stringify(regSummaryDumps)}`
      );
    }
    const regFullDumps = await mountAndScanSlotLabels(browser, regulationProps, {
      clickFullBrief: true,
      entry: REGULATION_ENTRY,
    });
    if (regFullDumps.length > 0) {
      failures.push(
        `market-detail-raw-dump:regulation-fixture-full-depth, raw slot-label text node(s) found: ${JSON.stringify(regFullDumps)}`
      );
    }
  }

  // Leg 7 (lane L12, 2026-10-03): a record-grade, corridor-band item carrying a genuinely resolvable
  // emission-factor row (the same shape select-modal-factor.mjs documents as the live EPA road row)
  // MUST render the Findings section with the carbon-intensity figure, and the section-index nav MUST
  // list "S2 Findings". Proves the positive side of `showFindings`.
  {
    checks += 1;
    const resolvableFactors = [
      {
        factor_id: 'epa-road-l12',
        mode: 'road',
        vehicle_class: 'medium_heavy_duty_truck',
        jurisdiction: 'US',
        quantity_basis: 'tonne_km',
        ttw_co2e: 0.161,
        wtt_co2e: null,
        wtw_co2e: null,
        source_key: 'EPA-2024',
        tier: 'modal_default',
        scope_kind: 'modal',
      },
    ];
    const bundleJs = await bundleEntry(MARKET_ENTRY, { alias: ALIAS });
    const page = await newSmokePage(browser);
    try {
      await mountBundle(page, bundleJs, '__mount', {
        resource: baseResource({
          id: 'l12-findings-record-resolved',
          itemGrade: 'record',
          signalBand: 'corridor',
          jurisdictionIso: ['US'],
          fullBrief: recordDumpFullBrief(),
        }),
        relatedPool: [],
        sections: recordDumpSections(),
        claimTiers: {},
        convergence: null,
        priceBoard: [],
        carbonFactors: resolvableFactors,
        groupLabel: 'Market / EPA',
        deck: 'EPA · catalogue record',
        initialNote: '',
        supersessions: [],
        connections: [],
        relevance: null,
        resourceLookup: {},
      });
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
      const findingsPresent = await page.evaluate(() => !!document.getElementById('findings'));
      const navHasFindings = await page.evaluate(() => document.body.innerText.includes('S2 Findings'));
      const hasIntensityText = await page.evaluate(() => document.body.innerText.includes('kg CO2e'));
      if (!findingsPresent) {
        failures.push('market-detail-raw-dump:l12-findings-record-resolved, expected the Findings section to render for a record-grade item with a resolvable carbon-intensity figure, found none');
      }
      if (!navHasFindings) {
        failures.push('market-detail-raw-dump:l12-findings-record-resolved, expected "S2 Findings" in the section-index nav, found none');
      }
      if (!hasIntensityText) {
        failures.push('market-detail-raw-dump:l12-findings-record-resolved, expected the carbon-intensity figure text ("kg CO2e") to render, found none');
      }
    } finally {
      await page.close();
    }
  }

  // Leg 8 (lane L12, 2026-10-03): a record-grade, corridor-band item whose jurisdiction is ambiguous
  // (two countries, select-modal-factor.mjs's documented `ambiguous` state, never resolves) MUST NOT
  // render the Findings section at all, and "S2 Findings" MUST NOT appear in the nav - proves
  // `showFindings` stays false when there is genuinely nothing to show, not merely when carbonFactors
  // happens to be empty.
  {
    checks += 1;
    const bundleJs = await bundleEntry(MARKET_ENTRY, { alias: ALIAS });
    const page = await newSmokePage(browser);
    try {
      await mountBundle(page, bundleJs, '__mount', {
        resource: baseResource({
          id: 'l12-findings-record-unresolved',
          itemGrade: 'record',
          signalBand: 'corridor',
          jurisdictionIso: ['CN', 'US'],
          fullBrief: recordDumpFullBrief(),
        }),
        relatedPool: [],
        sections: recordDumpSections(),
        claimTiers: {},
        convergence: null,
        priceBoard: [],
        carbonFactors: [],
        groupLabel: 'Market / EPA',
        deck: 'EPA · catalogue record',
        initialNote: '',
        supersessions: [],
        connections: [],
        relevance: null,
        resourceLookup: {},
      });
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
      const findingsPresent = await page.evaluate(() => !!document.getElementById('findings'));
      const navHasFindings = await page.evaluate(() => document.body.innerText.includes('S2 Findings'));
      if (findingsPresent) {
        failures.push('market-detail-raw-dump:l12-findings-record-unresolved, expected the Findings section to stay absent for a record-grade item with no resolvable figure, found it present');
      }
      if (navHasFindings) {
        failures.push('market-detail-raw-dump:l12-findings-record-unresolved, expected no "S2 Findings" nav entry, found one');
      }
    } finally {
      await page.close();
    }
  }

  return { checks, failures };
}
