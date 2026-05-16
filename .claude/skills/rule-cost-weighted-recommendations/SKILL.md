---
name: rule-cost-weighted-recommendations
description: Every architectural recommendation, dispatch proposal, sequencing plan, or skill change must explicitly weigh four cost surfaces against value impact before being presented. Cost-blind output is a failure mode. Applies across projects (Caro's Ledge, Pet Pursuit, Plow Louise, others). Each project pairs this rule with its own reference-<project>-economics for actual numbers.
---

# Rule: Cost-weighted recommendations

## What this rule requires

Every architecture recommendation, dispatch proposal, sequencing plan, or skill change names FOUR cost surfaces against THREE value frames before being adopted. Cost-blind output is incomplete and gets returned for cost analysis before going forward.

The four surfaces are listed in order of how directly they appear in a checking-account statement; the fourth costs nothing in dollars yet is the highest-leverage of the four.

## The four cost surfaces

### 1. One-time agent work

Dispatched agents consume Claude API tokens, web fetch quotas, and human-review time. Estimate scale in rough order:

- Low: under $50 in API spend, one agent, under 1 hour wall time
- Medium: $50-500, parallel agents, 1-4 hours wall time
- High: $500+, deep multi-pass work, half-day or more

Quote a dollar range when the cost matters to the decision. "Low one-time" is fine for routine work; "$900-1200 one-time" is right for proposals where the cost competes with the value frame.

### 2. Ongoing runtime cost

Per-item AI generation, embedding calls, recomputation triggers, scheduled jobs, scrapes, browserless sessions. Quote a monthly dollar number where calculable:

- "$50-100/mo at current corpus size"
- "$30-50/mo for the per-surface framing recomputation"

If a feature adds per-tenant cost, name the unit ("$X per workspace per month at typical activity").

### 3. Ongoing infrastructure

Supabase tier, Vercel tier, Browserless quota, vendor services (Resend, Stripe, third-party APIs). Quote the tier transition where relevant:

- "Stays on Supabase Pro $25/mo"
- "Pushes Vercel from Pro to Enterprise (~$2,000/mo)"
- "Adds Resend at ~$20/mo"

Most proposals don't change the infrastructure tier; explicitly say so when that's the case ("no infra change").

### 4. Inheritance cost

Skill changes, documentation changes, architectural decisions cost $0 in API spend AND are paid in every future agent run, every future feature, every future dispatch. This is the cost that doesn't show up on a credit card statement and is the highest-leverage of the four when wrong.

Examples of inheritance cost paid for a wrong-shape skill:

- A wrong-shape YAML emission section in a writer skill produces every subsequent item with the same wrong shape; the cost is the regeneration of every affected item once the shape is fixed
- A wrong canonical vocabulary forces every classifier inheriting it to emit wrong tags; the cost is the corpus-wide backfill
- A wrong cost rule (this rule) propagates cost-blind recommendations through every dispatch that inherits it; the cost is paid in production errors, rework, or budget surprises

Quote inheritance cost as the SHAPE of what's at risk, since the dollar number depends on how long the wrong inheritance runs before correction:

- "High inheritance risk: every future writer composes with this; wrong framing here propagates to every item"
- "Low inheritance risk: this skill is consumed by one classifier"
- "Medium inheritance risk: refactor reaches into N dispatched-agent prompts already in flight"

## The three value frames

Every cost is weighed against a value frame. The three are mutually exclusive at the proposal level (a recommendation is one of the three):

| Frame | Meaning | Spending posture |
|---|---|---|
| Revenue-blocking | Cannot earn without this. Onboarding gate, billing infrastructure, security boundary that prevents go-live. | Spend at any tier; cost is justified by the revenue it unlocks. |
| Revenue-accelerating | Helps close paying customers or expand existing ones. Demo-quality features, premium-tier capabilities, frictionless onboarding, integrations operators ask for. | Spend at moderate tier; check the per-customer payback. |
| Polish or scale-prep | Improves the experience or readies for scale, but defers cleanly if revenue isn't there. | Spend at lean tier or defer; reconsider when revenue justifies. |

A single proposal might mix frames across its components ("the core feature is revenue-accelerating, the moderation tooling is polish"). Name each component's frame separately when they differ.

## Manual gating requirement

Any feature that triggers AI runs, embedding calls, scrapes, or per-event compute must surface BOTH the per-run cost AND the manual gating mechanism. The gate is a UI surface (toggle, kill switch, default-off), NOT just an alerting threshold or env var.

Incomplete: "This adds N AI calls per item."

Complete: "This adds N AI calls per item, gated behind X manual toggle on the admin panel, default off. Kill switch at the workspace_settings level halts all runs at 100% of authorized monthly ceiling."

This requirement is sourced from operator memory captured 2026-05-15 and applies because the operator's tool runs against the operator's own Anthropic API account; auto-running money-costing features without manual gates burns the operator's pocket on a tool still finding product-market fit. Composition is skill-to-skill; the operator-memory note is not a skill and is referenced here as a sourcing pointer, not a composition edge.

## Failure mode signature

The following outputs are cost-blind and incomplete:

- "We should add structured fact extraction" (no cost surface, no value frame, no gate)
- "Recommend per-surface framing as the next dispatch" (no cost, no frame, no gate)
- "The writer should regenerate items when their classification changes" (no per-event cost, no manual gate)

These get returned for cost analysis before adoption. The fix is not to demand pinpoint dollar precision; it is to NAME the surfaces and the frame so the operator can decide.

A complete proposal reads roughly:

> "Recommend X. One-time agent work: medium ($400-600). Ongoing runtime: ~$30-50/mo at current corpus. Infrastructure: no tier change. Inheritance: low, this skill is consumed by one writer. Value: revenue-accelerating, helps close paying customers asking for per-surface views. Manual gate: regeneration triggers behind workspace_settings.auto_regenerate toggle, default off."

## What this rule is NOT

- Not a demand for dollar precision when rough order suffices. "Low one-time" is fine when the cost obviously doesn't matter; "$900-1200 one-time" is needed when cost competes with value.
- Not an excuse to defer everything as "polish." The frames are honest assessments; revenue-blocking work gets spent on at any tier.
- Not a substitute for the operator's decision. The rule produces a complete proposal; the operator decides GO / NO-GO / DEFER.

## Scope

Applies across all projects:

- Caro's Ledge (freight sustainability intelligence; project economics at [[reference-caros-ledge-economics]])
- Pet Pursuit (project economics: future reference-pet-pursuit-economics)
- Plow Louise (project economics: future reference-plow-louise-economics)
- Future projects: each adds its own reference-<project>-economics

The rule itself is project-agnostic. The economics references are the project-specific data the rule consumes.

## Composition

- Composes with: [[reference-caros-ledge-economics]] (and future per-project economics skills) as data input
- Composes with: [[rule-cross-reference-integrity]] (inheritance cost includes documentation that propagates if wrong)

Sourcing (not composition; the items below are operator memory or saved notes, not skills):
- The manual-gating requirement is sourced from operator memory captured 2026-05-15 (auto-update toggles, kill switch as UI surface, money-costing functions behind explicit operator controls)

Inherited by: every dispatch proposal, every audit recommendation, every skill change, every sequencing decision. This rule is foundational discipline, not a leaf rule.

## When this rule is invoked

- Dispatching a new agent: name the cost surfaces and value frame in the dispatch brief
- Proposing a new feature or schema change: surface the cost in the proposal
- Writing a new skill or modifying an existing one: include the inheritance-cost note in the prework or in the skill's audit cross-reference
- Audit recommendations: each numbered recommendation in an audit doc names its cost surfaces and frame

## Audit cross-reference

- Operator instruction 2026-05-15: "Every architectural recommendation, dispatch proposal, or sequencing plan must explicitly weigh three cost surfaces against value impact before being presented. Cost-blind recommendations are a failure mode."
- Operator instruction 2026-05-15 (post multi-tenant deploy): "The cost-weighted-recommendations rule should explicitly include skill changes in its scope. Cost surfaces includes downstream-dispatch quality, not just API/infrastructure dollars. A skill written wrong is paid for in every future agent run that inherits it. That's a real cost, even at $0 in API spend." (This is what expanded the rule from three surfaces to four.)
- Saved operator memory 2026-05-15 (the manual-gating requirement, captured at memory/feedback_cost_discipline_manual_controls.md; not a skill)
