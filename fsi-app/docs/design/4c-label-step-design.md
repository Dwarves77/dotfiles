# 4c — Labeled-Analysis Resolution for `unlabeled_assertion` (design)

Status: DESIGN (lands mid funded-pass). Execution pre-authorized on QUARANTINED scope on landing;
VERIFIED scope held. Ruling 2026-07-04 ("4c first, then funded pass").

## What 4c is (grounded in the exact validator criteria, migration 145)

`validate_item_provenance` criterion 4 raises `unlabeled_assertion` for a section when ALL of:
1. `content_md ~* '\m(requires|must|mandates|obligates|prohibits|applies to)\M'` — a binding verb, AND
2. NOT (`content_md ~* c_label_re` OR contains the legal callout) — no analysis label present, AND
3. NOT EXISTS a `FACT` claim on that `section_row_id`.

So the section is asserting a binding requirement in prose with **neither a grounded FACT behind it nor
an analysis label on it**. Two honest exits:
- **(a) Ground it** — a FACT span lands on the section (the funded pass / better nomination does this), OR
- **(b) Label it** — the assertion is rewritten to carry an analysis label, so it reads as the workspace's
  *labeled analysis*, not an ungrounded binding claim.

**4c owns exit (b).** It is the disposition for a section whose binding assertion is prose-covered but the
grounding judge REFUSED to confirm any pool span as a binding FACT (a slot-forcing RELABEL). Rather than
fabricate a FACT (moat violation) or leave the assertion unlabeled (criterion-4 fail), 4c relabels the
assertion to labeled analysis.

## The load-bearing integrity constraint (scope)

4c MUST NOT relabel a GENUINE binding requirement (one that should be a FACT) into mere analysis — that
downgrades a real regulatory fact to opinion, violating the Integrity Rule and the legal-line guard. 4c
relabels ONLY assertions the grounding judge has already RELABEL'd (prose-covered, no judge-supported binding
span). The judge's genuine-support asymmetry is the gate: no judge RELABEL → no 4c relabel. This makes 4c the
labeling twin of slot-forcing's never-fabricate rule: **never DOWNGRADE a fact, just as we never FABRICATE one.**

## What 4c does NOT do (the corrected picture — surfaces a program divergence)

`missing_required_slot` (criterion 5) clears **only** by a FACT or GAP claim carrying the `[slot_key]` prefix
— an ANALYSIS/label claim does NOT satisfy a required slot. Therefore 4c (labeling) does **not** flip an item
whose remaining failure is `missing_required_slot` on a HARD slot, nor `fact_below_authority_floor`.

Batch-1 after-states, mapped to what actually flips them:

| item | after batch 1 | 4c clears? | flips on 4c alone? | what it really needs |
|---|---|---|---|---|
| c8 (standard) | `unlabeled_assertion` | yes | **YES** | 4c label |
| l1 (regulation) | `unlabeled_assertion` | yes | **YES** | 4c label |
| 782878c0 (reg) | `unlabeled_assertion`, `missing_required_slot` | partial | no | 4c + FACT grounding for 3 HARD slots |
| f0833999 (reg) | `missing_required_slot` | no | no | FACT/GAP for the slot (grounding, not labeling) |
| 7a0ead55 (reg) | `fact_below_authority_floor` | no | no | a floor-tier (T≤2) primary span for its FACTs |

**Consequence:** 4c + the funded pass flip the genuinely-groundable items; items missing binding FACTs in
their own sources (HARD `missing_required_slot`) or lacking any floor-tier primary (`fact_below_authority_floor`)
will NOT force green. Those are honest under-grounding — they belong in counsel-hold / seek-more, NOT forced
to verified. Not every quarantined item should flip; forcing them would be the fabrication the moat forbids.

## Mechanism (build)

For each section with `unlabeled_assertion` whose binding assertion the judge RELABEL'd:
1. Identify the binding sentence(s) in `content_md` (the `\m(requires|must|…)\M` match).
2. Prepend the appropriate analysis label from `c_label_re` — default **"Analytical inference:"** for the
   workspace's own reasoning; **"Industry interpretation:"** when the assertion paraphrases a named non-primary
   operator/analyst source; **"Operational implication:"** when it is a downstream consequence statement. The
   judge's RELABEL reason already characterizes which (it says WHY the span isn't a binding fact).
3. Write the relabeled `content_md` via the guarded path; re-validate; the section now matches `c_label_re`
   → criterion-4 clears for that section.
4. **Label home:** the label goes at the START of the binding sentence inside `content_md` (where criterion-4
   scans), never in a separate metadata field. **Consistency:** the label string must match `c_label_re`
   verbatim (case-tolerant per migration 143) — a near-miss label does not clear the criterion.

## Scope + evidence to gather before execution ("unlabeled-42 evidence")

Before executing, produce the corpus census of `unlabeled_assertion` sections (the "~42" figure to confirm
live): for each, the section, the binding sentence, and the judge's RELABEL characterization (which label
applies). Execution is per-section, guarded, re-validated. QUARANTINED scope pre-authorized; VERIFIED scope
held (relabeling a verified item's prose is a customer-visible content change — operator-gated).

## Sequence

1. Census the live `unlabeled_assertion` population (read-only) — confirm count + per-section label choice.
2. Build the relabel mechanism (guarded content_md edit + re-validate) with the judge-RELABEL gate.
3. Execute on QUARANTINED scope; flip the unlabeled-only items (c8, l1-class).
4. The funded pass (with 4c live) then handles the rest — flipping what is genuinely groundable, and honestly
   HOLDING what is not (HARD missing-slot / below-floor). The close-out reports the honest split, not a
   forced 100%.
