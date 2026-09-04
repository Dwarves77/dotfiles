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

## Item selection: the ticket queue (default), `--since` as an explicit backfill override

**Rewired by lane TURNREQ, 2026-09-04** (see the 2026-09-04 wiring audit, B1 Gap #2 / B2 §1): a turn's
item scope is now ONE mechanism, not two. `corpus_turn_requests` (migration 277) is filled by a DB
trigger (`enqueue_corpus_turn_request()`) every time an item's provenance/archive/tag state changes
outside the in-app mint hooks — a real, per-item record of "this item needs a turn," not an inferred
`created_at` window. `scripts/turns/consume-turn-requests.mjs` is this queue's only reader:

- **MODE 1 (read).** `node scripts/turns/consume-turn-requests.mjs [--out path] [--limit N] [--mark-consumed --by <label>]`
  reads every OPEN ticket (oldest `requested_at` first — the DB read is already ordered, so `--limit`
  is a plain slice), optionally writes the full snapshot (id list + per-row reason/requested_at) to
  `--out`, and prints the distinct `intelligence_item_id` list as its one line of real stdout. Migration
  277's partial-unique index guarantees at most one OPEN row per item, so bounding rows bounds distinct
  items 1:1 — "grouped by item" needs no separate dedup step.
- **MODE 2 (`--mark-file <path> --by <label>`).** Marks EXACTLY the ticket rows named in a PRIOR `--out`
  snapshot `consumed_at`/`consumed_by`, through the guarded write path (`db.mjs`'s `guardedUpdateByIds`:
  cite + prior-row snapshot + read-back) — never a fresh "what's open now" re-read, so a caller retires
  precisely what it already processed even if the open set changed in between. Mutually exclusive with
  `--out`/`--limit`/`--mark-consumed` (MODE 1's read-shaping flags).

`corpus-turn.yml`'s own shape is MODE 1 (no `--mark-consumed`) as its very first step, then discover →
export → extract → apply → analyze, and only once every one of those has succeeded, MODE 2 against that
same snapshot file — GitHub Actions' own step ordering (no `continue-on-error` anywhere in between) IS
the "only after the turn's writes succeeded" guarantee; no extra bookkeeping is needed.

`since` (the workflow's `since` input, `--since` on `discover-for-items.mjs`/
`export-corpus-for-extraction.mjs`) is now an **EXPLICIT BACKFILL OVERRIDE ONLY**: set it to bypass the
ticket queue entirely and rescope the turn to `created_at >=` that date, the pre-2026-09-04 mechanism.
No ticket is read or marked consumed in that mode. Leave it blank (the default) for ticket-queue mode.

`scripts/turns/last-turn-date.mjs`'s `LAST-TURN.json` marker — the mechanism `since`'s blank default used
to read — is **retired from this workflow**. It is not deleted: `scripts/turns/run-population-flywheel.mjs`
(a different family's driver) still calls `writeLastTurnDate` after its own successful apply, for a
purpose that no longer applies to corpus-turn now that ticket selection is the default; that residual
write-with-no-corpus-turn-reader is a known, named gap (see `last-turn-date.mjs`'s own header), not
something this workflow depends on.

## What a "turn" is

One turn = one pass of the corpus flywheel:

0. **`consume-turn-requests.mjs`** (`fsi-app/scripts/turns/`, MODE 1) — selects this turn's item scope:
   the oldest `limit` open `corpus_turn_requests` tickets (ticket-queue mode, the default), or skipped
   entirely when `--since` is an explicit override. See the section above.
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
   `item_forward_events` (the table step 4 just populated), and — behind `--signals` — detects L4 signal
   candidates and (2026-09-03 auto-adoption rule, superseding the original "operator review only, never
   auto-adopted" posture — see `fsi-app/src/lib/connections/signal-confidence.mjs`'s header for the full
   evidence-based reasoning) **splits them**: a DECISIVE candidate (a structured shared regulation
   identifier, or a shared title entity with >=2 independent tokens or a registered one) is written as a
   real `item_cross_references` edge (`origin='provenance_discovery'`, through `write-edges.mjs`) and any
   existing open flag for it is auto-resolved (`resolution_note='auto-adopted:signal:<kind>:<weight>'`);
   an UNDECIDED candidate keeps the pre-existing behavior — an `integrity_flags` row for operator review.
   The 5-axis classification proposer/applier (`scripts/classification/{propose,apply}-classifications.mjs`,
   not run as part of a turn today) got the same treatment: `apply-classifications.mjs --auto-adopt`
   writes high-confidence `scope_modes`/`scope_verticals` and the always-deterministic `expected_output`
   proposal without an operator ratify marker; `scope_topics` and `jurisdictions` stay review-only.

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

### The sitemap walker (lane SITEMAP, 2026-09-04; `--all-hosts`/`--check-coverage` added lane SITEMAP-3,
### 2026-09-04)

`source-sweep.yml`'s fourth `walker` option, `sitemap`, is the answer to the operator's own question:
"do you do mapping of the sites and store them in supabase so we can use a site map to identify new
pages?" and "did you do mapping of rss feeds and save them in supabase?" — YES to both, and this section is
where a coordinator drives it.

**What it does, in order (`src/lib/sources/sitemap-walk.mjs`'s `walkSource`, over an EXISTING `sources`
row's `url` — never a fixed portal the way the other three walkers work):** (1) is the source's own URL a
feed document? (2) a `<link rel=alternate>` tag on its homepage, or one of six named common feed paths
(`src/lib/sources/feed-discovery.mjs`) — first candidate that actually parses as a feed wins, and a
discovered feed is handed to `feed-walk.mjs`'s existing walker and the source row's `rss_feed_url` is
recorded through the guarded write path. (3) ONLY when no feed is found: `robots.txt` `Sitemap:` lines,
else the three conventional fallback paths (`/sitemap.xml`, `/sitemap_index.xml`, `/sitemap-index.xml`),
bounded fan-out through any `<sitemapindex>`, scoped to the source's own registered path, diffed against
the previous URL-set snapshot (Supabase Storage, `sitemap-snapshots/<source_id>/current.json.gz` in the
`raw_fetches` BUCKET — never the `raw_fetches` DB table, which `change-sweep.mjs` already owns for its own
HTML diff). New locs feed the SAME `portal_link_candidates` ledger every other walker in this family
writes to; a changed `lastmod` matching a LIVE item's canonical URL on that exact source queues a
`monitoring_queue` signal (precision-gated — see `shared-dataset-ownership.md`'s `monitoring_queue`
section). Politeness: the driver's shared `politeFetch` (1 req/s, `SOURCE_SWEEP_FETCH_GAP_MS`) governs
EVERY fetch this walker makes, feed probes and sitemap documents alike — the same budget every other
walker in this family already runs under.

**Coverage is now QUERYABLE, not just a side effect of a dispatch.** Migration 304 adds five columns to
`sources` (`sitemap_url`, `sitemap_last_walked_at`, `sitemap_url_count`, `sitemap_walk_outcome` — walked /
no_sitemap / bot_wall / feed_only / unfetchable — `feed_last_probed_at`), written by
`buildSitemapCoveragePatch` through `db.mjs`'s guarded path on EVERY walked row's outcome, apply mode only
(see `docs/inventories/migrations.md`'s row 304 and `shared-dataset-ownership.md`'s `sources.sitemap_*`
entry for the one-writer rule and exact column semantics).

**Three ways to dispatch `--walker sitemap`, by scope:**

1. **One row** — `--source-id <uuid>` (ignores `status`; an explicit single-row probe may target a row
   already marked dead, deliberately).
2. **One host** — `--host <hostname>` (active rows only, www-insensitive) — walks EVERY active `sources`
   row on that host (a host with rows scoped to distinct content paths, `sourceContentPath`, needs each
   walked separately — collapsing to one representative row would silently drop path-scoped candidates for
   every row but the one walked).
3. **A backfill slice** — `--all-hosts [--max-hosts N]` (default `N` = `DEFAULT_MAX_HOSTS` = 40, lane
   SITEMAP-3, 2026-09-04): this is the mode that turns "a backfill of 2,563 sources is 2,563 dispatches"
   into ~16. It groups every ACTIVE `sources` row by host (`groupActiveSourcesByHost`), orders host groups
   never-walked-first then oldest-`sitemap_last_walked_at`-first (`orderHostGroupsForSweep` — this IS the
   resumability property: an identical `sources` snapshot always orders identically, so re-running the same
   command after a prior apply naturally picks up where coverage is thinnest, no state to hand-carry
   between dispatches), takes the first `--max-hosts` host groups, and walks every row on each selected
   host exactly like `--host` would. `run-source-sweep.mjs`'s `DEFAULT_MAX_HOSTS` comment carries the full
   arithmetic (measured per-row cost from a real dispatch × the live active-hosts/active-rows ratio against
   the workflow's 30-minute timeout, with a reserve for non-walk overhead) — re-derive it there, not here,
   if the workflow's `timeout-minutes` or the measured per-row cost ever changes.

   Live counts at the time this was written [CONFIRMED, live SQL, 2026-09-04]: 2,563 `sources` rows total,
   1,630 active, 646 distinct active hosts, 189 rows already carrying a discovered `rss_feed_url`. At the
   default 40 hosts/run, `--all-hosts` covers all 646 active hosts once in ⌈646/40⌉ = 17 dispatches.

**A fourth mode that walks nothing** — `--check-coverage` (requires `--mode dry`; refuses alongside
`--source-id`/`--host`/`--all-hosts`) — a read-only report over the five coverage columns: sources total
(every status), active total, how many active rows have ever been sitemap-walked vs never, a breakdown by
`sitemap_walk_outcome` (a never-walked active row counts under the synthetic key `never_walked`), and how
many rows (any status) carry a populated `rss_feed_url`. Run this before/after an `--all-hosts` sequence to
see the number move, or on its own to answer "have we mapped this site's sitemap yet" for the corpus as a
whole without grepping harness-run artifacts by hand.

Every run's `source-sweep` harness-run artifact carries, in addition to the pre-existing per-walker
metrics, `hosts_walked` / `hosts_skipped_bot_wall` / `feeds_discovered` / `new_locs` / `lastmod_changes`
(computed for any sitemap dispatch, not only `--all-hosts` — a `--host` run against one host still reports
"1 host walked") and, for an `--all-hosts` run specifically, `hosts_selected` / `hosts_remaining_unwalked`
(how many never-walked hosts are STILL never-walked after this run — the number a coordinator watches
count down across the ~17-dispatch backfill sequence).

**Example dispatches** (GitHub Actions → `source-sweep.yml` → Run workflow, or `gh workflow run
source-sweep.yml -f ...`):

```
walker=sitemap  mode=dry    all_hosts=true  max_hosts=5            # preview the next 5 thinnest-covered hosts
walker=sitemap  mode=apply  all_hosts=true                          # apply a full default-sized (40-host) slice
walker=sitemap  mode=dry    check_coverage=true                     # where does the backfill stand right now
walker=sitemap  mode=apply  host=aircargonews.net                   # one named host, e.g. re-checking after a fix
```

## How a coordinator requests a turn

**Option A — `workflow_dispatch` (Actions tab, or `gh workflow run corpus-turn.yml`):** pick `mode`
(`dry` or `apply`), `limit` (default `200` — max OPEN `corpus_turn_requests` tickets this turn selects,
oldest-first; ignored when `since` is set — see "First dispatch" below for the arithmetic behind the
default), optionally `since` (an ISO date — an EXPLICIT BACKFILL OVERRIDE that bypasses the ticket queue
and rescopes to `created_at >=` this date instead; leave blank for ticket-queue mode, the default), and
`signals` (default `true` — also runs `analyze-corpus.mjs`'s `--signals` pass). The workflow creates a
fresh `turn/<run-id>` branch off whatever ref it dispatched from (normally `master`) and lands the run's
own commit there.

**Option B — push an empty `turn/**` branch:** a coordinator session that wants a turn without touching
the Actions UI pushes a branch named `turn/<anything>` (e.g. `turn/2026-09-02`) — content doesn't
matter, only the branch name and the push event. This ALWAYS runs in `apply` mode (pushing a turn branch
is, by definition, asking for the real thing) with the default `limit` (push events carry no
`workflow_dispatch` inputs) and lands the run's commit directly on that same branch — no second branch
is created.

## First dispatch

`corpus_turn_requests` stood at **1,709 open tickets** at registration (2026-09-04 wiring audit). The
`limit` input's default, **200**, matches THE GATE's own population-slice unit
(`docs/plans/complete-system-build-plan-2026-09-04.md` §W2.1: "Slices of 200") rather than inventing a
new one. Arithmetic: 1,709 ÷ 200 ≈ 9 dispatches drains today's backlog; this is a recurring, hand-dispatched
cadence (rule 16: no schedule during build), not a one-time drain, since new tickets keep arriving via the
trigger as items change. The 45-minute job timeout comfortably covers 200 items at the per-item costs
already measured elsewhere in this repo — mint's own batch step runs ~0.45-0.6s/item for full
validate+insert (heavier than this family's discovery-score + forward-event-extract work), and
forward-events extraction itself was measured at ~21ms for a whole 89-item batch — with headroom left for
checkout/`npm ci` and the always-unscoped `analyze-corpus.mjs` pass. A directly-measured corpus-turn-
specific per-item wall-clock figure does not exist as of this writing — no live dispatch has run in the
authoring environment (no Supabase credentials, no Actions runner) — so this arithmetic is `[HYPOTHESIS]`
grounded in the two measurements above, not a `[CONFIRMED]` corpus-turn timing.

Recommended first dispatch: `mode: dry`, `limit: 200`, `since` blank — read the printed plan (tickets
selected, would-discover/would-extract counts) before ever writing. Follow with `mode: apply` once the
dry plan looks right; that apply is the run whose own harness-run artifact (`corpus-turn-run-001.json`)
first discharges `scripts/harness-runs/corpus-turn/PENDING-RUN.md`.

Either way, the workflow ATTEMPTS to end by opening a PR from the turn branch to `master` (skipped if
one is already open for that branch, and skipped entirely if the run produced no new
harness-run-artifact content to commit — a run that discovered/extracted/analyzed nothing genuinely new
leaves nothing to land). On this repository that PR attempt is refused by a repository setting (see
"When the workflow cannot open its own PR" below for the actual landing path a coordinator follows
instead, and for the setting that would restore auto-PR). When a PR does open, review and merge it the
same way any other PR is reviewed; nothing about `corpus-turn.yml` auto-merges.

## What lands where

- `scripts/harness-runs/forward-events/forward-events-run-NNN.json` — `run-extraction.mjs`'s own
  self-emitted artifact, every turn, dry or apply.
- `scripts/harness-runs/corpus-turn/corpus-turn-run-NNN.json` — this family's own self-emitted artifact
  (`scripts/turns/emit-corpus-turn-artifact.mjs`), every dispatch, dry or apply, "record it every batch,
  even when zero" (MINT-RUNBOOK.md's own rule, applied here).
- `corpus_turn_requests.consumed_at`/`consumed_by` — a DATABASE write, not a local file: apply mode +
  ticket-queue selection only, and only after every write step above has succeeded (see "Item selection"
  above). Left untouched in dry mode, in `--since` override mode, and on any failed apply.
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

**A pushed branch is not itself a landed run: it sits orphaned until a coordinator lands it.** A run
that pushes `turn/<run-id>` (or `source-sweep/<run-id>`) is not done the moment the workflow goes
green — that branch carries the run's own commit and nothing else, and stays off `master` until
someone lands it. Case in point: `forward-events-run-003` (corpus-turn run 33658489880, 2026-09-02)
pushed and sat unlanded on its `turn/` branch for a full day before the next train picked it up
alongside `forward-events-run-004` (session-log Addendum 85 ps10). The actual landing path a
coordinator follows, once the PR-attempt is refused per the setting above:
1. `git fetch origin <turn-or-sweep-branch>` and read the run's artifact off it (not off `master` —
   it was never merged there).
2. Cherry-pick that run's own commit onto the coordinator's current integration train alongside
   whatever else is landing in the same pass (the same multi-branch cherry-pick pattern used to land
   concurrent lanes — see session-log's "Nine lanes, zero cherry-pick conflicts" entries for the
   general shape of a train landing).
3. Run the family's own proposer pass over the newly-landed artifact (F28's per-family check; the
   proposer pass records its own session-log addendum, same as the discipline memory gate requires
   for the train's other content — the run-record commit itself is exempt, the proposer pass is not).
4. Open the train's own PR by hand (per path 2 above) since Actions cannot open it; merge once
   discipline checks pass. This retires the run's branch as a side effect of the train landing —
   there is no separate PR for the turn/sweep branch itself once it has been cherry-picked in.
Until the operator flips the setting named above, EVERY turn/sweep/ledger-consume/change-detection/
propagation-drain branch needs this same hand-landing — an unlanded branch is not a failure, but it is
also not progress until someone runs these steps.

## The first full backfill over ALL existing items

**Historical note (pre-2026-09-04):** this section originally described `since: 1970-01-01` as the
zero-turns-yet default, because `since`'s blank default read `last-turn-date.mjs`'s `LAST-TURN.json`
marker, which itself defaulted to the epoch with no prior marker. As of lane TURNREQ (2026-09-04) the
blank default is the ticket queue, not the epoch, and `since` is an explicit override — the text below
still describes a real, supported path (a full-corpus rescope), just no longer the thing a blank `since`
does on its own.

Dispatch `corpus-turn.yml` with `mode: apply` and `since: 1970-01-01` — the epoch value
`export-corpus-for-extraction.mjs`'s own `--since` filter and `discover-for-items.mjs`'s `--since` filter
both treat as "every item ever created." This is the way to force a full-corpus rescope regardless of the
ticket queue's own state: it is not a special mode, just the normal apply path with the widest possible
explicit `since`. Every step downstream is already idempotent
(discovery's edges dedupe on the connection signature, extraction's dedupe key is migration 275's, the
ledger upserts on `UNIQUE url`), so a full backfill can be safely re-dispatched if it fails partway
through — a re-run only re-covers what a prior partial run did not finish, at the cost of re-examining
(never re-writing) what it already did.

**It has been done** (2026-09-01, run 33566259450): discover wrote 1,931 edge rows (107 new, 1,824
refreshed, 5 skipped as owned by the entity/semantic origin, prior state snapshotted); export found 185
of 322 live items without a forward event and the extractor confirmed 0 events for them (they are exactly
forward-events-run-001's no-event set, 322 − 137); analyze persisted 14 themes (replacing 9; delta:
8 persisted, 1 split, 4 appeared), opened 12 coverage-gap, 7 anticipate and 297 signal-candidate flags,
and its own VERIFY passed. `scripts/turns/LAST-TURN.json` carried that run's start time at the time
(historical — a blank `since` no longer reads that marker; see "Item selection" above), so the next
dispatch with a blank `since` was incremental under the pre-2026-09-04 mechanism.

A LATER apply (run 33756943043, 2026-09-03) grew the open signal-candidate count to 930
(`shared_regulation_identifier` 154, `shared_title_entity` 776) under the original "operator review
only" posture — with nobody positioned to review 930 flags one at a time, the signals could never become
edges. That is the run the 2026-09-03 auto-adoption rule (step 5 above) directly answers: the NEXT
`--signals` apply after this lane's change re-classifies that same open set through
`signal-confidence.mjs` and reports/writes the would_adopt / would_flag / would_resolve split — read that
run's own log line for the actual post-rule numbers rather than assuming a re-derivation here.

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

## Ledger consume

A third, related workflow, **`ledger-consume.yml`** (Lane CONSUME, system-completion plan, 2026-09-02;
the session-verdict $0 flip below is Lane LEDGER-ZERO, 2026-09-04), runs `run-ledger-consume.mjs` (new,
`fsi-app/scripts/turns/`) — the CONSUME half of the same `portal_link_candidates` ledger
`source-sweep.yml` discovers into. Where `source-sweep` writes candidate URLs, `ledger-consume` reads
them: it gives a production runtime to `consumePortalCandidates` (`fsi-app/src/lib/intake/portal-
harvest.ts`), which had ZERO callers anywhere in this repo before Lane CONSUME (system-completion plan
§0, item 1) — 1,454 `status='candidate'` rows sat with no reader (1,840 at the time of the 2026-09-04
wiring audit). It is dispatch-only, plus one `workflow_run` event chain (see below), no schedule armed,
and always self-emits its own `ledger-consume` harness-run artifact
(`scripts/harness-runs/ledger-consume/`), from a `finally` block, in every mode.

### The session-verdict $0 default (operator ruling 2026-09-04)

Verbatim: **"stop offering API when you have a free option with Haiku"**; **"why is this costing me
anything when it can be done for free?"**. Before this change, **every** dispatch — `plan` or `apply` —
called Haiku (`firstFetchClassify`, ~$0.001/candidate) for every candidate whose fetch cleared the
200-char floor; `plan`'s "read-only" promise was about writes, never about spend. That is closed now:

- **`--verdicts <path>`** (a repo path to a session-verdict batch — see `fsi-app/scripts/turns/ledger-
  verdicts/README.md` + `schema.json` for the file contract, and how a session lane produces one for
  $0 via its own model access rather than the metered API). A candidate whose URL matches an entry in
  the file is classified from that verdict — the classify call is bypassed entirely, `$0`,
  `classify_source: "session-verdict"` in this run's own artifact.
- A candidate **without** a matching verdict is **SKIPPED** — left `status='candidate'`, untouched, for
  a later batch — and is **NEVER sent to the API**, unless the driver was run with the explicit,
  CLI-only `--allow-api` flag (default `false`). `ledger-consume.yml` does **not** expose `--allow-api`
  as a workflow input, so a workflow dispatch can never spend on classify by omission — only a human
  running the script directly and asking for it by name can.
- **`--export-candidates <path>`** is a separate, READ-ONLY mode (no classify, no DB write, no harness-run
  artifact — it is a listing utility, not a consume pass): it writes the candidate rows (`candidate_id`,
  `url`, `source_id`, `anchor_text`, `first_seen_at`, source metadata) to classify offline into a
  `--verdicts` file, using the SAME prompt the live chokepoint uses (`FIRST_FETCH_HAIKU_SYSTEM_PROMPT` /
  `buildFirstFetchClassifyUserMessage`, both exported from `first-fetch-classify.ts` for exactly this —
  ONE BODY, never a second hand-typed copy).
  - **`--with-text` (Lane LEDGER-EXPORT, 2026-09-04) — the fix for a defect the coordinator confirmed at
    16:55 the same day.** Without it, the export listed rows with no page text and its own
    `note_on_fetched_text` said "a session lane must fetch each URL itself (e.g. via the browser)". The
    coordinator tried exactly that over 1,837 candidates: Haiku classification lanes fetching through
    WebFetch hit rate limits within minutes, and one lane started guessing a classification from the URL
    string instead of the fetched page — refused. **The browser is no longer the fetch path.** `--with-
    text` fetches every listed row's URL through `run-ledger-consume.mjs`'s OWN `buildFetchDoc` — the
    SAME polite fetcher (politeness gap + 20s timeout) `plan`/`apply` mode already uses to fetch every
    candidate it classifies; never a second, hand-rolled fetcher — and carries the fetched text (sliced to
    `first-fetch-classify.ts`'s `CONTENT_MAX_CHARS`, imported not retyped) in the payload: `text`,
    `fetched_chars`, `fetch_ok`, `fetch_error` (null when ok), `fetched_at`, `transport` per row.
    `fetch_ok: false` marks a row that failed to fetch (`fetch_error` names why) or fell under
    `portal-harvest.ts`'s own 200-char floor (`consumePortalCandidates`'s "1 — FETCH" step,
    `if (text.trim().length < 200)` — `fetch_error: "below_floor_200"`, text still carried, not
    classify-ready). A classification lane consuming this file must NOT fetch these URLs itself.
    **Lane LEDGER-TEXT, 2026-09-04 [CONFIRMED]:** `buildFetchDoc` used to return `res.text()` raw —
    every one of the first export's 400 rows carried ~6,000 chars of unstripped HTML/markup in `text`,
    not text. It now decodes charset-aware and strips via the shared `htmlToText`
    (`src/lib/text/html-to-text.mjs`), routing a PDF body through `pdfToText` instead — `text` is
    genuinely extracted text from this fix forward. Any export or verdict batch produced before it
    (run 33902755838, 2026-09-04 17:51, and anything classified from it) must be re-run.
- **`prompt_version`** (`FIRST_FETCH_CLASSIFY_PROMPT_VERSION`, also exported from `first-fetch-
  classify.ts`) is a content hash of the live system prompt, stamped into every verdict entry. A verdict
  whose `prompt_version` does not match the driver's own live constant is excluded from use — per-entry,
  non-fatal, counted honestly in the run's own artifact — never silently accepted as current.

### Access-wall detection + API/rendering transports (Lane LEDGER-WALLS, 2026-09-04)

**THE FACTS [CONFIRMED by coordinator, ledger-consume export #5, run 33908401816, 2026-09-04 19:20]:** of
400 candidates, 338 cleared the 200-char usability floor — but 308 of those 338 (91%) were a bot/interface
shell, not document text: ~230 `www.federalregister.gov` document URLs returned the SAME 1,180-char
"Request Access" CAPTCHA shell every time, and ~76 `eur-lex.europa.eu/legal-content/` URLs returned
nothing but EUR-Lex's own portal chrome (language selector, "My EUR-Lex" nav, document metadata table)
with zero legislative-body text. Both cleared the floor, so both were sent to classify; the seven
session-Haiku lanes correctly returned `"uncertain"` for every one of them — 230+ verdicts spent proving
what a mechanical text check catches for free.

- **`src/lib/sources/access-wall.mjs` — the ONE content-based bot-wall/access-wall detector.** ONE BODY,
  not a second detector (CLAUDE.md standing rule): the Federal Register/eCFR "Request Access" pattern and
  the JS-render-shell pattern are REUSED, not re-derived, from `transport-escalation.mjs`'s
  `REQUEST_ACCESS_RE`/`JS_SHELL_RE` (the agent/grounding pipeline's own RD-14 capture-time classifier); the
  CDN-block/bot-challenge/soft-404 patterns are reused from `primary-fallback.mjs`'s
  `CDN_BLOCK_RE`/`CHALLENGE_RE`/`SOFT_404_RE` (the reground fallback's roadblock detector) — both files now
  `export` those constants (previously module-private; zero behavior change to either file's own
  detector). New in this module: a cookie-consent-only shell, a login/subscription wall, a generic
  "browser not supported" shell, and the EUR-Lex-specific STRUCTURAL check
  (`looksLikeEurlexInterfaceShell` — an absence-of-content check, not a regex: portal-chrome markers
  present AND every legislative-body marker — `\bArticle 1\b`, "HAS ADOPTED THIS ...", "HAS DECIDED AS
  FOLLOWS", "Whereas:" — absent; scoped to `eur-lex.europa.eu` `/legal-content/` document URLs only, so a
  genuine EUR-Lex portal/homepage page is never misclassified). `detectAccessWall(text, {host, path})` is
  PURE — never fetches, never touches Supabase — returning `{kind, evidence}` or `null`.
  **Measured over the 400-row export #5 (re-run against the actual production code path, not by hand):**
  `request_access: 231, eurlex_interface_shell: 76, browser_not_supported: 1` — 308 of 338 fetch_ok rows
  (91.1%).
- **`buildFetchDoc` runs every fetch through `detectAccessWall`, checked BEFORE the 200-char floor** — a
  wall body routinely clears 200ch on raw length alone (the FR shell is 1,180ch). A detected wall folds
  into the SAME `{text, transport}` return shape as an extra `wall: {kind, evidence}` field, regardless of
  which transport produced the text (direct HTML fetch, direct PDF, or either API transport below) — no
  transport is exempt. `shapeCandidateTextFields` (the `--export-candidates --with-text` shaping pass) and
  `portal-harvest.ts`'s live `plan`/`apply` FETCH step both read this ONE flag rather than re-running the
  detector: `fetch_ok:false`, `fetch_error:"access_wall:<kind>"` in the export;
  `disposition:"skipped"`, `reason:"access_wall:<kind>"` in the live consume path — row stays
  `status='candidate'` for retry, exactly the same inconclusive-not-reject treatment a below-floor or
  failed fetch already gets. `sitemap-walk.mjs`'s own bot-wall check (`isBotWallStatus`, 401/403/429 only —
  blind to a 200 OK CAPTCHA page) now ALSO runs `detectAccessWall` on `discoverFeed`'s homepage probe and
  on a sitemap fallback candidate that parses as `kind:'unknown'`, naming the wall kind in
  `walkSitemap`'s `error` when every fallback candidate is a content wall rather than reporting the
  indistinguishable "no sitemap discovered".
- **`src/lib/sources/api-transport.mjs` — federalregister.gov/ecfr.gov routed through their official API,
  never the CAPTCHA-fronted HTML page.** `fetchDocumentApi` is the SAME body
  `src/lib/agent/canonical-pipeline.ts`'s grounding pipeline already used for this (`apiFetchForHost`,
  RD-14 transport ladder) — factored out so both consumers (the grounding pipeline, and
  `run-ledger-consume.mjs`'s `buildFetchDoc` directly) call one function, never a second hand-typed copy.
  A federalregister.gov `/documents/YYYY/MM/DD/{DOCUMENT_NUMBER}/slug` URL resolves to
  `/api/v1/documents/{DOCUMENT_NUMBER}.json`, whose `raw_text_url` is fetched for the real plain-text
  document (falling back to the JSON's own `title`+`abstract` when `raw_text_url` is absent, fails, or
  extracts under the 200-char floor) — `transport:"federalregister-api"`. An ecfr.gov
  `/on/YYYY-MM-DD/title-N/...` URL resolves to the versioner's `/versioner/v1/full/DATE/title-N.xml` —
  `transport:"ecfr-api"` (a bare `/current/title-N/...` with no `/on/DATE/` carries no versioner date and
  falls through to the HTML transport instead). A URL with no document-specific identifier (an
  agency-listing page, say) also falls through — the honest exhaustion path, never a silent skip.
- **EUR-Lex: a bare `/legal-content/<LANG>/TXT/?uri=...` URL is rewritten to its `/TXT/HTML/` rendering
  form before fetching.** Investigated per this lane's dispatch (OJ: uri form vs CELEX, `/TXT/HTML/`
  endpoint, ELI/CELLAR REST, language/redirect): the bare `/TXT/` form is the one that serves the
  portal-chrome-only shell (measured: 76/76 legal-content rows in export #5, 100%, carried zero
  legislative-body markers); `/TXT/HTML/` is EUR-Lex's own full-text rendering endpoint. Rather than a new
  mechanism, this reuses `primary-fallback.mjs`'s existing `renderingUrlForPrimary` — already PROVEN on a
  real case (CSRD CELEX:32022L2464) by the reground fallback pipeline — so `buildFetchDoc` and that
  pipeline can never disagree on the rewrite. (This sandbox had no live network egress to eur-lex.europa.eu
  to test fresh against the failing URLs directly — `curl` returned HTTP 000, the proxy status showed a
  403 CONNECT rejection for federalregister.gov too — so the endpoint choice is grounded in the repo's own
  already-confirmed mechanism, not a fresh live test by this lane; labeled [INFERRED] on that basis, not
  [CONFIRMED].) No API transport exists for EUR-Lex (`apiEndpointFor` only names
  federalregister.gov/ecfr.gov) — the rewrite is a no-op for every other host.

### Modes, and the apply flip

`plan` classifies (from a verdict, or skips) every fetched candidate and writes NOTHING to
`portal_link_candidates` or the intake pipeline. `apply` pushes the would-mint set through the full
stage -> mint -> ground -> validate cycle and stamps the ledger disposition — gated by
`LEDGER_CONSUME_APPLY_ENABLED` in `run-ledger-consume.mjs`, **`true` as of 2026-09-04** (Lane
LEDGER-ZERO, operator ruling above, `docs/decisions/ADR-023-producer-execution-model.md`'s reviewed-
change mechanism, the same source-constant gate the data producers use — see that ADR's Consequences
section for the record of the flip). Before this it was structurally DISARMED
(`LEDGER_CONSUME_APPLY_ENABLED = false`); a `mode: apply` dispatch that requests apply while the const is
false still does not fail and does not silently run as if nothing were requested — it logs an "APPLY
DISARMED" line, executes with `plan` semantics, and records `config.requested_mode: "apply"` /
`config.apply_disarmed: true` / `config.mode: "plan"` in its own artifact — that mechanism is unchanged,
just no longer the default outcome. With the const now `true`, an `apply` dispatch WITH a `--verdicts`
file (or `--allow-api`) actually writes; one with NEITHER mints nothing — every candidate skipped for
want of a classification source, a legal, honest, explicitly-logged no-op, never a silent downgrade.

**DECISION, recorded here (build plan W1.4's "name in a comment... decide and document"): `apply` is
reachable ONLY via an explicit `workflow_dispatch`.** The `workflow_run` event chain below (see next
section) always forces `mode: plan`, regardless of what an operator might otherwise want — there is no
`mode` input to read from a `workflow_run` event in the first place, and a source-sweep completion is a
"check whether there is new work" signal, not an "operator decided to write now" signal; those are kept
separate. Separately, and independently: an `apply` dispatch that supplies neither `verdicts_file` nor
`--allow-api` also does not write anything, even though it was an explicit dispatch — the workflow's "This
run's gates" step emits a `::warning::` for exactly this combination so it is visible in the run log, not
silently absorbed.

### Event chaining, not a schedule (build plan W1.4)

`ledger-consume.yml` carries a `workflow_run: workflows: ["Source sweep"]` trigger (rule 16 governs
`schedule:`/cron, not event chaining — this is not a schedule). When `source-sweep.yml` completes
successfully, `ledger-consume.yml` fires automatically in `mode: plan`, resolving the newest committed
`scripts/turns/ledger-verdicts/ledger-verdicts-*.json` batch if one exists (lexicographic sort on the
zero-padded `NNN` suffix), or running with no verdicts file at all if none does (every candidate skipped,
$0 — an honest "nothing classified yet" plan run, still worth having on record). This still requires a
human (or a follow-up dispatch) to act on the plan's output — plan never writes — and, per the DECISION
above, can never itself become an apply.

### Telemetry — closed at the source, not by this driver

Every classify call that actually reaches the API in a `ledger-consume` run leaves its own `agent_runs`
row (operator ruling 2026-07-06: "every classify call must leave an agent_runs row") — `firstFetchClassify`
routes every Haiku call through `spend-client.ts`'s `spendMessage`, which writes the `agent_runs` row
itself (`recordSpendCall`, keyed by `source_id` from the `SpendTicket` `firstFetchClassify` sets
internally). `run-ledger-consume.mjs`'s `collectClassifyTelemetry` is a READ-ONLY collector, not a
write-site: it captures `FirstFetchClassifyResult`'s cost/token fields per URL so this family's own
artifact can report real numbers without a second lookup or a second ledger write. A session-verdict hit
or a no-verdict skip writes NO `agent_runs` row at all — there is no real spend event to log — but both
still flow through the SAME telemetry map (`buildVerdictClassify`, tagged `classify_source:
"session-verdict"` / `"skipped-no-verdict"` / `"api"`), so this run's own artifact reports exactly where
each outcome's classification came from and what, if anything, it cost.

### What lands where

`scripts/harness-runs/ledger-consume/ledger-consume-run-NNN.json` — the family's own self-emitted
artifact, every consume dispatch (plan or apply; NOT `--export-candidates`, which is read-only and writes
no artifact). `scripts/harness-runs/ledger-consume/traces/ledger-consume-run-NNN.result.json` — the run's
FULL raw `ConsumeResult`, one level below the family directory so F28's family-level `*.json` glob never
mistakes it for an artifact. The workflow commits only `scripts/harness-runs/ledger-consume/**`, via a
fresh `ledger-consume/<run-id>` branch and PR (`deliver-artifact-branch.sh`, same fallback-to-tracking-
issue behavior documented above for `corpus-turn`/`source-sweep`), and uploads its own
`scripts/_snapshots/**` workflow artifact the same way.

**`export_candidates: true` dispatches land on the SAME `ledger-consume/<run-id>` branch pattern, via the
SAME `deliver-artifact-branch.sh` mechanism** (Lane LEDGER-EXPORT, 2026-09-04) — the ONLY thing that
differs is what the branch carries: `scripts/_snapshots/ledger-candidates/candidates-<run-id>.json` (the
`--with-text` export payload), force-added despite `scripts/_snapshots/` being gitignored (`.gitignore`
line 64 — the same reasoning `ledger-verdicts/README.md` gives for why `--verdicts` files live at a
committed path instead: a path under `scripts/_snapshots/` never reaches `origin` unless force-added, and
the coordinator fetches this branch from `origin`), never a `scripts/harness-runs/ledger-consume/**`
artifact (an export dispatch classifies nothing, mints nothing, and self-emits no harness-run artifact —
see this section's opening paragraph). This IS the intended re-use: the coordinator fetches
`ledger-consume/<run-id>` exactly the way it already fetches every other `ledger-consume` artifact branch,
never a second delivery mechanism for this family. Also uploaded as a `ledger-consume-snapshots-<run-id>`
workflow artifact, same as any other run (the `scripts/_snapshots/**` glob already covers it).
`population-turn.yml`'s own `workflow_run` chain off this workflow already treats a `ledger-consume/<run-
id>` branch carrying no `scripts/harness-runs/ledger-consume/**` file as a graceful no-op ("carries no
ledger-consume harness-run artifact this checkout doesn't already have") — an export dispatch needed no
change there.

### Secrets

`ledger-consume.yml` now references only `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` — the
`ANTHROPIC_API_KEY` precondition is REMOVED from the workflow's plan (and apply) path, because the $0
session-verdict default no longer calls Haiku unconditionally; the real API path (`--allow-api`) is
CLI-only and this workflow never sets it. `ANTHROPIC_API_KEY` stays registered in `WORKFLOW_SECRETS`
(`.discipline/governance/secrets-registry.mjs`, Lane SPEND, 2026-09-02) for the humans who DO run
`--allow-api` by hand outside this workflow — `node .discipline/governance/secrets-reference-audit.mjs`
reports every workflow secret reference registered either way.

### First dispatch (proves this component per the build plan's §0)

**The export step now comes first, and it is dispatched, not run by hand** (Lane LEDGER-EXPORT,
2026-09-04 — this session environment has no network egress to fetch ~1,837 candidate URLs; the Actions
runner does). The exact first dispatch, via `ledger-consume.yml`'s `workflow_dispatch`:

```
export_candidates=true  export_limit=400  export_after=''
```
— equivalently, `node scripts/turns/run-ledger-consume.mjs --export-candidates
scripts/_snapshots/ledger-candidates/candidates-<run_id>.json --with-text --limit 400`. This fetches (via
the SAME `buildFetchDoc` a consume pass uses) and lists the FIRST 400 candidates, oldest-first
(`first_seen_at, id` order — the same order the consume path itself walks), and lands on
`ledger-consume/<run_id>` (see "What lands where" above). Its own payload's `next_cursor` — a
`{"firstSeenAt":"...","id":"..."}` object — feeds the SECOND dispatch's `export_after` input, and so on:
```
export_candidates=true  export_limit=400  export_after=<next_cursor from the previous batch's payload>
```
repeated until a batch's `next_cursor` is `null` (~5 dispatches to cover ~1,837 candidates at 400/batch —
the last batch shorter). Each batch is then classified by a session-Haiku lane directly from its carried
`text` field — no browser fetch, no WebFetch rate limit, per the `--with-text` account above — into a
`--verdicts` file matching `fsi-app/scripts/turns/ledger-verdicts/schema.json`; producing those verdict
batches is NOT part of this runbook update or Lane LEDGER-EXPORT's write set (the coordinator's Haiku
lanes' job, per the build plan's own §W1.1) — this entry documents the mechanism and the exact first
dispatch, both for the export and for the consume pass it feeds:

```
node scripts/turns/run-ledger-consume.mjs --mode plan \
  --verdicts scripts/turns/ledger-verdicts/ledger-verdicts-001.json --limit 50
```
— or, via `ledger-consume.yml`: `mode=plan`,
`verdicts_file=scripts/turns/ledger-verdicts/ledger-verdicts-001.json`, `limit=50`. Success for the export
side is: the `ledger-consume/<run_id>` branch (or its tracking-issue fallback) carries
`scripts/_snapshots/ledger-candidates/candidates-<run_id>.json` with `count > 0`, `with_text: true`, and
`fetch_ok_count` accounting for most of `count` (a nonzero `fetch_failed_count` is expected — dead links,
timeouts — not a failure of the dispatch itself). Success for the consume side, once a verdicts batch
exists, is unchanged: `ledger-consume-run-001.json` lands with `metrics.with_verdict > 0`,
`metrics.promoted > 0` (once an `apply` dispatch follows a reviewed plan), and `metrics.est_usd === 0`.

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

### Chaining: dispatched automatically after Data producers (lane CHAIN, 2026-09-04)

`propagation-drain.yml` also fires on `on.workflow_run: {workflows: ["Data producers"], types:
[completed]}` — every time `producers.yml` finishes, in addition to `workflow_dispatch`. This closes W1.4
of `docs/plans/complete-system-build-plan-2026-09-04.md` and the B4→B5 gap
`docs/audits/wiring-audit-2026-09-04/C1-loop-map.md` §3 names: "the propagation outbox trigger (B4) —
genuinely zero-touch; it just has nothing pointed at it downstream," and its own §5 reading (b), step 4:
"Chain B4 (already automatic) → B5 (drain) ... with the same `workflow_run` mechanism." **Event-driven off
a completed run, not a cron cadence** — the same rule-16 reading `population-turn.yml`'s own chaining
uses; no `schedule:` block here is armed or uncommented by this change.

**What decides whether a chained run drains.** The workflow's first step ("Resolve run parameters and the
chaining gate") checks only the upstream run's own `conclusion`
(`github.event.workflow_run.conclusion`) — `"success"` drains, anything else is a named no-op
(`::notice::`, job still exits 0 green). Unlike `population-turn.yml`'s chain off `ledger-consume.yml`,
there is **no per-run artifact to read a promoted-style count from**: `producers.yml` writes straight
through the guarded Supabase path with no branch/PR step of its own (a producer run leaves no
`producers/<run_id>` branch to fetch — this family "has no landing backlog by construction," per the
wiring audit's A1 §6), and the propagation outbox trigger `emit_propagation_event()` (B4) already fires
unconditionally, in the same transaction, on every producer write regardless of how many rows a given run
touched. "Upstream concluded success" is therefore the complete, correct gate for this family — a
producer run that succeeded but wrote nothing new (an idempotent no-op upsert; `producers.yml`'s own
header: low-cadence sources are "almost always a no-op upsert") simply drains a batch that finds nothing
new to invalidate, which is the honest, correct outcome, not a false positive the way an ungated
`ledger-consume` plan run's `would_mint` count would be for `population-turn.yml`.

**What a chained run actually drains with.** `mode: apply`, `batch: 500` (the same default the `batch`
input already uses). **The two opt-in checkboxes stay hand-only** (build plan W4.3, verbatim): a chained
dispatch never ticks `backfill_entities` or `seed_derived_values`, regardless of what a prior hand
dispatch chose — a coordinator who wants an entity-spine backfill or a derived-value seed pass still
dispatches this workflow by hand for it. The run's own `propagation-run-NNN.json` gains a
`config.trigger_context` field — `{name: "Data producers", run_id, conclusion}` for a chained dispatch,
`null` for a hand dispatch — written by `run-propagation-drain.mjs`'s `--trigger-context` flag
(`propagation-drain.yml` passes it straight through), so the artifact alone always answers whether a
given drain was hand-dispatched or chained and, if chained, off which upstream producers run.

**This chain does not honour `POPULATION_PAUSED`** (`population-turn.yml`'s own pause variable — see
`POPULATION-TURN-RUNBOOK.md`'s "Population stop" section). `POPULATION_PAUSED` stops NEW record-grade
minting during the T46 validation window; it says nothing about decision propagation, which is Loop B
(spec 08) draining events already queued from producer writes that already happened. The two stops are
independent by design — pausing the drain during the population pause would let `propagation_events` grow
unboundedly for a reason unrelated to why population itself is paused.

**Manual dispatch is unaffected** — `workflow_dispatch` remains, every input unchanged; chaining is
additive.

**What lands where:** `scripts/harness-runs/propagation/propagation-run-NNN.json` — the run's own
self-emitted artifact (dry or apply). No other file is committed by this workflow; `derived_values`,
`derivation_edges`, and the `drained_at` marks on `propagation_events` are database writes, not local
files, matching the same "database writes leave no local file beyond the harness-run artifact" posture
`corpus-turn.yml`'s own "What lands where" section states above for `discover-for-items.mjs` and
`analyze-corpus.mjs`.

**First run.** `scripts/harness-runs/propagation/PENDING-RUN.md` records the pre-first-run
harness-version hash pin (mirroring the mint/screen family's own convention) — it is replaced by the first
real `propagation-run-001.json` once a run actually lands, the same lifecycle `forward-events`'s
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

## DAG authorship at write time

Added by Lane DAG-AUTHOR (propagation build-out, 2026-09-04) — closes the gap
`docs/audits/wiring-audit-2026-09-04/C1-loop-map.md` §3 named: "new producer/mint data → derivation_edges |
NOBODY does this today." Before this lane, the ONLY way a `derived_values`/`derivation_edges` pair came
into existence was a one-off run of `seed-derived-values.mjs` (above) — a producer's own ordinary write
(a new `emission_factors` row, a new `regional_data_facts` fact) never touched the DAG at all, so the drain
had nothing new to invalidate/recompute as the corpus grew, only at the moment someone remembered to
re-run the seed by hand.

**The one authoring module.** `fsi-app/src/lib/propagation/author-edges.mjs` exports `authorEdges(sb,
figure, deps)` — given a landed figure `{table, id, entity, method: {id, version}, inputs: [{table, pk}]}`,
it looks up the registered method (`methods/index.ts`'s `getMethod`), checks `hasBeenAuthored()` (every
declared input scanned against live `derivation_edges` joined to `derived_values` for a matching
`(method_id, method_version)` — idempotent on that natural key; `derived_values`/`derivation_edges`
deliberately carry no DB-level unique constraint, since a legitimate recompute/supersede chain repeats
rows, so idempotency is enforced here, in application code, not the schema), computes the method against
the resolved inputs, and writes through the SAME `registerDerivedValue()` → `register_derived_value(...)`
RPC every other caller in this family uses (see "Propagation drain" above) — never a second write path.
EVERY producer that can feed a registered method imports this ONE module; none reimplements the
idempotency check or the RPC call itself.

**Wired at two chokepoints, covering five producers with two call sites:**
- `fsi-app/scripts/gen/emission-factors-common.mjs`'s `seedFactors()` — the shared write path for
  `emission-factors-desnz.mjs` and `emission-factors-epa.mjs` — calls `authorCarbonIntensityEdges()` right
  after its own guarded insert, over the rows PostgREST actually reported back (never the pre-insert
  candidates). Licence-gated: `mayEmbedAsSeed(source_key)` — a non-embeddable source's factor is never
  turned into a derived value, matching `seed-derived-values.mjs`'s own gate.
- `fsi-app/scripts/producers/regional/run-envelope-producer.mjs`'s `runEnvelopeProducer()` — the shared
  write path for `bls-oews-producer.mjs`, `eurostat-lc-lci-lev-producer.mjs`,
  `eurostat-nrg-pc-205-producer.mjs` — calls `authorAutomateVsHireForRegions()` over the run's own touched
  region ids. Picks the MOST RECENT hourly-wage (`isHourlyWageUnit`) and operational-cost fact per region;
  mints the region's jurisdiction entity on demand (via `resolveRegionEntityId`, reused unmodified from
  `seed-derived-values.mjs`) when absent.
- `market_series` producers (`eia-v2-petroleum-spot-producer.mjs`, `ecb-fx-producer.mjs`,
  `eu-weekly-oil-bulletin.mjs`) are deliberately **not wired** — neither registered method consumes
  `market_series`, so authoring an edge from it would point at nothing any method reads.
- `src/lib/intake/write-item.ts` (the record-item mint chokepoint) was checked and **refused**: no table it
  writes is in `derivation_edges`'s `from_table` allowlist (migration 285), and no registered method
  consumes anything it writes — there is nothing to author there today.

**The one-time historical bridge.** `fsi-app/scripts/entities/backfill-derivation-edges.mjs` (new, this
lane) closes the gap for rows written BEFORE the wiring above existed — it calls the exact same two
functions (`authorCarbonIntensityEdges`, `authorAutomateVsHireForRegions`) over every live
`emission_factors` row and every region carrying a `labor_markets`/`operational_cost` fact, no
reimplemented logic. `--dry` (default) reports candidate counts; `--apply` authors for real; `--limit N`
bounds each candidate list for a pilot run. **Retirement condition** (see the file's own header for the
full statement): run it once unbounded with `--apply`, then run it again unbounded with `--apply`
immediately after — a second run reporting `candidates: 0` on both counters is the signal every historical
row is now authored and every future row is already covered by the two chokepoints above, at which point
the file, its `propagation-drain.yml` checkbox, and this section are deleted.

**How a coordinator requests a backfill run:** the `backfill_and_statutory` checkbox on
`propagation-drain.yml`'s `workflow_dispatch` (added this lane) runs
`backfill-derivation-edges.mjs` and then `write-statutory.mjs` (next section) before the drain step,
honouring the dispatch's own `mode` (`dry`/`apply`). Both steps are independent no-ops when their inputs
are empty/absent — enabling the checkbox on a routine dispatch cannot fail the run.

## Statutory computations (first writer)

Added by Lane DAG-AUTHOR (propagation build-out, 2026-09-04) — the first `statutory_computations` writer
(spec 08 §4's FuelEU Maritime worked example, instantiated). `fsi-app/scripts/propagation/write-statutory.mjs`
reuses `src/lib/statutory/types.ts`'s `computeStatutory("fueleu_annex_iv_penalty", ...)` (Layer 2, built by
Lane DP-SURF 2026-09-02) unmodified — this script only resolves entities, gates every input through
`admissibleFor()` (use='filing', spec §3.3's pollution barrier), and writes the row.

**Rows-file-driven, not a live table read — a finding, not a shortcut.** Neither `market_series` nor
`obligations` (migration 290) carries a ship-level GHG-intensity-actual or energy-used figure anywhere in
this corpus (confirmed live, read-only SELECT, 2026-09-04) — see the script's own header for the full
finding, including why the one live `obligations` row naming Regulation (EU) 2023/1805 (an implementing
verification-activities regulation, not the Annex IV penalty itself) is not used as the obligation source.
`--rows-file <path>` (JSON) is REQUIRED in both dry and apply mode — each row supplies a `shipKey`,
`targetYear` (2025 only — see below), and three fully-provenanced `StatutoryInput`-shaped blocks
(`ghgIntensityActual`, `energyUsedMJ`, `consecutiveDeficitYears`), each checked against `admissibleFor()`
before the row can be assembled. **No rows-file has been prepared/reviewed as of this writing — the honest
first-apply count is 0 rows**, not a fabricated number.

**2025-target-only.** Article 4(2) of Regulation (EU) 2023/1805, verified live against EUR-Lex
CELEX:32023R1805 this session (2026-09-04): the reference value 91.16 gCO2eq/MJ is reduced 2% from
1 January 2025 (target = 89.3368 gCO2eq/MJ). Every other `targetYear` is refused BY NAME
(`SUPPORTED_TARGET_YEARS`) — the fetch mentioned a 6% reduction from 2030 without giving verbatim Article
text, and did not cover 2035/2040/2045/2050 at all, so only 2025 is implemented.

**How to run it:**

```
node scripts/propagation/write-statutory.mjs --rows-file path/to/rows.json               # dry (default)
node scripts/propagation/write-statutory.mjs --apply --rows-file path/to/rows.json        # writes
```

Exit 0 done · 1 unexpected fatal · 2 no DB creds · 3 missing/bad `--rows-file`. Idempotent on the table's
own natural key (`entity_id, formula_id, formula_version, scenario_key`, migration 286's own UNIQUE
constraint) — an existing row is read and skipped before any insert, never re-inserted or updated; a
genuine recompute needs a caller-chosen new `scenario_key` (the same convention migration 286 documents
for itself).

**`estimated_values`'s automate-vs-hire sibling already exists** — `seed-derived-values.mjs`'s
`seedAutomateVsHire` (documented above) — and is not duplicated by this lane.
