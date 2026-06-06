// Rule 018: No customer surface outside the binding five-surface model.
// Governing skill: caros-ledge-platform-intent (S). Content/state-verifiable: a staged
// src/app/<seg>/.../page.tsx whose top route segment is NOT one of the five customer surfaces
// (or a sanctioned cross-cutting/infra route) FAILS. This is the Technology-page catch — encoded
// as an allowlist of the actual model, so "add a sixth surface" trips mechanically, not on judgment.
//
// Trigger: a staged page.tsx under fsi-app/src/app/.
// Check:   FAIL if its top route segment ∉ ALLOWED. Override: Surface-Decision-Override: trailer
//          (an operator-authorized surface change — the decision is the user's, per the model).

import { pass, fail } from '../lib/result.mjs';
import { commitMessageLines } from '../lib/predicates.mjs';

// The five customer surfaces + sanctioned cross-cutting capabilities & infra that legitimately
// own a page.tsx (per caros-ledge-platform-intent: Dashboard '/', Map, Intelligence Assistant,
// Onboarding; plus auth/admin/workspace plumbing). NOT customer content surfaces beyond the five.
const ALLOWED_SEGMENTS = new Set([
  '',              // '/' dashboard (src/app/page.tsx)
  'regulations', 'market', 'research', 'operations', 'community', // the five
  'map',           // geographic view of Regulations
  'admin',         // internal, role-gated (not a customer content surface)
  'onboarding', 'signup', 'login', 'profile', 'invitations', 'workspace', 'auth', // plumbing
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

function relevant(ctx) {
  return ctx.stagedFiles.filter((f) => {
    const n = norm(f.path);
    return f.status !== 'D' && n.startsWith('fsi-app/src/app/') && n.endsWith('/page.tsx') || n === 'fsi-app/src/app/page.tsx';
  }).filter((f) => f.status !== 'D');
}

export const rule = {
  id: '018',
  name: 'No surface outside the five-surface model',
  description: 'A new/edited customer page.tsx whose route is not one of the five surfaces (Regulations, Market, Research, Operations, Community) or a sanctioned cross-cutting/infra route is an unauthorized surface.',
  ruleSource: 'governance/skill-map → caros-ledge-platform-intent (binding five-surface model)',

  trigger(ctx) {
    if (ctx.isMergeCommit || ctx.isRevertCommit) return false;
    return relevant(ctx).length > 0;
  },

  check(ctx) {
    const overridden = commitMessageLines(ctx, 'Surface-Decision-Override:').length > 0;
    const violations = [];
    for (const f of relevant(ctx)) {
      const seg = topSegment(f.path);
      if (seg === null) continue;
      if (!ALLOWED_SEGMENTS.has(seg)) violations.push({ path: norm(f.path), seg });
    }
    if (violations.length === 0) return pass();
    if (overridden) return pass();

    return fail({
      message: `Customer surface(s) outside the five-surface model: ${violations.map((v) => '/' + v.seg).join(', ')}.`,
      remediation: [
        'caros-ledge-platform-intent binds FIVE customer surfaces: Regulations, Market, Research, Operations, Community.',
        'A new top-level customer route is a surface decision the operator must authorize — it is NOT a build continuation (this is the Technology-page failure).',
        'Surfaces flagged:',
        ...violations.map((v) => `    ${v.path}  (route /${v.seg})`),
        'If the operator has authorized this surface: add a trailer  Surface-Decision-Override: <operator + rationale>',
        'Otherwise: re-home the content to one of the five surfaces by substance (cross-pollination).',
        'Bypass (sparingly): git commit --no-verify',
      ].join('\n  '),
    });
  },
};
