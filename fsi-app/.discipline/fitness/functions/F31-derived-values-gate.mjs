// F31: DERIVED VALUES GATE. Lane DP-ENGINE, system-completion train, 2026-09-02. Spec 08 §3.3's second
// enforcement point, made structural: "One gate function. Every consumer calls it; nothing reads
// derived_values directly." Migration 285 already denies raw-table SELECT via RLS (no policy on
// derived_values for authenticated/anon, GRANT SELECT only on derived_values_admissible — that migration's
// own RLS-section comment). This function is the SECOND, code-level backstop the spec names: a service-
// role client (which bypasses RLS entirely) reading `derived_values` directly would slip straight past the
// DB-layer gate and see stale/falsified/obsolete rows with no admissibleFor() check applied — exactly the
// pollution the gate function (src/lib/propagation/admissible-for.ts) exists to prevent.
//
// WHAT IT CATCHES: a literal `.from("derived_values")` (any quote style) OUTSIDE
// src/lib/propagation/ — anywhere in fsi-app/src or fsi-app/scripts. `derived_values_admissible` (the
// view) does NOT match this pattern (the closing quote must follow "derived_values" immediately, so
// "derived_values_admissible" is a different string) — reading the view is reading ALREADY-ADMITTED data,
// exactly migration 285's own COMMENT ON VIEW states, and is fine anywhere.
//
// WHY NOT ALSO CATCH RAW SQL. A raw `SELECT ... FROM derived_values` string is a materially different
// bypass shape (no production code in this repo issues raw SQL against Postgres outside a migration file
// itself — migrations are not scanned here, matching F24's own migration-file exemption), and this repo's
// established pattern names one shape per fitness function (F21's own GROUNDING_CALL_RE, F13's mint
// chokepoint) rather than one function trying to catch every conceivable variant. Named here as a residual,
// not silently narrowed.
//
// SCOPE mirrors F21/F15/F16: production path only (src/lib, src/app, src/workflows, scripts) — a
// one-off/scratch script is held at the commit layer (rule 016), not here.

import { violation } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';
import { isOverridden } from '../lib/file-content.mjs';

// The directory F31 exempts. A prefix check, not a fixed file set (F21's SANCTIONED is a closed list
// because a NEW file calling generateBrief directly is exactly what F21 must catch; here the exemption is
// "lives inside the one directory that owns derived_values reads," which grows as DP-SURF and later lanes
// add method modules under this same directory — a per-file allowlist would need editing every time a new,
// entirely legitimate file lands inside the gate's own home).
export const SANCTIONED_DIR_PREFIX = 'fsi-app/src/lib/propagation/';

// `.from("derived_values")` / `.from('derived_values')` / `` .from(`derived_values`) `` — any PostgREST-
// style query-builder call naming the raw table. The closing quote must immediately follow the table name,
// so `derived_values_admissible` (the sanctioned view) never matches.
export const DERIVED_VALUES_FROM_RE = /\.from\(\s*["'`]derived_values["'`]\s*\)/;

export function isSanctioned(filepath) {
  return filepath.startsWith(SANCTIONED_DIR_PREFIX);
}

/** Lines making a forbidden raw `derived_values` read, skipping comments + overrides. @param {string} content */
export function derivedValuesReadLines(content) {
  const out = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue; // comment lines are not reads
    if (isOverridden(lines[i], 'F31')) continue;
    if (DERIVED_VALUES_FROM_RE.test(lines[i])) out.push(i + 1);
  }
  return out;
}

export const fitnessFunction = {
  id: 'F31',
  name: 'derived-values-gate',
  description:
    'Nothing outside src/lib/propagation/ reads the raw derived_values table directly — every consumer ' +
    'reads through derived_values_admissible (RLS-granted, spec §3.3\'s first enforcement point) or calls ' +
    'admissibleFor() (the second). A literal .from("derived_values") outside the propagation directory is ' +
    'the exact pollution-barrier bypass spec §3.3 names: a service-role client (which bypasses RLS) could ' +
    'otherwise see stale/falsified/obsolete rows with no gate applied.',
  source:
    'docs/specs/08-flywheel-design.md §3.3 ("One gate function. Every consumer calls it; nothing reads ' +
    'derived_values directly."); migration 285 (derived_values RLS + derived_values_admissible, the first ' +
    'enforcement point this function backstops)',

  enumerate() {
    return globFiles([
      'fsi-app/src/**/*.{ts,tsx,mjs,js}',
      'fsi-app/scripts/**/*.mjs',
    ]).filter((f) => !f.includes('.test.') && !f.includes('.npmtest.') && !f.includes('.stories.'));
  },

  check(filepath, content) {
    if (isSanctioned(filepath)) return [];
    return derivedValuesReadLines(content).map((ln) =>
      violation(
        ln,
        `Direct read of derived_values outside src/lib/propagation/ — spec §3.3's pollution barrier. Read ` +
          `through derived_values_admissible (the view — already excludes stale/falsified/obsolete) or call ` +
          `admissibleFor() (src/lib/propagation/admissible-for.ts) instead of .from("derived_values") ` +
          `directly. Override (single line): \`// fitness-allow: F31 (reason)\`.`,
      ),
    );
  },
};
