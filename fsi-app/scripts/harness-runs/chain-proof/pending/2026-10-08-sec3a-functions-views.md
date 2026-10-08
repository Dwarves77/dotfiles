## Change

Lane SEC-3a (2026-10-08, coordinator ruling A) changed the publish_aggregate entries of
`fsi-app/scripts/proof/attacks/attacks.json` (a governing file of this family): publish_aggregate becomes
service_role only in migration 369, so the ADR-035 floor and dominance attacks now run as the service role, and an
authenticated leg and an anonymous leg were added that must be refused 42501.

## Planned run

The coordinator's next dispatch of `chain-proof.yml` after migration 369 is applied. Its run artifact supersedes this
marker; delete it in the change that lands that run. Nothing was fired in this lane.
