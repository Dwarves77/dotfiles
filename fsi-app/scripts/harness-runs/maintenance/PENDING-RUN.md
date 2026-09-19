# Pending run: maintenance

F28 rule (b) (first-run acknowledgment, `.discipline/fitness/functions/F28-harness-run-integrity.mjs`):
a family with zero artifacts is reported once, unless its own `PENDING-RUN.md` pins the CURRENT governing
hash. This marker is the honest acknowledgment that rule anticipates, written in the exact format
`parsePendingRunHash` reads (`harness_version at write time: sha256:...`).

**Why this family starts at zero artifacts.** Lane M9b (2026-09-18, closing stage-audit-2026-09-18
`s6-gates-harness.md`'s finding: "the maintenance.yml family uploads an ephemeral artifact instead of
committing one") registered `maintenance` in `ALLOWED_FAMILIES` (`scripts/lib/run-artifact.mjs`),
`GOVERNING_FILES` (`scripts/harness-runs/governing-files.mjs`) and `CONVENTION.md`'s own table, and wired
`.github/workflows/maintenance.yml` to write and commit `maintenance-run-NNN.json` (plus its `traces/`
companion) on every dispatch, in addition to its existing ephemeral `upload-artifact` step. No live
dispatch was possible from the authoring environment (a lane brief executed without workflow-dispatch
authority) -- the same posture `ledger-consume`, `corpus-turn` and `brief-apply` recorded at their own
registration.

**Governing files at registration (this lane's own edits are the last thing to move this hash):**
`../.github/workflows/maintenance.yml` (this lane added the `permissions:` block and the four artifact/
ledger steps between "Flush public/detail caches after a real apply" and "Upload this run's step
artifact(s)") and `scripts/maintenance/lib/cli.mjs` (unchanged this lane).

**harness_version at write time (superseded below, see Re-pin, lane T2):** `sha256:49bfa0f61836330e` (computed via `hashHarnessVersion` against
`governing-files.mjs`'s own `GOVERNING_FILES['maintenance']` array, against this lane's own final tree).

**The planned run that supersedes this marker:** the coordinator's next `.github/workflows/maintenance.yml`
dispatch (any step, dry or apply) -- its own "Write this run's maintenance harness-run artifact" step lands
`maintenance-run-001.json` stamped with the current hash (see Re-pin below; or the hash current at that
time, if a governing file moves again first, in which case this marker is re-pinned per F28's
reverse-audit rather than left stale).

## Re-pin (lane T2, 2026-09-19, env-file loader move)

**What changed.** The recorded hash `sha256:49bfa0f61836330e` no longer matched the live governing files
of this family (`../.github/workflows/maintenance.yml`, `scripts/maintenance/lib/cli.mjs`) on the tree
this push carries. Governing file changed on this branch: `scripts/maintenance/lib/cli.mjs` (moved onto
the one guarded env-file loader, `fsi-app/scripts/lib/env-file.mjs`; no behaviour change for a real run).
This family still has zero valid run artifacts, so this is rule (b)'s first-run acknowledgment being
re-pinned, not rule (c)'s staleness coupling; the marker is re-pinned so F28's acknowledgment set still
matches the live tree. Finished by hand under the old convention (plan section 6.8, cause B; lane N3
removes the stored-hash-pin problem this re-pin works around), not a fix.

**harness_version at write time:** `sha256:b4bf51cff1af98e2` (recomputed via `hashHarnessVersion` against
`GOVERNING_FILES['maintenance']`, unreordered; supersedes `sha256:49bfa0f61836330e`).

**The planned run that supersedes this marker:** unchanged in kind, the coordinator's next
`.github/workflows/maintenance.yml` dispatch, landing `maintenance-run-001.json` under this hash.
