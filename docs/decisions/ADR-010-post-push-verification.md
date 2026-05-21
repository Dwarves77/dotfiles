---
id: ADR-010
title: Post-push verification as discipline floor
status: accepted
date: 2026-05-21
scope:
  - "fsi-app/.discipline/rules/015-post-push-verification.mjs"
  - "fsi-app/.discipline/rules/015-post-push-verification.test.mjs"
  - "docs/decisions/ADR-010-post-push-verification.md"
supersedes: null
related:
  - ADR-005
  - ADR-009
---

## Context

The four-layer discipline architecture (ADR-005) closed three observability gaps: attestation rules (Layer 1) catch missing metadata, fitness functions (Layer 2) catch application drift, ADRs (Layer 3) catch contradicted decisions, consistency checks (Layer 4) catch documented-state drift from reality. Layer 5 was framed as "deferred observability" — a future-sprint dashboard. That framing masked a load-bearing gap.

Repeated incidents (2026-05-18 through 2026-05-21):
- The Sprint Architecture commit (2494a74) passed all 14 binding rules locally + on CI but broke the Vercel build. F9 (build-compiles) was added retroactively in a hotfix (5ed34fe). Operator had to detect via deployment notification.
- The Vercel `outputFileTracingRoot` mismatch warning persisted across three commits (f4d4283, ae67887) because Claude Code did not verify Vercel deployment status after pushing each attempt. Operator had to re-report the same warning twice ("still th same error on deployments, audt this to find the true cause").
- The rule 014 parser bug masked C3 drift in CI for two commits (ae67887, ff1bbd9) because Claude Code did not check the CI status of the previously-pushed commit before authoring the next one. Operator had to surface the failure ("failed again...this needs resolved before we move past it").

The pattern: a dispatch reports "complete" on push success, walks away, and the failure surfaces hours later through the operator. The architecture floor allowed work to leave the keyboard in an unverified state and called that "done."

Operator's articulation (2026-05-21): "the architecture floor must include verification of pushed work."

## Decision

Add the 15th binding rule: post-push verification required. Every applicable commit on master (the same applicability gate as rule 010: not merge/revert/investigation/hotfix/research/conversation-only, not trivial) must include two trailers attesting to the verified state of the previously-pushed commit (the parent):

- `CI-Status: PASS | FAIL | PENDING | BOOTSTRAP | N/A`
- `Deploy-Status: READY | ERROR | BUILDING | BOOTSTRAP | N/A`

Values and what they assert about the parent commit:
- `PASS` / `READY`: verified green via `gh api .../check-runs` (CI) and `.../status` (Vercel posts as commit status, not check-run).
- `FAIL` / `ERROR`: verified red; this commit addresses the failure (the body should cite remediation).
- `PENDING` / `BUILDING`: not yet complete; an accompanying `Recheck-Timeline:` trailer is required.
- `BOOTSTRAP`: the first commit creating or amending the verification rule itself (no prior verified state exists).
- `N/A`: non-deploying context (rare; explain in body).

Override mechanism (consistent with rules 13 + 14): `Verification-Override: <rationale of at least 10 chars>` skips both trailer requirements but surfaces in audit. Recurring overrides indicate the rule needs revision, not that the operator should keep accepting unverified pushes.

Why a chain of attestation rather than direct inspection of the new commit's own post-push state: at commit-msg time the proposed commit hasn't been pushed yet; its own CI/Vercel status cannot exist. What CAN be verified is that the parent commit (already on origin/master) reached a known good state before this new commit was authored. The chain forms a moving front of verified history.

## Consequences

- Dispatches that push and walk away no longer satisfy the architecture floor. Either the next commit confirms the prior was green, or the operator sees an explicit FAIL/PENDING attestation requiring a recheck commitment.
- Verification cost is small but real: one `gh api .../check-runs` call plus one `gh api .../status` call per dispatch. The cost is paid by the dispatcher, not the operator.
- The chain is moving-front, not retrospective. Old commits do not get retroactive trailers; the verified history starts at ADR-010's bootstrap commit.
- `Verification-Override` exists for genuine context-window-exhausted or tooling-unavailable cases (e.g., gh-not-installed in a containerized agent) but must surface a rationale so the operator can decide whether to extend the rule's escape hatches.
- ADR-005's Layer 5 framing is updated in-place: Layer 5a (this rule) is the minimum verification floor and lands now; Layer 5b (dashboard + drift detection across many dispatches) remains deferred as the genuine future polish.

## Alternatives Considered

- **No rule; operator continues as backstop**: rejected. The pattern was already costing the operator multiple corrective interactions per week. The architecture floor's job is to absorb that cost.
- **Active CI/Vercel polling at commit-msg time on the proposed commit**: rejected. The new commit has not been pushed; no status exists to query. Polling the parent works but is what the attestation-trailer approach already encodes more cheaply (the dispatcher does the query once and writes the result down).
- **Single trailer combining both states**: rejected. CI and Vercel have independent failure modes (rule 014 surfaced CI-only failures; ADR-005's earlier reframing surfaced Vercel-only failures). Separate trailers track separate signals.
- **Universal trigger (every commit, including trivial)**: rejected. Trivial commits (single file, <=5 additions) have the same trivial-skip rule as rule 010; the cost of verification on every README typo exceeded the benefit. The threshold can be tightened later if trivial-commit deploy failures appear.
- **Add a third trailer for deployment URL**: deferred. The `gh api .../status` response already includes `target_url` pointing to the Vercel deployment; reading that during verification is sufficient. If audit-time deployment-URL lookup becomes burdensome, add it as a follow-up.

## References

- Sprint Foundation + Sprint Architecture + ADR System + Layer 4 + ADR-008 resolution + worktree cleanup + Vercel mismatch + rule 014 parser hotfix (the sequence of dispatches that surfaced this gap)
- ADR-005 (discipline enforcement layered architecture; Layer 5 reframing)
- ADR-009 (ADR system architecture; supplies the override-trailer pattern)
- sprint-followups-discipline SKILL.md (the binding-rule list; 15th rule section added in this dispatch)
