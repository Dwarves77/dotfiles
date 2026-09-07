// UX smoke spec: Settings section index. Lane UIADMIN2, 2026-09-07, ruling R9 (operator, via Claude
// Design, docs/design/handoff-2026-09-06/DEVIATION-LOG.md "RULINGS" section). R9 retired the second
// tab row `/settings` used to carry (General / Saved searches / Data & supersessions / Archive /
// Help) in favour of the sticky S1 . S2 . S3 SectionIndex reused from the detail architecture
// (src/components/detail/DetailShell.tsx) — a horizontal row of section links directly under the
// Account tab row, left-aligned, with the five items anchored as one scrolling page rather than five
// routes/tabs. This spec mounts the REAL `SettingsPage` (src/components/pages/SettingsPage.tsx) and
// proves the section index itself: five `S1 . S2 . …` links render, each one's `href` is `#<id>` of
// an anchor actually present in the DOM (`document.getElementById(id)`), and there is exactly ONE tab
// row on the page (the merged Account `TabRow`) — no second SubTabBar/tablist survives.
//
// Everything else on the page (dashboard settings, freight sectors, notifications, briefing
// schedule, saved searches, data summary, CSV upload, supersession history, archive, help) is
// unchanged by this lane and already covered by its own specs (personal-archive-smoke.mjs mounts
// ArchiveViewer; notifications-smoke.mjs mounts NotificationPreferences; spec09-panels covers the CSV
// upload) — this spec does not re-prove those bodies, only the new section-index navigation.

import { bundleEntry, newSmokePage, mountBundle, measureGuard, assertGuardClean } from './harness.mjs';
import { fullAppCss } from './smoke-fixtures.mjs';

const STYLE_INJECT = `
(() => {
  const style = document.createElement('style');
  style.textContent = ${JSON.stringify(fullAppCss())};
  document.head.appendChild(style);
})();
`;

const ENTRY = `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { SettingsPage } from '@/components/pages/SettingsPage';

let root = null;
window.__mount = (props) => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(React.createElement(SettingsPage, props));
};
`;

// SettingsPage's client-side hooks (usePersonalStateHydration -> useWorkspaceBootstrap) fetch
// /api/workspace/bootstrap; fail-soft by design (see usePersonalState.ts's own header) but answered
// here so first render is quiet. Nothing else on this page fetches on mount (NotificationPreferences
// / BriefingScheduleSection call the stubbed Supabase browser client via harness.mjs's default alias,
// not fetch).
const API_ROUTES = [
  { urlGlob: '**/api/workspace/bootstrap**', handler: (route) => route.fulfill({ json: { personalState: [], overrides: [] } }) },
];

const PROPS = {
  initialResources: [],
  initialArchived: [],
  supersessions: [],
  userId: 'smoke-user-1',
  userEmail: 'smoke@example.com',
};

// Addendum item 7 (2026-09-07, lane uisettings2, DEVIATION-LOG.md): Notifications moved off the
// profile page onto Settings as its own anchored section placed right after General, so the index
// grew from R9's original five entries to six.
const SECTION_IDS = ['general', 'notifications', 'saved', 'data', 'archive', 'help'];

export async function runSmoke(browser) {
  const failures = [];
  let checks = 0;
  const bundleJs = await bundleEntry(ENTRY);

  for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 812 }]) {
    const page = await newSmokePage(browser, { apiRoutes: API_ROUTES });
    await page.setViewportSize(viewport);
    await page.addScriptTag({ content: bundleJs });
    await page.evaluate((p) => window.__mount(p), PROPS);
    await page.waitForTimeout(200);

    const label = `settings-section-index[${viewport.width}px]`;

    checks++;
    failures.push(...assertGuardClean(label, await measureGuard(page)));

    // Exactly one tab row (the merged Account TabRow) — no second-level tablist survives.
    const tabCount = await page.$$eval('[role="tablist"], nav[aria-label="Settings sections"]', (els) => els.length);
    checks++;
    if (tabCount !== 0) {
      failures.push(`${label}: a second-level tab row still renders (${tabCount} found) — R9 retires it in favour of the section index.`);
    }

    // The section index itself: one nav[aria-label="Section index"] with 5 links, S1..S5.
    const navCount = await page.$$eval('nav[aria-label="Section index"]', (els) => els.length);
    checks++;
    if (navCount !== 1) {
      failures.push(`${label}: expected exactly one SectionIndex nav, found ${navCount}.`);
    }

    const linkTexts = await page.$$eval('nav[aria-label="Section index"] a', (els) => els.map((el) => el.textContent?.trim() ?? ''));
    checks++;
    const expectedOrdinals = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'];
    const hasAllOrdinals = expectedOrdinals.every((s, i) => linkTexts[i]?.startsWith(s));
    if (linkTexts.length !== 6 || !hasAllOrdinals) {
      failures.push(`${label}: section index links did not read S1..S6 in order — got ${JSON.stringify(linkTexts)}.`);
    }

    // Every href resolves to a real anchor id actually present in the DOM.
    const hrefs = await page.$$eval('nav[aria-label="Section index"] a', (els) => els.map((el) => el.getAttribute('href')));
    checks++;
    for (const id of SECTION_IDS) {
      const href = `#${id}`;
      if (!hrefs.includes(href)) {
        failures.push(`${label}: SectionIndex has no link to ${href}.`);
        continue;
      }
      const exists = await page.$eval(`#${id}`, () => true).catch(() => false);
      if (!exists) {
        failures.push(`${label}: anchor #${id} is linked from the index but not present in the DOM.`);
      }
    }

    await page.close();
  }

  return { checks, failures };
}
