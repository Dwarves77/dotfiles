// UX smoke spec: Masthead scope-line balance (D2, operator report 2026-09-07). Mounts the REAL
// shared `Masthead` (src/components/ui/Masthead.tsx) with the exact two-line dek shape
// `DashboardMasthead` builds (src/components/dashboard/DashboardMasthead.tsx: a scope-summary
// line, then a "Verticals: <sector labels>" line) — reproducing the reported defect verbatim
// ("1,433 items across 5 surfaces ... Verticals: Fine Art & Museum Logistics, Live Events &
// Touring, Luxury Goods & High Value, Film, TV & Media Production, Automotive & Motorsport,
// Humanitarian & NGO Cargo", which wrapped with "Cargo" alone on its own line).
//
// Mounts `Masthead` directly rather than `DashboardMasthead` (which needs a live auth/workspace-
// store/bootstrap-fetch context this harness has no fixture for) because the fix itself lives in
// the SHARED part (`.cl-masthead-dek`'s `text-wrap: balance`) — every page that composes Masthead
// with a dek gets it, not a dashboard-only patch. This spec proves the shared fix with the
// dashboard's own real reported content.
//
// Measured at 1440 (operator gate width) and at 1076px (the dashboard's actual masthead content
// width: AppShell's content column at 1440 viewport, 1440 - 252px nav rail, minus the masthead
// wrap's own 40px+40px side padding — src/app/page.tsx's `.cl-dashboard-masthead-wrap`).

import { bundleEntry, newSmokePage, mountBundle } from './harness.mjs';

const ENTRY = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Masthead } from '@/components/ui/Masthead';

const dek = React.createElement(React.Fragment, null,
  React.createElement('div', null, "1,433 items across 5 surfaces \\u00b7 61 jurisdictions \\u00b7 scoped to Dietl / Rockit"),
  React.createElement('div', { style: { marginTop: 2 } }, "Verticals: Fine Art & Museum Logistics, Live Events & Touring, Luxury Goods & High Value, Film, TV & Media Production, Automotive & Motorsport, Humanitarian & NGO Cargo"),
);

let root = null;
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(
    React.createElement(Masthead, {
      title: "Jason's brief",
      dateLabel: 'Monday, September 7 2026',
      volNumber: 37,
      dek,
      commandBar: { itemCount: 1433, scope: 'dashboard' },
    }),
  );
};
`;

/** Group the dek's own text nodes into visual lines (by rounded top y) and return the word count
 *  of the LAST line — the orphan-detection primitive the operator's report actually complains
 *  about ("the next line only has the word Cargo"). Pure DOM measurement, no framework. */
const WORDS_PER_LAST_LINE_FN = `
  (el) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const words = [];
    let node;
    while ((node = walker.nextNode())) {
      const text = node.textContent;
      for (const m of text.matchAll(/\\S+/g)) {
        const range = document.createRange();
        range.setStart(node, m.index);
        range.setEnd(node, m.index + m[0].length);
        const rect = range.getBoundingClientRect();
        if (rect.width > 0) words.push({ text: m[0], top: Math.round(rect.top) });
      }
    }
    if (words.length === 0) return { lastLineWords: 0, lines: 0 };
    const tops = [...new Set(words.map((w) => w.top))].sort((a, b) => a - b);
    const lastTop = tops[tops.length - 1];
    const lastLineWords = words.filter((w) => Math.abs(w.top - lastTop) <= 2).length;
    return { lastLineWords, lines: tops.length };
  }
`;

async function measureVerticalsLastLine(page) {
  return page.evaluate(
    ({ fnSrc }) => {
      // eslint-disable-next-line no-eval
      const wordsPerLastLine = eval(fnSrc);
      const lines = Array.from(document.querySelectorAll('.cl-masthead-dek > div'));
      const verticalsLine = lines.find((d) => (d.textContent || '').startsWith('Verticals:'));
      if (!verticalsLine) return { found: false };
      return { found: true, ...wordsPerLastLine(verticalsLine) };
    },
    { fnSrc: WORDS_PER_LAST_LINE_FN },
  );
}

// The dashboard's ACTUAL masthead content width at 1440 (see this file's header): AppShell content
// column (1440 - 252px nav rail = 1188) minus the masthead wrap's own 40px + 40px side padding.
const DASHBOARD_CONTENT_WIDTH = 1188 - 40 - 40; // 1108px

export async function runSmoke(browser) {
  const failures = [];
  let checks = 0;
  const bundleJs = await bundleEntry(ENTRY);

  for (const width of [1440, DASHBOARD_CONTENT_WIDTH]) {
    const label = `masthead-balance:verticals@${width}`;
    const page = await newSmokePage(browser);
    try {
      await page.setViewportSize({ width, height: 400 });
      // The mount itself is unconstrained (Masthead fills its parent); wrap at the width under
      // test so the dek line wraps exactly as it would inside that width's real container.
      await page.evaluate((w) => {
        const root = document.getElementById('smoke-root');
        root.style.width = `${w}px`;
        root.style.padding = '0';
      }, width);
      await mountBundle(page, bundleJs, '__mount', null);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
      const result = await measureVerticalsLastLine(page);
      checks += 1;
      if (!result.found) {
        failures.push(`${label}: the Verticals dek line did not render at all`);
      } else if (result.lines > 1 && result.lastLineWords <= 1) {
        failures.push(
          `${label}: the Verticals line wraps to ${result.lines} lines with a ${result.lastLineWords}-word orphan on the last line (D2 regression — text-wrap: balance did not take effect)`,
        );
      }
    } finally {
      await page.close();
    }
  }

  return { checks, failures };
}
