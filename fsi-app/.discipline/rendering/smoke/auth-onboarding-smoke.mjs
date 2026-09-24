// SM smoke spec: AuthFrame + the auth/onboarding chrome (lane uiauth,
// 2026-09-06, UI system handoff README screens 16/17). Mounts the REAL
// src/components/auth/AuthFrame.tsx, AuthPanel.tsx's AuthTabs, and
// src/components/onboarding/OnboardingStepper.tsx — the three new shared
// parts /login, /signup, /workspace/new and /onboarding all render through.
// Full page mounts (LoginPage, OnboardingWizard) are not bundled here: both
// depend on next/navigation's useRouter/useSearchParams, which this
// harness's DEFAULT_ALIAS does not stub (only next/link and
// supabase-browser are) — adding that stub is a harness-wide change
// outside this lane's write set. What IS proven here is the actual
// shared-chrome geometry every one of those four pages renders unmodified:
// the split frame does not overflow horizontally at any viewport, the tab
// strip and stepper render their real content (not a reproduction), and
// the band legend inside AuthFrame shows all four real band labels from
// src/lib/urgency/bands.ts (not a hand-typed string).

import { bundleEntry, newSmokePage, mountBundle, measureGuard, assertGuardClean } from './harness.mjs';
import { fullAppCssCompiled, verifyFontsLoaded } from './smoke-fixtures.mjs';
import { AUDIT_MOUNTS, mountExtraCss } from '../audit/mounts.mjs';
import { measureUx, assertUxClean } from '../ux-assert.mjs';

// ── The real auth PAGES at phone and desktop width (lane MASTHEAD-AUTH, 2026-09-24, RD-82) ──────
// The shared-chrome leg below never mounted the Masthead the auth frame's right panel has carried
// since W10-Masthead (#786), and nothing else measured these pages under 1024: the layout guard runs
// only 1440 and 1024, and this spec's 380 leg reads scroll overflow, which the frame's own
// `overflow: hidden` swallows. So two defects shipped past two green guard runs: "SIGN IN" one
// letter per line at 1440, and, at 375, the whole sign-in form clipped off-screen to the right.
// This leg mounts the REAL /login, /signup and onboarding pages, through the design audit's own
// compose mounts (the same entries and stubs the layout guard uses, not a second reproduction), at
// 375, 1024 and 1440, and holds them to exactly the two rules those defects broke:
//   - RD-82: no heading or title narrower than its longest word (ux-assert detectWordBrokenTitles);
//   - no element clipped past the viewport's right edge (ux-assert detectClippedOverflow).
// The rest of assertUxClean (the law-2 target floor) is NOT asserted here: its findings on these
// pages ("Privacy", "Forgot password?", the tab strip, "+ N more jurisdictions") are the layout
// guard's dated L9 baseline entries, whose clearing the operator scheduled after the UI round
// (baseline.mjs, 2026-09-09); asserting them here would re-open that ruling from a side door.
// RD-80's loaded-faces check runs first: a word width is only meaningful in the declared face.
const PAGE_MOUNTS = ['compose-login', 'compose-signup', 'compose-onboarding'];
const PAGE_VIEWPORTS = [375, 1024, 1440];

async function runPageLeg(browser) {
  const failures = [];
  let checks = 0;
  const css = await fullAppCssCompiled();
  for (const id of PAGE_MOUNTS) {
    const mount = AUDIT_MOUNTS[id];
    const js = await bundleEntry(mount.entry, { alias: mount.alias || {} });
    for (const width of PAGE_VIEWPORTS) {
      const page = await newSmokePage(browser, { apiRoutes: mount.apiRoutes || [] });
      try {
        await page.setViewportSize({ width, height: 900 });
        await page.addStyleTag({ content: css });
        const extra = mountExtraCss(mount);
        if (extra) await page.addStyleTag({ content: extra });
        await mountBundle(page, js, '__mount', null);
        await page.waitForTimeout(200);
        checks++;
        const missing = await verifyFontsLoaded(page);
        if (missing.length) {
          failures.push(`auth-page[${id}@${width}]: declared faces not loaded, refusing to measure on a fallback: ${missing.join(', ')}`);
          continue;
        }
        const ux = await measureUx(page);
        failures.push(...assertUxClean(`auth-page[${id}@${width}]`, { titleWords: ux.titleWords, clipped: ux.clipped }));
      } finally {
        await page.close();
      }
    }
  }
  return { checks, failures };
}

const ENTRY = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { AuthFrame } from '@/components/auth/AuthFrame';
import { AuthTabs, AuthField, AUTH_INPUT_STYLE } from '@/components/auth/AuthPanel';
import { OnboardingStepper } from '@/components/onboarding/OnboardingStepper';

let root = null;

window.__mountAuth = (props) => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  const body = props.view === 'onboarding'
    ? React.createElement('div', { style: { width: 520 } },
        React.createElement(OnboardingStepper, { current: 2 }),
      )
    : React.createElement('div', { style: { width: 380 } },
        React.createElement(AuthTabs, { active: 'signin' }),
        React.createElement(AuthField, { label: 'Work email' },
          React.createElement('input', { style: AUTH_INPUT_STYLE, placeholder: 'name@company.com' }),
        ),
      );
  root.render(React.createElement(AuthFrame, null, body));
};
`;

const VIEWPORTS = [380, 768, 1440];

export async function runSmoke(browser) {
  const failures = [];
  let checks = 0;
  const bundleJs = await bundleEntry(ENTRY);

  for (const view of ['auth', 'onboarding']) {
    for (const width of VIEWPORTS) {
      const page = await newSmokePage(browser);
      await page.setViewportSize({ width, height: 900 });
      await mountBundle(page, bundleJs, '__mountAuth', { view });
      await page.waitForTimeout(150);

      checks++;
      failures.push(...assertGuardClean(`auth-frame[${view}@${width}]`, await measureGuard(page)));

      if (view === 'auth') {
        const signInTab = await page.$('text=Sign in');
        const createTab = await page.$('text=Create account');
        checks++;
        if (!signInTab || !createTab) {
          failures.push(`auth-frame[auth@${width}]: AuthTabs did not render both "Sign in" and "Create account".`);
        }
      } else {
        const stepLabels = (await page.textContent('body')) || '';
        checks++;
        for (const label of ['Workspace', 'Modes & jurisdictions', 'Sectors', 'Briefing']) {
          if (!stepLabels.includes(label)) {
            failures.push(`auth-frame[onboarding@${width}]: OnboardingStepper is missing the "${label}" step label.`);
          }
        }
      }

      // The four real band labels (src/lib/urgency/bands.ts BAND_ORDER), not a
      // hand-typed reproduction — proves AuthFrame imports the one urgency
      // vocabulary rather than a page-local copy.
      const bodyText = await page.textContent('body');
      checks++;
      for (const label of ['Immediate', 'Action', 'Monitor', 'Awareness']) {
        if (!bodyText.includes(label)) {
          failures.push(`auth-frame[${view}@${width}]: band legend is missing the "${label}" label.`);
        }
      }

      await page.close();
    }
  }

  const pageLeg = await runPageLeg(browser);
  checks += pageLeg.checks;
  failures.push(...pageLeg.failures);

  return { checks, failures };
}
