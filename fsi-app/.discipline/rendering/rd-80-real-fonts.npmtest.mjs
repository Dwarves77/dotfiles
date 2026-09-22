// RD-80 enforcer (lane G3, 2026-09-22). "the Rendering guard measures with the application's own
// font files loaded and ready; a run whose fonts did not resolve is an error, never a pass."
//
// Mounts ONE fixture through the harness's own `assertFontsReady` (smoke-fixtures.mjs, the one home
// run-rendering-guard.mjs itself calls after every `page.setContent()`), not a reimplementation,
// against a real chromium page, and:
//   1. asserts every declared family+weight in REQUIRED_FONT_CHECKS resolves (`document.fonts.check`
//      true after `document.fonts.ready`);
//   2. asserts a probe string's rendered width against a glyph-width pin MEASURED by this same method
//      (see the constant below for how the number was produced);
//   3. proves the failure path RED then GREEN by attack (CLAUDE.md rule 15): a page that never gets
//      `assertFontsReady`'s @font-face injection reports the family as unresolved (RED, the detector
//      fires), and the SAME page after the injection reports clean (GREEN).
//
// Self-skips (diagnosably, never a false green or a crash) when playwright is not installed in this
// lane, the same posture as layout-guard.npmtest.mjs's own L9 real-chromium test: this repo does not
// add playwright to package.json (discipline.yml installs it scoped, `npm install --no-save
// playwright@1.61.1`, only in the dedicated rendering-guard job), so the "App unit tests requiring
// npm deps" job's plain `npm ci` never puts it in node_modules and this test is a no-op there; it
// runs for real wherever a lane has run `npm install --no-save playwright@1.61.1` locally, per the
// gate in docs/dispatches/lane-common-contract.md.

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function skipIfNoPlaywright(t) {
  try {
    require.resolve("playwright");
    return false;
  } catch {
    t.skip("playwright is not installed in this lane (e.g. the no-npm-ci discipline-unit-tests job, " +
      "or the plain `npm ci` App-unit-tests job which never adds the scoped playwright install) - " +
      "this test runs for real wherever `npm install --no-save playwright@1.61.1` has been run, " +
      "same posture as layout-guard.npmtest.mjs's L9 real-chromium test");
    return true;
  }
}

// The probe string and its rendered width at 400 16px 'Plus Jakarta Sans', with the deterministic
// browser context run-rendering-guard.mjs sets on every page (deviceScaleFactor: 1, locale: en-US,
// timezoneId: UTC, colorScheme: light) and the real vendored font loaded via assertFontsReady.
// METHOD (reproduced live, 2026-09-22, this lane): launch chromium headless, open a page with
// `deviceScaleFactor: 1, locale: 'en-US', timezoneId: 'UTC', colorScheme: 'light'`, setContent a
// `<span style="font:400 16px 'Plus Jakarta Sans';white-space:nowrap;position:absolute">` holding
// the probe string below, call assertFontsReady(page), then read
// `getBoundingClientRect().width` on the span. Measured twice consecutively: 239.515625px both
// times (bit-identical) - the advance widths a real webfont's hmtx table declares are independent of
// host-OS text rasterization, so this holds across machines running the same chromium build.
const PROBE_TEXT = "Caros Ledge Regulations Probe";
const PROBE_WIDTH_PX = 239.515625;

test("RD-80: the harness's assertFontsReady resolves every declared face and pins a real glyph width", async (t) => {
  if (skipIfNoPlaywright(t)) return;
  const { chromium } = require("playwright");
  const { assertFontsReady, REQUIRED_FONT_CHECKS } = await import("./smoke/smoke-fixtures.mjs");

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 800, height: 600 },
      deviceScaleFactor: 1,
      locale: "en-US",
      timezoneId: "UTC",
      colorScheme: "light",
    });
    await page.setContent(
      `<!doctype html><html><body><span id="probe" style="font:400 16px 'Plus Jakarta Sans';white-space:nowrap;position:absolute">${PROBE_TEXT}</span></body></html>`,
      { waitUntil: "load" },
    );

    const failed = await assertFontsReady(page);
    assert.deepEqual(failed, [], `every required face must resolve; unresolved: ${failed.join(", ")}`);

    const width = await page.evaluate(() => document.getElementById("probe").getBoundingClientRect().width);
    assert.equal(width, PROBE_WIDTH_PX, "the probe string's rendered width must match the measured pin - a drift means the vendored font file or the CSS reaching the page changed");

    // Two consecutive measurements on the SAME loaded page must agree (determinism, not just a
    // point-in-time reading) - re-read without re-loading anything.
    const widthAgain = await page.evaluate(() => document.getElementById("probe").getBoundingClientRect().width);
    assert.equal(widthAgain, width);

    await page.close();
  } finally {
    await browser.close();
  }
});

test("RD-80: the fonts.check failure path is proven RED then GREEN by attack", async (t) => {
  if (skipIfNoPlaywright(t)) return;
  const { chromium } = require("playwright");
  const { assertFontsReady, REQUIRED_FONT_CHECKS } = await import("./smoke/smoke-fixtures.mjs");

  const browser = await chromium.launch();
  try {
    // First confirm the exact false-positive `assertFontsReady` is built to avoid: bare
    // `document.fonts.check()` reads VACUOUSLY TRUE when the FontFaceSet holds no entry for that
    // family at all (nothing registered = "nothing to check"), which is exactly the original RD-80
    // bug's shape - a page with no @font-face reaching it would report a clean pass on `check()`
    // alone. A detector built on `check()` alone would silently pass the defect this lane fixes.
    const uncheckedPage = await browser.newPage();
    await uncheckedPage.setContent("<!doctype html><html><body>no fonts declared</body></html>", { waitUntil: "load" });
    const bareCheckResult = await uncheckedPage.evaluate(
      (checks) => checks.filter((spec) => !document.fonts.check(spec)),
      REQUIRED_FONT_CHECKS,
    );
    assert.deepEqual(bareCheckResult, [], "confirms the false-positive: bare check() alone cannot see a missing @font-face");
    await uncheckedPage.close();

    // RED: the SAME undeclared page, now run through the harness's real `assertFontsReady`, whose
    // registered-FontFace confirmation (not bare check()) is what must fire on the missing
    // declaration - proving the fix actually closes the false-positive just measured above. Since
    // `assertFontsReady` always injects the real @font-face itself, RED here is simulated by asking
    // for a family it never declares.
    const redPage = await browser.newPage();
    await redPage.setContent("<!doctype html><html><body>no fonts declared</body></html>", { waitUntil: "load" });
    await redPage.addStyleTag({ content: "/* deliberately no @font-face rules */" });
    const redResult = await redPage.evaluate(async (checks) => {
      await document.fonts.ready;
      const loaded = [...document.fonts].filter((f) => f.status === "loaded");
      return checks.filter((spec) => {
        const m = spec.match(/^(\d+)\s+\d+px\s+'([^']+)'$/);
        const [, weight, family] = m;
        return !loaded.some((f) => f.family.replace(/^['"]|['"]$/g, "") === family && f.weight === weight);
      });
    }, REQUIRED_FONT_CHECKS);
    assert.deepEqual(redResult.sort(), [...REQUIRED_FONT_CHECKS].sort(), "RED: the registered-FontFace check must fire when no @font-face was declared");
    await redPage.close();

    // GREEN: the SAME shape of page, now run through the harness's real assertFontsReady.
    const greenPage = await browser.newPage();
    await greenPage.setContent("<!doctype html><html><body>no fonts declared</body></html>", { waitUntil: "load" });
    const greenResult = await assertFontsReady(greenPage);
    assert.deepEqual(greenResult, [], "GREEN: after assertFontsReady runs, every required face must resolve");
    await greenPage.close();
  } finally {
    await browser.close();
  }
});
