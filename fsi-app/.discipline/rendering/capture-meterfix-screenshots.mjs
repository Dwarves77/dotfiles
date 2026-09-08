// One-off capture script (lane METERFIX, 2026-09-08). Screenshots a PARTIALLY SCORED list row 
// the operator's defect: "meter with one bar and 2/12 ... never one lonely bar", at 1440 and 390,
// and prints the MEASURED bar heights so the before/after pair is a measurement, not an impression.
//
// Mounts the REAL `ListRow` (src/components/ui/ListRow.tsx), which mounts the REAL `ImpactMeter`,
// through harness.mjs's bundleEntry/newSmokePage/mountBundle, the same mechanism
// capture-defect-fix-screenshots.mjs uses. Not part of the discipline gate set; run by hand.
//
// Usage: OUT_TAG=before node .discipline/rendering/capture-meterfix-screenshots.mjs
//        (OUT_TAG defaults to "after"; files land in docs/design/handoff-2026-09-06/built/)

import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { bundleEntry, newSmokePage, mountBundle } from './smoke/harness.mjs';
import { fullAppCss } from './smoke/smoke-fixtures.mjs';
import { getRepoRoot } from '../lib/context.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const OUT_DIR = join(getRepoRoot(), 'docs/design/handoff-2026-09-06/built');
const TAG = process.env.OUT_TAG || 'after';

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
    React.createElement('div', { style: { background: 'var(--card)', border: '1px solid var(--line-2)', borderRadius: 10, overflow: 'hidden' } },
      props.rows.map((r, i) =>
        React.createElement('div', { key: i, 'data-case': r.caseId },
          React.createElement(ListRow, {
            href: '#',
            band: 'action',
            jurisdiction: r.jurisdiction,
            title: r.title,
            meta: r.meta,
            impact: r.impact,
            due: { label: 'Sep 30 2026', days: '22 days' },
            tier: 1,
          }))),
    ),
  );
};
`;

// The three score sets the lane reports on. `caseId` is what the measurement table keys on.
const ROWS = [
  {
    caseId: '0-0-0-2',
    jurisdiction: 'EU',
    title: 'Partially scored, one dimension at 2, three at 0',
    meta: 'Regulation · Ocean · emissions',
    impact: { cost: 0, compliance: 0, client: 0, operational: 2 },
  },
  {
    caseId: '1-0-2-0',
    jurisdiction: 'US',
    title: 'Partially scored, two dimensions at 0',
    meta: 'Agency rule · Road · reporting',
    impact: { cost: 1, compliance: 0, client: 2, operational: 0 },
  },
  {
    caseId: '3-3-3-3',
    jurisdiction: 'GB',
    title: 'Fully scored, control row, unchanged by this lane',
    meta: 'Regulation · All modes · transport standards',
    impact: { cost: 3, compliance: 3, client: 3, operational: 3 },
  },
];

/** Read every bar's computed height/width/background, grouped by case. */
async function measure(page) {
  return page.evaluate(() => {
    const out = {};
    for (const box of document.querySelectorAll('[data-case]')) {
      const bars = [...box.querySelectorAll('.cl-impact-bar')].map((b) => {
        const cs = getComputedStyle(b);
        return { score: b.getAttribute('data-score'), height: cs.height, width: cs.width, background: cs.backgroundColor };
      });
      const sum = box.querySelector('.cl-impact-scored > span:last-child');
      out[box.getAttribute('data-case')] = { bars, sum: sum ? sum.textContent : null };
    }
    return out;
  });
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const bundleJs = await bundleEntry(ENTRY);
  const browser = await chromium.launch();
  const report = {};
  try {
    for (const vp of [{ width: 1440, height: 620 }, { width: 390, height: 900 }]) {
      const page = await newSmokePage(browser);
      await page.setViewportSize(vp);
      await mountBundle(page, bundleJs, '__mount', { rows: ROWS });
      await page.waitForTimeout(150);
      report[vp.width] = await measure(page);
      const file = join(OUT_DIR, `meterfix-partial-${TAG}-${vp.width}.png`);
      await page.locator('#smoke-root').screenshot({ path: file });
      console.log(`wrote ${file}`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
  for (const [vw, cases] of Object.entries(report)) {
    console.log(`\n== ${vw}px (${TAG}) ==`);
    for (const [caseId, v] of Object.entries(cases)) {
      console.log(`  [${caseId}] sum=${v.sum} bars=${v.bars.map((b) => `${b.score}:${b.height}/${b.width} ${b.background}`).join('  ')}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
