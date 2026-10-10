// Shape proof for the C3 and F64 race test (lane TESTS-1, 2026-10-09; AUD-AT-5 line 254, TESTFIX-1 line 37).
// The race used to be one test with a 300000 ms cap over ten rounds, and a loaded machine cancelled it (4 of 4 full
// runs). The fix is structural, not a larger cap: the rounds are separate tests whose cap bounds ONE round. This file
// reads the race test's source and fails on the old cumulative shape, so the flake cannot be reintroduced by merging
// the rounds back into one test.
//
// Run: node --test fsi-app/.discipline/consistency/checks/C3-race-shape.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SRC = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'C3-migrations-reality.test.mjs'), 'utf8');

test('the race is not one cumulative test: no test body awaits a loop over all rounds', () => {
  // The old shape: a for-loop over rounds INSIDE one test callback.
  assert.doesNotMatch(SRC, /async \(\) => \{[^]*?for \(let round = 1; round <= ROUNDS; round\+\+\) \{\s*\n\s*const \[c3, f64\]/, 'rounds must not loop inside a single test');
});

test('every round is its own test with a per-round cap of at most 120000 ms', () => {
  assert.match(SRC, /for \(let round = 1; round <= ROUNDS; round\+\+\) \{\s*\n\s*test\(`RACE round \$\{round\} of \$\{ROUNDS\}/, 'a test is registered per round');
  const cap = SRC.match(/const ROUND_TIMEOUT_MS = (\d+);/);
  assert.ok(cap, 'ROUND_TIMEOUT_MS is declared');
  assert.ok(Number(cap[1]) <= 120000, `per-round cap ${cap[1]} must not exceed 120000`);
  assert.doesNotMatch(SRC, /timeout: 300000/, 'the old cumulative 300000 ms cap is gone');
});

test('ten rounds of C3 against F64 are still run', () => {
  assert.match(SRC, /const ROUNDS = 10;/);
});
