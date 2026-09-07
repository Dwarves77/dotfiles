// One-off capture script (lane DASHROW-59, 2026-09-07). Screenshots the real DashboardBrief at
// 1440 with populated fixture data (dashboard-brief-smoke.mjs's own exported ENTRY/STATES,
// 'extreme' state — which carries an unscored Due-next row and a populated What-changed list,
// i.e. the exact ImpactMeter unscored branch the D1 defect came from) so the D1/D2 fixes can be
// LOOKED AT, not just measured. Same in-process esbuild+Playwright technique as
// capture-uxfix-lists-fixture-screenshots.mjs (harness.mjs) — no live server, no network.
//
// Usage: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node .discipline/rendering/capture-dashrow-screenshot.mjs

import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { bundleEntry, newSmokePage, mountBundle } from './smoke/harness.mjs';
import { ENTRY as DASHBOARD_ENTRY, STATES as DASHBOARD_STATES } from './smoke/dashboard-brief-smoke.mjs';
import { getRepoRoot } from '../lib/context.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');

const OUT_DIR = join(getRepoRoot(), 'docs/design/handoff-2026-09-06/built');

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch(
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {},
  );
  try {
    const bundleJs = await bundleEntry(DASHBOARD_ENTRY);
    const extreme = DASHBOARD_STATES.find((s) => s.label === 'extreme');
    const page = await newSmokePage(browser);
    await page.setViewportSize({ width: 1440, height: 1400 });
    await mountBundle(page, bundleJs, '__mount', extreme.props);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    await page.waitForTimeout(150);
    const outPath = join(OUT_DIR, 'compose-01-after-dashrow.png');
    await page.screenshot({ path: outPath, fullPage: true });
    console.log(`wrote ${outPath}`);
    await page.close();
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error('capture ERROR:', e);
  process.exit(1);
});
