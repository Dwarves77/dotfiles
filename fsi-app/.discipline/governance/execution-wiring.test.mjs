// NEGATIVE + POSITIVE test for the execution-wiring resolver — the proof that the meta-gate's
// "is this proof actually RUN?" check discriminates, rather than rubber-stamping (the turtle-at-the-top
// concern the meta-gate documents). If this resolver ever silently returned true for everything, the
// wiring-truth hardening would be a no-op and unrun proofs would pass the gate again. This test forbids that.
//
// Pure: reads the real runner files in the repo (no DB, no network) — runs in the no-npm discipline suite
// via the governance/*.test.mjs glob.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isExecutionWired } from './execution-wiring.mjs';

// POSITIVE: at least one real path from EACH execution surface must resolve wired. If a surface's parser
// breaks (e.g. the AUDITS regex stops matching), that surface's assertion fails loudly here.
test('execution-wiring: each surface resolves a known-wired file', () => {
  const wired = [
    'fsi-app/scripts/verify/mint-gates.golden.mjs',          // surface 3: run-goldens (.golden.mjs)
    'fsi-app/scripts/verify/funded-pass-lock-golden.mjs',    // surface 3: run-goldens (-golden.mjs)
    'fsi-app/scripts/verify/one-tier-per-host-audit.mjs',    // surface 4: data-audit lane
    'fsi-app/scripts/verify/rls-credential-parity.mjs',      // surface 4: data-audit lane (newly wired)
    'fsi-app/src/lib/trust.selftest.mjs',                    // surface 5: fitness sentinel (F11 spawn)
    'fsi-app/src/lib/sources/source-growth.selftest.mjs',    // surface 5: fitness sentinel (F10 spawn)
    'fsi-app/src/lib/agent/floor-attribution.test.mjs',      // surface 1: no-npm suite glob
    'fsi-app/src/lib/intake/mint-idempotency.npmtest.mjs',   // surface 2: npmtest glob
    'fsi-app/.discipline/rendering/run-rendering-guard.mjs', // surface 6: rendering-guard job
  ];
  for (const p of wired) assert.equal(isExecutionWired(p), true, `expected WIRED: ${p}`);
});

// NEGATIVE: a file that exists nowhere in any runner must resolve NOT wired. This is the assertion that
// fails if the resolver ever degrades into "always true" — the whole point of the hardening.
test('execution-wiring: a file no runner runs resolves NOT wired', () => {
  assert.equal(isExecutionWired('fsi-app/scripts/verify/__totally-unwired-sentinel__.mjs'), false);
  assert.equal(isExecutionWired('fsi-app/src/lib/__nope__.selftest.mjs'), false);
  // A plausible-looking golden OUTSIDE scripts/verify/ is not caught by the goldens glob (which is
  // directory-scoped) and matches no other surface — must be NOT wired.
  assert.equal(isExecutionWired('fsi-app/src/some-other-dir/thing.golden.mjs'), false);
});

// GUARD: the goldens surface is directory-scoped (only scripts/verify/). A .golden.mjs elsewhere is not
// auto-wired — proves the matcher isn't an over-broad "any .golden.mjs anywhere".
test('execution-wiring: goldens surface is directory-scoped to scripts/verify/', () => {
  assert.equal(isExecutionWired('fsi-app/scripts/verify/x.golden.mjs'), true);
  assert.equal(isExecutionWired('fsi-app/other/x.golden.mjs'), false);
});
