# Forward-events protocol — every lane's contract

Staged by lane FE-2 (schema/protocol lane) for the coordinator to place at
`fsi-app/scripts/harness-runs/forward-events/PROTOCOL.md`. **Not placed in the repo by this lane on
purpose**: creating `scripts/harness-runs/forward-events/` without a run artifact landing in the same
commit is exactly what fitness function F28 (harness-run-integrity, Wave MH-2) exists to catch — "a
harness family whose code changed (or whose lane ran) without a run artifact recording why." This
document has no run behind it yet; the coordinator lands it together with (or immediately ahead of) the
first lane that actually runs the extractor and writes `forward-events-run-001.json`.

This is the forward-events family's counterpart to `scripts/harness-runs/fetch-drain/PROTOCOL.md` —
modelled on it directly, read in full before writing this. See `scripts/harness-runs/CONVENTION.md` for
the artifact schema this protocol's step 3 writes to, and `PROPOSER-RUNBOOK.md` for the
read-before-you-run cadence step 1 below invokes. `forward-events`'s governing files (per
CONVENTION.md's `harness_version` table) are:

```
scripts/forward-events/extract-forward-events.mjs
scripts/forward-events/load-forward-events.mjs   -- the coordinator-run loader (see step 3); if this
                                                     lane's build has not yet split extraction from
                                                     loading into two files, hash the single combined
                                                     file instead and update this line in the same commit
```

**One-time setup this protocol assumes but does not itself perform:** `"forward-events"` must be added
to `ALLOWED_FAMILIES` in `scripts/lib/run-artifact.mjs` before any lane can call `writeRunArtifact` for
this family — it is not there today (checked against both the FE-1 and FE-2 worktrees at
`8afb2f5f`). That one-line addition is itself a code change, so it lands together with — never ahead
of — the first `forward-events-run-001.json` it makes possible, the same F28 discipline this whole
document exists to uphold.

## 0. What one "run" is

**One run = one extraction pass over one defined, named corpus slice** — a fixed set of
`intelligence_item_id`s (e.g. "the 24-item fixture," "every live item with `provenance_status =
'verified'` as of `<date>`," "the 189 items Addendum 78 measured as carrying forward-obligation
language") — through `extractForwardEvents()`, followed by that pass's rows either (a) being handed to
the coordinator to load, or (b) being loaded by a lane running through the guarded write path, per the
two-track policy below. A run is scoped to its corpus slice, not to "the whole corpus, always" — a
narrow, explicitly-named slice (a fixture, a single item, a spot-check batch) is a legitimate run and
should say so in `config.corpus_slice`, not silently imply full-corpus coverage it didn't attempt.

**This is an extraction family, not a fetch or a mint family**: nothing here calls a network, an LLM, or
spends a cent. `extractForwardEvents()` is pure and dependency-injected (no I/O of its own) — a run
supplies it with `{claims, sections}` already pulled from the database or a fixture file, and it returns
`{events, skipped}` synchronously. Everything this protocol adds on top of that pure function is about
capturing the run honestly and getting its output into the database safely, not about the extraction
step itself needing orchestration.

## 1. Before the lane starts — the proposer pass

Per `PROPOSER-RUNBOOK.md` §1: read every artifact in `scripts/harness-runs/forward-events/` in full,
`started_at` order, including every path in each artifact's `full_trace_refs` — not just `metrics` and
`defects_found`. Read `LAST-PROPOSER-PASS.md` first; it names the latest run this family has already had
a proposer pass against. **Before this family's own run history exists**, the equivalent reading is
`scripts/forward-events/DRY-RUN-REPORT.md` (FE-1's 24-item, 796-claim, 220-section dry run) — its "Bugs
found and fixed," "Judgment calls," and "What defeated me" sections are exactly the `defects_found` /
`proposer_notes` content a first proposer pass would otherwise have to rediscover from scratch. A lane
whose brief is this family's first true run (the one that writes `forward-events-run-001.json`) reads
that report in full as its proposer-pass precondition; a lane after that reads the accumulated run
history the normal way.

If a defect there has no fix landed (e.g. the AFIR nested-sub-clause under-extraction, or the CBAM
delegated-powers `compliance_deadline` mis-kind — both named "left as a limitation" rather than fixed in
the dry-run report), confirm it is still open before assuming a later change closed it.

## 2. During the lane — capture per-item evidence AS the extraction runs, not from memory afterward

Run `extractForwardEvents({claims, sections})` once per item in the corpus slice and record, per item, the
`events` and `skipped` arrays it returns — this is what `per_item` and `metrics` are built from at step 3.
Do not hand-summarize the counts after the fact from a terminal scrollback; capture the actual
`event_kind`/`confidence`/`source_span` values as they come out, the same discipline
`DRY-RUN-REPORT.md`'s "Full event list" / "Full skipped list" tables already followed.

**The extractor never writes.** `extractForwardEvents()` takes no file paths, opens no DB connection, and
performs no `INSERT` — it is a pure function returning plain objects. Nothing in this family's own code
writes to `public.item_forward_events`. Turning a run's `events` array into live rows is the coordinator's
act, not the extraction lane's: per CLAUDE.md standing rule 3 ("data migrations commit with consumer code
and run after merge"), the load step is data-writing code that lands with the lane's PR and is *executed*
only by the coordinator (or a coordinator-authorized guarded-write-path run, the same posture
`scripts/lib/db.mjs` already provides for other pipeline writers) — never by the extraction lane applying
its own INSERTs directly against the live database. A lane's report for this family states the events it
extracted and proposes the load; it does not claim the load happened unless the coordinator's own apply
log says so.

## 3. MANDATORY, the lane's last step — write the run artifact

Every forward-events lane ends by writing
`scripts/harness-runs/forward-events/forward-events-run-NNN.json` (`NNN` = next unused number after the
highest `forward-events-run-*.json` already in that directory). This is not optional follow-up — exactly
the discipline `fetch-drain/PROTOCOL.md` §3 states for its own family and `MINT-RUNBOOK.md` §6 states for
mint. The writer invocation:

```js
import { writeRunArtifact, hashHarnessVersion } from "./scripts/lib/run-artifact.mjs";

const harness_version = hashHarnessVersion([
  "scripts/forward-events/extract-forward-events.mjs",
  "scripts/forward-events/load-forward-events.mjs",   // or the single combined file — see header above
]); // baseDir defaults to cwd — run from fsi-app/

writeRunArtifact("scripts/harness-runs/forward-events", {
  harness_family: "forward-events",
  harness_version,
  run_id: "forward-events-run-NNN",        // next unused number, zero-padded 3 digits
  started_at: "<ISO 8601 UTC — this lane's own start time>",
  config: {
    corpus_slice: "<the named, defined population this run covered — e.g. 'fixture-24-items.json' or "
      + "'live items with provenance_status=verified as of 2026-09-01'>",
    extractor_version: "<EXTRACTOR_VERSION this run's code carried, e.g. 'fe1-2026-09-01.1'>",
    load_status: "<'not loaded (proposed only)' | 'loaded by coordinator, apply ref <migration/commit>'>",
  },
  inputs_ref: [ /* the query or fixture file this run's {claims, sections} population came from */ ],
  per_item: [ /* every item in the slice, at the scale CONVENTION.md's "per_item at scale" rule allows —
                  DRY-RUN-REPORT.md's own per-item table (24 items) is small enough to inline in full;
                  a full-corpus run should follow the screen/fetch-drain precedent instead: the items a
                  report table names individually, full population in full_trace_refs */ ],
  metrics: {
    /* items_in_slice, items_with_events, events_emitted, events_skipped, confidence_breakdown
       (high/medium counts), event_kind_breakdown — PLUS this family's standing metric, see §5 below */
  },
  defects_found: [ /* anything this lane found wrong in the extractor's classification; root_cause;
                       fix_ref (null if unfixed) */ ],
  full_trace_refs: [ /* this run's own report file(s) — e.g. a DRY-RUN-REPORT.md-shaped doc, never
                          summarized */ ],
  proposer_notes: "",
});
```

A lane that skips this write leaves this family exactly as exposed as `fetch-drain` was before Wave MH-2:
a harness whose code or corpus population changed with nothing recording why.

## 4. Idempotency — how re-runs stay safe

Two independent guarantees, one at the extraction layer and one at the storage layer:

- **Extraction is pure and deterministic.** `extractForwardEvents()` has no internal state and no
  randomness; the same `{claims, sections}` input always produces the same `{events, skipped}` output,
  byte-for-byte, including `source_span`. Re-running the extractor over an unchanged corpus slice
  produces the identical event set, never a superset or a divergent one.
- **Loading is idempotent at the database layer.** `public.item_forward_events` (migration 274) carries
  `UNIQUE (intelligence_item_id, event_date, event_kind, source_span)` specifically so a re-run's load
  step is a `INSERT ... ON CONFLICT (intelligence_item_id, event_date, event_kind, source_span) DO
  NOTHING` (or equivalent upsert) rather than requiring the loader to pre-diff against existing rows
  itself. A second run over the same corpus slice — whether because the corpus didn't change, or because
  a lane re-ran to confirm reproducibility — inserts zero new duplicate rows. A run that changes only
  because the *corpus* changed (a brief was re-ground, a new claim landed) will emit new, genuinely new
  `source_span` values for the changed item and leave every unchanged item's rows untouched by the
  `ON CONFLICT` guard.

A lane's `proposer_notes` should say explicitly when a run is a deliberate re-run over a previously-run
slice (to demonstrate idempotency) versus a first run over a new slice — both are legitimate run shapes,
and conflating them in the record is exactly the kind of ambiguity CONVENTION.md's schema exists to
prevent.

## 5. The family's standing metric — measured, not asserted

Per `PROPOSER-RUNBOOK.md` §3's per-family table, forward-events' entry is:

| Family | Standing metric |
|---|---|
| `forward-events` | **extraction precision** + **coverage** |

Both are counts a lane actually produces during the run, never a number asserted from familiarity with
the extractor's design:

- **Extraction precision** = *(hand-checked emitted events whose date, kind, and span all match their
  source text) ÷ (events checked)*. "Checked" means a human (or a lane) actually re-read the
  `obligation_text` and original source for that event and confirmed `event_date`/`date_precision`,
  `event_kind`, and `source_span` are all correct against it — the exact discipline
  `DRY-RUN-REPORT.md`'s "Hand-check: precision assessment" section already applied (all 122 events across
  every item that produced output, not a random sample stopped at 25). A run's `metrics` records both the
  numerator and the denominator (`precision_events_checked`, `precision_events_correct`), not only the
  ratio — so a later reader can tell "100% of 8 checked" apart from "100% of 122 checked" without opening
  the full trace.
- **Coverage** = *(items with ≥1 emitted event) ÷ (items whose brief carries forward-obligation
  language)*. The denominator is NOT "every item in the corpus" — most items (informational/administrative
  briefs, pure market-intelligence content) correctly produce zero events, and counting them against
  coverage would make a working extractor look broken. It is also not a fixed constant to be reused
  run over run: Addendum 78 (session-log, 2026-09-01) measured 189 of 322 live items as carrying
  forward-obligation language on that date, but that population changes as the corpus grows and as briefs
  are re-ground — a run's `metrics` records how its own denominator was determined
  (`coverage_denominator_method`, `coverage_denominator_as_of`), not a hardcoded 189. The dry-run's own
  15-of-24 (fixture items that produced ≥1 event, against a 24-item slice where 9 named items were
  hand-confirmed to genuinely carry no dated obligation language — not an extractor gap) is the shape this
  metric takes, scaled to whatever slice a given run covers.

Both metrics are retrospective in the sense that they require a hand-check pass, not merely running the
extractor and counting its own output — an extractor confidently mis-kinding an event is invisible to a
metric computed only from the extractor's own claims about itself. A run that has not hand-checked any
events reports `precision_events_checked: 0` honestly rather than omitting the field or defaulting it to
a number that looks like 100%.

## 6. After ≥2 runs exist — proposer attestation

Once `scripts/harness-runs/forward-events/` holds ≥2 valid artifacts, `LAST-PROPOSER-PASS.md` must name
the latest run's `run_id` (F28 rule (d)). Update it as part of the SAME lane that writes the new artifact
— not a follow-up task, the same discipline fetch-drain's protocol states for its own family.

## Running the extractor's own proofs

The proofs are execution-wired into the shared suite, not run by hand:
`.discipline/run-test-suite.sh` carries `fsi-app/scripts/forward-events/*.test.mjs` alongside
`fsi-app/scripts/mint/*.test.mjs`, so CI runs them on every push. Locally:

```
sh .discipline/run-test-suite.sh                                  # the whole suite, incl. these
node --test scripts/forward-events/extract-forward-events.test.mjs  # this family alone
```

56 tests cover every supported date form, every `event_kind`, the RED-first non-extraction cases (a
document-number citation such as "Directive 2005/35/EC" must produce nothing), precision tagging, the
verbatim-span assertion, and degenerate input. Wiring them into the suite is what keeps them from being
an ORPHANED PROOF under F23, whose rule is that a proof CI never executes does not count as a proof —
naming the test in a runbook is not sufficient, and an earlier draft of this file wrongly claimed
`scripts/**` was outside the suite's globs when `scripts/mint/**` had been inside it all along.
