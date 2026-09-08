// Generic capture (lane compose-other, 2026-09-08): renders one AUDIT_MOUNTS['compose-*'] entry
// (real page component tree, populated fixture data, no live Supabase project reachable in this
// sandbox — see DEVIATION-LOG.md) to a full-page PNG at 1440 wide, via the same esbuild+Playwright
// technique every other rendering-guard capture in this directory uses.
//
// Usage: node .discipline/rendering/capture-compose-page.mjs <mount-id> <out-filename.png>
//          [--width=<px>] [--compiled-css] [--measure=<css selector>]
//
// The three flags are additive (lane mobile60, 2026-09-08) and change nothing when omitted:
//   --width         shoot at a viewport other than the mount's own (the mobile 390 evidence).
//   --compiled-css  inject Tailwind's compiled utility output even when the mount does not
//                   declare needsCompiledCss — required at 390 for any mount that renders
//                   AppShell/Sidebar/TopBar, whose desktop/mobile switch is `md:` utilities.
//   --measure       the element whose height the viewport is grown to before the shot, for a
//                   mount whose root does not carry the [data-audit] name derived from its id.
//   --element       shoot ONLY that element rather than the viewport. AppShell's frame is
//                   height:100vh with its own internal scroll, so a mount that renders two
//                   surfaces inside it (page-frame-1440: dashboard + regulation detail) cannot be
//                   captured page-wise below the fold; growing the viewport to --measure and then
//                   shooting the element is how the second surface gets its own evidence file.

import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { bundleEntry, newSmokePage, mountBundle } from './smoke/harness.mjs';
import { fullAppCssCompiled } from './smoke/smoke-fixtures.mjs';
import { AUDIT_MOUNTS, mountExtraCss } from './audit/mounts.mjs';
import { getRepoRoot } from '../lib/context.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');

const OUT_DIR = join(getRepoRoot(), 'docs/design/handoff-2026-09-06/built');

async function main() {
  const args = process.argv.slice(2);
  const [mountId, outName] = args.filter((a) => !a.startsWith('--'));
  const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
  const width = Number(flag('width')) || null;
  const measureSel = flag('measure') || null;
  const forceCompiledCss = args.includes('--compiled-css');
  const elementSel = flag('element');
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
  // A mount may pin its own capture height (`captureHeight` in AUDIT_MOUNTS). The auth and
  // onboarding frames need it: AuthFrame's outer box is `min-height: 100vh` and its inner grid is
  // `min-height: 900px` with a vertically CENTRED right column — exactly what artboards 16 and 17
  // draw. Captured at the harness's default 1400px tall viewport, 100vh made the frame 1400 tall
  // and the form centred at 700 instead of 450, which read as "the build centres the panel where
  // the artboard sits it higher" in FOLD-59's visual pass. It is the capture that was off by 500px,
  // not the build: the artboard's own frame IS 900 tall (lane lists60, 2026-09-08).
  const captureHeight = mount.captureHeight || 1400;
  // `--width` (lane mobile60) overrides the mount's own viewport, which is what shoots the same
  // eight mounts at 390 for the mobile evidence without a second mount per page.
  const shotWidth = width || mount.viewport || 1440;
  await page.setViewportSize({ width: shotWidth, height: captureHeight });
  if (mount.needsCompiledCss || forceCompiledCss) {
    const css = await fullAppCssCompiled();
    await page.addStyleTag({ content: css });
  }
  const extraCss = mountExtraCss(mount);
  if (extraCss) await page.addStyleTag({ content: extraCss });
  await mountBundle(page, bundleJs, '__mount', null);
  await page.waitForTimeout(300);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
  // AppShell's own frame is `height:100vh` with its OWN internal scroll (the nav card + content
  // column scroll independently inside that fixed-height box) — the document body itself never
  // grows past the viewport, so Playwright's `fullPage` screenshot (which measures body scroll
  // height) silently truncates any mount whose real content is taller than the 1400px viewport
  // set above. Measure the actual mounted content's height and grow the viewport to it before
  // shooting a plain (non-fullPage) screenshot — first caught on compose-settings, whose Freight
  // sectors 36-checkbox grid alone runs past 4000px (lane compose-other, 2026-09-08).
  const contentHeight = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return el ? Math.ceil(el.getBoundingClientRect().height) : 1400;
  }, measureSel || `[data-audit="${mount.dataAudit || mountId.replace(/^compose-/, '')}"]`);
  // A mount that pinned its height keeps it: growing to content would undo the pin.
  if (!mount.captureHeight && contentHeight > 1400) {
    await page.setViewportSize({ width: shotWidth, height: contentHeight + 40 });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
  }
  const out = join(OUT_DIR, outName);
  if (elementSel) {
    const handle = await page.$(elementSel);
    if (!handle) {
      console.error(`--element selector matched nothing: ${elementSel}`);
      process.exit(1);
    }
    await handle.screenshot({ path: out });
  } else {
    await page.screenshot({ path: out, fullPage: false });
  }
  console.log(`wrote ${out}`);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
