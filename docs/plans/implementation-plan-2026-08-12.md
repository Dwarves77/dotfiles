# Implementation plan: work units, acceptance, sequence (2026-08-12)

Operational companion to `docs/specs/00` through `06`. Specs say what to build and why; this says in
what order, in what commit, and how each unit proves itself. Every unit is independently shippable,
independently gate-green, and independently revertible.

## Standing constraints (unchanged, apply to every unit)

$0 only: free HTTP fetching is real sourcing, LLM calls are not. Nothing armed: no cron, no `schedule:`,
nothing enabled in the Actions UI. Delivery is GitHub web UI upload, `git push` is proxy-blocked and not
to be worked around; every commit is hash-verified via `git fetch` + `git hash-object`. Gate battery
green before every ship: `run-test-suite.sh`, `fitness/runner.mjs`, `governance/invariant-coverage.mjs`,
`tsc --noEmit`. Session-log addendum per work unit.

## Operator decisions taken (2026-08-12)

1. **Spine scope v1: narrow.** Corridor, jurisdiction, organisation, instrument. Asset, method,
   technology, person deferred to v2. Rationale: these four carry every cross-surface join named in the
   specs; the other five carry none that is on the Phase 4 critical path.
2. **One assumption register**, shared by Research and Operations, per the recommendation in `06` §9.2.
3. **IOSCO disclosure discipline adopted now**, audit deferred. Retrofitting an audit trail is
   impossible; the disclosure is what makes a number contractable.
4. **Community stays at current usage** until the antitrust guard ships.

## Dependency correction to the sequence in spec 06

Spec 06 put the spine at Phase 2, after Phase 0 substrate. That is wrong on dependencies, and this plan
corrects it: **the vocabularies and the number envelope must land before Phase 0.2 to 0.5**, because
those units decide what an orphan field becomes, what a count population means, and what a cell renders
when data is absent. Building them first and retrofitting the vocabulary is rework, and `origin_class`
specifically is unfixable retroactively.

Revised order: **F (foundation types) → Phase 0 remainder → Phase 1 gate → spine entities → producers →
surface shape.**

---

## Track F: foundation types (no behaviour change, pure addition)

### F1 · `src/lib/contracts/vocabularies.mjs` — the six vocabularies
Plain ESM, zero deps, `node --test` importable, matching the `surface-of.mjs` precedent exactly.
Exports frozen enums plus validators plus ordering plus display metadata for: `obs_status` (SDMX
CL_OBS_STATUS), `origin_class`, `confidence` (Admiralty 6×6 and the ecoinvent five-axis pedigree, with
the published mapping between them), `impact` × `applicability`, `freshness`, `relation` (typed
cross-references). Includes `weakestOriginClass()` because propagation-to-weakest is a rule the specs
state three times and must exist once.
**Acceptance:** every vocabulary is a frozen object; every value has a stable code, a label and an
order; `weakestOriginClass` is total over all pairs and commutative; zero duplicate codes across the
lattice; the Admiralty↔pedigree mapping round-trips.

### F2 · `src/lib/contracts/envelope.mjs` — the number envelope
`makeEnvelope()`, `validateEnvelope()`, `stalenessOf()` (from `as_of` + `expected_refresh` to
current/ageing/stale/frozen), `significantFigures()` driven by `n`, and `formatDelta()` enforcing `pp`
for ratios vs `%` for quantities. Refuses to construct an envelope missing `derivation`, `unit` or
`as_of`.
**Acceptance:** an envelope without derivation/unit/as_of throws; staleness is a pure function of two
dates and a cadence; ratio deltas render `pp` and quantity deltas render `%`; zero-fill is impossible
(a missing value is `M`, never `0`).

### F3 · Tests for F1 and F2 in `src/__tests__/`, inside an existing run-test-suite glob so they are
execution-wired rather than F23-orphaned.

### F4 · Wire `origin_class` through the read path (minimal): every `Resource` and every fact row
carries one; the acceptance gate asserts propagation-to-weakest on aggregates.

**Ship as:** PR "Foundation types: six vocabularies and the number envelope".

---

## Phase 0 remainder (substrate bug fixes, now conforming to F)

- **0.2 One population per page.** Move the row RPCs onto `surface_of`, so tiles, bands, masthead totals
  and the ledger describe the same set. Acceptance: count population equals row population on all four.
- **0.3 Producer or deletion for the ~17 orphan fields.** Each gets a producer or is deleted with its
  JSX and replaced by an F1 empty state. Acceptance: zero UI fields bound to a producer absent from
  `src`; zero permanently-dashed slots.
- **0.4 Stop coalescing null domain to 1.** Honour `uncategorized`. Acceptance: no mapper emits
  `row.domain || 1`.
- **0.5 Per-surface prose renderer** with table and list support. Acceptance: Market and Operations do
  not import the Regulations `ProseSection`; a markdown table renders as a table.

## Phase 1 · `scripts/verify/surface-acceptance.mjs` + F26

Two-way ratchet on today's measured counts per the operator ruling. Six assertions per surface plus the
17 spine assertions from `00` §8. Acceptance: over-baseline fails, under-baseline fails with the value
to re-seed to.

## Phase 2 · Spine entities (narrow scope)

2.1 registry + permanent IDs + external crosswalk (LEI, UN/LOCODE, CELEX/ELI, ISO 3166/NUTS).
2.2 **the corridor entity**, first, because it unblocks the most.
2.3 portfolio object + scope chip + cross-surface digest.
2.4 typed cross-references + coverage surface.

## Phase 3 · Producers (parallel with Phase 2, independent)

3.1 Market Intel: EU Weekly Oil Bulletin, EIA v2, EEX auctions, **THETIS-MRV**, **SBTi weekly**, ECB FX.
3.2 Operations, **EU and US first**: Eurostat energy/labour/packaging, BLS OEWS + QCEW, PVGIS, Ember,
EAFO, AFDC, Comext.
3.3 Research: OpenAlex, ROR, ORCID, Crossref, grey-literature path.
3.4 Regulations: obligation decomposition, starting with the four instruments that bind the forwarder
directly.
3.5 Close the 16 UNCONFIRMED regulatory facts.

## Phase 4 · Surface shape

4.1 Operations cross-region column. 4.2 Regulations `binding_position` + obligation register.
4.3 Market Intel carbon-cost-per-FEU + one numeric channel end to end. 4.4 Research horizon band +
maturity triple + credibility split. 4.5 Ungate the seven built Regulations renderers. 4.6 Research
theme projection + Unclassified band.

## Phase 5 · Community and Assistant

5.1 Antitrust posting guard + verified-pseudonymous identity. 5.2 Promotion state machine.
5.3 House-seeded benchmark cadence. 5.4 Assistant guardrails + one-calculator rule.

---

## Definition of done, every unit

Gate battery green. Session-log addendum in first-person prose recording errors honestly. Hash-verified
against the clone after upload. Nothing armed. Acceptance criteria from the unit added to
`surface-acceptance.mjs` once Phase 1 exists, or listed as a pending assertion until then.
