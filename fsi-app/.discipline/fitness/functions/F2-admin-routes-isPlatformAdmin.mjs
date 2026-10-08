// F2: Admin API routes must use the isPlatformAdmin authentication gate.
// Source: sprint-followups-discipline § Sweep-discipline rule (OBS-17 + Track B-code
// commit 4c7b546; the canonical sweep that enumerated all 28 admin routes and
// verified per-route gating). Codifies that gating mechanically.
//
// Scope: every fsi-app/src/app/api/admin/**/route.ts (BUILDGATE, 2026-09-02, F34's named
// residual: route.ts may export only route handlers/config, so a route's pure functions now live
// in a sibling `logic.ts`/`.mjs` — see F34's own header. Narrowed from `**/*.ts` to `**/route.ts`
// for exactly this reason: a sibling logic module is not itself a route, has no request to gate,
// and correctly does not reference isPlatformAdmin or x-worker-secret — the auth gate still lives
// in route.ts, which still calls the moved decision function. Scanning logic.ts here would be a
// false positive on every admin route BUILDGATE (or a future lane) splits this way.)
// Check: each route file must contain an isPlatformAdmin reference (call or import) OR call the shared
// admin guard requireAdminRoute (src/lib/api/route-guard.ts, lane L31 2026-09-17): the ONE home of the
// authenticate + rate-limit + isPlatformAdmin sequence the routes used to inline by hand.
//
// Known exceptions: worker-secret-gated routes use the x-worker-secret header, read inside the shared
// workerAuthGuard (src/lib/api/worker-auth.ts), instead.
// These are explicitly allowlisted per the precedent established in Track B-code:
//   - recompute-trust   (admin trust-score and tier recompute action, worker-secret gated; the trust-recompute.yml
//                        workflow that called it was retired 2026-10-07, the runtime is the recompute-trust-scores step)
//   - spot-check/recurring (scheduled spot-check job)
// New worker-secret routes added in the future must update this allowlist.
//
// ROUTES-1 (2026-10-08, register finding AT2-6): both checks read the file with comments stripped. F2 used
// to pass recompute-trust and spot-check/recurring because the literal x-worker-secret sat in a header
// comment while the real guard was never looked for. A worker route now passes only when it CALLS
// workerAuthGuard( in code (every worker route in the tree uses that one idiom), and an admin route only
// when its gate is named in code, never in prose.
//
// Scope: api/admin/**, plus the two routes that carry the admin gate outside that glob (finding AT2-6):
// api/agent/run (requireAdminRoute) and api/coverage/entries (inline isPlatformAdmin). They are listed in
// EXTRA_ADMIN_GATED_ROUTES, the same literal-path mechanism as the worker allowlist.
// (q7-daily-recompute was removed 2026-07-18 (dormant-systems P-7): the route was superseded by the
//  end-of-cycle recompute inside growSourcesFromBrief and had no scheduler.)

import { violation, PASS } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';
import { isOverridden } from '../lib/file-content.mjs';
import { stripComments } from '../../governance/coverage-scan.mjs';

const WORKER_SECRET_ALLOWLIST = new Set([
  'fsi-app/src/app/api/admin/recompute-trust/route.ts',
  'fsi-app/src/app/api/admin/spot-check/recurring/route.ts',
]);

const EXTRA_ADMIN_GATED_ROUTES = [
  'fsi-app/src/app/api/agent/run/route.ts',
  'fsi-app/src/app/api/coverage/entries/route.ts',
];

export const fitnessFunction = {
  id: 'F2',
  name: 'admin-routes-isPlatformAdmin',
  description: 'Every API route under src/app/api/admin/ (and agent/run, coverage/entries) must call isPlatformAdmin or the shared requireAdminRoute guard in code, or be on the worker-secret allowlist and call workerAuthGuard.',
  source: 'sprint-followups-discipline § Sweep-discipline rule (OBS-17 precedent)',

  enumerate() {
    return globFiles(['fsi-app/src/app/api/admin/**/route.ts', ...EXTRA_ADMIN_GATED_ROUTES]);
  },

  check(filepath, content) {
    if (filepath.endsWith('.test.ts')) return PASS;
    // Comments never count as a gate (AT2-6).
    const code = stripComments(content);
    if (WORKER_SECRET_ALLOWLIST.has(filepath)) {
      // Worker-secret-gated; verify it actually CALLS the shared guard that reads x-worker-secret
      if (!/\bworkerAuthGuard\s*\(/.test(code)) {
        return [violation(1, 'Allowlisted as worker-secret-gated but does not call workerAuthGuard( in code (a mention in a comment does not count). Either call the guard (src/lib/api/worker-auth.ts) or remove from worker-secret allowlist.')];
      }
      return PASS;
    }

    // Standard admin route: must contain the gate, inline (isPlatformAdmin) or through the shared guard
    if (/\b(isPlatformAdmin|requireAdminRoute)\b/.test(code)) return PASS;

    // Check for per-line override (rare; should only be used for narrow exceptions)
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (isOverridden(lines[i], 'F2')) return PASS;
    }

    return [violation(
      1,
      'Admin API route does not call isPlatformAdmin or requireAdminRoute. Add the shared guard (src/lib/api/route-guard.ts), OR if this is a worker-secret-gated cron route, add the file path to F2.mjs WORKER_SECRET_ALLOWLIST.',
    )];
  },
};
