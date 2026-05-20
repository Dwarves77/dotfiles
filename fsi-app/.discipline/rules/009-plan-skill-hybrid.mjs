// Rule 009: Plan-skill hybrid
// Source: sprint-followups-discipline § Plan-skill hybrid rule
//
// Trigger: commit is part of a 3+ dispatch coordination. The trigger cannot
//          deterministically detect dispatch counts from a single commit, so it relies on
//          two signals (either suffices):
//            1. Branch name pattern indicates multi-dispatch coordination
//               (track-, phase-, wave-, multi-, coordination, sprint-, plan-)
//            2. Self-attested "Coordination:" line in commit body with N >= 3
// Check:   commit body contains a "Plan-file:" line naming a file under
//          fsi-app/docs/plans/<date>-<name>.md (or repo-root docs/plans/), AND that
//          file actually exists on disk. The existence check uses node:fs.existsSync;
//          relative paths resolve against the repo root (C:/Users/jason/dotfiles).

import { existsSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';
import { pass, fail, skip } from '../lib/result.mjs';
import {
  isApplicableDispatchType,
  commitMessageHasLine,
  commitMessageLines,
} from '../lib/predicates.mjs';
import { getRepoRoot } from '../lib/context.mjs';

// Branch name fragments that signal multi-dispatch coordination. Conservative
// list; the self-attestation pathway picks up coordinations whose branch name
// does not encode the pattern.
const COORDINATION_BRANCH_TOKENS = [
  'track-',
  'phase-',
  'wave-',
  'multi-',
  'coordination',
  'plan-',
];

function branchSignalsCoordination(branchName) {
  if (!branchName) return false;
  const lower = branchName.toLowerCase();
  return COORDINATION_BRANCH_TOKENS.some((tok) => lower.includes(tok));
}

// Self-attestation: line like "Coordination: 3 dispatches" or "Coordination: 5 dispatches (...)"
// returns the parsed dispatch count or null if absent/unparseable.
function parseCoordinationCount(ctx) {
  const lines = commitMessageLines(ctx, 'Coordination:');
  for (const line of lines) {
    const match = line.match(/Coordination:\s*(\d+)\s+dispatch/i);
    if (match) return Number.parseInt(match[1], 10);
  }
  return null;
}

// Resolve a plan-file reference to an absolute path. Accepts:
//   absolute path (used verbatim)
//   relative path (resolved against REPO_ROOT)
//   either fsi-app/docs/plans/... or docs/plans/...
function resolvePlanFilePath(reference) {
  if (isAbsolute(reference)) return reference;
  return resolve(getRepoRoot(), reference);
}

// Extract the plan-file path from a "Plan-file: <path>" line, stripping any
// trailing punctuation, surrounding backticks/quotes, or trailing parenthetical
// commentary.
function extractPlanFileReference(line) {
  const rest = line.slice('Plan-file:'.length).trim();
  // Strip surrounding backticks or quotes
  let cleaned = rest.replace(/^[`'"]/, '').replace(/[`'"]$/, '');
  // Strip trailing parenthetical commentary, e.g. "(authored 2026-05-20)"
  cleaned = cleaned.replace(/\s*\([^)]*\)\s*$/, '').trim();
  // Strip trailing punctuation
  cleaned = cleaned.replace(/[.,;]+$/, '').trim();
  return cleaned;
}

export const rule = {
  id: '009',
  name: 'Plan-skill hybrid',
  description: 'Commits in a 3+ dispatch coordination must cite a plan file under docs/plans/ that exists on disk.',
  ruleSource: 'sprint-followups-discipline § Plan-skill hybrid rule',

  trigger(ctx) {
    if (!ctx.isOnMaster) return false;
    if (!isApplicableDispatchType(ctx)) return false;

    // Self-attested 3+ dispatch coordination wins regardless of branch
    const attested = parseCoordinationCount(ctx);
    if (attested !== null) return attested >= 3;

    // Otherwise fall back to branch-pattern signal
    return branchSignalsCoordination(ctx.branchName);
  },

  check(ctx) {
    const lines = commitMessageLines(ctx, 'Plan-file:');
    if (lines.length === 0) {
      return fail({
        message: 'Multi-dispatch coordination commit missing required "Plan-file:" line in body.',
        remediation: [
          '3+ dispatch coordinations must author a plan file BEFORE the first dispatch fires.',
          'Add a line to the commit body naming the plan file. Format:',
          '  Plan-file: fsi-app/docs/plans/<YYYY-MM-DD>-<coordination-name>.md',
          'Example:',
          '  Plan-file: fsi-app/docs/plans/2026-05-20-q4-batch-resilience.md',
          'If this rule fired incorrectly (e.g. branch name matched coordination token but work is single-dispatch),',
          'attest the dispatch count to override: "Coordination: 1 dispatch (single-dispatch work on this branch)".',
        ].join('\n  '),
      });
    }

    // At least one Plan-file line must reference an existing file
    const references = lines.map(extractPlanFileReference).filter(Boolean);
    if (references.length === 0) {
      return fail({
        message: 'Plan-file line present but no path could be extracted from it.',
        remediation: [
          'Format the Plan-file line as: Plan-file: <path>',
          `Lines found: ${lines.map((l) => `"${l}"`).join(', ')}`,
        ].join('\n  '),
      });
    }

    const missing = [];
    for (const ref of references) {
      const abs = resolvePlanFilePath(ref);
      if (!existsSync(abs)) missing.push({ ref, abs });
    }

    if (missing.length === references.length) {
      // None of the referenced plan files exist
      return fail({
        message: 'Plan-file line(s) reference plan files that do not exist on disk.',
        remediation: [
          'Author the plan file at the referenced path BEFORE referencing it in a commit.',
          'Per `superpowers:writing-plans`, the plan file enumerates the dispatches, names dependencies, and surfaces decision points.',
          `Missing files (resolved against ${getRepoRoot()}):`,
          ...missing.map((m) => `    ${m.ref} -> ${m.abs}`),
        ].join('\n  '),
      });
    }

    // At least one referenced plan file exists; rule satisfied
    return pass();
  },
};

export const skipReasons = {
  notOnMaster: 'plan-skill hybrid rule applies to commits landing on master only',
  notApplicableType: 'commit subject indicates investigation, hotfix, research, conversation, merge, or revert',
  notCoordination: 'commit does not signal 3+ dispatch coordination via branch name or Coordination line',
};

// Exported for tests to exercise individual helpers without going through the full trigger.
export const _branchSignalsCoordination = branchSignalsCoordination;
export const _parseCoordinationCount = parseCoordinationCount;
export const _extractPlanFileReference = extractPlanFileReference;
export const _resolvePlanFilePath = resolvePlanFilePath;
