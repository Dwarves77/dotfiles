# Shared Components Inventory

Catalog of shared/reusable components in `fsi-app/src/components/`. Maintained per the Inventory-artifact emission rule.

## Status

**STUB** (created 2026-05-20).

Currently catalogued via the credibility-component contract doc at `docs/sprint-2/credibility-component-contract-2026-05-19.md` for the credibility set; other shared components are documented ad-hoc in their own files. This inventory aggregates.

## Expected columns when populated

| Column | Source |
|---|---|
| Component | `<ComponentName>` |
| Location | `src/components/<...>` |
| Props shape | TypeScript interface (link to file:line) |
| Consumers | Routes / pages / other components that import it |
| Purpose | One-line summary |
| Touched by | Most-recent commit SHA + dispatch reference |

## Known shared components (partial, from session corpus)

- **Credibility components** at `src/components/credibility/` (per the contract doc):
  - `CredibilityBadge` — tier display
  - `BiasBadge` — bias tag chips
  - `CitationCountChip` — count + expand
  - `RecencyChip` — relative time
  - `JurisdictionChip` — jurisdiction code
  - `SignalStrength` — Market Intel pill
  - `ProvenancePanel` — composing all of above
- **Source components** at `src/components/sources/`:
  - `SourceProvenanceBadge` — tier display; Phase 1.5 (2026-05-20): renders `source.effective_tier ?? source.base_tier` per customer-facing default rule. Migration to `CredibilityBadge` documented in the contract doc.
  - `SourceHealthDashboard` — admin source health surface; Phase 1.5: groups + filters by `base_tier` per admin/audit default rule.
  - `CanonicalSourceReview` — candidate review surface; Phase 1.5: client sends `body.tier`; server (`api/admin/canonical-sources/decide`) dual-writes to `base_tier` + `effective_tier` per Day 1 invariant.
  - `ProvisionalReviewCard` — provisional promotion surface; Phase 1.5: same dual-write pattern as `CanonicalSourceReview`.
- **Other touched in Phase 1.5**: `AskAssistant` (Intelligence Assistant; `Citation.source_tier` populated server-side with `effective_tier ?? base_tier` per Assistant signal set).

## Source of truth

`src/components/` directory tree + per-component TypeScript files.

## Maintenance trigger

Any dispatch that adds a new shared component OR meaningfully changes a component's props contract MUST update this inventory + emit `Inventory-emission:` line.
