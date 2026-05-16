---
name: vocabulary-severity-labels
description: Closed vocabulary of 5 values for `intelligence_items.severity`. Mapped to `priority` via locked rule (enforced at parse time on the agent path; needs DB CHECK constraint to be enforced everywhere). Mandatory on every regulatory fact document, market signal brief, technology profile, operations profile.
---

# Vocabulary: severity-labels (closed, 5 values)

## Source

Original `environmental-policy-and-innovation` skill, "Severity Labels" section, plus migration 018 (B.2 brief schema) which introduced the locked severity-to-priority mapping.

## The vocabulary

| Severity | Meaning | Required when |
|---|---|---|
| `ACTION REQUIRED` | The reader needs to do something now | Active compliance window, firm deadline within 30 days |
| `COST ALERT` | Rates or costs are changing | New surcharge, fee, or price change is announced or in force |
| `WINDOW CLOSING` | A deadline or opportunity is expiring | Comment period ending, grant window closing, transition phase ending |
| `COMPETITIVE EDGE` | The reader can get ahead of competitors | Competitor move surfaced before public; capability available before peers adopt |
| `MONITORING` | No action yet but this is moving | Forward-looking signal without immediate decision pressure |

## Business evaluation framework (assignment rationale)

The 5-label vocabulary above defines WHAT labels are valid. This section defines WHEN to assign which — the editorial discipline that produces correct-by-substance assignments, not just correct-by-syntax. Source: original `environmental-policy-and-innovation` skill lines 114-132 (Business Evaluation Framework).

The four evaluation rules:

1. **Cost increase seen early = margin protection.** The reader can price the increase into quotes before the market adjusts. Assign **COST ALERT**. Examples: ETS surcharge escalation, SAF mandate rollout, port handling fee increase, drayage rate hike, CBAM certificate cost.

2. **Regulation delayed or rolled back is normally negative.** Competitors who haven't invested get a free pass to catch up. But the value is knowing before others where to invest time and money when it comes back. Assign **MONITORING** (when delay window is long or open-ended) or **WINDOW CLOSING** (when the rollback is itself time-bound and the window to capture the residual value is closing). Examples: EPA endangerment-finding repeal under APA review (WINDOW CLOSING if litigation timeline visible; MONITORING if open-ended), Article 6 negotiations stalled at COP (MONITORING).

3. **Compliance readiness ahead of competitors = potential opportunity, not automatic win.** Flag it, let the reader decide. Assign **COMPETITIVE EDGE**. Examples: workspace has SAF blending capability before EU mandate effective date; workspace has ISO 14083 emissions reporting before client RFPs require it; workspace has CSDDD due-diligence pipeline before peers.

4. **Decision pressure now = ACTION REQUIRED.** When a deadline within 30 days requires the workspace to make a concrete decision or take a concrete operational step, the label is ACTION REQUIRED regardless of which of the above three patterns the item also fits. ACTION REQUIRED is the urgency label; the other four are the type-of-signal labels.

### Impact filtering (mandatory)

Every regulation's impact depends on route + transport mode + cargo vertical. Never assume one vertical fits all. A regulation affecting ocean lanes is irrelevant to a workspace that only ships by air. Severity assignment respects the filter:

- A SAF mandate is ACTION REQUIRED for an air-primary workspace; MONITORING for an ocean-primary workspace with no air operations.
- A North-American drayage rule is COST ALERT for a workspace with US-CA trade lanes; informational (no severity emitted, urgency_tier=`informational`) for a workspace operating only EU intra-bloc.
- A green-shipping corridor announcement is COMPETITIVE EDGE for an ocean-primary workspace with Asia-Europe lanes; informational for an air-primary domestic-US workspace.

### Three editorial rules that follow from the framework

These are concrete writer-prompt constraints derived from the four evaluation rules:

- **Never present a cost increase as positive.** A SAF surcharge is not "increased adoption of sustainable fuels"; it is a cost the workspace passes through to clients. Label COST ALERT, not COMPETITIVE EDGE.
- **Never list a regulation without saying why the reader should care.** A regulation that has no severity (no decision pressure for the workspace) should not be in the workspace's intelligence feed; if it appears, the writer either assigns a severity (with rationale) or honestly omits the item from the workspace surface entirely.
- **Never lead with background before the action.** Composes with [[rule-fsi-brief-framework]] action-first ordering.

### When severity is genuinely null

41 rows in the current corpus have severity NULL. This is allowed and expected for:
- Background-context items (research findings without decision-pressure implications)
- Items pending operator review where severity assignment requires content judgment the agent declined to make
- Historical items that have aged out of decision-pressure relevance (urgency_tier = `informational`)

When severity is genuinely null, priority must also be null OR set to a default that does not surface on top-priority dashboards (the locked mapping does not apply; the row is flagged as `severity = NULL`).

## The locked severity-to-priority mapping

Enforced at write time:

```
ACTION REQUIRED → CRITICAL
COST ALERT → HIGH
WINDOW CLOSING → HIGH
COMPETITIVE EDGE → MODERATE
MONITORING → LOW
```

The Sonnet 4.6 agent enforces this at parse time (`src/lib/agent/parse-output.ts:258-263`). The audit found 209 of 614 rows violate the mapping (66% agreement) because three other writer paths bypass parse-time validation:
- staged_updates materializer writes priority directly
- Pre-B.2 legacy rows (164 seeded "medium")
- Direct admin SQL

This vocabulary skill defines the mapping; [[rule-cross-reference-integrity]] requires the mapping be enforced by a DB constraint or trigger so future violations are impossible by construction. [[classifier-severity-priority]] is the workflow skill that makes the assignment.

## Rules

1. **Mandatory on regulatory fact documents, market signal briefs, technology profiles, operations profiles.** Optional but encouraged on research summaries when a finding has clear decision-pressure implications.
2. **Exactly one per item where decision pressure exists.** Not multi-valued.
3. **Reflects what is known and sourced**, not what would be known if all sections were filled. A brief that honestly omits sections under [[rule-no-speculation-as-fact]] still emits severity scoped to what is known.
4. **Space-separated form.** "ACTION REQUIRED" not "action_required" not "ActionRequired". Storage and display both use the space-separated form.

## Composition

Used by:
- [[writer-yaml-emission]] — emits severity in the 13-field metadata block
- [[classifier-severity-priority]] — assigns severity and computes priority via the locked mapping
- [[writer-summary-card-surface]] — severity drives which severity pill renders on the card
- [[writer-regulatory-fact-document]] / [[writer-technology-profile]] / [[writer-operations-profile]] / [[writer-market-signal-brief]] — each section's action items carry severity labels

Related:
- [[rule-cross-reference-integrity]] — requires DB-level enforcement of severity-priority mapping
- [[compute-urgency-score]] — priority weight is an input
