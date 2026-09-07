// Hydration smoke (lane HYDRATION-59, 2026-09-07). GOVERNING skill: caros-ledge-platform-intent.
//
// WHAT IT PROVES, AND WHY NOTHING ELSE IN THIS ENGINE DID. The rendering guard's fixture legs feed
// `page.setContent(hand-written HTML)` — no React, so no hydration. The SM/UX smoke specs mount
// real components with `createRoot` — a client-only render, so again no hydration. Neither could
// ever have caught React error #418, which needs the actual two-pass sequence: an SSR string
// produced by ONE clock, then `hydrateRoot` over it with ANOTHER. That gap is why the 2026-09-07
// clickthrough audit found #418 (and its `$RS ... parentNode` follow-on) live on production
// /regulations and /map with every gate green.
//
// THE MECHANISM. Inside the same Playwright chromium the rest of the guard uses:
//   1. patch the global `Date` so `new Date()` / `Date.now()` answer instant A;
//   2. `renderToString(<C {...props} />)` — this is the SSR pass;
//   3. restore the real `Date`, then advance it to instant B = A + 25 hours (a different calendar
//      day AND a different ISO week when A is a Sunday) — this is the "the browser's clock is not
//      the server's clock" condition every real viewer west or east of UTC satisfies for part of
//      every day, made deterministic;
//   4. `hydrateRoot(container, <C {...props} />, { onRecoverableError })` and collect what React
//      reports. A text mismatch surfaces here as a recoverable error — the un-minified form of #418.
//
// RED-THEN-GREEN (CLAUDE.md rule 15 — a guard is proven by attack, not by presence). The spec runs
// TWO components through the identical sequence:
//   - RED: `ClockReader`, a component defined in the bundle that reproduces the pre-fix pattern
//     exactly (an ISO-week number computed from `new Date()` with the LOCAL field getters, the way
//     `Masthead` did before this lane). It MUST report a hydration error; if it does not, the
//     detector is broken and this spec fails LOUDLY rather than passing vacuously.
//   - GREEN: the REAL `<Masthead/>` (src/components/ui/Masthead.tsx), given `nowIso`. It must be
//     clean under the same 25-hour clock skew.
//
// COST: the shared chromium process, no network (harness.mjs intercepts every request), no
// database, no credential — same posture as every other file in this directory.

import { bundleEntry, newSmokePage } from './harness.mjs';

/** A = a Sunday (so A and A+25h fall in different ISO weeks as well as different days). */
const INSTANT_A = '2026-09-06T23:30:00.000Z';
const SKEW_MS = 25 * 60 * 60 * 1000;

const ENTRY = `
import React from 'react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { Masthead } from '@/components/ui/Masthead';

// The RED control: the defect class this lane removed, kept alive HERE (and only here) so the
// detector is exercised on every run. Local field getters + this component's own clock — the exact
// shape Masthead's isoWeekNumber had before HYDRATION-59.
function isoWeekLocal(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
function ClockReader() {
  return React.createElement('p', null, 'VOL IV \\u00b7 No. ' + isoWeekLocal(new Date()));
}

const CASES = {
  red: (props) => React.createElement(ClockReader, props),
  green: (props) => React.createElement(Masthead, props),
};

// Freeze the global clock at \`iso\`, run \`fn\`, restore. Both \`new Date()\` and \`Date.now()\` are
// covered, and \`new Date(x)\` keeps working.
function atInstant(iso, fn) {
  const Real = Date;
  const fixed = new Real(iso).getTime();
  function Fake(...args) {
    return args.length === 0 ? new Real(fixed) : new Real(...args);
  }
  Fake.prototype = Real.prototype;
  Fake.now = () => fixed;
  Fake.UTC = Real.UTC;
  Fake.parse = Real.parse;
  globalThis.Date = Fake;
  try {
    return fn();
  } finally {
    globalThis.Date = Real;
  }
}

window.__hydrationCase = async ({ name, props, serverIso, clientIso }) => {
  const make = CASES[name];
  const el = make(props);
  const html = atInstant(serverIso, () => renderToString(el));
  const host = document.getElementById('smoke-root');
  host.innerHTML = html;
  const errors = [];
  await new Promise((resolve) => {
    atInstant(clientIso, () => {
      hydrateRoot(host, make(props), {
        onRecoverableError: (err) => errors.push(String((err && err.message) || err)),
      });
    });
    // Two frames: hydration is scheduled, not synchronous.
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
  return { html, errors };
};
`;

const MASTHEAD_PROPS = {
  title: 'Regulations',
  dateLabel: 'Sunday, September 6, 2026',
  nowIso: INSTANT_A,
  commandBar: { itemCount: 1316, scope: 'regulations' },
};

export async function runSmoke(browser) {
  const failures = [];
  let checks = 0;
  const bundleJs = await bundleEntry(ENTRY);
  const clientIso = new Date(new Date(INSTANT_A).getTime() + SKEW_MS).toISOString();

  const cases = [
    { name: 'red', props: {}, mustError: true, label: 'hydration:red-clock-reader' },
    { name: 'green', props: MASTHEAD_PROPS, mustError: false, label: 'hydration:masthead' },
  ];

  const page = await newSmokePage(browser);
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.addScriptTag({ content: bundleJs });
    for (const c of cases) {
      const result = await page.evaluate(
        ({ name, props, serverIso, clientIso: ci }) => window.__hydrationCase({ name, props, serverIso, clientIso: ci }),
        { name: c.name, props: c.props, serverIso: INSTANT_A, clientIso },
      );
      checks += 1;
      const hydrationErrors = result.errors.filter((e) =>
        /hydrat|did not match|didn't match/i.test(e),
      );
      if (c.mustError && hydrationErrors.length === 0) {
        failures.push(
          `${c.label}: RED control did not reproduce a hydration mismatch under a ${SKEW_MS / 3600000}h clock skew — ` +
            'the detector is broken, not the app. Do not treat the GREEN result below as meaningful.',
        );
      }
      if (!c.mustError && hydrationErrors.length > 0) {
        failures.push(`${c.label}: hydration mismatch — ${hydrationErrors.join(' | ')}`);
      }
      // Reset the mount point between cases.
      await page.evaluate(() => {
        document.getElementById('smoke-root').innerHTML = '';
      });
    }
  } finally {
    await page.close();
  }
  return { checks, failures };
}
