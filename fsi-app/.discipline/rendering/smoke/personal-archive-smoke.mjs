// SM smoke spec: Personal archive. Lane GATES-1, 2026-09-02, finish plan Wave 1. Mounts the REAL
// `ArchiveViewer` (src/components/settings/ArchiveViewer.tsx) via harness.mjs. Unlike WatchlistSurface
// / DashboardTopPriority, ArchiveViewer takes no props — it reads `useResourceStore()` directly (a
// real zustand store, `src/stores/resourceStore.ts`), so the "fixture" for each state is STORE STATE
// injected via the store's own real `setState`, not a props object. This is still the REAL component
// against REAL app state, exactly the same posture as the prop-driven specs — just seeded one layer
// lower, at the store the component actually reads.
//
// WHY NO CLICK-FIRE PROOF ON THE EMPTY STATE. Zero archived resources renders the honest "No archived
// resources" frame (§4-style empty state) with no interactive control at all — no search box, no
// filter, no button. Asserting a primary action here would mean inventing one; the honest check is
// that the empty-state message renders cleanly and nothing else does.

import { bundleEntry, newSmokePage, mountBundle, measureGuard, assertGuardClean } from './harness.mjs';
import { archiveFixtures } from './smoke-fixtures.mjs';

const ENTRY = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ArchiveViewer } from '@/components/settings/ArchiveViewer';
import { useResourceStore } from '@/stores/resourceStore';

window.__setStoreState = (state) => {
  useResourceStore.setState({
    archived: state.archived,
    resources: state.resources,
    personalState: new Map(state.personalState),
  });
};
let root = null;
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(React.createElement(ArchiveViewer));
};
`;

async function setStoreState(page, state) {
  await page.evaluate((s) => window.__setStoreState(s), {
    ...state,
    personalState: Array.from(state.personalState.entries()),
  });
}

export async function runSmoke(browser) {
  const failures = [];
  let checks = 0;
  const bundleJs = await bundleEntry(ENTRY);
  const { empty, oneRow, extreme } = archiveFixtures();
  const apiRoutes = [
    { urlGlob: '**/api/workspace/personal-state**', handler: (route) => route.fulfill({ json: { ok: true } }) },
    { urlGlob: '**/api/workspace/overrides**', handler: (route) => route.fulfill({ json: { ok: true } }) },
  ];

  // ── empty ──────────────────────────────────────────────────────────────
  {
    const page = await newSmokePage(browser, { apiRoutes });
    await page.addScriptTag({ content: bundleJs });
    await setStoreState(page, empty);
    await page.evaluate(() => window.__mount());
    await page.waitForTimeout(150);
    checks++;
    failures.push(...assertGuardClean('personal-archive[empty]', await measureGuard(page)));

    const text = await page.textContent('body');
    checks++;
    if (!/No archived resources/.test(text)) {
      failures.push('personal-archive[empty]: honest empty-state message did not render.');
    }

    await page.close();
  }

  // ── one-row ────────────────────────────────────────────────────────────
  {
    const page = await newSmokePage(browser, { apiRoutes });
    await page.addScriptTag({ content: bundleJs });
    await setStoreState(page, oneRow);
    await page.evaluate(() => window.__mount());
    await page.waitForTimeout(150);
    checks++;
    failures.push(...assertGuardClean('personal-archive[one-row]', await measureGuard(page)));

    // Personal-scope rows carry a distinct aria-label ("Restore ... for yourself" vs "for the whole
    // team") — see this spec's header note in the extreme-data block for why the choice matters.
    const restoreBtn = await page.$('button[aria-label*="for yourself"]');
    checks++;
    if (!restoreBtn) {
      failures.push('personal-archive[one-row]: primary action (Restore) is missing.');
    } else {
      const disabled = await restoreBtn.evaluate((el) => el.disabled);
      if (disabled) failures.push('personal-archive[one-row]: Restore button is present but disabled.');

      await restoreBtn.click();
      await page.waitForTimeout(200);
      const text = await page.textContent('body');
      checks++;
      if (!/No archived resources/.test(text)) {
        failures.push('personal-archive[one-row]: clicking Restore did not remove the row (handleRestore -> store.restorePersonal did not fire).');
      }
    }

    await page.close();
  }

  // ── extreme-data ───────────────────────────────────────────────────────
  {
    const page = await newSmokePage(browser, { apiRoutes });
    await page.addScriptTag({ content: bundleJs });
    await setStoreState(page, extreme);
    await page.evaluate(() => window.__mount());
    await page.waitForTimeout(150);
    checks++;
    failures.push(...assertGuardClean('personal-archive[extreme]', await measureGuard(page)));

    // Only a PERSONAL-scope Restore click has an observable effect in this isolated-component test:
    // restoreResource() (team scope) mutates the store's `overrides` map only, never the `archived`
    // array ArchiveViewer's team rows are actually rendered from (the live app reconciles that via a
    // server round-trip this smoke page does not simulate) — so a team-scope click is real (the
    // handler still fires) but produces no DOM change to assert against. restorePersonal() (personal
    // scope) mutates `personalState` directly, which IS what personal rows render from, so it is the
    // interaction that can honestly prove "click -> observable state change" here.
    const restoreButtons = await page.$$('button[aria-label*="for yourself"]');
    checks++;
    if (restoreButtons.length === 0) {
      failures.push('personal-archive[extreme]: primary action (Restore, personal scope) is missing.');
    } else {
      const first = restoreButtons[0];
      const disabled = await first.evaluate((el) => el.disabled);
      if (disabled) failures.push('personal-archive[extreme]: first personal Restore button is present but disabled.');

      const before = await page.$$eval('button[aria-label*="for yourself"]', (els) => els.length);
      await first.click();
      await page.waitForTimeout(200);
      const after = await page.$$eval('button[aria-label*="for yourself"]', (els) => els.length);
      checks++;
      if (!(after < before)) {
        failures.push(`personal-archive[extreme]: clicking the first personal Restore did not reduce the personal-row count (${before} -> ${after}).`);
      }
    }

    // Search filter — a second real onChange handler, cheap to prove alongside the click-fire proof.
    const searchBox = await page.$('input[placeholder="Search archive..."]');
    checks++;
    if (!searchBox) {
      failures.push('personal-archive[extreme]: search input is missing.');
    } else {
      const before = await page.$$eval('button[aria-label*="Restore"]', (els) => els.length);
      await searchBox.fill('no-such-title-anywhere');
      await page.waitForTimeout(100);
      const afterFilter = await page.$$eval('button[aria-label*="Restore"]', (els) => els.length);
      checks++;
      if (!(afterFilter < before)) {
        failures.push('personal-archive[extreme]: typing a non-matching search term did not narrow the row list (onChange handler did not fire).');
      }
    }

    await page.close();
  }

  return { checks, failures };
}
