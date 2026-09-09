// EXIT EVIDENCE for lane opsmatrix5 (2026-09-09): the replacement artboard beside the build, at
// 1440, in the three states the operator's acceptance criterion names.
//
// WHAT IT PRODUCES, in docs/design/handoff-2026-09-06/built/:
//   opsmatrix5-1440-<state>.png        the built matrix card alone, one per state
//   opsmatrix5-sbs-<state>.png         a 50/50 side-by-side: the replacement artboard left, the
//                                      build right, both scaled to the same height, with a caption
//                                      strip naming the state and the measured card height
//   states: nothing-selected (Esc), cell-selected (the ARRIVAL state, item 5), compare-mode
//
// WHY A SIDE-BY-SIDE AND NOT A SCREENSHOT. The lane's whole job was to reconcile a written message
// with an image that disagrees with it in places, and the operator's instruction was that the image
// wins. A screenshot of the build proves the build renders; only the pair proves it renders THE
// ARTBOARD. The composition is done in the page itself (two <img> in a flex row) so no image library
// is needed and the output is a real 1:1 capture of both.
//
// The build side is the COMPOSED /operations page mount at 1440 (`compose-08-operations`), not the
// component in isolation, because the artboard draws the page.
//
// Usage: NO_PROXY="$NO_PROXY,smoke-guard.internal" PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers \
//   node .discipline/rendering/capture-opsmatrix5-screenshots.mjs
// Not part of the gate set; run by hand, like every other capture-*.mjs beside it.

import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bundleEntry, newSmokePage, mountBundle } from './smoke/harness.mjs';
import { fullAppCssCompiled } from './smoke/smoke-fixtures.mjs';
import { AUDIT_MOUNTS, mountExtraCss } from './audit/mounts.mjs';
import { getRepoRoot } from '../lib/context.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = getRepoRoot();
const OUT_DIR = join(ROOT, 'docs/design/handoff-2026-09-06/built');
const ARTBOARD = join(ROOT, 'docs/design/handoff-2026-09-06/screens/08-operations-list-redesign-2026-09-08.png');
const CARD = '[data-audit="ops-matrix-card"]';

const STATES = [
  {
    id: 'cell-selected',
    label: 'ARRIVAL: first sourced cell of the first sourced row selected (operator 2026-09-09 item 5)',
    act: async () => {},
  },
  {
    id: 'nothing-selected',
    label: 'NOTHING SELECTED: after Esc (operator 2026-09-09 item 3, "Esc closes")',
    act: async (page) => {
      await page.evaluate((c) => document.querySelector(`${c} [tabindex="0"]`).focus(), CARD);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(180);
    },
  },
  {
    id: 'compare-mode',
    label: 'COMPARE MODE: a row header selected, one card per region, stacked (operator 2026-09-09 item 2)',
    act: async (page) => {
      await page.locator(`${CARD} table > tbody > tr:nth-child(3) > th`).click();
      await page.waitForTimeout(200);
    },
  },
];

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch(
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {},
  );
  const mount = AUDIT_MOUNTS['compose-08-operations'];
  const artboardDataUri = `data:image/png;base64,${readFileSync(ARTBOARD).toString('base64')}`;
  const heights = {};

  for (const state of STATES) {
    const page = await newSmokePage(browser, { apiRoutes: mount.apiRoutes || [] });
    await page.setViewportSize({ width: 1440, height: 1600 });
    await page.addStyleTag({ content: await fullAppCssCompiled() });
    const extra = mountExtraCss(mount);
    if (extra) await page.addStyleTag({ content: extra });
    await mountBundle(page, await bundleEntry(mount.entry, { alias: mount.alias || {} }), '__mount', null);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    await page.waitForTimeout(300);
    await state.act(page);

    const h = await page.evaluate((c) => Math.round(document.querySelector(c).getBoundingClientRect().height * 100) / 100, CARD);
    heights[state.id] = h;
    const shot = join(OUT_DIR, `opsmatrix5-1440-${state.id}.png`);
    await page.locator(CARD).screenshot({ path: shot });
    console.log(`  wrote ${shot}  (card height ${h}px)`);
    await page.close();
  }

  // The 50/50 compositions, one per state.
  for (const state of STATES) {
    const built = `data:image/png;base64,${readFileSync(join(OUT_DIR, `opsmatrix5-1440-${state.id}.png`)).toString('base64')}`;
    const page = await browser.newPage();
    await page.setViewportSize({ width: 2000, height: 1200 });
    await page.setContent(`
      <style>
        body { margin: 0; background: #EFEFEC; font: 13px/1.4 system-ui, sans-serif; color: #1A1A18; }
        .wrap { display: flex; gap: 0; align-items: stretch; }
        .half { width: 50%; box-sizing: border-box; padding: 14px; }
        .half + .half { border-left: 2px solid #1A1A18; }
        h3 { margin: 0 0 8px; font-size: 12px; letter-spacing: .1em; text-transform: uppercase; }
        img { width: 100%; display: block; border: 1px solid rgba(0,0,0,.2); background: #fff; }
        .cap { padding: 10px 14px; border-top: 2px solid #1A1A18; font-size: 12px; }
      </style>
      <div class="wrap">
        <div class="half"><h3>Replacement artboard · 08-operations-redesign-2026-09-08</h3><img src="${artboardDataUri}"></div>
        <div class="half"><h3>Built, /operations at 1440 · ${state.id}</h3><img src="${built}"></div>
      </div>
      <div class="cap"><strong>${state.label}</strong> &middot; matrix card height measured at 1440: <strong>${heights[state.id]}px</strong>
      &middot; constant across all three states: ${Object.values(heights).every((x) => x === heights[state.id]) ? 'YES' : 'NO'}
      (${STATES.map((s) => `${s.id} ${heights[s.id]}px`).join(' · ')})</div>
    `);
    await page.waitForTimeout(250);
    const out = join(OUT_DIR, `opsmatrix5-sbs-${state.id}.png`);
    await page.screenshot({ path: out, fullPage: true });
    console.log(`  wrote ${out}`);
    await page.close();
  }

  await browser.close();
  console.log(`\ncard heights @1440: ${JSON.stringify(heights)}`);
}

main().catch((e) => {
  console.error('capture ERROR:', e);
  process.exit(1);
});
