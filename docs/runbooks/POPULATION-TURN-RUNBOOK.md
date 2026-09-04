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
reconcile stamp) → `rederive-record-provenance.mjs` / `screen-reconcile-records.mjs` (post-apply
reconciliation, apply only in apply mode) → `scripts/turns/run-population-flywheel.mjs` (MANDATORY,
MINT-RUNBOOK.md §8/§9 — discovery, forward-event extraction, recluster, derive-obligations,
tag-proposals + tag-ratification, and the §9 corpus-outcome metrics written back into this run's own
`mint-run-NNN.json`, all scoped to exactly the items this batch minted; a failed flywheel step fails the
whole job). This flywheel step is run BY THE WORKFLOW ITSELF, not a separate hand-run coordinator
pass — see "THE FLYWHEEL" below. Before any of this, in `apply` mode (and never on a `flywheel_backlog`
dispatch — see "THE GATE, WIDENED, and BACKLOG MODE" below), a gate step
(`run-population-flywheel.mjs --check-gate`) refuses to start a NEW batch while ANY prior batch's
`mint-run-NNN.json` on the checkout is missing the §9 outcome keys, so an unconnected prior slice blocks
the next one rather than accumulating silently. Read `MINT-RUNBOOK.md` §8/§9/§11 for what each step
actually does; this file only names the chain so the landing section below makes sense without
cross-referencing that governing file.

### THE FLYWHEEL (lane TANDEM, 2026-09-04)

THE DEFECT [CONFIRMED]: this workflow used to end after `apply-mint-batch.mjs` plus an unconditional
`propose-tags.mjs --dry` preview — MINT-RUNBOOK.md §8 (discovery, forward-event extraction, recluster,
IN ORDER) and §9 (`--outcomes` enrichment) were documented as a separate, hand-run coordinator pass that
nothing in this runtime ever triggered. Population runs #15-#20 (2026-09-03/04, 934 items measured
[CONFIRMED] — 177+168+156+152+141+140, mint-run-017..022) were applied with no flywheel pass and no
outcomes: every one of those items carries zero `item_cross_references`, zero `item_forward_events`, no
obligations, no tags, no signals. Operator ruling (2026-09-04), verbatim: "there is no thing within this
entire build that works on its own ever... Everything works together, that's the purpose of the flywheel
and the harness." A green population-turn run now means minted AND connected AND recorded — the
coordinator's job on §8/§9 is to read the outcomes that landed in `mint-run-NNN.json`, not to run
discovery/extraction/tagging by hand.

### THE GATE, WIDENED, and BACKLOG MODE (lane TANDEM-2, 2026-09-04)

THE DEFECT [CONFIRMED by the coordinator reading the landed code]: THE GATE above used to read only the
SINGLE newest `mint-run-NNN.json` on the checkout (by `started_at`), not every artifact. A DRY artifact —
a `rows_file` preview, or a live export that minted nothing — has `metrics.minted` absent/0 by
construction, so whenever a dry artifact happened to be newest it read as "nothing to connect" and let a
brand-new apply through, while every apply artifact behind it on the timeline stayed unconnected. This is
exactly what happened after TANDEM's own train landed: mint-run-023 (the `rows_file` dry preview of the
six-row EU Weekly Oil Bulletin batch, ruling R-D — see "Dispatching the oil-bulletin batch" below) landed
newest, and the gate read only it — a false "nothing to connect."

**Fixed:** `run-population-flywheel.mjs --check-gate` now scans EVERY `mint-run-NNN.json` on the
checkout, not only the newest, and refuses if ANY of them minted items but was left unconnected — a dry
artifact still never counts on its own, it just no longer masks a stale artifact elsewhere in the list.

**THE FULL BACKLOG IS LARGER THAN THE SIX RUNS THAT FIRST SURFACED IT** — measured [CONFIRMED,
2026-09-04, this lane, re-run `--check-gate` any time to re-measure] by actually widening the scan to
every artifact on the checkout, not only mint-run-017..022. **`checkAllSlicesConnected` finds 15 of 23
mint-run artifacts minted items and were never connected**, not six:

| Group | Run ids | Items | Auto-connectable by `--backlog`? |
|---|---|---|---|
| Pre-TANDEM small batches | mint-run-004, mint-run-006 | 4 + 5 = 9 | Yes (retired outcome label `minted_verified_first_pass`, item ids present) |
| Pre-TANDEM population runs | mint-run-011, 012, 013, 014, 016 | 43+39+30+40+177 = 329 | Yes |
| The six runs THE DEFECT above names | mint-run-017 through mint-run-022 | 177+168+156+152+141+140 = 934 | Yes |
| **Auto-connectable total** | **13 artifacts** | **1,272 items** | **Yes** |
| Pre-item_id-era artifacts | mint-run-001, mint-run-005 | 6 + 5 = 11 | **No — see below** |

**mint-run-001 and mint-run-005 CAN now be auto-connected, via ID resolution added by lane BACKLOG-LEGACY
(2026-09-04).** Both predate the `per_item.item_id` field entirely — their per_item entries carry only a
CELEX id and an outcome label (`"minted"` / `"minted_validator_pass"`) but never a real `intelligence_items.id`.
Lane BACKLOG-LEGACY added `resolveMintedItemIds` to `run-population-flywheel.mjs`, which maps CELEX ids
from `per_item.id` (the strongest recoverable identity field) to `intelligence_items.id` via
`canonical_instrument_key` queries — all 11 entries (mint-run-001's 6 + mint-run-005's 5) resolve to
single matches in the live database, so neither artifact remains unrecoverable. Both can now be connected
via `--mint-run` or `--backlog` without hand intervention. The resolver reports entries that resolve to
zero or 2+ items as unresolved and refuses to proceed (never guesses), so if future artifacts have
ambiguous or unmatchable identity, this gate remains conservative. `ids_resolved_by_key` is now recorded in
the §9 outcomes block, carrying a count of how many IDs were recovered this way (0 for modern artifacts
with direct item_id).

**The fix for the 13 auto-connectable artifacts is now itself a dispatch, not a hand-run pass over one
artifact at a time:** `flywheel_backlog: true` skips
`export-census-rows.mjs`/`run-mint-batch.mjs`/`apply-mint-batch.mjs`/`rederive-record-provenance.mjs`/
`screen-reconcile-records.mjs` entirely (this mode MINTS NOTHING) and instead runs
`run-population-flywheel.mjs --backlog` — connects every AUTO-CONNECTABLE stale mint-run artifact,
oldest first, bounded by `backlog_max_artifacts` (leave blank for that script's own documented default —
2, with the full [INFERRED] per-item cost reasoning in that script's own header's "COST PROJECTION"
paragraph), each one enriched in place and written to disk (checkpointed) the moment it finishes — so a
job that hits `population-turn.yml`'s `timeout-minutes` (raised 30 → 60 by this lane for exactly this
reason) mid-backlog still leaves everything processed so far connected and the gate correctly narrowed
for the next dispatch. mint-run-001/005 are never selected (they would only ever refuse), so they never
consume a dispatch's budget or stall the artifacts behind them, even though mint-run-001 is the oldest
artifact on the checkout. THE GATE never runs on a `flywheel_backlog: true` dispatch (that dispatch's
entire purpose is to clear it — gating it would be circular).

**Dispatch (mode=dry — lists the stale artifacts and each one's item count, writes nothing, no DB creds
needed):**
- `mode`: `dry`
- `flywheel_backlog`: `true`
- `backlog_max_artifacts`: leave blank (or set explicitly to preview a specific cap)
- every other input (`limit`/`source_id`/`celex_prefix`/`capture`/`rows_file`) is ignored on a backlog
  dispatch

**Dispatch (mode=apply — actually connects up to `backlog_max_artifacts` auto-connectable stale
artifacts, oldest first):**
- `mode`: `apply`
- `flywheel_backlog`: `true`
- `backlog_max_artifacts`: leave blank for the default (2), or raise it once a prior dispatch's real wall
  time is known
- Clearing the full 13-artifact auto-connectable backlog (1,272 items) takes on the order of
  `ceil(13/2) = 7` dispatches at the default cap, not three — re-dispatch with the same inputs once each
  one's branch is read (see "Landing a run" below); `--check-gate`'s own next run reports how many
  auto-connectable artifacts remain, and separately names mint-run-001/005 as needing manual resolution
  regardless of how many `--backlog` dispatches have run.

## How to dispatch a normal batch

Actions tab → **Population turn** → Run workflow. Inputs: `mode` (`dry`/`apply`), `limit` (payloads per
run — `population-turn.yml`'s own default is `50`; `docs/plans/population-pass-2026-09-03.md` §3
recommends `200` once the pipeline is proven, repeated until the on-vertical pool is exhausted),
`source_id` / `celex_prefix` (optional narrowing), `capture` (`true` fetches live text for rows with no
existing capture), `rows_file` (optional — skip the live export and run the batch/apply steps directly
against a pre-built rows file, e.g. for the browser-capture escape hatch `MINT-RUNBOOK.md` §11's
addendum documents), `flywheel_backlog` (leave `false` — see the section above for the backlog dispatch).
Secrets already wired in the workflow env: `NEXT_PUBLIC_SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `APP_URL`, `WORKER_SECRET`. Run `dry` first, read the artifact
(`minted`/`minted_verified`/`apply_failed`/`census_rows_reconciled`/held reasons) against the live
tables, then `apply`. **If `apply` is refused by THE GATE, dispatch the backlog (above) first** — the
gate's own refusal names every auto-connectable stale artifact and the exact fix, and separately names
mint-run-001/mint-run-005 if either is still unresolved (no `--backlog` dispatch, however many, clears
those two — see above).

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
this run's enrichment of the existing `mint-run-NNN.json` family artifact — now including the §9
`edges_discovered`/`forward_events_extracted`/`isolated_items` metrics the flywheel step wrote back into
it (no new harness family — see `MINT-RUNBOOK.md` §8/§9/§11) — plus this run's own
export/apply-ready/report files. The flywheel step also self-emits its OWN artifact in the EXISTING
`forward-events` family (`scripts/harness-runs/forward-events/forward-events-run-NNN.json`, the same
family `corpus-turn.yml` uses), committed alongside the mint artifact by this run's commit step.
`scripts/turns/LAST-TURN.json` is advanced by the same step, so a later `corpus-turn` dispatch never
re-covers what this run's flywheel already connected. `scripts/_snapshots/**` (rule 015's reversibility
record) is `.gitignore`d and instead uploaded as the workflow artifact `population-turn-snapshots-<run_id>`
(dry or apply, success or failure). Database writes (the mint itself, the `census_worklist` reconcile
stamp, and the flywheel's own edges/forward-events/obligations/tags writes) go through the guarded path
in `apply-mint-batch.mjs` and `run-population-flywheel.mjs` and leave no local file beyond the harness
artifacts named above.

## Dispatching the oil-bulletin batch (ruling R-D, 2026-09-03)

`scripts/_snapshots/population-browser/oil-bulletin-2026-09-03/census-rows.json` (built by
`fsi-app/scripts/producers/market/build-oil-bulletin-rows.mjs`, committed under this repo-relative
path even though `scripts/_snapshots/` is otherwise `.gitignore`d — see the existing
`scripts/_snapshots/population-33749140151/census-rows.json` precedent this batch follows) is the six
EU Weekly Oil Bulletin `market_signal` rows ruling R-D calls for, built through
`MINT-RUNBOOK.md` §11's browser-capture escape hatch (these are not `census_worklist` rows — no
`export-census-rows.mjs` join produced them, and no `row_id` is set — see that script's own header for
why). Dispatch **Population turn** with:

- `mode`: `dry` first, then `apply` once the dry artifact's `per_item` reads as expected.
- `rows_file`: `scripts/_snapshots/population-browser/oil-bulletin-2026-09-03/census-rows.json` — this
  skips `export-census-rows.mjs` entirely, exactly as the escape hatch describes.
- `capture`: irrelevant for a `rows_file` dispatch (every row already carries `captured_text`) — leave
  at its default.
- `limit` / `source_id` / `celex_prefix`: not applicable to this six-row batch; leave at defaults.
- `flywheel_backlog`: `false` (its default) — this dispatch mints the six oil-bulletin rows themselves, it
  is not a backlog dispatch.

**This dispatch's own `dry` run already exists on the checkout as `mint-run-023`** — the artifact THE
GATE, WIDENED (above) found masking every stale artifact behind it before this lane widened the scan.
**The `apply` run of THIS six-row batch is now itself gated**: THE GATE (widened) refuses ANY new apply —
this one included — while ANY of the 15 stale artifacts named above (13 auto-connectable,
mint-run-001/005 not) stay unconnected. **Clear the backlog dispatch (above) first, as many times as
`--check-gate` still names an auto-connectable stale artifact (≈7 dispatches at the default cap) — and
separately get mint-run-001/005 resolved by hand (see above; `--backlog` cannot touch them)** — only then
does `--check-gate` report every prior artifact connected and this `apply` proceed.

Every row's `source.id` is the placeholder `"PENDING-LIVE-SOURCES-LOOKUP"` (`propose-series-items.mjs`'s
own precedent) — **before dispatching `apply`**, the coordinator must resolve the real `sources` row for
`https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en` (MINT-RUNBOOK.md step 2:
`SELECT id, url, base_tier, tier_override, status, institution_id FROM sources WHERE url = '...'`,
registering it first via `registerSource` if it does not yet exist) and substitute that real `id` into
the batch file (re-run `build-oil-bulletin-rows.mjs`, or hand-edit the six `source.id` fields — this
batch file is not a governing file). A `dry` dispatch does not need this (no DB read happens in dry
mode), but an `apply` dispatch against the placeholder id will fail `apply-mint-batch.mjs`'s own
source-registration path.

**Post-mint, before `refresh-published-price-statistics.mjs --apply` will do anything:**

```
node scripts/producers/market/ratify-series-items.mjs --mint-run scripts/harness-runs/mint/mint-run-NNN.json --apply
```

(`mint-run-NNN.json` = the artifact `apply-mint-batch.mjs --apply` enriched for this batch.) This reads
that artifact's `per_item` outcomes and, for every series that reached `minted_verified` (never
`minted_unverified` or any `not_applied_*`/failure outcome — see that script's own header for why only a
verified row may ratify), rewrites `src/lib/market/series-item-map.mjs` in place: `item_id` set, `status:
"ratified"`. Run it `--dry` (the default) first to see the per-series disposition before writing. Only
then does `node scripts/producers/market/refresh-published-price-statistics.mjs --apply` start upserting
that series' `published_price_statistics` display row — see that script's own header for why an
unratified `SERIES_ITEM_MAP` entry is the deliberate kill-switch, not a separate flag.

Note the write-set correction this batch's build surfaced: `src/lib/market/series-item-map.mjs` is a
`.mjs` DATA MODULE (that file's own header explains the production-incident reason — a `.json` file read
via `fs` from an `src/lib` module bundled into every page's import graph 500'd every route the first time
it was tried), not the `scripts/producers/market/series-item-map.json` path an earlier plan named. Only
`ratify-series-items.mjs`'s own `--apply` run may write it — never a hand edit.
