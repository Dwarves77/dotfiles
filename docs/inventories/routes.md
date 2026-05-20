# API Routes Inventory

Catalog of every API route under `fsi-app/src/app/api/`. Maintained per the Inventory-artifact emission rule (sprint-followups-discipline 11th binding rule) so future dispatches touching route surfaces don't re-spelunk the file tree to know what exists.

## Status

**STUB** (created 2026-05-20 as the inventory directory's first non-skills occupant).

Next substantial dispatch that touches routes (Build 7 Market Intel, Build 8 Research, an admin-gating sweep, anything in `src/app/api/`) populates this inventory per the 11th binding rule.

## Expected columns when populated

| Column | Source |
|---|---|
| Path | `src/app/api/<...>/route.ts` |
| Methods | GET / POST / PUT / DELETE |
| Auth | `requireAuth` + `isPlatformAdmin` + `x-worker-secret` + public |
| Purpose | One-line summary |
| Touched by | Most-recent commit SHA + dispatch reference |

## Source of truth

The route files themselves. Enumerate via `Glob("fsi-app/src/app/api/**/*.ts")`.

## Maintenance trigger

Per Inventory-artifact emission rule: any substantial dispatch that adds, removes, or modifies a route MUST update this file and emit an `Inventory-emission:` line in the commit message.
