// One-off capture script (lane uxfix-lists, 2026-09-07). This sandbox has no reachable Supabase
// project (see DEVIATION-LOG.md), so a live `next dev` screenshot of these two audit items renders
// an honest EMPTY state (0 items) that cannot show the actual fix. This script mounts the REAL
// components with fixture data instead — the same in-process esbuild+Playwright technique
// run-rendering-guard.mjs's own smoke specs use (harness.mjs), reusing their exported fixtures
// rather than duplicating them:
//   - DashboardBrief's populated 'one-row' state (dashboard-brief-smoke.mjs's own ENTRY/STATES,
//     exported additively for this purpose) — shows the "All N immediate" CardFoot control as a
//     real link with real counts (audit item 1.1).
//   - WatchButton itself, both variants, watched/unwatched/hovered — demonstrates the filled ink
//     star + "Watching" at rest / "Unwatch" on hover (audit item 3.5), the exact rule the audit
//     states, independent of any page's live watch-membership fetch.
//
// Usage: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node .discipline/rendering/capture-uxfix-lists-fixture-screenshots.mjs

import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { bundleEntry, newSmokePage, mountBundle } from './smoke/harness.mjs';
import { ENTRY as DASHBOARD_ENTRY, STATES as DASHBOARD_STATES } from './smoke/dashboard-brief-smoke.mjs';
import { getRepoRoot } from '../lib/context.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');

const OUT_DIR = join(getRepoRoot(), 'docs/design/handoff-2026-09-06/built');

const WATCHBUTTON_ENTRY = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { WatchButton } from '@/components/ui/WatchButton';

let root = null;
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(
    React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 16, padding: 24, fontFamily: 'system-ui', background: '#FAFAF8' } },
      React.createElement('div', { style: { display: 'flex', gap: 16, alignItems: 'center' } },
        React.createElement('span', { style: { width: 160 } }, 'row variant, unwatched:'),
        React.createElement(WatchButton, { itemType: 'reg', itemId: 'r-unwatched', initialWatched: false, variant: 'row' }),
      ),
      React.createElement('div', { style: { display: 'flex', gap: 16, alignItems: 'center' } },
        React.createElement('span', { style: { width: 160 } }, 'row variant, watched (rest):'),
        React.createElement(WatchButton, { itemType: 'reg', itemId: 'r-watched', initialWatched: true, variant: 'row' }),
      ),
      React.createElement('div', { style: { display: 'flex', gap: 16, alignItems: 'center' } },
        React.createElement('span', { style: { width: 160 } }, 'row variant, watched (hover -> Unwatch):'),
        React.createElement(WatchButton, { itemType: 'reg', itemId: 'r-watched-hover', initialWatched: true, variant: 'row' }),
      ),
      React.createElement('div', { style: { display: 'flex', gap: 16, alignItems: 'center' } },
        React.createElement('span', { style: { width: 160 } }, 'default variant, unwatched:'),
        React.createElement(WatchButton, { itemType: 'reg', itemId: 'd-unwatched', initialWatched: false }),
      ),
      React.createElement('div', { style: { display: 'flex', gap: 16, alignItems: 'center' } },
        React.createElement('span', { style: { width: 160 } }, 'default variant, watched (rest):'),
        React.createElement(WatchButton, { itemType: 'reg', itemId: 'd-watched', initialWatched: true }),
      ),
      React.createElement('div', { style: { display: 'flex', gap: 16, alignItems: 'center' } },
        React.createElement('span', { style: { width: 160 } }, 'default variant, watched (hover -> Unwatch):'),
        React.createElement(WatchButton, { itemType: 'reg', itemId: 'd-watched-hover', initialWatched: true }),
      ),
    )
  );
};
`;

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch(
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}
  );

  // ── 1.1: Dashboard "All N immediate" link, populated state ──────────────────────────────────
  {
    const bundleJs = await bundleEntry(DASHBOARD_ENTRY);
    const state = DASHBOARD_STATES.find((s) => s.label === 'one-row');
    const page = await newSmokePage(browser);
    await page.setViewportSize({ width: 1440, height: 900 });
    await mountBundle(page, bundleJs, '__mount', state.props);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
    const out = join(OUT_DIR, '1.1-dashboard-fixture.png');
    await page.screenshot({ path: out, fullPage: true });
    console.log(`wrote ${out}`);
    await page.close();
  }

  // ── 3.5: WatchButton star/label states ───────────────────────────────────────────────────────
  // Two of the six rows are labelled "(hover -> Unwatch)" and must show the hover swap in the
  // final image; hovering both with Playwright's real mouse in one page fires a mouseleave on the
  // first the moment the mouse moves to the second (real-browser semantics), so each is captured
  // in its own page/screenshot and merged isn't needed — the row-variant capture also shows every
  // OTHER row correctly at rest, so nothing is lost.
  {
    const bundleJs = await bundleEntry(WATCHBUTTON_ENTRY);
    const page = await newSmokePage(browser);
    await page.setViewportSize({ width: 900, height: 500 });
    await mountBundle(page, bundleJs, '__mount', {});
    // Entry declares 4 watched buttons in order: row-rest, row-hover-demo, default-rest,
    // default-hover-demo — all four share the same title text ("Watching — click to unwatch"),
    // so they are addressed by declaration order, not by title uniqueness.
    const hoverTargets = await page.$$('button[title="Watching — click to unwatch"]');
    if (hoverTargets.length !== 4) throw new Error(`expected 4 watched buttons, found ${hoverTargets.length}`);
    await hoverTargets[1].hover(); // row variant's "-hover" demo row
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
    const out1 = join(OUT_DIR, '3.5-watchbutton-states-row-hover.png');
    await page.screenshot({ path: out1, fullPage: true });
    console.log(`wrote ${out1}`);
    // Move away, then hover the default variant's "-hover" demo row (the row-variant one reverts
    // to its rest label once the mouse leaves it, which is correct, expected behaviour).
    await page.mouse.move(0, 0);
    await hoverTargets[3].hover();
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
    const out2 = join(OUT_DIR, '3.5-watchbutton-states-default-hover.png');
    await page.screenshot({ path: out2, fullPage: true });
    console.log(`wrote ${out2}`);
    await page.close();
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
