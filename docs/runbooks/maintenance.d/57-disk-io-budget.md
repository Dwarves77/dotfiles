## 57. Disk IO budget: apply ceiling, cooldown, restart

**New this runbook, D32, defect-fix-plan-2026-09-12.md (lane L21, 2026-09-16).** See
`scripts/turns/apply-record-briefs.mjs` (the apply driver) and `scripts/turns/io-preflight.mjs` (the
pre-flight check) for the code this section documents. Cross-linked from
`scripts/turns/record-briefs/README.md`.

**What the budget is**: the Supabase small-tier compute plan does not meter total disk reads, it meters a
BURST allowance -- a bucket that refills over time and empties under sustained heavy reads. On 2026-09-13
the corpus-wide measurement queries that computed the length of result_content plus one sequential 49-item apply emptied it,
and the database stopped answering for three and a half hours. The operator resized the compute tier on
2026-09-13 after the incident; the numbers below (bytes, minutes, MB/s) describe the tier IN EFFECT AT THE
TIME of that incident, not a guaranteed ceiling on the current tier -- recalibrate the thresholds below
(all marked [HYPOTHESIS] in code) once a few metered runs have been observed on the resized tier.

**Symptoms recorded on 2026-09-13** (so a future session recognizes the same failure mode fast): every
database read returned a 522 origin timeout after 20 seconds; the Supabase management SQL path itself
timed out on `select 1`; every Vercel preview build failed at `generateStaticParams`
(`/regulations/[slug]`, before this lane's part (d) fix); the Supabase dashboard read compute at 88
percent, memory 88 percent, disk IO 1 percent, disk 10 percent -- the disk IO percentage looked LOW
because the burst budget was already exhausted, not because the disk was idle.

**Per-run ceiling**: `--io-budget-mb` (workflow input `io_budget_mb`, default 400 MB, 0 = unlimited). The
apply driver meters bytes read (every selected item's pool, counted once at plan-build time, plus each
applied item's own pool bytes times `PIPELINE_POOL_REREADS`, a named constant estimating the canonical
pipeline's own re-reads inside generate/ground) and stops cleanly before it would exceed the budget. The
remaining plan entries are recorded `not_applied_io_budget`, naming the last item actually applied so the
next dispatch resumes with `--after-id`. Exit code stays 0 -- a clean budget stop is not a failure.

**Cooldown between applies**: `--cooldown-min` (default 30 minutes). Before the first item of an
`--execute` run, the driver reads the last `brief_apply_runs` row (migration 322) and refuses to start if
it finished within the cooldown window, or if it has no `finished_at` and started less than 60 minutes ago
(still running, or crashed without recording an outcome -- an OLDER null-`finished_at` row is ignored
rather than refusing forever on an ambiguous state).

**Pre-flight sample thresholds**: `--io-busy-max` (default 0.5, a fraction) and `--io-read-mbps-max`
(default 40 MB/s), both [HYPOTHESIS] -- calibrate from the first metered runs on the resized tier. The
driver takes two Prometheus metrics samples 30 seconds apart from the project's own metrics endpoint (see
below) and refuses to start if the busiest db device's busy fraction or read throughput exceeds either
threshold. A non-200 response, a timeout (10 seconds per request), or an unparseable body does NOT refuse -- it logs "metrics
unavailable, continuing on cooldown alone" and the cooldown check decides by itself.

**Reading the metrics endpoint by hand** (never paste the key into a log or a commit):

```
curl -s -u service_role:$SUPABASE_SERVICE_ROLE_KEY \
  https://<project-ref>.supabase.co/customer/v1/privileged/metrics \
  | grep 'service_type="db"'
```

The project ref is the host segment of `NEXT_PUBLIC_SUPABASE_URL` (e.g. `kwrsbpiseruzbfwjpvsp` for
`https://kwrsbpiseruzbfwjpvsp.supabase.co`). The response is Prometheus text exposition format
(~244 KB, verified live by the coordinator 2026-09-16); the two counters that matter here are
`node_disk_read_bytes_total{...service_type="db",device="..."}` and
`node_disk_io_time_seconds_total{...service_type="db",device="..."}`. Take two readings some seconds
apart and diff them by hand to eyeball throughput/busy-fraction the same way `sampleDiskCounters`
(`scripts/turns/io-preflight.mjs`) does automatically.

**Coordinator rule**: corpus-wide capture-length scans are FORBIDDEN. `agent_run_searches.result_chars`
(migration 322, trigger-maintained, indexed on `(intelligence_item_id, result_chars)`) is the measure --
any query or script that needs to know how long a capture is reads `result_chars`, never computes the
length (or char_length) of result_content in SQL (enforced by
`scripts/verify/capture-length-scan.test.mjs`). Readers that need the capture TEXT itself (grounding,
export, census) are unaffected -- this rule is about MEASURING length, not reading content.

**Restart procedure** (after a disk-IO-budget hang, or after a pre-flight refusal):

1. Wait for the burst budget to refill -- there is no fixed duration; it depends on how far it was
   overdrawn. Do not re-dispatch on a timer alone.
2. Confirm via the Supabase dashboard that compute/memory/disk-IO percentages have returned to their
   normal resting range for this tier.
3. Confirm `select 1` answers promptly through the management SQL path (the same path that timed out
   during the 2026-09-13 incident is the first thing to check, not a client-side read).
4. Re-dispatch `apply-record-briefs.mjs` with `--after-id` set to the last item actually applied, read
   from the prior run's own harness-run artifact (`metrics.last_item_id`) or, if that run itself crashed
   before writing an artifact, from the `brief_apply_runs` row's own `bytes_read`/`items_applied` (best-
   effort, may be stale if the crash happened before the row's own update).

---

