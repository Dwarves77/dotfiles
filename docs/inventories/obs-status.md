# OBS Status Inventory

Index of every OBS entry across sprint followups docs with state at a glance. Maintained per the Inventory-artifact emission rule + the sprint-followups-discipline loop-closure obligation.

## Status

**STUB** (created 2026-05-20). The authoritative source is `docs/sprint-1/followups.md` (and future `docs/sprint-N/followups.md`); this index mirrors state for quick scan-ability.

## Expected columns when populated

| Column | Source |
|---|---|
| OBS-N | Entry number |
| Title | One-line headline |
| State | Open / Implemented / Cleared / Deferred / Reopened |
| Sprint | 1 / 2 / N (which sprint's followups doc owns it) |
| Cross-references | Related OBS, DP entries, dispatch commits |
| Last touched | Most recent commit that modified the entry |

## Current snapshot (2026-05-20)

Per grep of `docs/sprint-1/followups.md` headers: **OBS-1 through OBS-57** captured. State distribution requires enumeration; deferred to first populated-form pass.

## Source of truth

```bash
grep -n "^## OBS-" docs/sprint-1/followups.md
```

## Maintenance trigger

Any dispatch that adds, reopens, or closes an OBS entry MUST update this inventory + emit `Inventory-emission:` line. Per the Dispatch-artifact commit-summary rule (8th binding rule), the `Loop-closure:` line in the commit body already captures per-OBS outcomes; this inventory aggregates them across time.
