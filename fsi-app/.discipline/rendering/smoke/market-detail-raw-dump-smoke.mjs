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
// NOT registered in ux-smoke-specs.mjs by this lane (that file is outside this lane's write set,
// lane-common-contract.md's UX contract point (c): "the coordinator adds it"). Verified locally with
// a temporary registration, reverted before commit, see the session-log entry's "UX smoke specs:"
// line.

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

  return { checks, failures };
}
