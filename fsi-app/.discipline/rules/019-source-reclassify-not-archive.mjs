// Rule 019: A "source-not-item" is REGISTERED as a source, never raw-archived. Content-verifiable.
// Governing skills (via governance/skill-map): source-credibility-model (§1/§5 registration) +
// remediation-discipline (classify-before-discard; no archive over an undiagnosed/source bucket).
//
// This is the EXACT error the operator corrected: a script archived 5 portals (and 25 earlier ones)
// with a source-y archive_reason WITHOUT registering them as sources — blinding the scanner from
// their pages. The class fix is db.mjs reclassifyToSource() (register-then-archive, read-back
// verified). This rule makes the raw path fail at commit, so the safe path is the only path.
//
// Trigger: a staged .mjs under fsi-app/scripts/ (excluding _diag/ read-only + lib/ where the helper
//          lives) that ARCHIVES with a source-y archive_reason.
// Check:   FAIL unless the archive goes through reclassifyToSource. There is no override trailer: lane
//          GATE-1 (2026-10-08) removed Source-Reclassify-Override (no validation, whole-commit scope,
//          never used in 90 days).
//
// SCOPE (lane GATE-1, 2026-10-08): introduced lines. The file-level condition below (a source-y reason
// literal, an archive call, no reclassifyToSource) is unchanged, but it now fails a commit only when the
// commit INTRODUCES a line carrying the reason literal or the archive call: an added line, or an edit
// whose removed counterpart did not already carry one, not a line moved from elsewhere in the diff
// (ctx.introducedLines, lib/context.mjs). A legacy script edited on an unrelated line passes.
//
// HONEST FORMS (lane GATE-7, 2026-10-08, attacks A019-1 to A019-10 of the AUD-AT-3 register): the reason and the
// archive call are read with adjacent string literals folded (a reason split across a plus sign is the reason);
// the archive helper counts when it is NAMED (an alias or a destructured import never meets an open paren);
// the sanctioned helper counts only as an identifier in CODE (a comment that names reclassifyToSource
// silences nothing); every script extension the repo runs is covered; the scripts/lib exemption is the
// helper itself (scripts/lib/db.mjs), not the directory; an edit that swaps one source-y reason for another
// on an archive line is charged (introducedMatches' extract argument); the rule reads the STAGED BLOB.
// NOT covered, and why: a reason that lives in another module and is imported by name (A019-3) needs
// cross-file resolution; the database side holds the same property (migration 135's guard, SC-2, EP-4).
//
// Why enforcement not ceremony (manifest 5e3ae41): it reads the actual archive call + reason literal
// in code, not a trailer claiming compliance.

import { pass, fail } from '../lib/result.mjs';
import { introducedMatches } from '../lib/context.mjs';
import { skillsForOp } from '../governance/skill-map.mjs';
import { maskNonCode, foldStringConcat } from '../lib/mask-source.mjs';

// Mirror of db.mjs SOURCEY_ARCHIVE_REASONS (kept literal here so the rule has no runtime import of
// app code; the invariant registry asserts the two lists stay in sync).
const SOURCEY_REASONS = [
  'reclassified_to_source',
  'source_not_item',
  'institutional_source',
  'non_regulatory_source',
  'portal_artifact',
];
// archive_reason literal that is one of the source-y values (string- or identifier-shaped).
const SOURCEY_REASON_RE = new RegExp(`['"\\\`](${SOURCEY_REASONS.join('|')})['"\\\`]`);
// an archive call (the guarded convenience or a direct is_archived write carrying archive_reason).
const ARCHIVE_CALL_RE = /\barchiveRows\s*\(|\barchiveRows\s+as\b|=\s*archiveRows\b|\barchiveRows\s*:\s*[A-Za-z_$]|is_archived\s*:\s*true|\.update\s*\([^)]*is_archived/;
// the sanctioned register-then-archive helper.
const RECLASSIFY_RE = /\breclassifyToSource\b/;
const SCRIPT_EXT_RE = /\.(mjs|cjs|js|mts|ts)$/;
const HELPER_PATH = 'fsi-app/scripts/lib/db.mjs';

function norm(p) { return (p || '').replaceAll('\\', '/'); }

function relevantScripts(ctx) {
  return ctx.stagedFiles.filter((f) => {
    const p = norm(f.path);
    if (f.status === 'D') return false;
    if (!p.startsWith('fsi-app/scripts/')) return false;
    if (!SCRIPT_EXT_RE.test(p)) return false;
    if (p.includes('/scripts/_diag/')) return false;   // read-only diagnostic convention
    if (p === HELPER_PATH) return false;                // the helper itself lives here
    return true;
  });
}

// The two halves of the violation, each judged on its own against the removed line it replaces: an edit
// that swaps a plain archive reason for a source-y one introduces the reason half even though the archive
// call was already there. The file-level conjunction in check() decides whether they add up.
const isSourceyReasonLine = (line) => SOURCEY_REASON_RE.test(foldStringConcat(line));
const isArchiveCallLine = (line) => ARCHIVE_CALL_RE.test(foldStringConcat(line));
// What an archive line carries, for edit-extend: the reason literals and the archive shapes.
const archiveTokens = (line) => {
  const f = foldStringConcat(line);
  return [...(f.match(new RegExp(SOURCEY_REASON_RE.source, 'g')) || []), ...(f.match(new RegExp(ARCHIVE_CALL_RE.source, 'g')) || [])];
};
function introducedArchiveLines(info) {
  const byLine = new Map();
  for (const p of [...introducedMatches(info, isSourceyReasonLine, archiveTokens), ...introducedMatches(info, isArchiveCallLine, archiveTokens)]) byLine.set(p.line, p);
  return [...byLine.values()].sort((a, b) => a.line - b.line);
}

export const rule = {
  id: '019',
  name: 'Source-not-item reclassified, not raw-archived',
  description: 'A script that archives a row with a source-y archive_reason (reclassified_to_source, source_not_item, institutional_source, non_regulatory_source, portal_artifact) must do so via db.mjs reclassifyToSource() (register-then-archive, read-back verified), never a raw archiveRows()/is_archived write. Charges only archive lines the commit introduces.',
  ruleSource: 'governance/skill-map → source-credibility-model (registration) + remediation-discipline; operating-mechanism build (source-registration invariant)',

  trigger(ctx) {
    if (ctx.isMergeCommit || ctx.isRevertCommit) return false;
    return relevantScripts(ctx).length > 0;
  },

  check(ctx) {
    const violations = [];
    for (const f of relevantScripts(ctx)) {
      // Cheap exit first: nothing introduced that looks like a source-y archive, nothing to read.
      const introduced = introducedArchiveLines(ctx.introducedLines(f.path));
      if (introduced.length === 0) continue;
      const content = ctx.getFileContent(f.path);
      if (!content) continue;
      const folded = foldStringConcat(maskNonCode(content, { keepStrings: true }));
      if (!SOURCEY_REASON_RE.test(folded)) continue;    // no source-y archive → not relevant
      if (!ARCHIVE_CALL_RE.test(folded)) continue;        // mentions reason but never archives → fine
      if (RECLASSIFY_RE.test(maskNonCode(content))) continue; // uses the sanctioned path (in code) → fine
      const skills = skillsForOp(content);
      violations.push({ path: norm(f.path), lines: introduced.map((p) => p.line), skills: skills.map((s) => s.skill) });
    }
    if (violations.length === 0) return pass();

    return fail({
      locations: violations.flatMap((v) => v.lines.map((line) => ({ path: v.path, line }))),
      message: `${violations.length} script(s) archive a row AS A SOURCE without registering it (raw archive-as-source).`,
      remediation: [
        'A source-not-item must be REGISTERED + scannable, not hidden. Route through the guarded helper:',
        "  import { reclassifyToSource } from './lib/db.mjs'   (or '../lib/db.mjs')",
        '  await reclassifyToSource(itemIds, { url, name, base_tier }, { cite })  // registers (read-back) THEN archives',
        'This is the 25-orphan + 5-wrong-archive class fix (archive-without-register blinds the scanner).',
        'Files flagged:',
        ...violations.map((v) => `    ${v.path}  → cite: ${v.skills.join(', ') || 'source-credibility-model + remediation-discipline'}`),
        'Only the lines this commit adds are charged; a source-y archive already in the file is not.',
        'Bypass (sparingly): git commit --no-verify',
      ].join('\n  '),
    });
  },
};
