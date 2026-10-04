## Skill

environmental-policy-and-innovation

## Change

Lane s3a-intersections edits `fsi-app/.claude/skills/environmental-policy-and-innovation/SKILL.md` in the
"Intersection Detection" definition only: list item 2 now says the compliance-object side counts NON-ROLE
tags only (role tags never connect, ADR-021), and one paragraph states that the result is stored on the pair's
edge in the persisted connection graph as an `intersection` basis entry, computed by
`src/lib/connections/intersections.mjs` and read back through `pair-view.mjs`. Nothing else in the skill
changed: the strength points, tiers, canonicalization, tag vocabularies, the 16 rules, the field contract and
the contract version are untouched, so no prompt or `contract-version.mjs` change is owed. I read the whole
skill for this lane before editing; the edit makes the definition match what the code does (the old text
described the retired SQL function, migration 023, dropped by migration 265).

## Citing files reviewed

No `GOVERNING SKILL(S):` citation of this skill was added, removed or moved in this range.
`fsi-app/src/lib/connections/intersections.mjs` is new and carries no skill citation header.
