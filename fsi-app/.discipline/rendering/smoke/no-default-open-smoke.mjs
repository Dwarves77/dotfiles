// Rendering-guard smoke spec: NOTHING IS OPEN ON FIRST NAVIGATION (lane noexpand, 2026-09-08).
//
// THE RULING THIS PROVES. The operator navigated to /operations and the page had already opened a
// dimension, Infrastructure capacity, with nobody having clicked anything. His words, verbatim:
// "the ops page opend to a sub category not just the main page, infastructure capacity and other
// items should be closed, no items expanded when first navigtaing to a page". The coordinator's
// binding readings: R1 the rule is site-wide; R2 it covers content disclosure INCLUDING a default
// selection whose visible effect is an opened panel; R3 the FILTERS rail's stated default is
// exempt; R4 a deep link may still open exactly what it names; R5 keyboard reachability is not an
// excuse to preselect (the first cell is FOCUSABLE without being SELECTED).
//
// WHY IT LIVES IN THE RENDERING GUARD AND NOT ONLY IN A FITNESS FUNCTION. F43
// (.discipline/fitness/functions/F43-default-open-disclosure.mjs) closes the half of this class that
// has a source-level tell: `useState(true)`, `defaultOpen`, `<details open>`. The /operations defect
// had NO such tell. The matrix opened itself by computing a default SELECTION from the data on mount
// ("the first sourced cell in the first sourced row") and rendering the fact panel for it, no
// boolean, no prop, nothing a grep or an AST walk can name. The only place that defect is visible is
// the INITIAL DOM, which is what this file measures. The two gates are complementary and neither is
// sufficient alone; F43's own header says so, and so does this one.
//
// FOUR LEGS:
//   1. AT REST. The real RegionDimensionMatrix, mounted with the audit registry's attack fixture:
//      no cell `aria-selected`, no panel in the DOM, and EXACTLY ONE `tabindex="0"`, the first cell
//     , so the grid is one tab stop away without anything being chosen (R5).
//   2. KEYBOARD. Focus the grid's tab stop (which is what Tab does), then arrow around it. Focus
//      moves; nothing selects and no panel appears. Then press Enter: NOW the panel opens on the
//      focused cell. This is the exact distinction R5 draws.
//   3. SWEEP. Every compose-* page mount in the audit registry, measured with the SAME probe the
//      standalone sweep uses (audit/open-state-sweep.mjs `OPEN_STATE_MEASURE`, imported rather than
//      reimplemented). Zero unallowed open elements on any of them.
//   4. DEEP LINK (R4). The real UserProfilePage, whose `?tab=<key>` read is the ONE place in this
//      app where a URL opens something the bare route does not. `?tab=organization` renders the
//      organization panel; the bare route does not; and in BOTH cases every `<details>` on the page
//      is still closed. A deep link opens exactly what it names, and nothing else.
//
// COST: filesystem + the shared headless chromium the guard already launched. No network (page.route
// answers every fetch), no database, no credential.

import { bundleEntry, newSmokePage, mountBundle } from './harness.mjs';
import { fullAppCssCompiled } from './smoke-fixtures.mjs';
import { AUDIT_MOUNTS, mountExtraCss } from '../audit/mounts.mjs';
import { OPEN_STATE_MEASURE } from '../audit/open-state-sweep.mjs';

const GRID = '[data-audit="ops-matrix-card"]';
const PANEL = '[data-audit="ops-matrix-panel"]';

/**
 * The real `UserProfilePage` at a URL this leg chooses. It reads `window.location.search` on its
 * FIRST render (src/lib/account/initial-tab.ts, `resolveInitialProfileTab`), so setting the URL
 * before mounting is the actual navigation, not a simulation of one. Everything else here is the
 * `compose-account` mount's own seeding, minus that mount's hardcoded `?tab=members`.
 */
const accountEntry = (search) => `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { UserProfilePage } from '@/components/profile/UserProfilePage';
import { useWorkspaceStore } from '@/stores/workspaceStore';

useWorkspaceStore.getState().setWorkspace('org-1', 'Dietl / Rockit');
useWorkspaceStore.getState().setUserRole('owner');
window.history.replaceState(null, '', ${JSON.stringify(`/profile${search}`)});

let root = null;
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(React.createElement(UserProfilePage, { userId: 'smoke-user', userEmail: 'smoke@example.com' }));
};
`;

/**
 * Mount one AUDIT_MOUNTS entry into a fresh page, exactly as run-audit.mjs does.
 *
 * `entry` overrides the registered entry code while keeping that mount's aliases and API fixtures.
 * Leg 4 needs it: `compose-account`'s own entry hardcodes `?tab=members` before mounting (its header
 * says so), so it can serve as a deep-linked page but never as the BARE route the deep link has to
 * be compared against.
 */
async function mountRegistered(browser, id, { width = 1440, entry } = {}) {
  const mount = AUDIT_MOUNTS[id];
  if (!mount) throw new Error(`no AUDIT_MOUNTS entry "${id}"`);
  const page = await newSmokePage(browser, { apiRoutes: mount.apiRoutes || [] });
  await page.setViewportSize({ width, height: 1400 });
  await page.addStyleTag({ content: await fullAppCssCompiled() });
  const extra = mountExtraCss(mount);
  if (extra) await page.addStyleTag({ content: extra });
  await mountBundle(page, await bundleEntry(entry ?? mount.entry, { alias: mount.alias || {} }), '__mount', null);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  await page.waitForTimeout(200);
  return page;
}

export async function runSmoke(browser) {
  const failures = [];
  let checks = 0;
  const eq = (label, actual, expected) => {
    checks += 1;
    if (actual !== expected) failures.push(`no-default-open: ${label}, expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  };

  // ── Leg 1: the matrix at rest ────────────────────────────────────────────────────────────────
  {
    const page = await mountRegistered(browser, 'ops-matrix');
    try {
      eq('at rest, no cell is aria-selected', await page.locator(`${GRID} [aria-selected="true"]`).count(), 0);
      eq('at rest, the fact panel is not in the DOM', await page.locator(PANEL).count(), 0);
      eq('at rest, no fact card is rendered', await page.locator('[data-audit="ops-fact-card"]').count(), 0);
      // R5: reachable, not chosen.
      eq('at rest, the grid has exactly one tab stop', await page.locator(`${GRID} [tabindex="0"]`).count(), 1);
      eq(
        'the tab stop is the FIRST cell (row 1, column 0, the D1 row header)',
        await page.evaluate((g) => {
          const stop = document.querySelector(`${g} [tabindex="0"]`);
          const first = document.querySelector(`${g} table > tbody > tr:first-child > th`);
          return stop === first;
        }, GRID),
        true
      );
      eq(
        'at rest, focus has NOT been pulled into the table',
        await page.evaluate((g) => !!document.activeElement && document.activeElement.closest(g) !== null, GRID),
        false
      );
      // The card keeps its legend when there is no panel: the strip that explains the dashes and
      // says how to open a cell is exactly what a reader needs on arrival.
      eq('at rest, the card still carries its foot legend', await page.locator('[data-audit="ops-matrix-foot"]').count(), 1);
    } finally {
      await page.close();
    }
  }

  // ── Leg 2: focus moves, selection does not follow ────────────────────────────────────────────
  {
    const page = await mountRegistered(browser, 'ops-matrix');
    try {
      // What Tab does: put DOM focus on the grid's single tab stop.
      await page.evaluate((g) => document.querySelector(`${g} [tabindex="0"]`).focus(), GRID);
      const labelOf = () => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? null);
      const start = await labelOf();
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(60);
      const moved = await labelOf();
      checks += 1;
      if (!moved || moved === start) failures.push(`no-default-open: arrow keys did not move focus (still ${JSON.stringify(start)})`);
      eq('after arrowing, still nothing is selected', await page.locator(`${GRID} [aria-selected="true"]`).count(), 0);
      eq('after arrowing, still no panel', await page.locator(PANEL).count(), 0);
      eq('the tab stop moved with focus (still exactly one)', await page.locator(`${GRID} [tabindex="0"]`).count(), 1);

      // Commit. THIS is what opens the panel.
      await page.keyboard.press('Enter');
      await page.waitForTimeout(120);
      eq('Enter selects the focused cell', await page.locator(`${GRID} [aria-selected="true"]`).count(), 1);
      eq('Enter opens the panel', await page.locator(PANEL).count(), 1);
      eq(
        'the cell Enter selected is the one that had focus',
        await page.evaluate((g) => document.querySelector(`${g} [aria-selected="true"]`)?.getAttribute('aria-label') ?? null, GRID),
        moved
      );
      // The panel is BELOW the table, never inside it: nothing expands in the table (operator's
      // first clause, carried forward from the redesign).
      eq('no cell spans the table after a selection', await page.locator(`${GRID} table td[colspan], ${GRID} table th[colspan]`).count(), 0);

      // A click is the same commitment, on a different cell.
      await page.locator(`${GRID} table > tbody > tr:nth-child(3) > td:nth-child(4)`).click();
      await page.waitForTimeout(120);
      eq('a click moves the selection, and there is still exactly one', await page.locator(`${GRID} [aria-selected="true"]`).count(), 1);
      eq('a click keeps exactly one panel', await page.locator(PANEL).count(), 1);
    } finally {
      await page.close();
    }
  }

  // ── Leg 3: every page mount, measured, not read ──────────────────────────────────────────────
  for (const id of Object.keys(AUDIT_MOUNTS).filter((k) => k.startsWith('compose-'))) {
    const page = await mountRegistered(browser, id);
    try {
      const found = await page.evaluate(OPEN_STATE_MEASURE);
      const bad = found.filter((f) => !f.allowed);
      checks += 1;
      if (bad.length > 0) {
        failures.push(
          `no-default-open: ${id} renders ${bad.length} open element(s) before any interaction: ` +
            bad.map((f) => `${f.kind} <${f.tag}> ${JSON.stringify(f.label)}`).join('; ')
        );
      }
    } finally {
      await page.close();
    }
  }

  // ── Leg 4: R4, a deep link opens exactly what it names ───────────────────────────────────────
  {
    const bare = await mountRegistered(browser, 'compose-account', { entry: accountEntry('') });
    try {
      eq('bare /profile does not render the organization panel', await bare.locator('[data-audit="org-record-disclosure"]').count(), 0);
      eq('bare /profile has no open <details>', await bare.locator('details[open]').count(), 0);
    } finally {
      await bare.close();
    }

    const deep = await mountRegistered(browser, 'compose-account', { entry: accountEntry('?tab=organization') });
    try {
      eq('/profile?tab=organization opens the organization panel it names', await deep.locator('[data-audit="org-record-disclosure"]').count(), 1);
      eq('and opens NOTHING ELSE: every <details> on the page is still closed', await deep.locator('details[open]').count(), 0);
    } finally {
      await deep.close();
    }
  }

  return { checks, failures };
}
