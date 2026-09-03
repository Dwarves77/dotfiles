# Runbook: Population turn

Written 2026-09-03, lane DOCS2, filling a gap: `.github/workflows/population-turn.yml` had no runbook
of its own in `docs/runbooks/` — its mechanics were documented only from the mint kit's own side
(`fsi-app/scripts/mint/MINT-RUNBOOK.md` §11, read there for the exporter/apply-batch/workflow internals
in full; this file is not a duplicate of that section, only the coordinator-facing dispatch and
landing procedure it does not itself cover) and from planning docs
(`docs/plans/record-tier-population-plan-2026-09-01.md`, `docs/plans/population-pass-2026-09-03.md`
§3). This runbook is the `docs/runbooks/` counterpart to `CORPUS-TURN-RUNBOOK.md`, covering the same
kind of ground for the population family: what a run is, how to dispatch it, and — the specific gap
this lane was asked to close — the actual landing path once the run's branch is pushed, since the PR
this workflow tries to open is refused on this repository the same way `corpus-turn.yml`'s is.

## What a population-turn run is

One run = `stamp-wo26-archive-reason.mjs` (apply only in apply mode) → `export-census-rows.mjs`
(join `census_worklist` would-mint rows to their source and capture text) → `run-mint-batch.mjs
--census-rows --grade record --execute` (the mint kit's own validating gate, unmodified) →
`apply-mint-batch.mjs` (apply only in apply mode; the guarded write, M4 pre-check, `census_worklist`
reconcile stamp) → `propose-tags.mjs --dry` (surfaces the newly-minted items' empty connection-signature
tags for a later, separate `tag-proposals`/`tag-ratification` MAINT step — this workflow never applies
tags itself). Read `MINT-RUNBOOK.md` §11 for what each step actually does; this file only names the
chain so the landing section below makes sense without cross-referencing that governing file.

## How to dispatch

Actions tab → **Population turn** → Run workflow. Inputs: `mode` (`dry`/`apply`), `limit` (payloads per
run — `population-turn.yml`'s own default is `50`; `docs/plans/population-pass-2026-09-03.md` §3
recommends `200` once the pipeline is proven, repeated until the on-vertical pool is exhausted),
`source_id` / `celex_prefix` (optional narrowing), `capture` (`true` fetches live text for rows with no
existing capture), `rows_file` (optional — skip the live export and run the batch/apply steps directly
against a pre-built rows file, e.g. for the browser-capture escape hatch `MINT-RUNBOOK.md` §11's
addendum documents). Secrets already wired in the workflow env: `NEXT_PUBLIC_SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `APP_URL`, `WORKER_SECRET`. Run `dry` first, read the artifact
(`minted`/`minted_verified`/`apply_failed`/`census_rows_reconciled`/held reasons) against the live
tables, then `apply`.

## Landing a run: what the workflow tries, and what actually happens on this repository

The workflow ends by committing `scripts/harness-runs/mint/` plus the run's own export/apply-ready/
report files to a fresh `population/<run_id>` branch, pushing it, and calling
`scripts/turns/deliver-artifact-branch.sh` to open a PR from that branch to `master`. **That PR attempt
is refused on this repository**: the setting **Settings → Actions → General → Workflow permissions →
"Allow GitHub Actions to create and approve pull requests"** is off, the same setting
`CORPUS-TURN-RUNBOOK.md`'s "When the workflow cannot open its own PR" section documents for
`corpus-turn.yml`/`source-sweep.yml`. `deliver-artifact-branch.sh` is the same script both workflow
families call, so the fallback is identical: it records the pushed branch and its compare URL as a
comment on the standing **"Runtime artifact branches awaiting a hand-opened PR"** issue, emits a
warning annotation and step summary, and exits green. A green population-turn run with that warning
means the mint batch really ran (or really planned, in dry mode) — the DB writes, the census reconcile
stamp, and the harness artifact are all real — but the branch itself is not on `master` yet.

**A pushed `population/<run_id>` branch sits orphaned until a coordinator lands it — it is not done
just because the workflow went green.** Confirmed directly (session-log Addendum 84 ps-level notes,
2026-09-02): after apply run #14 (`33749140151`, branch `population/33749140151`, `mint-run-016`),
the record reads "Neither dry nor apply opens a PR: the repository's Actions setting refuses PR
creation, so each run pushes `population/<run_id>` and records it on the tracking issue; the artifacts
are read from the branch (`git fetch origin population/<id>`), and the branches still need landing on
master ... or they stay orphaned," naming `population/33747655857` and `population/33749140151` as the
two branches still to land at that point. The same orphaning happened to a `corpus-turn` branch the
next day (`forward-events-run-003`, run 33658489880, sat unlanded on its `turn/` branch for a full day
before the next train landed it — see `CORPUS-TURN-RUNBOOK.md`'s own landing-path section) — this is a
property of `deliver-artifact-branch.sh`'s fallback shared by every family that calls it, not a
population-turn-specific defect.

**The actual landing path**, once the PR attempt is refused:
1. `git fetch origin population/<run_id>` and read the run's artifact off that branch (not off
   `master` — it was never merged there).
2. Cherry-pick the run's own commit onto the coordinator's current integration train, alongside
   whatever else is landing in the same pass — the same multi-branch cherry-pick pattern used to land
   concurrent lanes (session-log's "Nine lanes, zero cherry-pick conflicts" entries show the general
   shape of a train landing).
3. Run the mint family's own F28 proposer pass over the newly-landed artifact and record its own
   session-log addendum — the discipline memory gate exempts the run-record commit itself
   (`scripts/harness-runs/**`), never the proposer pass over it.
4. Open the train's own PR by hand (from the compare URL `deliver-artifact-branch.sh`'s warning
   prints, or the tracking issue's comment) since Actions cannot open it; merge once discipline checks
   pass. This retires the `population/<run_id>` branch as a side effect of the train landing.

**The operator's fix**, once and for all families that call `deliver-artifact-branch.sh`
(`population-turn.yml`, `corpus-turn.yml`, `source-sweep.yml`, `ledger-consume.yml`,
`change-detection.yml`, `propagation-drain.yml`): enable **Settings → Actions → General → Workflow
permissions → "Allow GitHub Actions to create and approve pull requests"**. Every later run then opens
its own PR directly and the tracking issue stops growing; the four-step hand-landing above is only
needed while the setting stays off.

## What lands where

Same shape as `corpus-turn.yml`'s own "What lands where" section: `scripts/harness-runs/mint/` gains
this run's enrichment of the existing `mint-run-NNN.json` family artifact (no new harness family — see
`MINT-RUNBOOK.md` §11), plus this run's own export/apply-ready/report files. `scripts/_snapshots/**`
(rule 015's reversibility record) is `.gitignore`d and instead uploaded as the workflow artifact
`population-turn-snapshots-<run_id>` (dry or apply, success or failure). Database writes (the mint
itself, the `census_worklist` reconcile stamp) go through the guarded path in `apply-mint-batch.mjs`
and leave no local file beyond the harness artifact.
