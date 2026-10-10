// HYDRA-1 enforcer (lane hydra1-home-hydration-mismatch, 2026-10-10): "the hydration leg is proven by
// attack, on the real home route tree, across the server/client environment matrix."
//
// Live smoke run 38027370806 found React error #418 on the home page at 375px while the hydration
// leg was green, because the leg only hydrated the shared <Masthead/> at one 25 hour skew in the SAME
// locale and zone as its SSR pass. This file proves, in a real chromium (CLAUDE.md rule 15):
//   1. the shipped matrix is clean: zero failures, and it ran the real home route in every state
//      (populated, empty, failed) under a 90 second skew, a different locale and zone, and 375px;
//   2. a component rendering `new Date().toLocaleTimeString()` is RED (the lane brief's named attack),
//      and a component that differs ONLY by locale and zone (no skew at all) is RED, so the
//      environment axis is detected on its own;
//   3. the detector refuses a wrong declaration in BOTH directions: a broken component declared
//      clean is reported as a hydration mismatch, and a clean component declared broken is reported as
//      "RED control did not reproduce" (a silent detector fails loudly, never green).
//
// Self-skips (diagnosably) where playwright is not installed, the posture of rd-82-title-words and
// rd-80-real-fonts.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function skipIfNoPlaywright(t) {
  try {
    require.resolve('playwright');
    return false;
  } catch {
    t.skip('playwright is not installed in this lane; this test runs for real wherever `npm install --no-save playwright@1.61.1` has been run');
    return true;
  }
}

async function withBrowser(fn) {
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  try {
    return await fn(browser);
  } finally {
    await browser.close();
  }
}

test('HYDRA-1: the shipped hydration matrix is clean and covers the real home route in every state', async (t) => {
  if (skipIfNoPlaywright(t)) return;
  const { HYDRATION_RUNS, runSmoke } = await import('./smoke/hydration-smoke.mjs');
  const homeStates = HYDRATION_RUNS.filter((r) => r.name.startsWith('home') && !r.mustError).map((r) => r.name);
  assert.deepEqual([...new Set(homeStates)].sort(), ['home', 'home-empty', 'home-failed']);
  const result = await withBrowser((b) => runSmoke(b));
  assert.deepEqual(result.failures, []);
  const expectedChecks = HYDRATION_RUNS.reduce((n, r) => n + r.envs.length, 0);
  assert.equal(result.checks, expectedChecks, 'every declared case x environment ran');
});

test('HYDRA-1 attack: toLocaleTimeString in render is RED under a 90 second skew', async (t) => {
  if (skipIfNoPlaywright(t)) return;
  const { runHydrationRuns } = await import('./smoke/hydration-smoke.mjs');
  const declaredClean = [{ name: 'red-time-string', label: 'attack:time-string', mustError: false, envs: ['mobileSame'] }];
  const { failures } = await withBrowser((b) => runHydrationRuns(b, declaredClean));
  assert.equal(failures.length, 1);
  assert.match(failures[0], /attack:time-string @ mobileSame .*\+90s.*hydration mismatch/);
});

test('HYDRA-1 attack: a locale and zone difference alone (zero skew) is RED', async (t) => {
  if (skipIfNoPlaywright(t)) return;
  const { runHydrationRuns } = await import('./smoke/hydration-smoke.mjs');
  const declaredClean = [{ name: 'red-locale-date', label: 'attack:locale-date', mustError: false, envs: ['mobileFar'], skewMs: 0 }];
  const { failures } = await withBrowser((b) => runHydrationRuns(b, declaredClean));
  assert.equal(failures.length, 1);
  assert.match(failures[0], /attack:locale-date @ mobileFar \(de-DE, Pacific\/Kiritimati, 375px, \+0s\).*hydration mismatch/);
  // The same component in the SERVER's own environment is clean: the failure above is the environment, not the component.
  const sameEnv = [{ name: 'red-locale-date', label: 'control:locale-date-same-env', mustError: false, envs: ['serverTwin'], skewMs: 0 }];
  const control = await withBrowser((b) => runHydrationRuns(b, sameEnv));
  assert.deepEqual(control.failures, []);
});

test('HYDRA-1 attack: a clean component declared RED is reported as a silent detector, not passed', async (t) => {
  if (skipIfNoPlaywright(t)) return;
  const { runHydrationRuns } = await import('./smoke/hydration-smoke.mjs');
  const declaredBroken = [{ name: 'masthead', label: 'attack:silent-detector', props: { title: 'Regulations', dateLabel: 'Sunday, September 6, 2026', nowIso: '2026-09-06T23:30:00.000Z', commandBar: { itemCount: 1316, scope: 'regulations' } }, mustError: true, envs: ['mobileSame'] }];
  const { failures } = await withBrowser((b) => runHydrationRuns(b, declaredBroken));
  assert.equal(failures.length, 1);
  assert.match(failures[0], /attack:silent-detector .*RED control did not reproduce a hydration mismatch/);
});
