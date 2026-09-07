// One-off capture script (lane uxfix-lists, 2026-09-07): screenshots of the live dev server at
// 1440px for the two audit items this lane fixed (1.1 Dashboard "All N immediate" link, 3.5
// Watchlist WatchButton wording). Not part of the discipline gate set; run by hand against a
// running `next dev` with UI_SCREENSHOT_BYPASS=1 set (see this lane's REPORT for the full method,
// same env-only auth bypass UI-SYSTEM lane commit 2aa17758 used, reverted before commit).
//
// Usage: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node .discipline/rendering/capture-uxfix-lists-screenshots.mjs <port>

import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { getRepoRoot } from '../lib/context.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');

const OUT_DIR = join(getRepoRoot(), 'docs/design/handoff-2026-09-06/built');
const PORT = process.argv[2] || '3917';
const BASE = `http://localhost:${PORT}`;

const PAGES = [
  { path: '/', out: '1.1-dashboard.png' },
  { path: '/regulations?band=immediate', out: '1.1-regulations-immediate.png' },
  { path: '/watchlist', out: '3.5-watchlist.png' },
];

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch(
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}
  );
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const { path, out } of PAGES) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.evaluate(() => new Promise((r) => setTimeout(r, 300)));
    const outPath = join(OUT_DIR, out);
    await page.screenshot({ path: outPath, fullPage: true });
    console.log(`wrote ${outPath}`);
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
