// Rule 022: No dash / section-sign glyphs in added prose
// Source: docs/plans/defect-fix-plan-2026-09-12.md, D5 [CONFIRMED]
//
// The check ("no em dashes, en dashes or the section-sign glyph in added prose") lived only in the
// coordinator's dispatch text (docs/dispatches/lane-common-contract.md's Wiring preflight step 2) and
// as a byte count the coordinator ran BY HAND. Evidence the manual check was not enough: task 7.4e
// added 7 (fixed in its own round), task 7.5 added 36 across nine files, task 7.2 added 4 (a
// sanitiser's own character class, ruled acceptable, the class this rule's marker now discloses
// mechanically instead of by ad hoc ruling). This rule moves the check into the discipline engine so
// it fires on every commit, not only when a coordinator remembers to run the grep.
//
// SCOPE (lane GATE-1, 2026-10-08): INTRODUCED lines. Before, any added line counted, and git reports an
// edited line as one removed plus one added, so a line touched only to fix an apostrophe failed for a glyph
// it already carried, and text moved or split into new files counted as wholly new (12 of 22 firings in the
// 30 days before this lane: edited-line, moved-runbook and range-computation cases; one split rewrote 664
// glyphs across 66 files to move them). A line now counts only when the removed line it replaces does not
// already carry a glyph, and it is not text moved from elsewhere in the same diff (ctx.introducedLines,
// lib/context.mjs: ONE git diff for all staged files, computed once per run and shared by trigger and
// check, where the old code spawned one git process per file, twice, 12.5 s at 77 files).
//
// Trigger: a commit that INTRODUCES at least one line, in a non-exempt path, containing U+2014 (em dash),
// U+2013 (en dash), or U+00A7 (section sign).
// Check:   FAIL unless the added line is exempt by PATH (fsi-app/scripts/turns/record-briefs/batches/,
//          any directory named `fixtures`, docs/archive/, or a dated design-handoff bundle's own
//          delivered file -- README.md, support.js, or *.dc.html under
//          docs/design/handoff-YYYY-MM-DD/) or carries the literal marker
//          `glyph:verbatim` on the SAME line. The marker is a disclosure, not a silent bypass: a
//          fixture string or a regex character class that must legitimately contain the glyph names
//          itself, so a reviewer (or the lane contract's own preflight byte count) can find it, rather
//          than the byte count and the rule silently disagreeing on how many glyphs are "really" there.
//          Only an UNCHANGED/context line containing the glyph is left alone; verbatim third-party
//          content already in the repository is not this rule's concern (rule 012's own
//          scripts/_snapshots/ precedent: captured text is data, not prose this repo authored).
//
// The banned code points are written as \u escapes below, in code AND in this comment block, so this
// file's own source text never contains a literal instance of what it forbids (the same discipline
// rule 012 states for its own hardcoded-path patterns: the literal form is not spelled out in prose).

import { pass, fail } from '../lib/result.mjs';
import { introducedMatches } from '../lib/context.mjs';

const GLYPH_RE = /[\u2014\u2013\u00A7]/;
const MARKER = 'glyph:verbatim';

// Path fragments that exempt an added line from the check entirely (never even read for the marker).
// - fsi-app/scripts/turns/record-briefs/batches/  verbatim captured regulatory text, byte-exact by
//   ADR-016; the pool's own glyphs are the source's, not this repo's prose.
// - a directory named `fixtures` (any depth)       test fixture data, not authored prose.
// - docs/archive/                                  superseded working notes (CLAUDE.md: "not indexed,
//   not loaded"); present under both docs/archive/ and fsi-app/docs/archive/.
// - a dated design-handoff bundle's OWN delivered files (README.md, support.js, any *.dc.html) under
//   docs/design/handoff-YYYY-MM-DD/ -- a verbatim third-party artifact delivered by the operator, which
//   cannot carry a per-line marker without altering the artifact itself (2026-09-20 lane R22, evidence:
//   pre-commit hook refused docs/design/handoff-2026-09-07/Caros Ledge UI System.dc.html, 205 added
//   lines). NOT the whole folder: repo-authored files beside the bundle (DEVIATION-LOG.md, HANDOFF.md,
//   AUDIT-*.md, SHARED-PART-REPORT-*.md) stay under the rule.
const DESIGN_HANDOFF_BUNDLE_FILE_RE =
  /(^|\/)docs\/design\/handoff-\d{4}-\d{2}-\d{2}\/(README\.md|support\.js|[^/]+\.dc\.html)$/;

// Design-audit generator output (lane DAUDIT-1, coordinator ruling 2026-10-08): rule 022 governs authored
// text, and these two files are written by fsi-app/.discipline/rendering/audit/run-audit.mjs, which copies
// spec prose and measured page strings verbatim. Reason: generator output: copies spec prose and measured
// page strings verbatim. EXACT paths only, so an authored file beside them (a spec JSON, the audit README,
// DEVIATION-LOG.md, a differently named results file) stays under the rule.
const GENERATED_AUDIT_OUTPUT_PATHS = new Set([
  'fsi-app/.discipline/rendering/audit/results.json',
  'docs/design/handoff-2026-09-06/AUDIT-2026-09-07.md',
]);

function normalize(p) {
  return String(p).replaceAll('\\', '/');
}

function isDesignHandoffBundleFile(path) {
  return DESIGN_HANDOFF_BUNDLE_FILE_RE.test(normalize(path));
}

function isExemptPath(path) {
  const p = normalize(path);
  if (p.includes('fsi-app/scripts/turns/record-briefs/batches/')) return true;
  if (p.includes('docs/archive/')) return true;
  if (p.split('/').includes('fixtures')) return true;
  if (isDesignHandoffBundleFile(p)) return true;
  if (GENERATED_AUDIT_OUTPUT_PATHS.has(p) || [...GENERATED_AUDIT_OUTPUT_PATHS].some((g) => p.endsWith('/' + g))) return true;
  return false;
}

function relevantFiles(ctx) {
  return ctx.stagedFiles.filter((f) => f.status !== 'D' && !isExemptPath(f.path));
}

const hasGlyph = (line) => GLYPH_RE.test(line);
const offendersByContext = new WeakMap();

// Every introduced, non-exempt, unmarked line carrying a banned glyph, across every relevant file. Memoised
// per context so trigger() and check() share one pass.
function offendingLines(ctx) {
  if (offendersByContext.has(ctx)) return offendersByContext.get(ctx);
  const offenders = [];
  for (const file of relevantFiles(ctx)) {
    for (const pair of introducedMatches(ctx.introducedLines(file.path), hasGlyph)) {
      if (pair.added.includes(MARKER)) continue; // disclosed, not silently bypassed, see header
      offenders.push({ path: file.path, line: pair.added, lineNumber: pair.line });
    }
  }
  offendersByContext.set(ctx, offenders);
  return offenders;
}

export const rule = {
  id: '022',
  name: 'No dash/section-sign glyphs in added prose',
  description:
    'An added line must not contain U+2014 (em dash), U+2013 (en dash), or U+00A7 (section sign) ' +
    'unless the path is exempt (record-briefs batches, a fixtures directory, docs/archive/) or the ' +
    'line carries the `glyph:verbatim` marker.',
  ruleSource: 'docs/plans/defect-fix-plan-2026-09-12.md, D5',

  trigger(ctx) {
    if (ctx.isMergeCommit) return false;
    if (ctx.isRevertCommit) return false;
    return offendingLines(ctx).length > 0;
  },

  check(ctx) {
    const offenders = offendingLines(ctx);
    if (offenders.length === 0) return pass();

    const displayed = offenders.slice(0, 10);
    const remainder = offenders.length - displayed.length;

    return fail({
      locations: offenders.map((o) => ({ path: o.path, line: o.lineNumber })),
      message: `${offenders.length} added line(s) contain a banned dash/section-sign glyph (U+2014, U+2013, or U+00A7).`,
      remediation: [
        'Replace the glyph with a comma or period, or split the sentence. House style forbids em/en',
        'dashes and the section-sign glyph in authored prose (use "section N" / "SN", never U+00A7).',
        'If the glyph is genuinely verbatim (captured third-party text, a fixture string, or a regex',
        `character class that must contain it), add the literal marker "${MARKER}" on the SAME line.`,
        'This discloses the glyph instead of silently passing it.',
        'Exempt paths (never flagged): fsi-app/scripts/turns/record-briefs/batches/, any `fixtures`',
        'directory, docs/archive/, and a dated design-handoff bundle\'s own delivered file (README.md,',
        'support.js, or *.dc.html under docs/design/handoff-YYYY-MM-DD/).',
        'Offending lines:',
        ...displayed.map((o) => `    ${o.path}: ${o.line.trim()}`),
        remainder > 0 ? `    ... and ${remainder} more` : null,
        'Emergency bypass: git commit --no-verify.',
      ].filter(Boolean).join('\n  '),
    });
  },
};

export const _GLYPH_RE = GLYPH_RE;
export const _MARKER = MARKER;
