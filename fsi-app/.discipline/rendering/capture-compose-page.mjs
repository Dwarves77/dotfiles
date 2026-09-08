// Generic capture (lane compose-other, 2026-09-08): renders one AUDIT_MOUNTS['compose-*'] entry
// (real page component tree, populated fixture data, no live Supabase project reachable in this
// sandbox — see DEVIATION-LOG.md) to a full-page PNG at 1440 wide, via the same esbuild+Playwright
// technique every other rendering-guard capture in this directory uses.
//
// Usage: node .discipline/rendering/capture-compose-page.mjs <mount-id> <out-filename.png>

import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { bundleEntry, newSmokePage, mountBundle } from './smoke/harness.mjs';
import { fullAppCssCompiled } from './smoke/smoke-fixtures.mjs';
import { AUDIT_MOUNTS } from './audit/mounts.mjs';
import { getRepoRoot } from '../lib/context.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');

const OUT_DIR = join(getRepoRoot(), 'docs/design/handoff-2026-09-06/built');

async function main() {
  const [mountId, outName] = process.argv.slice(2);
  if (!mountId || !outName) {
    console.error('usage: capture-compose-page.mjs <mount-id> <out-filename.png>');
    process.exit(1);
  }
  const mount = AUDIT_MOUNTS[mountId];
  if (!mount) {
    console.error(`no such mount: ${mountId}`);
    process.exit(1);
  }
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch(
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}
  );
  const bundleJs = await bundleEntry(mount.entry, { alias: mount.alias || {} });
  const page = await newSmokePage(browser, { apiRoutes: mount.apiRoutes || [] });
  await page.setViewportSize({ width: mount.viewport || 1440, height: 1400 });
  if (mount.needsCompiledCss) {
    const css = await fullAppCssCompiled();
    await page.addStyleTag({ content: css });
  }
  await mountBundle(page, bundleJs, '__mount', null);
  await page.waitForTimeout(300);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
  const out = join(OUT_DIR, outName);
  await page.screenshot({ path: out, fullPage: true });
  console.log(`wrote ${out}`);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
