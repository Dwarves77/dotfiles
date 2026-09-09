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
// THE ONE ALLOWED EXCEPTION, ADDED 2026-09-09 (lane opsmatrix5), and it is a REVERSAL, on purpose.
// The operator's /operations STOP SHIP message of 2026-09-09, item 5, verbatim: "Default state on
// load: first sourced cell of the first sourced row open." Item 3: "Arrow keys move the selection;
// panel follows; Esc closes." Coordinator note C1, binding: what the 2026-09-08 ruling forbade is
// the RETIRED row-expansion pattern, the thing he was looking at when he wrote it and the thing the
// newer message orders deleted; the new panel's default selection is explicitly wanted, in writing,
// in the newer message. So the matrix arrives with one cell selected and its panel open, and NOTHING
// ELSE anywhere on the site opens itself.
//
// The rule is NOT weakened to a warning and NOTHING ELSE is exempted. The matrix declares its
// default with `data-open-on-mount` naming both dates, which is the escape hatch open-state-sweep
// already provided for a ruled-open default, and the declaration is dropped the instant the reader
// touches the grid, so it covers ARRIVAL and no other state. Legs 1 and 2 below are re-pointed to
// assert that exact shape rather than deleted: leg 1 now requires the default to be present, to be
// the right cell, to be DECLARED, and to be the ONLY declared thing on the page; leg 2 now requires
// the arrows to move it and Esc to close it. Every other leg is untouched.
//
// SIX LEGS:
//   1. AT ARRIVAL. The real RegionDimensionMatrix, mounted with the audit registry's attack fixture:
//      EXACTLY ONE cell `aria-selected`, and it is the first sourced cell of the first sourced row
//      (which the sparse fixture makes ASIA x D3, two empty rows and two empty columns in); the
//      panel open on it; the arrival state DECLARED with `data-open-on-mount`; exactly one declared
//      element on the whole page; and EXACTLY ONE `tabindex="0"`, on the selected cell, so Tab lands
//      on the cell whose facts are showing.
//   2. KEYBOARD. Focus the grid's tab stop, arrow around it: the SELECTION moves with focus and the
//      panel follows (2026-09-09 item 3). Esc closes the panel and leaves nothing selected. Enter
//      re-opens on the focused cell.
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

  // ── Leg 1: the matrix at arrival, and the exception is DECLARED ──────────────────────────────
  {
    const page = await mountRegistered(browser, 'ops-matrix');
    try {
      eq('at arrival, exactly one cell is selected (2026-09-09 item 5)', await page.locator(`${GRID} [aria-selected="true"]`).count(), 1);
      eq(
        'and it is the FIRST SOURCED CELL OF THE FIRST SOURCED ROW: the sparse fixture makes that ASIA x D3, two empty rows and two empty columns in',
        await page.evaluate((g) => document.querySelector(`${g} [aria-selected="true"]`)?.getAttribute('aria-label') ?? null, GRID),
        'Asia · SG + HK, D3 Labor markets, 4 sourced facts'
      );
      eq('at arrival, the fact panel is open on it', await page.locator(PANEL).count(), 1);
      eq('at arrival, the arrival state is DECLARED to this sweep, not hidden from it', await page.locator(`${PANEL}[data-open-on-mount]`).count(), 1);
      eq(
        'the declaration names BOTH operator messages, so the next reader sees the history',
        await page.evaluate((p) => {
          const d = document.querySelector(p)?.getAttribute('data-open-on-mount') ?? '';
          return d.includes('2026-09-09') && d.includes('2026-09-08');
        }, PANEL),
        true
      );
      // EXACTLY TWO declared elements, and both are this matrix's: the panel and the cell whose
      // tint reports `aria-selected`. Two rather than one because the sweep allows an element only
      // if it or an ancestor carries the declaration, and the tinted cell is not inside the panel.
      eq('exactly two declared open elements on the page: the panel and its selected cell', await page.locator('[data-open-on-mount]').count(), 2);
      eq(
        'and both are inside the matrix card: one exception, one component, not a category',
        await page.evaluate((g) => Array.from(document.querySelectorAll('[data-open-on-mount]')).every((el) => el.closest(g)), GRID),
        true
      );
      eq('at arrival, the grid has exactly one tab stop', await page.locator(`${GRID} [tabindex="0"]`).count(), 1);
      eq(
        'the tab stop is the SELECTED cell, so Tab lands on the cell whose facts are showing',
        await page.evaluate((g) => {
          const stop = document.querySelector(`${g} [tabindex="0"]`);
          const sel = document.querySelector(`${g} [aria-selected="true"]`);
          return stop === sel;
        }, GRID),
        true
      );
      eq(
        'at arrival, focus has NOT been pulled into the table (a selected cell is not a focused one)',
        await page.evaluate((g) => !!document.activeElement && document.activeElement.closest(g) !== null, GRID),
        false
      );
      eq('at arrival, the card still carries its foot legend', await page.locator('[data-audit="ops-matrix-foot"]').count(), 1);
      // The rest of the site is unchanged by the exception: nothing else declares one, and every
      // other mount is swept in leg 3 below.
      eq('no <details> is open anywhere in the matrix card', await page.locator(`${GRID} details[open]`).count(), 0);
    } finally {
      await page.close();
    }
  }

  // ── Leg 2: arrows move the SELECTION, Esc closes ─────────────────────────────────────────────
  {
    const page = await mountRegistered(browser, 'ops-matrix');
    try {
      // What Tab does: put DOM focus on the grid's single tab stop.
      await page.evaluate((g) => document.querySelector(`${g} [tabindex="0"]`).focus(), GRID);
      const labelOf = () => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? null);
      const start = await labelOf();
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(80);
      const moved = await labelOf();
      checks += 1;
      if (!moved || moved === start) failures.push(`no-default-open: arrow keys did not move focus (still ${JSON.stringify(start)})`);
      // 2026-09-09 item 3: "Arrow keys move the selection; panel follows."
      eq('after arrowing, exactly one cell is selected', await page.locator(`${GRID} [aria-selected="true"]`).count(), 1);
      eq('after arrowing, the panel is still open and has followed', await page.locator(PANEL).count(), 1);
      eq(
        'the selection is the cell the arrows landed on',
        await page.evaluate((g) => document.querySelector(`${g} [aria-selected="true"]`)?.getAttribute('aria-label') ?? null, GRID),
        moved
      );
      eq('the tab stop moved with it (still exactly one)', await page.locator(`${GRID} [tabindex="0"]`).count(), 1);
      eq('the arrival declaration is gone the moment the reader acts', await page.locator('[data-open-on-mount]').count(), 0);

      // "Esc closes."
      await page.keyboard.press('Escape');
      await page.waitForTimeout(120);
      eq('Esc leaves nothing selected', await page.locator(`${GRID} [aria-selected="true"]`).count(), 0);
      eq('Esc renders no fact card', await page.locator('[data-audit="ops-fact-card"]').count(), 0);
      eq('Esc does NOT re-open the default (a closed panel stays closed)', await page.locator(`${PANEL}[data-open-on-mount]`).count(), 0);

      // Enter re-opens on the focused cell.
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
