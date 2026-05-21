// Rule 015: Post-push verification required.
// Source: sprint-followups-discipline § Post-push verification rule + ADR-010 + ADR-005 (Layer 5a floor).
//
// Trigger: every applicable commit on master (not merge/revert/investigation/hotfix/research/conversation-only)
//          that is non-trivial (>1 file OR >5 additions; matches rule 010's substance threshold).
// Check:   commit body contains BOTH "CI-Status:" and "Deploy-Status:" trailers attesting to the
//          verified state of the parent commit (the previously-pushed work) before this commit was
//          created. Acceptable values are an enumerated set; PENDING/BUILDING additionally requires
//          a "Recheck-Timeline:" trailer so the operator is not the observability backstop.
// Override: `Verification-Override: <non-empty rationale, >=10 chars>` skips both trailer requirements
//          but surfaces in audit. Recurring overrides indicate the rule needs revision.
//
// Why a chain of attestation rather than direct post-push inspection at commit time:
// at commit-msg time the proposed commit hasn't been pushed yet; its own CI/Vercel status
// cannot exist. What CAN be verified is that the PARENT commit (already on origin/master)
// reached a known good state before this new commit was authored. The chain forms a moving
// front of verified history; the FIRST commit after rule 015 lands carries CI-Status: BOOTSTRAP
// because no prior commit was verified under this rule.

import { pass, fail } from '../lib/result.mjs';
import { isApplicableDispatchType, commitMessageLines, commitMessageHasLine } from '../lib/predicates.mjs';

const CI_VALUES = new Set(['PASS', 'FAIL', 'PENDING', 'BOOTSTRAP', 'N/A']);
const DEPLOY_VALUES = new Set(['READY', 'ERROR', 'BUILDING', 'BOOTSTRAP', 'N/A']);
const MIN_OVERRIDE_RATIONALE_CHARS = 10;

export const rule = {
  id: '015',
  name: 'Post-push verification',
  description: 'Substantial commits on master must include CI-Status and Deploy-Status trailers attesting to the verified parent state. PENDING/BUILDING additionally requires Recheck-Timeline. Override via Verification-Override: trailer.',
  ruleSource: 'sprint-followups-discipline § Post-push verification rule + ADR-010',

  trigger(ctx) {
    if (!ctx.isOnMaster) return false;
    if (!isApplicableDispatchType(ctx)) return false;
    // Match rule 010's trivial-skip threshold: tiny commits don't carry deployment risk
    // proportionate to verification overhead.
    if (ctx.totalFilesChanged <= 1 && ctx.totalAdditions <= 5) return false;
    return true;
  },

  check(ctx) {
    // Override path
    const overrideLines = commitMessageLines(ctx, 'Verification-Override:');
    for (const line of overrideLines) {
      const rest = line.slice('Verification-Override:'.length).trim();
      if (rest.length >= MIN_OVERRIDE_RATIONALE_CHARS) return pass();
    }
    if (overrideLines.length > 0) {
      return fail({
        message: 'Verification-Override: present but rationale is empty or too short.',
        remediation: [
          `Provide a non-empty rationale of at least ${MIN_OVERRIDE_RATIONALE_CHARS} characters.`,
          'Format: Verification-Override: <why post-push verification was skipped + how the gap will be closed>',
        ].join('\n  '),
      });
    }

    const ciLines = commitMessageLines(ctx, 'CI-Status:');
    const deployLines = commitMessageLines(ctx, 'Deploy-Status:');

    const missing = [];
    if (ciLines.length === 0) missing.push('CI-Status:');
    if (deployLines.length === 0) missing.push('Deploy-Status:');

    if (missing.length > 0) {
      return fail({
        message: `Commit missing required verification trailer(s): ${missing.join(', ')}.`,
        remediation: [
          'Add both trailers to the commit body attesting to the parent commit\'s pushed state:',
          '    CI-Status: PASS | FAIL | PENDING | BOOTSTRAP | N/A',
          '    Deploy-Status: READY | ERROR | BUILDING | BOOTSTRAP | N/A',
          '',
          'Values:',
          '    PASS / READY       parent was verified green via gh api / vercel status',
          '    FAIL / ERROR       parent was verified red; this commit addresses the failure (cite remediation)',
          '    PENDING / BUILDING still running; add Recheck-Timeline: <when> trailer',
          '    BOOTSTRAP          first commit creating or amending the verification rule itself',
          '    N/A                non-deploying context (rare; explain in body)',
          '',
          'How to verify the parent commit before authoring this one:',
          '    gh api "repos/<owner>/<repo>/commits/HEAD/check-runs" --jq ".check_runs[] | {name, conclusion}"',
          '    gh api "repos/<owner>/<repo>/commits/HEAD/status" --jq ".state"   (vercel posts via commit status, not check-runs)',
          '',
          'Override format: Verification-Override: <rationale; at least ' + MIN_OVERRIDE_RATIONALE_CHARS + ' chars>',
        ].join('\n  '),
      });
    }

    const ciValue = extractValue(ciLines[0], 'CI-Status:');
    const deployValue = extractValue(deployLines[0], 'Deploy-Status:');

    const invalid = [];
    if (!CI_VALUES.has(ciValue)) invalid.push(`CI-Status: "${ciValue}" (allowed: ${[...CI_VALUES].join(', ')})`);
    if (!DEPLOY_VALUES.has(deployValue)) invalid.push(`Deploy-Status: "${deployValue}" (allowed: ${[...DEPLOY_VALUES].join(', ')})`);

    if (invalid.length > 0) {
      return fail({
        message: 'Verification trailer(s) have invalid value(s).',
        remediation: invalid.join('\n  '),
      });
    }

    // PENDING/BUILDING requires a Recheck-Timeline commitment
    if (ciValue === 'PENDING' || deployValue === 'BUILDING') {
      if (!commitMessageHasLine(ctx, 'Recheck-Timeline:')) {
        return fail({
          message: 'PENDING/BUILDING verification state requires a Recheck-Timeline: trailer.',
          remediation: [
            'Add a trailer indicating WHEN you will recheck the status:',
            '    Recheck-Timeline: within 5 minutes of push',
            '    Recheck-Timeline: 2026-05-21 18:30 UTC',
            'A PENDING claim without a recheck commitment makes the operator the observability backstop.',
          ].join('\n  '),
        });
      }
    }

    return pass();
  },
};

function extractValue(line, prefix) {
  return (line.slice(prefix.length).trim().split(/\s+/)[0] || '').toUpperCase();
}

export const skipReasons = {
  notOnMaster: 'post-push verification applies to commits landing on master only',
  notApplicableType: 'commit subject indicates investigation, hotfix, research, conversation, merge, or revert',
  trivial: 'commit too small (single file, <=5 additions) to owe post-push verification attestation',
};
