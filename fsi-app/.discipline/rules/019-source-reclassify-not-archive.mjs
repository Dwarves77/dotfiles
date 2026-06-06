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
// Check:   FAIL unless the archive goes through reclassifyToSource. Override: Source-Reclassify-Override:.
//
// Why enforcement not ceremony (manifest 5e3ae41): it reads the actual archive call + reason literal
// in code, not a trailer claiming compliance.

import { pass, fail } from '../lib/result.mjs';
import { commitMessageLines } from '../lib/predicates.mjs';
import { skillsForOp } from '../governance/skill-map.mjs';

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
const ARCHIVE_CALL_RE = /archiveRows\s*\(|is_archived\s*:\s*true|\.update\s*\([^)]*is_archived/;
// the sanctioned register-then-archive helper.
const RECLASSIFY_RE = /reclassifyToSource/;

function norm(p) { return (p || '').replaceAll('\\', '/'); }

function relevantScripts(ctx) {
  return ctx.stagedFiles.filter((f) => {
    const p = norm(f.path);
    if (f.status === 'D') return false;
    if (!p.startsWith('fsi-app/scripts/')) return false;
    if (!p.endsWith('.mjs')) return false;
    if (p.includes('/scripts/_diag/')) return false;   // read-only diagnostic convention
    if (p.includes('/scripts/lib/')) return false;      // the helper itself lives here
    return true;
  });
}

export const rule = {
  id: '019',
  name: 'Source-not-item reclassified, not raw-archived',
  description: 'A script that archives a row with a source-y archive_reason (reclassified_to_source, source_not_item, institutional_source, non_regulatory_source, portal_artifact) must do so via db.mjs reclassifyToSource() (register-then-archive, read-back verified), never a raw archiveRows()/is_archived write. Override: Source-Reclassify-Override: trailer.',
  ruleSource: 'governance/skill-map → source-credibility-model (registration) + remediation-discipline; operating-mechanism build (source-registration invariant)',

  trigger(ctx) {
    if (ctx.isMergeCommit || ctx.isRevertCommit) return false;
    return relevantScripts(ctx).length > 0;
  },

  check(ctx) {
    const overridden = commitMessageLines(ctx, 'Source-Reclassify-Override:').length > 0;
    const violations = [];
    for (const f of relevantScripts(ctx)) {
      const content = ctx.getFileContent(f.path);
      if (!content) continue;
      if (!SOURCEY_REASON_RE.test(content)) continue;   // no source-y archive → not relevant
      if (!ARCHIVE_CALL_RE.test(content)) continue;       // mentions reason but never archives → fine
      if (RECLASSIFY_RE.test(content)) continue;          // uses the sanctioned path → fine
      const skills = skillsForOp(content);
      violations.push({ path: norm(f.path), skills: skills.map((s) => s.skill) });
    }
    if (violations.length === 0) return pass();
    if (overridden) return pass();

    return fail({
      message: `${violations.length} script(s) archive a row AS A SOURCE without registering it (raw archive-as-source).`,
      remediation: [
        'A source-not-item must be REGISTERED + scannable, not hidden. Route through the guarded helper:',
        "  import { reclassifyToSource } from './lib/db.mjs'   (or '../lib/db.mjs')",
        '  await reclassifyToSource(itemIds, { url, name, base_tier }, { cite })  // registers (read-back) THEN archives',
        'This is the 25-orphan + 5-wrong-archive class fix (archive-without-register blinds the scanner).',
        'Files flagged:',
        ...violations.map((v) => `    ${v.path}  → cite: ${v.skills.join(', ') || 'source-credibility-model + remediation-discipline'}`),
        'Legacy edit not introducing a new source-archive? add a trailer:  Source-Reclassify-Override: <reason>',
        'Bypass (sparingly): git commit --no-verify',
      ].join('\n  '),
    });
  },
};
