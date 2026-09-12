# Pending run: brief-apply

F28's rule (b) first-run acknowledgment (`.discipline/fitness/functions/F28-harness-run-integrity.mjs`):
a newly-registered harness family has zero valid artifacts on record. This marker pins the CURRENT
governing-file hash, written in the exact format `parsePendingRunHash` reads (`harness_version at write
time: sha256:...`), so the family is registered-and-pending rather than historyless (see CONVENTION.md's
own header on this distinction).

**What this family is** (task 3.4, brief-chain build plan Part 3, 2026-09-11): the driver
(`scripts/turns/apply-record-briefs.mjs`) that turns a validated record-briefs file (task 3.2's
`schema.mjs`) into a fully connected item - generate (the injected-synthesis seam, task 3.3) -> section ->
ground -> grow -> the per-item flywheel (discovery/forward-events/compliance-deadline/entities) -> the
batch-level unscoped flywheel steps. No live dispatch was possible from the authoring environment (no
committed `record-briefs-NNN.json` batch exists yet for a session lane to have authored, and this lane's
own instructions were dry-mode-only / no database writes) - the same posture `ledger-consume` and
`corpus-turn` recorded at their own registration.

**Governing files** (`scripts/harness-runs/governing-files.mjs`'s `GOVERNING_FILES['brief-apply']`):
`scripts/turns/apply-record-briefs.mjs`, `scripts/turns/record-briefs/schema.mjs`,
`src/lib/agent/canonical-pipeline.ts`, `src/lib/intake/flywheel-steps.mjs`.

**harness_version at task 3.4's original write time (superseded below, see Fix round 1):** `sha256:d1ea74924de7d828`

**The planned run that would have superseded THAT marker:** the first `brief-apply-run-001.json`, from the
first `.github/workflows/brief-apply.yml` dispatch (dry or apply). No such run landed before Fix round 1's
own edits moved the hash again (see the re-pin below).

---

## Fix round 1 (coordinator review, 2026-09-11)

**What changed.** Two things moved `brief-apply`'s own hash since the original pin: (1) the branch was
rebased onto `origin/master` (Part 1 merged at `c63c0bf9`), which changed `src/lib/agent/canonical-pipeline.ts`
(one of this family's own governing files) independent of anything this task did; (2) fix round 1's own
edits changed `scripts/turns/apply-record-briefs.mjs` itself (the DI refactor for `applyOneEntry`, the
crash-safety `finally`-block rewrite of `main()`, and the dry-mode wording correction). No live dispatch has
happened yet (dry-mode-only per instruction, and no committed `record-briefs-NNN.json` batch exists for a
session lane to have authored) — still zero artifacts, the same posture as the original pin.

**harness_version at write time:** `sha256:ca5d7b8b2da57a61` (recomputed via `hashHarnessVersion` against
`governing-files.mjs`'s own `GOVERNING_FILES['brief-apply']` array, the same 4 files, unreordered;
supersedes `sha256:d1ea74924de7d828` outright).

**The planned run that supersedes this marker:** the first `brief-apply-run-001.json`, from the first
`.github/workflows/brief-apply.yml` dispatch (dry or apply - either mode writes a run artifact; see that
workflow's own header) against a real committed record-briefs batch. Per F28's reverse-audit, this file is
deleted the moment an artifact carrying the hash above lands, or re-pinned if a governing file changes
again before that run lands (`canonical-pipeline.ts` in particular changes often across this build - see
CONVENTION.md's own "brief-apply" entry for why that file is a governing file here despite its size).

---

## Re-pin 2 (coordinator, 2026-09-12, the PR #640 CI fix)

**What changed.** `scripts/turns/apply-record-briefs.mjs` (a governing file of this family) now loads
`@supabase/supabase-js` lazily inside `main` instead of at module top level, so the driver's test can run
in the no-npm discipline job (the ERR_MODULE_NOT_FOUND red on PR #640; see the session-log entry of the
same date). Still zero artifacts: no `brief-apply.yml` dispatch has happened, the same posture as above.

**harness_version at write time:** `sha256:12f20d5562b6e005` (recomputed via `hashHarnessVersion` against
`GOVERNING_FILES['brief-apply']`, the same 4 files; supersedes `sha256:ca5d7b8b2da57a61` outright).

**The planned run that supersedes this marker:** unchanged, the first `brief-apply-run-001.json` from the
first `brief-apply.yml` dispatch (Part 6's pilot batch, `record-briefs-001.json`).
