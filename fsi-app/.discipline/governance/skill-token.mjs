// Skill-load detection primitive — the pure matcher the PreToolUse skill gate uses to decide whether a
// governing skill was DELIBERATELY loaded this session. Extracted from pretooluse-skill-gate.mjs so the
// matching logic is unit-testable WITHOUT running the side-effectful hook (which reads stdin + exits).
//
// "Looked at" == a deliberate `Skill` tool invocation THAT RESOLVED SUCCESSFULLY this session. The
// transcript (a JSONL of session messages) serializes each invocation as a `tool_use` block
//   {"type":"tool_use","id":"toolu_...","name":"Skill","input":{"skill":"<value>"}}
// paired with a later `tool_result` block referencing that id
//   {"type":"tool_result","tool_use_id":"toolu_...","is_error":<bool>, ...}
// where <value> is EITHER the bare slug (e.g. "sprint-followups-discipline") OR a DIRECTORY/worktree-SCOPED
// name the harness registers (e.g. "dotfiles/fsi-app:sprint-followups-discipline").
//
// RESOLUTION REQUIREMENT (dormant-systems audit G-12 / operator ruling R4, 2026-07-18): a Skill invocation
// counts ONLY if its tool_result is NOT an error. Session D proved the prior matcher accepted an ERRORING
// invocation (an "Unknown skill" result) exactly as it accepted a successful one — it checked that the
// tool_use SHAPE appeared, never that the skill actually loaded. The gate's own doctrine says the skill must
// be "looked at, not just having it in context"; an errored invocation is not looked at. So a Skill tool_use
// with is_error:true (or with no result at all — in-flight / not-yet-resolved) does NOT satisfy the gate.
//
// Strictness preserved from the prior matcher: a PASSIVE prose mention of the slug does NOT count (only a
// real `tool_use` block does); a DIFFERENT skill that merely ends in the slug's characters without a ':'
// scope boundary does NOT count ("foo-remediation-discipline" is not "remediation-discipline"); and the slug
// is compared by exact string identity (bare or ':'-scoped suffix), never as a regex, so a slug containing
// regex-special characters matches literally.

/** Does an `input.skill` value name `slug` — bare, or as a ':'-terminated directory/worktree scope suffix? */
function scopedMatchesSlug(value, slug) {
  return typeof value === "string" && (value === slug || value.endsWith(":" + slug));
}

/** Recursively collect every tool_use and tool_result block from a parsed transcript-line object, at any
 *  nesting depth (message.content arrays, bare content arrays, future shapes). */
function collectBlocks(node, uses, results) {
  if (Array.isArray(node)) {
    for (const child of node) collectBlocks(child, uses, results);
    return;
  }
  if (node && typeof node === "object") {
    if (node.type === "tool_use" && typeof node.id === "string") uses.push(node);
    else if (node.type === "tool_result" && typeof node.tool_use_id === "string") results.push(node);
    for (const key of Object.keys(node)) collectBlocks(node[key], uses, results);
  }
}

// True iff a Skill tool_use for `slug` (bare OR scoped) appears in the transcript AND its tool_result
// resolved successfully (is_error !== true). An errored or result-less invocation returns false.
export function skillLoadedInTranscript(transcript, slug) {
  if (!transcript || !slug) return false;

  const uses = [];
  const results = [];
  for (const line of String(transcript).split(/\r?\n/)) {
    const s = line.trim();
    if (!s) continue;
    let obj;
    try { obj = JSON.parse(s); } catch { continue; }
    collectBlocks(obj, uses, results);
  }

  // Map each resolved tool_use_id → whether its result was an error. Presence in the map = a result exists.
  const erroredById = new Map();
  for (const r of results) erroredById.set(r.tool_use_id, r.is_error === true);

  for (const u of uses) {
    if (u.name !== "Skill" || !scopedMatchesSlug(u?.input?.skill, slug)) continue;
    // Counts only when a result EXISTS for this invocation AND that result is not an error.
    if (erroredById.has(u.id) && erroredById.get(u.id) === false) return true;
  }
  return false;
}

// Given a transcript and a list of required slugs, return the subset that are NOT loaded (unresolved).
export function missingFromTranscript(transcript, slugs) {
  return slugs.filter((s) => !skillLoadedInTranscript(transcript, s));
}
