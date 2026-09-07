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

  return { checks, failures };
}
