# Pending run — propagation

F28's staleness-coupling rule (rule (c)) fires because this family's governing files (`src/lib/propagation/drain.ts`)
moved bytes after `propagation-run-005.json` was recorded, with no new run artifact yet landed under the
changed code — the exact "the harness changed without a run recording why" gap this marker exists to
acknowledge honestly rather than silently.

**What changed, and why (lane ASSEMBLE-48, 2026-09-05, this family's own proposer pass over
propagation-run-003/004/005 — see `LAST-PROPOSER-PASS.md`).** `runPropagationDrain`'s `queueDepthBefore`
used to read `.from("propagation_events").select("event_id").is("drained_at", null)` with no
`.limit()`/`.range()` and report the fetched array's `.length` — PostgREST silently caps a range-less
response at 1000 rows, so every one of runs 003/004/005 reported a flat `queue_depth_before: 1000` while
the live table genuinely held 2,272-2,778 pending events between them (the CAP-1000 defect class, a fifth
instance F38's own scope note says it does not mechanically catch). Fixed the same way PERF-13/obligations/
run-change-detection were: `queueDepthBefore` now comes from `paginate.mjs`'s `exactCount()`, a real
`COUNT(*)` independent of any row page. `DrainClient`'s `select()`/`then()` types widened to carry the
optional `count` field; the fake test client (`drain.test.mjs`) updated to honor
`{count:'exact', head:true}`, with a new regression test seeding 1,200 undrained events (past both the
default `batch: 500` and the 1000-row PostgREST cap) asserting `queueDepthBefore === 1200`. All 11 of this
family's own unit tests pass; `npx tsc --noEmit` clean.

**No behavior change to the drain's own invalidate/recompute passes, the events it drains, or anything it
writes** — only the diagnostic `queue_depth_before` metric's accuracy. `events_considered`/`invalidated`/
`recomputed`/`skipped_*` are computed exactly as before.

**harness_version at write time:** `sha256:581d2f7d4510235b`

**The planned run that supersedes this marker:** the next real `node scripts/turns/run-propagation-drain.mjs`
dispatch (dry or apply, hand or chained via `propagation-drain.yml`) — its own `propagation-run-006.json`
will carry an accurate `queue_depth_before` for the first time since run-002, and this marker is deleted
the moment that artifact lands with `harness_version: sha256:581d2f7d4510235b` (or updated to a new hash,
per rule (c), if the driver or either governing module changes again before that run lands).
