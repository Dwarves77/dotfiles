# Runbook: Corpus turn

Written 2026-09-01, lane RT (harness+flywheel completion train). Governs
`.github/workflows/corpus-turn.yml` and `.github/workflows/source-sweep.yml` — the runtime layer the
flywheel scripts (`fsi-app/scripts/connections/*.mjs`) and the harness runners
(`fsi-app/scripts/mint/run-mint-batch.mjs`, `fsi-app/scripts/forward-events/run-extraction.mjs`) never
had: every one of them was proven correct in a coordinator's sandbox that cannot reach Supabase (no
network egress to `eur-lex.europa.eu` / `federalregister.gov` / an arbitrary feed host, no
`NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`), so nothing in the original design said WHERE any
of it actually executes. This closes that gap the exact way `docs/decisions/ADR-023-producer-execution-model.md`
closed it for the data producers — GitHub Actions, the two repository secrets `.github/workflows/
producers.yml` and `data-audit-lane.yml` already inject, dispatch-driven, no standing schedule.

## What a "turn" is

One turn = one pass of the corpus flywheel:

1. **`discover-for-items.mjs`** (`fsi-app/scripts/connections/`) — runs mint-time connection discovery
   for items that bypassed the mint hook (a coordinator-SQL mint, typically), writing edges through the
   same guarded writer (`write-edges.mjs`) mint-time discovery uses.
2. **`export-corpus-for-extraction.mjs`** (new, `fsi-app/scripts/turns/`) — reads every verified, live
   item that currently carries ZERO rows in `item_forward_events` (migration 274/275) into the
   `{ items: [...] }` corpus-file shape `run-extraction.mjs` consumes. Read-only.
3. **`run-extraction.mjs`** (`fsi-app/scripts/forward-events/`) — the forward-events family's own
   canonical entry point. Extracts dated, obligation-bound events from each item's already-grounded
   FACT/GAP claims and rendered sections (see `src/lib/forward-events/extract-forward-events.mjs`'s own
   header for the extraction rules). Writes nothing to the database itself
   (`scripts/harness-runs/forward-events/PROTOCOL.md` §2: "the extractor never writes") — it writes a
   local `*.events.json` output file (apply mode only) and ALWAYS self-emits its own
   `scripts/harness-runs/forward-events/forward-events-run-NNN.json` artifact.
4. **`apply-extraction-output.mjs`** (new, `fsi-app/scripts/turns/`) — the guarded-write-path "load"
   half PROTOCOL.md always assigns to a coordinator (never the extraction pass itself). Reads
   `run-extraction.mjs`'s `*.events.json` output and inserts genuinely new rows into
   `item_forward_events` through `db.mjs`'s `guardedInsertMany`, respecting migration 275's dedupe key
   (`intelligence_item_id, event_date, event_kind, md5(obligation_text), coalesce(source_claim_id,
   source_section_id)`) — NOT migration 274's original, superseded key. A row whose key is already live
   is skipped, never re-inserted (idempotent re-runs).
5. **`analyze-corpus.mjs`** (`fsi-app/scripts/connections/`) — clusters the connection graph U0/U1
   already built into themes, detects coverage gaps, reads U5's anticipated-coverage targets off
   `item_forward_events` (the table step 4 just populated), and — behind `--signals` — proposes L4
   signal candidates.

A separate, related workflow, **`source-sweep.yml`**, runs `run-source-sweep.mjs` (new,
`fsi-app/scripts/turns/`) — ingestion at scale, not part of a turn's own five steps. It gives a runtime
to two dormant, pure, dep-injected modules (`src/lib/sources/register-walk.mjs`, the date-paged EUR-Lex
Official Journal / Federal Register index walk, and `src/lib/sources/feed-walk.mjs`, the RSS/Atom feed
walk) that had no live caller anywhere in the repo before this lane. It writes discovered candidate URLs
to the `portal_link_candidates` ledger — the SAME ledger the scheduled `check-sources` crawl's
`persistPortalCandidates` call already writes to — feeding the existing, separate `consumePortalCandidates`
classify-and-stage pass (unmodified, out of scope here) that eventually reaches
`src/lib/intake/census-writer.mjs`'s `census_worklist` rows. It is dispatch-only (no `push` trigger — a
sweep always names a specific walker and window/feed, unlike a turn's empty-branch request shape) and
records its own `source-sweep` harness-run artifact family every run, in both dry and apply mode.

## How a coordinator requests a turn

**Option A — `workflow_dispatch` (Actions tab, or `gh workflow run corpus-turn.yml`):** pick `mode`
(`dry` or `apply`), optionally `since` (an ISO date — items with `created_at >=` this are in scope;
leave blank to use the last recorded turn date), and `signals` (default `true` — also runs
`analyze-corpus.mjs`'s `--signals` pass). The workflow creates a fresh `turn/<run-id>` branch off
whatever ref it dispatched from (normally `master`) and lands the run's own commit there.

**Option B — push an empty `turn/**` branch:** a coordinator session that wants a turn without touching
the Actions UI pushes a branch named `turn/<anything>` (e.g. `turn/2026-09-02`) — content doesn't
matter, only the branch name and the push event. This ALWAYS runs in `apply` mode (pushing a turn branch
is, by definition, asking for the real thing) and lands the run's commit directly on that same branch —
no second branch is created.

Either way, the workflow ends by opening a PR from the turn branch to `master` (skipped if one is
already open for that branch, and skipped entirely if the run produced no new harness-run-artifact
content to commit — a run that discovered/extracted/analyzed nothing genuinely new leaves nothing to
land). Review and merge that PR the same way any other PR is reviewed; nothing about `corpus-turn.yml`
auto-merges.

## What lands where

- `scripts/harness-runs/forward-events/forward-events-run-NNN.json` — `run-extraction.mjs`'s own
  self-emitted artifact, every turn, dry or apply.
- `scripts/turns/LAST-TURN.json` — the "since when did this turn's `--since` default cover" marker,
  updated ONLY on a successful apply-mode turn, to that run's own start timestamp (not "now" at the
  moment it is recorded — see `last-turn-date.mjs`'s own header for why).
- `scripts/_snapshots/turn-<run-id>/turn-corpus.{json,events.json,skipped.json}` — the turn's FULL
  TRACES for extraction (the corpus slice and `run-extraction.mjs`'s events/skipped outputs, which the
  forward-events artifact's `full_trace_refs` name). Kept here, not on `/tmp`, precisely so the
  workflow-artifact upload below retains them: forward-events-run-002 (the first runtime turn,
  2026-09-01) pointed its refs at `/tmp` on a runner that no longer existed, and its 276 skip reasons
  were unreadable from the repo.
- `scripts/_snapshots/**` — every guarded write's prior-row snapshot (rule 015's reversibility record).
  This directory is `.gitignore`d at the repo root (`fsi-app/scripts/_snapshots/`) — the workflow keeps
  it that way rather than fighting the ignore rule, and instead uploads it as a GitHub Actions **workflow
  artifact** (`corpus-turn-snapshots-<run-id>`, 90-day retention) on every run, dry or apply, success or
  failure (`if: always()`).
- Nothing else is committed by this workflow. `discover-for-items.mjs` and `analyze-corpus.mjs` write
  directly to the database (edges, themes, coverage-gap/anticipated-coverage/signal-candidate
  `integrity_flags`) through their own guarded paths — there is no local file for those writes to leave
  behind beyond what the two harness-run-artifact-bearing steps (3 and, indirectly, the marker in step 4)
  already capture.

`source-sweep.yml` similarly commits only `scripts/harness-runs/source-sweep/**` (its own family's
artifact), via a fresh `source-sweep/<run-id>` branch and PR, and uploads its own `scripts/_snapshots/**`
workflow artifact the same way.

## When the workflow cannot open its own PR (seen on the first runs, 2026-09-01)

**Since Train 14 the run no longer fails on this.** Both workflows end in
`scripts/turns/deliver-artifact-branch.sh`: it tries `gh pr create`; when the repository refuses with
"GitHub Actions is not permitted to create or approve pull requests" it records the pushed branch and
its compare URL as a comment on ONE open issue titled **"Runtime artifact branches awaiting a
hand-opened PR"**, emits a warning annotation and a step summary, and exits green. Any OTHER
`gh pr create` failure still fails the run. So: a green run with a warning = the work is done and the
branch is waiting on that issue; open its PR from there. Enabling the setting makes the PR open itself
and the issue stop growing.

(Original notes, kept for the record:)

Both workflows end by pushing their branch and running `gh pr create`. On this repository that last
step failed with `GitHub Actions is not permitted to create or approve pull requests` — the repository
setting **Settings → Actions → General → Workflow permissions → "Allow GitHub Actions to create and
approve pull requests"** is off. Everything before it is real: the DB writes (apply mode), the harness
artifact commit, and the pushed `turn/<run-id>` / `source-sweep/<run-id>` branch. Two ways out:

1. **Operator, once:** enable the setting. Every later turn and sweep opens its own PR.
2. **Until then, per run:** open the PR by hand from the compare URL the failing step prints
   (`https://github.com/Dwarves77/dotfiles/compare/master...turn/<run-id>?expand=1`), let the discipline
   checks run, squash-merge, delete the branch. The discipline memory gate exempts these run-record
   commits (`scripts/harness-runs/**`, `scripts/turns/LAST-TURN.json`), so a hand-opened turn PR passes
   without a session-log addendum; the proposer pass over the new artifact lands with its own addendum
   as always.

The first runtime turn (corpus-turn run 33566259450, apply, since 1970-01-01) and the first sweep
(source-sweep run 33566698207, dry) both landed by path 2, inside the train that also fixed what
reading their artifacts found (session-log Addendum 82, meta-harness-run-006).

## The first full backfill over ALL existing items

Dispatch `corpus-turn.yml` with `mode: apply` and `since: 1970-01-01` — the epoch value
`export-corpus-for-extraction.mjs`'s own `--since` filter and `discover-for-items.mjs`'s `--since` filter
both treat as "every item ever created," and the same value `last-turn-date.mjs` returns by default when
no `scripts/turns/LAST-TURN.json` marker exists yet (a repo that has never run a turn is, by construction,
already asking for a full backfill the first time it does). This is the intended way to seed the corpus
flywheel on a repo (or environment) that has run zero turns so far: it is not a special mode, just the
normal apply path with the widest possible `since`. Every step downstream is already idempotent
(discovery's edges dedupe on the connection signature, extraction's dedupe key is migration 275's, the
ledger upserts on `UNIQUE url`), so a full backfill can be safely re-dispatched if it fails partway
through — a re-run only re-covers what a prior partial run did not finish, at the cost of re-examining
(never re-writing) what it already did.

**It has been done** (2026-09-01, run 33566259450): discover wrote 1,931 edge rows (107 new, 1,824
refreshed, 5 skipped as owned by the entity/semantic origin, prior state snapshotted); export found 185
of 322 live items without a forward event and the extractor confirmed 0 events for them (they are exactly
forward-events-run-001's no-event set, 322 − 137); analyze persisted 14 themes (replacing 9; delta:
8 persisted, 1 split, 4 appeared), opened 12 coverage-gap, 7 anticipate and 297 signal-candidate flags,
and its own VERIFY passed. `scripts/turns/LAST-TURN.json` now carries that run's start time, so the next
dispatch with a blank `since` is incremental.

## Standing rule: no schedule during build

Per operator ruling (2026-09-01), stated identically in `.github/workflows/producers.yml` and
`data-audit-lane.yml` for their own families: **no workflow in this repo runs on a timer while the site
is being built.** Every trigger is an explicit `workflow_dispatch` or a `push` a person or a coordinator
session deliberately made. `corpus-turn.yml` and `source-sweep.yml` both carry a commented-out
`schedule:` block with a placeholder cadence, citing this same ruling — re-arming either one when build
mode ends is a single reviewed diff (uncomment the block, pick the real cadence), never a consequence a
green run or a passing test earns on its own. The fast-disarm lever is the same one every other workflow
in this repo already has: disable the workflow from the Actions tab and every trigger stops immediately,
no deploy required.

## Change detection

Written 2026-09-02, lane CD (system-completion train). Governs `.github/workflows/change-detection.yml` —
the runtime the change-detection chain never had, the same gap this runbook's own opening paragraph
describes for the corpus flywheel: `runReconcilePass` (`fsi-app/src/lib/sources/reconcile.ts`) was proven
correct and reachable only as a callee inside `/api/worker/check-sources` (and its manual-redrive twin
`/api/worker/reconcile`); `drainChangeSweepUpdates` (`fsi-app/src/lib/intake/run-intake-cycle.ts`) was
reachable only from `runIntakeCycle`'s own apply-mode tail. Live-confirmed 2026-09-02: 0 `monitoring_queue`
rows with `change_detected=true AND reconciled_at IS NULL`, 0 pending `staged_updates` — the chain had
never run through anything but a live HTTP request.

### What a change-detection run is

One run = one pass of three steps, driven by `fsi-app/scripts/turns/run-change-detection.mjs` (see that
file's own header for the full chain and every limitation found reading the code it drives):

1. **Detect** — POST the DEPLOYED `/api/worker/check-sources` route (`x-worker-secret` auth). The route
   renders each due source via Browserless, fingerprints the content against `sources.last_content_hash`,
   writes `monitoring_queue` rows with a real `change_detected`, and (since 2026-09-01) already runs its
   OWN in-process `runReconcilePass` at the end of the same request. Skipped in `--mode dry` (the route
   WRITES — `sources`, `monitoring_queue`, `portal_link_candidates`); skipped in either mode with
   `--skip-check`, e.g. to work down an existing backlog without a new detection pass.
2. **Reconcile** — `runReconcilePass` again, independently of the route's own in-process call, so this
   script's own artifact is self-contained evidence of the reconcile step regardless of whether the route
   ran this pass. Claims pending `monitoring_queue` rows, records `intelligence_changes`, bridges live
   items into `staged_updates` (`update_item`). `--mode dry` uses `runReconcilePass`'s own `dryRun` option
   (added by this lane) — a read-only projection that counts what would be written without writing.
3. **Drain** — `drainChangeSweepUpdates`, exported (this lane) so it is reachable on its own instead of
   only as `runIntakeCycle`'s apply-mode tail. Applies + re-verifies up to `--drain-limit` (default
   `UPDATE_DRAIN_LIMIT`) pending change-sweep-marked `update_item` rows. `--mode dry` reads the same
   pending-row predicate without calling it.

Because the route's own in-process reconcile already ran in `--mode apply` (unless `--skip-check`), this
run's own Step 2 will usually find little or nothing left pending — expected, not a defect; the artifact's
`proposer_notes` says so on every apply run.

### Known limitations (found reading check-sources/route.ts; not in this family's write set)

- The route's due-source batch is a HARDCODED `.limit(10)` — it takes no request body or query parameter
  to change it. `--check-limit` therefore only bounds THIS SCRIPT's own dry-mode "sources due" read/report,
  never the deployed route's actual batch in apply mode.
- The route's JSON response does not return `changeDetected` or `portalCandidates` per source (both are
  computed by `assessAndUpdateSource` but never pushed into the response array) — this script compensates
  with its own read-only `monitoring_queue`/`portal_link_candidates` queries over the call window.
- Browserless's own per-render metered price is not documented anywhere in this repo;
  `metrics.browserless_units_est` is an ESTIMATE (~2 units/render, from
  `docs/PHASE2-FLAGSHIP-REGROUND-RUNBOOK.md`'s own precedent), clearly labelled as such.

### How a coordinator requests a run

Dispatch `change-detection.yml` from the Actions tab: `mode` (`dry`/`apply`), `check_limit` (optional),
`skip_check` (optional). Same delivery path as `corpus-turn.yml`/`source-sweep.yml` — the harness-run
artifact (`fsi-app/scripts/harness-runs/change-detection/**`) lands on a fresh `change-detection/<run-id>`
branch and PR via `deliver-artifact-branch.sh`; see "When the workflow cannot open its own PR" above for
what happens when the repository refuses PR creation (the same fallback, same tracking issue).

### First run

Not yet dispatched as of this lane's own work (2026-09-02) — `scripts/harness-runs/change-detection/`
carries a `PENDING-RUN.md` (F28's first-run acknowledgment) instead of a `change-detection-run-001.json`.
The coordinator's own dispatch plan (`docs/plans/system-completion-plan-2026-09-02.md` §2, "Not a
lane — operator-only") runs `change-detection` dry first; read the resulting artifact against the live
`monitoring_queue`/`staged_updates` tables before dispatching apply.
