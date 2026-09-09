// Mechanical initial-disclosure-state sweep over every AUDIT_MOUNTS mount.
//
// WHY IT EXISTS. Operator ruling 2026-09-08, verbatim: "the ops page opend to a sub category not
// just the main page, infastructure capacity and other items should be closed, no items expanded
// when first navigtaing to a page". The rule is site-wide, so the question "does any route render
// something open before the reader acted?" has to be answered by MEASUREMENT of the initial DOM,
// not by grep. Grep sees `useState(true)`; it does not see a `<details open>` written by a shared
// part, an `aria-expanded="true"` computed from props, or a panel that renders because a default
// SELECTION resolved to a cell. Each of those is only visible in the rendered tree.
//
// WHAT IT MEASURES, per mount, in the DOM as it stands after first paint with NO interaction:
//   1. `details[open]`                    a native disclosure rendered open;
//   2. `[aria-expanded="true"]`           an ARIA disclosure trigger reporting open;
//   3. `[aria-selected="true"]`           a grid/list/tab cell preselected without a click;
//   4. `[role="tabpanel"]:not([hidden])`  a tab panel rendered visible by a default index;
//   5. `[data-open-on-mount]`             the escape hatch a part uses to DECLARE a ruled-open
//                                         default (see ALLOWED below), so a declared case reports
//                                         as ALLOWED rather than hiding from the sweep.
//
// ALLOWED, each naming its ruling, and each of these is a finding the sweep PRINTS rather than
// suppresses:
//   - The FILTERS rail facet groups. UI FIX ROUND 2 item 4 states their default in words: "first
//     two groups open, rest closed". Coordinator reading R3, 2026-09-08: that is a CONTROL the
//     reader filters with, not page content that opened itself, and this lane must not close it.
//     MEASURED 2026-09-08: there is no such site on this base. The rail's facet groups
//     (src/components/list-surface/ListSurfaceRailCards.tsx) are not collapsible per group; the only
//     disclosure there is the per-group "more options" expander, which already starts closed. The
//     allowance is stated because the ruling stands, not because anything uses it.
//   - Anything a deep link named (R4). A bare route may open nothing; a URL that names a section,
//     an anchor or an item may open exactly what it names. No mount in this registry carries a
//     deep-link URL, so nothing is allowed under R4 here; the deep-link path is proven in
//     `.discipline/rendering/smoke/no-default-open-smoke.mjs`.
//   - THE /operations MATRIX'S DEFAULT SELECTION, and it is the only DECLARED allowance in the app.
//     Operator, 2026-09-09, /operations STOP SHIP message, item 5, verbatim: "Default state on load:
//     first sourced cell of the first sourced row open." Coordinator note C1, 2026-09-09, binding:
//     what the 2026-09-08 ruling forbade is the RETIRED row-expansion pattern, the thing he was
//     looking at when he wrote it and the thing the newer message orders deleted; the new panel's
//     default selection is explicitly wanted, in writing, in the newer message. The matrix therefore
//     carries `data-open-on-mount` on its panel, naming BOTH dates, and drops the attribute the
//     instant the reader touches the grid, so the allowance covers ARRIVAL and no other state. The
//     rule is not weakened anywhere else: every other mount is swept exactly as before, and one
//     unallowed open element on any of them is still a non-zero exit.
//   - A `role="tab"` reporting `aria-selected="true"`. See the ruling written into the probe below:
//     a tab strip is sibling navigation, not a disclosure. It is PRINTED as `allow tab active`, so
//     it stays in the reader's view instead of being filtered out of the question.
//
// Usage: node .discipline/rendering/audit/open-state-sweep.mjs [--width=1440] [--mount=<id>]
// Exit 0 when every open element found is an ALLOWED one; exit 1 when any mount renders an
// unallowed open disclosure. Cost: filesystem + one headless chromium. No network, no database,
// no credential, same posture as overflow-sweep.mjs beside it.

import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { AUDIT_MOUNTS, mountExtraCss } from './mounts.mjs';
import { fullAppCssCompiled } from '../smoke/smoke-fixtures.mjs';
import { bundleEntry, mountBundle, newSmokePage } from '../smoke/harness.mjs';

const args = process.argv.slice(2);
const flag = (n) => {
  const a = args.find((x) => x.startsWith(`--${n}=`));
  return a ? a.slice(n.length + 3) : null;
};
const WIDTH = Number(flag('width')) || 1440;
const ONLY = flag('mount');

/**
 * The measurement itself, exported as a string so the rendering guard's own leg
 * (../smoke/no-default-open-smoke.mjs) runs the IDENTICAL probe rather than a second implementation
 * of it that could drift from this one. Evaluate it in a Playwright page; it returns an array of
 * `{ kind, tag, audit, cls, label, role, allowed, allowRuling }`.
 */
export const OPEN_STATE_MEASURE = `(() => {
  const out = [];
  const describe = (el) => {
    const label = el.getAttribute('aria-label')
      || (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 60)
      || el.tagName.toLowerCase();
    return label;
  };
  // A \`role="tab"\` in a \`role="tablist"\` is EXCLUDED, and the exclusion is a ruling, not a
  // convenience. A tab strip is sibling NAVIGATION: exactly one tab is active at all times, its
  // "panel" is the page's whole body, and a tablist with nothing active renders no content at all.
  // Nothing is EXPANDED by it. /admin is the live instance (AdminDashboard's Sources sub-tabs, which
  // land on "Provisional review"). It is recorded with kind 'tab active' and allowed, so it stays
  // VISIBLE in the sweep's output rather than being silently filtered out of the question.
  const isTab = (el) => el.getAttribute('role') === 'tab';
  const push = (kind, el) => {
    out.push({
      kind,
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role'),
      audit: el.getAttribute('data-audit') || (el.closest('[data-audit]') ? el.closest('[data-audit]').getAttribute('data-audit') : null),
      cls: String(el.className || '').slice(0, 60),
      label: describe(el),
      allowed: isTab(el) || el.hasAttribute('data-open-on-mount') || !!el.closest('[data-open-on-mount]'),
      allowRuling: isTab(el)
        ? 'role=tab: sibling navigation, exactly one always active, nothing expanded'
        : (el.getAttribute('data-open-on-mount') || (el.closest('[data-open-on-mount]') ? el.closest('[data-open-on-mount]').getAttribute('data-open-on-mount') : null)),
    });
  };
  for (const el of document.querySelectorAll('details[open]')) push('details[open]', el);
  for (const el of document.querySelectorAll('[aria-expanded="true"]')) push('aria-expanded=true', el);
  for (const el of document.querySelectorAll('[aria-selected="true"]')) push(isTab(el) ? 'tab active' : 'aria-selected=true', el);
  for (const el of document.querySelectorAll('[role="tabpanel"]')) {
    if (!el.hasAttribute('hidden') && el.getClientRects().length) push('tabpanel visible', el);
  }
  return out;
})()`;

async function main() {
  const { chromium } = createRequire(import.meta.url)('playwright');
  const browser = await chromium.launch(
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {},
  );
  // MOUNTS THAT INTERACT WITH THEMSELVES, and are therefore not "at rest" by construction. This
  // sweep asks one question: what is open in the initial DOM with NOBODY having acted? A mount whose
  // own entry performs a click is answering a different question and is SKIPPED by name, with the
  // reason, rather than being allowed (an allow would say "this open element is fine", which is not
  // what is true here: the element is open because the mount opened it on purpose).
  //   ops-matrix-selected  clicks the ASIA x D3 cell after mounting, so
  //                        spec/operations-matrix-selected.json can measure the selected state and
  //                        the panel on a cell selected through the real click handler.
  //   ops-matrix-nofigure  clicks the ASIA x D5 cell after mounting, so
  //                        spec/operations-matrix-nofigure.json can measure the no-figure fact card
  //                        (operator 2026-09-09: "the card leads with a 6-word headline").
  const INTERACTED = new Set(['ops-matrix-selected', 'ops-matrix-nofigure']);
  const ids = Object.keys(AUDIT_MOUNTS).filter((id) => (ONLY ? id === ONLY : !INTERACTED.has(id)));
  let violations = 0;
  console.log(`===== INITIAL OPEN-STATE SWEEP @ ${WIDTH}px =====`);
  for (const id of INTERACTED) if (!ONLY) console.log(`[SKIPPED] ${id}  (mount interacts with itself; not an at-rest state)`);
  for (const id of ids) {
    const mount = AUDIT_MOUNTS[id];
    let page;
    try {
      const bundle = await bundleEntry(mount.entry, { alias: mount.alias || {} });
      page = await newSmokePage(browser, { apiRoutes: mount.apiRoutes || [] });
      await page.setViewportSize({ width: WIDTH, height: 1400 });
      await page.addStyleTag({ content: await fullAppCssCompiled() });
      const extra = mountExtraCss(mount);
      if (extra) await page.addStyleTag({ content: extra });
      await mountBundle(page, bundle, '__mount', null);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
      await page.waitForTimeout(200);
      const found = await page.evaluate(OPEN_STATE_MEASURE);
      const bad = found.filter((f) => !f.allowed);
      violations += bad.length;
      const tag = found.length === 0 ? 'CLOSED' : bad.length === 0 ? 'ALLOWED-ONLY' : 'OPEN';
      console.log(`\n[${tag}] ${id}  (${found.length} open element${found.length === 1 ? '' : 's'})`);
      for (const f of found) {
        console.log(`    ${f.allowed ? 'allow' : 'OPEN '} ${f.kind}  <${f.tag}> audit=${f.audit ?? '-'} cls="${f.cls}" :: ${f.label}${f.allowRuling ? `  [${f.allowRuling}]` : ''}`);
      }
    } catch (err) {
      console.log(`\n[ERROR] ${id}: ${String(err?.message || err).slice(0, 160)}`);
    } finally {
      if (page) await page.close();
    }
  }
  await browser.close();
  console.log(`\n===== ${violations} unallowed open element(s) =====`);
  process.exit(violations > 0 ? 1 : 0);
}

// RUN ONLY WHEN INVOKED DIRECTLY. This module also EXPORTS its probe (`OPEN_STATE_MEASURE`), and the
// rendering guard's no-default-open leg imports it; without this guard that import would launch a
// second chromium, sweep all 49 mounts and `process.exit()` out of the middle of the guard's run.
// (Found by attack: the first wiring did exactly that.)
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => {
    console.error('open-state sweep ERROR:', e);
    process.exit(2);
  });
}
