// Surface verification (lane METERFIX, 2026-09-08). Not a gate; run by hand, evidence for the
// lane report.
//
// THE QUESTION IT ANSWERS. The row-variant impact meter mounts on every list surface plus the
// dashboard's Due-next and What-changed tables. The fix is in the shared part, so it reaches all of
// them by construction, but "by construction" is an inference, and CLAUDE.md rule 14 wants the
// measurement. This mounts each surface's REAL composition (reusing the design audit's own mounts,
// never a second fixture set), scores that surface's fixture rows [0,0,0,2], and reads the rendered
// bar heights out of chromium at 1440 and 390.
//
// HOW THE INJECTION WORKS. Each compose entry bakes its fixture array as JSON. Every surface builds
// its row's meter through `impact: r.impactScores ?? scoreResource(r)` (src/lib/list-row-fields.ts,
// the four ledgers, and WatchlistSurface's own equivalent), so setting `impactScores` on the fixture
// objects is enough to make that surface render partially scored meters, one string insertion after
// each object's `"id"`, the same for every surface, nothing else about the mount changed.
//
// PASS = the surface renders at least one partially scored meter, every meter has four bars, and no
// bar is below 1px tall.
//
// Usage: NO_PROXY="$NO_PROXY,smoke-guard.internal" PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers \
//   node .discipline/rendering/verify-meterfix-surfaces.mjs

import { createRequire } from 'node:module';
import { bundleEntry, newSmokePage, mountBundle } from './smoke/harness.mjs';
import { fullAppCss, fullAppCssCompiled } from './smoke/smoke-fixtures.mjs';
import { AUDIT_MOUNTS } from './audit/mounts.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');

const PARTIAL = '"impactScores":{"cost":0,"compliance":0,"client":0,"operational":2},';

/** The surfaces the meter mounts on, and the id pattern of that surface's fixture objects.
 *  EVERY fixture row is scored [0,0,0,2] rather than only the first: several of these surfaces
 *  band, cap or facet their fixtures, so "the first object in the array" is not reliably a row that
 *  reaches the DOM (compose-04-market renders 16 of its 20, compose-11-watchlist 6). Scoring them
 *  all removes that ambiguity, and the assertion below is per-meter either way. */
const SURFACES = [
  { mount: 'compose-01-dashboard', label: 'Dashboard (Due next + What changed)', idPattern: /"id":"r\d+",/g },
  { mount: 'compose-02-regulations', label: 'Regulations list', idPattern: /"id":"reg-\d+",/g },
  { mount: 'compose-04-market', label: 'Market list', idPattern: /"id":"mkt-\d+",/g },
  { mount: 'compose-06-research', label: 'Research list', idPattern: /"id":"res-\d+",/g },
  { mount: 'compose-08-operations', label: 'Operations list', idPattern: /"id":"ops-\d+",/g },
  { mount: 'compose-11-watchlist', label: 'Watchlist', idPattern: /"id":"wl-\d+",/g },
];

function inject(entry, idPattern) {
  let n = 0;
  // compose-11-watchlist's fixture already carries its own `impactScores` (3/3/2/2) LATER in the
  // same object, and the last key wins at parse time, so any existing one is stripped first.
  const stripped = entry.replace(/"impactScores":\{[^{}]*\},?/g, '');
  const out = stripped.replace(idPattern, (m) => {
    n++;
    return m + PARTIAL;
  });
  if (n === 0) throw new Error(`no fixture object matched ${idPattern}`);
  return { out, n };
}

async function measure(page) {
  return page.evaluate(() => {
    const meters = [...document.querySelectorAll('.cl-impact-scored')];
    return meters.map((m) => ({
      bars: [...m.querySelectorAll('.cl-impact-bar')].map((b) => ({
        score: b.getAttribute('data-score'),
        height: getComputedStyle(b).height,
      })),
      sum: (m.querySelector(':scope > span:last-child') || {}).textContent || null,
    }));
  });
}

async function main() {
  const browser = await chromium.launch();
  let failures = 0;
  try {
    for (const s of SURFACES) {
      const cfg = AUDIT_MOUNTS[s.mount];
      if (!cfg) throw new Error(`no mount ${s.mount}`);
      const { out: patched, n: injected } = inject(cfg.entry, s.idPattern);
      const bundleJs = await bundleEntry(patched, { alias: cfg.alias || {} });
      for (const width of [1440, 390]) {
        const page = await newSmokePage(browser, { apiRoutes: cfg.apiRoutes || [] });
        try {
          await page.setViewportSize({ width, height: 1400 });
          if (cfg.needsCompiledCss) {
            await page.addStyleTag({ content: await fullAppCssCompiled() });
          } else {
            await page.addStyleTag({ content: fullAppCss() });
          }
          await mountBundle(page, bundleJs, '__mount', {});
          await page.waitForTimeout(400);
          const meters = await measure(page);
          const partial = meters.filter((m) => m.bars.some((b) => b.score === '0'));
          const badCount = meters.filter((m) => m.bars.length !== 4);
          const invisible = meters.flatMap((m) => m.bars.filter((b) => parseFloat(b.height) < 1));
          // The surface must render at least one PARTIALLY scored meter (proving the injection
          // reached the DOM on this surface), and EVERY meter it renders must carry four bars with
          // ink in all of them. `partial.length === meters.length` would be wrong for the dashboard,
          // whose What-changed rows are built from a separate change-feed fixture the id pattern
          // does not cover.
          const ok = meters.length > 0 && partial.length > 0 && badCount.length === 0 && invisible.length === 0;
          if (!ok) failures++;
          const shape = partial[0] ? partial[0].bars.map((b) => `${b.score}:${b.height}`).join(' ') : 'none';
          console.log(
            `${ok ? 'PASS' : 'FAIL'}  ${s.label} @${width}  injected=${injected}  meters=${meters.length}  partial=${partial.length}  ` +
              `four-bar-violations=${badCount.length}  invisible-bars=${invisible.length}  partialShape=[${shape}] sum=${partial[0] ? partial[0].sum : '-'}`
          );
        } finally {
          await page.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
  console.log(failures === 0 ? '\nALL SURFACES PASS' : `\n${failures} SURFACE LEG(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
