# Fetch-drain protocol — every lane's contract (Wave MH-2)

This is the fetch-drain family's counterpart to `scripts/mint/MINT-RUNBOOK.md` §6's mandatory emission
step and `scripts/mint/screen-worklist.mjs`'s in-code emission wiring: the drain family has no single
runner script (a drain lane invokes `capture-worker` directly — via `pg_net`/`execute_sql` batches, or a
replay pass over `pending_first_fetch`/error-row exports — so there is nothing to wire emission INTO the
way `screen-worklist.mjs` wires its own). This document is therefore where "emission is in the harness,
not the operator" (build plan §2) lives for this family: **every drain lane's brief includes this
protocol's steps as part of the lane's own scope, not as an optional follow-up.**

See `scripts/harness-runs/CONVENTION.md` for the artifact schema and `PROPOSER-RUNBOOK.md` for the
read-before-you-run cadence. `fetch-drain`'s governing file (per CONVENTION.md's `harness_version`
table) is `supabase/functions/capture-worker/index.ts` — the ONE file whose content hash is this
family's `harness_version`.

## 1. Before the lane starts — the proposer pass

Per `PROPOSER-RUNBOOK.md` §1: read every artifact in `scripts/harness-runs/fetch-drain/` in full,
`started_at` order, including every path in each artifact's `full_trace_refs` — not just `metrics` and
`defects_found`. Read `LAST-PROPOSER-PASS.md` first; it names the latest run this family has already
had a proposer pass against. If a defect's `fix_ref` is `null` (an open item — e.g. the HTTP/2 cluster
`fetch-drain-run-002.json` names), confirm it is still open before treating it as settled by a later fix
that closed something else.

## 2. During the lane — capture the per-item evidence AS the lane runs, not from memory afterward

Every drain lane classifies rows into an outcome vocabulary (`captured`, `terminal_error`,
`hang_past_120s_timeout`, `retry_after_v1_6`, `singleton_mixed`, or whatever this run's own report calls
it — family-native, never invented). Log queue_id/URL, outcome, and error text AS each row resolves —
this is what `per_item` and `defects_found` are built from at step 3, and it is exactly the discipline
`fetch-error-dispositions.md`'s per-class tables already followed for `fetch-drain-run-002.json`
(mechanically parsed from the doc's own tables, not manually transcribed, per that artifact's own
`proposer_notes` — the deliberate avoidance of `mint-run-001.json`'s transcription-error class).

## 3. MANDATORY, the lane's last step — write the run artifact

Every drain lane ends by writing `scripts/harness-runs/fetch-drain/fetch-drain-run-NNN.json` (`NNN` =
next unused number after the highest `fetch-drain-run-*.json` already in that directory). This is not
optional follow-up work — a lane report is not done until this file exists, exactly as
`MINT-RUNBOOK.md` §6 states for mint and `screen-worklist.mjs`'s own execution path enforces for screen.
The writer invocation:

```js
import { writeRunArtifact, hashHarnessVersion } from "./scripts/lib/run-artifact.mjs";

const harness_version = hashHarnessVersion([
  "supabase/functions/capture-worker/index.ts",
]); // baseDir defaults to cwd — run from fsi-app/

writeRunArtifact("scripts/harness-runs/fetch-drain", {
  harness_family: "fetch-drain",
  harness_version,
  run_id: "fetch-drain-run-NNN",          // next unused number, zero-padded 3 digits
  started_at: "<ISO 8601 UTC — this lane's own start time>",
  config: {
    worker_version_deployed: "<the deployed capture-worker version/commit this lane actually ran against>",
    invocation_mechanism: "<pg_net batch / replay-over-export / whatever this lane used>",
    invocations: /* count */,
    supabase_project: "<project ref>",
    db_access: "<guarded-write-path description — see fetch-drain-run-001.json for the shape>",
  },
  inputs_ref: [ /* the live query this lane's population came from, or the export file path */ ],
  per_item: [ /* every row this lane touched, at the scale CONVENTION.md's "per_item at scale" rule
                  allows — the full population always lives in full_trace_refs regardless */ ],
  metrics: {
    /* rows_analyzed, class_breakdown, capture_success_rate_this_replay, recommendation_breakdown —
       the fetch-drain family's standing metric (capture success rate per attempt class), per
       PROPOSER-RUNBOOK.md §3 */
  },
  defects_found: [ /* anything this lane found wrong; root_cause; fix_ref (null if unfixed) */ ],
  full_trace_refs: [ /* the report file(s) this lane produced — never summarized */ ],
  proposer_notes: "",
});
```

A lane that skips this write is exactly the gap `F28` (harness-run-integrity, Wave MH-2) exists to
catch: a harness family whose code changed (or whose lane ran) without a run artifact recording why.
Unlike mint/screen, `capture-worker/index.ts` changing (a new worker version deployed) without a
corresponding `fetch-drain-run-NNN.json` — or a `PENDING-RUN.md` naming the deploy and the drain lane
that will measure it — is the exact "harness changed without a run recording why" case F28's rule (c)
checks: see `fetch-drain-run-001.json`/`-002.json`'s shared `harness_version`
(`sha256:763f9e0293042adf`, unchanged across both runs because v1.6, commit `0735a410`, is authored but
**not yet deployed** — deploying it without a following drain-lane artifact would trip F28's staleness
coupling the moment it lands, and correctly so).

## 4. After ≥2 runs exist — proposer attestation

Once `scripts/harness-runs/fetch-drain/` holds ≥2 valid artifacts, `LAST-PROPOSER-PASS.md` must name the
latest run's `run_id` (F28 rule (d)). Update it as part of the SAME lane that writes the new artifact —
not a follow-up task, the same discipline as step 3.
