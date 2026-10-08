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
// RAW SQL (lane GATE-8, 2026-10-08, AUD-AT-4 B5-11). The earlier note here named a raw `SELECT ... FROM
// derived_values` string as a residual this function did not catch. A service-role pg client in a script reads
// the table with no admissibleFor() check applied just as a .from() call does, so a string or template that
// selects from or joins derived_values is now a read (migrations are still not scanned, matching F24).
//
// SCOPE mirrors F21/F15/F16: production path only (src/lib, src/app, src/workflows, scripts) — a
// one-off/scratch script is held at the commit layer (rule 016), not here.

import { violation } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';
import { overrideLines } from '../lib/code-scan.mjs';
import { tableCalls, rawSqlLines } from '../lib/table-access.mjs';

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

/** Lines making a forbidden raw `derived_values` read. Lane GATE-8 (2026-10-08, AUD-AT-4 B5-08 to B5-12): the call
 *  is read as a call (../lib/table-access.mjs), not as a one-line regex, so `.from(` and the table name on
 *  separate lines, a table name held in a constant, and a template literal are all the same read; raw SQL that
 *  selects from or joins derived_values through a pg client is a read too (the closing-name boundary still keeps
 *  derived_values_admissible, the sanctioned view, out). A marker inside a string is not an override. */
export function derivedValuesReadLines(content) {
  const overridden = overrideLines(content, 'F31');
  const lines = new Set();
  for (const call of tableCalls(content)) if (call.table === 'derived_values') lines.add(call.line);
  for (const ln of rawSqlLines(content, 'FROM|JOIN', 'derived_values')) lines.add(ln);
  return [...lines].filter((ln) => !overridden.has(ln)).sort((a, b) => a - b);
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
      'fsi-app/src/**/*.{ts,tsx,mjs,js,cjs,jsx}',
      'fsi-app/scripts/**/*.{mjs,js,cjs,ts}',
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
