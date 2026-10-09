---
name: remediation-discipline
description: Class-over-instance remediation discipline for Caro's Ledge platform engineering. When a problem surfaces, determines whether the failure is class or instance, then chooses remediation accordingly. Class-problem remediations address the class via primitive extraction, codified discipline, and refactor of known adjacent instances. Instance-only patches are appropriate only when the failure is genuinely scope-bounded; otherwise they are anti-pattern. Load on any remediation, post-mortem, hotfix, failure-response, or primitive-extraction dispatch. Provides the class-vs-instance recognition criteria, primitive extraction patterns, discipline codification thresholds, and worked examples from Caro's Ledge platform work. The principle is platform-engineering-agnostic; worked examples are session-specific because that is the available corpus, but the discipline transfers to any platform engineering remediation work. Coordinates with sprint-followups-discipline for cross-dispatch loop closure and named binding rule codification.
when_to_load:
  - "Framed as remediation, post-mortem, hotfix, or failure response"
  - "Investigating a recurring pattern across multiple instances"
  - "Extracting a primitive, library, or shared utility"
  - "Adding a new binding rule to any discipline skill"
  - "Scoping the response to a surfaced bug, regression, or production incident"
---

# Remediation Discipline

## Reference index

Everything not stated in this core moved verbatim, unreworded, to `references/`. Read the file whose trigger fires:
- `references/quarantine-and-regrounding.md`: plan re-grounding, 2.1 quarantine is an open investigation, 2.2 deferred vs undispositioned
- `references/categories-1-17-and-retrieval.md`: section 4 categories 1 to 17, 4.5, 4.6 retrieval before generation and the spend chokepoint
- `references/primitive-extraction-and-codification.md`: sections 5, 5.6 and 6: primitive extraction patterns, status is a cache, codification thresholds
- `references/worked-examples.md`: section 7: worked examples 1 to 7
- `references/anti-patterns-and-cross-references.md`: sections 8 and 10: anti-patterns and cross-references
- `references/categories-18-26.md`: category rules 18 to 26: snapshot-first grounding, no stale execution, referenced-law-exists, re-grounds never destroy, funded-pass lock, mint gates
- `references/categories-27-32.md`: category rules 27 to 32: primary text permanent, executor-agnostic enforcement, target-match, content-gated disposition, harness integrity, propagation gates
- `references/categories-35-43.md`: category rules 35 to 43: row UX at phone width, dates, perf ratchet, paged reads, auth tokens, responsive and style rules, openers
- `references/categories-44-52.md`: category rules 44 to 52: CLI main guard, one home per concept, loop hops, parts not pages, registry as directory, rendering guard, golden isolation, titles
- `references/categories-53-58.md`: category rules 53 to 58: worktree install link, workflow_run chains, clock-derived tests, CLI entrypoints, CSS color construction

BINDING: references/quarantine-and-regrounding.md, read before quarantining, erasing or re-researching an item (section: Section 2.1)
BINDING: references/primitive-extraction-and-codification.md, read before adding or promoting a binding rule (section: Section 6)
BINDING: references/worked-examples.md, read before writing a long-running batch script (section: Example 1)
BINDING: references/worked-examples.md, read before claiming a sweep is complete (section: Example 2)
BINDING: references/worked-examples.md, read before encoding an architecture decision as a skill (section: Example 6)
BINDING: references/categories-18-26.md, read before choosing a citation source at grounding (section: Section 4 - category 24)
BINDING: references/categories-27-32.md, read before capturing or replacing a source document (section: Section 4 - category 27)
BINDING: references/anti-patterns-and-cross-references.md, read before naming another skill in a rule (section: Section 10)

## Section 1: Purpose and Scope

This skill owns the class-over-instance principle, the recognition criteria for distinguishing class from instance failures, the primitive extraction patterns, the discipline codification thresholds, and the worked examples library.

This skill does NOT own domain-specific remediation logic. A credibility-model failure loads `source-credibility-model` alongside this skill; an admin-gating failure loads whatever applies; this skill is the META-DISCIPLINE that determines HOW to scope any remediation. Cross-skill load is additive, not exclusive.

The principle is platform-engineering-agnostic. The worked examples in Section 7 are session-specific because that is the available corpus; the discipline transfers to any platform engineering remediation work in any project (Caro's Ledge today, Pet Pursuit or future projects tomorrow). When this skill ports to another project, the principle and recognition criteria port unchanged; the worked-examples library grows with that project's instances.

## Section 2: The Class-Over-Instance Principle

**Binding statement (verbatim):**

> When a problem surfaces, determine whether the failure is class or instance. Class-problem remediations address the class via primitive extraction, codified discipline, and refactor of known adjacent instances. Instance-only patches are appropriate only when the failure is genuinely scope-bounded; otherwise they are anti-pattern.

Why this matters: ad-hoc instance patches compound. Each batch script discovers connection-pool timeouts the same way. Each sweep dispatch misses items in the same way. Each schema rename breaks consumers the same way. Patching each occurrence as it surfaces costs the same effort per occurrence, multiplied by N occurrences. Class fixes are bounded one-time investment that prevent the failure from recurring across all known and future instances of the class.

The autonomous-loop strategic frame depends on durable resilience primitives. A platform that requires operator intervention on every infrastructure variation cannot operate autonomously. The class-over-instance discipline is how the platform absorbs infrastructure realities instead of failing on them.

## Section 3: Recognition Criteria

When a failure surfaces, evaluate five signals:

1. **Recurrence**: has this pattern surfaced before in any form? (Same root cause, different surface; same failure mode, different consumer.)
2. **Infrastructure-variation cause**: is the root cause something the platform should absorb (timeout, disconnect, rate limit, version drift, tool snapshot inconsistency)?
3. **Shared codepath**: do multiple places use the same broken pattern?
4. **Reinventing-the-wheel signal**: would another agent solving a similar problem rebuild the same patch?
5. **Preservation-argument-against-dispatch**: did an agent OR an operator propose "the existing design already handles this" against an explicit dispatch instruction or explicit caution? When this argument lands, the rationale typically survives only as a docstring or completion-report note — mechanical systems do not detect violations. The architectural decision is implicit, not enforced.

**Threshold rule:**

- 2+ signals fire → treat as class
- 0 signals fire → treat as instance
- 1 signal fires → judgment call surfaced to operator at remediation scoping

The threshold deliberately favors class-treatment when in doubt. Over-codification of one-off failures is cheaper to correct (anti-pattern 3 surfaces it; the rule retracts) than missed-class-treatment of recurring failures (every new instance costs the same patch effort).

**Signal 5 treatment (preservation-argument).** Class fix is to encode the preservation argument as a fitness function or equivalent mechanical check at the same dispatch that surfaced it. Per OBS-62 worked example (Sprint Architecture, 2026-05-20): Phase 1.5 closure proposed preserving the server-centric dual-write design via documentation comments; the rationale was sound, but absent F8 fitness function, future client code could violate the design silently. Same dispatch added F8 + fixed the 2 instances + codified Signal 5 itself. Treatment shape:

1. Recognize the preservation argument when proposing OR receiving it (either agent → operator OR operator → agent direction).
2. Ask: can this argument be mechanically expressed? If yes, encode it as a fitness function (or equivalent). If no, either re-examine whether the argument is actually sound, OR explicitly accept the gap with an OBS entry tracking the residual risk.
3. Land the mechanical check in the SAME dispatch that proposes the preservation argument. Splitting risks the encoding never happening.

The pattern applies symmetrically: agent making a preservation argument against operator dispatch (Phase 1.5 dual-write case), and operator making a preservation argument against agent caution (the REPO_ROOT "no risk" case earlier the same day where operator's confident dismissal of investigation triggered the same pattern, different domain). Both produce documentation-survives-but-no-mechanism gaps. Signal 5 covers both.

## Section 3.5: Investigation discipline (before and during a remediation)

Four principles govern HOW a remediation investigates, learned the hard way on the F1 tier work:

- **Probe-first blast radius.** Before any corpus-affecting write, run a READ-ONLY probe that quantifies the blast radius (how many rows, which items, both directions). Author the fix against the probe's numbers, never against an assumption. The F1 work ran the fake-cert probe, the per-item crosstab, the composition probe — each before a single write — and each overturned the prior estimate (32→30 flips; "all null hosts secondary" killed the registration lever).
- **Stop-and-surface on unstable inputs.** If investigation reveals the inputs to the planned fix are themselves unsound (the per-URL tier rows that made the flip count unstable; the untracked enforcement file), STOP, surface the divergence as findings, and let the operator decide scope — do NOT plow the original plan over contradicting evidence. Stopping is the discipline working, not a failure.
- **Flag-rate is not defect-rate.** A surge of integrity/quarantine flags (the 30 flips, the 220 open data_quality rows) measures the gate DOING ITS JOB, not the platform breaking. Read a flag spike as detection, then triage; never silence the gate to lower the number.
- **Clear-flags-when-satisfied.** A flag/condition that has been satisfied MUST be closed when it is satisfied — a flag that rides handoffs after its cause is gone (the rotation flag that lived for weeks; stale quarantine flags on re-verified items) breeds alarm fatigue and hides the live ones. Closing is part of the fix, not optional cleanup.

## Section 9: When the Principle Doesn't Apply

Genuinely one-off remediations where class-over-instance does not apply:

- **Data anomalies in specific records.** A single source with bad data, a single user account with corrupted state, a single intelligence_item with malformed source_url. Fix the record, not a class.
- **One-time migration artifacts.** Legacy data from before a convention was established. The class no longer exists going forward.
- **Operator-specific configuration edge cases.** Account-scoped setup that doesn't generalize across the user base.
- **Time-bounded issues that will naturally resolve.** Deprecated upstream API in its sunset window; transient infrastructure events from a known platform incident.

Recognition criteria (Section 3) help draw the line. 0 signals fire → instance. The skill is deliberately not overapplied; not every failure is class-shaped.
