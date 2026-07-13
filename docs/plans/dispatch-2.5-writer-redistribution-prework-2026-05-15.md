# Dispatch 2.5 Prework: Writer Redistribution

**Date:** 2026-05-15
**Status:** prework only; PAUSE for operator review before redistributing content
**Dispatch:** Redistribute format-specific content and editorial voice from the 814-line archived `environmental-policy-and-innovation` SKILL.md into the 12 writer stubs
**Parent context:** Dispatch 2 PR #117 brought the archived 814-line SKILL.md into git tracking (chore commit) so this dispatch has a stable source

This document is the gating artifact. Three deliverables surface here:

1. **Diff plan per writer** — what content from which lines of the 814-line source moves into which writer
2. **Gap analysis** — content in the source skill that is NOT yet captured in any rule file (potential new rules needed)
3. **Migration approach** — what happens to the source skill file after redistribution (pointer vs delete vs leave as archive)

Operator reviews this document, confirms (or amends), then writer redistribution proceeds. No writer SKILL.md files are modified beyond their current stub state until operator confirmation lands.

## Source-of-truth verification

| Check | Result |
|---|---|
| Source file path | `fsi-app/.claude/skills/_archived/environmental-policy-and-innovation-2026-04-29/SKILL.md` |
| Line count | 814 (operator mandate said 820; minor discrepancy, content is whole) |
| Git tracking | Tracked as of PR #117 chore commit (`54fa972 chore(skill): track archived environmental-policy-and-innovation source`) |
| Original-path SKILL.md | DELETED in PR #117 chore commit (`5ef5092 chore(skill): remove original path; content preserved in _archived/`) |
| User-skills copy | Does not exist (`/mnt/skills/user/...` is a Linux/WSL path; on this Windows system `C:/Users/jason/.claude/skills/environmental-policy-and-innovation/` also does not exist) |

The 814-line file is the only authoritative source. Operator's mandate referenced 820 lines and a `/mnt/skills/user/` path; the actual file is 814 lines at the path above.

## Skill citations (activation-gap experiment)

Per the dispatch's continuation of the activation-gap experiment. Skills read and applied:

| Skill | Path | How applied here |
|---|---|---|
| `rule-cost-weighted-recommendations` | `dotfiles/.claude/skills/rule-cost-weighted-recommendations/SKILL.md` | Four-surface cost frame at bottom. Inheritance cost (#4) is load-bearing here: the writer skills are the editorial integrity contract every regeneration inherits. |
| `rule-cross-reference-integrity` | `dotfiles/.claude/skills/rule-cross-reference-integrity/SKILL.md` | Shapes the gap analysis. Content from the source skill that survives ONLY in a writer file (and not in an inherited rule file) creates the same cross-reference-integrity failure — drift between writer and rule. Hence the gap analysis call-outs below. |
| `rule-source-traceability-per-claim` | `dotfiles/.claude/skills/rule-source-traceability-per-claim/SKILL.md` | Shapes the card-surface diff (writer-summary-card-surface needs to inherit the inline-attribution discipline; the source skill's storage-format section is consistent with this rule). |
| `vocabulary-topic-tags` | `dotfiles/.claude/skills/vocabulary-topic-tags/SKILL.md` | Source skill lines 475-489 (7 Topic Categories) are now superseded by the 14-value canonical list. Redistribution does NOT carry the 7 forward; topic-tag enforcement lives in vocabulary-topic-tags + (pending Dispatch 3) the DB. |
| `vocabulary-compliance-objects` | `dotfiles/.claude/skills/vocabulary-compliance-objects/SKILL.md` | Source skill lines 515-531 redistribute to vocabulary-compliance-objects (already done historically); writers reference the vocab, not duplicate it. |
| `vocabulary-severity-labels` | `dotfiles/.claude/skills/vocabulary-severity-labels/SKILL.md` | Source skill lines 134-142 redistribute here (already done historically); writers inherit, not duplicate. |
| `operational-migration-authoring` | `fsi-app/.claude/skills/operational-migration-authoring/SKILL.md` | Not directly applied; redistribution is a docs/content change, not a schema change. Cited for awareness if any redistribution surfaces a schema requirement (e.g., new YAML emission fields per Section 6.5 in writer-yaml-emission). |
| `operational-backfill-pattern` | `fsi-app/.claude/skills/operational-backfill-pattern/SKILL.md` | Not directly applied; no data backfill in this dispatch. Cited for awareness in case the writer refinements imply a regeneration sweep (they don't, by themselves; regeneration is triggered separately). |

---

## Section 1: Diff plan per writer

For each of the 12 writer stubs, the table below names: current state, source content to add (with line refs), and the shape of the change.

### Writer 1: `writer-regulatory-fact-document` (14 sections, conditional)

**Current state:** Stub with section LIST (lines 36-52 of the writer stub). Each section is named but the per-section guidance is "see archived skill lines 188-303" with a "TO REFINE" note at line 54.

**Source content to add (lines 188-303 of archive):**

| Source lines | Section | Content to inline |
|---|---|---|
| 188-190 | Section 1: Purpose and Scope | Convention notes, regulation identifier + jurisdiction, dates, "which items require legal confirmation" framing |
| 192-194 | Section 2: What the Regulation Is | Plain-language regulation summary, why-applies framing via verticals/modes/lanes/role |
| 196-198 | Section 3: Issues Requiring Immediate Action | 30-day actions, severity labels per [[vocabulary-severity-labels]], action-verb-first framing |
| 200-202 | Section 4: Compliance Chain | Supply-chain roles, transaction-specific role placement, legal-confirmation labels |
| 204-208 | Section 5: Authoritative Guidance (conditional) | Section-by-section synthesis pattern, omitted-with-note when absent |
| 210-223 | Section 6: Anticipated Events (conditional) | Event type taxonomy (implementing act, regulator guidance, court decision, etc.), expected date sourcing, what-updates-when-event-materializes |
| 225-235 | Section 7: Threshold Questions (conditional) | Plain-language threshold + regulatory text + guidance interpretation + workspace application + decided-vs-confirmed |
| 237-241 | Section 8: Substantive Requirements (always; expands/contracts) | Subsection-per-obligation pattern, no-invented-subsections rule |
| 243-253 | Section 9: Product-Specific (conditional) | Per-product material classification, article-specific obligations, current compliance status |
| 255-259 | Section 10: Registration & Reporting | EPR/producer registration, deadline + format + jurisdictional scope, gap-noting when format unpublished |
| 261-263 | Section 11: Operational System Requirements | What workspace must build/modify, gap-from-baseline framing |
| 265-267 | Section 12: Exemptions (conditional) | Exemption + qualifying conditions + evidence required |
| 269-273 | Section 13: Adjacent Research (conditional) | Industry research, alternative compliance approaches |
| 275-284 | Section 14: Timeline | Dated milestones, in-force-as-of vs future-conditional framing |
| 286-297 | Section 15: Sources | Source-type-labeled list |
| 299-303 | Conditional logic explanation | When 8 of 14 is correct (the integrity-honest brief) |

**Shape of change:** Major content expansion. Stub grows from ~93 lines to ~250-300 lines. The "TO REFINE" marker at line 54 is removed. All inherited rule citations (writer stub lines 56-72) stay; section text quotes the source skill's per-section guidance verbatim where it captures the substance compactly, paraphrases where the source skill is verbose.

**Verification (post-redistribution):** A regulation regeneration produces a brief whose section structure matches the source skill's intent. The 8-of-14 honest brief is the correctness test, not the section count.

### Writer 2: `writer-technology-profile` (8 sections)

**Current state:** Stub with section LIST (lines 31-38). Per-section guidance is "archived skill lines 313-346, TO REFINE."

**Source content to add (lines 309-345 of archive):**

| Source lines | Section | Content to inline |
|---|---|---|
| 313-317 | Section 1: What's Being Tested/Deployed | Named-operator activity (not "the industry is moving"), specific deployment scope, results sourced |
| 319-321 | Section 2: Industry Trajectory | Multi-operator vs one-operator framing, regulation/demand/strategy/supplier/capital driver attribution, "table stakes" threshold question |
| 323-325 | Section 3: Supplier Access | Exclusive-vs-multi-vs-open availability, lead times, financing, pilot access |
| 327-329 | Section 4: Operational Fit | By transport mode in workspace priority order; vertical-specific notes |
| 331-333 | Section 5: Competitive Positioning | Contracts at risk vs winnable, named competitors + access status |
| 335-337 | Section 6: Talking Points | Credible-claim language, questions to pose, pitfalls to avoid (overclaiming) |
| 339-341 | Section 7: Time-to-Market + Action | Commercial-availability timeline, commit window, specific procurement/financing/pilot/clause/team-briefing actions |
| 343-345 | Section 8: Sources | Source-type-labeled list |

**Shape of change:** Content expansion. Stub grows from ~65 lines to ~150-180 lines. "TO REFINE" marker at line 40 removed.

### Writer 3: `writer-operations-profile` (8 sections)

**Current state:** Stub with section LIST (lines 27-34). Per-section guidance is "archived skill lines 355-389, TO REFINE."

**Source content to add (lines 351-387 of archive):**

| Source lines | Section | Content to inline |
|---|---|---|
| 355-357 | Section 1: Cost Baseline | Electricity rates, diesel/SAF prices, labor, port handling, drayage. Dated + sourced + trend direction |
| 359-363 | Section 2: Feasibility of Choices | On-site solar, BESS, equipment, in-region sourcing. Each: possible/restricted/prohibited + reason + source |
| 365-367 | Section 3: Cost Comparison | Manual vs automated, on-grid vs solar, owned vs leased, in-region vs import. Breakeven, payback, flip conditions |
| 369-371 | Section 4: Cross-Regional Strategic | How this region's costs shift decisions across the footprint |
| 373-375 | Section 5: Competitive Positioning | Named competitors + their operational footprint |
| 377-379 | Section 6: Talking Points | Regional capability framing for client conversations |
| 381-383 | Section 7: Pending Changes | Regulations under consultation, infrastructure under construction, energy shifts, supplier changes |
| 385-387 | Section 8: Sources | Source-type-labeled list |

**Shape of change:** Content expansion. Stub grows from ~60 lines to ~150-180 lines.

### Writer 4: `writer-market-signal-brief` (8 sections)

**Current state:** Stub with section LIST (lines 31-38). Per-section guidance is "archived skill lines 397-428, TO REFINE."

**Source content to add (lines 391-427 of archive):**

| Source lines | Section | Content to inline |
|---|---|---|
| 397-399 | Section 1: What's Moving + Trigger | Specific signal description, parties involved, trigger event |
| 401-403 | Section 2: Who's Driving + Wants | Named parties, stated interests, leverage, likely strategy (sourced inferences only) |
| 405-407 | Section 3: Expected Trajectory + Conversion Triggers | What converts signal to active rule/commercial pressure, sourced timeline |
| 409-411 | Section 4: Operational + Cost Implications | Concrete consequences filtered by mode/vertical |
| 413-415 | Section 5: Competitive Implications | Beneficiaries, victims, workspace position |
| 417-419 | Section 6: Talking Points | Public posture while still a signal, claims to avoid |
| 421-423 | Section 7: Workspace Action Now | Positioning actions (vendor convos, contract clauses, data tracking, coalition participation); NOT compliance actions |
| 425-427 | Section 8: Sources | Source-type-labeled list |

**Shape of change:** Content expansion. Stub grows from ~63 lines to ~150-180 lines.

### Writer 5: `writer-research-summary` (6 sections)

**Current state:** Stub with section LIST (lines 27-32). Per-section guidance is "archived skill lines 437-460, TO REFINE."

**Source content to add (lines 431-459 of archive):**

| Source lines | Section | Content to inline |
|---|---|---|
| 437-439 | Section 1: What the Research Found | Headline, methodology in brief, scope and limitations |
| 441-443 | Section 2: Why It Matters | Mechanism, filtered by vertical/mode |
| 445-447 | Section 3: What It Changes | Specific decisions (claims, operational choices, anticipation, vendor selection); NOT generic "implications" |
| 449-451 | Section 4: Talking Points | Credible claims, questions to pose, pitfalls to avoid |
| 453-455 | Section 5: What It Does NOT Resolve | Study limits, open questions, related research converging/contradicting |
| 457-459 | Section 6: Sources | Source-type-labeled list, peer review status |

**Shape of change:** Content expansion. Stub grows from ~57 lines to ~130-150 lines.

### Writer 6: `writer-frame-regulations`

**Current state:** Stub with frame concept + example (Norway fjord ZE rule). Process section is "TO REFINE."

**Source content to add:** The source skill does NOT have explicit per-surface frame content; per-surface framing is a NEW architectural primitive from v2 audit Section 6.9. The redistribution work here is:
- Pull the regulatory-frame voice from lines 188-303 (the regulatory fact document; specifically the action-first + cost-impact + jurisdiction + effective-date pattern from Sections 1-3, 11, 14)
- Add concrete card body text patterns for the regulatory frame
- Define the stat tile mapping (Effective, Compliance Deadline, Penalty Range, Owner) and what each draws from

**Shape of change:** Refinement, not expansion. Stub grows from ~62 lines to ~100-120 lines. The "TO REFINE" markers in the Process section get filled.

### Writer 7: `writer-frame-market`

**Current state:** Stub with frame concept + example. Process section is "TO REFINE."

**Source content to add:**
- Pull the competitive-signal voice from lines 309-345 (Technology Profile Sections 1-2, 5) and lines 391-427 (Market Signal Brief Sections 1, 2, 5)
- Add concrete card body text patterns for the market frame (lead-time-driven, competitive-actor-named, cost-of-inaction)
- Define stat tile mapping (Lead Time, Peer Adoption Rate, Cost of Inaction)

**Shape of change:** Refinement. Stub grows from ~52 lines to ~100-120 lines.

### Writer 8: `writer-frame-research`

**Current state:** Stub with frame concept + example. Process section is "TO REFINE."

**Source content to add:**
- Pull the research/horizon voice from lines 431-459 (Research Summary Sections 1, 2, 5)
- Add concrete card body text patterns for the research frame (methodology-labeled, planning-horizon-bounded, convergence/contradiction-aware)
- Define stat tile mapping (Source Institution, Methodology Type, Planning Horizon, Convergence)

**Shape of change:** Refinement. Stub grows from ~50 lines to ~100-120 lines.

### Writer 9: `writer-frame-operations`

**Current state:** Stub with frame concept + example. Process section is "TO REFINE."

**Source content to add:**
- Pull the cost-reality voice from lines 351-387 (Operations Profile Sections 1, 2, 3, 5)
- Add concrete card body text patterns for the operations frame (per-jurisdiction cost, feasibility, payback period)
- Define stat tile mapping (Per-Region Cost, Feasibility, Payback Period, Comparable Regions)

**Shape of change:** Refinement. Stub grows from ~51 lines to ~100-120 lines.

### Writer 10: `writer-summary-card-surface`

**Current state:** Already substantially fleshed out (92 lines). Inherits the integrity non-negotiables. Process section has "TO REFINE."

**Source content to add:**
- The card surface is a NEW concept relative to the source skill (the source skill writes `full_brief`, not card surface fields). The redistribution pulls the card-relevant patterns from:
  - Lines 134-142 (Severity Labels) — already inherited via [[vocabulary-severity-labels]]
  - Lines 705-720 (14 Rules for All Output) — many apply at the card layer; rule 7 ("lead with action, then cost, then who is affected, then why now") is the FSI Brief framework canonical statement and is already inherited via [[rule-fsi-brief-framework]]
  - Lines 722-734 (Storage Format / markdown convention) — applies to the BRIEF body, not the card surface, but the inline-citation pattern (`*Source: [Title], [Issuing Body], [Date]. [URL]*`) belongs at the card layer per [[rule-source-traceability-per-claim]]
- Add concrete card body text patterns (3 sentences: status+action / cost / context+source)
- Add validation checklist (the 4 integrity non-negotiables apply at this surface)

**Shape of change:** Light refinement. Stub grows from ~92 lines to ~120-140 lines. The Process section "TO REFINE" gets filled with the validation steps.

### Writer 11: `writer-yaml-emission`

**Current state:** Already substantially fleshed out (122 lines). Current 13-field contract present. v2 extensions noted as "TO ADD per Section 6.5."

**Source content to add:**
- Lines 736-789 of the source skill are the CURRENT YAML contract; the writer-yaml-emission stub already captures this faithfully. Minimal change here.
- Lines 756-770 (severity→priority lock + format_type derivation) — already inherited via [[vocabulary-severity-labels]] and [[vocabulary-topic-tags]]
- The v2 Section 6.5 extensions (entry_into_force, compliance_deadline, penalty_range, cost_mechanism, enforcement_body, legal_instrument with confidence + span provenance) are correctly identified as TO-ADD pending schema migrations; this prework does NOT add them (no schema yet)

**Shape of change:** Minimal. Stub stays ~122 lines; slight refinement to remove the "TO REFINE" note in the Process section.

### Writer 12: `writer-operator-empty-states`

**Current state:** Already substantially fleshed out (86 lines). The content is driven by audit S3 + Chrome 5.1 findings, not by the source skill directly.

**Source content to add:**
- Lines 22, 36, 178, 728 of the source carry the "honest omission" discipline that informs this writer (sections/tiles omitted when ungrounded; explicit notes when content is missing). The writer stub already inherits this via [[rule-no-speculation-as-fact]].
- The specific empty-state copy in the stub (per-tile replacements) is audit-driven, not source-driven.

**Shape of change:** Minimal. Stub stays ~86 lines; might add a one-line cross-reference to source skill lines 22, 36, 178, 728 for the discipline lineage.

### Summary of writer redistribution work

| Writer | Current state | Source lines absorbed | Final size estimate | Shape |
|---|---|---|---|---|
| writer-regulatory-fact-document | Stub, ~93 lines | 188-303 (115 lines) | ~250-300 lines | Major expansion |
| writer-technology-profile | Stub, ~65 lines | 309-345 (37 lines) | ~150-180 lines | Content expansion |
| writer-operations-profile | Stub, ~60 lines | 351-387 (37 lines) | ~150-180 lines | Content expansion |
| writer-market-signal-brief | Stub, ~63 lines | 397-427 (31 lines) | ~150-180 lines | Content expansion |
| writer-research-summary | Stub, ~57 lines | 437-459 (23 lines) | ~130-150 lines | Content expansion |
| writer-frame-regulations | Stub, ~62 lines | Voice from 188-303 selected | ~100-120 lines | Refinement |
| writer-frame-market | Stub, ~52 lines | Voice from 309-345 + 391-427 | ~100-120 lines | Refinement |
| writer-frame-research | Stub, ~50 lines | Voice from 431-459 | ~100-120 lines | Refinement |
| writer-frame-operations | Stub, ~51 lines | Voice from 351-387 | ~100-120 lines | Refinement |
| writer-summary-card-surface | ~92 lines | Implicit (FSI brief + integrity) | ~120-140 lines | Light refinement |
| writer-yaml-emission | ~122 lines | 736-789 already captured | ~125-130 lines | Minimal |
| writer-operator-empty-states | ~86 lines | Implicit (honest omission) | ~88-90 lines | Minimal |

Total: 5 writers get major content expansion, 4 get refinement, 3 get minimal touch-up.

---

## Section 2: Gap analysis vs existing rule files

Cross-checking each integrity/framing concept in the source skill against the current 11 cross-cutting rule files. The following content from the source skill is NOT yet captured in any rule file. Operator decides per gap: (a) add to an existing rule, (b) author a new rule, (c) embed in writer stubs without a rule (acceptable for genuinely writer-specific content), or (d) leave to the writer redistribution.

### Gap 1: Operating Principle (creative intelligence + accurate grounding)

**Source lines 41-62.** Foundational framing: "The platform actively seeks intelligence beyond what's directly given. ... The agent's mandate: be creative about WHAT to find, conservative about WHAT to claim."

**Current rule coverage:** Not in any rule file. `rule-no-speculation-as-fact` and `rule-no-regulatory-inferences-as-fact` cover the "conservative about what to claim" half. NO rule covers the "creative about what to find" half.

**Recommendation:** Author a NEW rule `rule-creative-discovery-with-accuracy-grounding` (cross-cutting). It is foundational; without it, dispatched agents may default to "only use exactly what's given" and miss the creative-discovery mandate that distinguishes the platform from a static compliance tool.

**Severity:** Medium. The gap is real but the integrity-half is well-covered; missing the creative-half makes agent runs more conservative than the platform intends, but does not produce wrong output.

### Gap 2: Cross-Format Lens Requirement (4 lenses)

**Source lines 91-98.** Every brief, regardless of format, serves four lenses: substantive content / competitive / client-conversation / action.

**Current rule coverage:** Not in any rule file as a dedicated rule. `rule-fsi-brief-framework` (action → cost → context, 3sec/10sec/30sec) is related but different — it is about the action-first ordering, not the four-lens requirement.

**Recommendation:** Author a NEW rule `rule-cross-format-four-lenses` (cross-cutting) OR expand `rule-fsi-brief-framework` to include the four-lens content as a companion section. The four lenses are referenced in every per-format writer (every writer should serve all four where facts permit), so they belong at the rule layer, not duplicated in every writer.

**Severity:** Medium. Without the rule, writers may produce briefs that emphasize one lens (substantive) and neglect others (competitive, client-conversation, action).

### Gap 3: Business Evaluation Framework

**Source lines 114-132.** Cost increase = margin protection (COST ALERT). Regulation delayed = MONITORING/WINDOW CLOSING. Compliance readiness ahead = COMPETITIVE EDGE. Impact filtering by route/mode/vertical.

**Current rule coverage:** `vocabulary-severity-labels` defines the labels but not the EVALUATION framework (when to assign which). `rule-fsi-brief-framework` covers the framing but not the business interpretation.

**Recommendation:** Author a NEW rule `rule-business-evaluation-framework` (cross-cutting) OR expand `vocabulary-severity-labels` with a companion section. The framework is the "why" behind the severity label assignment: a writer that does not internalize "cost increase seen early = margin protection = COST ALERT" may mis-assign severity even when the label vocabulary is correctly enforced.

**Severity:** Medium. The framework directly informs severity assignment; without it, severity labels are correct-by-syntax but possibly wrong-by-substance.

### Gap 4: Cause and Effect Requirement

**Source lines 144-164.** Every data point must have cause + mechanical consequence + effect-by-vertical. "Data without cause and effect is noise. Never output it."

**Current rule coverage:** NOT in any rule file. This is one of the most concrete editorial discipline rules in the source skill. The example chain (SAF mandate → fuel cost → live-events surcharge → artwork surcharge → humanitarian exemption) is the canonical demonstration.

**Recommendation:** Author a NEW rule `rule-cause-and-effect-chain` (cross-cutting). It is the discipline that produces vertical-specific implications (Section 8 of every regulatory fact document, Section 4 of every market signal brief, etc.). Without the rule at the rule layer, the writers each need to encode it, which duplicates the discipline and creates drift risk.

**Severity:** HIGH. This is the editorial discipline that distinguishes a workspace-anchored brief from a generic regulatory summary. Missing this rule means the writers will produce briefs that state facts without their per-vertical consequences.

### Gap 5: Rules for All Output (14 numbered rules)

**Source lines 705-720.** The "14 Rules" enumerate the editorial discipline. Each rule maps to existing files mostly:

| # | Rule text | Current coverage |
|---|---|---|
| 1 | Ground every claim in a source URL | `rule-no-speculation-as-fact` + `rule-source-traceability-per-claim` |
| 2 | Distinguish binding law from guidance from announcement from opinion | `rule-source-tier-hierarchy` |
| 3 | Extract jurisdictions, transport modes, business functions, deadlines, penalties, data requirements | `vocabulary-*` + `reference-*` (extraction-level, distributed) |
| 4 | Apply cause-and-effect chain to every data point | **GAP 4 above** |
| 5 | Filter effects by cargo vertical and transport mode | Partially in `rule-workspace-anchored-output` (workspace-context framing) but not as a discrete rule |
| 6 | Assign severity label to every regulatory/tech/operations/market-signal item where decision pressure exists | `vocabulary-severity-labels` (assignment) + `rule-fsi-brief-framework` (action-first) |
| 7 | Lead with action, then cost, then who is affected, then why now | `rule-fsi-brief-framework` |
| 8 | If cost impact is unknown, say so with a directional range | `rule-no-speculation-as-fact` (directional range pattern) |
| 9 | Never provide legal advice; recommend counsel | `rule-no-regulatory-inferences-as-fact` |
| 10 | Order operational impact by transport mode in workspace priority order | Partially in `rule-workspace-anchored-output`; the mode-ordering specifically is implicit |
| 11 | Integrity rule supersedes all other rules | Implicit (every integrity rule states this) |
| 12 | Workspace-anchored rule supersedes stylistic conventions | `rule-workspace-anchored-output` |
| 13 | Every brief serves four lenses | **GAP 2 above** |
| 14 | Format selected by item_type, not aspirational length | `classifier-page-routing` + `writer-yaml-emission` format_type derivation |

Rules 4, 5, 10, 13 have gap-issues identified above. Rule 11 is implicit and acceptable.

### Gap 6: Workspace profile fields enumeration

**Source lines 100-112.** The 7 workspace profile fields (cargo verticals, transport mode priority, trade lanes, supply chain role per transaction type, products sold, operational baseline, external engagements anonymized).

**Current rule coverage:** `rule-workspace-anchored-output` references these but as a list at the bottom (refined this session). The list IS present.

**Severity:** None. No gap.

### Gap summary

| Gap | Recommendation | Severity |
|---|---|---|
| 1. Operating Principle (creative + accurate) | NEW rule `rule-creative-discovery-with-accuracy-grounding` | Medium |
| 2. Cross-Format Lens Requirement | NEW rule `rule-cross-format-four-lenses` OR expand `rule-fsi-brief-framework` | Medium |
| 3. Business Evaluation Framework | NEW rule `rule-business-evaluation-framework` OR expand `vocabulary-severity-labels` | Medium |
| 4. Cause and Effect Requirement | NEW rule `rule-cause-and-effect-chain` | HIGH |
| 5. (14 Rules subitems 5, 10) | Refine `rule-workspace-anchored-output` to make vertical+mode filtering explicit | Low |
| 6. Workspace profile fields | None | None |

Net: 3-4 new rules + 1 refinement to existing rules, OR 1-2 new rules + 2 expansions of existing rules. Operator chooses the shape.

**Operator decision needed:** for each of Gaps 1, 2, 3, 4, pick:
- (a) Author a new dedicated rule file
- (b) Expand an existing rule
- (c) Embed in writer stubs without a rule layer (acceptable for genuinely writer-specific content; not recommended for cross-cutting discipline)
- (d) Defer

---

## Section 3: Migration approach for the source skill file

The source skill is at `fsi-app/.claude/skills/_archived/environmental-policy-and-innovation-2026-04-29/SKILL.md`. After PR #117 chore commits:

- The archived copy is tracked in git (`54fa972`)
- The original-path file at `fsi-app/.claude/skills/environmental-policy-and-innovation/SKILL.md` is deleted (`5ef5092`)

The operator mandate says: "Convert /mnt/skills/user/environmental-policy-and-innovation/SKILL.md into a 5-10 line pointer to the decomposed structure."

The `/mnt/skills/user/...` path is a Linux/WSL path that does not exist on this Windows system. The user-level Claude skills directory on Windows (`C:/Users/jason/.claude/skills/environmental-policy-and-innovation/`) also does not exist.

**Three options for the pointer:**

### Option A: Re-create the original-path file as a 5-10 line pointer

Restore `fsi-app/.claude/skills/environmental-policy-and-innovation/SKILL.md` with:

```markdown
---
name: environmental-policy-and-innovation
description: SUPERSEDED. Decomposed into rules, vocabularies, references, writers, classifiers, extractors, compute, and operational skills. Original preserved at _archived/environmental-policy-and-innovation-2026-04-29/SKILL.md.
---

# Environmental Policy and Innovation (decomposed)

This skill was decomposed 2026-05-15 into the structure below. Do not load this file; load the relevant sub-skills.

- Cross-cutting rules / vocabularies / references: `../../.claude/skills/` (parent repo's skills folder; see `INDEX.md`)
- Project-specific writers / classifiers / extractors / compute / operational: `./` (this folder; see `INDEX.md`)
- Original 814-line source: `_archived/environmental-policy-and-innovation-2026-04-29/SKILL.md`
```

**Pros:** preserves the original-path identifier as a discoverable redirect. If any dispatched agent has cached references to the original path, they hit the pointer and find their way.

**Cons:** the deletion in PR #117 has to be reverted (the chore commit `5ef5092` already removed the file). Restoring is one commit on top.

### Option B: Leave the deletion as-is; rely on INDEX.md for discovery

The two INDEX.md files (`dotfiles/.claude/skills/INDEX.md` and `fsi-app/.claude/skills/INDEX.md`) already enumerate the decomposed structure and reference the `_archived/` path. The pointer file is redundant when discovery happens via INDEX.md.

**Pros:** simpler. The decomposition is already discoverable via INDEX.md.

**Cons:** if an agent cites the original path in an old prompt, the agent gets a file-not-found and may not know to look at INDEX.md.

### Option C: Create the pointer at a different location

Author a pointer at a path that captures the redirect intent without restoring the original path. Example: `fsi-app/.claude/skills/_archived/POINTER.md` or similar.

**Pros:** explicit redirect; doesn't restore a "live" SKILL.md file.

**Cons:** unclear where agents would look for this; less discoverable than Option A.

**Recommendation:** Option A. The 5-10 line pointer at the original path is the discipline the operator mandate asked for. Restoring is one commit; reverting PR #117's deletion if it has not yet merged is trivial (this dispatch's branch can amend or add a new commit). Choosing Option A means this dispatch's branch carries one additional commit restoring the path with pointer content.

**Operator decision needed:** confirm Option A / B / C.

---

## Section 4: Sequencing for the redistribution itself

When the operator approves this prework, the redistribution executes in this order:

1. **Gap resolution first** (1-4 new rules per operator's Section 2 decisions). New rule files land at `dotfiles/.claude/skills/rule-<name>/SKILL.md`. Cross-cutting INDEX updated.

2. **Writer redistribution** in the order:
   - Per-format writers (5): writer-regulatory-fact-document → writer-technology-profile → writer-operations-profile → writer-market-signal-brief → writer-research-summary
   - Per-surface frames (4): writer-frame-regulations → writer-frame-market → writer-frame-research → writer-frame-operations
   - Card surface + YAML + empty states (3): writer-summary-card-surface → writer-yaml-emission → writer-operator-empty-states

3. **Pointer file landing** (per Decision in Section 3).

4. **INDEX.md updates** if the writer skill descriptions changed materially.

5. **Build verification** is not needed (these are markdown files, no code touched). No `tsc --noEmit` or `next build` step.

6. **Commit per redistribution batch** (one commit per writer OR one commit for all writers, operator preference). Open a PR. Do not merge.

---

## Cost frame (per `rule-cost-weighted-recommendations`)

| Surface | Cost |
|---|---|
| One-time agent work | Medium ($30-100). 12 writer files + 1-4 new rule files + 1 pointer file + INDEX updates. ~2-4 hours wall time at focused pace. |
| Ongoing runtime | Zero. Writer skills are read by dispatched agents at dispatch time; no runtime impact on the live system. |
| Ongoing infrastructure | Zero. |
| Inheritance | VERY HIGH. The 12 writers are the editorial integrity contract every regeneration inherits. Done right, every future brief composes with clean per-format guidance + inherited rules. Done wrong, every future brief inherits a defective contract. This is exactly the inheritance-cost surface the rule warns about. |
| Value frame | Revenue-blocking. The platform's editorial integrity (the difference between "generic LLM rewrites the regulation" and "workspace-anchored brief operator can trust") IS the product. Without filled writer skills, future agent runs default to whatever's in `system-prompt.ts` (which is the pre-decomposition baseline; see Dispatch 2 Gap 1 finding). |
| Manual gate | Not applicable. Markdown text changes only; no money-touching feature added. |

---

## What this dispatch is NOT

- Not a refactor of `parse-output.ts` (already done in Dispatch 2)
- Not a schema migration (no DB changes)
- Not a system-prompt rebuild (the system-prompt.ts at runtime is still baked from the OLD source; the CEP/build-from-skills work was dropped per operator decision)
- Not a content generation pass (no items get re-tagged or re-classified; this is writer-skill content, not item content)
- Not the topic_tags rethink (Dispatch 3)
- Not the three-context execution split, Phase 3 multi-tenant, email integration, source registry hygiene, jurisdictions ingest, or per-surface framing implementation

## Three operator decisions block redistribution

1. **Gap resolution shape (Section 2):** for each of Gaps 1, 2, 3, 4 — new rule file vs expand existing vs embed in writer vs defer
2. **Pointer file (Section 3):** Option A (restore original path with pointer) vs Option B (rely on INDEX) vs Option C (different location)
3. **Commit cadence (Section 4 step 6):** one commit per writer vs one commit for all writers

Standing by for operator review of this prework before any writer SKILL.md is modified, any new rule file is authored, or any pointer file is created. No code changes during the pause.

## Related

- [multi-tenant-foundation-prework-2026-05-15](./multi-tenant-foundation-prework-2026-05-15.md) — Explicitly named as the prework-first discipline this dispatch mirrors
- [skill-refinements-prework-2026-05-15](./skill-refinements-prework-2026-05-15.md) — Same-session skill-decomposition prework; both mirror the prework-first gate and the four-cost-surface / inheritance-cost frame
