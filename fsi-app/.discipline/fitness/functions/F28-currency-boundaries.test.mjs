// F28 CURRENCY time legs at their exact day boundaries, driven with dated ledger rows (lane TESTS-1, 2026-10-09;
// AUD-AT-4 line 460: "F28 time-based legs (STALE RUN, NEVER RUN windows) were not exercised with dated ledger rows").
// F28-harness-run-integrity.test.mjs already drives STALE RUN and NEVER RUN with dated rows at one age each (49, 110
// and 68 days). This file pins the EDGES, where an off-by-one (`>` against `>=`) hides: day 30 is inside the 30 day
// window and day 31 is out; the same at 90 in build mode; and a registration exactly 30 days old is still a notice.
//
// Run: node --test fsi-app/.discipline/fitness/functions/F28-currency-boundaries.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditFamilyCurrency, CURRENCY_WINDOW_DAYS, CURRENCY_WINDOW_DAYS_BUILD_MODE } from './F28-harness-run-integrity.mjs';

const LIVE = 'sha256:1111111111111111';
const OLD = 'sha256:2222222222222222';
const REF = new Date('2026-10-08T00:00:00Z');
const DAY = 86400000;
const daysAgo = (n) => new Date(REF.getTime() - n * DAY).toISOString();

function stale(ageDays, buildMode) {
  return auditFamilyCurrency({
    family: 'widget', liveHash: LIVE, ledgerPresent: true, registered: '2026-01-01', refDate: REF, buildMode,
    ledgerRows: [{ family: 'widget', started_at: daysAgo(ageDays), governing_hash: OLD }],
  });
}

function neverRun(registeredDaysAgo) {
  return auditFamilyCurrency({
    family: 'widget', liveHash: LIVE, ledgerPresent: true, ledgerRows: [], refDate: REF, buildMode: false,
    registered: daysAgo(registeredDaysAgo).slice(0, 10),
  });
}

test('STALE RUN outside build mode: a newest row exactly 30 days old is a notice, 31 days old fails', () => {
  assert.deepEqual(stale(CURRENCY_WINDOW_DAYS, false).problems, []);
  assert.equal(stale(CURRENCY_WINDOW_DAYS, false).notices.length, 1);
  const out = stale(CURRENCY_WINDOW_DAYS + 1, false);
  assert.equal(out.problems.length, 1);
  assert.match(out.problems[0], /STALE RUN/);
  assert.match(out.problems[0], /31 days old/);
});

test('STALE RUN in build mode: exactly 90 days is a notice, 91 days fails, and 31 days is not yet a failure', () => {
  assert.deepEqual(stale(31, true).problems, []);
  assert.deepEqual(stale(CURRENCY_WINDOW_DAYS_BUILD_MODE, true).problems, []);
  const out = stale(CURRENCY_WINDOW_DAYS_BUILD_MODE + 1, true);
  assert.equal(out.problems.length, 1);
  assert.match(out.problems[0], /91 days old/);
});

test('NEVER RUN outside build mode: a family registered exactly 30 days ago is a notice, 31 days ago fails', () => {
  const on = neverRun(30);
  assert.deepEqual(on.problems, []);
  assert.match(on.notices[0], /30 day\(s\) ago/);
  const past = neverRun(31);
  assert.equal(past.problems.length, 1);
  assert.match(past.problems[0], /NEVER RUN/);
  assert.match(past.problems[0], /31 days past its registration/);
});

test('a row at the live hash clears the family at any age, even one that is far past both windows', () => {
  const r = auditFamilyCurrency({
    family: 'widget', liveHash: LIVE, ledgerPresent: true, registered: '2020-01-01', refDate: REF, buildMode: false,
    ledgerRows: [{ family: 'widget', started_at: daysAgo(400), governing_hash: LIVE }],
  });
  assert.equal(r.status, 'current');
  assert.deepEqual(r.problems, []);
});
