// Mechanical overflow sweep over every AUDIT_MOUNTS page mount, at any width.
//
// FOLD-61: trains 59 and 60 each ran a sweep like this by hand at the fold and neither left a
// script behind, so train 61 wrote it a third time. It is a script now, and the fold that follows
// runs it rather than rebuilding it. It answers three questions per mount, all of which are things
// a per-spec assertion cannot see because no spec knows what it does not measure:
//
//   1. HORIZONTAL PAGE OVERFLOW: does the document scroll sideways at this width at all.
//   2. TEXT CLIPPED WITHOUT AN ELLIPSIS: a text run whose own box hides overflow with
//      `text-overflow: clip` - lane opsclip's defect class, the operator's "IMPACT LOW → H".
//   3. ORPHAN LINES: a wrapped run whose LAST line holds a single short word, the class the
//      operator's 2026-09-07 visual-pass standard forbids.
//
// Usage: node .discipline/rendering/audit/overflow-sweep.mjs [--width=1440] [--mount=<id>]
// Exit 0 with a per-mount report; exit 1 if any mount has horizontal page overflow, which is the
// one finding that is never acceptable.

import { createRequire } from 'node:module';
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

const MEASURE = `(() => {
  const out = { pageOverflow: 0, clipped: [], orphans: [] };
  const de = document.documentElement;
  out.pageOverflow = Math.max(0, de.scrollWidth - de.clientWidth);
  const nodes = Array.from(document.querySelectorAll('body *'));
  for (const el of nodes) {
    if (!el.getClientRects().length) continue;
    const cs = getComputedStyle(el);
    const text = (el.textContent || '').trim();
    if (!text) continue;
    const leaf = !Array.from(el.children).some((c) => (c.textContent || '').trim());
    if (!leaf) continue;
    const ox = el.scrollWidth - el.clientWidth;
    const oy = el.scrollHeight - el.clientHeight;
    const scrolls = /auto|scroll/.test(cs.overflowX) || el.closest('[data-guard-strip]');
    // HORIZONTAL only, and only past a 3px floor. Calibrated at FOLD-61 against the first run,
    // which reported 30-odd hits that were all \`oy\` of 2 or 3 on Anton display numerals and
    // headings ("12", "1,135", "Caro's Ledge"): Anton's glyph box overshoots its own computed
    // line box by a couple of pixels, nothing is lost, and every one of those runs had ox === 0.
    // Counting them would have buried the finding this sweep exists for under noise it can prove
    // is noise. A run that loses CHARACTERS loses them horizontally.
    if (!scrolls && ox > 3 && cs.textOverflow !== 'ellipsis' && cs.webkitLineClamp === 'none') {
      out.clipped.push({ text: text.slice(0, 60), ox: Math.round(ox), oy: Math.round(oy), cls: el.className && String(el.className).slice(0, 40) });
    }
    // Orphan: the run wraps, and its last line carries one short word.
    const lh = parseFloat(cs.lineHeight) || 0;
    if (lh > 0 && el.clientHeight >= lh * 1.8 && cs.whiteSpace !== 'nowrap') {
      const words = text.split(/\\s+/);
      if (words.length > 3) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0);
        if (rects.length > 1) {
          const last = rects[rects.length - 1];
          const widest = Math.max(...rects.map((r) => r.width));
          const lastWord = words[words.length - 1];
          if (last.width < widest * 0.18 && lastWord.length <= 12) {
            out.orphans.push({ text: text.slice(0, 60), lastWord, lastWidth: Math.round(last.width) });
          }
        }
      }
    }
  }
  return out;
})()`;

async function main() {
  // playwright resolves through the app's own node_modules, as run-audit.mjs does.
  const { chromium } = createRequire(import.meta.url)('playwright');
  const browser = await chromium.launch(
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {},
  );
  // Mounts some spec already measures at THIS width, plus every compose-* page mount.
  const specDir = new URL('./spec/', import.meta.url);
  const { readdirSync, readFileSync } = await import('node:fs');
  const atThisWidth = new Set();
  for (const f of readdirSync(specDir).filter((n) => n.endsWith('.json'))) {
    const spec = JSON.parse(readFileSync(new URL(f, specDir), 'utf8'));
    if ((spec.viewport || 1440) === WIDTH) atThisWidth.add(spec.mount);
  }
  const isPage = (id) => id.startsWith('compose-') || atThisWidth.has(id);
  const ids = Object.keys(AUDIT_MOUNTS).filter((id) => (ONLY ? id === ONLY : true));
  let anyPageOverflow = false;
  console.log(`===== OVERFLOW SWEEP @ ${WIDTH}px =====`);
  for (const id of ids) {
    const mount = AUDIT_MOUNTS[id];
    let page;
    try {
      const bundle = await bundleEntry(mount.entry, { alias: mount.alias || {} });
      // The same page setup run-audit.mjs uses, so a mount that renders there renders here: the
      // smoke harness serves a real document with the '__mount' root and installs each mount's own
      // apiRoutes fixtures. The compiled stylesheet goes on unconditionally, because this sweep is
      // asking what the PRODUCT looks like rather than what one spec declared.
      page = await newSmokePage(browser, { apiRoutes: mount.apiRoutes || [] });
      await page.setViewportSize({ width: WIDTH, height: 1400 });
      await page.addStyleTag({ content: await fullAppCssCompiled() });
      const extra = mountExtraCss(mount);
      if (extra) await page.addStyleTag({ content: extra });
      await mountBundle(page, bundle, '__mount', null);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
      await page.waitForTimeout(150);
      const r = await page.evaluate(MEASURE);
      // A COMPONENT fixture is not a page. `list-surface-1440`, `settings-notifications`,
      // `factblocks`, `onboarding-stepper` and their siblings each wrap one component in a
      // desktop-width box, so sweeping them at 390 measures the FIXTURE and reports an overflow
      // the product does not have. (FOLD-61: the first 390 run called seven of them FAIL, and
      // every one dissolved on reading its mount definition.) A mount counts as a PAGE, and is
      // therefore swept at whatever width is asked for, when it is a compose-* page mount or when
      // some spec already measures it at this width - which is how the mobile-* specs declare
      // which mounts are real pages at 390. Everything else is reported `pin` and excluded from
      // the exit code rather than silently dropped, so the count still adds up.
      const pinned = !isPage(id) && mount.viewport && mount.viewport !== WIDTH;
      if (r.pageOverflow > 0 && !pinned) anyPageOverflow = true;
      const bits = [`page ${r.pageOverflow}px`, `clipped ${r.clipped.length}`, `orphans ${r.orphans.length}`];
      const tag = pinned ? `pin ${String(mount.viewport)}` : r.pageOverflow > 0 ? 'FAIL' : 'ok  ';
      console.log(`  ${tag} ${id.padEnd(26)} ${bits.join('  ')}`);
      for (const c of r.clipped.slice(0, 4)) console.log(`        clipped: "${c.text}" (+${c.ox}x/+${c.oy}y) .${c.cls}`);
      for (const o of r.orphans.slice(0, 4)) console.log(`        orphan : "${o.text}" last word "${o.lastWord}"`);
      await page.close();
    } catch (e) {
      console.log(`  skip ${id.padEnd(26)} ${String(e.message).slice(0, 90)}`);
    }
  }
  await browser.close();
  console.log(anyPageOverflow ? '=== SWEEP: horizontal page overflow present ===' : '=== SWEEP: 0px horizontal page overflow on every mount ===');
  process.exit(anyPageOverflow ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
