// F19: NO SILENT SERVICE→ANON KEY DOWNGRADE. A service-role client factory must be FAIL-CLOSED — a missing
// SUPABASE_SERVICE_ROLE_KEY THROWS (or yields no data), it NEVER falls back to NEXT_PUBLIC_SUPABASE_ANON_KEY.
// The downgrade masks service-role misconfiguration as RLS-limited reads (empty/wrong data downstream): the
// canonical getServiceSupabase was fixed by SF-1 (2026-05-27), then the SAME `SERVICE_ROLE || ANON` pattern
// re-appeared ad-hoc in coverage-gaps.ts (Ruling 2 C1, a live defect computing coverage gaps from anon reads).
// This gate kills the class: any fallback from the service-role key to the anon or publishable key (either order)
// in src or scripts is RED.
// Source: dead-code disposition Ruling 2 C1 (operator 2026-07-12). Maps to invariant RD-15.
//
// Lane GATE-8 (2026-10-08, AUD-AT-4 B2-10 to B2-16): the earlier test was one regex, `SERVICE_ROLE_KEY ... || ...
// ANON_KEY` within 150 characters. The same downgrade written the other honest ways escaped it:
//   - `??` instead of `||`, or a ternary (`cond ? service : anon`) (B2-10, B2-11);
//   - the publishable key name instead of the ANON_KEY token (B2-12);
//   - more than 150 characters between the two names, e.g. a comment or a wrapped argument list (B2-13);
//   - a try/catch downgrade written as two statements assigning the same variable (B2-14);
//   - a script (B2-15).
// The text is read through the one source lexer (comments blanked, strings kept: an env var name is often a
// bracket-string key) and split into STATEMENTS. A statement that names both keys and joins them with a
// fallback operator is a downgrade, whatever the distance; a variable assigned the service key in one statement
// and the anon key in another is a downgrade. A marker inside a string is not an override.

import { violation } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';
import { views, overrideLines, lineOfIndex } from '../lib/code-scan.mjs';

const SERVICE_SRC = '(?:SUPABASE_)?SERVICE_ROLE(?:_KEY)?|serviceRoleKey';
const ANON_SRC = 'ANON_KEY|PUBLISHABLE_KEY|anonKey|publishableKey|sb_publishable';
const SERVICE_RE = new RegExp(`(?<![A-Za-z0-9])(?:${SERVICE_SRC})(?![A-Za-z0-9_]*(?:_URL|_HOST))`);
const ANON_RE = new RegExp(`(?<![A-Za-z0-9])(?:${ANON_SRC})`);
// A fallback operator: ||, ??, a ternary question mark (not optional chaining `?.` or the `??` handled above).
const FALLBACK_RE = /\|\||\?\?|\?(?![.?:])/;
// Kept for callers that import it: the original two-regex shape, still a downgrade.
export const DOWNGRADE_RE = [
  /SUPABASE_SERVICE_ROLE_KEY[\s\S]{0,150}?\|\|[\s\S]{0,150}?ANON_KEY/,
  /ANON_KEY[\s\S]{0,150}?\|\|[\s\S]{0,150}?SUPABASE_SERVICE_ROLE_KEY/,
];

/** [{ start, text }] statements of `text`: split at `;` and at a newline that opens a new declaration or flow
 *  statement, so a file without semicolons is not read as one statement. */
function statements(text) {
  const out = [];
  const cut = /;|\n(?=\s*(?:const|let|var|export|import|function|async\s+function|class|return|if|else|for|while|try|catch|switch|throw)\b)/g;
  let from = 0;
  let m;
  while ((m = cut.exec(text))) {
    out.push({ start: from, text: text.slice(from, m.index) });
    from = m.index + 1;
  }
  out.push({ start: from, text: text.slice(from) });
  return out;
}

/** 1-based lines of every service→anon downgrade in `content` (comments excluded, overrides applied). */
export function findServiceAnonDowngrades(content) {
  const { text } = views(content);
  const overridden = overrideLines(content, 'F19');
  const lines = new Set();
  const stmts = statements(text);

  // (1) one statement names both keys and joins them with a fallback operator
  for (const s of stmts) {
    const sv = SERVICE_RE.exec(s.text);
    const an = ANON_RE.exec(s.text);
    if (sv && an && FALLBACK_RE.test(s.text)) lines.add(lineOfIndex(text, s.start + Math.min(sv.index, an.index)));
  }

  // (2) one variable assigned the service key in one statement and the anon key in another (try/catch downgrade)
  const targets = new Map(); // variable -> { service: Set<statement start>, anon: Set<statement start> }
  for (const s of stmts) {
    const m = /(?:^|[\s({,])(?:(?:const|let|var)\s+)?([A-Za-z_$][\w$]*)\s*=\s*(?!=)([^]*)$/.exec(s.text);
    if (!m) continue;
    const rhs = m[2];
    const rec = targets.get(m[1]) ?? { service: new Set(), anon: new Set() };
    if (SERVICE_RE.test(rhs)) rec.service.add(s.start);
    if (ANON_RE.test(rhs)) rec.anon.add(s.start);
    targets.set(m[1], rec);
  }
  for (const rec of targets.values()) {
    // the two keys reach the same variable from DIFFERENT statements (one statement is the check above)
    const a = [...rec.service];
    const b = [...rec.anon];
    const crossed = a.some((x) => b.some((y) => x !== y));
    if (crossed) lines.add(lineOfIndex(text, Math.max(...a, ...b)));
  }
  return [...lines].filter((ln) => !overridden.has(ln)).sort((a, b) => a - b);
}

/** 1-indexed line of the first downgrade occurrence, or 0 if none. Operates on whole-file content. */
export function findServiceAnonDowngrade(content) {
  return findServiceAnonDowngrades(content)[0] || 0;
}

export const fitnessFunction = {
  id: 'F19',
  name: 'no-service-anon-downgrade',
  description:
    'A service-role client must be fail-closed: a fallback from `SUPABASE_SERVICE_ROLE_KEY` to the anon or publishable key (||, ??, a ternary, or a second assignment to the same variable) anywhere in src or scripts is RED. The downgrade masks service-role misconfiguration as RLS-limited reads. Route through the canonical getServiceSupabase (src/lib/supabase-service.ts).',
  source: 'dead-code disposition Ruling 2 C1 (2026-07-12); SF-1 fail-closed + the coverage-gaps.ts re-appearance',

  enumerate() {
    return globFiles(['fsi-app/src/**/*.{ts,tsx,mjs,js,cjs,jsx}', 'fsi-app/scripts/**/*.{mjs,js,cjs,ts}']).filter(
      (p) => !p.includes('/__tests__/') && !/\.(test|selftest|npmtest)\.(ts|tsx|mjs|js|cjs)$/.test(p)
    );
  },

  check(filepath, content) {
    return findServiceAnonDowngrades(content).map((line) => violation(
      line,
      `Silent servicetoanon key downgrade (SUPABASE_SERVICE_ROLE_KEY falling back to the anon or publishable key). A service-role client must be FAIL-CLOSED, route through getServiceSupabase() (src/lib/supabase-service.ts), which throws on a missing service key rather than downgrading to anon (which computes from RLS-limited reads). Override: trailing \`// fitness-allow: F19 (reason)\`. Governing: Ruling 2 C1 / RD-15.`,
    ));
  },
};
