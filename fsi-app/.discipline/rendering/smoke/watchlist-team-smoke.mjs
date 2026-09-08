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

import { bundleEntry, newSmokePage, mountBundle, measureGuard, assertGuardClean, measureBoundsSweep, assertBoundsClean } from './harness.mjs';
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

/**
 * Disclosed chrome vocabulary (lane comp-11, 2026-09-08), passed as `assertGuardClean`'s existing
 * `known` allowlist — the same mechanism the band-tile "Action" label already uses (see
 * guard-assert.mjs's own header for that precedent).
 *
 * The F-1 detector's rule is that a table-HEADER literal must never render as DATA. These three
 * strings are the opposite case: they are header and label CHROME, rendering as themselves, exactly
 * where artboard 11 puts them.
 *   "Tier"    the column-header cell of the row grid (dc.html p11 line 106's column, headed at
 *             line 64) — the artboard's own word, not negotiable.
 *   "Type"    the rail Filters card's facet-group heading.
 *   "Source"  WATCHLIST_TYPE_LABEL.source, the display name of the `source` watch type, which the
 *             extreme fixture includes and the Type facet therefore lists as an option.
 * Nothing here weakens the detector for DATA cells: a row whose title or value were literally
 * "Tier" would still be scanned, and every other literal in the set still fires.
 */
const KNOWN_CHROME_LITERALS = ['Tier', 'Type', 'Source'];

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
    failures.push(...assertGuardClean('watchlist-team[one-row]', await measureGuard(page), KNOWN_CHROME_LITERALS));

    // Lane comp-11 (2026-09-08): the one-row fixture is a SINGLE team "reg" row, so neither facet
    // has two options and the rail's Filters card correctly renders nothing — there is no filter
    // control in this state to assert on, and inventing one would be the fabrication the spec's own
    // header rules out. The state's real controls are the row's watch toggle and the card foot's
    // "Browse regulations →" link; both are asserted present and enabled here.
    //
    // NO CLICK-FIRE PROOF IN THIS STATE, deliberately and for the same reason the empty state has
    // none: the watch toggle's only observable effect is an OPTIMISTIC flip that this harness's
    // unrouted /api/watchlist call then reverts, so a click assertion here would be asserting on a
    // race, not on the handler. The real click-fire proof lives in the extreme state below, where
    // the facets exist and the effect is local and deterministic.
    // Lane lists60 (2026-09-08): the row's trailing control is now the artboard's `⋯` overflow
    // kebab (artboard 11/id="p11" draws the same glyph artboard 02's rows end with), holding the
    // WatchButton in its popover — it used to be WatchButton's glyph-only star variant mounted
    // directly in the cell. Ruling 3.5's INVARIANT is unchanged and still proven in full below: the
    // row offers a real, enabled control, and the watch action reachable from it is UNWATCH, never
    // a bare "Watch" on a row that is watched by construction. What changed is the MOUNT — the
    // action is one click deeper — so the check opens the menu and reads the control inside it.
    const rowOverflow = await page.$('.cl-row-overflow button');
    checks++;
    if (!rowOverflow) {
      failures.push('watchlist-team[one-row]: primary action (the row overflow control) is missing.');
    } else {
      const disabled = await rowOverflow.evaluate((el) => el.disabled);
      if (disabled) failures.push('watchlist-team[one-row]: the row overflow control is present but disabled.');
      const glyph = await rowOverflow.evaluate((el) => (el.textContent || '').trim());
      checks++;
      if (glyph !== '\u22ef') {
        failures.push(`watchlist-team[one-row]: the row's trailing control reads "${glyph}" — artboard 11 draws the \u22ef overflow glyph.`);
      }
      await rowOverflow.click();
      await page.waitForTimeout(80);
      // Operator ruling 3.5: a watched row must never offer a bare "Watch". Every row on this
      // surface is watched by construction, so the watch control inside the menu states the UNWATCH
      // action (its accessible name is the action; its visible text reads "Watching" at rest and
      // "Unwatch" on hover — WatchButton.tsx's own contract).
      const menuLabels = await page.$$eval('button', (els) =>
        els.map((el) => `${el.getAttribute('aria-label') || ''} ${el.textContent || ''}`),
      );
      checks++;
      if (!menuLabels.some((l) => /unwatch|watching/i.test(l))) {
        failures.push(
          `watchlist-team[one-row]: the row's \u22ef menu offers no unwatch action (labels seen: ${JSON.stringify(menuLabels)}) — ruling 3.5.`,
        );
      }
      checks++;
      if (menuLabels.some((l) => /(^|[^n])\bWatch\b(?!ing)/.test(l))) {
        failures.push(`watchlist-team[one-row]: a watched row's menu reads a bare "Watch" — ruling 3.5 forbids it.`);
      }
    }

    const browseLink = await page.$('.cl-card-foot a[href="/regulations"]');
    checks++;
    if (!browseLink) {
      failures.push('watchlist-team[one-row]: the card foot\'s "Browse regulations →" link (artboard 11) is missing.');
    }

    await page.close();
  }

  // ── extreme-data ───────────────────────────────────────────────────────
  {
    const page = await newSmokePage(browser);
    await mountBundle(page, bundleJs, '__mount', extreme);
    await page.waitForTimeout(150);
    checks++;
    failures.push(...assertGuardClean('watchlist-team[extreme]', await measureGuard(page), KNOWN_CHROME_LITERALS));

    // Lane comp-11 (2026-09-08): the Scope/Type filters are now checkbox rows inside the rail's
    // shared `FiltersRailCard` (operator audit 2026-09-07, "the filters were not above the
    // regulations, they were on the right"), not the two native <select>s this block used to drive.
    // The INVARIANT is unchanged and still asserted in full: the state's primary filter control is
    // present, enabled, and a real click narrows the real row list.
    const typeFilter = await page.$('[data-audit="filters-rail"] label:has-text("Reg") input[type="checkbox"]');
    checks++;
    if (!typeFilter) {
      failures.push('watchlist-team[extreme]: primary action (the rail Filters card\'s type facet) is missing.');
    } else {
      const disabled = await typeFilter.evaluate((el) => el.disabled);
      if (disabled) failures.push('watchlist-team[extreme]: the type facet is present but disabled.');

      // UILISTS lane (2026-09-06): WatchlistSurface renders each row via the shared ListRow
      // (a styled <div>, not an <li>) or, for row-less types, a plain <div> — both carry
      // `data-guard-title` on the title element, so that attribute is the row count, not `li`.
      const before = await page.$$eval('[data-guard-title]', (els) => els.length);
      await typeFilter.click();
      await page.waitForTimeout(100);
      const after = await page.$$eval('[data-guard-title]', (els) => els.length);
      checks++;
      if (!(after < before)) {
        failures.push(`watchlist-team[extreme]: checking the "Reg" type facet did not narrow the row list (${before} -> ${after}; onSelect handler did not fire).`);
      }

      // The rail Filters card's own "Clear N" control (it appears the moment a facet is selected)
      // is the restore path now that the selects are gone.
      const clearBtn = await page.$('[data-audit="filters-rail"] button:has-text("Clear")');
      checks++;
      if (!clearBtn) {
        failures.push('watchlist-team[extreme]: selecting a facet did not surface the Filters card\'s "Clear N" control.');
      } else {
        await clearBtn.click();
        await page.waitForTimeout(100);
        const restored = await page.$$eval('[data-guard-title]', (els) => els.length);
        checks++;
        if (restored !== before) {
          failures.push(`watchlist-team[extreme]: "Clear" click did not restore the full row list (${restored} !== ${before}).`);
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

  // D1 cell-bounds sweep at 1440 (this list page's own ListRow use, one of the five list surfaces
  // the operator report named) — see dashboard-brief-smoke.mjs's BOUNDS_VIEWPORT comment.
  {
    const page = await newSmokePage(browser);
    await page.setViewportSize({ width: 1440, height: 900 });
    await mountBundle(page, bundleJs, '__mount', extreme);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    const sweep = await measureBoundsSweep(page);
    checks++;
    failures.push(...assertBoundsClean('watchlist-team[extreme]@1440:bounds', sweep));
    await page.close();
  }

  return { checks, failures };
}
