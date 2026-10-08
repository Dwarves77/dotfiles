// Fire-tests for rule 018 (no surface outside the five-surface model).
// Run: node --test fsi-app/.discipline/rules/018-new-surface-five-model.test.mjs
//
// Lane GATE-1 (2026-10-08): the rule fires only on an ADDED page.tsx (diff status A), never on a
// modification, so editing an existing page does not demand a surface decision. The register measured the
// edit case as the rule's false positive (2026-09-07: /settings, /watchlist, /privacy edits). A RENAME into
// a new top-level route creates a route and is treated as an add.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rule } from './018-new-surface-five-model.mjs';
import { buildContextFromFixture } from '../lib/context.mjs';

const PAGE = 'export default function Page(){return null;}\n';

function pageCtx(path, status, extra = {}) {
  return buildContextFromFixture({
    message: 'feat: page',
    files: [{ path, status, additions: 20, deletions: status === 'A' ? 0 : 3 }],
    changes: [{ path, status, added: ['export default function Page(){return null;}'], ...extra }],
    fileContents: { [path]: PAGE },
  });
}

test('018 check: FAIL, a NEW sixth customer surface (the Technology-page catch)', () => {
  const ctx = pageCtx('fsi-app/src/app/technology/page.tsx', 'A');
  assert.equal(rule.trigger(ctx), true);
  const r = rule.check(ctx);
  assert.equal(r.status, 'FAIL');
  assert.ok(r.message.includes('/technology'));
  assert.deepEqual(r.locations, [{ path: 'fsi-app/src/app/technology/page.tsx', line: 1 }]);
});

test('018 check: PASS, one of the five surfaces, new or edited', () => {
  assert.equal(rule.check(pageCtx('fsi-app/src/app/market/page.tsx', 'A')).status, 'PASS');
  assert.equal(rule.check(pageCtx('fsi-app/src/app/market/page.tsx', 'M')).status, 'PASS');
});

test('018 scope: an EDIT to an existing page outside the allowlist neither triggers nor fails', () => {
  const ctx = pageCtx('fsi-app/src/app/coverage/page.tsx', 'M');
  assert.equal(rule.trigger(ctx), false);
  assert.equal(rule.check(ctx).status, 'PASS');
});

test('018 scope: the 2026-09-07 episode, edits to /settings, /watchlist, /privacy, passes', () => {
  for (const seg of ['settings', 'watchlist', 'privacy']) {
    const ctx = pageCtx(`fsi-app/src/app/${seg}/page.tsx`, 'M');
    assert.equal(rule.trigger(ctx), false, seg);
  }
});

test('018 scope: a NEW route fails even for a path an old edit would have passed through', () => {
  const ctx = pageCtx('fsi-app/src/app/search/page.tsx', 'A');
  assert.equal(rule.check(ctx).status, 'FAIL');
});

test('018 scope: a RENAME into a new top-level route is a new route and fails; a rename inside a route does not', () => {
  const into = buildContextFromFixture({
    message: 'refactor: move',
    files: [{ path: 'fsi-app/src/app/technology/page.tsx', status: 'R' }],
    changes: [{ path: 'fsi-app/src/app/technology/page.tsx', oldPath: 'fsi-app/src/app/market/page.tsx', status: 'R' }],
    fileContents: { 'fsi-app/src/app/technology/page.tsx': PAGE },
  });
  assert.equal(rule.check(into).status, 'FAIL');
  const inside = buildContextFromFixture({
    message: 'refactor: move',
    files: [{ path: 'fsi-app/src/app/market/new/page.tsx', status: 'R' }],
    changes: [{ path: 'fsi-app/src/app/market/new/page.tsx', oldPath: 'fsi-app/src/app/market/old/page.tsx', status: 'R' }],
    fileContents: { 'fsi-app/src/app/market/new/page.tsx': PAGE },
  });
  assert.equal(rule.check(inside).status, 'PASS');
});

test('018 check: the Surface-Decision-Override trailer is gone, it no longer excuses a new route', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: technology\n\nSurface-Decision-Override: Jason authorized 6th surface 2026-06-06',
    files: [{ path: 'fsi-app/src/app/technology/page.tsx', status: 'A', additions: 20, deletions: 0 }],
    changes: [{ path: 'fsi-app/src/app/technology/page.tsx', status: 'A', added: ['export default function Page(){return null;}'] }],
    fileContents: { 'fsi-app/src/app/technology/page.tsx': PAGE },
  });
  const r = rule.check(ctx);
  assert.equal(r.status, 'FAIL');
  assert.ok(!r.remediation.includes('Surface-Decision-Override'), 'the hook message must not offer a trailer that is not honoured');
  assert.ok(r.remediation.includes('allowlist'), 'the message names the one way to authorize a surface');
});

test('018 check: PASS, a removed page.tsx is not a new surface', () => {
  const ctx = buildContextFromFixture({
    message: 'chore: remove dead /events stub',
    files: [{ path: 'fsi-app/src/app/events/page.tsx', status: 'D', additions: 0, deletions: 14 }],
    changes: [{ path: 'fsi-app/src/app/events/page.tsx', status: 'D', removed: ['export default function Page(){return null;}'] }],
  });
  assert.equal(rule.trigger(ctx), false);
  assert.equal(rule.check(ctx).status, 'PASS');
});

test('018 check: PASS, route groups and the root page are not segments', () => {
  assert.equal(rule.check(pageCtx('fsi-app/src/app/page.tsx', 'A')).status, 'PASS');
  assert.equal(rule.check(pageCtx('fsi-app/src/app/(app)/regulations/page.tsx', 'A')).status, 'PASS');
});

test('018 check: PASS, a /dashboard sub-route is a workspace view under the Dashboard, not a surface (ruling 2026-10-07)', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: portfolio pages under the dashboard',
    files: [
      { path: 'fsi-app/src/app/dashboard/portfolio/page.tsx', additions: 20, deletions: 0 },
      { path: 'fsi-app/src/app/dashboard/portfolio/[id]/page.tsx', additions: 20, deletions: 0 },
    ],
    fileContents: {
      'fsi-app/src/app/dashboard/portfolio/page.tsx': 'export default function Page(){return null;}\n',
      'fsi-app/src/app/dashboard/portfolio/[id]/page.tsx': 'export default function Page(){return null;}\n',
    },
  });
  assert.equal(rule.check(ctx).status, 'PASS');
});

test('018 check: FAIL, allowing /dashboard did not open the door: a new top-level segment beside it still fails', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: a portfolio surface of its own',
    files: [{ path: 'fsi-app/src/app/portfolio/page.tsx', status: 'A', additions: 20, deletions: 0 }],
    fileContents: { 'fsi-app/src/app/portfolio/page.tsx': 'export default function Page(){return null;}\n' },
  });
  const r = rule.check(ctx);
  assert.equal(r.status, 'FAIL');
  assert.ok(r.message.includes('/portfolio'));
});

test('018: metadata', () => { assert.equal(rule.id, '018'); });

// ---------------------------------------------------------------------------
// GATE-7 (2026-10-08): honest forms from the AUD-AT-3 attack register.
// ---------------------------------------------------------------------------

test('018 GATE-7 A018-1 / A018-1b: page.jsx, page.ts and page.js are pages', () => {
  for (const f of ['page.jsx', 'page.ts', 'page.js']) {
    const ctx = pageCtx(`fsi-app/src/app/technology/${f}`, 'A');
    assert.equal(rule.trigger(ctx), true, f);
    assert.equal(rule.check(ctx).status, 'FAIL', f);
  }
});

test('018 GATE-7 A018-2: a route handler outside /api is a URL surface; an API handler and an allowed segment are not', () => {
  assert.equal(rule.check(pageCtx('fsi-app/src/app/technology/route.ts', 'A')).status, 'FAIL');
  assert.equal(rule.check(pageCtx('fsi-app/src/app/api/technology/route.ts', 'A')).status, 'PASS');
  assert.equal(rule.check(pageCtx('fsi-app/src/app/auth/callback/route.ts', 'A')).status, 'PASS');
  assert.equal(rule.trigger(pageCtx('fsi-app/src/app/api/technology/route.ts', 'A')), false);
});

test('018 GATE-7 A018-6: a file under the pages router is a page whose first path part is its segment', () => {
  assert.equal(rule.check(pageCtx('fsi-app/src/pages/technology.tsx', 'A')).status, 'FAIL');
  assert.equal(rule.check(pageCtx('fsi-app/src/pages/technology/index.tsx', 'A')).status, 'FAIL');
  assert.equal(rule.check(pageCtx('fsi-app/src/pages/market.tsx', 'A')).status, 'PASS');
  assert.equal(rule.trigger(pageCtx('fsi-app/src/pages/api/x.ts', 'A')), false);
  assert.equal(rule.trigger(pageCtx('fsi-app/src/pages/_app.tsx', 'A')), false);
});
