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
// Trigger: a commit that ADDS at least one line, in a non-exempt path, containing U+2014 (em dash),
// U+2013 (en dash), or U+00A7 (section sign).
// Check:   FAIL unless the added line is exempt by PATH (fsi-app/scripts/turns/record-briefs/batches/,
//          any directory named `fixtures`, or docs/archive/) or carries the literal marker
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

const GLYPH_RE = /[\u2014\u2013\u00A7]/;
const MARKER = 'glyph:verbatim';

// Path fragments that exempt an added line from the check entirely (never even read for the marker).
// - fsi-app/scripts/turns/record-briefs/batches/  verbatim captured regulatory text, byte-exact by
//   ADR-016; the pool's own glyphs are the source's, not this repo's prose.
// - a directory named `fixtures` (any depth)       test fixture data, not authored prose.
// - docs/archive/                                  superseded working notes (CLAUDE.md: "not indexed,
//   not loaded"); present under both docs/archive/ and fsi-app/docs/archive/.
function normalize(p) {
  return String(p).replaceAll('\\', '/');
}

function isExemptPath(path) {
  const p = normalize(path);
  if (p.includes('fsi-app/scripts/turns/record-briefs/batches/')) return true;
  if (p.includes('docs/archive/')) return true;
  if (p.split('/').includes('fixtures')) return true;
  return false;
}

function relevantFiles(ctx) {
  return ctx.stagedFiles.filter((f) => f.status !== 'D' && !isExemptPath(f.path));
}

// Every added, non-exempt, unmarked line carrying a banned glyph, across every relevant file.
function offendingLines(ctx) {
  const offenders = [];
  for (const file of relevantFiles(ctx)) {
    const added = ctx.getAddedLines(file.path) || [];
    for (const line of added) {
      if (!GLYPH_RE.test(line)) continue;
      if (line.includes(MARKER)) continue; // disclosed, not silently bypassed, see header
      offenders.push({ path: file.path, line });
    }
  }
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
      message: `${offenders.length} added line(s) contain a banned dash/section-sign glyph (U+2014, U+2013, or U+00A7).`,
      remediation: [
        'Replace the glyph with a comma or period, or split the sentence. House style forbids em/en',
        'dashes and the section-sign glyph in authored prose (use "section N" / "SN", never U+00A7).',
        'If the glyph is genuinely verbatim (captured third-party text, a fixture string, or a regex',
        `character class that must contain it), add the literal marker "${MARKER}" on the SAME line.`,
        'This discloses the glyph instead of silently passing it.',
        'Exempt paths (never flagged): fsi-app/scripts/turns/record-briefs/batches/, any `fixtures`',
        'directory, docs/archive/.',
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
