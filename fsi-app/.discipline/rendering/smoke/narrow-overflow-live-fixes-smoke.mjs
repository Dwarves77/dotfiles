// narrow-overflow-live-fixes-smoke.mjs (lane P4, 2026-10-06): the two phone-width defects the first Live smoke run
// found on production, proven in a real browser against the REAL components, with the shared scroll-container rule
// (overflow-rule.mjs, applied through measureGuard + assertGuardClean) as the judge.
//
//   1. WIDE MARKDOWN TABLE. Five detail pages carried a bare `overflowX: auto` wrapper around a 6-column GFM table
//      (550 to 760 px wide inside a 301 px column). The real GfmSection is mounted with a 6-column table:
//        375 px   -> the guard is clean, the table has stacked into cards, and every cell carries `data-label` equal
//                    to its column header text
//        1280 px  -> the guard is clean and the table is still a table (a header row, table layout)
//      RED ON THE OLD CODE: the pre-fix GfmSection renders the same markdown in the wrapper at 375 and the guard
//      fails with the wrapper named; recorded in the lane's session log. ATTACK (in this spec, independent of the
//      component): the old structure written as plain HTML must fail the guard, so a detector that stopped seeing
//      this class fails here.
//   2. HEADLINE TRACK. `div.cl-headline-track` (MarketComparativeRibbon) is an intentional sideways carousel. The
//      real ribbon is mounted at 375 inside the page's 16 px gutters: its track scrolls inside its own box
//      (scrollWidth > clientWidth), declares `data-overflow-allowed`, the guard is clean, and the track's own box
//      fits the screen. RED ON THE OLD CODE: without the attribute the guard names `div.cl-headline-track`.

import { bundleEntry, newSmokePage, mountBundle, measureGuard, assertGuardClean } from './harness.mjs';
import { fullAppCss } from './smoke-fixtures.mjs';

const MOBILE = { width: 375, height: 812 };
const DESKTOP = { width: 1280, height: 800 };

const HEADERS = ['Jurisdiction', 'Instrument', 'Effective date', 'Penalty range', 'Competent authority', 'Reference'];
const ROWS = [
  ['European Union', 'Regulation 2023/1805', '2025-01-01', 'EUR 500,000 per breach', 'National maritime authority', 'FuelEU-Maritime'],
  ['United Kingdom', 'Merchant Shipping Order', '2026-04-01', 'GBP 250,000 per breach', 'Maritime and Coastguard Agency', 'UK-ETS-Maritime'],
  ['United States', 'Clean Shipping Rule', '2027-06-01', 'USD 100,000 per breach', 'Coast Guard district office', 'CSR-Subpart-D'],
];
const MARKDOWN = [
  `| ${HEADERS.join(' | ')} |`,
  `| ${HEADERS.map(() => '---').join(' | ')} |`,
  ...ROWS.map((r) => `| ${r.join(' | ')} |`),
].join('\n');

const css = fullAppCss();

// The page chrome both mounts share: the app's own CSS, a 16 px side gutter like the detail pages' frame, a <main>.
const SHELL = `
(() => {
  const style = document.createElement('style');
  style.textContent = ${JSON.stringify(`${css}\nhtml,body{margin:0}*{box-sizing:border-box}#smoke-root{padding:0 16px}`)};
  document.head.appendChild(style);
  const m = document.createElement('main');
  document.body.appendChild(m);
  m.appendChild(document.getElementById('smoke-root'));
})();
`;

const TABLE_ENTRY = `
${SHELL}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { GfmSection } from '@/components/shared/GfmSection';

let root = null;
window.__mount = (props) => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(React.createElement(GfmSection, props));
};
`;

// Four fuel series and the four ECB rates: the headline selection folds the rates onto one EUR/USD card, which gives
// the five-card track the page shows. Keys are the real live ones, as the audit mounts use.
const seriesRow = (key, label, displayValue, pct) => ({
  seriesKey: key, id: key, label, displayValue, emptyReason: null, asAtDate: '2026-09-03', referencePeriod: '2026-09-03',
  observationCount: 12, sourceKey: 'fixture', sourceRef: null, unit: null, currency: null, derivation: null, originClass: null,
  methodVersion: null, nObservations: 12,
  deltas: {
    count: 12,
    latest: { date: '2026-09-03', value: 1, unit: null, currency: null },
    sparkline: Array.from({ length: 6 }, (_, i) => ({ date: `2026-0${i + 1}-01`, value: 1 + i * 0.05 })),
    delta1w: { value: pct / 100, pct, fromDate: '2026-08-27' },
    delta1m: { value: (pct * 2) / 100, pct: pct * 2, fromDate: '2026-08-03' },
    deltaYoY: { insufficientHistory: true },
    message: null,
  },
});
const BOARD = {
  groups: [
    {
      keyPrefix: 'eu-oil-bulletin', name: 'EU Weekly Oil Bulletin', implemented: true, cadence: 'weekly', sourceName: 'Fixture', sourceUrl: '',
      licenceStatus: 'ok', state: 'populated',
      series: [
        seriesRow('eu-oil-bulletin:automotive-diesel', 'Diesel · EU avg benchmark', '€1,217/1000L', -1.7),
        seriesRow('eu-oil-bulletin:eurosuper-95', 'Euro-Super 95', '€1,014/1000L', 0.7),
        seriesRow('eu-oil-bulletin:heavy-fuel-oil-3-5pct', 'Heavy Fuel Oil 3.5%', '€535/t', -8.1),
        seriesRow('eu-oil-bulletin:residual-fuel-oil-1pct', 'Residual Fuel Oil', '€646/t', 1.8),
      ],
    },
    {
      keyPrefix: 'ecb-fx', name: 'ECB euro foreign exchange reference rates', implemented: true, cadence: 'daily', sourceName: 'Fixture', sourceUrl: '',
      licenceStatus: 'ok', state: 'populated',
      series: [
        seriesRow('ecb-fx:eur-usd', 'EUR/USD', '1.1650', 0.4),
        seriesRow('ecb-fx:eur-gbp', 'EUR/GBP', '0.8650', 0.2),
        seriesRow('ecb-fx:eur-cny', 'EUR/CNY', '8.3000', 0.3),
        seriesRow('ecb-fx:eur-jpy', 'EUR/JPY', '172.00', 0.1),
      ],
    },
  ],
  unregistered: [],
};

const RIBBON_ENTRY = `
${SHELL}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MarketComparativeRibbon } from '@/components/market/MarketComparativeRibbon';

let root = null;
window.__mount = (props) => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(React.createElement(MarketComparativeRibbon, props));
};
`;

const OLD_STRUCTURE_ATTACK = `<!doctype html><html><head><meta name="viewport" content="width=device-width"><style>
html,body{margin:0}*{box-sizing:border-box}</style></head><body><main><div style="padding:0 16px"><div style="overflow-x:auto;margin:0 0 12px"><table style="border-collapse:collapse;width:100%;font-size:13px"><thead><tr>${HEADERS.map((h) => `<th style="padding:8px 12px;font-size:10px;letter-spacing:.1em;text-transform:uppercase">${h}</th>`).join('')}</tr></thead><tbody>${ROWS.map((r) => `<tr>${r.map((c) => `<td style="padding:8px 12px;white-space:nowrap">${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div></main></body></html>`;

async function open(browser, viewport) {
  const page = await newSmokePage(browser);
  await page.setViewportSize(viewport);
  return page;
}

/** @param {import('playwright').Browser} browser @returns {Promise<{checks:number, failures:string[]}>} */
export async function runSmoke(browser) {
  const failures = [];
  let checks = 0;
  const check = (ok, message) => {
    checks += 1;
    if (!ok) failures.push(`narrow-overflow-live-fixes: ${message}`);
  };

  // ---- 1. the wide GFM table, through the real GfmSection
  const tableBundle = await bundleEntry(TABLE_ENTRY);
  for (const viewport of [MOBILE, DESKTOP]) {
    const page = await open(browser, viewport);
    try {
      await mountBundle(page, tableBundle, '__mount', { markdown: MARKDOWN });
      await page.waitForSelector('table');
      const label = `narrow-overflow-live-fixes:gfm-table@${viewport.width}`;
      checks += 1;
      failures.push(...assertGuardClean(label, await measureGuard(page)));

      const shape = await page.evaluate(() => {
        const table = document.querySelector('table');
        const cells = [...document.querySelectorAll('tbody td')].map((td) => ({ label: td.getAttribute('data-label'), display: getComputedStyle(td).display }));
        const head = document.querySelector('thead');
        return {
          tableDisplay: getComputedStyle(table).display,
          theadDisplay: head ? getComputedStyle(head).display : null,
          className: table.className,
          cells,
        };
      });
      check(shape.className.includes('cl-table-cards'), `${label}: the table does not carry cl-table-cards`);
      check(shape.cells.length === HEADERS.length * ROWS.length, `${label}: expected ${HEADERS.length * ROWS.length} body cells, got ${shape.cells.length}`);
      const labelsOk = shape.cells.every((c, i) => c.label === HEADERS[i % HEADERS.length]);
      check(labelsOk, `${label}: a cell's data-label is not its column header (${JSON.stringify(shape.cells.slice(0, HEADERS.length).map((c) => c.label))})`);
      if (viewport.width === MOBILE.width) {
        check(shape.tableDisplay === 'block' && shape.theadDisplay === 'none', `${label}: at the phone width the table must stack into cards (table display ${shape.tableDisplay}, thead display ${shape.theadDisplay})`);
        check(shape.cells.every((c) => c.display === 'grid'), `${label}: every cell must be a label and value grid line at the phone width`);
      } else {
        check(shape.tableDisplay === 'table' && shape.theadDisplay === 'table-header-group', `${label}: at the desktop width the table must stay a table (table display ${shape.tableDisplay}, thead display ${shape.theadDisplay})`);
      }
    } finally {
      await page.close();
    }
  }

  // ATTACK: the old structure as plain HTML must fail the guard at 375 with the rule's own message.
  {
    const page = await browser.newPage({ viewport: MOBILE });
    try {
      await page.setContent(OLD_STRUCTURE_ATTACK, { waitUntil: 'load' });
      const lines = assertGuardClean('narrow-overflow-live-fixes:old-table-attack@375', await measureGuard(page));
      check(lines.some((l) => /scroll container\(s\) overflow at phone width/.test(l)), 'the old wrapper-around-a-wide-table structure did NOT fail the guard at 375 (detector broken)');
    } finally {
      await page.close();
    }
  }

  // ---- 2. the headline track, through the real ribbon
  const ribbonBundle = await bundleEntry(RIBBON_ENTRY);
  {
    const page = await open(browser, MOBILE);
    try {
      await mountBundle(page, ribbonBundle, '__mount', { board: BOARD, embedded: true });
      await page.waitForSelector('.cl-headline-track');
      const label = 'narrow-overflow-live-fixes:headline-track@375';
      checks += 1;
      failures.push(...assertGuardClean(label, await measureGuard(page)));
      const track = await page.evaluate(() => {
        const el = document.querySelector('.cl-headline-track');
        const r = el.getBoundingClientRect();
        return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, right: r.right, allowed: el.hasAttribute('data-overflow-allowed'), viewport: window.innerWidth };
      });
      check(track.allowed, `${label}: the track does not declare data-overflow-allowed`);
      check(track.scrollWidth > track.clientWidth + 1, `${label}: the track no longer scrolls (scrollWidth ${track.scrollWidth}, clientWidth ${track.clientWidth}); the fixture stopped exercising the allowance`);
      check(track.right <= track.viewport + 1, `${label}: the track's own box runs past the screen (right edge ${Math.round(track.right)}px of ${track.viewport}px)`);
    } finally {
      await page.close();
    }
  }

  return { checks, failures };
}
