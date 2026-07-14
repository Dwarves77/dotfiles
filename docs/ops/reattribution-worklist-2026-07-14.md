# Re-attribution worklist — worklist-host FACT spans (2026-07-14)

Enumerates the live corpus population behind open integrity flag
`f5a56b11-e272-49b4-a8f2-535ba53c4cec` (`sources.class-worklist-reattribution`, created_by
`host124-worklist`). That flag carries the **class rule** (a FACT span attributing to an
encyclopedia / policy-aggregator / legal-aggregator host is a re-attribution instruction — re-home to
the official publisher, else relabel FACT→ANALYSIS, else leave held); this doc is the **enumerated
list** the flag pointed at.

Related: [reconciliation-remediation-closeout-2026-07-11](./reconciliation-remediation-closeout-2026-07-11.md) ·
[ADR-010-docs-taxonomy-and-brain-conventions](../decisions/ADR-010-docs-taxonomy-and-brain-conventions.md).

## Root cause (go-forward FIXED)

Every span below is stamped `source_tier_at_grounding = 5` — the retired `registerCitedSources`
`cs.tier_estimate ?? 5` default (a guessed T5 minted into `sources.base_tier` for any unclassified
cited host, then frozen onto the FACT provenance). The **go-forward mint is fixed** in
`src/lib/agent/source-growth.ts` (residual-sweep 2026-07-14, this PR): base_tier now keys off the
deterministic `classTierForHost` — a host that classifies to no ruled SC-13 class is worklisted as a
`provisional_sources` candidate, never a guessed-tier `sources` row. So no NEW worklist-host FACT can
mint at a guessed 5. This doc is the **backward** cleanup of the rows that already carry it.

## Live population (query-not-value — re-run to refresh)

42 FACT spans across 13 items, all `source_tier_at_grounding = 5`:

| Item type | Item | Status | Worklist host | FACT spans | Floor note |
|---|---|---|---|---|---|
| research_finding | Carbon Trust | verified | en.wikipedia.org | 3 | **sub-floor** (research ≤T4; T5 stamp is below floor) |
| research_finding | IRENA Renewable Power Generation Costs 2024 | verified | policycommons.net | 2 | **sub-floor** |
| research_finding | Critical Materials for EV Batteries: IRENA 2024 | verified | policycommons.net | 2 | **sub-floor** |
| initiative | DEWA / MBR Al Maktoum Solar Park | verified | en.wikipedia.org | 3 | floor-exempt (initiative) — quality only |
| market_signal | UK Defra: Organizational Overview | verified | en.wikipedia.org | 10 | floor-exempt (market_signal) — quality only |
| market_signal | NY Senate Legislation Portal Access | verified | legiscan.com | 9 | floor-exempt — quality only |
| market_signal | JOC (Journal of Commerce) | verified | en.wikipedia.org | 4 | floor-exempt — quality only |
| market_signal | Carbon Trust: Net Zero Transition Services | verified | en.wikipedia.org | 1 | floor-exempt — quality only |
| regional_data | World Autism Acceptance Month proclamation | verified | en.wikipedia.org | 2 | floor-exempt (regional per-section) — quality only |
| regional_data | GEF Leadership and Organizational Structure | verified | en.wikipedia.org | 1 | floor-exempt — quality only |
| guidance | International Transport Forum 2019 | quarantined | en.wikipedia.org | 2 | reg-family ≤T2 — **already held** |
| guidance | Diário Oficial da União access guide | quarantined | en.wikipedia.org | 2 | reg-family — **already held** |
| guidance | Community of European Railways overview | quarantined | en.wikipedia.org | 1 | reg-family — **already held** |

Refresh query: FACT `section_claim_provenance` rows whose `source_id` host matches
`wikipedia.org | policycommons.net | legiscan.com` (justia/legiscan/cornell-LII/chambers class also in
scope — currently zero beyond legiscan).

## Disposition (per the operator's re-attribution tree)

1. **Re-home to cited primary ($0):** requires the same `source_span` to be present in a registered
   floor-qualifying source already in the item's pool. **No proven in-item re-home target** for any of
   the 42 — these grounded to an encyclopedia/aggregator precisely because no primary carried the span.
   Confirming a target is per-span pool-content matching (cheap but not proven here).
2. **Relabel FACT→ANALYSIS (deterministic):** an encyclopedia/aggregator-sourced claim is analysis-grade
   by nature, so the relabel is deterministic. BUT executing it mutates `claim_kind` on **10 verified
   customer briefs**, which triggers a `validate_item_provenance` re-run and a possible re-quarantine
   cascade. Per production-surface-verification + verification-four-part-standard, that is a **verified
   remediation unit** (re-validation asserted, re-quarantine cascade checked, customer surface
   confirmed) — **not a sweep write**.
3. **Leave held + log (this doc):** the terminal disposition applied here. The 3 quarantined guidance
   items are already held (no customer exposure). The 3 verified research_finding items are the
   **priority follow-on** (their T5 wikipedia FACTs are genuinely sub-floor). The 7 floor-exempt
   verified items are a quality issue, not a floor violation.

## Owed follow-on (its own unit)

`reattribution-relabel` — a verified remediation unit that, per item: attempts the $0 re-home
(span-match against the pool), else relabels FACT→ANALYSIS, then re-runs `validate_item_provenance`
and lets the re-quarantine cascade fall honestly. Ordered research_finding (sub-floor) → floor-exempt
verified → (quarantined already held). Deferred out of the residual sweep because it mutates verified
customer briefs and needs the four-part verification, not a bulk sweep write.
