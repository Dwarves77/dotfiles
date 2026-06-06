// Rule 015: Row-mutating scripts must write through the guarded path (scripts/lib/db.mjs).
// Governing skills (via governance/skill-map): environmental-policy-and-innovation (taxonomy
// writes) + remediation-discipline (delete/archive). Content-verifiable (012-style): we read the
// staged script bytes and FAIL on a RAW Supabase write that does not go through the guarded helper.
//
// Why this is enforcement, not ceremony (manifest 5e3ae41): it verifies the ACTUAL write path in
// code, not a trailer that claims compliance. The guarded helper captures a prior-value snapshot
// (reversibility) + records the governing-skill cite; a raw .update()/.delete() does neither.
//
// Trigger: a staged .mjs file under fsi-app/scripts/ (excluding _diag/ read-only convention and
//          lib/ where the helper itself lives) whose content contains a raw Supabase write call.
// Check:   FAIL unless the file imports the guarded helper, or a documented override trailer is present.
// Override: `Write-Guard-Override: <reason>` trailer (for legacy-script edits not introducing new writes).

import { pass, fail, skip } from '../lib/result.mjs';
import { commitMessageLines } from '../lib/predicates.mjs';
import { skillsForOp } from '../governance/skill-map.mjs';

// Raw Supabase write signals (method-call shaped, NOT bare words — avoids the _diag "UPDATE CADENCE"
// false-trip from the red-team). .insert is excluded (additive, not a row mutation of existing data).
const RAW_WRITE_RE = /\.\s*(update|upsert|delete)\s*\(/;
const GUARDED_IMPORT_RE = /lib\/db\.mjs|guardedUpdate|guardedUpsert|guardedDelete|archiveRows/;

function norm(p) { return (p || '').replaceAll('\\', '/'); }

function relevantScripts(ctx) {
  return ctx.stagedFiles.filter((f) => {
    const p = norm(f.path);
    if (f.status === 'D') return false;
    if (!p.startsWith('fsi-app/scripts/')) return false;
    if (!p.endsWith('.mjs')) return false;
    if (p.includes('/scripts/_diag/')) return false;     // read-only diagnostic convention
    if (p.includes('/scripts/lib/')) return false;        // the helper itself + shared libs
    return true;
  });
}

export const rule = {
  id: '015',
  name: 'Row-mutation guarded path',
  description: 'Scripts that mutate existing rows must write through scripts/lib/db.mjs (snapshot + skill-cite), not a raw .update()/.upsert()/.delete(). Override: Write-Guard-Override: trailer.',
  ruleSource: 'governance/skill-map → environmental-policy-and-innovation + remediation-discipline; operating-mechanism build (action-class M)',

  trigger(ctx) {
    if (ctx.isMergeCommit || ctx.isRevertCommit) return false;
    return relevantScripts(ctx).length > 0;
  },

  check(ctx) {
    const overridden = commitMessageLines(ctx, 'Write-Guard-Override:').length > 0;
    const violations = [];
    for (const f of relevantScripts(ctx)) {
      const content = ctx.getFileContent(f.path);
      if (!content) continue;
      if (!RAW_WRITE_RE.test(content)) continue;          // no raw write → fine
      if (GUARDED_IMPORT_RE.test(content)) continue;      // uses the guarded path → fine
      const skills = skillsForOp(content);
      violations.push({ path: norm(f.path), skills: skills.map((s) => s.skill) });
    }
    if (violations.length === 0) return pass();
    if (overridden) return pass();

    return fail({
      message: `${violations.length} script(s) perform RAW row mutations outside the guarded path (scripts/lib/db.mjs).`,
      remediation: [
        'Route existing-row writes through the guarded helper so the change is reversible (prior-value snapshot) and skill-cited:',
        "  import { guardedUpdate, archiveRows } from './lib/db.mjs'   (or '../lib/db.mjs')",
        'Files + the governing skill each must cite:',
        ...violations.map((v) => `    ${v.path}  → cite: ${v.skills.join(', ') || '(taxonomy/remediation skill)'}`),
        'Legacy edit not introducing a new write? add a trailer:  Write-Guard-Override: <reason>',
        'Bypass (sparingly): git commit --no-verify',
      ].join('\n  '),
    });
  },
};
