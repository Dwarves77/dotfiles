// RD-82 enforcer (lane MASTHEAD-AUTH, 2026-09-24): "no heading or title renders narrower than its
// longest word, and no title is measured on a fallback face."
//
// Proven by attack in a real chromium (CLAUDE.md rule 15), against the harness's own code paths:
//   1. the REAL /login page (the design audit's compose-login mount, the layout guard's own mount)
//      at 1440 with the pre-fix Masthead rule re-injected verbatim (the 1440 grid applied to a
//      masthead with no command bar) MUST produce an L13 finding, and the same page without it MUST
//      NOT. This is the defect the operator photographed, reproduced on demand rather than trusted
//      to a one-off run;
//   2. the in-page collector (ux-assert TITLE_WORDS_SRC) reports a zero-WIDTH title. The first run
//      of this rule missed /login entirely because a "width and height" visibility test called a
//      0.0px-wide, 176px-tall title invisible;
//   3. the precondition `verifyFontsLoaded` (smoke-fixtures.mjs) FAILS on a page whose stylesheet
//      lacks the @font-face declarations and passes on the compiled app stylesheet the guard mounts.
//
// Self-skips (diagnosably) where playwright is not installed, the posture of rd-80-real-fonts and
// layout-guard.npmtest.mjs's real-chromium tests.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function skipIfNoPlaywright(t) {
  try {
    require.resolve('playwright');
    return false;
  } catch {
    t.skip('playwright is not installed in this lane; ux-assert.test.mjs proves the pure detector without a browser, and this test runs for real wherever `npm install --no-save playwright@1.61.1` has been run');
    return true;
  }
}

// The Masthead rule as it stood on master 44187dfa (Masthead.tsx, `@media (min-width: 1440px)`),
// unscoped: the grid reserved the command bar's 420px column on every masthead.
const PRE_FIX_MASTHEAD_RULE = `@media (min-width: 1440px) {
  .cl-masthead .cl-masthead-row { display: grid !important; grid-template-columns: minmax(0,1fr) 420px !important; align-items: end !important; gap: 10px 24px !important; }
  .cl-masthead .cl-masthead-titleblock { flex: none !important; }
}`;

async function measureLogin(browser, extraCss) {
  const { bundleEntry, newSmokePage, mountBundle } = await import('./smoke/harness.mjs');
  const { fullAppCssCompiled, verifyFontsLoaded } = await import('./smoke/smoke-fixtures.mjs');
  const { AUDIT_MOUNTS, mountExtraCss } = await import('./audit/mounts.mjs');
  const { collectLayout } = await import('./layout-guard/collect.mjs');
  const { checkL13 } = await import('./layout-guard/rules.mjs');
  const mount = AUDIT_MOUNTS['compose-login'];
  const js = await bundleEntry(mount.entry, { alias: mount.alias || {} });
  const page = await newSmokePage(browser, { apiRoutes: mount.apiRoutes || [] });
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addStyleTag({ content: await fullAppCssCompiled() });
    const extra = mountExtraCss(mount);
    if (extra) await page.addStyleTag({ content: extra });
    await mountBundle(page, js, '__mount', null);
    if (extraCss) await page.addStyleTag({ content: extraCss });
    await page.waitForTimeout(200);
    assert.deepEqual(await verifyFontsLoaded(page), [], 'the guard mount must carry the declared faces before anything is measured');
    const bundle = await collectLayout(page);
    return checkL13({ ...bundle, route: '/login', width: 1440 });
  } finally {
    await page.close();
  }
}

test('RD-82 / L13: the real /login page FAILS with the pre-fix Masthead rule and PASSES without it', async (t) => {
  if (skipIfNoPlaywright(t)) return;
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  try {
    const red = await measureLogin(browser, PRE_FIX_MASTHEAD_RULE);
    assert.equal(red.length, 1, `RED: exactly the Masthead title must be reported, got ${JSON.stringify(red)}`);
    assert.match(red[0].element, /^h1\[Sign in\]/);
    assert.match(red[0].measured, /^content box 0px < longest word "Sign" 51\.3px$/, 'the measured numbers are the ones taken from master on 2026-09-24');
    const green = await measureLogin(browser, null);
    assert.deepEqual(green, [], `GREEN: no title narrower than its longest word, got ${JSON.stringify(green)}`);
  } finally {
    await browser.close();
  }
});

test('RD-82: the collector reports a zero-width title (the visibility hole the first run hit)', async (t) => {
  if (skipIfNoPlaywright(t)) return;
  const { chromium } = require('playwright');
  const { TITLE_WORDS_SRC, TITLE_WORDS_SELECTOR, detectWordBrokenTitles } = await import('./ux-assert.mjs');
  const { fontFaceCss } = await import('./smoke/smoke-fixtures.mjs');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.setContent(
      `<!doctype html><html><head><style>${fontFaceCss()}</style></head><body>
        <div style="display:grid;grid-template-columns:minmax(0,1fr) 420px;width:330px">
          <h1 id="squeezed" style="font:400 28px 'Anton';text-transform:uppercase;letter-spacing:.04em;word-break:break-word;margin:0">Sign in</h1>
        </div>
        <div style="width:330px"><h2 style="font:400 28px 'Anton';text-transform:uppercase;margin:0">Sign in</h2></div>
      </body></html>`,
      { waitUntil: 'load' },
    );
    await page.evaluate(async () => { await document.fonts.load("400 28px 'Anton'"); await document.fonts.ready; });
    const titles = await page.evaluate(({ src, sel }) => new Function(`return (${src})`)()(sel), { src: TITLE_WORDS_SRC, sel: TITLE_WORDS_SELECTOR });
    const h1 = titles.find((x) => x.name.startsWith('h1'));
    const h2 = titles.find((x) => x.name.startsWith('h2'));
    assert.ok(h1, 'the 0px-wide title must be collected, not skipped as invisible');
    assert.equal(Math.round(h1.contentWidth), 0);
    assert.ok(h1.longestWordWidth > 40, `the longest word is measured in Anton, uppercase: ${h1.longestWordWidth}`);
    assert.equal(detectWordBrokenTitles([h1]).length, 1, 'RED: the squeezed title fires');
    assert.equal(detectWordBrokenTitles([h2]).length, 0, 'GREEN: the same words in a 330px box do not');
    await page.close();
  } finally {
    await browser.close();
  }
});

test('RD-82 precondition: verifyFontsLoaded FAILS without the declared faces and PASSES with the guard stylesheet', async (t) => {
  if (skipIfNoPlaywright(t)) return;
  const { chromium } = require('playwright');
  const { verifyFontsLoaded, fontFaceCss, REQUIRED_FONT_CHECKS } = await import('./smoke/smoke-fixtures.mjs');
  const browser = await chromium.launch();
  try {
    const red = await browser.newPage();
    await red.setContent("<!doctype html><html><body><h1 style=\"font-family:'Anton'\">Sign in</h1></body></html>", { waitUntil: 'load' });
    const missing = await verifyFontsLoaded(red);
    assert.deepEqual([...missing].sort(), [...REQUIRED_FONT_CHECKS].sort(), 'RED: with no @font-face every declared face is reported, so nothing is measured on a fallback');
    await red.close();

    const green = await browser.newPage();
    await green.setContent(`<!doctype html><html><head><style>${fontFaceCss()}</style></head><body><h1 style="font-family:'Anton'">Sign in</h1></body></html>`, { waitUntil: 'load' });
    assert.deepEqual(await verifyFontsLoaded(green), [], 'GREEN: the declared faces load and verify');
    await green.close();
  } finally {
    await browser.close();
  }
});
