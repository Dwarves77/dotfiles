## Skill

source-credibility-model

## Change

Lane P1 (p1-source-rating-display) does not edit `fsi-app/.claude/skills/source-credibility-model/SKILL.md`.
It implements Section 7 (the effective tier formula, with `tier_override` first) and Section 8 (customer-facing
signals, bias rendering "consistently when present") on the customer surfaces, and adds three new files that
cite the skill as their governing contract. I read the whole skill before building.

## Citing files reviewed

Three `GOVERNING SKILL(S): source-credibility-model` citations are ADDED in this range, each in a new file:

- `fsi-app/src/lib/customer-source-tier.ts`: the one customer tier rule, `tier_override`, else `effective_tier`,
  else `base_tier` (Section 7 formula, migration 090). The per-claim tier rule is a different rule and is
  unchanged (`load-detail-core.ts` `fetchClaimTierMap`, migration 145, never `effective_tier`).
- `fsi-app/src/lib/credibility/bias-display.mjs`: the display model for bias tags. Labels cover the Section 6
  vocabulary exactly (a test fails if the stored vocabulary and the label table drift); bias is shown for
  external publisher sources only, never Community content (Section 6 "Scope", Section 9 anti-pattern).
- `fsi-app/src/components/ui/BiasChips.tsx`: renders that model. Bias stays an axis separate from tier
  (Section 2 element 2); it is a quieter neutral tag beside the tier square, never merged into it.

No existing citation of this skill was removed or moved. No pinned file other than those three new citing files
changes meaning for this skill.
