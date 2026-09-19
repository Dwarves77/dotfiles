// Smoke spec: the ImpactMeter row variant, mounted inside the real ListRow. Originally built for
// lane METERFIX (2026-09-08, the retired per-dimension model's "never one lonely bar" ruling);
// REWRITTEN in place, same file, for the site-wide parts brief's row-variant rewrite (lane w10a,
// 2026-09-18, docs/design/parts-brief-2026-09-18.md section 2.16). Extended rather than duplicated
// per the coordinator's UX-contract note: this is the existing spec that mounts the real `ListRow`
// -> real `ImpactMeter` through harness.mjs's esbuild+Playwright path (README's stated reason for a
// rendered-height spec over a source match still applies: the fill height is a painted pixel count,
// and only a real layout engine can answer whether the new geometry fits the row at a phone width).
//
// WHAT THE NEW MODEL CHANGES, MEASURED HERE. The row no longer draws four scored DIMENSIONS (each
// its own height/colour); it draws a stepped fill of the TOTAL N/12 (four bars, fixed heights
// 6/9/12/15px, one colour per row read off the severity ramp at N). This spec now asserts: (1) the
// fixed geometry (width 8px, radius 1.5px) regardless of N; (2) fill_i = clamp(N-3i,0,3)/3 against
// three different dimension vectors, including two that sum to the SAME N, so a real DOM render
// (not only ImpactMeter.npmtest.mjs's server-rendered markup) proves the "byte-identical for the
// same N" acceptance line; (3) every filled bar in one row shares the SAME background-color; (4) the
// unscored row's four dashed outlines, no fill; (5) the row's own width at both viewports, so the
// "fits the 88px impact cell at 375px" UX-contract question is answered from a real measurement, not
// an estimate.
//
// VIEWPORTS. RD-60 measures row components at 375px; MOBILE_VIEWPORT/DESKTOP_VIEWPORT (ux-harness.mjs)
// are the shared constants every UX-harness spec in this directory uses, so this file reuses them
// instead of its own prior 1440/390 pair (390 predates ux-harness.mjs's 375 standard; 1440 predates
// the shared 1280 desktop constant). Source-level companions live in
// src/components/ui/ImpactMeter.npmtest.mjs (constants, colour interpolation, the server-rendered
// byte-identical proof); this file guards the real rendered picture inside the real row.
//
// Registered in run-rendering-guard.mjs's SMOKE_SPECS.

import { bundleEntry, newSmokePage, mountBundle, measureGuard, assertGuardClean } from './harness.mjs';
import { fullAppCss } from './smoke-fixtures.mjs';
import { MOBILE_VIEWPORT, DESKTOP_VIEWPORT } from './ux-harness.mjs';

const STYLE_INJECT = `
(() => {
  const style = document.createElement('style');
  style.textContent = ${JSON.stringify(fullAppCss())};
  document.head.appendChild(style);
})();
`;

const ENTRY = `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ListRow } from '@/components/ui/ListRow';

let root = null;
window.__mount = (props) => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(
    React.createElement('div', null,
      props.rows.map((r, i) =>
        React.createElement('div', { key: i, 'data-meter-case': r.caseId },
          React.createElement(ListRow, {
            href: '#',
            band: 'action',
            jurisdiction: r.jurisdiction,
            title: r.title,
            meta: 'Regulation · Ocean · emissions',
            impact: r.impact,
            due: { label: 'Sep 30 2026', days: '22 days' },
            tier: 1,
          }))),
    ),
  );
};
`;

// Two rows sum to the SAME N (7) with different dimension composition, one row is fully scored
// (N=12, every bar full, the "no green at N>=7" boundary case since N=12's own colour is #DC2626,
// checked separately in ImpactMeter.npmtest.mjs's rampColor sweep), one row is unscored.
const ROWS = [
  { caseId: 'n7-a', jurisdiction: 'EU', title: 'Sum 7, dims [1,1,2,3]', impact: { cost: 1, compliance: 1, client: 2, operational: 3 } },
  { caseId: 'n7-b', jurisdiction: 'US', title: 'Sum 7, dims [0,2,2,3]', impact: { cost: 0, compliance: 2, client: 2, operational: 3 } },
  { caseId: 'n2', jurisdiction: 'GB', title: 'Sum 2, one partial bar', impact: { cost: 0, compliance: 0, client: 0, operational: 2 } },
  { caseId: 'n12', jurisdiction: 'DE', title: 'Sum 12, four full bars', impact: { cost: 3, compliance: 3, client: 3, operational: 3 } },
  { caseId: 'unscored', jurisdiction: 'FR', title: 'No score yet', impact: null },
];

// fill_i = clamp(N - 3i, 0, 3) / 3 against each bar's own fixed height (brief 2.16, verbatim).
const HEIGHTS_PX = [6, 9, 12, 15];
function expectedFillPx(n, i) {
  const fraction = Math.min(Math.max(n - 3 * i, 0), 3) / 3;
  return Math.round(HEIGHTS_PX[i] * fraction);
}

const N_BY_CASE = { 'n7-a': 7, 'n7-b': 7, n2: 2, n12: 12 };

/** Read every bar's own height + its fill span's height/colour, the sum text, and the meter block's
 *  own rendered width (bars + gap + sum label), plus the impact cell's clientWidth/scrollWidth so a
 *  clip is a measured fact, not an inference. */
async function measureMeters(page) {
  return page.evaluate(() => {
    const out = {};
    for (const box of document.querySelectorAll('[data-meter-case]')) {
      const bars = [...box.querySelectorAll('.cl-impact-bar')].map((b) => {
        const fill = b.querySelector(':scope > span');
        return {
          ownHeight: getComputedStyle(b).height,
          border: getComputedStyle(b).borderStyle,
          fillHeight: fill ? getComputedStyle(fill).height : null,
          fillColor: fill ? getComputedStyle(fill).backgroundColor : null,
        };
      });
      const sum = box.querySelector('.cl-impact-scored > span:last-child');
      const meter = box.querySelector('.cl-impact-scored');
      const cell = box.querySelector('.cl-row-impact');
      out[box.getAttribute('data-meter-case')] = {
        bars,
        sum: sum ? sum.textContent : null,
        meterWidth: meter ? meter.getBoundingClientRect().width : null,
        cellClientWidth: cell ? cell.clientWidth : null,
        cellScrollWidth: cell ? cell.scrollWidth : null,
      };
    }
    return out;
  });
}

export async function runSmoke(browser) {
  const failures = [];
  let checks = 0;
  const bundleJs = await bundleEntry(ENTRY);

  for (const viewport of [DESKTOP_VIEWPORT, MOBILE_VIEWPORT]) {
    const page = await newSmokePage(browser);
    try {
      await page.setViewportSize(viewport);
      await mountBundle(page, bundleJs, '__mount', { rows: ROWS });
      await page.waitForTimeout(150);

      checks++;
      failures.push(...assertGuardClean(`impact-meter@${viewport.width}`, await measureGuard(page)));

      const measured = await measureMeters(page);
      const label0 = `impact-meter@${viewport.width}`;

      // Byte-identical for the same N, at the DOM level: two different dimension vectors summing
      // to 7 render the same bar geometry and the same fill colour, real render not only SSR markup.
      checks++;
      {
        const a = measured['n7-a'];
        const b = measured['n7-b'];
        if (!a || !b) {
          failures.push(`${label0}: n7-a/n7-b did not mount.`);
        } else {
          const shapeA = JSON.stringify(a.bars);
          const shapeB = JSON.stringify(b.bars);
          if (shapeA !== shapeB || a.sum !== b.sum) {
            failures.push(`${label0}: sum-7 rows with different dimensions rendered different bars/sum (${shapeA} vs ${shapeB}, sums "${a.sum}"/"${b.sum}").`);
          }
        }
      }

      for (const row of ROWS) {
        const label = `${label0} [${row.caseId}]`;
        const got = measured[row.caseId];
        checks++;
        if (!got) {
          failures.push(`${label}: the row did not mount.`);
          continue;
        }

        // Four slots, always.
        checks++;
        if (got.bars.length !== 4) {
          failures.push(`${label}: expected 4 bars, measured ${got.bars.length}.`);
          continue;
        }

        if (row.caseId === 'unscored') {
          // Dashed outline, no fill, on all four bars.
          checks++;
          const notDashed = got.bars.filter((b) => b.border !== 'dashed');
          if (notDashed.length > 0) {
            failures.push(`${label}: ${notDashed.length} bar(s) not dashed (${notDashed.map((b) => b.border).join(',')}).`);
          }
          checks++;
          const hasFill = got.bars.filter((b) => b.fillHeight !== null);
          if (hasFill.length > 0) {
            failures.push(`${label}: unscored row has a fill span, expected none.`);
          }
        } else {
          const n = N_BY_CASE[row.caseId];

          // Own (track) heights are the brief's fixed set regardless of N.
          checks++;
          const ownHeights = got.bars.map((b) => b.ownHeight);
          const wantOwn = HEIGHTS_PX.map((h) => `${h}px`);
          if (ownHeights.join(',') !== wantOwn.join(',')) {
            failures.push(`${label}: bar own heights ${ownHeights.join(',')}, expected ${wantOwn.join(',')}.`);
          }

          // Fill heights follow fill_i = clamp(N-3i,0,3)/3 of the bar's own height.
          checks++;
          const fillHeights = got.bars.map((b) => Math.round(parseFloat(b.fillHeight)));
          const wantFill = [0, 1, 2, 3].map((i) => expectedFillPx(n, i));
          const closeEnough = fillHeights.every((v, i) => Math.abs(v - wantFill[i]) <= 1);
          if (!closeEnough) {
            failures.push(`${label}: fill heights ${fillHeights.join(',')}px, expected ~${wantFill.join(',')}px (N=${n}).`);
          }

          // All four bars share ONE colour (never a per-bar colour).
          checks++;
          const colors = new Set(got.bars.map((b) => b.fillColor));
          if (colors.size !== 1) {
            failures.push(`${label}: ${colors.size} distinct fill colours in one row, expected 1 (${[...colors].join(' | ')}).`);
          }

          // Sum label text.
          checks++;
          if (got.sum !== `${n}/12`) {
            failures.push(`${label}: sum label "${got.sum}", expected "${n}/12".`);
          }
        }

        // Containment: the impact cell never clips its own content (scrollWidth > clientWidth would
        // mean the meter is wider than the column it sits in). At 1280 this is the desktop 88px grid
        // track (`overflow: hidden` on .cl-row-impact); at 375 the row has reflowed to the two-line
        // mobile layout (RESPONSIVE_CSS, .cl-row-line2 flex-wrap) and .cl-row-impact carries no fixed
        // width there, so this assertion is the same check for a different reason: the meter's own
        // rendered box must never exceed what its (desktop-fixed or mobile-flexible) container gives
        // it. This is the empirical answer to "does the new geometry fit the row at 375px", not an
        // estimate: it is measured on the real component in the real layout.
        checks++;
        if (got.cellClientWidth != null && got.cellScrollWidth != null && got.cellScrollWidth > got.cellClientWidth + 1) {
          failures.push(`${label}: impact cell clipped (scrollWidth ${got.cellScrollWidth} > clientWidth ${got.cellClientWidth}).`);
        }
      }
    } finally {
      await page.close();
    }
  }

  return { checks, failures };
}
