// SM smoke spec: list order. Lane GATES-1, 2026-09-02, finish plan Wave 1. Mounts the REAL
// `DashboardTopPriority` (src/components/home/DashboardTopPriority.tsx) via harness.mjs — the
// dashboard half of the shared drag-order contract (list_key "regulations", useListOrder,
// applyMove/compareRanks, dnd-kit) the component's own header documents as identical to /regulations'.
//
// WHY KEYBOARD, NOT POINTER, FOR THE DRAG. dnd-kit's PointerSensor needs a realistic pointer-event
// sequence (down/move/up with real movement deltas) that is brittle to synthesize reliably headless;
// its KeyboardSensor (sortableKeyboardCoordinates) is the SAME production sensor the component wires
// via useSensors — real users on a keyboard use exactly this path — and Playwright's page.keyboard
// drives it deterministically: focus the row's grip button, Space to pick up, ArrowDown to move,
// Space to drop. This was proven red-then-green while building this spec (see this lane's REPORT):
// two rows in fixed order, the same three keypresses, row order swaps in the live DOM.
//
// WHY NO DRAG PROOF ON THE ONE-ROW STATE. onDragEnd's own guard (`if (!over || active.id ===
// over.id) return`) means a solitary row's pick-up-and-drop-in-place is a real no-op, not a weaker
// proof — there is no second position to move it to. Grip-button presence/enabled and the row's real
// href (itemDetailHref) are asserted instead; the click-fire proof runs on extreme-data, which has
// somewhere to move a row to.
//
// WHY NO PRIMARY ACTION ON THE EMPTY STATE. Zero CRITICAL/HIGH resources renders the honest "Nothing
// critical this week" frame (§4) with no interactive control — same reasoning as the other three
// specs' empty states.

import { bundleEntry, newSmokePage, mountBundle, measureGuard, assertGuardClean } from './harness.mjs';
import { listOrderFixtures } from './smoke-fixtures.mjs';

const ENTRY = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { DashboardTopPriority } from '@/components/home/DashboardTopPriority';

let root = null;
window.__mount = (props) => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(React.createElement(DashboardTopPriority, props));
};
`;

const API_ROUTES = [
  // GET on mount (list load) and PATCH on drop (the move) — one stub answers both; the drop's
  // observable proof is the DOM row order, not the response body (move() only checks res.ok).
  { urlGlob: '**/api/user/list-order**', handler: (route) => route.fulfill({ json: { order: [] } }) },
];

async function rowTitles(page) {
  // The extreme fixture's titles all end "... #<index>" (smoke-fixtures.mjs's listOrderFixtures) —
  // matched by suffix rather than the full generated string, which is deliberately not hardcoded here
  // (this function must not silently pass by re-deriving the exact fixture text a second time).
  return page.$$eval('p', (els) => els.map((e) => e.textContent || '').filter((t) => /#\d+$/.test(t)));
}

export async function runSmoke(browser) {
  const failures = [];
  let checks = 0;
  const bundleJs = await bundleEntry(ENTRY);
  const { empty, oneRow, extreme } = listOrderFixtures();

  // ── empty ──────────────────────────────────────────────────────────────
  {
    const page = await newSmokePage(browser, { apiRoutes: API_ROUTES });
    await mountBundle(page, bundleJs, '__mount', empty);
    await page.waitForTimeout(150);
    checks++;
    failures.push(...assertGuardClean('list-order[empty]', await measureGuard(page)));

    const text = await page.textContent('body');
    checks++;
    if (!/Nothing critical this week/.test(text)) {
      failures.push('list-order[empty]: honest empty-state message did not render.');
    }

    await page.close();
  }

  // ── one-row ────────────────────────────────────────────────────────────
  {
    const page = await newSmokePage(browser, { apiRoutes: API_ROUTES });
    await mountBundle(page, bundleJs, '__mount', oneRow);
    await page.waitForTimeout(150);
    checks++;
    failures.push(...assertGuardClean('list-order[one-row]', await measureGuard(page)));

    const grip = await page.$('button[aria-label^="Reorder"]');
    checks++;
    if (!grip) {
      failures.push('list-order[one-row]: primary action (drag handle) is missing.');
    } else {
      const disabled = await grip.evaluate((el) => el.disabled);
      if (disabled) failures.push('list-order[one-row]: drag handle is present but disabled.');
    }

    const link = await page.$('a[href]:has-text("Corporate Sustainability")');
    checks++;
    if (!link) failures.push('list-order[one-row]: the row does not render as a real link with an href.');

    await page.close();
  }

  // ── extreme-data ───────────────────────────────────────────────────────
  {
    const page = await newSmokePage(browser, { apiRoutes: API_ROUTES });
    await mountBundle(page, bundleJs, '__mount', extreme);
    await page.waitForTimeout(150);
    checks++;
    failures.push(...assertGuardClean('list-order[extreme]', await measureGuard(page)));

    const grips = await page.$$('button[aria-label^="Reorder"]');
    checks++;
    if (grips.length < 2) {
      failures.push(`list-order[extreme]: expected at least 2 draggable rows, found ${grips.length}.`);
    } else {
      const disabled = await grips[0].evaluate((el) => el.disabled);
      if (disabled) failures.push('list-order[extreme]: first drag handle is present but disabled.');

      const before = await rowTitles(page);
      await grips[0].focus();
      await page.keyboard.press('Space');
      await page.waitForTimeout(120);
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(120);
      await page.keyboard.press('Space');
      await page.waitForTimeout(250);
      const after = await rowTitles(page);

      checks++;
      if (before.length < 2 || after.length < 2 || before[0] === after[0]) {
        failures.push(
          `list-order[extreme]: keyboard drag (Space, ArrowDown, Space) on the first row did not change the ` +
            `visible row order (onDragEnd -> applyMove/moveInOrder did not fire): before=[${before.slice(0, 2)}] after=[${after.slice(0, 2)}]`,
        );
      }
    }

    // "All N priority items ->" footer — the band-total honest disclosure, not derived from the
    // capped shown[] slice.
    const footer = await page.textContent('body');
    checks++;
    if (!/All 12 priority items/.test(footer)) {
      failures.push('list-order[extreme]: band-total footer ("All N priority items ->") did not render the true pool total.');
    }

    await page.close();
  }

  return { checks, failures };
}
