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
 *  src/components/detail/DetailShell.tsx), then runs the slot-label detector. */
async function mountAndScanSlotLabels(browser, props, { clickFullBrief = false } = {}) {
  const bundleJs = await bundleEntry(MARKET_ENTRY, { alias: ALIAS });
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

  // Leg 4: workstream 16's [CONFIRMED] fix. A record-grade item carrying the coordinator's exact live
  // sample lines (identity's [title] FACT, record_facts' [action_now] GAP) renders zero raw
  // slot-label text at BOTH depths. At "summary" depth (default), RecordGradeSections already routes
  // the FACT through RecordFactCard/deriveRecordFactCardModel as a labelled field and silently omits
  // GAP rows (parseRecordSections computes `gaps` but RecordGradeSections never passes it to
  // RecordFactsBody, unaffected by this lane's fix, out of this workstream's scope). At "full" depth
  // (the SummaryDepthSwitch click below), this lane's fix (`!isRecord` guard on the GfmSection(r.fullBrief)
  // render in MarketSignalDetailSurface.tsx) is what keeps buildRecordFullBrief's raw
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

  return { checks, failures };
}
