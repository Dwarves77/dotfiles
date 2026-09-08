// One-off capture (lane compose-dashboard-details, 2026-09-08): populated fixture screenshots of
// the four detail surfaces (regulation/market/research/operations) for the page-composition
// side-by-side against artboards 03/05/07/09. Reuses the audit's own mounts (mounts.mjs) — same
// fixture data the compose-03/05/07/09.json specs assert against — via the same in-process
// esbuild+Playwright technique every other capture-*.mjs script in this directory uses.
//
// Usage: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node .discipline/rendering/capture-compose-details.mjs

import { createRequire } from 'node:module';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { composite, SCREENS_DIR } from './compose-composite.mjs';
import { bundleEntry, newSmokePage, mountBundle } from './smoke/harness.mjs';
import { fullAppCssCompiled } from './smoke/smoke-fixtures.mjs';
import { AUDIT_MOUNTS } from './audit/mounts.mjs';
import { getRepoRoot } from '../lib/context.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');

const OUT_DIR = join(getRepoRoot(), 'docs/design/handoff-2026-09-06/built');
mkdirSync(OUT_DIR, { recursive: true });

const PAGES = [
  // FOLD-59: each entry names its ARTBOARD too, and the capture is now composited beside it
  // through the shared `composite()` (compose-composite.mjs) — the same side-by-side every other
  // compose-*.png is. These four wrote a bare built shot, so the file called a "side-by-side" in
  // the specs' own evidence lines had no artboard in it to compare against.
  { mountId: 'page-frame-1440', selector: '[data-audit="regulation-detail"]', out: 'compose-03-regulation-detail.png', artboard: '03-regulation-detail.png' },
  { mountId: 'market-detail-1440', selector: '[data-audit="market-detail"]', out: 'compose-05-market-detail.png', artboard: '05-market-detail.png' },
  { mountId: 'research-detail-1440', selector: '[data-audit="research-detail"]', out: 'compose-07-research-detail.png', artboard: '07-research-detail.png' },
  { mountId: 'operations-detail-1440', selector: '[data-audit="operations-detail"]', out: 'compose-09-operations-profile.png', artboard: '09-operations-profile.png' },
];

async function main() {
  const browser = await chromium.launch();
  try {
    for (const p of PAGES) {
      const mount = AUDIT_MOUNTS[p.mountId];
      const bundleJs = await bundleEntry(mount.entry, { alias: mount.alias });
      const page = await newSmokePage(browser, { apiRoutes: mount.apiRoutes ?? [] });
      await page.setViewportSize({ width: 1440, height: 1200 });
      // FOLD-59: inject the COMPILED app CSS before mounting, as capture-compose-page.mjs already
      // does. These mounts' own STYLE_INJECT is the raw globals.css, which carries no Tailwind
      // utility rules — so `TopBar`'s `md:hidden` and `Sidebar`'s `aside.hidden md:block` had no
      // rule at all and every detail capture came out with the MOBILE top bar showing at 1440 and
      // no nav card. That was an artifact of the capture, never of the page (the page-frame audit
      // spec measures `aside.hidden` and passes), but it made the side-by-side misleading, which
      // is worse than no evidence.
      await page.addStyleTag({ content: await fullAppCssCompiled() });
      await mountBundle(page, bundleJs, '__mount', null);
      await page.waitForTimeout(150);
      const el = await page.$(p.selector);
      if (!el) throw new Error(`selector not found for ${p.out}: ${p.selector}`);
      // FOLD-59: AppShell's frame is `height:100vh` with its OWN internal scroll, so an element
      // taller than the viewport is CLIPPED in the shot rather than scrolled into it — compose-05
      // came out cut through the middle of its IMPACT ASSESSMENT card, with the page disclaimer
      // drawn across the seam. Same fix capture-compose-page.mjs already carries: measure the
      // mounted element and grow the viewport to it before shooting.
      const h = await page.evaluate((sel) => {
        const node = document.querySelector(sel);
        return node ? Math.ceil(node.getBoundingClientRect().height) : 1200;
      }, p.selector);
      if (h > 1200) {
        await page.setViewportSize({ width: 1440, height: h + 40 });
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
      }
      const builtPath = join(OUT_DIR, `_built-${p.out}`);
      await el.screenshot({ path: builtPath });
      await page.close();
      const outPath = join(OUT_DIR, p.out);
      await composite(browser, join(SCREENS_DIR, p.artboard), builtPath, outPath);
      rmSync(builtPath, { force: true });
      console.log('wrote', p.out);
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
