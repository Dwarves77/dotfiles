# What has been missing from the analysis — skill vs. runtime delta (2026-08-09)

Operator question: the skills were built to make the analysis the best that exists; if the runtime never
used them, what nuance has been missing, was each skill needed, and how do we add it back? Method: three
deep readers, one per analysis skill, comparing the full SKILL.md against the runtime hand-encoding; the
headline finding independently re-verified by grep. Rule-14 status tokens throughout. The runtime does NOT
load skill files (serverless constraint, `src/lib/llm/skill-loader.ts:14`); it applies hand-encoded logic,
so the question is whether that encoding is faithful+complete or a subset/diverged.

## Verdict, plainly

Neither easy answer is true. NOT "everything's fine" — there is a confirmed HIGH-impact hole. NOT "the
skills were never used" — the runtime re-encoded ~80% of the analytical intent and EXPANDED the grounding/
integrity discipline beyond the skills (claim-provenance FACT/ANALYSIS/LEGAL gate, figure/unit attachment,
qualification capture). The deficit is specific and named below.

## Confirmed deltas (what generation actually omitted)

1. **Workspace anchoring never reached generation** [HIGH · CONFIRMED]. `system-prompt.ts:78-88` has a whole "## Workspace profile (runtime input)" block instructing the model to read verticals/modes/lanes/products/baseline and "filter every claim through them." The actual user message (`canonical-pipeline.ts:745`, `synthesiseAndWriteBrief`) is `Generate the ${item_type} brief for: "${title}"` + format directives — **no profile block**, and grep finds zero reads of `workspace_settings`/verticals/modes in the generation path. The model is promised a profile it is never given. Effect: every brief is rigorous-but-generic where it should be workspace-specific — the core value proposition. This is the biggest miss and it is a pure wiring gap (instructed, never fed).

2. **Forward-participation pathway lost to a pinned contract** [HIGH · CONFIRMED]. analysis-construction-spec v2.2's Forward-Intelligence point 5 (how the workspace enters an open trial/consortium/consultation, the window, the edge of joining before rivals) is absent; the runtime encodes points 1-4 only, and the contract is frozen at the hardcoded string `regeneration_skill_version "2026-05-27"` (`system-prompt.ts:283,407`) — pre-v2.2. The proactive, act-before-competitors layer never shipped.

3. **Cross-surface direction — "No-Vacuum consume"** [MED-HIGH · CONFIRMED]. Sections must draw direction from their linked item on another surface (a market signal's conversion trigger IS a named regulation). The runtime emits the intersection fields but never instructs consuming them in prose.

4. **Dispute-aware prose** [MED · CONFIRMED]; **dynamic effective_tier decay-demotion** [MED · CONFIRMED — the daily continuous recompute was reduced to an incremental one-tier bump, over-cited stale sources never decay back]; **anticipated-event auto-refresh loop** [MED · UNCERTAIN]; per-decision-point severity, priority-source-registry hand-off, keyword-heuristic impact scores, unprompted `trajectory_points` [LOW].

## Per-skill: needed? keep/cut

- **environmental-policy-and-innovation** — the core. Faithful-and-expanded (~85%). KEEP; re-sync (delta #1 is its hole). Needed: yes.
- **analysis-construction-spec** — faithful-partial (~70-75%), pinned pre-v2.2. KEEP; bump runtime to current (deltas #2,#3). Needed: yes. (Per-section grounding models are defensibly over-engineered at this scale — not rebuilding.)
- **source-credibility-model** — faithful (~85-90%); the FACT-grounding moat is fully wired + adversarially guarded. KEEP; tier decay-demotion is a minor later enhancement. Needed: yes.
- **caros-ledge-platform-intent** — routing faithfully encoded (single SoT `surface-of.mjs`); its one gap (per-page read-quality enforcement) is an operator-ruled enforcement-to-build, not silent. KEEP; refresh stale "broken-state" text. Needed: yes.
- **caros-ledge-surface-contracts** — REDUNDANT. Its capability (PI-5 five-surface scope test) is implemented, fixture-enforced, execution-wired, and its text is duplicated verbatim in platform-intent. **CUT** — deleting degrades no analysis.
- **remediation-discipline, sprint-followups-discipline** — DEV-process skills, correctly not in runtime. KEEP for dev.

## Plan (decided — three tracks)

**Track 1 — Runtime fixes (every future brief best-in-class). Code PR.**
1. Wire the workspace profile into `synthesiseAndWriteBrief`'s user message from `workspace_settings` (the prompt already expects it — feed it). Highest leverage, surgical.
2. Bump the contract past the frozen `"2026-05-27"` string to current; add Forward-Intelligence point 5.
3. Add the No-Vacuum consume instruction (sections cite their cross-surface linked item).
4. (batch) dispute articulation, per-decision-point severity.

**Track 2 — Skill↔code drift gate. Code + CI.**
A check that the runtime contract version is not behind the skill and that each SKILL.md's binding sections are reflected in the encoding; CI fails on lag. The code executes, but the skill becomes the enforced source of truth for it — closes the class that let the frozen string persist.

**Track 3 — Corpus regeneration (the honest hard part).**
Existing verified briefs are the pre-upgrade generic version (sound grounding, 0 validation failures, but no anchoring/forward depth). Best-in-class requires REGENERATION — which produces new analysis prose the $0 re-grounding path cannot. Decision: regenerate via in-session authoring at $0 (paid Sonnet rejected per the standing ruling), prioritized by reader value (verified regulations/frameworks first), piloted + measured — the Decision-3 engine at expanded scope.

## Accountability

Found before (OBS-27 "zero platform skill loading"; the 2026-05-20 skill audit). The prior fixes patched
dev-process skill-loading and the Assistant subset, never asking whether generation applied the full skill,
and nothing guarded the skill→code compilation. Track 2 is the structural fix so there is no third time.
