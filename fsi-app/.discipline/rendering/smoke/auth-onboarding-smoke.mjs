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

// -- /signup, already-registered branch (lane AUTH-1, 2026-10-06) ---------------------------------
// Supabase answers a repeated signup with a success-shaped response (user present, identities an
// empty array, no email sent). The REAL /signup page is mounted through the compose-signup entry and
// submitted with that exact response (stub-supabase-browser-auth.mjs reads window.__SIGNUP_FIXTURE__);
// it must say the address already has an account, link to sign in and to the password reset, and must
// never claim a link was sent. A fresh-address response is submitted too, so the confirmation branch
// is proven unchanged.
const SIGNUP_FIXTURES = {
  repeated: { data: { user: { id: 'u-existing', email: 'dup@example.com', identities: [] }, session: null }, error: null },
  fresh: { data: { user: { id: 'u-new', email: 'new@example.com', identities: [{ id: 'i1', provider: 'email' }] }, session: null }, error: null },
};

async function submitSignup(browser, css, js, width, fixture) {
  const page = await newSmokePage(browser, { apiRoutes: [] });
  try {
    await page.setViewportSize({ width, height: 900 });
    await page.addStyleTag({ content: css });
    await page.evaluate((f) => { window.__SIGNUP_FIXTURE__ = f; }, fixture);
    await mountBundle(page, js, '__mount', null);
    await page.waitForSelector('input[type=email]', { timeout: 5000 });
    await page.fill('input[type=email]', 'dup@example.com');
    const pw = await page.$$('input[type=password]');
    for (const input of pw) await input.fill('correct-horse-1');
    await page.click('button[type=submit]');
    await page.waitForTimeout(300);
    return {
      text: (await page.textContent('body')) || '',
      hrefs: await page.$$eval('a', (as) => as.map((a) => [a.textContent.trim(), a.getAttribute('href')])),
      ux: await measureUx(page),
    };
  } finally {
    await page.close();
  }
}

async function runSignupLeg(browser) {
  const failures = [];
  let checks = 0;
  const css = await fullAppCssCompiled();
  const mount = AUDIT_MOUNTS['compose-signup'];
  const js = await bundleEntry(mount.entry, { alias: mount.alias || {} });
  for (const width of [375, 1440]) {
    const dup = await submitSignup(browser, css, js, width, SIGNUP_FIXTURES.repeated);
    checks++;
    const tag = `signup-repeated[@${width}]`;
    if (!dup.text.includes('This email address already has an account.')) failures.push(`${tag}: missing the "already has an account" wording.`);
    if (/confirmation link|Check your email|We sent/i.test(dup.text)) failures.push(`${tag}: claims an email was sent for an already-registered address.`);
    const has = (label, href) => dup.hrefs.some(([t, h]) => t === label && h === href);
    if (!has('Sign in', '/login')) failures.push(`${tag}: no "Sign in" link to /login.`);
    if (!has('Reset your password', '/auth/reset-password')) failures.push(`${tag}: no "Reset your password" link to /auth/reset-password.`);
    failures.push(...assertUxClean(tag, { titleWords: dup.ux.titleWords, clipped: dup.ux.clipped }));

    const fresh = await submitSignup(browser, css, js, width, SIGNUP_FIXTURES.fresh);
    checks++;
    if (!fresh.text.includes('We sent a confirmation link to')) failures.push(`signup-fresh[@${width}]: the confirmation branch changed.`);
    if (fresh.text.includes('already has an account')) failures.push(`signup-fresh[@${width}]: a new address was told it already has an account.`);
  }
  return { checks, failures };
}

// -- /workspace/new, the no-workspace onboarding form at phone width (lane AUTH-2, 2026-10-06) --------
// A signed-in user with no membership lands here (AppShell redirect). The REAL NoWorkspaceLanding is
// mounted with the onboarding page-composition stubs (router + signed-out supabase, the same ones
// compose-onboarding uses) at 375 and 1440 and held to: no clipped overflow past the viewport, no
// heading narrower than its longest word, the invitation panel BEFORE the create-organisation panel
// (invitations come first), the form's own controls present (job title, organisation name, sector
// chips, company size, region chips, the one primary action), and every control of THIS form at least
// 44 CSS px tall (ux-laws 2). The legacy rows of this page (token paste, invitation buttons) are not
// asserted here: they are older than this lane.
const NO_WORKSPACE_ENTRY = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { NoWorkspaceLanding } from '@/components/onboarding/NoWorkspaceLanding';

let root = null;
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(
    React.createElement(NoWorkspaceLanding, { userId: 'smoke-user', userEmail: 'new.user@example.com' }),
  );
};
`;

async function runNoWorkspaceLeg(browser) {
  const failures = [];
  let checks = 0;
  const css = await fullAppCssCompiled();
  const alias = AUDIT_MOUNTS['compose-onboarding'].alias;
  const js = await bundleEntry(NO_WORKSPACE_ENTRY, { alias });
  for (const width of [375, 1440]) {
    const tag = `workspace-new[@${width}]`;
    const page = await newSmokePage(browser, { apiRoutes: AUDIT_MOUNTS['compose-onboarding'].apiRoutes || [] });
    try {
      await page.setViewportSize({ width, height: 900 });
      await page.addStyleTag({ content: css });
      await mountBundle(page, js, '__mount', null);
      await page.waitForSelector('input[aria-label="Your job title"]', { timeout: 5000 });
      await page.waitForTimeout(300);
      checks++;
      const missing = await verifyFontsLoaded(page);
      if (missing.length) {
        failures.push(`${tag}: declared faces not loaded, refusing to measure on a fallback: ${missing.join(', ')}`);
        continue;
      }
      const ux = await measureUx(page);
      failures.push(...assertUxClean(tag, { titleWords: ux.titleWords, clipped: ux.clipped }));

      const facts = await page.evaluate(() => {
        const text = document.body.textContent || '';
        const h = (el) => Math.round(el.getBoundingClientRect().height);
        const form = [...document.querySelectorAll('form')].find((f) => (f.textContent || '').includes('Create organisation'));
        const controls = form
          ? [...form.querySelectorAll('input, select, button')].map((el) => ({ name: el.getAttribute('aria-label') || el.textContent.trim().slice(0, 30) || el.tagName, h: h(el) }))
          : [];
        return {
          hasForm: !!form,
          invitesBeforeCreate: text.indexOf('Pending invitations') !== -1 && text.indexOf('Pending invitations') < text.indexOf('Or create your organisation'),
          jobTitle: !!document.querySelector('input[aria-label="Your job title"]'),
          orgName: !!form && !!form.querySelector('input[placeholder="Your company"]'),
          sectorChips: form ? form.querySelectorAll('button[aria-pressed]').length : 0,
          sizeSelect: !!form && !!form.querySelector('select'),
          primary: !!form && [...form.querySelectorAll('button[type=submit]')].length === 1,
          controls,
          overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });
      checks++;
      if (!facts.hasForm) { failures.push(`${tag}: the create-organisation form did not render.`); continue; }
      if (!facts.invitesBeforeCreate) failures.push(`${tag}: pending invitations must come before the create-organisation panel.`);
      if (!facts.jobTitle) failures.push(`${tag}: no job title field.`);
      if (!facts.orgName) failures.push(`${tag}: no organisation name field.`);
      if (facts.sectorChips < 10) failures.push(`${tag}: expected sector and region chips, found ${facts.sectorChips} toggle buttons.`);
      if (!facts.sizeSelect) failures.push(`${tag}: no company size select.`);
      if (!facts.primary) failures.push(`${tag}: the create form must have exactly one primary (submit) action.`);
      for (const c of facts.controls) {
        if (c.h < 44) failures.push(`${tag}: control "${c.name}" is ${c.h}px tall, under the 44px target floor.`);
      }
      if (facts.overflowX > 1) failures.push(`${tag}: horizontal page overflow of ${facts.overflowX}px.`);
    } finally {
      await page.close();
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

  const signupLeg = await runSignupLeg(browser);
  checks += signupLeg.checks;
  failures.push(...signupLeg.failures);

  const noWorkspaceLeg = await runNoWorkspaceLeg(browser);
  checks += noWorkspaceLeg.checks;
  failures.push(...noWorkspaceLeg.failures);

  return { checks, failures };
}
