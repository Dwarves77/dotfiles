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

## Propagation drain

Added by Lane DP-ENGINE (system-completion train, 2026-09-02) — `docs/specs/08-flywheel-design.md` §2's
"outbox + derivation DAG + governed drain," now built. This is a **separate family from `corpus-turn.yml`**
(different dataset, different governing files, its own `PENDING-RUN.md` and `CONVENTION.md` row) — it does
not fire as part of a corpus turn and a corpus turn does not fire it. It is documented in this runbook,
alongside the turn it is not, because a coordinator scheduling one family needs to know it is not silently
covering the other.

**What it does.** `scripts/turns/run-propagation-drain.mjs` runs the two-pass drain over the
`propagation_events` outbox (migration 284): pass one walks `derivation_edges` to mark every downstream
`derived_values`/`statutory_computations`/`estimated_values` row transitively reachable from a changed
input as invalidated; pass two, **`apply` mode only**, recomputes each invalidated row by calling the
method registered for its `method_id` through `src/lib/propagation/methods/index.ts`'s `registerMethod`/
`METHODS` seam, then writes the new value back through `register-derivation.ts`'s `registerDerivedValue()`
(migration 285's `register_derived_value(...)` RPC — value row and derivation edges inserted atomically).
`dry` mode performs pass one only and reports what pass two would touch, writing nothing. Every processed
outbox row is marked `drained_at` at the end of a batch (default 500 rows — see `DEFAULT_BATCH` in
`drain.ts`), never deleted, so the outbox is a durable log, not a queue.

**Zero registered methods today.** This lane builds the drain runtime, the outbox, the DAG, and the
`registerMethod` seam — it registers no concrete derivation method. An `apply`-mode drain run today
invalidates rows correctly but recomputes nothing (`getMethod` finds no match for any `method_id`,
`drain.ts` records the miss and moves on rather than failing the batch — see `drain.ts`'s own header for
the "a missing method is data absent a method, not a crash" rationale). This is expected until DP-SURF or
a later lane calls `registerMethod` for a real method. Dispatching `propagation-drain.yml` before that
point is safe (it will report zero recomputes) but accomplishes nothing yet.

**How a coordinator requests a run:** `workflow_dispatch` on `propagation-drain.yml` (Actions tab, or
`gh workflow run propagation-drain.yml`), picking `mode` (`dry` or `apply`) and optionally `batch`
(defaults to `run-propagation-drain.mjs`'s own default). It mirrors `source-sweep.yml`'s scaffold exactly:
fresh branch per dispatch, commit + PR via `deliver-artifact-branch.sh`, a commented-out `schedule:` block
under the same no-schedule-during-build ruling as every other family in this repo (see above), and the same
hydrate-unmerged-artifacts collision guard.

**What lands where:** `scripts/harness-runs/propagation/propagation-drain-run-NNN.json` — the run's own
self-emitted artifact (dry or apply). No other file is committed by this workflow; `derived_values`,
`derivation_edges`, and the `drained_at` marks on `propagation_events` are database writes, not local
files, matching the same "database writes leave no local file beyond the harness-run artifact" posture
`corpus-turn.yml`'s own "What lands where" section states above for `discover-for-items.mjs` and
`analyze-corpus.mjs`.

**First run.** `scripts/harness-runs/propagation/PENDING-RUN.md` records the pre-first-run
harness-version hash pin (mirroring the mint/screen family's own convention) — it is replaced by the first
real `propagation-drain-run-001.json` once a run actually lands, the same lifecycle `forward-events`'s
`PENDING-RUN.md` went through.

## Seeding derived values

Added by Lane DP-SURF (system-completion train, 2026-09-02) — the initial-closure step the "Propagation
drain" section above assumes but does not itself perform: the drain's recompute pass only ever
**supersedes an existing row**, so the very first `derived_values`/`estimated_values` row for a given
subject has to come from somewhere else. That somewhere is `scripts/propagation/seed-derived-values.mjs`.

**What it does.** Two independent seed paths, one per method this lane registers in
`src/lib/propagation/methods/index.ts` (see that file, and the "Propagation drain" section above, for the
`registerMethod`/`METHODS` seam these two methods now populate):

1. **`carbon_intensity_tkm@1.0.0`** — one `derived_values` row per `emission_factors` row that is BOTH
   licence-embeddable (`src/lib/contracts/source-licence.mjs`'s `mayEmbedAsSeed()` gate — a row whose
   source is not redistribution-cleared is skipped, counted `licenceBlocked`, never overridden) AND
   computable by `src/lib/market/carbon-intensity.mjs` (today: `quantity_basis = 'tonne_km'` only — every
   other basis refuses with a named reason, counted `refused`). Written via `registerDerivedValue()`
   (`register-derivation.ts`) only — no paired `estimated_values` row (carbon-intensity is a plain
   calculated conversion, neither statutory nor an estimate).
2. **`automate_vs_hire@1.0.0`** — one `derived_values` row (NPV, the propagated headline metric) PLUS one
   paired `estimated_values` row (the full point/low/high range, `distribution` jsonb carrying
   payback/break-even — ADR-024's "break-even wage gets equal billing") per region carrying BOTH a
   `labor_markets` and an `operational_cost` `regional_data_facts` fact with a populated `value_numeric`
   AND a resolvable entity_id (`estimated_values.entity_id` is a NOT-NULL primary key — a matched region
   with no entity spine row is counted `skippedNoEntity`, never written; this script mints no entities,
   that is DP-SPINE's `scripts/entities/backfill-entities.mjs` territory, out of this lane's write set).
   **Honest expected count today: 0** — BLS OEWS (`labor_markets`) is US-only and Eurostat nrg_pc_205
   (`operational_cost`) is EU-country-only (see `scripts/producers/regional/*-producer.mjs`), so no region
   satisfies "both dimensions present" yet regardless of the entity-id gap. The path is fully implemented
   and unit-tested against fakes (`seed-derived-values.test.mjs`), not a stub — it activates the moment
   either producer gains cross-coverage of the other's regions.

**How to run it:**

```
node scripts/propagation/seed-derived-values.mjs --dry     # counts only, writes nothing
node scripts/propagation/seed-derived-values.mjs --apply   # writes
```

Exit 0 done · 1 bad args (neither or both of `--dry`/`--apply`) · 2 no DB creds · 3 one or more writes
failed in `--apply` mode (see the per-path `errors` array in the printed JSON summary; a failed write
never aborts the rest of the batch — same "one bad row does not sink the run" posture `drain.ts` itself
holds).

**Not wired into a scheduled workflow.** Unlike `propagation-drain.yml` above, this is a one-shot,
operator-run seed for standing up the initial closure — running it again after the first `--apply` simply
re-evaluates the current source tables and creates any row that did not already exist (it never
supersedes; a re-run is not how an existing value gets refreshed — that is `propagation-drain.yml`'s job,
once a `propagation_events` row exists to invalidate it). No `propagation-drain-seed.yml` workflow was
added in this lane; a coordinator runs it by hand (or a future lane wires a one-time dispatch) once a real
Supabase environment is available.

**Test coverage, and a documented gap.** `scripts/propagation/seed-derived-values.test.mjs` (16 tests, all
passing) proves both seed paths' counting/refusal/write-shape logic against hand-rolled fake clients — the
same no-real-database posture `drain.test.mjs`/`register-derivation.test.mjs` already establish for this
family. It is **not** wired into `.discipline/run-test-suite.sh` (`scripts/propagation/` is not one of
that file's covered globs, and that file is outside this lane's write set) — recorded as a known gap in
`.discipline/governance/exemptions.mjs`'s `scripts/propagation/seed-derived-values` entry rather than left
silent; run it directly with `node --test scripts/propagation/seed-derived-values.test.mjs` until a later
lane adds the glob.
