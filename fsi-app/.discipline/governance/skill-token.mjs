// Skill-load detection primitive — the pure matcher the PreToolUse skill gate uses to decide whether a
// governing skill was DELIBERATELY loaded this session. Extracted from pretooluse-skill-gate.mjs so the
// matching logic is unit-testable WITHOUT running the side-effectful hook (which reads stdin + exits).
//
// "Looked at" == a deliberate `Skill` tool invocation, serialized in the transcript as the tool_use shape
//   "name":"Skill","input":{"skill":"<value>"
// where <value> is EITHER the bare slug (e.g. "sprint-followups-discipline") OR a DIRECTORY/worktree-SCOPED
// name the harness now registers (e.g. "dotfiles/fsi-app:sprint-followups-discipline" or
// "dotfiles/.claude/worktrees/agent-xxx/fsi-app:sprint-followups-discipline"). The gate greps the BARE slug
// before this fix, so a legitimately-loaded SCOPED skill went undetected and the gate wrongly DENIED.
//
// Strictness preserved: the match MUST occur inside the `"name":"Skill","input":{"skill":"..."` tool_use
// shape (a passive mention of the slug in prose does NOT count — that is the workaround the gate forbids),
// and a DIFFERENT skill that merely ends in the slug's characters without a ':' scope boundary does NOT
// count (e.g. "foo-remediation-discipline" is not "remediation-discipline").

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// True iff a deliberate Skill tool_use for `slug` (bare OR scoped) appears in the transcript text.
// Scoped form: any non-quote prefix ending in ':' (covers "<dir>/<pkg>:" and worktree-prefixed variants).
export function skillLoadedInTranscript(transcript, slug) {
  if (!transcript || !slug) return false;
  const re = new RegExp('"name":"Skill","input":\\{"skill":"(?:[^"]*:)?' + escapeRegExp(slug) + '"');
  return re.test(transcript);
}

// Given a transcript and a list of required slugs, return the subset that are NOT loaded.
export function missingFromTranscript(transcript, slugs) {
  return slugs.filter((s) => !skillLoadedInTranscript(transcript, s));
}
