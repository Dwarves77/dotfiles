# Pending run: brief-apply

F28 rule (c) (staleness coupling, `.discipline/fitness/functions/F28-harness-run-integrity.mjs`): the
`brief-apply` family's governing files re-hash to a value no landed artifact records. This marker
acknowledges the change and names the planned run that supersedes it. (The prior hash,
`sha256:b9238d18d4059046`, is what `brief-apply-run-005` and `brief-apply-run-006` record.)

**What changed (2026-09-17, lane L26):** `scripts/turns/record-briefs/schema.mjs`, one of this family's
four governing files, gained the third cut of the numeric-figure mirror's pointer exemption
(`figureCheckText`: hyphenated slot tags, numbered targets, titled instruments with an acronym, code
citations, hyphenated identifiers), learned from batch 005's 71 mirror errors. The driver, the pipeline
and the flywheel steps are unchanged.

**harness_version at the previous pin's write time (superseded below, see Re-pin 2):** `sha256:ee502456353366ce` (recomputed via `hashHarnessVersion` against
`governing-files.mjs`'s own `GOVERNING_FILES['brief-apply']` array, the same 4 files, unreordered).

**The planned run that supersedes this marker:** the next `.github/workflows/brief-apply.yml` dispatch
(dry or apply; either mode writes a run artifact stamped with this hash): batch 005 once its 45 label
restatements have an author pass, or batch 007 once assembled. That artifact lands at this hash, and this
marker is deleted the moment it does (or updated to a new hash if the governing files move again first).

## Re-pin 2 (coordinator, 2026-09-17, at push after rebase: lane/w9-l25-required-slot-mirror-2026-09-17)

**What changed.** The recorded hash `sha256:ee502456353366ce` no longer matched the live governing files of this family (`scripts/turns/apply-record-briefs.mjs`, `scripts/turns/record-briefs/schema.mjs`, `src/lib/agent/canonical-pipeline.ts`, `src/lib/intake/flywheel-steps.mjs`, `scripts/turns/io-preflight.mjs`) on the tree this push carries. Governing files changed on this branch: `scripts/turns/apply-record-briefs.mjs`, `scripts/turns/record-briefs/schema.mjs`. No run of this family landed in between; the marker is re-pinned so F28 measures the tree the run will actually execute on.

**harness_version at write time:** `sha256:6051c508d9d12da4` (recomputed via `hashHarnessVersion` against `GOVERNING_FILES['brief-apply']`, unreordered).

**The planned run that supersedes this marker.** Unchanged in kind from the previous pin; that run's artifact records whatever the tree is when it lands, and this file is deleted or re-pinned per F28's reverse-audit.
