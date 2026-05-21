// Shared predicates for rule trigger and check functions.
// Wave 1 agents: if you need a predicate not listed here, surface in your dispatch report.
// Do NOT add to this file from a Wave 1 worktree; main session integrates in Wave 2.

// ===========================================================================
// Commit message predicates
// ===========================================================================

// True if the commit BODY (post-subject, post-blank-line) contains any line
// whose first non-whitespace characters start with the given prefix.
// Used by rules 8 (Loop-closure:) and 11 (Inventory-emission:).
export function commitMessageHasLine(ctx, prefix) {
  if (!ctx.commitBody) return false;
  const lines = ctx.commitBody.split(/\r?\n/);
  return lines.some((line) => line.trimStart().startsWith(prefix));
}

// Returns the matching lines (trimmed of leading whitespace).
export function commitMessageLines(ctx, prefix) {
  if (!ctx.commitBody) return [];
  return ctx.commitBody
    .split(/\r?\n/)
    .map((line) => line.trimStart())
    .filter((line) => line.startsWith(prefix));
}

// True if the full commit message (subject + body) matches the regex.
export function commitMessageMatches(ctx, regex) {
  return regex.test(ctx.commitMessage);
}

// True if the commit SUBJECT (first line) matches the regex.
export function commitSubjectMatches(ctx, regex) {
  return regex.test(ctx.commitSubject);
}

// ===========================================================================
// File predicates
// ===========================================================================

// Filter staged files by a simple pattern. Pattern semantics:
//   '**/foo.bar' or 'foo.bar'       suffix match on filename
//   'dir/'                          path starts with 'dir/'
//   'dir/**/file.ts'                path starts with 'dir/' AND ends with '/file.ts'
//   'dir/**/*.ts'                   path starts with 'dir/' AND ends with '.ts'
//   'exact/path/file.ts'            exact path match
// Lightweight by design; for complex globs, write a dedicated predicate.
export function filesMatching(ctx, pattern) {
  return ctx.stagedFiles.filter((f) => matchesPattern(f.path, pattern));
}

export function hasFileMatching(ctx, pattern) {
  return filesMatching(ctx, pattern).length > 0;
}

function matchesPattern(path, pattern) {
  const normalized = path.replaceAll('\\', '/');
  const pat = pattern.replaceAll('\\', '/');

  // dir/**/*.ext
  const dirGlobExtMatch = pat.match(/^(.+\/)\*\*\/\*\.(.+)$/);
  if (dirGlobExtMatch) {
    const [, dir, ext] = dirGlobExtMatch;
    return normalized.startsWith(dir) && normalized.endsWith('.' + ext);
  }

  // dir/**/filename.ext
  const dirGlobFileMatch = pat.match(/^(.+\/)\*\*\/(.+)$/);
  if (dirGlobFileMatch) {
    const [, dir, suffix] = dirGlobFileMatch;
    return normalized.startsWith(dir) && (normalized.endsWith('/' + suffix) || normalized === dir + suffix);
  }

  // **/filename
  if (pat.startsWith('**/')) {
    const suffix = pat.slice(3);
    return normalized.endsWith('/' + suffix) || normalized === suffix || normalized.endsWith(suffix);
  }

  // dir/
  if (pat.endsWith('/')) {
    return normalized.startsWith(pat);
  }

  // *.ext at any depth (no slash in pattern)
  if (pat.startsWith('*.')) {
    return normalized.endsWith(pat.slice(1));
  }

  // Exact match
  return normalized === pat;
}

// Exported for tests.
export const _matchesPattern = matchesPattern;

// ===========================================================================
// Composite predicates
// ===========================================================================

// True if the commit qualifies as a SUBSTANTIAL dispatch per rule 11's definition.
// Heuristics from commit-time evidence (file changes + message). Self-attestation
// override via `Substantial: no` line is honored for edge cases.
export function isSubstantialDispatch(ctx) {
  // Operator-attested override
  if (commitMessageHasLine(ctx, 'Substantial: no')) return false;
  if (commitMessageHasLine(ctx, 'Substantial: yes')) return true;

  // Size threshold
  if (ctx.totalFilesChanged > 5) return true;

  // Surface-specific triggers
  if (hasFileMatching(ctx, '**/SKILL.md')) return true;
  if (hasFileMatching(ctx, 'fsi-app/supabase/migrations/')) return true;
  if (hasFileMatching(ctx, 'fsi-app/src/app/api/**/route.ts')) return true;
  if (hasFileMatching(ctx, '**/vercel.json')) return true;
  if (hasFileMatching(ctx, 'fsi-app/.discipline/')) return true;
  if (hasFileMatching(ctx, 'docs/inventories/')) return true;
  if (hasFileMatching(ctx, 'docs/design-principles.md')) return true;

  // OBS entry change: any followups doc touch with sufficient lines added
  const followupsFiles = filesMatching(ctx, 'docs/sprint-1/followups.md').concat(
    filesMatching(ctx, 'docs/sprint-2/followups.md'),
    filesMatching(ctx, 'docs/sprint-3/followups.md')
  );
  if (followupsFiles.some((f) => f.additions >= 10)) return true;

  return false;
}

// True if the dispatch type qualifies for OBS-coverage and DP-compliance rules.
// FALSE for investigation-only, hotfix, research-only, conversation-only, merge, revert.
export function isApplicableDispatchType(ctx) {
  if (ctx.isMergeCommit) return false;
  if (ctx.isRevertCommit) return false;
  if (isInvestigationOnly(ctx)) return false;
  if (isHotfix(ctx)) return false;
  if (isResearchOnly(ctx)) return false;
  if (isConversationOnly(ctx)) return false;
  return true;
}

export function isInvestigationOnly(ctx) {
  return /^(audit|investigation|discovery|explore|inspect):/i.test(ctx.commitSubject);
}

export function isHotfix(ctx) {
  if (!/^hotfix:/i.test(ctx.commitSubject)) return false;
  // Hotfix must be narrowly scoped to qualify for skip; large hotfixes still owe closure
  return ctx.totalFilesChanged <= 2;
}

export function isResearchOnly(ctx) {
  return /^research:/i.test(ctx.commitSubject);
}

export function isConversationOnly(ctx) {
  if (!/^(docs|conversation|status|notes):/i.test(ctx.commitSubject)) return false;
  // Only true conversation: no code touched
  return !ctx.stagedFiles.some((f) => /\.(ts|tsx|mjs|js|sql|json)$/.test(f.path));
}

// ===========================================================================
// Inventory-surface mapping (for rule 11)
// ===========================================================================

// Returns the list of inventory types the commit touched. Each maps to a
// docs/inventories/<type>.md file that rule 11 expects to be mentioned in the
// Inventory-emission lines.
export function touchedInventorySurfaces(ctx) {
  const surfaces = new Set();

  if (hasFileMatching(ctx, 'fsi-app/.claude/skills/')) surfaces.add('skills');
  if (hasFileMatching(ctx, 'fsi-app/src/app/api/**/route.ts')) surfaces.add('routes');
  if (hasFileMatching(ctx, 'fsi-app/supabase/migrations/')) surfaces.add('migrations');
  if (hasFileMatching(ctx, '**/vercel.json')) surfaces.add('cron-jobs');
  if (hasFileMatching(ctx, 'fsi-app/src/components/')) surfaces.add('components');
  if (hasFileMatching(ctx, 'fsi-app/.discipline/')) surfaces.add('discipline');
  if (hasFileMatching(ctx, 'docs/decisions/')) surfaces.add('decisions');

  // OBS-status: significant changes to followups docs imply OBS state change
  const followupsTouched = ['docs/sprint-1/followups.md', 'docs/sprint-2/followups.md', 'docs/sprint-3/followups.md']
    .some((p) => hasFileMatching(ctx, p));
  if (followupsTouched) surfaces.add('obs-status');

  return Array.from(surfaces);
}
