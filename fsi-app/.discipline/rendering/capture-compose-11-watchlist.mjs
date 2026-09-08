// One-off capture script (lane comp-11, 2026-09-08): a 1440px screenshot of the REAL
// WatchlistSurface with POPULATED fixture data, for the side-by-side against artboard 11
// (docs/design/handoff-2026-09-06/screens/11-watchlist.png).
//
// It mounts the component through the rendering guard's own machinery (harness.mjs's
// bundleEntry/newSmokePage/mountBundle — a real esbuild bundle of the actual src/components/**
// module, no reproduction), and it deliberately reuses the SAME fixture the design-audit mount
// uses (AUDIT_MOUNTS['compose-11-watchlist'] in ./audit/mounts.mjs, imported here rather than
// retyped) so the measured page and the pictured page are provably the same page. That reuse is
// the point: a screenshot built from its own private fixture proves nothing about what the audit
// measured.
//
// No live Supabase project exists in this sandbox, so a real `next dev` navigation to /watchlist
// renders the honest empty state rather than the artboard's example data — the same reason the
// sibling capture scripts mount components directly, recorded in their own headers and in
// DEVIATION-LOG.md.
//
// Usage: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node .discipline/rendering/capture-compose-11-watchlist.mjs

import { createRequire } from 'node:module';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { bundleEntry, newSmokePage, mountBundle } from './smoke/harness.mjs';
import { AUDIT_MOUNTS } from './audit/mounts.mjs';
// The artboard|built compositor, in its one home (FOLD-59). This script used to write only the
// bare built PNG and leave the side-by-side to be assembled by hand; lane lists60 (2026-09-08)
// wired it here, so the committed evidence regenerates from the code it evidences.
import { composite, SCREENS_DIR } from './compose-composite.mjs';
import { getRepoRoot } from '../lib/context.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');

const OUT_DIR = join(getRepoRoot(), 'docs/design/handoff-2026-09-06/built');
const BUILT_FILE = '_built-compose-11-watchlist.png';
const OUT_FILE = 'compose-11-watchlist.png';
const ARTBOARD = '11-watchlist.png';

async function main() {
  const mount = AUDIT_MOUNTS['compose-11-watchlist'];
  if (!mount) throw new Error("AUDIT_MOUNTS['compose-11-watchlist'] is missing");

  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch(
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {},
  );
  const bundleJs = await bundleEntry(mount.entry);
  const page = await newSmokePage(browser, { apiRoutes: mount.apiRoutes });
  await page.setViewportSize({ width: mount.viewport, height: 1200 });
  await mountBundle(page, bundleJs, '__mount');
  // The two client fetches this page makes (/api/notices, /api/workspace/tags) resolve from the
  // mount's own routes; 400ms is well past their round trip in this harness.
  await page.evaluate(() => new Promise((r) => setTimeout(r, 400)));
  const builtPath = join(OUT_DIR, BUILT_FILE);
  await page.screenshot({ path: builtPath, fullPage: true });
  await page.close();
  const outPath = join(OUT_DIR, OUT_FILE);
  await composite(browser, join(SCREENS_DIR, ARTBOARD), builtPath, outPath);
  rmSync(builtPath, { force: true });
  console.log(`wrote ${outPath}`);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
