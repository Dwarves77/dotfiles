---
id: ADR-032
title: The skill gate judges the acting agent's own transcript; a parent's skill load does not count for a sub-agent
status: accepted
date: 2026-09-20
scope:
  - "fsi-app/.discipline/governance/pretooluse-skill-gate.mjs"
  - "fsi-app/.discipline/governance/agent-transcript.mjs"
  - "fsi-app/.discipline/governance/skill-map.mjs"
  - "docs/dispatches/lane-briefs/ (every brief for a lane that edits a governed path)"
supersedes: []
related:
  - "docs/dispatches/lane-briefs/2026-09-19/brief-g1.md"
  - "docs/ops/session-log.md (2026-09-19 coordinator entry, night)"
---

# ADR-032: the skill gate judges the acting agent

## Context

On 2026-09-19 the PreToolUse skill gate denied eleven Edit and Write calls by lane M3 (a sub-agent) on a governed path, although the lane had invoked the governing skill twice. The gate's header said PreToolUse does not fire inside sub-agents; that was true when verified on 2026-06-07 and is false now. The hook was handed the PARENT session's transcript, where a sub-agent's Skill call never appears, so the demand could not be met from inside a lane. The coordinator did not unblock it by loading the skill in its own session: that would have made a parent's load count for work the parent did not do.

## Decision

1. The gate resolves the transcript of the agent that is making the call and judges that transcript (lane G1, PR #754, squash `cc038a47`, merged 2026-09-20 02:12:49 UTC). Fail closed is kept: no transcript, no write.
2. A skill loaded by the parent session does not satisfy the gate for a sub-agent, and the reverse. The agent that writes governed content looks at the governing skill itself.
3. Every brief for a lane that edits a governed path (`skill-map.mjs` names them; today `fsi-app/scripts/turns/` and `fsi-app/src/lib/intake/` under `environmental-policy-and-innovation`) makes the Skill load the lane's first tool call. A denial after a successful load is a STOP, never a retry loop.
4. Sessions run the MAIN checkout's copy of the gate, so a gate change is live only after merge plus vault sync.

## Consequences

Stale statements of the old behaviour are corrected in place, dated (lane M3b: `worktree-isolation.mjs`, the remediation-discipline skill). Proven by attack in `agent-transcript.test.mjs`: once an agent id is given, the resolver never falls back to the parent's transcript path.
