// Smoke spec: the PARTIALLY SCORED impact meter. Lane METERFIX, 2026-09-08.
//
// THE DEFECT THIS STARTS FROM (operator ruling, verbatim): "ROW: meter with one bar and 2/12.
// Artboard: four bars sorted ascending, coloured by value, on a 1px baseline. If only some
// dimensions are scored the unscored ones render as 0-height on the baseline; the sum shows. If none
// are scored, absence variant. Never one lonely bar."
//
// On the base tree `ImpactMeter`'s scored branch drew every bar at `${v * 6}px`, so a dimension
// scored 0 painted a 9px-wide, 0px-tall box. A row scored [0,0,0,2] rendered three invisible boxes
// and one 12px bar beside "2/12", one lonely bar. Measured, not inferred: on the base tree this
// spec's first assertion reports `0px` for every zero bar at 1440 AND at 390.
//
// WHY THIS IS A RENDERED-HEIGHT SPEC AND NOT A SOURCE MATCH. The defect is a painted pixel count,
// and the mobile leg is decided by a media query (MOBILE_CSS overrides heights for data-score
// 1/2/3 only), so only a real layout engine can answer whether a zero slot has ink at 390. This
// mounts the REAL `ListRow` -> REAL `ImpactMeter` through harness.mjs's esbuild+Playwright path and
// reads getComputedStyle. Source-level companions live in
// src/components/ui/ImpactMeter.npmtest.mjs; they guard the constants, this guards the picture.
//
// Registered in run-rendering-guard.mjs's SMOKE_SPECS.

import { bundleEntry, newSmokePage, mountBundle, measureGuard, assertGuardClean } from './harness.mjs';
import { fullAppCss } from './smoke-fixtures.mjs';

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

/** The three score sets the lane reports. Sorted ascending by the meter itself, so the expected
 *  height list is in ASCENDING order too. */
const ROWS = [
  { caseId: '0-0-0-2', jurisdiction: 'EU', title: 'One dimension at 2, three at 0', impact: { cost: 0, compliance: 0, client: 0, operational: 2 } },
  { caseId: '1-0-2-0', jurisdiction: 'US', title: 'Two dimensions at 0', impact: { cost: 1, compliance: 0, client: 2, operational: 0 } },
  { caseId: '3-3-3-3', jurisdiction: 'GB', title: 'Fully scored control row', impact: { cost: 3, compliance: 3, client: 3, operational: 3 } },
];

// Desktop (>=768px): 1 -> 6px, 2 -> 12px, 3 -> 18px, 0 -> the 2px stub.
// Mobile  (<768px):  1 -> 5px, 2 -> 10px, 3 -> 16px, 0 -> the same 2px stub (MOBILE_CSS overrides
// only data-score 1/2/3, deliberately, the stub is one third of the DESKTOP score unit and still
// well under the mobile one, so it needs no media-query rule of its own).
const EXPECTED = {
  1440: { '0-0-0-2': ['2px', '2px', '2px', '12px'], '1-0-2-0': ['2px', '2px', '6px', '12px'], '3-3-3-3': ['18px', '18px', '18px', '18px'] },
  390: { '0-0-0-2': ['2px', '2px', '2px', '10px'], '1-0-2-0': ['2px', '2px', '5px', '10px'], '3-3-3-3': ['16px', '16px', '16px', '16px'] },
};

const EXPECTED_SUM = { '0-0-0-2': '2/12', '1-0-2-0': '3/12', '3-3-3-3': '12/12' };

/** Read every bar's computed height and every meter's sum text, keyed by case. */
async function measureMeters(page) {
  return page.evaluate(() => {
    const out = {};
    for (const box of document.querySelectorAll('[data-meter-case]')) {
      const bars = [...box.querySelectorAll('.cl-impact-bar')].map((b) => ({
        score: b.getAttribute('data-score'),
        height: getComputedStyle(b).height,
        background: getComputedStyle(b).backgroundColor,
      }));
      const sum = box.querySelector('.cl-impact-scored > span:last-child');
      out[box.getAttribute('data-meter-case')] = { bars, sum: sum ? sum.textContent : null };
    }
    return out;
  });
}

export async function runSmoke(browser) {
  const failures = [];
  let checks = 0;
  const bundleJs = await bundleEntry(ENTRY);

  for (const width of [1440, 390]) {
    const page = await newSmokePage(browser);
    try {
      await page.setViewportSize({ width, height: 900 });
      await mountBundle(page, bundleJs, '__mount', { rows: ROWS });
      await page.waitForTimeout(150);

      checks++;
      failures.push(...assertGuardClean(`impact-meter-partial@${width}`, await measureGuard(page)));

      const measured = await measureMeters(page);

      for (const row of ROWS) {
        const label = `impact-meter-partial@${width} [${row.caseId}]`;
        const got = measured[row.caseId];

        checks++;
        if (!got) {
          failures.push(`${label}: the row did not mount.`);
          continue;
        }

        // 1. Four slots, always. "Never one lonely bar" is first of all a COUNT.
        checks++;
        if (got.bars.length !== 4) {
          failures.push(`${label}: expected 4 bars, measured ${got.bars.length}.`);
          continue;
        }

        // 2. The heights themselves, this is the assertion that is red on the base tree.
        checks++;
        const heights = got.bars.map((b) => b.height);
        const want = EXPECTED[width][row.caseId];
        if (heights.join(',') !== want.join(',')) {
          failures.push(`${label}: bar heights ${heights.join(',')}, expected ${want.join(',')}.`);
        }

        // 3. No bar may paint zero ink. Stated separately from (2) so a future height change that
        //    reintroduces an invisible slot fails on the RULING, not only on the numbers.
        checks++;
        const invisible = got.bars.filter((b) => parseFloat(b.height) < 1);
        if (invisible.length > 0) {
          failures.push(
            `${label}: ${invisible.length} bar(s) painted with height ${invisible.map((b) => b.height).join(',')}, a scored row must never render an invisible dimension ("never one lonely bar").`
          );
        }

        // 4. A zero bar is drawn in the baseline's ink, never on the VALUE_COLOR ramp, that is what
        //    keeps it readable as a dimension at zero rather than as a low score.
        checks++;
        const rampish = got.bars.filter((b) => b.score === '0' && b.background !== 'rgba(0, 0, 0, 0.25)');
        if (rampish.length > 0) {
          failures.push(`${label}: zero bar painted ${rampish.map((b) => b.background).join(',')}, expected the baseline ink rgba(0, 0, 0, 0.25).`);
        }

        // 5. "the sum shows", the ruling's other clause.
        checks++;
        if (got.sum !== EXPECTED_SUM[row.caseId]) {
          failures.push(`${label}: sum label "${got.sum}", expected "${EXPECTED_SUM[row.caseId]}".`);
        }
      }
    } finally {
      await page.close();
    }
  }

  return { checks, failures };
}
