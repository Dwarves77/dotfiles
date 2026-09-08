// The artboard | built side-by-side compositor, in ONE place.
//
// FOLD-59 (2026-09-08). This function was defined inside
// `capture-compose-lists-screenshots.mjs` and reachable only from that script's own four entries,
// so the eight page compositions captured through `capture-compose-page.mjs` (map, community,
// admin, account, settings, login, signup, onboarding) had their side-by-sides assembled BY HAND.
// A hand-made evidence image cannot be regenerated from the code it claims to evidence, which is
// exactly what a train fold needs to do: the operator's standing demand is that the built page be
// compared against the artboard AFTER the build, and evidence that only a human can rebuild goes
// stale silently. Extracted here, imported by the lists script (which keeps its behaviour
// unchanged), and given a CLI so any `-built.png` can be paired with its artboard.
//
// Usage: node .discipline/rendering/compose-composite.mjs <artboard.png> <built.png> <out.png>
//   paths are resolved against docs/design/handoff-2026-09-06/{screens,built}/ when bare.

import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import { getRepoRoot } from '../lib/context.mjs';

const HANDOFF = join(getRepoRoot(), 'docs/design/handoff-2026-09-06');
export const SCREENS_DIR = join(HANDOFF, 'screens');
export const BUILT_DIR = join(HANDOFF, 'built');

/**
 * Write `outPath` as the artboard and the built capture side by side, both scaled to 1440 wide so
 * a region's position can be compared across the seam by eye.
 *
 * Both images are inlined as data URIs: the compositor page is created with `setContent` (an
 * about:blank document), and a `file://` subresource from an opaque origin is blocked by the
 * browser, which showed up as an image that never completes loading.
 */
export async function composite(browser, artboardPath, builtPath, outPath) {
  const dataUri = (p) => `data:image/png;base64,${readFileSync(p).toString('base64')}`;
  const page = await browser.newPage();
  const label = 'font:700 20px system-ui,sans-serif;padding:10px 4px;letter-spacing:.06em;text-transform:uppercase';
  await page.setContent(`
    <body style="margin:0;background:#EDE9E3">
      <div style="display:flex;align-items:flex-start;gap:16px;padding:16px">
        <div><div style="${label}">Artboard</div><img src="${dataUri(artboardPath)}" style="display:block;width:1440px"></div>
        <div><div style="${label}">Built, 1440</div><img src="${dataUri(builtPath)}" style="display:block;width:1440px"></div>
      </div>
    </body>`);
  await page.waitForFunction(() => Array.from(document.images).every((i) => i.complete && i.naturalWidth > 0));
  await page.screenshot({ path: outPath, fullPage: true });
  await page.close();
}

async function main() {
  const [artboard, built, out] = process.argv.slice(2);
  if (!artboard || !built || !out) {
    console.error('usage: compose-composite.mjs <artboard.png> <built.png> <out.png>');
    process.exit(1);
  }
  const { chromium } = createRequire(import.meta.url)('playwright');
  mkdirSync(BUILT_DIR, { recursive: true });
  const browser = await chromium.launch(
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {},
  );
  const at = (dir, p) => (isAbsolute(p) ? p : join(dir, p));
  const outPath = at(BUILT_DIR, out);
  await composite(browser, at(SCREENS_DIR, artboard), at(BUILT_DIR, built), outPath);
  await browser.close();
  console.log(`wrote ${outPath}`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
