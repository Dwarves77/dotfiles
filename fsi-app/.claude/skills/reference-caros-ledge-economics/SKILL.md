---
name: reference-caros-ledge-economics
description: Established cost discipline for Caro's Ledge. Pricing target, operating cost tiers, kill switch as UI surface, unit economics, per-dispatch cost ranges. Consumed by [[rule-cost-weighted-recommendations]] for every Caro's Ledge proposal. Recommendations weigh against these real numbers, not guesses.
---

# Reference: Caro's Ledge economics

## What this is

The data input that [[rule-cost-weighted-recommendations]] consumes when applied to Caro's Ledge. The rule is project-agnostic procedure; this reference holds the project-specific numbers.

Every Caro's Ledge dispatch proposal, every audit recommendation, every skill change cites this reference for the cost framing. The numbers below are the operator-confirmed baseline as of 2026-05-15 (the proof-of-concept tier the operator is running personally while the product finds its market).

## Pricing target

- $500/mo per workspace, B2B SaaS
- Annual contract preferred (operator pricing decision; not yet enforced in billing)
- Comparable products (positioning reference, not direct competitors):
  - Bloomberg ESG: $20K-100K/yr
  - Watershed: $30K-100K/yr per company
  - Persefoni: $25K-60K/yr per company
- Positioning: one vertical with depth, accessible pricing. The differentiation is the Bloomberg-grade data engineering applied to freight (specifically the high-value cargo segment); the price point is roughly 1/10 to 1/20 of the enterprise alternatives.

## Operating cost tier model

Three tiers; current operating posture is Lean. Each tier names the cadence of background work (T1 = priority source registry tier 1; refresh cadence determines the AI run volume).

### Lean (current)

- Target: $335/mo
- Cadence: daily T1 sources, weekly T2 sources, monthly T3 sources
- Suitable for: pre-revenue or small-tenant scale; the operator's personal daily-use posture
- Cost components:
  - ~2,160 Sonnet analyze calls/mo × $0.15 = $324/mo (the dominant line item)
  - Supabase Pro: ~$25/mo
  - Vercel free or Pro: $0-$20/mo (current usage stays in free tier)
  - Browserless: variable, ~$0-$30/mo at current scrape volume
  - Anthropic API spend hits the Anthropic API console (NOT covered by any claude.ai subscription)

### Moderate

- Target: ~$1,000/mo
- Cadence: faster (multiple daily T1, daily T2, weekly T3)
- Suitable for: 2-10 paying tenants; revenue covers the operating ceiling 2-5x
- Cost components proportional to Lean, with the AI run volume the dominant scaling factor

### Comfortable

- Target: ~$8,322/mo
- Cadence: near real-time (continuous T1, frequent T2/T3, on-demand regeneration)
- Suitable for: 10+ paying tenants OR high-priority enterprise customer
- Cost components: AI runs scale ~25x Lean; Supabase tier may push to Team plan ($599/mo); Vercel Pro adequate; Browserless or self-hosted Playwright

### Kill switch

The kill switch is a FIRST-CLASS UI SURFACE in the admin panel, not just an alerting threshold. Behavior:

- Halt at 100% of authorized monthly ceiling (operator-set per tier)
- When halted: all auto-running jobs stop, scheduled regenerations pause, source scraping pauses
- Admin chrome shows a banner: "Cost ceiling reached. Manual override available; defaults remain halted until next month or until manually re-enabled."
- Resuming requires explicit operator action in admin chrome; no automatic recovery at month rollover unless operator opted in

This composes with [[feedback-cost-discipline-manual-controls]]: cost discipline is enforced through product-level manual controls, not just post-hoc budget tracking.

## Unit economics

At current pricing and Lean operating cost:

- 1 workspace at $500/mo covers Lean operating cost ~1.5x ($500 / $335)
- 10 workspaces at $500/mo = $60K/yr revenue, ~$4K/yr operating cost = ~93% gross margin
- 100 workspaces at $500/mo = $600K/yr revenue; expect operating cost to push into Moderate or Comfortable tier
- Gross margin target: >90% at scale

Per-workspace marginal cost analysis is approximate; the AI run volume scales with corpus updates, not directly with workspace count. The dominant scaling factor is the number of distinct sources tracked, not the number of workspaces consuming them.

## Cost impact per major dispatch (rough order)

Reference table for cost-weighted recommendations on Caro's Ledge work. Numbers are one-time agent work unless noted.

| Dispatch | One-time agent | Ongoing runtime | Ongoing infra | Inheritance |
|---|---|---|---|---|
| Multi-tenant foundation (landed 2026-05-15) | Medium ($200-400) | Low | None | High (sets the three-context architecture for every future feature) |
| Schema cleanup (audit S5/S9) | Low | Low | None | Medium |
| Source registry hygiene + audit-cleanup | Low | Low | None | Medium |
| Ranking system (Section 6.8) | Medium ($200-400) | Low | None | High (every page surface reads it) |
| Structured fact extraction (Section 6.5) | $900-1200 | $50-100/mo | None | High (adds columns every writer consumes) |
| Per-surface framing (Section 6.9) | $400-600 | $30-50/mo | None | High (changes how every item renders) |
| Knowledge graph (Section 6.4) | Medium | Low (compute on read) | None | Medium |
| Lead time as column (Section 6.7) | Low | Low | None | Low |
| Jurisdictions entity table (Section 6.1, follow-up) | Medium (ingest is the bulk) | Low | None | High (every jurisdiction-aware feature reads it) |
| Versioning canonical store (Section 6.6) | Medium | Low | None | High (changes how every item-change is logged) |
| Email integration (Resend, polish dispatch) | Low | Low | $20/mo | Low |
| Site + content review (next dispatch) | TBD per its prework | Likely none (one-time review) | None | Medium (informs writer-skill refinements) |

Use these as rough-order anchors when proposing work. Refine the estimate at dispatch time; this table is the starting point, not the final word.

## Manual controls as cost discipline

Per [[feedback-cost-discipline-manual-controls]] saved memory:

- Auto-update is manually toggleable per source; default off for any new auto-running job
- Money-costing functions (regeneration, scraping, embeddings) sit behind explicit operator controls (UI toggle, not just env var)
- Kill switch is a first-class UI surface (described above), not an alerting threshold
- New dispatches that propose adding AI runs or scrapes specify the gating mechanism alongside the per-run cost
- New dispatches that change the cost-per-tenant relationship surface the unit-economics impact

Recommendation incomplete: "regenerate items when their classification changes"

Recommendation complete: "regenerate items when their classification changes, gated behind workspace_settings.auto_regenerate_on_reclassification toggle (default off); kills automatically when monthly Sonnet spend exceeds tier ceiling"

## Operator daily-use posture

The current cost discipline is tighter than a pure-SaaS company would impose because the operator runs the tool personally on the operator's own Anthropic API account during the proof-of-concept phase. Cost decisions that look conservative from a Series A perspective are correct for the current phase: the tool has to run affordably for the operator's daily use right now AND scale to paying tenants without re-architecting the cost model.

When the operator transitions from personal-tool posture to paying-tenant posture, the kill switch behavior and the per-tier ceilings move from operator-personal to per-workspace; the discipline stays.

## Composition

- Consumed by: [[rule-cost-weighted-recommendations]] (the rule applies the procedure; this reference is the data)
- Composes with: [[feedback-cost-discipline-manual-controls]] (the manual-gating discipline that makes the kill switch a UI surface, not a threshold)
- Composes with: every dispatch proposal for Caro's Ledge (the cost ranges in the table above are the starting estimates)
- Composes with: every audit recommendation for Caro's Ledge (recommendations weigh against the unit economics and tier model)

## Audit cross-reference

- Operator brief 2026-05-15: pricing target ($500/mo), tier model (Lean $335/mo, Moderate $1K/mo, Comfortable $8.3K/mo), kill switch behavior, unit economics
- Operator clarification 2026-05-15 (post multi-tenant deploy): "we are building this as proof of concept to scale, and as an actual tool I need for myself day to day... thats one reason we have manual shut off of auto updating and control over functions that cost money"
- The per-dispatch cost table above was sourced from the v2 audit Section 7 reading-order discussion plus the operator's rough-order estimates for each line; refine per dispatch
