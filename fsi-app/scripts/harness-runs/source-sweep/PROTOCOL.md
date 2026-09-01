# Source-sweep protocol — every lane's contract (RT lane, 2026-09-01)

This is the source-sweep family's counterpart to `scripts/harness-runs/forward-events/PROTOCOL.md` and
`fetch-drain/PROTOCOL.md` — modelled on both, read in full before writing this. See
`scripts/harness-runs/CONVENTION.md` for the artifact schema this protocol's step 3 writes to, and
`PROPOSER-RUNBOOK.md` for the read-before-you-run cadence step 1 below invokes.

`source-sweep`'s governing files (per CONVENTION.md's `harness_version` table) are:

```
scripts/turns/run-source-sweep.mjs        -- the driver; the family's canonical entry point
src/lib/sources/register-walk.mjs         -- the date-paged EUR-Lex OJ / Federal Register index walk
src/lib/sources/feed-walk.mjs             -- the RSS/Atom feed walk
```

Both walker modules are PURE and dep-injected (no network of their own — see each module's own header);
`run-source-sweep.mjs` is the live binding (real `fetch`, a real ledger write, a real harness artifact).
Neither walker module is modified by this family's own operation — a source-sweep run only ever CALLS
them with real dependencies, exactly as `analyze-corpus.mjs` calls `src/lib/connections/cluster.mjs`
without editing it.

**Registered with ZERO artifacts on record.** Unlike `forward-events` (which deliberately withheld its
own `scripts/harness-runs/forward-events/` directory until FE-3's first real run landed alongside it —
see that PROTOCOL.md's own header), this family's driver, GOVERNING_FILES entry, and CONVENTION.md row
land in the SAME commit as this document, ahead of any real run, per the operator's explicit build-out
instruction for the corpus-turn/source-sweep runtime layer. `scripts/harness-runs/source-sweep/
PENDING-RUN.md` (this directory's sibling file) is the honest record of that: it names the harness_version
at write time and the first real run that will supersede it. **This does NOT satisfy F28 rule (b)** (every
registered family must have ≥1 valid artifact) — PENDING-RUN.md only speaks to rule (c) (staleness
coupling), which itself is skipped for a family with zero valid artifacts (see F28's own
`auditStalenessCoupling`). F28 legitimately reports `NO ARTIFACTS` for `source-sweep` until the first
`source-sweep-run-001.json` lands — this is the same "never run yet" state every other family starts from,
made visible rather than hidden, and it is EXPECTED, not a bug in this registration: the environment that
authored this driver has neither live network access to eur-lex.europa.eu / federalregister.gov / an
arbitrary feed host, nor Supabase credentials (the exact ADR-023 gap the sibling `producers.yml` /
`data-audit-lane.yml` workflows exist to close for the producer/audit families) — so no real walk could be
run here to produce one.

## 0. What one "run" is

**One run = one walk of one walker over one named window** — a `register-eurlex` or
`register-federal-register` date range (`--from`/`--to`), or a single `feed` URL — through
`run-source-sweep.mjs`, ending in either a dry plan (fetched, parsed, counted, nothing written) or an
apply write (candidates upserted into `portal_link_candidates` through the guarded client). A run is
scoped to its own window/feed, not to "every register and every feed, always" — `.github/workflows/
source-sweep.yml` dispatches one walker + window per run, matching this scoping.

**This is an enumeration family, not a mint or an extraction family**: nothing here classifies, stages,
or mints anything. `register-walk.mjs` / `feed-walk.mjs` only discover candidate URLs and hand them to
the SAME ledger (`portal_link_candidates`, migration 162) the scheduled `check-sources` crawl's
`persistPortalCandidates` call already writes to — see `run-source-sweep.mjs`'s own header for why that
function is mirrored rather than imported (a `@/`-path-alias resolution blocker under plain `node`,
verified by attempting the import directly). Turning a candidate into a corpus item still rides
`consumePortalCandidates` (`src/lib/intake/portal-harvest.ts`), an existing, separate, LLM-classifying
pass this family does not invoke.

## 1. Before the lane starts — the proposer pass

Per `PROPOSER-RUNBOOK.md` §1: read every artifact in `scripts/harness-runs/source-sweep/` in full,
`started_at` order, including every path in each artifact's `full_trace_refs`. Before this family's own
run history exists, there is nothing to read but this document and `PENDING-RUN.md` — say so explicitly
in `proposer_notes` rather than fabricating a reading history.

## 2. During the lane — capture per-walk evidence AS the walk runs, not from memory afterward

`run-source-sweep.mjs` already does this: each walker's own per-day/per-page/per-entry result (`days[]`,
`pages[]`, or the single feed outcome) is written verbatim to `<run_id>.raw-result.json` under the
harness-runs directory (or `--out-dir`) BEFORE it is shaped into `per_item`/`metrics` — the raw file, not
a hand-summary, is what `full_trace_refs` points at.

## 3. MANDATORY, the lane's last step — write the run artifact

`run-source-sweep.mjs` writes this automatically, from a `finally` block, in BOTH dry and apply mode, so
a walker that throws mid-run (a network flake, a non-2xx HTTP response) still leaves a record — the same
crash-safety `run-extraction.mjs` and `run-mint-batch.mjs` already apply to their own families. A lane
never needs to call `writeRunArtifact` by hand for this family; running the driver IS the emission step
(the same "emission is in the harness, not the operator" discipline `screen-worklist.mjs` and
`run-mint-batch.mjs` already apply — build plan §2).

## 4. Idempotency — how re-runs stay safe

`portal_link_candidates` upserts on its `UNIQUE url` — a re-walk of the same window/feed refreshes only
`last_seen_at`/`anchor_text`, never `status`/`first_seen_at`/disposition columns (migration 162; mirrored
verbatim by `upsertPortalLinkCandidates`). A dry re-run of the same window reproduces the same discovered-
candidate counts (the walkers are pure over their injected fetch, so the SAME live index/feed content
walked twice produces the same links); an apply re-run of the same window is a no-op write (every URL
already has a row).

## 5. The family's standing metric — measured, not asserted

Per `PROPOSER-RUNBOOK.md` §3's per-family table, `source-sweep`'s entry (see CONVENTION.md for the full
statement): **candidates discovered per walk**, broken down by walker and by ledger-write disposition
(`upserted` vs `failed`). Each run's `metrics` records the walker-native counts its own walk actually
produced (`days_walked`/`extracted_total` for `register-eurlex`; `pages_walked`/`total_count` for
`register-federal-register`; `entries`/`ok` for `feed`) — never a number asserted from familiarity with
the walker's design.

## 6. After ≥2 runs exist — proposer attestation

Once `scripts/harness-runs/source-sweep/` holds ≥2 valid artifacts, `LAST-PROPOSER-PASS.md` must name the
latest run's `run_id` (F28 rule (d)). Update it as part of the SAME lane that writes the new artifact —
not a follow-up task, the same discipline every other family's protocol states for itself.
