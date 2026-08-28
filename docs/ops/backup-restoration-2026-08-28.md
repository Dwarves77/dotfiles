# Backup lane restored and drill-verified (2026-08-28)

The `db-backup` workflow in `Dwarves77/caros-ledge-backups` failed **9 consecutive runs (#47 Aug 20 →
#55 Aug 28)**. This is the run record for the diagnosis and the restoration, and it is filed here
rather than only in the session log because the backup posture is a standing recovery commitment
(`docs/ops/backup-posture.md`) and a 9-day gap in it is a fact future sessions must be able to find.

## Root cause — read from the job log, not inferred

```
Error: Failed to CreateArtifact: Artifact storage quota has been hit.
Unable to upload any new artifacts. Usage is recalculated every 6-12 hours.
```

The dump itself **always succeeded** — `pg_dump` ran clean every night (~49s). What failed was the
UPLOAD. Because the `dump` job failed, `pool-dump`, `restore-drill` and `pool-restore-drill` were all
SKIPPED by their `needs:` edges.

**So the real exposure was worse than "no backup last night": for 9 nights there was no stored backup
AND no restore test.** The split-lane design (2026-08-17, product 7d / pool 21d) was correct and its
sizing was honest — it was measured at 532 MB — but the GitHub **Free** tier's artifact ceiling is
500 MB. The design was always going to breach it; the Aug-17 fix bought 3 days, not a solution.

## The fix — account tier, not code

The operator upgraded the account to **GitHub Pro** ($48/yr), raising artifact storage 500 MB → 2 GB.
**No workflow change was made.** The workflow was never the defect and was deliberately not touched;
editing it would have been a speculative change on a correct file.

## Verification — run #56, `workflow_dispatch` with `lanes=both`

Dispatched manually with BOTH lanes rather than waiting for the nightly, so the weekly pool lane and
both restore drills were exercised in the same run — the full path, not the subset the nightly runs.

| Job | Result |
|---|---|
| plan | 4s ✓ |
| dump (product) | 22s ✓ |
| pool-dump | 47s ✓ |
| restore-drill | 38s ✓ |
| pool-restore-drill | 1m 0s ✓ |

Status **Success**, total 1m 59s. Artifacts produced, with digests:

- `db-dump-2026-08-28T2107Z` — **28.8 MB**, sha256 `60cd0bd797713d2c…`
- `pool-dump-2026-08-28T2107Z` — **102 MB**, sha256 `1310e15c0a4c386e…`

Both drills are ASSERTING drills, not smoke tests — they exit nonzero on a per-table manifest
row-count mismatch, on the pool exclusion silently ceasing to work (asserted in both directions), and
on the grounding-pool content column coming back empty. Green here therefore means the backup was
**restored and verified**, not merely written. Measured sizes match the 2026-08-17 sizing (30 MB /
107 MB predicted) within 4%, so the split's own premise still holds.

## Residuals — named, not silently carried

- **Node 20 deprecation (4 warnings).** `actions/upload-artifact@v4` and `actions/download-artifact@v4`
  target Node 20 and are being force-run on Node 24 by the runner. Not breaking today; a v5 bump is
  owed before GitHub removes the fallback, or this lane goes dark again for a different reason.
- **First unattended confirmation** is the next 08:17 UTC scheduled run. Run #56 was manual; a manual
  green is not yet proof the schedule is healthy.
- **Detection latency is the deeper finding.** The lane failed for 9 days and the signal was a GitHub
  notification email that nobody acted on. The backup posture doc commits to an RPO; it does not
  commit to noticing when the RPO is not being met. That gap is real and is not closed by this run.
