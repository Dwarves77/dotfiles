// Shared predicates for rule trigger and check functions. Post-slim 2026-05-21:
// only the helpers consumed by surviving rules (012, 014) remain.

// ===========================================================================
// Commit message predicates
// ===========================================================================

// Returns the matching lines (trimmed of leading whitespace).
// Used by rule 014 to parse Consistency-Override: trailers.
export function commitMessageLines(ctx, prefix) {
  if (!ctx.commitBody) return [];
  return ctx.commitBody
    .split(/\r?\n/)
    .map((line) => line.trimStart())
    .filter((line) => line.startsWith(prefix));
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
  if (ctx.stagedFiles.some((f) => /\.(ts|tsx|mjs|js|sql|json)$/.test(f.path))) return false;
  // Inventory updates assert state and are NOT conversation-only (per rule 014 + ADR-005 Layer 4)
  if (ctx.stagedFiles.some((f) => f.path.replaceAll('\\', '/').startsWith('docs/inventories/'))) return false;
  return true;
}

