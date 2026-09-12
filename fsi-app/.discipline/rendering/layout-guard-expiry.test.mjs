// THE LAYOUT-GUARD BASELINE'S EXPIRY, PROVEN BY ATTACK IN BOTH DIRECTIONS. Lane OPS72CH, 2026-09-09.
//
// WHY THIS FILE EXISTS AND WAS NOT A BLOCK INSIDE `layout-guard/layout-guard.test.mjs`, AT THE TIME.
// That file was matched by NO glob in `.discipline/run-test-suite.sh`: the suite globbed
// `.discipline/rendering/*.test.mjs` and the three directories under it that carried tests, and
// `rendering/layout-guard/` was not one of them. [CONFIRMED 2026-09-09: the suite ran 6025 tests, 0
// fail, while `node --test .discipline/rendering/layout-guard/layout-guard.test.mjs` on the SAME
// tree, and on the train branch before this lane touched it, reports two failures.] Putting a new
// proof there would have made it exactly what CLAUDE.md rule 15 forbids: git-tracked, cited as
// enforcement, and run by nothing. This file sat one directory up instead, where the suite's
// existing glob picked it up by construction. The gap in the layout-guard directory's own wiring was
// reported to the coordinator rather than fixed at the time, because the two red tests read
// `allowlists.mjs`, which was another lane's write set.
//
// RESOLVED (coordinator review, 2026-09-11, task 0.1 follow-up round 3). `run-test-suite.sh` now
// carries a `fsi-app/.discipline/rendering/layout-guard/*.test.mjs` glob (proven portable by
// `glob-portability.test.mjs`), so `layout-guard.test.mjs` is wired and runs 43/43 in the same job
// this file runs in - the two allowlist tests were corrected against `allowlists.mjs` directly
// (round 2) rather than deferred again. The paragraph above is kept as the historical record of why
// this file exists at all (it still proves the baseline expiry, a genuinely separate concern from
// layout-guard.test.mjs's own content); it no longer describes a live gap.
//
// WHAT IT PROVES. Operator ruling 2026-09-09: "extend the layout-guard baseline to 2026-10-15. Land
// as wave65." The mechanism before this lane expired the baseline when `latestTrainWave()` reached
// wave 65, so THIS train would have expired it on the commit that carried his extension. The wave
// threshold is removed and the expiry is his date, read from the clock.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { applyBaseline, isExpired, today, BASELINE_EXPIRY_DATE } from './layout-guard/baseline.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));

// A REAL baselined finding, rebuilt from the first key in baseline.json, so this exercises the file
// the guard actually loads rather than a hand-made set the split would never see.
const [kRule, kRoute, kWidth, kElement] = JSON.parse(
  readFileSync(fileURLToPath(new URL('./layout-guard/baseline.json', import.meta.url)), 'utf8'),
).keys[0].split('|');
const known = { rule: kRule, route: kRoute, width: Number(kWidth), element: kElement, measured: 'm', message: 'm' };
const fresh = { rule: kRule, route: kRoute, width: Number(kWidth), element: 'section[a card added today]', measured: 'm', message: 'm' };
const split = (date) => applyBaseline([known, fresh], { date });

test('the expiry is the DATE the operator named', () => {
  assert.equal(BASELINE_EXPIRY_DATE, '2026-10-15', 'operator ruling 2026-09-09, quoted at the constant');
  assert.equal(isExpired('2026-10-14'), false);
  assert.equal(isExpired('2026-10-15'), true, 'it expires ON the date, not after it');
  assert.equal(isExpired('2026-12-01'), true);
  assert.match(today(), /^\d{4}-\d{2}-\d{2}$/, 'the clock reading is in the same form the constant is written in');
});

test('ATTACK, clock before the date: the baseline still covers its entries and new findings still block', () => {
  const before = split('2026-10-14');
  assert.equal(before.expired, false);
  assert.ok(before.blocking.some((f) => f.element === 'section[a card added today]'),
    'a finding outside the baseline must fail the build, which is what "no train lands with a failure" means');
  assert.ok(!before.blocking.some((f) => f.element === 'section[x]'),
    'and a finding inside it must not, or the operator\'s extension does nothing');
});

test('ATTACK, clock past the date: the baseline excuses nothing', () => {
  for (const date of ['2026-10-15', '2026-12-01', '2027-01-01']) {
    const after = split(date);
    assert.equal(after.expired, true, `${date} must be past the expiry`);
    assert.equal(after.baselined.length, 0, `${date}: the baseline must excuse nothing`);
    assert.equal(after.blocking.length, 2, `${date}: every finding must block`);
  }
});

test('the wave threshold is REMOVED, not raised, so landing as wave 65 cannot expire the baseline', () => {
  const src = readFileSync(join(HERE, 'layout-guard/baseline.mjs'), 'utf8');
  assert.ok(!/EXPIRY_WAVE/.test(src), 'a wave threshold is the trap this ruling removes: this train lands as wave 65');
  assert.ok(!/latestTrainWave/.test(src), 'the wave oracle must be gone from the module, not merely unused');
  assert.match(src, /2026-10-15/, 'the operator\'s date is the expiry');
  assert.match(src, /Operator ruling, 2026-09-09/, 'the ruling is dated and attributed at the constant');
});

test('the baseline FILE and the module name the same expiry, and the file still carries its 792 entries', () => {
  const b = JSON.parse(readFileSync(join(HERE, 'layout-guard/baseline.json'), 'utf8'));
  assert.equal(b.expiryDate, BASELINE_EXPIRY_DATE, 'the file and the module must name the same date');
  assert.equal(b.expiryWave, undefined, 'the wave field is gone from the file too');
  assert.equal(b.keys.length, b.count, 'the key list and the count must agree');
  // The baseline may only SHRINK (baseline.mjs header). This lane changed the expiry mechanism and
  // nothing about the findings, so the count is the one it landed with on 2026-09-08.
  assert.equal(b.count, 792, 'this lane touched no finding: clearing them is scheduled after the UI round');
});
