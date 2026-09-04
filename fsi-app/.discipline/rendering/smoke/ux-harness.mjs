// UX smoke harness (2026-09-03, RD-60). One function turns a declarative spec — a bundle entry that
// mounts REAL `src/components/**` row components, the fetch routes it needs answered, and a list of
// states (props) — into a run over MOBILE and DESKTOP viewports that measures every state with the
// rendering guard's detectors (measureGuard: overflow + placeholder) AND the UX detectors (measureUx:
// law-2 target floor, squeezed-title wrap). Specs stay data; the measurement lives here once.
//
// Same posture as harness.mjs: esbuild bundle of the real .tsx, fake same-origin URL, page.route for
// every fetch, no network, no database, no credential. Imports esbuild transitively via harness.mjs, so
// this file is NOT in the no-npm node --test suite; its pure core (ux-assert.mjs) is.

import { bundleEntry, newSmokePage, mountBundle, measureGuard, assertGuardClean } from './harness.mjs';
import { measureUx, assertUxClean } from '../ux-assert.mjs';

/** iPhone-class portrait viewport (the operator's device class, 2026-09-03 screenshots). */
export const MOBILE_VIEWPORT = Object.freeze({ width: 375, height: 812 });
export const DESKTOP_VIEWPORT = Object.freeze({ width: 1280, height: 800 });
// not exported (lane DEAD-EXEC, 2026-09-04): used only within this file (the viewport loop below), per
// the wiring audit's Appendix B (dead exports, 2026-09-04) — MOBILE_VIEWPORT/DESKTOP_VIEWPORT above
// remain exported since other callers import them individually.
const UX_VIEWPORTS = Object.freeze([MOBILE_VIEWPORT, DESKTOP_VIEWPORT]);

/**
 * @param {object} browser Playwright browser (the runner's single chromium instance)
 * @param {object} spec
 * @param {string} spec.name          short id for failure lines (e.g. "market-rows")
 * @param {string} spec.entry         TSX entry defining `window.__mount(props)` (see list-order-smoke.mjs)
 * @param {Array}  [spec.apiRoutes]   [{ urlGlob, handler }] answered by fixture data
 * @param {Array}  spec.states        [{ label, props, expectTitles?: number }] — each mounted and measured at
 *                                    every UX viewport; `expectTitles` (optional) asserts that at least that
 *                                    many `[data-guard-title]` elements rendered, so a spec cannot pass by
 *                                    rendering nothing.
 * @param {object} [spec.alias]       esbuild alias overrides (harness DEFAULT_ALIAS applies)
 * @returns {Promise<{checks:number, failures:string[]}>}
 */
export async function runUxSpec(browser, spec) {
  const failures = [];
  let checks = 0;
  const bundleJs = await bundleEntry(spec.entry, { alias: spec.alias || {} });
  for (const vp of UX_VIEWPORTS) {
    for (const state of spec.states) {
      const label = `${spec.name}:${state.label}@${vp.width}`;
      const page = await newSmokePage(browser, { apiRoutes: spec.apiRoutes || [] });
      try {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await mountBundle(page, bundleJs, '__mount', state.props);
        // one animation frame so layout settles after the React commit
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
        const guard = await measureGuard(page);
        const ux = await measureUx(page);
        checks += 1;
        failures.push(...assertGuardClean(label, guard));
        failures.push(...assertUxClean(label, ux));
        if (state.expectTitles && ux.titles.length < state.expectTitles) {
          failures.push(`${label}: expected ≥${state.expectTitles} [data-guard-title] element(s), found ${ux.titles.length} (spec cannot pass by rendering nothing)`);
        }
      } finally {
        await page.close();
      }
    }
  }
  return { checks, failures };
}
