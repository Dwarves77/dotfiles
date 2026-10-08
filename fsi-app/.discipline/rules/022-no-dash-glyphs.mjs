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
// HONEST FORMS (lane GATE-7, 2026-10-08, attacks A022-1 to A022-9 of the AUD-AT-3 register):
//   * the glyph written as an escape or an entity (a JS or JSON unicode escape, a braced code point, the hex
//     byte escape of the section sign, a named, decimal or hex HTML entity) renders as the glyph, so it is the
//     glyph;
//   * the look-alikes U+2015, U+2212 and U+2011 read as dashes in prose and are banned with them;
//   * an edit that adds a glyph to a line that already carried one is charged for the surplus
//     (introducedMatches' extract argument);
//   * the `glyph:verbatim` marker is a token (not a substring of a longer word);
//   * every exempt path is ANCHORED: `fixtures` only under the three code roots, `docs/archive/` only at the
//     top of docs or of fsi-app, the handoff bundle only at docs/design/;
//   * a file git does not diff as text hides its glyphs from this rule; rule 023 refuses that file.
// The commit MESSAGE is not scanned: it is not prose this repo ships, and every commit already on an open
// branch would fail validate-commits the day this lands.
//
// Trigger: a commit that INTRODUCES at least one line, in a non-exempt path, containing U+2014 (em dash),
// U+2013 (en dash), or U+00A7 (section sign), or one of the forms above.
// Check:   FAIL unless the added line is exempt by PATH (fsi-app/scripts/turns/record-briefs/batches/,
//          a `fixtures` directory under fsi-app/.discipline, fsi-app/scripts or fsi-app/src, docs/archive/,
//          or a dated design-handoff bundle's own delivered file -- README.md, support.js, or *.dc.html
//          under docs/design/handoff-YYYY-MM-DD/) or carries the literal marker
//          `glyph:verbatim` on the SAME line. The marker is a disclosure, not a silent bypass: a
//          fixture string or a regex character class that must legitimately contain the glyph names
//          itself, so a reviewer (or the lane contract's own preflight byte count) can find it, rather
//          than the byte count and the rule silently disagreeing on how many glyphs are "really" there.
//          Only an UNCHANGED/context line containing the glyph is left alone; verbatim third-party
//          content already in the repository is not this rule's concern (rule 012's own
//          scripts/_snapshots/ precedent: captured text is data, not prose this repo authored).
//
// The banned code points are written as numbers below, never as the literal character or as an escape, so
// this file's own source never contains an instance of what it forbids (the same discipline rule 012 states
// for its own hardcoded-path patterns: the literal form is not spelled out in prose).

import { pass, fail } from '../lib/result.mjs';
import { introducedMatches } from '../lib/context.mjs';

// The banned glyphs (em dash, en dash, section sign) and the three look-alikes (horizontal bar, minus sign,
// non-breaking hyphen).
const BANNED = [0x2014, 0x2013, 0x00a7];
const LOOKALIKES = [0x2015, 0x2212, 0x2011];
const ALL = [...BANNED, ...LOOKALIKES];

const literalClass = `[${ALL.map((c) => String.fromCodePoint(c)).join('')}]`;
const hex4 = ALL.map((c) => c.toString(16).padStart(4, '0'));
const hexBare = ALL.map((c) => c.toString(16));
const ESCAPE_SOURCES = [
  String.raw`\\u(?:${hex4.join('|')})`,                 // a unicode escape
  String.raw`\\u\{0*(?:${hexBare.join('|')})\}`,        // a braced code point
  String.raw`\\x[aA]7`,                                  // the hex byte escape of the section sign
  '&(?:mdash|ndash|sect|horbar|minus);',                 // named HTML entities
  `&#(?:${ALL.join('|')});`,                             // decimal HTML entities
  `&#[xX]0*(?:${hexBare.join('|')});`,                   // hex HTML entities
];
const GLYPH_SOURCE = [literalClass, ...ESCAPE_SOURCES].join('|');

const GLYPH_RE = new RegExp(literalClass); // the literal characters, kept for the existing importers
const ANY_GLYPH_RE = new RegExp(GLYPH_SOURCE, 'i');
const MARKER = 'glyph:verbatim';
const MARKER_RE = /(?<![\w:-])glyph:verbatim(?![\w-])/;

// Path exemptions. Each is anchored; none is a substring test.
//   - fsi-app/scripts/turns/record-briefs/batches/  verbatim captured regulatory text, byte-exact by
//     ADR-016; the pool's own glyphs are the source's, not this repo's prose.
//   - a directory named `fixtures` under fsi-app/.discipline, fsi-app/scripts or fsi-app/src: test
//     fixture data, not authored prose. A docs folder that happens to be called fixtures is prose.
//   - docs/archive/ (and fsi-app/docs/archive/): superseded working notes (CLAUDE.md: "not indexed, not
//     loaded").
//   - a dated design-handoff bundle's OWN delivered files (README.md, support.js, any *.dc.html) under
//     docs/design/handoff-YYYY-MM-DD/ -- a verbatim third-party artifact delivered by the operator, which
//     cannot carry a per-line marker without altering the artifact itself (2026-09-20 lane R22, evidence:
//     pre-commit hook refused docs/design/handoff-2026-09-07/Caros Ledge UI System.dc.html, 205 added
//     lines). NOT the whole folder: repo-authored files beside the bundle (DEVIATION-LOG.md, HANDOFF.md,
//     AUDIT-*.md, SHARED-PART-REPORT-*.md) stay under the rule.
const DESIGN_HANDOFF_BUNDLE_FILE_RE =
  /^docs\/design\/handoff-\d{4}-\d{2}-\d{2}\/(README\.md|support\.js|[^/]+\.dc\.html)$/;
const FIXTURE_ROOT_RE = /^fsi-app\/(\.discipline|scripts|src)\//;
const ARCHIVE_RE = /^(?:fsi-app\/)?docs\/archive\//;

// Design-audit generator output (lane DAUDIT-1, coordinator ruling 2026-10-08): rule 022 governs authored
// text, and these two files are written by fsi-app/.discipline/rendering/audit/run-audit.mjs, which copies
// spec prose and measured page strings verbatim. Reason: generator output: copies spec prose and measured
// page strings verbatim. EXACT paths only, so an authored file beside them (a spec JSON, the audit README,
// DEVIATION-LOG.md, a differently named results file) stays under the rule.
const GENERATED_AUDIT_OUTPUT_PATHS = new Set([
  'fsi-app/.discipline/rendering/audit/results.json',
  'docs/design/handoff-2026-09-06/AUDIT-2026-09-07.md',
  // Generated harness ledger export (coordinator ruling 2026-10-08, DAUDIT-1 precedent). Reason: generated
  // harness ledger export; skip_reason strings are run data, written by scripts/lib/export-harness-ledger.mjs.
  'fsi-app/.discipline/governance/harness-ledger-export.json',
]);

function normalize(p) {
  return String(p).replaceAll('\\', '/').replace(/^\.\//, '');
}

function isDesignHandoffBundleFile(path) {
  return DESIGN_HANDOFF_BUNDLE_FILE_RE.test(normalize(path));
}

function isExemptPath(path) {
  const p = normalize(path);
  if (p.startsWith('fsi-app/scripts/turns/record-briefs/batches/')) return true;
  if (ARCHIVE_RE.test(p)) return true;
  if (FIXTURE_ROOT_RE.test(p) && p.split('/').includes('fixtures')) return true;
  if (isDesignHandoffBundleFile(p)) return true;
  if (GENERATED_AUDIT_OUTPUT_PATHS.has(p) || [...GENERATED_AUDIT_OUTPUT_PATHS].some((g) => p.endsWith('/' + g))) return true;
  return false;
}

function relevantFiles(ctx) {
  return ctx.stagedFiles.filter((f) => f.status !== 'D' && !isExemptPath(f.path));
}

const hasGlyph = (line) => ANY_GLYPH_RE.test(line);
// The glyph tokens on a line, for edit-extend: a line that already carried one glyph and gains more.
const glyphTokens = (line) => String(line).match(new RegExp(GLYPH_SOURCE, 'gi')) || [];
const offendersByContext = new WeakMap();

// Every introduced, non-exempt, unmarked line carrying a banned glyph, across every relevant file. Memoised
// per context so trigger() and check() share one pass.
function offendingLines(ctx) {
  if (offendersByContext.has(ctx)) return offendersByContext.get(ctx);
  const offenders = [];
  for (const file of relevantFiles(ctx)) {
    for (const pair of introducedMatches(ctx.introducedLines(file.path), hasGlyph, glyphTokens)) {
      if (MARKER_RE.test(pair.added)) continue; // disclosed, not silently bypassed, see header
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
    'An added line must not contain U+2014 (em dash), U+2013 (en dash), or U+00A7 (section sign), their ' +
    'escape and entity forms, or the look-alikes U+2015, U+2212 and U+2011, unless the path is exempt ' +
    '(record-briefs batches, a code-root fixtures directory, docs/archive/) or the line carries the ' +
    '`glyph:verbatim` marker.',
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
      message: `${offenders.length} added line(s) contain a banned dash/section-sign glyph (U+2014, U+2013, or U+00A7) or one of its escape, entity or look-alike forms.`,
      remediation: [
        'Replace the glyph with a comma or period, or split the sentence. House style forbids em/en',
        'dashes and the section-sign glyph in authored prose (use "section N" / "SN", never U+00A7).',
        'An escape (a backslash-u code, a numeric or named HTML entity) renders as the glyph and counts.',
        'If the glyph is genuinely verbatim (captured third-party text, a fixture string, or a regex',
        `character class that must contain it), add the literal marker "${MARKER}" on the SAME line.`,
        'This discloses the glyph instead of silently passing it.',
        'Exempt paths (never flagged): fsi-app/scripts/turns/record-briefs/batches/, a `fixtures`',
        'directory under fsi-app/.discipline, fsi-app/scripts or fsi-app/src, docs/archive/, and a dated',
        'design-handoff bundle\'s own delivered file (README.md, support.js, or *.dc.html under',
        'docs/design/handoff-YYYY-MM-DD/).',
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
