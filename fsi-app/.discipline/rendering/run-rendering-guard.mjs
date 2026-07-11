// rendering-guard browser runner (RENDER-1, 2026-07-11). GOVERNING skill: caros-ledge-platform-intent.
//
// Renders every EXTREME-DATA fixture at every app breakpoint tier in a REAL browser (Playwright
// chromium) and measures REAL layout (scrollWidth vs clientWidth) — the measurement jsdom/happy-dom
// cannot do (no layout engine → all zeros). It feeds those measurements to the SAME pure detectors
// the portable node --test suite proves (assertions.mjs), so the browser run cannot disagree with
// the unit proof. This is the guard's mobile/tablet verification: the source chrome audit ran at a
// 1297px browser floor, so < 1200px was never checked — this is the first pass under it.
//
// Assertions per fixture × viewport:
//   1. No horizontal overflow on document.body or any [data-guard-container] (excluding
//      .leaflet-container, which pans internally by design — a known false positive).
//   2. No F-1 placeholder-literal renders as visible cell text in a [data-guard-scan-text] region.
// RED fixtures (reconstructed pre-fix) MUST exhibit their defect (proving the in-browser detector
// fires); GREEN fixtures (current master) MUST be clean at EVERY viewport.
//
// Run: node fsi-app/.discipline/rendering/run-rendering-guard.mjs
// Requires playwright + chromium (installed in the dedicated CI job / locally via
// `npm i --no-save playwright && npx playwright install chromium`). Exit 0 = pass, 1 = a real
// overflow/placeholder finding or a RED fixture that failed to reproduce its defect.

import { chromium } from "playwright";
import { buildFixtures, VIEWPORTS } from "./fixtures.mjs";
import { detectOverflows, findPlaceholderLiterals } from "./assertions.mjs";

async function measure(page) {
  return page.evaluate(() => {
    const els = [document.body, ...document.querySelectorAll("[data-guard-container]")];
    const measurements = els.map((el) => ({
      name: el === document.body ? "body" : (el.getAttribute("data-guard-container") || el.tagName),
      className: el.className || "",
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    const texts = [];
    for (const region of document.querySelectorAll("[data-guard-scan-text]")) {
      for (const cell of region.querySelectorAll("th,td")) texts.push((cell.textContent || "").trim());
    }
    return { measurements, texts };
  });
}

async function main() {
  const fixtures = buildFixtures();
  const browser = await chromium.launch();
  const failures = [];
  const newMobileFindings = [];
  let checks = 0;

  for (const fx of fixtures) {
    for (const width of VIEWPORTS) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.setContent(fx.html, { waitUntil: "load" });
      const { measurements, texts } = await measure(page);
      await page.close();
      checks++;

      const overflows = detectOverflows(measurements);
      const placeholders = findPlaceholderLiterals(texts);
      const isNarrow = width <= 480;

      if (fx.red) {
        // RED fixtures must reproduce their defect (in-browser detector proof). Require the defect
        // at the narrowest tier at minimum; overflow strips reproduce at every tier.
        if (fx.expectOverflow && overflows.length === 0 && isNarrow) {
          failures.push(`${fx.id}@${width}: RED overflow fixture did NOT overflow (detector or fixture broken)`);
        }
        if (fx.expectPlaceholder && placeholders.length === 0) {
          failures.push(`${fx.id}@${width}: RED placeholder fixture rendered NO placeholder literal (detector broken)`);
        }
      } else {
        // GREEN fixtures (current master) must be clean at EVERY viewport.
        if (overflows.length > 0) {
          const detail = overflows.map((o) => `${o.name} +${o.overflowBy}px`).join(", ");
          failures.push(`${fx.id}@${width} [${fx.cls}]: horizontal overflow — ${detail}`);
          if (isNarrow) newMobileFindings.push(`${fx.id}@${width}: ${detail}`);
        }
        if (placeholders.length > 0) {
          failures.push(`${fx.id}@${width} [${fx.cls}]: placeholder literal rendered — ${placeholders.join(", ")}`);
        }
      }
    }
  }

  await browser.close();

  console.log(`\n===== RENDERING GUARD (browser) =====`);
  console.log(`fixtures: ${fixtures.length}  viewports: ${VIEWPORTS.join(",")}  checks: ${checks}`);
  if (newMobileFindings.length) {
    console.log(`\nNEW mobile/tablet overflow findings (< 480px, missed by the 1297px audit):`);
    for (const f of newMobileFindings) console.log(`  ! ${f}`);
  }
  if (failures.length === 0) {
    console.log(`\nALL fixtures pass: GREEN fixtures clean at every viewport; RED fixtures reproduced their defect (in-browser red-then-green).`);
    console.log(`=== rendering guard PASS ===`);
    process.exit(0);
  }
  console.error(`\n${failures.length} FAILURE(S):`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error(`\n=== rendering guard FAIL ===`);
  process.exit(1);
}

main().catch((e) => {
  console.error("rendering guard ERROR:", e);
  process.exit(2);
});
