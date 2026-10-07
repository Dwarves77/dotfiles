// Smoke spec: the ImpactMeter row variant, mounted inside the real ListRow. Originally built for
// lane METERFIX (2026-09-08), rewritten for the parts brief's stepped four-bar fill (lane w10a,
// 2026-09-18) and REWRITTEN AGAIN (lane PAR-1, 2026-10-07, Claude Design artboard 22 ruling B:
// "Twelve equal 12 px segments in four groups of three, filled left to right in the ramp colour.
// Replaces the stepped four-bar meter everywhere, legend included."). Same file, extended rather than
// duplicated: this is the spec that mounts the real `ListRow` -> real `ImpactMeter` through
// harness.mjs's esbuild+Playwright path, and only a real layout engine can answer whether twelve
// segments plus the N/12 figure fit the row's fixed 88px impact track at every width.
//
// WHAT IT ASSERTS, MEASURED. (1) Twelve segments, in four groups of three, every segment the same
// height and width (equal) at every N; (2) segment i is filled when i < N and the track colour
// otherwise, read as computed background; (3) every filled segment in a row shares ONE colour;
// (4) two rows with different dimensions and the SAME N paint identically (the byte-identical
// acceptance line, proven on a real render, not only on server markup); (5) the unscored row draws
// the same twelve segments as dashed outlines with no fill; (6) the sum label text; (7) the impact
// cell never clips the meter (scrollWidth against clientWidth), the measured answer to whether the
// geometry fits the 88px track.
//
// VIEWPORTS. All four the row guard measures (UX_VIEWPORTS: 375, 768, 1024, 1280), so the meter is
// proven inside each of the row's three layouts and the phone row, not only at the two ends.
// Source-level companions live in src/components/ui/ImpactMeter.npmtest.mjs.
//
// Registered in run-rendering-guard.mjs's SMOKE_SPECS.

import { bundleEntry, newSmokePage, mountBundle, measureGuard, assertGuardClean } from './harness.mjs';
import { fullAppCss } from './smoke-fixtures.mjs';
import { UX_VIEWPORTS } from './ux-harness.mjs';

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
  { caseId: 'n2', jurisdiction: 'GB', title: 'Sum 2, two segments', impact: { cost: 0, compliance: 0, client: 0, operational: 2 } },
  { caseId: 'n12', jurisdiction: 'DE', title: 'Sum 12, every segment filled', impact: { cost: 3, compliance: 3, client: 3, operational: 3 } },
  { caseId: 'unscored', jurisdiction: 'FR', title: 'No score yet', impact: null },
];

const SEGMENTS = 12;
const GROUP_SIZE = 3;
const N_BY_CASE = { 'n7-a': 7, 'n7-b': 7, n2: 2, n12: 12 };
const TRACK_RGB = 'rgb(229, 225, 219)'; // #E5E1DB, the unfilled track

/** Read every segment's painted size, border and background, its group, the sum text, the meter
 *  block's rendered width (segments + gap + sum label) and the impact cell's clientWidth/scrollWidth
 *  so a clip is a measured fact, not an inference. */
async function measureMeters(page) {
  return page.evaluate(() => {
    const out = {};
    for (const box of document.querySelectorAll('[data-meter-case]')) {
      const groupEls = [...box.querySelectorAll('.cl-impact-group')];
      const bars = [...box.querySelectorAll('.cl-impact-bar')].map((b) => {
        const cs = getComputedStyle(b);
        return {
          width: cs.width,
          height: cs.height,
          border: cs.borderTopStyle,
          background: cs.backgroundColor,
          group: groupEls.indexOf(b.parentElement),
        };
      });
      const sum = box.querySelector('.cl-impact-scored > span:last-child');
      const meter = box.querySelector('.cl-impact-scored');
      const cell = box.querySelector('.cl-row-impact');
      out[box.getAttribute('data-meter-case')] = {
        bars,
        groups: groupEls.length,
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

  for (const viewport of UX_VIEWPORTS) {
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
            failures.push(`${label0}: sum-7 rows with different dimensions rendered different segments/sum (${shapeA} vs ${shapeB}, sums "${a.sum}"/"${b.sum}").`);
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

        // Twelve segments in four groups of three, always.
        checks++;
        if (got.bars.length !== SEGMENTS || got.groups !== SEGMENTS / GROUP_SIZE) {
          failures.push(`${label}: expected ${SEGMENTS} segments in ${SEGMENTS / GROUP_SIZE} groups, measured ${got.bars.length} in ${got.groups}.`);
          continue;
        }
        checks++;
        const badGroup = got.bars.filter((b, i) => b.group !== Math.floor(i / GROUP_SIZE));
        if (badGroup.length > 0) {
          failures.push(`${label}: ${badGroup.length} segment(s) sit in the wrong group (each group holds three).`);
        }

        // Equal segments: one width and one height across all twelve, whatever N is.
        checks++;
        const sizes = new Set(got.bars.map((b) => `${b.width}x${b.height}`));
        if (sizes.size !== 1) {
          failures.push(`${label}: segments are not equal (${[...sizes].join(' | ')}).`);
        }

        if (row.caseId === 'unscored') {
          // Dashed outline, no fill, on all twelve segments.
          checks++;
          const notDashed = got.bars.filter((b) => b.border !== 'dashed');
          if (notDashed.length > 0) {
            failures.push(`${label}: ${notDashed.length} segment(s) not dashed (${notDashed.map((b) => b.border).join(',')}).`);
          }
          checks++;
          const filled = got.bars.filter((b) => b.background !== 'rgba(0, 0, 0, 0)');
          if (filled.length > 0) {
            failures.push(`${label}: unscored row has ${filled.length} filled segment(s), expected none.`);
          }
        } else {
          const n = N_BY_CASE[row.caseId];

          // Segment i is filled when i < N, the track colour otherwise: the fill runs left to right.
          checks++;
          const filledFlags = got.bars.map((b) => b.background !== TRACK_RGB);
          const wantFlags = got.bars.map((_, i) => i < n);
          if (filledFlags.join(',') !== wantFlags.join(',')) {
            failures.push(`${label}: filled segments ${filledFlags.map(Number).join('')}, expected ${wantFlags.map(Number).join('')} (N=${n}).`);
          }

          // Every filled segment shares ONE colour (never a per-segment colour).
          checks++;
          const colors = new Set(got.bars.filter((b) => b.background !== TRACK_RGB).map((b) => b.background));
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
