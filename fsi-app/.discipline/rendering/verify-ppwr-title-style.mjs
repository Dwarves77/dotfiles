// GAP G4 (2026-09-07, TRAIN-57 dispatch, AUDIT-2026-09-07 item 1.2): mounts RegulationDetailSurface
// with the EXACT production title/slug the operator's audit named ("EU Packaging and Packaging Waste
// Regulation (PPWR)" / eu-ppwr-2025-40) and asserts the rendered [data-guard-title] element's
// computed style is Anton/uppercase/letter-spacing 0.04em — never a synthetic long-title fixture
// standing in for the literal reported string. Reuses the SAME fixture the detail-surfaces-smoke.mjs
// spec's own REGULATION_STATES now carries (the 'ppwr-production-title-verbatim' state), never a
// second copy. Not part of the discipline gate set (one-off verification); run by hand.
//
// Usage: NO_PROXY="$NO_PROXY,smoke-guard.internal" PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers \
//   node .discipline/rendering/verify-ppwr-title-style.mjs

import { createRequire } from 'node:module';
import { bundleEntry, newSmokePage, mountBundle } from './smoke/harness.mjs';
import { REGULATION_ENTRY, REGULATION_STATES, ALIAS } from './smoke/detail-surfaces-smoke.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');

async function main() {
  const state = REGULATION_STATES.find((s) => s.label === 'ppwr-production-title-verbatim');
  if (!state) throw new Error('ppwr-production-title-verbatim state not found in REGULATION_STATES');

  const bundleJs = await bundleEntry(REGULATION_ENTRY, { alias: ALIAS });
  const browser = await chromium.launch();
  try {
    const page = await newSmokePage(browser);
    await page.setViewportSize({ width: 1440, height: 900 });
    await mountBundle(page, bundleJs, '__mount', state.props);
    await page.waitForTimeout(200);

    const result = await page.evaluate(() => {
      const el = document.querySelector('[data-guard-title]');
      if (!el) return { found: false };
      const cs = getComputedStyle(el);
      return {
        found: true,
        text: el.textContent,
        fontFamily: cs.fontFamily,
        fontWeight: cs.fontWeight,
        textTransform: cs.textTransform,
        letterSpacing: cs.letterSpacing,
        fontSize: cs.fontSize,
      };
    });

    console.log(JSON.stringify(result, null, 2));

    if (!result.found) {
      console.error('FAIL: no [data-guard-title] element found for the PPWR fixture');
      process.exitCode = 1;
      return;
    }
    const okTransform = result.textTransform === 'uppercase';
    const okFont = /anton/i.test(result.fontFamily);
    // letterSpacing 0.04em at font-size 28 = 1.12px (browser reports px, not em)
    const px = parseFloat(result.letterSpacing);
    const expectedPx = parseFloat(result.fontSize) * 0.04;
    const okSpacing = Math.abs(px - expectedPx) < 0.15;
    if (okTransform && okFont && okSpacing) {
      console.log('PASS: PPWR production title renders Anton/uppercase/0.04em');
    } else {
      console.error(`FAIL: transform=${okTransform} font=${okFont}(${result.fontFamily}) spacing=${okSpacing}(${result.letterSpacing} vs expected ~${expectedPx}px)`);
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
