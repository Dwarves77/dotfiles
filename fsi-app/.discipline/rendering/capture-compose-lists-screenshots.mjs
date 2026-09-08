// One-off capture script (lane compose-lists, 2026-09-08): screenshots of the REAL
// RegulationsLedger/MarketIntelLedger/ResearchLedger/OperationsLedger/WatchlistSurface components
// (bundled and mounted the SAME way the rendering guard's own SM smoke specs do — harness.mjs's
// bundleEntry/newSmokePage/mountBundle, real esbuild bundle of the actual src/components/**
// module, no reproduction) at 1440px with POPULATED fixture data, for a side-by-side comparison
// against each artboard PNG under docs/design/handoff-2026-09-06/screens/. No live Supabase
// project in this sandbox (confirmed by prior lanes' DEVIATION-LOG entries) means a real
// `next dev` navigation to /regulations etc. renders the honest empty/Absence state, not the
// artboard's example data — this harness sidesteps that the same way the guard's own smoke specs
// already do, by mounting the real component with fixture props instead of going through a live
// route.
//
// Usage: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node .discipline/rendering/capture-compose-lists-screenshots.mjs
//
// The committed evidence under built/ is the SIDE-BY-SIDE composite (artboard | built), written
// here by `composite()` from ./compose-composite.mjs; the raw built PNG is a temp file this script
// deletes. The hand-assembly recipe that used to sit in this comment is gone with the hand
// assembly (FOLD-59 extracted the compositor; lane lists60 removed the stale instructions).

import { createRequire } from 'node:module';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { bundleEntry, newSmokePage, mountBundle } from './smoke/harness.mjs';
// FOLD-59: the artboard|built compositor moved to its own module so the page captures
// (capture-compose-page.mjs) can produce side-by-sides too, instead of them being hand-made.
import { composite } from './compose-composite.mjs';
import { AUDIT_MOUNTS } from './audit/mounts.mjs';
import { getRepoRoot } from '../lib/context.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');

const OUT_DIR = join(getRepoRoot(), 'docs/design/handoff-2026-09-06/built');
const SCREENS_DIR = join(getRepoRoot(), 'docs/design/handoff-2026-09-06/screens');


// FIXTURES LIVE IN ONE PLACE (lane lists60, 2026-09-08). This file used to carry its own copies
// of every ledger's row builder, the obligation route, the market series board and the empty
// aggregates shape, beside the identical fixtures in .discipline/rendering/audit/mounts.mjs. Two
// copies meant the compose-*.json specs and these evidence PNGs could measure different pages
// while both stayed green, which is the drift FOLD-59 caught the hard way when two entries here
// silently lost their `artboard` key and this script wrote nothing at all. Every entry now names
// an AUDIT_MOUNTS id and reads that mount's entry, alias and API fixture; the local copies are
// deleted rather than left dormant (CLAUDE.md rule 13).

// Every entry reads its ENTRY and its API fixture from the audit mount registry
// (.discipline/rendering/audit/mounts.mjs), never from a second local copy. Lane lists60
// (2026-09-08) finished the consolidation comp-08 started: this file used to carry its own
// REGULATIONS/MARKET/RESEARCH row builders, obligation route and series board beside the registry's,
// so the compose-*.json specs and these evidence PNGs measured DIFFERENT fixtures — the exact class
// of drift FOLD-59 found when two of these entries had silently lost their `artboard` key. One
// fixture per page now, two readers: the audit and this capture.
const CAPTURES = [
  { out: 'compose-06-research-list.png', artboard: '06-research-list.png', mount: 'compose-06-research' },
  { out: 'compose-02-regulations-list.png', artboard: '02-regulations-list.png', mount: 'compose-02-regulations' },
  { out: 'compose-04-market-list.png', artboard: '04-market-list.png', mount: 'compose-04-market' },
  { out: 'compose-08-operations-list.png', artboard: '08-operations-list.png', mount: 'compose-08-operations' },
];

/** The exit evidence this lane's method requires: artboard on the left, the built page on the right,
 *  one PNG. Composited in the same browser rather than with an image library (there is no image
 *  dependency in this repo, and adding one for two labelled <img> tags would be the wrong trade). */
async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch(
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {},
  );
  // Optional substring filter (argv[2]) so a lane re-capturing ONE page does not pay for all of
  // them; no argument keeps the original behaviour (capture every entry).
  const only = process.argv[2];
  for (const cap of CAPTURES.filter((c) => !only || c.out.includes(only))) {
    const mount = AUDIT_MOUNTS[cap.mount];
    if (!mount) throw new Error(`capture-compose-lists: no audit mount named ${cap.mount}`);
    const bundleJs = await bundleEntry(mount.entry, { alias: mount.alias || {} });
    const page = await newSmokePage(browser, {
      apiRoutes: [
        { urlGlob: '**/api/listings/rest**', handler: (route) => route.fulfill({ json: { resources: [], archived: [] } }) },
        ...(mount.apiRoutes ?? []),
      ],
    });
    await page.setViewportSize({ width: mount.viewport || 1440, height: 1200 });
    // Every registry entry bakes its own fixture props in and takes no argument.
    await mountBundle(page, bundleJs, '__mount', null);
    await page.evaluate(() => new Promise((r) => setTimeout(r, 300)));
    const builtPath = join(OUT_DIR, `_built-${cap.out}`);
    await page.screenshot({ path: builtPath, fullPage: true });
    await page.close();
    const outPath = join(OUT_DIR, cap.out);
    await composite(browser, join(SCREENS_DIR, cap.artboard), builtPath, outPath);
    rmSync(builtPath, { force: true });
    console.log(`wrote ${outPath}`);
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
