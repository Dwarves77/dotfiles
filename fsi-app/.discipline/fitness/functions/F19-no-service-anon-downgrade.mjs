// F19: NO SILENT SERVICE→ANON KEY DOWNGRADE. A service-role client factory must be FAIL-CLOSED — a missing
// SUPABASE_SERVICE_ROLE_KEY THROWS (or yields no data), it NEVER falls back to NEXT_PUBLIC_SUPABASE_ANON_KEY.
// The downgrade masks service-role misconfiguration as RLS-limited reads (empty/wrong data downstream): the
// canonical getServiceSupabase was fixed by SF-1 (2026-05-27), then the SAME `SERVICE_ROLE || ANON` pattern
// re-appeared ad-hoc in coverage-gaps.ts (Ruling 2 C1, a live defect computing coverage gaps from anon reads).
// This gate kills the class: any `SUPABASE_SERVICE_ROLE_KEY || … ANON_KEY` (either order) in src is RED.
// Source: dead-code disposition Ruling 2 C1 (operator 2026-07-12). Maps to invariant RD-15.

import { violation } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';
import { isOverridden } from '../lib/file-content.mjs';

// The downgrade shape, either order, tolerant of the line break the pattern is usually written across.
export const DOWNGRADE_RE = [
  /SUPABASE_SERVICE_ROLE_KEY[\s\S]{0,150}?\|\|[\s\S]{0,150}?ANON_KEY/,
  /ANON_KEY[\s\S]{0,150}?\|\|[\s\S]{0,150}?SUPABASE_SERVICE_ROLE_KEY/,
];

/** 1-indexed line of the first downgrade occurrence, or 0 if none. Operates on whole-file content. */
export function findServiceAnonDowngrade(content) {
  for (const re of DOWNGRADE_RE) {
    const m = re.exec(content);
    if (m) {
      // report the line where the match begins
      return content.slice(0, m.index).split(/\r?\n/).length;
    }
  }
  return 0;
}

export const fitnessFunction = {
  id: 'F19',
  name: 'no-service-anon-downgrade',
  description:
    'A service-role client must be fail-closed: `SUPABASE_SERVICE_ROLE_KEY || …ANON_KEY` (silent downgrade to the anon key) anywhere in src is RED. The downgrade masks service-role misconfiguration as RLS-limited reads. Route through the canonical getServiceSupabase (src/lib/supabase-service.ts).',
  source: 'dead-code disposition Ruling 2 C1 (2026-07-12); SF-1 fail-closed + the coverage-gaps.ts re-appearance',

  enumerate() {
    return globFiles(['fsi-app/src/**/*.{ts,tsx,mjs}']).filter(
      (p) => !p.includes('/__tests__/') && !/\.(test|selftest|npmtest)\.(ts|tsx|mjs)$/.test(p)
    );
  },

  check(filepath, content) {
    const line = findServiceAnonDowngrade(content);
    if (!line) return [];
    // allow a deliberate, reviewed exception with a trailing override on the matched line
    const matchedLine = content.split(/\r?\n/)[line - 1] || '';
    if (isOverridden(matchedLine, 'F19')) return [];
    return [violation(
      line,
      `Silent service→anon key downgrade (SUPABASE_SERVICE_ROLE_KEY || …ANON_KEY). A service-role client must be FAIL-CLOSED — route through getServiceSupabase() (src/lib/supabase-service.ts), which throws on a missing service key rather than downgrading to anon (which computes from RLS-limited reads). Override: trailing \`// fitness-allow: F19 (reason)\`. Governing: Ruling 2 C1 / RD-15.`,
    )];
  },
};
