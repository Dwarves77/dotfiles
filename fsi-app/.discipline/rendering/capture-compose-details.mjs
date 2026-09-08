// One-off capture (lane compose-dashboard-details, 2026-09-08): populated fixture screenshots of
// the four detail surfaces (regulation/market/research/operations) for the page-composition
// side-by-side against artboards 03/05/07/09. Reuses the audit's own mounts (mounts.mjs) — same
// fixture data the compose-03/05/07/09.json specs assert against — via the same in-process
// esbuild+Playwright technique every other capture-*.mjs script in this directory uses.
//
// Usage: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node .discipline/rendering/capture-compose-details.mjs

import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { bundleEntry, newSmokePage, mountBundle } from './smoke/harness.mjs';
import { AUDIT_MOUNTS } from './audit/mounts.mjs';
import { getRepoRoot } from '../lib/context.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');

const OUT_DIR = join(getRepoRoot(), 'docs/design/handoff-2026-09-06/built');
mkdirSync(OUT_DIR, { recursive: true });

const PAGES = [
  { mountId: 'page-frame-1440', selector: '[data-audit="regulation-detail"]', out: 'compose-03-regulation-detail.png' },
  { mountId: 'market-detail-1440', selector: '[data-audit="market-detail"]', out: 'compose-05-market-detail.png' },
  { mountId: 'research-detail-1440', selector: '[data-audit="research-detail"]', out: 'compose-07-research-detail.png' },
  { mountId: 'operations-detail-1440', selector: '[data-audit="operations-detail"]', out: 'compose-09-operations-profile.png' },
];

async function main() {
  const browser = await chromium.launch();
  try {
    for (const p of PAGES) {
      const mount = AUDIT_MOUNTS[p.mountId];
      const bundleJs = await bundleEntry(mount.entry, { alias: mount.alias });
      const page = await newSmokePage(browser, { apiRoutes: mount.apiRoutes ?? [] });
      await page.setViewportSize({ width: 1440, height: 1200 });
      await mountBundle(page, bundleJs, '__mount', null);
      await page.waitForTimeout(150);
      const el = await page.$(p.selector);
      if (!el) throw new Error(`selector not found for ${p.out}: ${p.selector}`);
      await el.screenshot({ path: join(OUT_DIR, p.out) });
      console.log('wrote', p.out);
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
