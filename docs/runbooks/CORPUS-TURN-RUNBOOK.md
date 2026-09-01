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
