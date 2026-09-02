// SM smoke spec: Watchlist (team). Lane GATES-1, 2026-09-02, finish plan Wave 1. Mounts the REAL
// `WatchlistSurface` (src/components/watchlist/WatchlistSurface.tsx) — the component F33's register
// cites as the "watchlist" surface's route target — via harness.mjs, in its empty / one-row /
// extreme-data states (smoke-fixtures.mjs), and asserts: no horizontal overflow, no F-1 placeholder
// literal, the state's primary interactive control is present and enabled, and (where the state has
// one — see below) a real click fires a real state-change handler with an observable effect.
//
// WHY NO CLICK-FIRE PROOF ON THE EMPTY STATE. items=[] renders ONE control: the "Browse what to
// watch →" recovery link (§4's honest-empty-state CTA). It is a navigation, not a local state-change
// handler — clicking it inside this harness's fake origin would attempt a real navigation to a route
// this smoke page never registers a fixture response for. Presence + a real href is asserted instead;
// this mirrors the codebase's own "never fabricate" rule (rule 2) applied to test assertions: a click-
// fire proof this state cannot honestly support is not stubbed into existing.
//
// Run standalone: node --test is NOT how this runs (it needs a real Playwright browser) — it is
// invoked by run-rendering-guard.mjs's registration block, which owns the one chromium instance every
// smoke spec (and every fixture leg) shares.

import { bundleEntry, newSmokePage, mountBundle, measureGuard, assertGuardClean } from './harness.mjs';
import { watchlistFixtures } from './smoke-fixtures.mjs';

const ENTRY = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { WatchlistSurface } from '@/components/watchlist/WatchlistSurface';

let root = null;
window.__mount = (props) => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(React.createElement(WatchlistSurface, props));
};
`;

export async function runSmoke(browser) {
  const failures = [];
  let checks = 0;
  const bundleJs = await bundleEntry(ENTRY);
  const { empty, oneRow, extreme } = watchlistFixtures();

  // ── empty ──────────────────────────────────────────────────────────────
  {
    const page = await newSmokePage(browser);
    await mountBundle(page, bundleJs, '__mount', empty);
    await page.waitForTimeout(150);
    checks++;
    failures.push(...assertGuardClean('watchlist-team[empty]', await measureGuard(page)));

    const cta = await page.$('a[href="/regulations"]');
    checks++;
    if (!cta) failures.push('watchlist-team[empty]: primary action ("Browse what to watch →") is missing.');

    await page.close();
  }

  // ── one-row ────────────────────────────────────────────────────────────
  {
    const page = await newSmokePage(browser);
    await mountBundle(page, bundleJs, '__mount', oneRow);
    await page.waitForTimeout(150);
    checks++;
    failures.push(...assertGuardClean('watchlist-team[one-row]', await measureGuard(page)));

    const scopeSelect = await page.$('#watchlist-scope');
    checks++;
    if (!scopeSelect) {
      failures.push('watchlist-team[one-row]: primary action (scope filter) is missing.');
    } else {
      const disabled = await scopeSelect.evaluate((el) => el.disabled);
      if (disabled) failures.push('watchlist-team[one-row]: scope filter is present but disabled.');

      // click-fire: filtering to "personal" empties the (all-team) one-row list, surfacing the
      // "Clear filters" recovery button — a real onClick handler with an observable DOM effect.
      await page.selectOption('#watchlist-scope', 'personal');
      await page.waitForTimeout(100);
      const clearBtn = await page.$('button:has-text("Clear filters")');
      checks++;
      if (!clearBtn) {
        failures.push('watchlist-team[one-row]: selecting a scope with zero matches did not surface "Clear filters" (onChange handler did not fire).');
      } else {
        await clearBtn.click();
        await page.waitForTimeout(100);
        const text = await page.textContent('body');
        checks++;
        if (!text.includes('EU Packaging')) {
          failures.push('watchlist-team[one-row]: "Clear filters" click did not restore the filtered-out row (onClick handler did not fire).');
        }
      }
    }

    await page.close();
  }

  // ── extreme-data ───────────────────────────────────────────────────────
  {
    const page = await newSmokePage(browser);
    await mountBundle(page, bundleJs, '__mount', extreme);
    await page.waitForTimeout(150);
    checks++;
    failures.push(...assertGuardClean('watchlist-team[extreme]', await measureGuard(page)));

    const typeSelect = await page.$('#watchlist-type');
    checks++;
    if (!typeSelect) {
      failures.push('watchlist-team[extreme]: primary action (type filter) is missing.');
    } else {
      const disabled = await typeSelect.evaluate((el) => el.disabled);
      if (disabled) failures.push('watchlist-team[extreme]: type filter is present but disabled.');

      const before = await page.$$eval('li', (els) => els.length);
      await page.selectOption('#watchlist-type', 'reg');
      await page.waitForTimeout(100);
      const after = await page.$$eval('li', (els) => els.length);
      checks++;
      if (!(after < before)) {
        failures.push(`watchlist-team[extreme]: selecting the "reg" type filter did not narrow the row list (${before} -> ${after}; onChange handler did not fire).`);
      }

      const clearBtn = await page.$('button:has-text("Clear filters")');
      if (clearBtn) {
        await clearBtn.click();
        await page.waitForTimeout(100);
        const restored = await page.$$eval('li', (els) => els.length);
        checks++;
        if (restored !== before) {
          failures.push(`watchlist-team[extreme]: "Clear filters" click did not restore the full row list (${restored} !== ${before}).`);
        }
      }
    }

    // The read-cap honest banner (§4) — limit === items.length in the extreme fixture.
    const bannerText = await page.textContent('body');
    checks++;
    if (!/most recent .* watched items/.test(bannerText)) {
      failures.push('watchlist-team[extreme]: standing-at-the-read-cap honest banner did not render at limit === items.length.');
    }

    await page.close();
  }

  return { checks, failures };
}
