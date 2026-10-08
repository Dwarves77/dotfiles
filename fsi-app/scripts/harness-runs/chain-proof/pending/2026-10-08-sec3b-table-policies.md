## Change

Lane SEC-3b (2026-10-08) added six attacks to `fsi-app/scripts/proof/attacks/attacks.json` (a governing file of this
family): sec3b-org-plan-self-upgrade-refused, sec3b-member-verified-badge-refused,
sec3b-org-membership-role-escalation-refused, sec3b-post-signoff-and-author-forgery-refused,
sec3b-signoff-self-decision-and-group-takeover-refused and sec3b-viewer-cannot-write-workspace-tables. They attack
migration 370 (NOT APPLIED when this lane merges); they pass only on a stack where 370 has been replayed.

## Planned run

The coordinator's first dispatch of `chain-proof.yml` after migration 370 is applied and this lane merges. Its run
artifact supersedes this marker; delete it in the change that lands that run. Nothing was fired in this lane.
