// ACTING-AGENT TRANSCRIPT resolution primitive. Pure, dependency-free, testable in isolation.
//
// WHY THIS EXISTS (2026-09-19, after lane M3's writes were wrongly denied on 2026-09-20 00:55 UTC).
// The PreToolUse hook payload's own `transcript_path` field names the PARENT session's transcript file
// even when the tool call happens inside a sub-agent (Claude Code hooks reference, "Common Input Fields":
// one `transcript_path` per session; a sub-agent call additionally carries `agent_id` and `agent_type`,
// but no separate transcript-path field). Empirically, under this platform's per-user Claude projects
// directory (a `.claude/projects/` tree under the invoking user's home directory, resolved at runtime,
// never hardcoded here), a sub-agent's own tool_use/tool_result blocks are written ONLY to a sibling file
// `<parent-transcript-dir>/<parent-transcript-basename>/subagents/agent-<agent_id>.jsonl`
// (every line there carries `"isSidechain":true`) and NEVER appear in the parent's own top-level file
// (0 sidechain lines found there across two sampled sessions). So a gate that always reads
// `payload.transcript_path` can never see a sub-agent's `Skill` tool_use, no matter how many times the
// sub-agent loads the skill. That is the exact deadlock lane M3 hit.
//
// The fix: when the payload identifies a sub-agent (`agent_id` present), resolve to THAT agent's own
// transcript file instead of the parent's. A main-session call (no `agent_id`) is unaffected.
import { dirname, basename, extname, join } from "node:path";

/**
 * Resolve the transcript file the gate should judge for THIS tool call.
 *   - No `agentId` (main-session call): the payload's own `transcriptPath`, unchanged.
 *   - `agentId` present (a sub-agent call): the derived sibling path
 *     `<dir>/<basename-without-ext>/subagents/agent-<agentId>.jsonl`, since the sub-agent's own
 *     Skill tool_use never lands in the parent's file (see module header).
 * Returns "" when there is nothing to resolve (no transcriptPath at all), so callers can fall back to
 * the existing no-transcript fail-closed path unchanged.
 */
export function resolveActingTranscriptPath(transcriptPath, agentId) {
  if (!transcriptPath) return "";
  if (!agentId) return transcriptPath;
  const dir = dirname(transcriptPath);
  const base = basename(transcriptPath, extname(transcriptPath));
  return join(dir, base, "subagents", `agent-${agentId}.jsonl`);
}
