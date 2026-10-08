// Rule manifest. Main session owns this file.
//
// History. 2026-05-21 audit: the engine was cut from 14 rules to 2 (rules 001-011 and 013 deleted, zero
// catches in ~23h live, attestation gates the engine cannot verify against code: "ceremony rather than
// enforcement", the 5e3ae41 revert rationale). 2026-06 to 2026-09: content-verifier rules 015 to 022 were
// added for the damage action-classes and recorded incidents. Lane GATE-1 (2026-10-08, gate plan
// "remove, repair, replace"; doctrine in ADR-046 by lane GATE-0):
//   REMOVED  014 inventory consistency   (the same consistency runner runs at pre-push step 2 and in the
//                                          CI consistency-backstop job; a third call site, vacuous in PR CI)
//   REMOVED  016 canonical Anthropic path (F15 holds the same regex over the same files; 016's PERMITTED
//                                          list merged into F15's sanctioned set; F46 homes the host string)
//   REMOVED  020 frozen session-log fork (the fork file was archived to docs/archive/, so nothing remains
//                                          to freeze; invariant RD-50 now cites a structural test)
//   REPAIRED 012, 015, 017, 019, 022     (introduced-lines scope: a line counts only when the pattern is
//                                          absent from the removed line it replaces and the line was not
//                                          moved from elsewhere in the diff; lib/context.mjs)
//   REPAIRED 018                         (fires only on an ADDED page.tsx, never on an edit)
//   KEPT     021                         (cache-key shape hash; two true positives in 30 days)
//   REMOVED  the Write-Guard-Override, Surface-Decision-Override and Source-Reclassify-Override trailers
//            (no validation, whole-commit scope). Consistency-Override stays: it is validated and dated,
//            and lives in consistency/override-check.mjs for pre-push step 2 and the CI backstop.
//
// GATE-7 (2026-10-08, honest forms from the AUD-AT-3 attack register): rules 012, 015, 017, 018, 019, 021
// and 022 read the staged BLOB and the honest content forms of their pattern (lib/context.mjs,
// lib/mask-source.mjs); rule 023 is new, one check for the blind spot all five content rules shared (a file
// git does not diff as text).
//
// REGISTERED (8):
//   012  hardcoded user-home path in introduced code
//   015  raw row write outside the guarded path (scripts/lib/db.mjs) in introduced code
//   017  raw process.env knob read in generation logic
//   018  new page.tsx outside the five-surface model
//   019  source-not-item raw-archived instead of reclassified
//   021  dashboard cache key out of step with the DashboardData shape hash
//   022  em dash, en dash or section-sign glyph in introduced prose
//   023  source file not diffed as text (binary attribute, NUL byte, UTF-16)
//
// Commit messages are normal: subject + body, no required trailers.
//
// FIRING LOG. runner.mjs appends one JSON line per rule firing to governance/.hook-firings.log
// (gitignored): {ts, rule, mode, path, line, verdict, baseline}. A later evaluation is a query over that file.

import { rule as rule012 } from './rules/012-hardcoded-user-path.mjs';
// Operating-mechanism build (2026-06-06): content-verifier tripwires for the three damage
// action-classes (G/S/M). These VERIFY AGAINST CODE (012-style), not trailer-attestation:
// the manifest's own 5e3ae41 lesson ("ceremony rather than enforcement") rules out attestation
// gates. Each maps to a governing skill via governance/skill-map.mjs (single source of truth).
import { rule as rule015 } from './rules/015-row-mutation-guarded-path.mjs';
import { rule as rule017 } from './rules/017-generation-config-no-raw-env.mjs';
import { rule as rule018 } from './rules/018-new-surface-five-model.mjs';
// Source-registration invariant (2026-06-06): source-not-item must be REGISTERED, never raw-archived
// (the 25-orphan + 5-wrong-archive class fix). Pairs with db.mjs reclassifyToSource() + migration 135.
import { rule as rule019 } from './rules/019-source-reclassify-not-archive.mjs';
// Cached-shape key guard (2026-08-02): the DashboardData cache key must carry the current
// shape hash. Closes the #395 class: a cached-payload shape change without a key rotation
// let stale cross-deployment cache entries crash SSR of / (digest 2552218741). Content-
// verifiable, 012-style; the failure message prints the exact new key.
import { rule as rule021 } from './rules/021-cached-shape-key.mjs';
// No-dash-glyphs guard (2026-09-12, defect-fix-plan-2026-09-12.md D5): an introduced line must not carry
// U+2014, U+2013 or U+00A7 unless the path is exempt or the line carries `glyph:verbatim`. Was a byte
// count the coordinator ran by hand; moved into the engine so it fires on every commit.
import { rule as rule022 } from './rules/022-no-dash-glyphs.mjs';

// Source file not diffed as text (2026-10-08, lane GATE-7): the one check for the blind spot every content
// rule shared.
import { rule as rule023 } from './rules/023-source-not-diffed-as-text.mjs';

// SCOPE (lane RULE-RANGE-1, 2026-10-08): what a rule judges, declared as data on each registered rule so the CI
// runner can tell a verdict that a squash-merge makes moot from one it does not.
//   introduced-lines  a line counts only when the pattern is introduced (012, 015, 017, 019, 022)
//   tree-state        the files or tree a commit leaves (018 an ADDED page, 021 the cache-key file, 023 a file git
//                     does not diff as text)
//   whole-commit      the commit as a unit: its message, trailers, form (no registered rule today; the first
//                     message-form rule declares this)
// Every pull request merges by squash, so for a pull-request range the content verdict is the whole-range diff's
// (runner.mjs). introduced-lines and tree-state are content scopes; whole-commit is judged per commit.
export const SCOPE = Object.freeze({
  INTRODUCED_LINES: 'introduced-lines',
  TREE_STATE: 'tree-state',
  WHOLE_COMMIT: 'whole-commit',
});

/** True when the rule judges content a squash-merge re-judges as one diff. A rule with no valid scope is NOT
 *  squash-judged: an undeclared rule keeps failing per commit. */
export function isSquashJudged(rule) {
  return rule?.scope === SCOPE.INTRODUCED_LINES || rule?.scope === SCOPE.TREE_STATE;
}

const withScope = (rule, scope) => ({ ...rule, scope });

export const rules = [
  withScope(rule012, SCOPE.INTRODUCED_LINES),
  withScope(rule015, SCOPE.INTRODUCED_LINES),
  withScope(rule017, SCOPE.INTRODUCED_LINES),
  withScope(rule018, SCOPE.TREE_STATE),
  withScope(rule019, SCOPE.INTRODUCED_LINES),
  withScope(rule021, SCOPE.TREE_STATE),
  withScope(rule022, SCOPE.INTRODUCED_LINES),
  withScope(rule023, SCOPE.TREE_STATE),
];
