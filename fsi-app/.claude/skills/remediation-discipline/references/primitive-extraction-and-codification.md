## Section 5: Primitive Extraction Patterns

When primitive extraction is justified:

- Recurrence threshold: 2+ confirmed instances of the same broken pattern
- Reinventing-the-wheel signal: another agent solving a similar problem would rebuild the same logic
- Bounded surface: the primitive's scope is well-defined (single concern, single responsibility)

Naming conventions:

- Verb-noun for actions (`createPgPool`, `canonicalizeUrl`)
- `with-` prefix for wrappers around async functions (`withRetry`, `withRateLimit`, `withIdempotency`)
- Helper predicates named `is<Property>` (`isAnthropicRetryable`, `isPgRetryable`)

Migration pattern:

1. Extract the primitive into the library; write header docs and unit tests for caller-impact semantics
2. Refactor the first instance to consume the primitive; verify behavior parity with smoke test
3. Refactor known adjacent instances in the SAME dispatch; ship as a bundle so the library is validated against multiple consumers
4. Codify the discipline (Section 6 thresholds) so future occurrences default to library consumption

Testing:

- Primitive: unit tests on caller-impact semantics (e.g., retry predicate logic, rate-limit interval enforcement). The cost of getting a primitive's semantics wrong is silent over-retry / under-retry / over-permissive / under-permissive at every consumer.
- Consumer: integration smoke test (e.g., `--dry-run --limit N` against live state) confirms the refactor preserves behavior.

Reference implementation: `fsi-app/scripts/lib/batch-primitives.mjs` (added 2026-05-20 as the concrete class fix for batch resilience; see Section 7 worked example 1).

## Section 5.6: Status is a cache (gate/slot migrations ship revalidation)

A derived status column (e.g. `provenance_status`) is a CACHE of a gate result, recomputed by a trigger only when the underlying row is written. So **status is a cache** that goes stale the moment you change the GATE (`validate_item_provenance`) or its inputs (`item_type_required_slots`, the tier model) without re-writing the rows: stored `verified` can silently outlive a gate that now says `quarantined` (fabricated certification left on a customer surface), or a recoverable item can sit `quarantined` after the gate would now pass it. **Standing rule:** any migration that changes a gate or a slot/tier input MUST ship a corpus revalidation in the SAME change, and stored status MUST agree with the live gate in both directions. The substrate-agreement audit (EP-8/RD-5) is the standing truth-teller; "ship the revalidation with the migration" is the prevention.

## Section 6: Discipline Codification Thresholds

When a recurring pattern earns a binding rule:

- 2+ worked examples documenting the pattern + the class fix
- Operator authorization for the rule's exact phrasing
- Rule lands in `fsi-app/.claude/skills/sprint-followups-discipline/SKILL.md` as a named binding rule (Option A pattern, consistent with source-credibility-model load-trigger rule and Sweep-discipline rule precedents)

Skill content (in Section 7 of this skill or in the relevant domain skill) can document patterns BEFORE they have rules. Rules require operator-confirmed promotion. The skill is the example library; the rule is the binding enforcement.

Where the rule lands:

- Cross-cutting discipline rules (load-trigger for a domain skill; methodology rule like Sweep-discipline): sprint-followups-discipline as a new named binding rule
- Domain-specific scoring/computation rules: the domain skill's relevant section
- Schema or migration discipline: sprint-followups-discipline (since dispatch reports need to apply it)

Anti-pattern: codification before sufficient examples (one occurrence is not a pattern; making a rule with one recurrence creates an unfilled obligation that may not generalize).
