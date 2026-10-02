## Change

Lane R3 (GUARDED-UPSERT remediation, remediation-plan-2026-09-30.md item 3, 2026-10-01/02) migrated
`upsertPortalLinkCandidates` in `scripts/turns/run-source-sweep.mjs` off a raw
`sb.from("portal_link_candidates").upsert(...)` onto the new `guardedUpsert` helper in
`scripts/lib/db.mjs` (rule-015 guarded write path), via an injected `deps.upsertRow` defaulting to the
real `guardedUpsert`. No behaviour change for the two in-file callers (`persist`, `persistFor`), which
call with their existing 3 args and get the real guarded path by default. No run of this family has
landed since this change.

## Planned run

The next `source-sweep-run-NNN.json` for this family. Delete this file the moment that artifact lands.
