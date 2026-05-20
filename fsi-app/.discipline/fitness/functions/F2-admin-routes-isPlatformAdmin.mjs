// F2: Admin API routes must use the isPlatformAdmin authentication gate.
// Source: sprint-followups-discipline § Sweep-discipline rule (OBS-17 + Track B-code
// commit 4c7b546; the canonical sweep that enumerated all 28 admin routes and
// verified per-route gating). Codifies that gating mechanically.
//
// Scope: every file matching fsi-app/src/app/api/admin/**/*.ts
// Check: each route file must contain isPlatformAdmin reference (call or import).
//
// Known exceptions: worker-secret-gated routes use x-worker-secret header instead.
// These are explicitly allowlisted per the precedent established in Track B-code:
//   - recompute-trust   (Q7 daily cron + manual admin re-trigger)
//   - q7-daily-recompute (Q7 daily cron)
//   - spot-check/recurring (scheduled spot-check job)
// New worker-secret routes added in the future must update this allowlist.

import { violation, PASS } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';
import { isOverridden } from '../lib/file-content.mjs';

const WORKER_SECRET_ALLOWLIST = new Set([
  'fsi-app/src/app/api/admin/recompute-trust/route.ts',
  'fsi-app/src/app/api/admin/q7-daily-recompute/route.ts',
  'fsi-app/src/app/api/admin/spot-check/recurring/route.ts',
]);

export const fitnessFunction = {
  id: 'F2',
  name: 'admin-routes-isPlatformAdmin',
  description: 'Every API route under src/app/api/admin/ must call isPlatformAdmin (or be on the worker-secret allowlist).',
  source: 'sprint-followups-discipline § Sweep-discipline rule (OBS-17 precedent)',

  enumerate() {
    return globFiles(['fsi-app/src/app/api/admin/**/*.ts']);
  },

  check(filepath, content) {
    if (filepath.endsWith('.test.ts')) return PASS;
    if (WORKER_SECRET_ALLOWLIST.has(filepath)) {
      // Worker-secret-gated; verify it actually has the header check
      if (!/x-worker-secret/i.test(content)) {
        return [violation(1, 'Allowlisted as worker-secret-gated but does not reference x-worker-secret header. Either add the header check or remove from worker-secret allowlist.')];
      }
      return PASS;
    }

    // Standard admin route: must contain isPlatformAdmin reference
    if (/\bisPlatformAdmin\b/.test(content)) return PASS;

    // Check for per-line override (rare; should only be used for narrow exceptions)
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (isOverridden(lines[i], 'F2')) return PASS;
    }

    return [violation(
      1,
      'Admin API route does not call isPlatformAdmin. Add the gate, OR if this is a worker-secret-gated cron route, add the file path to F2.mjs WORKER_SECRET_ALLOWLIST.',
    )];
  },
};
