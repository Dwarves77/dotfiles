// Rule 018: No customer surface outside the binding five-surface model.
// Governing skill: caros-ledge-platform-intent (S). Content/state-verifiable: a staged
// src/app/<seg>/.../page.tsx whose top route segment is NOT one of the five customer surfaces
// (or a sanctioned cross-cutting/infra route) FAILS. This is the Technology-page catch — encoded
// as an allowlist of the actual model, so "add a sixth surface" trips mechanically, not on judgment.
//
// Trigger: an ADDED page.tsx under fsi-app/src/app/ (diff status A), or a rename that moves a page into a
//          different top-level route. An edit to an existing page never triggers: the route predates the
//          rule or was authorized when it was added (lane GATE-1, 2026-10-08; the 2026-09-07 episode
//          failed edits to /settings, /watchlist and /privacy, which are not new surfaces).
// Check:   FAIL if its top route segment is not in ALLOWED_SEGMENTS. There is no override trailer: lane
//          GATE-1 removed Surface-Decision-Override (no validation, whole-commit scope). An operator-
//          authorized surface is authorized by adding its segment to ALLOWED_SEGMENTS below, with the
//          ruling quoted on that line, which is a reviewed, versioned change to the model itself.

import { pass, fail } from '../lib/result.mjs';

// The five customer surfaces + sanctioned cross-cutting capabilities & infra that legitimately
// own a page.tsx (per caros-ledge-platform-intent: Dashboard '/', Map, Intelligence Assistant,
// Onboarding; plus auth/admin/workspace plumbing). NOT customer content surfaces beyond the five.
const ALLOWED_SEGMENTS = new Set([
  '',              // '/' dashboard (src/app/page.tsx)
  'regulations', 'market', 'research', 'operations', 'community', // the five
  'map',           // geographic view of Regulations
  'admin',         // internal, role-gated (not a customer content surface)
  'onboarding', 'signup', 'login', 'profile', 'invitations', 'workspace', 'auth', // plumbing
  'settings', // pre-existing account plumbing (PR #15, b02a415b), same class as profile, not a customer content surface
  'watchlist', // operator ruling 2026-09-07: authorized surface (Brief group, in the nav, predates the rule, one of the five list surfaces in the 390 spec)
  'privacy', // operator ruling 2026-09-07: plumbing (LinkedIn API submission page)
  'dashboard', // coordinator ruling 2026-10-07 (lane S8-D): routes under /dashboard are workspace views under the Dashboard (for example /dashboard/portfolio), never customer surfaces; PI-1 is unchanged, a new top-level segment still fails
]);

function norm(p) { return (p || '').replaceAll('\\', '/'); }

// Extract the top route segment from a src/app path. Route groups "(group)" and the app root
// don't count as segments. fsi-app/src/app/page.tsx → ''; fsi-app/src/app/market/page.tsx → 'market';
// fsi-app/src/app/(marketing)/foo/page.tsx → 'foo'.
function topSegment(path) {
  const n = norm(path);
  const m = n.match(/fsi-app\/src\/app\/(.*)\/page\.tsx$/) || n.match(/fsi-app\/src\/app\/(page\.tsx)$/);
  if (!m) return null;
  if (m[1] === 'page.tsx') return '';
  const segs = m[1].split('/').filter((s) => s && !/^\(.*\)$/.test(s)); // drop route groups
  return segs.length ? segs[0] : '';
}

// A page.tsx the commit CREATES a route with: an added file, or a rename out of a different top-level
// route (a `git mv` of an allowed page into an unlisted route is a new route, not an edit). A deleted or
// edited page is never a new surface. ctx.stagedFiles[].status and .oldPath come from the diff itself.
function relevant(ctx) {
  return ctx.stagedFiles.filter((f) => {
    const n = norm(f.path);
    if (!(n.startsWith('fsi-app/src/app/') && n.endsWith('/page.tsx')) && n !== 'fsi-app/src/app/page.tsx') return false;
    if (f.status === 'A') return true;
    return f.status === 'R' && topSegment(f.oldPath) !== topSegment(n);
  });
}

export const rule = {
  id: '018',
  name: 'No surface outside the five-surface model',
  description: 'A NEW customer page.tsx (added, or renamed into a different top-level route) whose route is not one of the five surfaces (Regulations, Market, Research, Operations, Community) or a sanctioned cross-cutting/infra route is an unauthorized surface. Edits to existing pages are not checked.',
  ruleSource: 'governance/skill-map → caros-ledge-platform-intent (binding five-surface model)',

  trigger(ctx) {
    if (ctx.isMergeCommit || ctx.isRevertCommit) return false;
    return relevant(ctx).length > 0;
  },

  check(ctx) {
    const violations = [];
    for (const f of relevant(ctx)) {
      const seg = topSegment(f.path);
      if (seg === null) continue;
      if (!ALLOWED_SEGMENTS.has(seg)) violations.push({ path: norm(f.path), seg });
    }
    if (violations.length === 0) return pass();

    return fail({
      locations: violations.map((v) => ({ path: v.path, line: 1 })),
      message: `Customer surface(s) outside the five-surface model: ${violations.map((v) => '/' + v.seg).join(', ')}.`,
      remediation: [
        'caros-ledge-platform-intent binds FIVE customer surfaces: Regulations, Market, Research, Operations, Community.',
        'A new top-level customer route is a surface decision the operator must authorize. It is NOT a build continuation (this is the Technology-page failure).',
        'Surfaces flagged:',
        ...violations.map((v) => `    ${v.path}  (route /${v.seg})`),
        'If the operator has authorized this surface: add its segment to ALLOWED_SEGMENTS in rules/018-new-surface-five-model.mjs, quoting the ruling on that line (the allowlist is the one place a surface is authorized).',
        'Otherwise: re-home the content to one of the five surfaces by substance (cross-pollination).',
        'Bypass (sparingly): git commit --no-verify',
      ].join('\n  '),
    });
  },
};
