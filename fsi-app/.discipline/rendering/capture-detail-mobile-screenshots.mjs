// One-off capture script (FOLD-56, F10): mobdetail's own lane could not produce
// built/m-detail-390.png / -375.png (load). This reuses the SAME RegulationDetailSurface fixture
// detail-surfaces-smoke.mjs's own runSmoke mounts (REGULATION_ENTRY / REGULATION_STATES[0] / ALIAS,
// exported additively by that file for this purpose) — never a second copy of the fixture — mounts
// it in the same Playwright chromium page every other guard file uses, and screenshots it at 390 and
// 375 wide. Not part of the discipline gate set (run-rendering-guard.mjs/run-test-suite.sh do not
// call this); run by hand when a page's built/*.png is missing.
//
// Usage: NO_PROXY="$NO_PROXY,smoke-guard.internal" PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers \
//   node .discipline/rendering/capture-detail-mobile-screenshots.mjs

import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { bundleEntry, newSmokePage, mountBundle } from './smoke/harness.mjs';
import { REGULATION_ENTRY, REGULATION_STATES, ALIAS } from './smoke/detail-surfaces-smoke.mjs';
import { getRepoRoot } from '../lib/context.mjs';

// Same createRequire pattern run-rendering-guard.mjs uses (see that file's own header): a plain ESM
// `import "playwright"` fails under a hoisted npm install this package's own node_modules symlink can
// produce; `require.resolve` sees it where the ESM resolver does not.
const { chromium } = createRequire(import.meta.url)('playwright');

const OUT_DIR = join(getRepoRoot(), 'docs/design/handoff-2026-09-06/built');

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch(
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}
  );
  const bundleJs = await bundleEntry(REGULATION_ENTRY, { alias: ALIAS });
  const state = REGULATION_STATES[0]; // long-title-long-breadcrumb-six-sections — the same state
  // detail-surfaces-smoke.mjs's own MOBILE_VIEWPORT (375) leg mounts.

  for (const width of [390, 375]) {
    const page = await newSmokePage(browser, { apiRoutes: state.apiRoutes || [] });
    await page.setViewportSize({ width, height: 812 });
    await mountBundle(page, bundleJs, '__mount', state.props);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
    const out = join(OUT_DIR, `m-detail-${width}.png`);
    await page.screenshot({ path: out, fullPage: true });
    console.log(`wrote ${out}`);
    await page.close();
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
