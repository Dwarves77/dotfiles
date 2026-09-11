# Date-chain fix — runbook (DATECHAIN lane, 2026-09-11)

Operator's instruction, 2026-09-09, verbatim (also recorded in `docs/ops/session-log.md`):

> the fix is making sure a full brief, analysis of the data and all information is pulled and then put
> through the flywheel to make sure we are connecting data points across the site, right now we have a
> completely broken and unwired set of tools. it should NOT be locked out, it's integral to the site, so
> this needs addressed. You're giving me these three like they are options to fix but ALL of them look
> like they need fixed, the system isn't working because all of this is a problem and briefs need to
> exist for all items as well.

This lane built all three fixes (A/B/C below) as code, on branch `lane/datechain-2026-09-11`, and staged
— but did not execute — the three corpus-wide runs this document commands. Numbers below are
[CONFIRMED] by live query against project `kwrsbpiseruzbfwjpvsp` on 2026-09-11; re-run the same queries
before dispatching if time has passed, since dev=prod and the corpus keeps growing.

## What changed (A/B/C)

**A — unlocked the harvest.** `sectionBrief()`'s F2 skip-if-verified guard
(`fsi-app/src/lib/agent/canonical-pipeline.ts`) protects one thing: a blanket section delete would
CASCADE-destroy a verified item's `section_claim_provenance` ledger. The §14 timeline harvest never
touched either table, but lived *inside* `sectionBrief` *after* that guard's early return, so it was
blocked for every verified item too — 1,434 of 1,518 live items (measured 2026-09-11; the operator's
2026-09-09 figures, 1,123/1,195, are from two days earlier — the corpus grew in between). The harvest is
now `harvestItemTimeline(itemId, sbClient?)`, a standalone function that reads `intelligence_items` and
writes only `item_timelines`. `sectionBrief`'s verified-skip branch now calls it before returning; the
normal (re-section) branch calls the identical function. The guard's protection of the cascade is
untouched — it still gates the section reconcile, and only that.

Proof: `fsi-app/src/lib/agent/timeline-harvest-unlock.npmtest.mjs` — an injected fake Supabase client
that records every table touched. For a verified item, it asserts `item_timelines` gets the
delete-then-insert with the parsed milestones, and that `intelligence_item_sections` /
`section_claim_provenance` are never called at all — the exact tables the guard exists to protect.

**B — gave `compliance_deadline` a writer.** `fsi-app/src/lib/forward-events/compliance-deadline-sync.mjs`
is the one canonical sync from `item_forward_events` into `intelligence_items.compliance_deadline`. Rule,
stated in the module's own header and in code: among an item's `item_forward_events` rows with
`event_kind = 'compliance_deadline'` (the migration's own vocabulary already names this kind — no
guessing) and `event_date >= today`, pick the row with the **earliest** `event_date`; a same-date tie
breaks toward `confidence='high'` (claim-sourced) over `'medium'` (section-sourced), then row id. Never
overwrites a non-null stored value with null (a future-events read of zero rows is a no-op, not an
erase). Idempotent: re-running with the same inputs writes nothing a second time. Wired into the live
flywheel — called from `mint-item.ts` and `apply-staged-update.ts` right after each one's own
`item_forward_events` insert (each in its own try/catch, so a sync failure can never mask a forward-events
success or vice versa — rule 16(d)'s independent-step posture).

Proof: `fsi-app/src/lib/forward-events/compliance-deadline-sync.test.mjs` — a two-event fixture picks the
nearer future date and writes it; re-running the identical fixture changes nothing; an empty-events fixture
against an item that already has a stored date changes nothing (never overwrites with null).

**C — guarded the class.** `fsi-app/scripts/verify/population-report.mjs`'s `STORES` gained four entries:
`item_timelines` (fill: `milestone_date`), `item_forward_events` (fill: `event_date`), `intelligence_items`
/ `compliance_deadline`, and **brief coverage** — the operator's own naming ("briefs need to exist for all
items as well") — live items whose `full_brief` is the stub catalogue-record marker
(`*Catalogue record: extracted facts only, full brief pending.*`, exported as `STUB_BRIEF_MARKER` from
`fsi-app/src/lib/intake/record-facts.mjs` so no second hand-typed copy of the string exists) or is null.
`countStore` gained optional `totalQuery`/`filledQuery` overrides for this last entry, since "filled" here
is a text-pattern exclusion, not a plain non-null check.

Proof by attack (`fsi-app/scripts/verify/population-report.test.mjs`): each of the four new entries is
fed a fixture at **zero** — `item_timelines`/`item_forward_events` at `rows=0` (EMPTY), `compliance_deadline`
at `filled=0` over a nonzero corpus (ROWS_NO_VALUES), brief coverage at `filled=0` (ROWS_NO_VALUES) — and
the test asserts `classify()` actually returns a non-`FILLED` state for each, i.e. the report goes red, not
just that the entry exists.

## The three staged runs (dry-run by default; `--execute` writes)

Run in this order — cheapest and least destructive first. Every command is bounded (`--limit`) and
resumable (`--after-id`, printed by each run's own summary line), so a run can be split across sessions
without redoing completed items.

### Command 1 — forward-events backfill (FREE, no model)

```
export PATH=/home/claude/.npm/_npx/387698761821791d/node_modules/node/bin:$PATH   # Node 24
cd fsi-app
node scripts/forward-events/dispatch-extraction.mjs                        # dry-run first
node scripts/forward-events/dispatch-extraction.mjs --execute              # then write
# bounded example: node scripts/forward-events/dispatch-extraction.mjs --limit 300 --execute
```

**Scope measured 2026-09-11 [CONFIRMED]:** 1,231 of 1,518 live items have zero `item_forward_events`
rows (821 rows / 289 items are already covered — items minted or substantively updated since the
extractor shipped 2026-09-01; everything else predates it).

**Cost class: FREE. No model call, ever.** Read `src/lib/forward-events/extract-forward-events.mjs`'s own
header: "Pure, deterministic, $0, no-LLM module." `readAndExtractForwardEvents`
(`src/lib/forward-events/read-and-extract.mjs`), which this dispatcher and the live mint/update paths all
share, only reads already-stored `section_claim_provenance` / `intelligence_item_sections` rows (plus,
conditionally, `agent_run_searches` for one narrow due-date-context rescue) — no fetch, no Browserless, no
Anthropic call. This script also syncs `compliance_deadline` (Part B) for every item whose new events
include a `compliance_deadline`-kind row, using the same pick rule, via `guardedUpdate` (the scripts-side
guarded-write path, distinct from the app-runtime `svc()` calls `mint-item.ts`/`apply-staged-update.ts`
use for the identical sync).

**RD-31 (priced-line / batch-marker):** not applicable — this command spends nothing on any key, so there
is no priced line to write. The existing scripts in this family
(`scripts/turns/apply-extraction-output.mjs`) already write a harness-run artifact per the
`scripts/harness-runs/forward-events/` convention when run through the harness; this dispatcher is a
direct DB writer in the same family and does not currently emit a `harness-runs` artifact of its own — a
gap worth closing in a follow-up, not a blocker to running it (it writes through `guardedInsertMany`, so
every write is still snapshotted and cited).

### Command 2 — unlocked timeline harvest (FREE, no model)

```
cd fsi-app
node scripts/backfill-item-timelines.mjs                        # dry-run first
node scripts/backfill-item-timelines.mjs --execute               # then write
# bounded example: node scripts/backfill-item-timelines.mjs --limit 300 --execute
```

**Scope measured 2026-09-11 [CONFIRMED]:** 993 live reg-family items (`regulation`/`directive`/
`standard`/`guidance`/`framework`) carry a `full_brief`; of those, 893 have zero rows in `item_timelines`
today (1,169 rows exist total, but concentrated on only 131 items — the pre-guard-fix seed/harvest
population). This command re-parses every reg-family item's §14 section and replaces its `item_timelines`
rows only when the fresh parse yields ≥1 row (never destroys a stored timeline it cannot reproduce — see
the script's own REPLACE RULE).

**Cost class: FREE. No model call, ever.** `extractRegulationSections` (the §14 display parser) and
`buildTimelineRows` (`src/lib/agent/timeline-harvest.mjs`) are both pure string parsers over `full_brief`
text already stored in the database — this script calls no LLM and fetches nothing over the network. Run A
above (the sectionBrief unlock) makes this the SAME parser every future generation now runs automatically;
this command is the one-time sweep that catches up the corpus that won't regenerate on its own.

**RD-31:** not applicable, same reasoning as command 1 — zero spend, nothing priced to mark.

### Command 3 — full-brief generation for stub items (MODEL-BACKED, subscription lane only)

**Scope measured 2026-09-11 [CONFIRMED]:** 1,102 live items have only a stub catalogue record instead of
a full brief (1,101 carry the exact `*Catalogue record: extracted facts only, full brief pending.*` marker;
1 has `full_brief IS NULL` entirely) — 73% of the live corpus. This is the number the operator's ruling
("briefs need to exist for all items as well") names, and it is now the exact figure
`population-report.mjs`'s new "brief coverage" entry prints every run, not a one-off measurement that goes
stale.

**Cost class: touches a model.** Full-brief GENERATION (`generateBrief`/`generateBriefFromStored` in
`fsi-app/src/lib/agent/canonical-pipeline.ts`) is the ONE step in this whole date-chain fix that is not a
pure parser — it synthesizes a brief from grounded source material via the spend-gated model client
(`src/lib/llm/spend-client.ts`). Per the operator's own instruction, this is **NOT** to run as direct API
calls billed to his Anthropic key. It runs as **subscription Claude Code lanes** — the same intake path
the pipeline already uses for every other generation — through the standard chokepoint:

- **Intake entry point:** `mintIntelligenceItem` / the `update_item` path in `applyStagedUpdate`
  (`fsi-app/src/lib/intake/{mint-item.ts,apply-staged-update.ts}`) is what a lane calls so a generated
  brief lands with real provenance (sections, claim ledger, source registration, and — as of this lane —
  timeline harvest + forward-events extraction + compliance_deadline sync all firing automatically off the
  same write) rather than as pasted text with no grounding trail. A stub item already has an
  `intelligence_items` row (it was minted as a `grade='record'` catalogue stub); regenerating its brief is
  therefore an `update_item` proposed-change through `applyStagedUpdate` — `full_brief` is a content
  column, so this is automatically a SUBSTANTIVE update and gets full rule-16 flywheel participation
  (discovery, forward-events, and now compliance-deadline sync) for free, the same wiring commands 1 and 2
  exist to backfill for the rest of the corpus.
- **Batch size a subscription lane can carry:** 1,102 items is too large for one lane session (context-cost
  rule 11 — a session accumulates cost with turn count, not just output size). Dispatch in batches of
  **~40-60 items per lane session** (in line with this repo's existing batch conventions —
  `scripts/mint/run-mint-batch.mjs` and the population-turn workflow both default to double-digit-to-low-
  hundreds batches, not the whole corpus in one session), ordered by whichever priority the operator sets
  (verified-but-stub items first is the natural default — a stub item that's already `provenance_status=
  'verified'` is the sharper contradiction: certified with no real content).
- **RD-31 (priced-line / batch-marker):** applies here, unlike commands 1-2 — a real model spend. Each
  lane's generation run goes through the existing spend-gated client (`spend-client.ts`), which already
  writes the priced line/ticket this rule requires; no new mechanism is needed, only the dispatch decision
  (which items, what batch size, which lane) — an operator/coordinator call, not a build-time change.

## Bounded and resumable, all three

Every command supports `--limit N` (process at most N items this run) and `--after-id <uuid>` (resume past
the last id a prior run reported, printed in each run's final summary line). None of the three commands
requires a single unbounded pass — split by batch, verify, continue.

## After running: re-measure

`node scripts/verify/population-report.mjs` (from `fsi-app/`) prints the current state of all four new
entries (plus the pre-existing ones) every time it's run — that is the ongoing, no-longer-one-off answer
to "are briefs, timelines, forward-events, and compliance deadlines actually populated," per rule 15
("a guard is proven by attack, not by presence") applied the other direction: presence is now *measured*,
continuously, not merely asserted once in this document.
