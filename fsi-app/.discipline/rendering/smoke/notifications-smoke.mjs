// SM smoke spec: notification bell + preferences. Lane GATES-1, 2026-09-02, finish plan Wave 1.
// Mounts TWO real components side by side via harness.mjs: `NotificationsBell`
// (src/components/community/NotificationsBell.tsx — which itself mounts the real
// `NotificationsList` on open, exactly as production does; nothing about that nesting is
// reproduced) and `NotificationPreferences` (src/components/profile/NotificationPreferences.tsx).
//
// STATE AXIS. The three "empty / one-row / extreme-data" states are keyed to the bell's unread
// VOLUME and notification-list SIZE (smoke-fixtures.mjs's notificationsFixtures) — the shape a
// customer's inbox actually varies along. NotificationPreferences has no equivalent "empty" state of
// its own (it always renders its six rows, defaulted or loaded — see the component's own header); its
// one real interaction (a toggle switch) is proven once, in the one-row pass, rather than invented
// three times over an axis that does not apply to it.
//
// CLICK-FIRE PROOF. "Mark all notifications as read" (NotificationsList) is disabled at zero unread —
// correctly so, nothing to mark; asserting it "enabled" there would mean asserting a bug. It is
// clicked in the one-row and extreme-data passes, and the observable effect crosses BOTH components:
// NotificationsList's onUnreadCountChange callback into NotificationsBell's own badge state, exactly
// the integration NotificationsBell's header comment documents ("When the list updates the count …
// it calls back so the badge stays in sync without a roundtrip poll").

import { bundleEntry, newSmokePage, mountBundle, measureGuard, assertGuardClean } from './harness.mjs';
import { notificationsFixtures } from './smoke-fixtures.mjs';

const ENTRY = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { NotificationsBell } from '@/components/community/NotificationsBell';
import { NotificationPreferences } from '@/components/profile/NotificationPreferences';

let bellRoot = null;
let prefsRoot = null;
window.__mountBell = () => {
  const el = document.getElementById('bell-root');
  if (!bellRoot) bellRoot = createRoot(el);
  bellRoot.render(React.createElement(NotificationsBell));
};
window.__mountPrefs = (props) => {
  const el = document.getElementById('prefs-root');
  if (!prefsRoot) prefsRoot = createRoot(el);
  prefsRoot.render(React.createElement(NotificationPreferences, props));
};
`;

function apiRoutesFor({ unreadCount, notifications, totalMatching }) {
  return [
    {
      urlGlob: '**/api/community/notifications**',
      handler: (route) => {
        const req = route.request();
        const url = req.url();
        if (req.method() === 'POST') return route.fulfill({ json: { ok: true } });
        if (url.includes('unread_only')) return route.fulfill({ json: { unread_count: unreadCount } });
        return route.fulfill({
          json: { notifications, total_matching: totalMatching, unread_count: unreadCount },
        });
      },
    },
  ];
}

export async function runSmoke(browser) {
  const failures = [];
  let checks = 0;
  const bundleJs = await bundleEntry(ENTRY);
  const { empty, oneRow, extreme } = notificationsFixtures();

  async function openBellAndAssertBadge(page, state, expectBadge) {
    checks++;
    failures.push(...assertGuardClean(`notifications[${state}]`, await measureGuard(page)));

    const bell = await page.$('#bell-root button[aria-label*="Notifications"]');
    checks++;
    if (!bell) {
      failures.push(`notifications[${state}]: primary action (bell) is missing.`);
      return null;
    }
    const disabled = await bell.evaluate((el) => el.disabled);
    if (disabled) failures.push(`notifications[${state}]: bell button is present but disabled.`);

    const badgeBefore = await page.$('#bell-root button[aria-label*="Notifications"] span');
    checks++;
    const hasBadge = badgeBefore !== null;
    if (hasBadge !== expectBadge) {
      failures.push(`notifications[${state}]: expected unread badge presence=${expectBadge}, found ${hasBadge}.`);
    }

    // click-fire #1: the bell itself. setOpen(true) -> the dropdown (real NotificationsList) mounts.
    await bell.click();
    await page.waitForTimeout(250);
    const dropdown = await page.$('[role="dialog"][aria-label="Notifications"]');
    checks++;
    if (!dropdown) {
      failures.push(`notifications[${state}]: clicking the bell did not open the dropdown (onClick handler did not fire).`);
    }
    failures.push(...assertGuardClean(`notifications[${state}].dropdown`, await measureGuard(page)));
    return bell;
  }

  // ── empty ──────────────────────────────────────────────────────────────
  {
    const page = await newSmokePage(browser, {
      apiRoutes: apiRoutesFor(empty),
      rootIds: ['bell-root', 'prefs-root'],
    });
    await mountBundle(page, bundleJs, '__mountBell');
    await page.evaluate(() => window.__mountBell());
    await page.waitForTimeout(150);

    await openBellAndAssertBadge(page, 'empty', false);

    const markAllBtn = await page.$('button[aria-label="Mark all notifications as read"]');
    checks++;
    if (!markAllBtn) {
      failures.push('notifications[empty]: "Mark all read" control is missing.');
    } else {
      const disabled = await markAllBtn.evaluate((el) => el.disabled);
      checks++;
      if (!disabled) {
        failures.push('notifications[empty]: "Mark all read" is enabled with zero unread notifications (should be disabled — nothing to mark).');
      }
    }

    await page.close();
  }

  // ── one-row ────────────────────────────────────────────────────────────
  {
    const page = await newSmokePage(browser, {
      apiRoutes: apiRoutesFor(oneRow),
      rootIds: ['bell-root', 'prefs-root'],
    });
    await page.addScriptTag({ content: bundleJs });
    await page.evaluate(() => window.__mountBell());
    await page.evaluate((props) => window.__mountPrefs(props), { userId: 'smoke-user' });
    await page.waitForTimeout(200);

    const bell = await openBellAndAssertBadge(page, 'one-row', true);

    const markAllBtn = await page.$('button[aria-label="Mark all notifications as read"]');
    checks++;
    if (!markAllBtn) {
      failures.push('notifications[one-row]: "Mark all read" control is missing.');
    } else {
      const disabled = await markAllBtn.evaluate((el) => el.disabled);
      if (disabled) failures.push('notifications[one-row]: "Mark all read" is present but disabled with 1 unread.');

      await markAllBtn.click();
      await page.waitForTimeout(200);
      const badgeAfter = await page.$('#bell-root button[aria-label*="Notifications"] span');
      checks++;
      if (badgeAfter) {
        failures.push('notifications[one-row]: unread badge is still present after "Mark all read" (NotificationsList -> NotificationsBell callback did not fire).');
      }
    }
    void bell;

    // preferences: a toggle switch click, the "+ preferences" half of this spec's target.
    const toggle = await page.$('#prefs-root button[role="switch"]');
    checks++;
    if (!toggle) {
      failures.push('notifications[one-row]: primary action (a preferences toggle) is missing.');
    } else {
      const disabled = await toggle.evaluate((el) => el.disabled);
      if (disabled) failures.push('notifications[one-row]: preferences toggle is present but disabled.');

      const before = await toggle.getAttribute('aria-checked');
      await toggle.click();
      await page.waitForTimeout(200);
      const after = await toggle.getAttribute('aria-checked');
      checks++;
      if (before === after) {
        failures.push(`notifications[one-row]: clicking a preferences toggle did not flip aria-checked (${before} -> ${after}); onFlip -> persist did not fire.`);
      }
    }

    await page.close();
  }

  // ── extreme-data ───────────────────────────────────────────────────────
  {
    const page = await newSmokePage(browser, {
      apiRoutes: apiRoutesFor(extreme),
      rootIds: ['bell-root', 'prefs-root'],
    });
    await mountBundle(page, bundleJs, '__mountBell');
    await page.evaluate(() => window.__mountBell());
    await page.waitForTimeout(150);

    const bell = await openBellAndAssertBadge(page, 'extreme', true);

    // 150 unread -> the bell's own ">99" truncation.
    const badgeText = await page.textContent('#bell-root button[aria-label*="Notifications"] span');
    checks++;
    if (badgeText?.trim() !== '99+') {
      failures.push(`notifications[extreme]: expected the unread badge to read "99+" at 150 unread, got "${badgeText}".`);
    }

    const markAllBtn = await page.$('button[aria-label="Mark all notifications as read"]');
    checks++;
    if (!markAllBtn) {
      failures.push('notifications[extreme]: "Mark all read" control is missing.');
    } else {
      await markAllBtn.click();
      await page.waitForTimeout(200);
      const badgeAfter = await page.$('#bell-root button[aria-label*="Notifications"] span');
      checks++;
      if (badgeAfter) {
        failures.push('notifications[extreme]: unread badge is still present after "Mark all read" at extreme volume.');
      }
    }
    void bell;

    await page.close();
  }

  return { checks, failures };
}
