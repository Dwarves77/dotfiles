// Rule 007: Sources-schema-touch precondition
// Source: sprint-followups-discipline § Sources-schema-touch precondition
//
// Trigger: commit touches the `sources` table OR adds/modifies a consumer of `sources`
//          columns. Detection is permissive (catches both new migrations on sources and
//          src/ files that consume sources columns); the rule pairs with a self-attestation
//          check so the deterministic file-pattern trigger does not over-fire on incidental
//          touches.
// Check:   commit body contains a "Schema-touch-precondition:" line attesting that the
//          consumer-wiring audit (per the skill's "How to apply" steps 1-4) was performed
//          before the new consumer was added. The attestation names columns + origin
//          migration + consumer-audit outcome.

import { pass, fail, skip } from '../lib/result.mjs';
import {
  isApplicableDispatchType,
  hasFileMatching,
  filesMatching,
  commitMessageHasLine,
  commitMessageMatches,
} from '../lib/predicates.mjs';

// Heuristic detection of a sources-table touch. Three pathways:
//   1. New or modified migration whose filename references sources
//   2. Files in fsi-app/src/lib/sources/ (canonical source library)
//   3. fsi-app/src/**/*.ts files where the commit message indicates sources work
function touchesSourcesSchema(ctx) {
  // Pathway 1: migrations whose path mentions sources
  const migrationFiles = filesMatching(ctx, 'fsi-app/supabase/migrations/');
  if (migrationFiles.some((f) => /sources?/i.test(f.path))) return true;

  // Pathway 2: canonical sources library
  if (hasFileMatching(ctx, 'fsi-app/src/lib/sources/')) return true;

  // Pathway 3: any sources-related API route (canonical-sources, sources/[id], etc.)
  const apiFiles = filesMatching(ctx, 'fsi-app/src/app/api/');
  if (apiFiles.some((f) => /\/(canonical-)?sources?\//i.test(f.path))) return true;

  // Pathway 4: TS/SQL files touched alongside a commit message that names sources columns
  // or sources-table work. Conservative substring search to avoid false positives on
  // unrelated "source" usages (e.g. "source map", "open source"); we require either
  // explicit sources-table phrasing OR a known sources-column name.
  const codeOrSql = ctx.stagedFiles.filter((f) => /\.(ts|tsx|sql)$/.test(f.path));
  if (codeOrSql.length === 0) return false;
  const sourcesColumnNames = [
    'source_role', 'secondary_roles', 'scope_topics', 'scope_modes', 'scope_verticals',
    'expected_output', 'classification_assigned_at', 'classification_observed_distribution',
    'observed_correctness_count', 'last_observed_at', 'classification_confidence',
    'classification_rationale', 'effective_tier', 'base_tier', 'tier_override',
    'override_reason', 'override_date', 'bias_tag',
  ];
  const message = ctx.commitMessage.toLowerCase();
  if (/sources?\s+(table|column|schema|row)/.test(message)) return true;
  if (/\bsource_citations\b/.test(message)) return true;
  if (/\bintelligence_item_citations\b/.test(message)) return true;
  if (sourcesColumnNames.some((col) => message.includes(col))) return true;

  return false;
}

export const rule = {
  id: '007',
  name: 'Sources-schema-touch precondition',
  description: 'Commits touching the sources table or adding sources-column consumers must attest that consumer wiring was audited first.',
  ruleSource: 'sprint-followups-discipline § Sources-schema-touch precondition',

  trigger(ctx) {
    if (!ctx.isOnMaster) return false;
    if (!isApplicableDispatchType(ctx)) return false;
    if (!touchesSourcesSchema(ctx)) return false;
    return true;
  },

  check(ctx) {
    if (commitMessageHasLine(ctx, 'Schema-touch-precondition:')) return pass();

    // Operator-attested exemption: explicit "no new consumer" claim. The
    // precondition exists to gate new-consumer additions per the skill; if the
    // commit is e.g. a pure refactor of an existing consumer, the operator can
    // attest so to skip the audit obligation. The attestation itself goes in
    // the commit body so it stays git-log auditable.
    if (commitMessageHasLine(ctx, 'Schema-touch-precondition: not-applicable')) return pass();
    if (commitMessageHasLine(ctx, 'Schema-touch-precondition: no new consumer')) return pass();

    return fail({
      message: 'Sources-table or sources-consumer commit missing required "Schema-touch-precondition:" attestation line.',
      remediation: [
        'Before adding a new consumer of sources columns, audit existing consumers per the skill\'s "How to apply" steps 1-4.',
        'Then add a line to the commit body attesting the audit ran. Format:',
        '  Schema-touch-precondition: <columns>; origin-migration <NNN>; consumers audited (N PASS, M SUSPECT)',
        'Example:',
        '  Schema-touch-precondition: source_role, classification_confidence; origin-migration 063; consumers audited (12 PASS, 0 SUSPECT)',
        'If the commit adds NO new consumer (e.g. pure refactor of an existing one), state:',
        '  Schema-touch-precondition: no new consumer (refactor of src/lib/foo.ts)',
        'If the rule fired on a commit you believe does not touch sources-schema, attest:',
        '  Schema-touch-precondition: not-applicable (<short reason>)',
      ].join('\n  '),
    });
  },
};

export const skipReasons = {
  notOnMaster: 'precondition rule applies to commits landing on master only',
  notApplicableType: 'commit subject indicates investigation, hotfix, research, conversation, merge, or revert',
  doesNotTouchSources: 'commit does not touch the sources table or sources-column consumers',
};

// Exported for tests so the trigger heuristic can be exercised directly without
// going through the trigger function's other gates (master-branch, applicable-type).
export const _touchesSourcesSchema = touchesSourcesSchema;
