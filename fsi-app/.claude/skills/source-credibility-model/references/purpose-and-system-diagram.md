## Section 1: Purpose and Scope

This skill defines the source credibility model for Caro's Ledge. It is the canonical source of truth for how source credibility is computed, surfaced, and acted on across the platform.

**Owned by this skill:**

- The six-element credibility model (type-based tier, bias tags, citation-network credibility, source discovery loop, operator override, recency decay) and how the elements compose
- The bias tag vocabulary (three dimensions, multi-value within each)
- The customer-facing credibility signal sets per platform surface
- The operational criteria for tier classification, candidate promotion, override, and decay
- The discovery-loop autonomy thresholds and audit-trail expectations on override

**NOT owned by this skill:**

- Brief content rules (owned by `environmental-policy-and-innovation`)
- Platform surface intent (owned by `caros-ledge-platform-intent`)
- Dispatch loop closure, OBS handling, DP compliance, sweep discipline (owned by `sprint-followups-discipline`)

Cross-skill load is additive, not exclusive. A Build 8 (Research) dispatch loads all four: env-policy (brief content), platform-intent (Research surface intent), sprint-followups-discipline (loop closure), source-credibility-model (the Q9 Research signal set, candidate review wiring, effective tier computation).

### System diagram

```
base_tier (from classification, INT 1-7, static) ────────────┐
                                                              │
citation network (tier-weighted, decayed) ────────────────────┤
                                                              ├──> effective_tier ──> customer-facing signal
operator override (when present)                              │                        (Section 8)
  COALESCE(tier_override, computed_dynamic, base_tier) ───────┘
```

Formula: `effective_tier = COALESCE(tier_override, computed_dynamic_tier, base_tier)`

Where `computed_dynamic_tier` is derived from `base_tier` plus the tier-weighted decayed citation network sum, computed by daily batch recompute.

**The moat (reg-fact eligibility).** The reg-fact grounding-tier stamp derives from static `base_tier` ONLY (with the per-host `tier_override` as the single sanctioned escape); dynamic reputation (effective_tier) and time-in-system never confer reg-fact grounding eligibility — a NULL `base_tier` resolves to NULL, never to a reputation tier. Reputation earns a SIGNAL trust within the signal tier; it never promotes a signal to a fact. The only bridge from signal to fact is verification against the domain's authoritative primary. (Enforced by fitness F12 / invariant SC-9; the resolver `tierOfSource` is `base_tier ?? null`, and the grounding pipeline does not select effective_tier into the resolver rows.)

**Why six elements together, not just static tier.** Each element addresses a failure mode the others cannot:

- Type-based tier alone is static; a tier-6 analytical outlet whose work is consistently cited by tier-1 regulators is doing tier-3-quality work, but static tier misses that signal
- Bias tags alone don't address authority; a methodologically-transparent industry-funded source can still be authoritative within its scope, but bias warns the consumer about lens
- Citation network alone overweights popular sources without considering institutional type; high citation count from low-tier sources should not elevate a source's credibility
- Discovery alone produces noise without verification gates; high-confidence routing prevents queue flood
- Override alone is human-only; without computed signals, every classification decision is operator labor
- Decay alone is time-only; without network and base signals, decay has nothing to operate on
