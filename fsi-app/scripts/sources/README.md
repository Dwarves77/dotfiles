# Inaccessible-source triage

Written 2026-09-02, Lane F2 (`docs/plans/finish-plan-2026-09-02.md` §2 Wave 1: "F2 — monitoring
restart, the inaccessible 215"). Governs `scripts/sources/inaccessible-triage.mjs` and the
`triage-inaccessible` job in `.github/workflows/source-monitoring.yml`.

## What "inaccessible" means here

The finish plan's "215 inaccessible sources" are the `sources` rows where `status = 'suspended'`.
`scripts/lib/exclusion-audit.mjs`'s own header states the live-schema mapping: in the design
vocabulary an "inaccessible source" is what the live schema calls `suspended` — there is a
separate, legacy `status = 'inaccessible'` enum value written by the accessibility-check eviction
path, but it is not this population. `inaccessible-triage.mjs`'s population query is exactly
`sources WHERE status = 'suspended'`.

## Why a ladder, not a re-check

A suspended source has never been triaged with the *completed* acquisition ladder
(`docs/audits/acquisition-ladder-post-mortem-2026-07-14.md`): roadblock → bounded alternative-source
search → same-floor qualification. Before that ladder existed, "inaccessible" could mean nothing
more than one dead re-fetch of the same URL. Nothing is written off without ladder evidence — a
dossier is produced for **every** triaged source, regardless of outcome, and the dossier IS the
evidence.

The script reuses the live ladder rather than reimplementing fetching, officialness, or
same-floor qualification:

| Ladder step | Reused from | Function |
|---|---|---|
| 1. re-probe the primary | `src/lib/sources/primary-fallback.mjs` | `fetchPrimaryWithFallback`'s own declared-primary attempt, `detectRoadblock` |
| 2. bounded alternative search | `src/lib/sources/seek-more.mjs` | `generateCandidates` (identifier-resolved canonical URLs → the source's own search surface; no open-web search — $0/no-LLM) |
| 3. same-floor qualification | `src/lib/sources/host-authority.ts` + `src/lib/sources/officialness.mjs` | `classTierForHost` gates an alternative against the source's own `base_tier` (the SC-13 moat: an alternative may never confer authority a static classification would not); `officialnessOf` records the richer host+instrument verdict as evidence |

A standalone HEAD probe (`probeHead`) and the capture-worker's own header pair (`PRIMARY_HEADERS` /
`ALT_HEADERS_ON_403`, duplicated from `supabase/functions/capture-worker/index.ts` since a Deno edge
function is unreachable from a Node script) add independent status/redirect/final-URL evidence
alongside the ladder's own classification.

## What a dossier contains

One JSON file per triaged source, `dossiers/<source_id>.json`:

```jsonc
{
  "source_id": "...", "url": "...", "name": "...", "base_tier": 2,
  "probe": { "head": { "status": 200, "redirected": false, "finalUrl": "..." },
             "primary": { "status": 200, "reason": "cdn_block", "len": 553, "langRatio": 0.98, "finalUrl": "..." } },
  "ladder_steps": [ { "url": "...", "role": "declared_primary", "reason": "cdn_block", "len": 553, "langRatio": 0.98 },
                    { "url": "...", "role": "alternative", "reason": "ok", "len": 5000, "langRatio": 0.99 } ],
  "outcome": "recovered | alternative_found | still_inaccessible",
  "evidence": { /* outcome-specific: qualifiedUrl/hostTier/floorTier/qualifies/officialness, or candidatesTried, or a plain note */ }
}
```

`dossiers/_summary.json` carries the run totals (`suspended`, `triaged`, `skipped_time_budget`,
`errored`, and a count per outcome).

## How to dispatch

Actions tab → **Source monitoring** → Run workflow:

- `job` = **triage** (default `check-sources` runs only the existing worker call — unchanged).
- `mode` = `dry` (default; ladder + dossiers, writes nothing) or `apply` (also writes
  `sources.fetch_status` — see below).
- `limit` = optional cap on how many suspended sources to triage this run.
- `time_budget_min` = optional, default 20; once elapsed no *new* source triage starts (an
  already-started one finishes under its own per-fetch bound). Keep it under the job's 30-minute
  timeout.

The job runs on the GitHub-hosted runner (not the app's own container) because it can reach hosts
Browserless/the deployed app cannot. It is concurrency-bounded (≤4 sources at once) and per-host
polite (≥1s between hits to the same host, primary and every alternative). `check-sources` is
unaffected by this job — its step is untouched and it still runs unconditionally on any manual
dispatch, exactly as before this change.

`dossiers/` is uploaded as a workflow artifact (`inaccessible-source-dossiers-<run_id>`,
90-day retention) at the end of every run, dry or apply.

## The one sanctioned mutation

`--apply` writes **only** `sources.fetch_status` / `fetch_status_at` (migration 147) — the same
column the live monitoring chain already writes at the item primary-fetch site
(`src/lib/agent/canonical-pipeline.ts`'s `recordSourceFetchStatus` / `fetchStatusFromPf`).
`fetchStatusForDossier` mirrors that function's 4-case vocabulary exactly (`recovered` → `ok`;
`cdn_block` / `soft_404` stay themselves; every other roadblock reason → `blocked`; no determinate
reason → leave unchanged) so the two writers of this column can never disagree on meaning. The
write goes through the guarded path (`scripts/lib/db.mjs`'s `guardedUpdateByIds` — snapshot +
skill-cite, discipline rule 015).

If `sources.fetch_status` does not exist on the live schema (migration 147 is schema DDL under the
two-track policy and may not be applied yet), `--apply` detects the "column does not exist" error on
first write, stops writing further, and says so in its output — the dossiers stand as the artifact
either way.

## How the survivors reach R1

Dossiers whose `outcome` is `still_inaccessible` are the honest terminal of the ladder: primary
roadblocked, no fetchable/qualifying alternative found. This script does **not** decide their fate —
it never suspends or unsuspends a row beyond the `fetch_status` mirror above. The `still_inaccessible`
dossiers are the evidence lane R1 (`docs/ratifications/2026-09/**`, `fsi-app/scripts/review/**`) reads
to build its keep/suspend ratification digest for the 927 provisional-source population. Do not build
that digest here — R1 owns it.

## Local / dev

```
node scripts/sources/inaccessible-triage.mjs                                   # dry run, default 20-min budget
node scripts/sources/inaccessible-triage.mjs --apply
node scripts/sources/inaccessible-triage.mjs --limit 20 --out-dir /tmp/d --time-budget-min 5
```

Needs `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` (loaded from `.env.local` when
present); with no DB credentials the script exits 2 rather than crash. `node --test
scripts/sources/inaccessible-triage.test.mjs` runs fully offline (fake fetch, fake DB) except one
`test(..., { skip: process.env.LIVE_PROBE !== '1' })` smoke case that makes one real HEAD request.
