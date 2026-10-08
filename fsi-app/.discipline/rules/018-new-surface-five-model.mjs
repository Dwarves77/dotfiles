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
//
// HONEST FORMS (lane GATE-7, 2026-10-08, attacks A018-1, A018-1b, A018-2, A018-6 of the AUD-AT-3 register):
// a route file is a page in any of its extensions (page.tsx, page.jsx, page.ts, page.js), a route.ts or
// route.js outside /api is a URL surface too (a handler can serve HTML), and a file under the pages router
// (src/pages/) is a page whose top segment is its first path part. Nested routes below an allowed segment
// (A018-3) are sub-views of that segment, not surfaces: telling a sixth surface from a sub-view needs the
// operator's list of second-level routes, which does not exist, so the rule stays at the top segment.
const ROUTE_FILE_RE = /^fsi-app\/src\/app\/(?:(.*)\/)?(page|route)\.(?:tsx|jsx|ts|js)$/;
const PAGES_ROUTER_RE = /^fsi-app\/src\/pages\/(.+)\.(?:tsx|jsx|ts|js)$/;
function topSegment(path) {
  const n = norm(path);
  const pages = n.match(PAGES_ROUTER_RE);
  if (pages) {
    const parts = pages[1].split('/').filter(Boolean);
    if (parts[0] === 'api' || /^_/.test(parts[0])) return null; // api handlers and _app/_document/_error
    return parts[0] === 'index' ? '' : parts[0];
  }
  const m = n.match(ROUTE_FILE_RE);
  if (!m) return null;
  const segs = (m[1] || '').split('/').filter((s) => s && !/^\(.*\)$/.test(s)); // drop route groups
  if (m[2] === 'route' && segs[0] === 'api') return null; // API handlers are not surfaces
  return segs.length ? segs[0] : '';
}

// A route file the commit CREATES a route with: an added file, or a rename out of a different top-level
// route (a `git mv` of an allowed page into an unlisted route is a new route, not an edit). A deleted or
// edited page is never a new surface. ctx.stagedFiles[].status and .oldPath come from the diff itself.
function relevant(ctx) {
  return ctx.stagedFiles.filter((f) => {
    if (topSegment(f.path) === null) return false;
    if (f.status === 'A') return true;
    return f.status === 'R' && topSegment(f.oldPath) !== topSegment(f.path);
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
