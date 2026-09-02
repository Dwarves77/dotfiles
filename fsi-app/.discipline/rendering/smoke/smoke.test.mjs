// Portable node --test proof for the SM smoke specs' pure parts (Lane GATES-1, 2026-09-02). Runs in
// the no-npm discipline suite (run-test-suite.sh) — imports ONLY guard-assert.mjs and
// smoke-fixtures.mjs, neither of which touches esbuild/playwright (see guard-assert.mjs's header for
// why that split exists). The four spec files themselves (watchlist-team-smoke.mjs etc.) need a real
// Playwright browser and are proven by run-rendering-guard.mjs's own red-then-green run (this lane's
// REPORT), the same posture fixtures.mjs's browser leg already has relative to assertions.test.mjs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertGuardClean } from './guard-assert.mjs';
import {
  watchlistFixtures,
  archiveFixtures,
  listOrderFixtures,
  notificationsFixtures,
} from './smoke-fixtures.mjs';

// ── assertGuardClean ─────────────────────────────────────────────────────────

test('assertGuardClean: clean measurements + texts produce no failures', () => {
  const failures = assertGuardClean('x', {
    measurements: [{ name: 'body', className: '', scrollWidth: 400, clientWidth: 400 }],
    texts: ['A real sentence.', 'Another one.'],
  });
  assert.deepEqual(failures, []);
});

test('assertGuardClean: an overflowing container is reported, prefixed by label', () => {
  const failures = assertGuardClean('mycomp[state]', {
    measurements: [{ name: 'body', className: '', scrollWidth: 500, clientWidth: 400 }],
    texts: [],
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /^mycomp\[state\]: horizontal overflow/);
  assert.match(failures[0], /\+100px/);
});

test('assertGuardClean: a placeholder/header literal in the text set is reported', () => {
  const failures = assertGuardClean('mycomp[state]', {
    measurements: [{ name: 'body', className: '', scrollWidth: 100, clientWidth: 100 }],
    texts: ['Tier estimate'],
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /placeholder literal rendered/);
});

test('assertGuardClean: overflow AND placeholder both fire independently', () => {
  const failures = assertGuardClean('x', {
    measurements: [{ name: 'body', className: '', scrollWidth: 500, clientWidth: 400 }],
    texts: ['Source Name'],
  });
  assert.equal(failures.length, 2);
});

test('assertGuardClean: a leaflet-container overflow is excluded (known false positive, per assertions.mjs)', () => {
  const failures = assertGuardClean('x', {
    measurements: [{ name: 'map', className: 'leaflet-container', scrollWidth: 900, clientWidth: 400 }],
    texts: [],
  });
  assert.deepEqual(failures, []);
});

// ── smoke-fixtures.mjs: every builder returns the three named states, non-degenerately ──────────

const BUILDERS = {
  watchlistFixtures,
  archiveFixtures,
  listOrderFixtures,
  notificationsFixtures,
};

for (const [name, build] of Object.entries(BUILDERS)) {
  test(`${name}: returns exactly the empty / oneRow / extreme keys`, () => {
    const result = build();
    assert.deepEqual(Object.keys(result).sort(), ['empty', 'extreme', 'oneRow']);
  });
}

test('watchlistFixtures: empty has zero items, oneRow has exactly one, extreme has many and is at its own limit', () => {
  const { empty, oneRow, extreme } = watchlistFixtures();
  assert.equal(empty.items.length, 0);
  assert.equal(oneRow.items.length, 1);
  assert.ok(extreme.items.length > 10, 'extreme-data state should carry many rows, not a token few');
  assert.equal(extreme.limit, extreme.items.length, 'extreme fixture should exercise the read-cap honest banner');
});

test('watchlistFixtures: oneRow item is well-formed (the fields WatchlistSurface reads)', () => {
  const { oneRow } = watchlistFixtures();
  const item = oneRow.items[0];
  for (const field of ['id', 'type', 'title', 'source', 'lastChangedAt', 'scope']) {
    assert.ok(field in item, `oneRow fixture item is missing required field "${field}"`);
  }
});

test('archiveFixtures: empty has no rows anywhere, oneRow has exactly one personal row, extreme mixes scopes', () => {
  const { empty, oneRow, extreme } = archiveFixtures();
  assert.equal(empty.archived.length, 0);
  assert.equal(empty.personalState.size, 0);
  assert.equal(oneRow.archived.length, 0);
  assert.equal(oneRow.personalState.size, 1);
  assert.ok(extreme.archived.length > 5, 'extreme-data state should carry many team rows');
  assert.ok(extreme.personalState.size > 5, 'extreme-data state should carry many personal rows');
});

test('listOrderFixtures: empty has zero resources, oneRow has exactly one CRITICAL row, extreme exceeds SHOWN_CAP (5)', () => {
  const { empty, oneRow, extreme } = listOrderFixtures();
  assert.equal(empty.resources.length, 0);
  assert.equal(oneRow.resources.length, 1);
  assert.equal(oneRow.resources[0].priority, 'CRITICAL');
  assert.ok(extreme.resources.length > 5, 'extreme-data state must exceed DashboardTopPriority\'s SHOWN_CAP so the footer/truncation path is exercised');
  assert.ok(extreme.resources.every((r) => r.priority === 'CRITICAL'), 'extreme fixture should stay in one band so the drag test has stable neighbours');
});

test('notificationsFixtures: unread volume escalates empty -> oneRow -> extreme, extreme exceeds the ">99" bell threshold', () => {
  const { empty, oneRow, extreme } = notificationsFixtures();
  assert.equal(empty.unreadCount, 0);
  assert.equal(empty.notifications.length, 0);
  assert.equal(oneRow.unreadCount, 1);
  assert.equal(oneRow.notifications.length, 1);
  assert.ok(extreme.unreadCount > 99, 'extreme fixture must exceed the bell\'s ">99" badge-truncation threshold');
  assert.ok(extreme.notifications.length > 5, 'extreme-data state should carry many notification rows');
});
