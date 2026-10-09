## Authority Grant

You are authorized to:

- Flag work descriptions that conflate infrastructure completion with customer-facing value delivery
- Recommend reordering work if the current sequence is leaving customer-facing surfaces broken longer than necessary
- Surface scope gaps where customer-facing builds have not been scoped or sequenced
- Surface narrowing decisions (current-only or expansion-only) without operator flag
- Emit the Value Delivery Check section without operator pre-authorization on every relevant dispatch

You are NOT authorized to:

- Unilaterally reorder sprints
- Build customer-facing surface features without explicit operator authorization on scope, design, and sequence
- Author new design principles (those require operator authorization per `sprint-followups-discipline`)
- Modify this skill's platform model framing (five-surface model, Intelligence Assistant as research helper, Map as view of Regulations, Operations as structured content not separate decision engine, Community as core not Category 5) without explicit operator authorization with strong-emphasis correction. The framing in this skill is binding. Drift requires operator-stated correction, not synthesis agent inference.
- Modify the source taxonomy in `environmental-policy-and-innovation` (that skill owns the canonical taxonomy; this skill cites it)

## Anti-Patterns

These framings mean the skill was loaded but not followed:

- **"Phase 7 will fix Market Intel / Research / Operations / Community."** Phase 7 is admin chrome and operator triage UI, not customer-facing surfaces. Confirmed in OBS-18 and OBS-19 prior to this skill's rewrite; those entries need in-place revision.
- **"Phase 6 will fix customer-facing surfaces."** Phase 6 is ingest wiring (data into system), not customer-facing UX. Plumbing better data does not by itself fix a placeholder UI shell.
- **Treating Community as Category 5, an add-on, or an onboarding mechanism.** Community is a core value surface, equal status with the four intelligence pages. Audit reports or dispatch scopes that omit Community from the customer-facing surface list are in violation.
- **Treating Intelligence Assistant as a synthesis layer, decision engine, or Operations build deliverable.** It is a research helper grounded in platform skills and content. Any Operations build that scopes "a separate Intelligence Assistant powered decision engine" is over-scoping; the Assistant is cross-cutting, not Operations-specific.
- **Treating Map as a separate content category.** Map is a geographic view of Regulations content. It does not surface its own content category.
- **"Infrastructure complete" implying value delivered.** Infrastructure completion and customer-facing value delivery are different. A dispatch saying "all foundations ready" without also saying "the customer-facing surfaces are still broken" is misleading.
- **Silently absorbing schedule slip for customer-facing surfaces when infrastructure work expands.** Surface the push; do not absorb silently.
- **Narrowing scope to current operational verticals without flagging.** A decision that serves art logistics and live events but not generic freight forwarders is a real narrowing; flag it.
- **Narrowing scope to expansion-only without flagging.** A decision that serves only the abstract future cohort without grounding in current customers is also a real narrowing; flag it.
- **Allowing phase-language ("Coming soon, Phase D", "Phase N", etc.) to leak into customer-facing UI.** Customers do not know what Phase D is. This anti-pattern has reached production at `/operations` and `/research`; flag wherever observed.
- **Page scope drift across the four-category source taxonomy.** Examples: putting regulatory deadlines in Market Intel scope when they belong in Regulations; treating Research as academic-only when it includes industry analytical press; under-scoping Operations as a content surface that needs a separate "decision engine" build when the correct framing is structured content plus Intelligence Assistant plus customer judgment.
- **Operations as separate decision-engine UI build.** Wrong framing. The product shape is structured content on the page plus Intelligence Assistant for cross-cutting questions plus customer judgment. Anyone scoping a separate decision-engine UI is over-scoping per the prior version of this skill's mis-framing.
- **Skipping the Value Delivery Check section because the dispatch is "small."** One paragraph; not skippable.
- **Value Delivery Check section that omits Community from the surface enumeration.** Violation. The five-surface model is canonical; Community is co-equal. Reports that enumerate "four pages plus onboarding" reflect the pre-rewrite mis-framing.

## Integration With Other Skills

This skill loads alongside, not in place of, three other skills. Every relevant dispatch loads all four:

- **`environmental-policy-and-innovation`** owns the canonical source taxonomy (`regulatory`, `research`, `market_news`, `operational_data` via the `item_type` and `format_type` derivation), the content integrity rule, the workspace-anchored output rule, the source classification hierarchy, severity labels, and the intersection-detection contract. This skill cites that one for taxonomy and content rules; this skill does NOT duplicate them. When the canonical taxonomy in `environmental-policy-and-innovation` evolves, the page scoping in Section 3 of this skill follows. The Intelligence Assistant is grounded primarily in this skill's content.

- **`sprint-followups-discipline`** owns OBS loop closure and DP compliance enforcement. Every relevant dispatch emits the OBS coverage table and DP compliance section per that skill, AND the Value Delivery Check section per this skill. The two sections coexist; neither replaces the other.

- **`frontend-design`** owns UI conventions for customer-facing build work. When a customer-facing build dispatch is authorized, `frontend-design` governs how the UI is structured.

When all four skills are loaded, every dispatch addresses content integrity, OBS coverage, design conventions, AND customer-facing value-delivery awareness against the binding five-surface model. The four are additive, not exclusive.
