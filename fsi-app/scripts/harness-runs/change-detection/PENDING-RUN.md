# Pending run — change-detection

F28 rule (b) (first-run acknowledgment, `.discipline/fitness/functions/F28-harness-run-integrity.mjs`):
this family is registered (`ALLOWED_FAMILIES` in `scripts/lib/run-artifact.mjs`, `GOVERNING_FILES.
'change-detection'` here) but carries zero valid run artifacts yet — this lane (CD, change-detection
runtime, system-completion train, 2026-09-02) built the driver, the workflow, and the two library changes
it drives (`src/lib/sources/reconcile.ts`'s `dryRun` option, `src/lib/intake/run-intake-cycle.ts`'s
exported `drainChangeSweepUpdates`) inside a sandbox with no `NEXT_PUBLIC_SUPABASE_URL` /
`SUPABASE_SERVICE_ROLE_KEY` and no network egress to a deployed `APP_URL` — the same "correct but
unrunnable here" gap ADR-023 named for the data producers and `source-sweep`'s own first PENDING-RUN.md
(git history, `source-sweep/PENDING-RUN.md`, before it was discharged by `source-sweep-run-004`) named for
the enumeration walkers.

**What this family is:** `scripts/turns/run-change-detection.mjs` drives the detect → reconcile → drain
chain that already existed in the codebase but had never run through a runtime end to end — see that
file's own header, and `docs/runbooks/CORPUS-TURN-RUNBOOK.md`'s new "Change detection" section, for the
full three-step chain and the limitations found reading `check-sources/route.ts` while building this
(hardcoded batch size, response body missing `changeDetected`/`portalCandidates` per source).

**harness_version at write time:** `sha256:7e32e681746e2a7b`

**The planned run that supersedes this marker:** `change-detection-run-001.json`, dispatched by the
coordinator (`docs/plans/system-completion-plan-2026-09-02.md` §2, "Not a lane — operator-only") via
`.github/workflows/change-detection.yml` with `mode: dry` first (a read-only projection over the live
`sources`/`monitoring_queue`/`staged_updates` tables — see the driver's own dry-mode contract), read
against the live tables, then `mode: apply` once the dry artifact confirms the chain behaves as designed.
Per F28's reverse-audit, this file is deleted the moment an artifact carrying the hash above lands.
