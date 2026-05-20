// F6: Migrations must follow numeric ordering and have descriptive names.
// Source: sprint-followups-discipline § Sources-schema-touch precondition;
// migration discipline across the Q1-Q11 + Phase 1.5 sequence.
//
// Naming contract: NNN_descriptive_name.sql where NNN is 3-digit zero-padded
//                  and descriptive_name is non-empty snake_case.
//
// Holistic check (across all migration files, not per-file):
//   - All filenames match the pattern
//   - Numeric sequence is contiguous (no gaps) OR documented gaps acceptable
//     (Caro's Ledge history HAS gaps; this fitness function tolerates them but
//     reports them so operator can decide to backfill)
//   - No duplicates of the same number

import { violation, PASS } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';

const MIGRATION_NAME_RE = /^(\d{3})_([a-z0-9_]+)\.sql$/;

// Historical duplicates grandfathered at Sprint Architecture Phase 4 landing.
// These migrations shipped to production with colliding numbers before F6 existed;
// renumbering retroactively would break the migration ledger. New duplicates
// going forward still fail F6.
// To remove a pair from this allowlist, run a renumbering migration first.
const KNOWN_HISTORICAL_DUPLICATES = new Set([
  '006_multi_tenant.sql',
  '006_rls_multi_tenant.sql',
  '007_community_layer.sql',
  '007_full_brief.sql',
  '007_rls_community.sql',
]);

export const fitnessFunction = {
  id: 'F6',
  name: 'migrations-numeric-ordering',
  description: 'Migration files must match NNN_descriptive_name.sql; no duplicate numbers; gaps reported but tolerated.',
  source: 'sprint-followups-discipline + migration discipline across Q1-Q11 sequence',

  enumerate() {
    return globFiles(['fsi-app/supabase/migrations/*.sql']);
  },

  check(filepath, content) {
    // F6 is mostly a per-file pattern check.
    // The cross-file checks (duplicates, gaps) are reported on the FIRST migration file
    // encountered, via a side-channel: we re-enumerate here and run holistic checks.
    const filename = filepath.split('/').pop();
    const violations = [];

    // Per-file name pattern check
    const match = filename.match(MIGRATION_NAME_RE);
    if (!match) {
      violations.push(violation(
        1,
        `Migration filename "${filename}" does not match NNN_descriptive_name.sql pattern (3-digit zero-padded number, underscore, snake_case description, .sql extension).`,
      ));
      return violations;
    }

    // Per-file: descriptive_name must not be a placeholder
    const [, , descriptiveName] = match;
    if (descriptiveName.length < 3 || /^(foo|bar|baz|test|tmp|temp|wip|todo)$/i.test(descriptiveName)) {
      violations.push(violation(
        1,
        `Migration filename "${filename}" has a placeholder description "${descriptiveName}"; use a descriptive name (purpose of the migration).`,
      ));
    }

    // Holistic checks ONLY on the lowest-numbered migration to avoid duplicate reporting
    // across all migration files.
    const allMigrations = fitnessFunction.enumerate();
    const lowestNumbered = allMigrations
      .map((p) => p.split('/').pop())
      .filter((n) => MIGRATION_NAME_RE.test(n))
      .sort()[0];

    if (filename === lowestNumbered) {
      const parsed = allMigrations
        .map((p) => p.split('/').pop())
        .map((n) => {
          const m = n.match(MIGRATION_NAME_RE);
          return m ? { number: parseInt(m[1], 10), name: n } : null;
        })
        .filter((x) => x !== null)
        .sort((a, b) => a.number - b.number);

      const byNumber = new Map();
      for (const p of parsed) {
        if (byNumber.has(p.number)) {
          const existingName = byNumber.get(p.number);
          // Both files known to be historical duplicates? Skip.
          if (KNOWN_HISTORICAL_DUPLICATES.has(p.name) && KNOWN_HISTORICAL_DUPLICATES.has(existingName)) {
            continue;
          }
          violations.push(violation(
            1,
            `Duplicate migration number ${String(p.number).padStart(3, '0')}: "${existingName}" and "${p.name}". Resolve by renumbering one (or add both to KNOWN_HISTORICAL_DUPLICATES in F6.mjs with rationale if intentional).`,
          ));
        }
        byNumber.set(p.number, p.name);
      }
      // Gap detection: report (but do not fail) any gaps in the sequence
      // for operator awareness.
      // Reporting gaps as violations would be noisy; we surface them via a single
      // informational violation only if total gap count > 0 AND > 5 (large-gap signal).
      const numbers = parsed.map((p) => p.number);
      const min = Math.min(...numbers);
      const max = Math.max(...numbers);
      const expectedCount = max - min + 1;
      const gapCount = expectedCount - numbers.length;
      if (gapCount > 10) {
        violations.push(violation(
          1,
          `Migration sequence has ${gapCount} numbering gaps between ${String(min).padStart(3, '0')} and ${String(max).padStart(3, '0')}. Gaps are tolerated but may indicate dropped migrations worth investigating. Use \`// fitness-allow: F6 (intentional gaps after squash)\` on this filename's first line to silence.`,
        ));
      }
    }

    return violations;
  },
};
