// UX smoke spec: /admin summary-tile grid (task 7.5 item 4, brief-chain build plan Part 7,
// 2026-09-12). Operator report, verbatim: "the numbers in the sources and inject tabs are being cut
// off", then the coordinator's addendum widening scope: "all spacing in those boxes across admin
// need adjustment".
//
// ROOT CAUSE [CONFIRMED, read src/components/ui/StatBlock.tsx before the fix]: the tile's
// label/numeral flex row (`size="tile"`) pinned neither side. A flex item's default `min-width` is
// `auto`, so the uppercase label never shrank below its own content width; on a two-word label
// ("COMMUNITY PICKUPS", "RESEARCH PIPELINE") at the admin grid's real 4-column tile width
// (~206-290px at desktop viewports, computed from AdminDashboard.tsx's own
// `.admin-t08-frame`/`.admin-t08-sections` CSS), the label squeezed the numeral past the tile's
// right edge, and because `.cl-admin-stat-tile` sets `overflow: hidden`, the squeezed numeral was
// SILENTLY CLIPPED rather than wrapping or scrolling. This is exactly the class
// `detectBoundsViolations` (assertions.mjs, D1) exists to catch and `detectOverflows` structurally
// cannot: a clipped box never grows its container's `scrollWidth`, so the whole-container overflow
// scan the rest of this engine's fixture legs rely on would have stayed green through the entire
// incident.
//
// This spec mounts the REAL `StatBlock` component (size="tile") inside the REAL `.cl-admin-stat-tile`
// / `.admin-t08-sections` CSS rules (mirrored here verbatim from AdminDashboard.tsx; no shared CSS
// module exists to import from a TSX bundle context, the same constraint masthead-balance-smoke.mjs
// notes for its own inline reproduction) at three widths: the single-column mobile case (375px
// content width) and two 4-column desktop cases spanning the real narrow-to-wide range the admin
// frame actually produces (see the width derivation below each scenario). Eight tiles are mounted:
// the seven SECTIONS plus Emission factors AdminDashboard.tsx's own grid renders, using the two
// reported values (Sources 491, Ingest 4,770) AND a synthetic 5-digit value (12,345) so a FUTURE
// five-digit count is provably caught too (the coordinator's explicit ask), not just the two counts
// that were reported.
//
// `StatBlock.tsx`'s tile-mode label/numeral row now carries `data-guard-container="stat-tile-row"`
// (the fix's own instrumentation) so `measureBoundsSweep` sees it as a bounds-checked container with
// no code change needed in this spec beyond mounting the component; the grid wrapper itself also
// carries `data-guard-container="admin-stat-grid"` so a tile overlapping a NEIGHBOUR tile (not just a
// numeral overlapping its own label) is caught too.

import { bundleEntry, newSmokePage, mountBundle, measureGuard, assertGuardClean, measureBoundsSweep, assertBoundsClean } from './harness.mjs';

const ENTRY = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { StatBlock } from '@/components/ui/StatBlock';

// Mirrored verbatim from AdminDashboard.tsx's <style> block (.cl-admin-stat-tile) and its
// admin-t08-sections grid rule, post-fix (16px padding, min-height 96, 16px gap). Kept in sync by
// eye: a drift here means this spec stops reproducing the real page, which the report names as an
// open risk if AdminDashboard.tsx's own CSS changes again without this file being re-read.
const TILE_CSS = \`
  .cl-admin-stat-tile {
    font-family: inherit;
    cursor: pointer;
    text-align: left;
    width: 100%;
    background: #FFFFFF;
    border-radius: 10px;
    border: 1px solid rgba(0, 0, 0, .12);
    box-shadow: 0 1px 2px rgba(26, 26, 26, .04), 0 4px 14px rgba(26, 26, 26, .06);
    padding: 16px;
    box-sizing: border-box;
    min-height: 96px;
    overflow: hidden;
  }
  .admin-stat-grid { display: grid; gap: 16px; }
\`;

// The eight tiles AdminDashboard.tsx's admin-t08-sections grid renders (SECTIONS + Emission
// factors): the two REPORTED values (Sources 491, Ingest 4,770) plus a synthetic 5-digit value
// (Emission factors, 12,345) so the fix is proven against a wider range than only the two counts
// that were actually reported.
const TILES = [
  { label: 'Workspaces', value: '12', note: '12 organizations' },
  { label: 'Sources', value: '491', note: 'provisional pending review' },
  { label: 'Ingest', value: '4,770', note: 'staged + flags open' },
  { label: 'Coverage', value: '6', note: 'critical jurisdiction gaps' },
  { label: 'Research pipeline', value: '38', note: 'items in the queue' },
  { label: 'Community pickups', value: '3', note: 'promoted threads' },
  { label: 'Runtime', value: '2', note: 'open error groups' },
  { label: 'Emission factors', value: '12,345', note: '12,345 live rows \\u00b7 read-only (WO-18)' },
];

let root = null;
window.__mount = ({ columns }) => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(
    React.createElement(
      React.Fragment,
      null,
      React.createElement('style', null, TILE_CSS),
      React.createElement(
        'div',
        {
          className: 'admin-stat-grid',
          'data-guard-container': 'admin-stat-grid',
          style: { gridTemplateColumns: \`repeat(\${columns}, 1fr)\` },
        },
        TILES.map((t) =>
          React.createElement(
            'button',
            { key: t.label, type: 'button', className: 'cl-admin-stat-tile' },
            React.createElement(StatBlock, { size: 'tile', label: t.label, value: t.value, note: t.note }),
          ),
        ),
      ),
    ),
  );
};
`;

// Width derivation (AdminDashboard.tsx's own CSS, read in full alongside this fix):
//   .admin-t08-frame: max-width 1440, padding 20px 40px 40px (>767px) / 14px 16px 16px (<=767px),
//   two columns minmax(0,1fr)+300px+28px gap ABOVE 1280px viewport, collapsing to one column AT OR
//   BELOW 1280px viewport. .admin-t08-sections: 4 columns above 1180px viewport, 2 columns
//   811-1180px, 1 column at or below 640px viewport (all viewport-width media queries, independent
//   of the frame's own collapse).
//   - mobile (viewport <=640, frame collapsed, sections 1-col): content width = 375-2*16=343,
//     single column -> tile width 343px (the low-risk case: wide, included for completeness/the
//     operator's explicit "measure ... at 375px" instruction).
//   - desktop-narrow (viewport just above 1280, frame is TWO columns, sections still 4-col): at a
//     900px total available width for the sections grid, gap 16 * 3 = 48 -> tile width
//     (900-48)/4 = 213px. This is the TIGHTEST realistic tile width the real page produces (the
//     frame's right rail eats 328px before the sections grid even starts) and is where the reported
//     defect actually reproduced.
//   - desktop-wide (viewport 1440, the frame's own max-width ceiling, frame is two columns): content
//     width 1440-80=1360, left column 1360-300-28=1032, 4 cols, gap 16*3=48 -> tile width
//     (1032-48)/4=246px. Slightly wider than desktop-narrow but still the 4-column desktop case, so
//     both ends of the real range are covered.
const SCENARIOS = [
  { name: 'mobile-1col', columns: 1, gridWidth: 343 },
  { name: 'desktop-4col-narrow', columns: 4, gridWidth: 900 },
  { name: 'desktop-4col-wide', columns: 4, gridWidth: 1032 },
];

export async function runSmoke(browser) {
  const failures = [];
  let checks = 0;
  const bundleJs = await bundleEntry(ENTRY);

  for (const scenario of SCENARIOS) {
    const label = `admin-stat-tiles:${scenario.name}`;
    const page = await newSmokePage(browser);
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await mountBundle(page, bundleJs, '__mount', { columns: scenario.columns });
      // Constrain the grid wrapper to the scenario's REAL computed width (see the derivation above)
      // rather than relying on the admin page's own media queries; same technique
      // masthead-balance-smoke.mjs uses to reproduce a specific content width without mounting the
      // whole page frame.
      await page.evaluate((w) => {
        const grid = document.querySelector('.admin-stat-grid');
        grid.style.width = `${w}px`;
      }, scenario.gridWidth);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
      await page.waitForTimeout(30);

      const guard = await measureGuard(page);
      const bounds = await measureBoundsSweep(page);
      checks += 1;
      failures.push(...assertGuardClean(label, guard));
      failures.push(...assertBoundsClean(label, bounds));

      // Belt-and-suspenders text-level check: the numeral's own text (e.g. "4,770", "12,345") must
      // still be present as VISIBLE text somewhere on the page: a clipped/zero-size numeral span
      // would still exist in the DOM (React rendered it) but read zero width in the bounds sweep
      // above; this asserts the reported VALUE itself is not silently absent from render either.
      const renderedTexts = guard.texts || [];
      for (const tile of [{ v: '491' }, { v: '4,770' }, { v: '12,345' }]) {
        if (!renderedTexts.some((t) => t.includes(tile.v))) {
          failures.push(`${label}: expected count "${tile.v}" not found in rendered text at all`);
        }
      }
    } finally {
      await page.close();
    }
  }

  return { checks, failures };
}
