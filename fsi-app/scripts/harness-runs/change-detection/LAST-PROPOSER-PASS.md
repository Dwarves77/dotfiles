# Last proposer pass — change-detection

Per `PROPOSER-RUNBOOK.md` §2's attestation format. `change-detection` has **one** artifact
(`change-detection-run-001`); F28's rule (d) does not yet require this file, it is written because the
artifact was read. Latest: **change-detection-run-001**.

**Artifact read:** change-detection-run-001 (dry, GitHub Actions run 33631450443, 2026-09-02T12:43Z,
`sha256:331700b02e68fe83`, `check_limit 10`, `reconcile_batch 200`, `drain_limit 5`) and its
`traces/change-detection-run-001.result.json`.

**What it shows:** 959 sources due for a check, none checked (dry never calls the route, which writes
`sources`/`monitoring_queue`/`portal_link_candidates`); the ten sampled due sources are listed per item
(`due_not_checked`, EUR-Lex tier-1 regulations first); 0 pending change rows, 0 staged updates, 0 drained.
The chain's state before its first apply is exactly what the live table said on 2026-09-02 morning: nothing
pending because the check-sources route has not run since the acquisition freeze.

**What the first apply will cost and show:** `check_limit` sources rendered through Browserless (2 units
each estimated, unconfirmed against billing), then the route's own in-process reconcile, then this driver's
second reconcile (expected near-zero, the route claimed the rows) and the drain (≤5 staged updates re-verified
at $0). Dispatch with `check_limit 10` first and read `changes_detected` against `monitoring_queue`.
