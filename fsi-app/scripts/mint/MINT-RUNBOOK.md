# Mint runbook — $0, in-session, one payload at a time (M0 kit)

Every mint batch's run history belongs in `scripts/harness-runs/mint/` — see
`scripts/harness-runs/CONVENTION.md` for the artifact schema and `PROPOSER-RUNBOOK.md` for the
read-before-you-run cadence (Wave MH-1).

Absolute rule this kit exists to serve: **zero API spend, no DB writes from a mint lane.** Every step
below is either a read (WebFetch / a read-only Supabase query) or an in-memory authoring step. The
coordinator alone applies the guarded write path. This runbook is the per-item procedure M1..Mn batches
follow; `validate-mint-payload.mjs` is the gate every payload must clear before handoff.

## 0. Before you start

- Run the **relevance re-screen** (see the M0 report, task 3) against the item's title/URL BEFORE
  spending any fetch budget on it. If it fails the sustainability-adjacency test, do not mint it —
  flag it back to the coordinator as a census-classifier false positive instead (see "off-vertical
  disposition" below). Minting a customs/aviation-administration/vehicle-type-approval item wastes the
  batch's fetch budget on an item ADR-020 excludes, and "populated, visible and wrong is worse than
  empty."
- Confirm the item is not ALREADY minted: `SELECT id, provenance_status FROM intelligence_items WHERE
  source_url = '<the exact census_worklist.document_url>'`. This session found at least one would_mint
  census row whose item already exists 'verified' — the census disposition can be stale. A live check is
  cheap; a wasted payload is not.
- Confirm the source is already registered: `SELECT id, url, base_tier, tier_override, status,
  institution_id FROM sources WHERE url = '<the exact document_url>'`. If nothing comes back, the
  coordinator must register the source (registerSource / reclassifyToSource path in scripts/lib/db.mjs)
  BEFORE this item can pass criterion 1 — flag it, don't invent a source row in the payload.

## 1. Fetch the primary text

- WebFetch the `document_url`. Ask explicitly for VERBATIM quotes of the operative articles/sections that
  cover the item_type's four required slots (see `item-type-required-slots.json`), and state plainly
  whether the fetch returned full legal text or a landing/metadata-only page.
- **EUR-Lex specific finding (this session):** of 6 distinct CELEX URLs fetched via WebFetch, 4 returned
  landing/metadata-only pages (no articles) and 2 were exhausted by the WebFetch proxy's per-domain rate
  limit (HTTP 429, persisting past 3 retries with escalating waits). Only 1 (an older, 2011-vintage
  Commission Directive) returned full article text on the first try. This is NOT a reliable pattern by
  document age — a same-session retry of a 2026-vintage regulation also failed twice. Budget for this:
  try the plain `?uri=CELEX:...` TXT form first; if it lands on metadata only, do not burn more than one
  retry in the same batch — queue the URL for a different fetch mechanism (see the M0 report's
  reachability recommendation) rather than spinning WebFetch retries against a live per-domain throttle.
- If the fetch is genuinely metadata-only after one retry, this item is NOT mintable this batch. Flag it
  `fetch_blocked` and move on — do not synthesize a brief from a title alone.
- Copy every span you intend to use as a FACT source_span **exactly**, character for character, from what
  the fetch actually returned. Never paraphrase into a FACT. A claim you cannot ground verbatim is a GAP
  (`"[<slot_key>] not available from primary sources as of grounding"` — the exact string the real
  pipeline's `forceSlotCoverage` GAP path emits, `canonical-pipeline.ts` line ~1532), not an invented FACT.

### 1a. When the fetch runs through `javascript_tool` (browser-cleared pages) — the ≤8,000-char slice
    procedure, LAW as of Wave MH-3

Batch-001 fetched EUR-Lex via a real browser (`claude-in-chrome`) after `pg_net` was proven WAF-blocked
(`BATCH-001-REPORT.md`), reading the cleared page's in-memory document string
(`window.__docs[celex]`) back out through `javascript_tool`. That batch discovered, in-session, that
`javascript_tool`'s return-value channel silently truncates to roughly 1.0–1.5K characters regardless of
the requested slice size — the 20,000-char return this section used to suggest does **not** work; it comes
back cut off mid-string with a `[TRUNCATED]` marker and no error (`BATCH-001-REPORT-v2.md` §1). The
in-session workaround that batch improvised — small offset probes plus ~600–900-char windowed returns
around only the cited spans — was a deliberate targeted-EXCERPT strategy, and it is exactly what
`mint-run-001.json`'s `defects_found[0]` names as the root cause of the batch's capture-completeness
defect: the archived `source-<celex>.txt` files ended up holding 2–12KB of excerpt for documents that
were actually 43,813–178,953 characters, because nothing forced the excerpt-vs-full-capture gap into the
open. `validate-mint-payload.mjs`'s capture-completeness gate (Wave MH-3) now catches this mechanically —
but the RIGHT fix is to never produce an excerpt-shaped capture in the first place. This procedure is now
**mandatory**, not lane-report prose to rediscover each batch:

1. **Measure first.** Read the full in-page document length before extracting anything (e.g.
   `window.__docs[celex].length`, or the DOM node's `.textContent.length`). This number is
   `fetched_length` — record it now, independent of anything you are about to extract. It goes into
   `search_results[].fetched_length` (payload-schema.json, required as of Wave MH-3) untouched by
   whatever happens during extraction.
2. **Slice at ≤8,000 characters per call.** `javascript_tool`'s truncation ceiling is ~1.0–1.5K chars for
   an ARBITRARY return value, but a slice bounded to ≤8,000 chars, read back through a call that returns
   ONLY that slice (e.g. `text.slice(i, i + 8000)` as the entire return expression — no surrounding JSON,
   no extra fields riding along), round-trips complete and untruncated in practice for this kit's fetches.
   8,000 is the documented ceiling, not a target — a smaller slice is always safe if a particular call's
   return still truncates; NEVER quietly accept a truncated slice as "close enough."
3. **Verify every slice before moving on.** For each slice: check its length against the requested
   window bounds; log its first ~40 and last ~40 characters (head/tail) so a truncation is visually
   obvious (a `[TRUNCATED]` marker, or a tail that lands mid-word/mid-sentence rather than at the actual
   slice boundary) even if the tool call itself reports success. A slice that fails this check is
   RE-REQUESTED narrower — never patched by hand, never accepted with a note to "fix later."
4. **Rebuild from empty, by script, never by hand.** Start from an empty string and concatenate verified
   slices, in order, covering `[0, fetched_length)` with no gaps and no overlap double-counted. This
   concatenation is a mechanical step (string concatenation in the same session, or a short script) —
   NEVER retype, paraphrase, or "clean up" a slice's text while assembling it. The assembled result is
   `search_results[].result_content`; because it was built by concatenating verified slices rather than
   retyped from what a human read on screen, it cannot carry the kind of hand-transcription error
   batch-001's `defects_found[1]`/`[2]` found (an ASCII `x` typed for the source's real `×`; curly quotes
   typed for straight ones) — that class of error is now structurally confined to `claims[].source_span`,
   where `validate-mint-payload.mjs`'s unicode-integrity check (Wave MH-3) can actually catch it by
   comparing against this independently-assembled text.
5. **Archive it, separately, before authoring any claim.** Save the same rebuilt full text to a companion
   plain-text file (`source-<celex>.txt`, next to the batch's payload files) BEFORE writing any
   `claims[].source_span` — and record its path in `search_results[].archived_source_path`
   (payload-schema.json, optional but strongly recommended as of Wave MH-3). This is what lets the
   validator's unicode-integrity check compare a claim's hand-copied `source_span` against a reference
   that was NOT typed a second time from the same reading of the page — the independent check
   `mint-run-001.json`'s `defects_found[2]` named as the missing piece (an intra-payload comparison
   cannot catch an error typed identically into two fields by the same hand).
6. **Only then author claims**, copying each `source_span` out of the ARCHIVED file (step 5), not by
   re-reading the live page a second time — one independently-verified text, read once, cited many times.

A batch that cannot clear step 1 (the fetch mechanism truncates below ~1.0K chars even at a ≤8,000-char
request, or the page cannot be measured for a real `fetched_length` at all) is not mintable through this
procedure this batch — flag it and queue a different fetch mechanism, per the existing "genuinely
metadata-only" rule above. Do not fall back to a hand-typed excerpt as an acceptable substitute; that is
exactly the practice this section replaces.

## 2. Resolve the registered source

Read (never write) `sources` for the exact `document_url`, and copy `id`, `base_tier`, `tier_override`,
`status`, `institution_id` verbatim into the payload's `source` object. This is the row criterion 1 checks
and criterion 3's authority floor derives the FACT tier from — do not guess it.

## 3. Author the brief + sections + claims

- Write `item.full_brief` yourself, in your own words for connective prose, but every load-bearing
  sentence a FACT claim points at must be a VERBATIM copy of a fetched span (word-for-word, so criterion 3's
  substring check and criterion 7's Gate-A literal-match both pass).
- Split into `sections[]` matching how the real pipeline's format specs section a brief (a summary,
  the obligations/facts, a gaps/analysis block if you use ANALYSIS or GAP claims, a
  sources/citations block). Every claim's `section_key` must name a real section.
- Cover **every** required slot (`item-type-required-slots.json[item_type]`) with at least one FACT or
  GAP claim whose `claim_text` contains the slot_key literally (e.g. `[effective_date] ...`).
- If you use an ANALYSIS claim, wrap it in one of the three live label patterns in the SAME
  blank-line-delimited paragraph: `*Analytical inference:*`, `*Industry interpretation:*`, or
  `*Operational implication:*` (the canonical three — see `src/lib/agent/analysis-labels.mjs`; a 4th
  legacy label, `*Per the workspace's reading:*`, is tolerated by the live validator for old rows only and
  must never be emitted by new content).
- If any section's prose contains a strong-modal word (`requires`, `must`, `mandates`, `obligates`,
  `prohibits`, `applies to`) that is NOT inside a labeled ANALYSIS paragraph or a `*Legal Confirmation
  Required:*` callout, that section needs at least one FACT claim tied to it (criterion 4's
  unlabeled-assertion scan) — usually true by construction once you've covered the slots.
- Do not introduce a citation URL in any section's prose that isn't either the item's own `source_url`,
  a `search_results[].result_url`, or a `registry_sources[].url` — criterion 2 fails any URL it can't
  ground, and `canonicalize-citation-url.mjs` only forgives `www.`/trailing-slash/markdown-emphasis
  differences, nothing else.

## 4. Build `search_results[]`

One entry per URL you actually fetched, `result_content` = the real fetched text (concatenate multiple
WebFetch calls against the same URL into one entry, or use several `result_index`-ordered entries — either
is fine). Never write a `result_content` you didn't actually see returned by a fetch.

- **`fetched_length` is required (Wave MH-3).** The full document's length in characters, recorded
  independently of `result_content` at fetch time (§1a step 1 for the `javascript_tool` path; for a plain
  WebFetch return, its own reported length). `validate-mint-payload.mjs`'s capture-completeness gate fails
  any `result_content` whose length diverges from `fetched_length` beyond a small documented tolerance —
  `result_content` must be the FULL fetched text, never an excerpt, no matter how well-chosen.
- **`archived_source_path` is optional but should be set whenever §1a's slice-and-rebuild procedure ran**
  — the path to the companion `source-<celex>.txt` file (§1a step 5). Set it and the validator's
  unicode-integrity check runs against that independent reference instead of only against
  `result_content`; leave it unset and you get the weaker, `result_content`-only fallback (documented in
  `validate-mint-payload.mjs`'s own comments) — set it when you have the file.

## 5. Validate locally — the gate

```
node scripts/mint/validate-mint-payload.mjs path/to/payload.json
```

Exit code 0 + `"valid": true` = clears C1-C7 as this kit understands them. Exit 1 prints the exact
`{criterion, reason, ...}` failures — fix and re-run. Every failure reason string matches the live
function's own `jsonb_build_object('criterion', N, 'reason', '...')` output, so a payload that passes here
is a payload the live `validate_item_provenance` RPC would also pass, modulo the two named simplifications
in `validate-mint-payload.mjs`'s header comment (search_result_id resolved by URL match rather than a live
FK; Gate B DERIVED-claim coverage not modeled).

**`criterion: 5, reason: "record_hollow"` (Lane HOLLOW-GATE, 2026-09-04, KIT-ONLY — the live RPC does not
have this check; the kit is stricter here on purpose).** A grade='record' payload whose only FACT claim is
`[title]` (every required slot GAP) fails this even though criterion 5's own `missing_required_slot` check
is fully satisfied — a GAP claim genuinely covers a required slot as well as a FACT does, but "every slot
honestly says nothing" is a different, additional failure this kit refuses to mint. **Live measurement
that motivated this** [CONFIRMED, Supabase, 2026-09-04]: of 1,230 live verified record-grade items, 551
carried ONLY the `[title]` FACT (350 with a real title FACT, 201 with none at all), and 115 carried exactly
one substantive fact beyond the title — one traced example, CELEX `31999D0823`
(`8670d8bf-9847-4da6-8724-0d52308b008e`), had 17,022 chars of real EUR-Lex text and zero extracted facts,
shipped to the customer site with an effectively empty Summary. `apply-mint-batch.mjs`'s existing hold-back
records this exactly like any other kit failure — `dryrun_disposition = 'hold'`,
`hold_reason = 'validation_failed:5:record_hollow'` — and `reopen-validation-holds.mjs` can re-admit the
row once a payload with a real fact is re-minted (see §11/§13 below for the extractor fix that reduces how
often this fires).

**`reason: "not_in_force"` (Lane HOLLOW-GATE, 2026-09-04, `export-census-rows.mjs`'s `buildExportRow`, held
BEFORE a payload is ever built — not a `validateMintPayload` failure at all).** A row whose capture carries
EUR-Lex's own structurally-anchored `forceIndicator` widget markup stating the act is no longer in force
is held with the evidence span and never reaches the extractor or the validator. See §13 below for the
detector and why it is currently inert against the live corpus but real protection against a future
browser-captured row.

**Running the kit's own tests** (not wired into `.discipline/run-test-suite.sh` — `scripts/mint/**` is
this lane's own write set, out of scope for editing that shared file):
```
node --test scripts/mint/validate-mint-payload.test.mjs
```

## 6. Batch size and handoff format

- **Batch size 40-80 payloads** per M1..Mn lane run (per the build plan's queued-lane table), each a
  separate validated JSON file (or one JSON array of payloads — either is fine as long as each element
  independently passes `validateMintPayload`).
- Handoff to the coordinator: a directory of green payload JSON files (or one array file) + a short cover
  note per batch: how many attempted, how many minted-payload-ready, how many `fetch_blocked`, how many
  `off_vertical` (see below). The coordinator applies each payload through the guarded write path (see the
  M0 report's write plan) and marks the corresponding `census_worklist` row resolved.
- **Never** hand off a payload that fails the local validator "because the coordinator can fix it at
  apply time" — a red payload here will be red against the live RPC too; fix it before handoff.
- **MANDATORY, batch's last step — write the run artifact via `run-mint-batch.mjs`, never raw SQL and
  never a hand-assembled `writeRunArtifact` call.** See §7 below — as of Wave MH-5, this is a real
  script, not manual prose. A batch that skips it is exactly the gap `F28` (harness-run-integrity,
  Wave MH-2) fails CI for: a harness family whose governing files changed (or whose batch ran) without a
  run artifact recording why.

## 7. MANDATORY — run the batch through `run-mint-batch.mjs`, never raw SQL

Wave MH-5 closes the gap PROPOSER-RUNBOOK.md §5's "Known residual" named: mint's artifact emission used
to be PROSE (this section, before this wave, described a hand-assembled `writeRunArtifact` call a lane
could simply forget to run). `scripts/mint/run-mint-batch.mjs` is now the mint family's canonical entry
point — a thin orchestrator around the SAME `validate-mint-payload.mjs` gate steps 1-5 above already
require, whose own execution path writes the run artifact in a `finally` block, so a thrown error
partway through a real run still leaves a record instead of silence.

**This script never writes to the database — that boundary is unchanged.** It validates payloads and
produces an apply-ready file; the coordinator alone applies it through the guarded write path, exactly
as §6 above already describes. "Never raw SQL" means: a mint batch's own INSERT statements are not
something a mint lane hand-writes and runs — the coordinator's guarded write path is the only apply
path, same as it always was; this script's job is validation + reporting + the run artifact, nothing
more.

```
# Preview (default — validates, prints the summary, writes NOTHING to disk):
node scripts/mint/run-mint-batch.mjs --batch-file path/to/batch.json

# Real run (writes <basename>.apply-ready.json, <basename>.mint-batch-report.json, and
# scripts/harness-runs/mint/mint-run-NNN.json — NNN claimed collision-safely, never hand-picked):
node scripts/mint/run-mint-batch.mjs --batch-file path/to/batch.json --execute \
     --out-dir path/to/batch-NNN-dir
```

`--batch-file` is either a bare JSON array of payloads (each shaped per `payload-schema.json`, one
payload per attempted item) or `{ "payloads": [...] }`. On `--execute`, `<basename>.apply-ready.json`
holds exactly the payloads that passed `validateMintPayload` clean — that file, not the batch file
itself, is what the coordinator applies; `<basename>.mint-batch-report.json` carries every payload's
full validation result (pass or fail) for the record.

## 8. MANDATORY, post-apply — the flywheel

`scripts/turns/run-population-flywheel.mjs` runs this section for you, automatically, every time
`.github/workflows/population-turn.yml` applies a batch — it is a step in that job, not a follow-up a
person schedules. THE DEFECT this closes (lane TANDEM, 2026-09-04, [CONFIRMED]): this runbook used to
describe steps 1-3 below as a coordinator's own hand-run pass, and nothing in the runtime ever actually
triggered them — population runs #15-#20 (2026-09-03/04, ~650 items, mint-run-017..022) were applied with
every one of these steps skipped, leaving every minted item with zero `item_cross_references`, zero
`item_forward_events`, no obligations, no tags, no signals. Per the operator's own ruling that day,
"there is no thing within this entire build that works on its own ever" — a runtime that ends without
triggering its downstream is a defect in the runtime, not a note for a coordinator. The coordinator's job
now is to read the outcomes §9 records, not to run these steps by hand:

1. **Discovery** — `scripts/connections/discover-for-items.mjs`, scoped to exactly this batch's minted
   item ids (extracted from the just-applied `mint-run-NNN.json`'s `per_item`), writes real, grounded
   `item_cross_references` edges (guarded `write-edges.mjs`, `origin='provenance_discovery'`) where a
   genuine connection exists. A minted item with zero edges after this step is not necessarily wrong
   (some items are genuinely novel/unconnected), but it must be COUNTED, not assumed — see
   `isolated_items` below.
2. **Forward-event extraction** — `scripts/turns/export-corpus-for-extraction.mjs` +
   `scripts/forward-events/run-extraction.mjs --execute` + `scripts/turns/apply-extraction-output.mjs
   --execute`, scoped to the same batch, turn any dated obligation language the new items carry into
   queryable `item_forward_events` rows rather than dead prose in `full_brief`, and derive obligations
   (`scripts/maintenance/derive-obligations.mjs`) and tag proposals + ratification
   (`scripts/maintenance/tag-proposals.mjs` / `tag-ratification.mjs --arg auto`) from what discovery and
   extraction just found.
3. **Recluster** — `scripts/connections/analyze-corpus.mjs --signals` (whole-corpus, the same scope
   `corpus-turn.yml` uses) so the newly minted items are grouped with their real neighbors rather than
   sitting unclustered until the next scheduled turn.

See `scripts/turns/run-population-flywheel.mjs`'s own header for the exact step order, dry/apply
behavior, and how it reuses each of the scripts named above (child process or exported `main()` — it
never re-implements their logic) instead of hand-running this section.

**THE GATE, WIDENED, and BACKLOG MODE (lane TANDEM-2, 2026-09-04).** THE DEFECT [CONFIRMED by the
coordinator reading the landed code]: THE GATE described above used to read only the single NEWEST
`mint-run-NNN.json` on the checkout (by `started_at`). A DRY artifact — a `rows_file` preview, or a live
export that minted nothing — has `metrics.minted` absent/0 by construction, so whenever a dry artifact
happened to be newest it read as "nothing to connect" and let a brand-new apply through, while every apply
artifact BEHIND it on the timeline stayed unconnected. This is exactly what happened to mint-run-017..022
(six apply artifacts, 177+168+156+152+141+140 = 934 minted items — measured directly from their own
`metrics.minted`): mint-run-023, a `rows_file` dry preview of the six-row EU Weekly Oil Bulletin batch
(ruling R-D), landed newest, and the gate read only it — reporting a false "no flywheel pass required."
**Fixed:** `run-population-flywheel.mjs --check-gate` now scans EVERY `mint-run-NNN.json` on the
checkout, not only the newest, and refuses if ANY of them minted items but was left without §9's outcome
keys — a dry artifact still never counts on its own merits, it just no longer gets to stand in for the
(possibly stale) artifacts behind it.

**The full backlog this widening surfaces is larger than the six runs above** — measured [CONFIRMED,
2026-09-04]: 15 of 23 mint-run artifacts on this checkout minted items and were never connected. 13 are
auto-connectable by `--backlog` (1,272 items total: the six above, plus mint-run-011/012/013/014/016 —
pre-TANDEM population runs, 329 items — and mint-run-004/006 — a retired `minted_verified_first_pass`
outcome label, 9 items). **2 are NOT auto-connectable by either `--mint-run` or `--backlog`**:
mint-run-001 (6 items) and mint-run-005 (5 items), both predating the `per_item.item_id` field entirely —
`extractMintedItemIds` has no id to recover from either, and running the flywheel over them REFUSES
rather than write a false zero-valued outcomes record (`hasRecoverableMintedIds`, that script's own
header). THE GATE keeps refusing every new apply on account of these two specifically until they are
resolved by hand (e.g. matching their per_item CELEX ids against `intelligence_items` directly) —
`--backlog`, run any number of times, will never clear them.

The gate's own refusal message names the fix for the 13 auto-connectable artifacts, and that fix is now
dispatchable rather than hand-run: `run-population-flywheel.mjs --backlog --mode dry|apply` connects the
EXACT auto-connectable artifacts the gate refuses — oldest first, bounded by `--max-artifacts` (default
2; see that script's own header, "COST PROJECTION," for the [INFERRED] per-item cost reasoning behind
that default — clearing all 13 takes on the order of `ceil(13/2) = 7` dispatches at the default), each
one enriched in place through the SAME §9 write this section already documents (`run-mint-batch.mjs
--outcomes`, unmodified by this mode) — and checkpointed to disk artifact-by-artifact so a job timeout
mid-backlog leaves everything processed so far connected and the gate correctly narrowed. `--backlog`
mints NOTHING — it never touches `export-census-rows.mjs` or `run-mint-batch.mjs`'s minting gate at all,
only the already-minted artifacts already on disk. Wired into `.github/workflows/population-turn.yml` as
the `flywheel_backlog` workflow_dispatch input (`backlog_max_artifacts` overrides the default); see
`docs/runbooks/POPULATION-TURN-RUNBOOK.md`'s backlog section for the coordinator-facing dispatch
instructions and `run-population-flywheel.mjs`'s own header for the full mechanism.

## 9. Corpus-outcome enrichment (`--outcomes`)

`run-population-flywheel.mjs` computes these three metrics itself, from the live tables, once §8's steps
have run for this batch, and writes them back into the mint run's own artifact with
`run-mint-batch.mjs --outcomes` as its own last step — this is not a separate, hand-run enrichment pass
either. `.github/workflows/population-turn.yml` refuses to start a NEW batch (THE GATE,
`run-population-flywheel.mjs --check-gate`, now scanning EVERY mint-run artifact on the checkout, not
only the newest — see §8's "THE GATE, WIDENED" subsection above) while ANY batch's `mint-run-NNN.json` is
missing these keys, so an unrecorded batch blocks the next one rather than silently accumulating, and a
dry artifact can no longer mask a stale one behind it. The coordinator's fix for a refusal is the backlog
dispatch (§8 above), not a hand-run pass over one artifact at a time (though that single-artifact command
still works — the gate's own refusal message prints it too). A coordinator reading `mint-run-NNN.json`
after a population-turn run sees the full picture in one place — minted, connected, and recorded —
without cross-referencing a separate discovery/extraction report:

```
node scripts/mint/run-mint-batch.mjs --outcomes path/to/outcomes.json
# outcomes.json: { "run_id": "mint-run-NNN", "edges_discovered": 12, "forward_events_extracted": 34,
#                  "isolated_items": 3 }
```

This appends/updates the artifact's `metrics` block in place (`{ allowOverwrite: true }` under the
hood — a deliberate, named enrichment, not a silent overwrite) without touching `per_item`,
`defects_found`, or any other field. The three metrics this vocabulary names (Interface-3, "corpus
outcomes grading tool judgment"):

- `edges_discovered` — how many `item_cross_references` rows discovery (§8 step 1) created that
  reference at least one item from this batch.
- `forward_events_extracted` — how many `item_forward_events` rows extraction (§8 step 2) created for
  items from this batch.
- `isolated_items` — count of items MINTED IN THIS BATCH that have ZERO `item_cross_references` rows
  (as either `source_item_id` or `target_item_id` — the table is bidirectional, see
  `supabase/migrations/004_source_trust_framework.sql`'s `item_cross_references` table comment) after
  discovery has run. See `scripts/harness-runs/PROPOSER-RUNBOOK.md`'s "Corpus outcomes" section for the
  exact SQL a proposer pass runs to compute these three numbers.

A batch with a high `isolated_items` rate is not automatically a defect — some minted items are
genuinely novel — but an UNMEASURED isolation rate is exactly the "invisible unless you go looking"
failure this section exists to close; record it every batch, even when the number is zero.

## 10. Off-vertical disposition (relevance re-screen, task 3)

If an item fails the $0 rule-based relevance re-screen (see the M0 report), do not author a payload at
all. Report it back to the coordinator as a would_mint row that should be re-scoped or archived
(`archive_reason='off_domain'`, the same eligibility-gate path ADR-020 Amendment 1 used), never mint it and
never silently skip it without a record — the census row needs a disposition either way so the 3,661 queue
count stays honest.

## 11. The census-worklist population runtime (Lane POP, 2026-09-02)

§3's missing piece — the census-worklist exporter `docs/plans/record-tier-population-plan-2026-09-01.md`
named as needing live DB access it deliberately kept out of this kit's own write set — now exists as a
runtime, outside this directory: `scripts/mint/export-census-rows.mjs` (the join + capture pass) and
`scripts/mint/apply-mint-batch.mjs` (the coordinator-apply step), wired together by
`.github/workflows/population-turn.yml`. This section is the pointer from the kit's own runbook to that
runtime — the kit itself (`run-mint-batch.mjs --census-rows --grade record`, §6/§7 above) is UNCHANGED by
this addition; the runtime only supplies the enriched-row input that mode already documented and applies
the output it already produces.

**`export-census-rows.mjs`** — the record-tier plan's §3 join, as code: `census_worklist` rows where
`dryrun_disposition = 'would_mint'`, joined to `sources` (identity + tier) and to `agent_run_searches`
(`result_url = document_url`, >200 chars `result_content`, the live-confirmed 680-of-3,661 capture pool).
`item_type` and `canonical_instrument_key` both come from `scripts/lib/canonical-key.mjs`'s `deriveKey` —
the ONE canonical-key mirror this repo ships (see that file's own header for why a second mirror is
forbidden) — never a second regex. A row with no existing capture is held `no_capture` by default;
`--capture` politely fetches `document_url` instead (1 req/s via `POPULATION_FETCH_GAP_MS`, 20s timeout,
$0, no LLM) and holds `capture_too_short` when the result is ≤200 chars either way. `--exclude-held`
(default on) drops any row whose `document_url` already has an `intelligence_items` row (archived
included) before export — never silently, always counted in the run summary. Output is exactly the
enriched-row shape `run-mint-batch.mjs`'s own `loadCensusRows` header documents; a row this script cannot
build for any reason lands in a sibling `<out>.held.json` with a `hold` reason, never dropped.

**`apply-mint-batch.mjs`** — takes the `<basename>.apply-ready.json` a `--census-rows --grade record
--execute` run of `run-mint-batch.mjs` already wrote (validator-green payloads only) and applies each
through the guarded write path, exactly the hand-off this runbook's §6/§7 already describe. Per payload:
an M4 pre-check (any `intelligence_items` row — archived included — already holding the payload's
`canonical_instrument_key` or sitting at its `source_url` blocks the write: `not_applied_wo26_excluded`
when the holder's `archive_reason = 'out_of_scope_wo26'`, `not_applied_holder_conflict` for any other
holder, `not_applied_url_holder` for a same-URL holder with no key collision); inline `registerSource`
when the payload's own source needs it; then the write itself, in `src/lib/agent/canonical-pipeline.ts`'s
own table order (`intelligence_items` → `agent_run_searches` → `intelligence_item_sections` →
`section_claim_provenance` → `item_gate_a_state` → `intelligence_item_citations`), NOT through
`mintIntelligenceItem()` — that chokepoint's `MintPlan` interface has no field for a payload's
sections/claims/search_results (`src/lib/intake/mint-item.ts` lines 59-81; its own header states the
`section_claim_provenance` boundary explicitly), so it cannot rehydrate a mint payload end to end. This is
the SAME raw-guarded-write shape mint-run-005/006's own coordinator-apply pass used by hand
(`mint-run-006.json`'s `config.write_plan`) — not a new pattern, and not an F13 violation (F13's own scope
excludes `fsi-app/scripts/**` as "one-shot tools, out of runtime scope"). After the write, `rpc
validate_item_provenance` runs and its verdict is recorded (`minted_verified` / `minted_unverified` — an
unverified item is never deleted or retried, matching this runbook's own "flag it, never invent or
silently drop" posture); a minted payload's `census_worklist` row is stamped `enumeration_status =
'reconciled'` (a `not_applied_*` row is left UNRECONCILED, exactly `mint-run-006.json`'s own precedent for
its three holder-conflict rows). `--dry` (default) plans and prints every payload's disposition and writes
NOTHING — no DB write, no census stamp, no artifact enrichment; `--apply` performs the real guarded writes
and enriches the batch's own `mint-run-NNN.json` (`metrics.db_deltas`, `metrics.minted`,
`metrics.not_applied_*`, `metrics.census_rows_reconciled`, per-payload outcomes) in place, keeping
`validateRunArtifact` green throughout. Rule 16 (connection discovery + forward-event extraction,
`mint-item.ts`'s post-insert blocks) does NOT run inside this script — per §8 above, that is a SEPARATE,
later pass over the newly-minted items, and every apply run's `proposer_notes` says so explicitly rather
than leaving the gap implicit.

**`.github/workflows/population-turn.yml`** — the dispatch-only runtime wiring: `stamp-wo26-archive-
reason.mjs` (apply only in apply mode) → `export-census-rows.mjs` → `run-mint-batch.mjs --census-rows
--grade record --execute` (this kit's own gate, unmodified) → `apply-mint-batch.mjs` (apply only in apply
mode) → `propose-tags.mjs --dry` (surfaces newly-minted items' empty signature tags for later operator
ratification — Lane TAG's own write path stays untouched) → commit `scripts/harness-runs/mint/` plus this
run's export/apply-ready/report files on branch `population/<run_id>` → PR via
`scripts/turns/deliver-artifact-branch.sh`. No new harness family: every run enriches the existing `mint`
family's artifact, per this section's own framing above.

**Validation-failed hold-back (lane URL-GUIL, 2026-09-03).** `run-mint-batch.mjs`'s own `<basename>.mint-
batch-report.json` records `valid:false` + `failures[]` for every payload the C1-C7 gate rejects, but
before this lane nothing wrote that verdict back to the `census_worklist` row it came from — the row's
`dryrun_disposition` stayed `would_mint` forever, so `export-census-rows.mjs` re-selected, re-built, and
re-failed it IDENTICALLY on every subsequent run (measured: population runs #15/#16, mint-run-017/018, row
`429c85d2` failing criterion 2 `ungrounded_url` twice running). `apply-mint-batch.mjs` now reads the
report (`--report`, defaulting to the sibling path `defaultReportPathFor` derives from `--apply-ready`) and
holds every `valid:false` row that traces to a real census row (`resolveValidationFailedHolds`):
`dryrun_disposition = 'hold'`, `hold_reason = 'validation_failed:<criterion>:<reason>'` (comma-joined for
multiple failures), `notes` = the full `failures[]` JSON. This reuses the table's OWN pre-existing hold
mechanism (migration 221's `dryrun_disposition = 'hold'` ⟺ `hold_reason IS NOT NULL` CHECK) rather than a
new column — `selectCensusRows` already filters `dryrun_disposition === 'would_mint'` only, so a held row
drops out of every future export with no new filter code anywhere.

A held row is re-admitted ONLY by `scripts/mint/reopen-validation-holds.mjs --reason-contains <substring>
[--apply]` — dry by default, coordinator-invoked, and scoped to a hold_reason substring (e.g.
`ungrounded_url`) the caller names explicitly after landing a fix that plausibly resolves that failure
class (migration 300 + this lane's other fixes, for the criterion-2 case). It does NOT re-validate a row
itself — no existing re-try rule keyed on kit/harness version was found anywhere in this codebase to
follow, so this script is deliberately the minimal, honest first one: it flips the row back to
`would_mint` and appends a `[reopened …]` marker to `notes` (never overwriting the held evidence already
there), and the NEXT population-turn's real capture + `run-mint-batch.mjs` pass decides the row's fate for
real. There is no cron entry point for this script on purpose.

### §11 addendum (Lane POP2, 2026-09-02) — the first live dry run's per-family identity/capture rewrite

The first live `population-turn` dispatch (run `33639133429`, `limit=50`, `capture=true`) exported
**zero** rows out of 3,661 eligible: eligible 3,661, excluded_held 650, exported 0, held 50
(`canonical_key_unresolved` 24, `capture_too_short` 24, `item_type_unmapped` 2), captured 50,
capture_failed 0. All 50 held rows were confirmed against that run's own `census-rows.held.json` plus a
browser read of the live pages, root-caused to three census-wide families the exporter's original
CELEX-only identity/capture path did not fit, and fixed:

| Family (host) | Held reason (old) | Root cause | Fix |
|---|---|---|---|
| `eur-lex.europa.eu` (24 rows) | `capture_too_short` | Capture target was `legal-content/EN/TXT/?uri=CELEX:...` — a plain HTTP GET gets a **157-byte** WAF/interstitial page for it (the same URL renders ~100k chars in a browser). The CELEX key itself was never the problem. | Capture now targets `legal-content/EN/TXT/HTML/?uri=CELEX:<key>` (the clean-text endpoint) — browser-verified 2026-09-02 to render 96,777 chars of real act text for `CELEX:32004D0320`. Title from the act's own opening line (`extractEurlexTitle`), not the endpoint's unreliable `<title>`. |
| `legislation.gov.uk` (~15 rows) | `canonical_key_unresolved` | The only identity path (`classifyItemTypeFromCelexKey`) demanded a CELEX-shaped key; UK legislation has none. | `resolveIdentity` routes this host to `canonicalKey: null` (this system has NO canonical-key scheme for UK legislation — never invented one; the URL-holder check, which never needed a key, is this family's whole dedup story) and `item_type` from the path's instrument-type segment (`uksi`/`ukpga`/`wsi`/`ssi`/`nisr` → `regulation`). Capture tries `<url>/data.htm` first, falling back to the page itself. |
| `federalregister.gov` (8 rows) | `canonical_key_unresolved` | Same CELEX-only limitation. | `resolveIdentity` also returns `canonicalKey: null` here (this repo's own live corpus already carries `canonical_instrument_key = null` for every non-EU host); `item_type` comes from the document's own Federal Register API JSON `type` field (`RULE`/`PRORULE`/`NOTICE`/`PRESDOCU` are the search API's *filter* codes, not this field — a per-document JSON's `type` is the human-readable "Rule"/"Proposed Rule"/"Notice"/"Presidential Document", WebFetch-verified 2026-09-02; only "Rule" → `regulation`, everything else holds `item_type_unmapped` naming the FR type verbatim). Capture fetches the API JSON, then its `raw_text_url` for the full text; title comes from the JSON's own `title` field. |
| `31978H0072` (H = recommendation), `31978A0311` (A = agreement) | `item_type_unmapped` | The CELEX-letter map only had R/L/D. | H → `guidance`, A → `framework` added (both legal `intelligence_items.item_type` values). Every other sector-3 letter (notably C, "other acts") still holds `item_type_unmapped`, explicitly. |

`export-census-rows.mjs`'s identity resolution (`resolveIdentity`) and per-family capture
(`resolveRowCapture`/`fetchFrDocumentMeta`) implement this table; see that file's own header for the full
per-field reasoning. A capture that comes back non-2xx or ≤200 chars now holds `capture_blocked` **with
evidence** (`http_status`, `bytes`, `head` — the first 300 chars of whatever text came back — and the
`endpoint` actually tried), never a bare unexplained hold.

**[UNCONFIRMED]** legislation.gov.uk's `/data.htm` endpoint: confirmed to return HTTP 200 with the
instrument's real text present (WebFetch, 2026-09-02), but not confirmed at the byte level to be
meaningfully smaller/cleaner than the ordinary page — this sandbox's WebFetch renders through an HTML→
markdown→LLM-summary pipeline, not a raw byte inspection, and its Bash has no general outbound network
access to check with `curl`. Implemented as the operator's own instruction directed (tried first, page as
fallback); the next live dry run's held-file evidence (`bytes`/`head` on any `capture_blocked` row) is the
actual confirmation.

**Second live dry run (33643532589, 2026-09-02) — two more root causes, both fixed in the same landing
as mint-run-007/008:**

| Finding | Root cause | Fix |
|---|---|---|
| All 26 EUR-Lex rows held `capture_blocked` (HTTP 202, 2,035 bytes, "verify that you're not a robot") | `legal-content/EN/TXT/HTML/` sits behind EUR-Lex's bot gate for a plain HTTP client; the runner cannot and must not pass a bot challenge. | Capture now goes to the Publications Office **Cellar** first — `https://publications.europa.eu/resource/celex/<key>` (303 → the act's XHTML, no gate; browser-verified 96,603 chars for 32006D0507) with its plain-http redirect upgraded to https — and to EUR-Lex's clean-text endpoint second; a hold names both attempts (`fallback_from`, `cellar_status`/`cellar_bytes`/`cellar_head`). Title from the `oj-doc-ti` lines (`extractCellarTitle`), never the page `<title>` (an OJ file name). |
| All 19 exported UK/FR rows failed the mint gate: `fact_below_authority_floor`, `source_tier_derived: null`, against tier-1 registered sources | `validate-mint-payload.mjs` derived a fact's tier only on exact canonical-URL equality between the claim URL (the instrument page) and `source.url` (the institution row `registerSource` dedups to). The live `validate_item_provenance` derives it through `section_claim_provenance.source_id`, which `apply-mint-batch.mjs` binds to that row — the mirror was stricter than the gate it mirrors. | Registry-identity resolution (`scripts/lib/institution-key.mjs`, shared with `registerSource`) after the exact-URL check. The 19 payloads re-validate 19/19. |
| `jurisdictional_scope` FACTs were legislation.gov.uk's browse menu ("European Union Treaties ------") or Act names; a `penalty_summary` span carried `&#xD;` | A keyword trigger accepts any verbatim match; verbatim says nothing about being a clause. | `record-facts.mjs`: `isProseSpan` guard, every match of every trigger walked, clause-shaped scope triggers first, bare "European Union" only as a preposition's object and never before "(" or "Act"; `stripHtmlToText` decodes numeric character references. |

**First live apply (run 33653378846, 2026-09-02) — what the write path itself got wrong, fixed in the
same landing as mint-run-010:**

| Finding | Root cause | Fix |
|---|---|---|
| 10 items minted, every one `quarantined`, while `validate_item_provenance(id)` answered `verified` for each | `apply-mint-batch.mjs` wrote `item_gate_a_state` AFTER the claims. `set_provenance_status` fires on section and claim inserts and on nothing after them, so the last derivation ran with no gate row (criterion 7) and its stamp stuck; the RPC afterwards is a pure function and the artifact recorded `minted_verified` against quarantined rows. | Gate A before the claims (canonical-pipeline.ts's own order, ~line 1733); the outcome reads the ROW's `provenance_status` back and the artifact records both the row status and the RPC verdict. `rederive-record-provenance.mjs` (new; runs after apply in `population-turn.yml`) re-fires the derivation on any record-grade row whose stamp is stale against the function, through the guarded path, never writing the status itself. |
| Batch aborted at item 11 with a bare `intelligence_items` row left behind (no sections, no claims) | A Federal Register raw text carried U+0000; Postgres refused the `agent_run_searches` insert ("unsupported Unicode escape sequence") after the item row existed, and the loop had no per-payload boundary. | `stripHtmlToText` drops U+0000 at capture; a failure after the item row deletes the partial item through `guardedDelete` (every child FKs `ON DELETE CASCADE`), records `apply_failed` with the error and the cleanup result, and the batch continues; the artifact's `metrics` carry `minted_verified` / `minted_unverified` / `apply_failed` and a defect per class. |
| `stamp-wo26-archive-reason.mjs --apply` (runs #6, #7): statement timeout on one 491-row UPDATE, then on a 25-row chunk | `set_provenance_status_trg` re-derives provenance per updated row (70 ms – 3.4 s each, source-size bound) against the API's 8 s `statement_timeout`. | `guardedUpdateByIds` (db.mjs): id chunks, halved on a timeout down to single rows, the match re-applied per attempt. 491/491 stamped by run #8. |

**The relevance screen is part of the export (2026-09-02, runs #9–#11 — read this before touching the
selection).** The 2026-08-31 screen ruling (1,729 mint / 1,676 off-vertical / 256 need-fetch, Addendum
71) lives in `screen-rules.mjs` + `reviewed-verdicts.json`; it was never stamped onto `census_worklist`,
and the first three apply runs selected on `dryrun_disposition = 'would_mint'` alone — ~130 items minted,
about half off-vertical by the operator's own ruling (USCG safety zones, FAA airworthiness directives,
federal pay rules, VAT derogations, EC type-approval SIs): ADR-020's August incident, repeated by the
runtime. Now: `export-census-rows.mjs` computes every candidate's verdict through
`lib/screen-verdict.mjs` (rules first; a reviewed verdict overrides only a rule verdict of `ambiguous`,
mergeReviewed's own semantics) and exports ONLY `on_vertical` rows; the limit applies to mintable rows;
`census-rows.screened-out.json` records the counts, the off-vertical roll-up by rule, and every
ambiguous row (those need a ruling). After apply, `screen-reconcile-records.mjs` archives any live
record-grade item the screen rules off-vertical (reversibly, `archive_reason = 'off_vertical'`, guarded
path) and lists ambiguous ones. A rule change or a new reviewed verdict therefore reaches both the
export and the corpus on the next dispatch, with no hand pass.

**The browser-capture escape hatch, made a first-class runtime input (operator ruling, §1a: "a site that
refuses the runner is read through the browser, never reported as a blocker; no deferrals").** When a
row's family still refuses the automated capture above (a new WAF shape, a host not yet in
`resolveIdentity`'s table, a `capture_blocked` hold whose `head`/`bytes` show an interstitial), the
procedure is:
1. Read the `census-rows.held.json` a run produced; pick the rows worth a hand capture.
2. Open each `document_url` in a browser, measure the real page first (character count), then capture the
   substantive text in ≤8,000-char slices per §1a's own discipline — never one giant paste.
3. Build the SAME enriched-row shape `export-census-rows.mjs` emits (`row_id`, `source_url`, `item_type`,
   `title`, `title_origin`, `instrument_identifier`, `canonical_instrument_key`, `jurisdiction_iso`,
   `priority`, `source{}`, `captured_text`, `fetched_length`, `screen{}` — §12 below) by hand, one row per
   captured document.
4. Commit the resulting array under `scripts/_snapshots/population-browser/<batch>.json`.
5. Dispatch `population-turn.yml` with `rows_file` set to that path — the `export-census-rows.mjs` step is
   skipped entirely and `run-mint-batch.mjs --census-rows <rows_file>` / `apply-mint-batch.mjs` run on it
   directly, exactly the same gate and the same guarded write path a live-exported batch goes through.
This is $0 and no LLM throughout (a human/browser capture, then the SAME deterministic kit) — it is not a
second, looser path into the corpus, only a different SOURCE for the identical enriched-row input.

## 12. The shared write sequence + the screen-verdict kit check (Lane WSEQ, 2026-09-02)

**One write sequence, two callers.** Both mint tiers write the SAME item→searches→sections→gate-A→
claims→citations tail (§7's `apply-mint-batch.mjs` for a fresh record-grade item; `canonical-pipeline.ts`'s
`groundBrief` for the brief tier's non-destructive re-ground) — and run #8 (see §11's own history table)
already proved what drift between two hand-maintained copies costs: gate-A written after the claims left
every minted item quarantined while the RPC answered `verified`. `src/lib/intake/write-item.ts` is now the
one module both depend on. It exports:

- `writeGroundingSequence(payload, itemId, sourceCtx, deps)` — the WHOLE guarded post-item-insert write, in
  the fixed order (searches → sections → **gate-A before claims** → claims → citations). `apply-mint-batch.mjs`
  calls this for its entire post-item-insert write; it owns the item row and its own cleanup-on-failure
  (`writeGroundingSequence` never sees or deletes the item row).
- `buildGateARow` / `buildCitationEdges` / `classifyMintOutcome` — the pieces that generalize even where the
  WHOLE sequence cannot. `canonical-pipeline.ts`'s `groundBrief` is architecturally different (it re-grounds
  an item that already exists, through the non-destructive diff/apply doctrine — a raw insert there would
  silently destroy a stronger prior grounding) so it cannot call `writeGroundingSequence` directly, but its
  own `item_gate_a_state` upsert (both the initial one and the phantom-coverage reconcile) and its own
  `intelligence_item_citations` edge write now call these shared builders instead of hand-building the same
  row shape a second time.

DB access is injected everywhere in `write-item.ts` (no top-level Supabase import) so the sequence, the
failure boundary, and every builder run — and are tested — with zero DB credentials, per this lane's DI
requirement; see `src/lib/intake/write-item.test.mjs`.

**The relevance screen is now a payload-level fact, not only an export-time filter.** §11's "relevance
screen is part of the export" addendum fixed the SELECTION (only `on_vertical` rows are exported); this
closes the other half — a record-grade payload's own `screen: { verdict, provenance, basis }` is now
required and mechanically checked by `validate-mint-payload.mjs`, independent of whether the export filter
that produced it is still correct on a future run:

- `export-census-rows.mjs`'s `partitionByScreen` attaches the verdict it just computed onto every mintable
  row (`row.screen`), not only onto the rejects it already recorded.
- `buildExportRow` copies `censusRow.screen` onto the exported row, so `census-rows.json` carries it.
- `run-mint-batch.mjs`'s `buildPayloadsFromCensusRows` passes `row.screen` straight into
  `src/lib/intake/record-facts.mjs`'s `buildRecordPayload`, which sets it as `payload.screen` (top-level,
  alongside `_proof_note` — never recomputed; that module has no I/O and cannot re-derive a verdict).
- `validate-mint-payload.mjs` requires it for every `grade === "record"` payload: missing or malformed
  (no usable `verdict`/`basis`/`provenance`) → `screen_verdict_missing`; present but not `on_vertical` →
  `screen_verdict_not_on_vertical`. Brief-grade payloads are exempt — the screen gates the record tier's
  exporter, not brief-tier generation, which has its own separate provenance path.

**A hand-built browser-capture row (§11's escape hatch) must carry `screen` too** — add
`{ "verdict": "on_vertical", "provenance": "reviewed", "basis": "<why>" }` to the enriched-row shape by hand
(run the row's title/URL through `lib/screen-verdict.mjs`'s `screenVerdictFor` first, or record the
operator's own reviewed reason) — a row built without it produces a payload `validate-mint-payload.mjs`
correctly quarantines, never a silent pass.

## 13. The record profile every new surface needs (Lane INTAKE, 2026-09-02)

Wave 2's operator ruling: **build the tools and the UI before populating.** OBLIG's obligation register,
CORR's corridor overlay, and DASH's research-credibility chips all read fields off `intelligence_items`
that no record-grade item carried before this lane. `src/lib/intake/record-facts.mjs` now extracts five
additional fields — still no-I/O, still span-proven from `capturedText`, still GAP (never invented) when
the source does not state something — so every record-grade item minted after this wave carries them by
construction, with no separate backfill pass needed once population resumes.

- **`item.binding_position`** (regulation family: regulation/directive/standard/guidance/framework, plus
  the two new FR item_types below) — one of `src/lib/contracts/vocabularies.mjs`'s four `BINDING_POSITION`
  codes (`direct_duty`/`carrier_passthrough`/`customer_contract`/`monitoring_only`, spec 01 §1/§3.2),
  located from the source's own applicability language (`extractBindingPositionFact`), never inferred from
  who the item is ABOUT.
- **`item.due_date` / `item.date_precision`** (same family) — a verbatim due-date-shaped span plus its
  precision (`day`/`month`/`quarter`/`year`), inferred from the span's own text shape
  (`inferDatePrecision`). Spec 01 §3.3's "four dates, never one" is a still-open question this extractor
  does not resolve — it locates A date, not which of the four it is.
- **`item.corridor_identity`** (market family: market_signal/initiative) — populated ONLY when the source
  states a verbatim UN/LOCODE port-pair AND a transport mode together (ADR-024 decision 4 /
  `CORRIDOR_ID_SCHEME`, `src/lib/entities/decisions.mjs`, read-only). Carries the `ORIGIN-DEST:mode` SEED
  the scheme documents, never the minted `cl:corridor:*` entity id itself — CORR lane's `entity-id.mjs`
  owns that hash; this module only supplies its input.
- **`item.research_credibility`** (research_finding) — the two verbatim credibility SIGNALS this $0
  extractor can locate (spec 03 §4's "two scores, never merged": an evidence/agreement sentence, a
  source-authority sentence), never the computed IPCC/GRADE score or the OpenAlex/ROR authority
  distribution spec 03 §4 itself describes — those need live, credentialed data a later pass supplies.

**Where these live in `item-type-required-slots.json`.** Two new item_types this lane registers —
`notice` and `presidential_document` (the two Federal Register document types HELD's `export-census-rows.mjs`
holds `item_type_unmapped` today; `Proposed Rule` already maps onto the pre-existing `initiative`
item_type, no change needed there) — carry `binding_position`/`due_date` as REQUIRED slots, since nothing
existing depends on their slot count. The five long-registered regulation-family item_types keep their
original four required slots UNCHANGED (`item-type-required-slots.json`'s own header explains why: this
file feeds criterion 5 directly, and hand-crafted fixture payloads outside this lane's write set —
`validate-mint-payload.test.mjs`'s `basePayload`, `example-payload.json` — assert an exact 4-claim/0-failure
shape for `directive`). `record-facts.mjs` instead attaches `binding_position`/`due_date` to every
regulation-family record payload (the five original types plus the two new ones) as an OPTIONAL,
always-attempted addition keyed on `item_type` membership, independent of what this file requires for
that exact type. `market_signal`/`initiative` gained `corridor_identity` and `research_finding` gained
`evidence_agreement_signal`/`source_authority_signal` as REQUIRED slots (safe: no fixture in this repo
hand-crafts a fixed claim list for those three item_types).

**Coordinator disposition (2026-09-03):** `notice`/`presidential_document` withdrawn (zero evidence rows;
the live `intelligence_items_item_type_check`, the validator's floor lists, `surface-of.mjs`, `domains.ts`
and the live `item_type_required_slots` table would all have needed extending for no document). The slot
additions to `market_signal`/`initiative`/`research_finding` stay in this kit file and are DELIBERATELY
NOT in the live `item_type_required_slots` table yet: adding them live would flip every existing verified
item of those types to quarantined on its next trigger touch (criterion 5). They are added live in the
population train, together with the re-mint of the existing corpus through this profile. Until then the
kit is stricter than the database, which is the safe direction.

**What `validate-mint-payload.mjs` would have needed for the two withdrawn types** (kept for the record):
1. Add `"notice"` and `"presidential_document"` to `REG_FAMILY` (currently
   `new Set(["regulation", "directive", "standard", "guidance", "framework"])`) so the two new item_types
   get the same unconditional authority-floor treatment the rest of the regulation family has.
2. Optionally, a kit check validating `item.binding_position` (when non-null) is a member of
   `BINDING_POSITION`, `item.date_precision` (when non-null) is one of `day`/`month`/`quarter`/`year`, and
   `item.corridor_identity.mode` (when the field is non-null) is a member of
   `vocabularies.mjs`'s `LEG_MODE_CODES` — these five fields are already vocabulary-validated at the point
   `record-facts.mjs` builds them, so this would be a redundant backstop (the same relationship the grade
   discriminator and record-purity checks already have to `record-facts.mjs`'s own construction), not a
   gap this lane found live.

**The hollow-record fix and the EU-act self-description slots (Lane HOLLOW-GATE, 2026-09-04).** The
operator reported items shipping with no details ("this is unacceptable"). [CONFIRMED, Supabase] Of 1,230
live verified record-grade items, 551 carried ONLY the `[title]` FACT (350 with a genuine title FACT, 201
with none at all — exactly matching the operator's own count) and 115 carried exactly one substantive fact
beyond the title. **Root cause**: 375 of the 551 EUR-Lex-sourced hollow items are `item_type = "initiative"`
(CELEX sector-2/3 'D'-letter decisions, `classifyItemTypeFromCelexKey`) — mapped to the MARKET-SIGNAL
required-slots shape (`action_now`/`conversion_trigger`/`driving_parties`/`signal_event`/`corridor_identity`,
`item-type-required-slots.json`), for which `record-facts.mjs` had NO `SLOT_TRIGGERS` entries at all. Every
one of those five slots was always a templated GAP regardless of what the captured EUR-Lex text actually
said, and criterion 5 (`missing_required_slot`) never noticed, because a GAP claim satisfies "required slot
present" exactly as well as a FACT does. Traced example: item `8670d8bf-9847-4da6-8724-0d52308b008e`, CELEX
`31999D0823` (a Commission Decision confirming a Dutch packaging-waste derogation) — 17,022 chars of real
EUR-Lex text, zero extracted facts, shipped with an effectively empty Summary.

**The fix has two independent parts, `record-facts.mjs` and `export-census-rows.mjs`:**

1. **THE GATE** — `validate-mint-payload.mjs` now refuses (`criterion: 5, reason: "record_hollow"`, MINT-RUNBOOK
   §5 above) any grade='record' payload whose only FACT is `[title]`, closing the exact hole criterion 5's
   own `missing_required_slot` check could not see.
2. **THE EXTRACTOR** — `record-facts.mjs`'s `EU_ACT_SLOT_KEYS` (`operative_provision`, `addressee`,
   `confirmed_measure`, `in_force_status`, `effective_date`) are five ADDITIVE, always-attempted claims
   gated on `isEurlexHost(sourceUrl)` — never on `itemType` — so a mis-bucketed item_type never starves an
   item of real extraction just because its required-slots list is the wrong shape for what the EUR-Lex
   source text actually is (same additive-by-gate pattern `binding_position`/`due_date`/`corridor_identity`
   already use, keyed on host instead of item_type). Each is a verbatim `source_span`-proven FACT (or an
   honest GAP) mapped to the existing slot vocabulary; no new slot key needed registering anywhere outside
   this file (there is no slot-key registry — see `vocabularies.mjs`'s own header, confirmed by reading it):
   - `operative_provision` — the act's own subject/object sentence (Article 1, or the enacting formula
     through it). [CONFIRMED, two independent real-capture samples, 2026-09-04] EU acts use ONE of TWO
     enacting formulas essentially interchangeably: `"HAS ADOPTED THIS DECISION/REGULATION/DIRECTIVE/
     RECOMMENDATION:"` (8/8 in the first sample) and `"HAS DECIDED AS FOLLOWS:"` (6/12 in a SECOND, fresh,
     randomly-pulled sample of title-only-hollow "initiative" rows — not a rare variant, the other half of
     the population). Both are matched. A recommendation's `"HEREBY RECOMMENDS TO THE MEMBER STATES:"`
     shape (CELEX `31976H0495`) is deliberately NOT matched — an honest GAP, not a stretched pattern.
   - `addressee` — `"This Decision/Regulation/... is addressed to..."`.
   - `confirmed_measure` — the notified/confirmed national measure a Decision under a Directive confirms
     (`"measures notified by..."`), narrower than and overlapping with `operative_provision` by design.
   - `in_force_status` — EUR-Lex's own `<p class="forceIndicator">...</p>` widget text ("In force" /
     "No longer in force"), structurally anchored, never a bare substring scan (see THE IN-FORCE SCREEN
     below for the false-positive trap this avoids). This widget only survives in a raw-HTML capture (the
     deterministic pipeline's own Cellar/clean-text endpoints strip it) — GAP is the common, honest outcome
     today.
   - `effective_date` — reuses the PRE-EXISTING `effective_date` `SLOT_TRIGGERS` entry
     (`"shall enter into force"` / `"shall apply from"` / etc.), simply added to `EU_ACT_SLOT_KEYS` so it is
     attempted for `item_type = "initiative"` too (the five regulation-family item_types already require
     it; `"initiative"` never did). [CONFIRMED] 4/12 real captures in the second sample carried this exact
     shape ("This Decision shall enter into force on/the day of/the twentieth day following...").
   - A pre-existing `isProseSpan` guard (`HTML_TAG_FRAGMENT`, added this lane) prevents a raw-HTML capture
     (confirmed live shape: CELEX `32011L0015`) from embedding tag soup in a "verbatim" span.

   **Measured yield** [CONFIRMED, `record-facts.mjs`'s `buildRecordFacts` run directly against 12 real,
   fresh (not the tuning sample), randomly-pulled title-only-hollow `initiative` captures, 2026-09-04]:
   before this lane, 0/12 carried any substantive fact (by construction — these are exactly the confirmed-
   hollow rows). After: **11/12 (92%) now carry at least one substantive FACT**, 18 substantive facts total
   across the 12 (avg 1.5/item; every hit was `operative_provision` and/or `effective_date` — `addressee`
   and `confirmed_measure` are narrower clauses this particular sample of short administrative decisions
   happened not to carry, unlike the original 31999D0823 traced example, which has both). **Known miss**
   [CONFIRMED, item `20feed6b`/CELEX `32012D0706(01)`]: a genuine operative-provision span
   ("HAS DECIDED AS FOLLOWS: Sole Article The link http://www.pvt-tec.de under the sub-heading... shall be
   deleted") is wrongly rejected by the PRE-EXISTING `hasOnlyBareDomainUrls` guard (lane URL-BOILER,
   2026-09-04, this same day, an earlier lane), because that guard disqualifies ANY span containing a
   bare-domain URL match, not only a span that is NOTHING BUT a URL pointer. A word-count-after-URL-removal
   fix was tried and rejected: it un-fixes the exact two rows (`429c85d2`/`a980a0b9`) that guard exists to
   fix, because their disqualified span ALSO has >4 words of prose around the bare URL — the two cases are
   not distinguishable by a word-count heuristic. Left unfixed and reported, not patched, given the risk of
   silently reopening a previously-fixed defect in a guard shared by every other slot in this file.
   **Estimate for the live 551** [HYPOTHESIS, extrapolated from the 92% measured rate on a fresh, randomly-
   pulled real sample, not independently re-run against the full 551]: 379 of the 551 hollow items are
   EUR-Lex-hosted (375 `initiative`, 2 `framework`, 1 `guidance`, 1 `regulation` — the gate is host-based,
   not item_type-based, so all 379 benefit, not only the 375 `initiative` rows); at the measured ≈92% rate,
   roughly 345-350 of those 379 should re-mint with at least one substantive fact once this population is
   re-processed through the fixed extractor. The remaining 172 of the 551 (legislation.gov.uk,
   federalregister.gov, and any other non-eur-lex.europa.eu host) are genuinely unaffected — this lane's
   gate is deliberately scoped to "EU acts on EUR-Lex" per the task's own framing, and those hosts' captures
   carry none of the enacting-formula/addressee/force-indicator markup this extractor looks for.
3. **THE IN-FORCE SCREEN** — `export-census-rows.mjs`'s `detectNotInForce(capturedText)` (an independent,
   from-scratch implementation of the same structurally-anchored `forceIndicator`-widget approach, per this
   file's own convention of small, zero-dependency detectors) is wired into `buildExportRow` right after the
   existing `capture_too_short` check: a row whose capture states the act is no longer in force is held
   `not_in_force` with the evidence span (`hold.evidence_span`, `hold.status_text`) and never reaches the
   extractor. [CONFIRMED] A bare substring scan for "no longer in force" would misfire: that exact phrase
   appears in the BODY PROSE of CELEX `32020R0893`, a document that is itself currently in force (a recital
   describing a different, repealed regulation) — the same false-positive trap `in_force_status` above
   avoids, and the reason this screen is anchored on the widget markup, never free text. [CONFIRMED] Zero
   rows in the live `agent_run_searches` corpus carry a genuine RED/"No longer in force" widget today
   (`n_red = 0`, verified with a properly-`FILTER`ed count after an earlier mis-aggregated query overcounted
   it at 327) — this screen is therefore currently INERT against the live corpus (holds nothing today), but
   is real protection the moment a WAF-blocked EUR-Lex row's raw interactive-page HTML is captured (e.g. via
   the §1a browser-capture escape hatch).
4. **VERSION BUMPS** — `RECORD_FACTS_VERSION` (`record-facts.mjs`) `rf1-2026-09-04.1` → `rf1-2026-09-04.2`;
   `VALIDATE_MINT_PAYLOAD_KIT_VERSION` (new constant, `validate-mint-payload.mjs`) `vmp-2026-09-04.1`.

**The three defects HOLLOW-GATE named and did not fix, closed (Lane BOILER-2, 2026-09-04).** All three were
evidenced by HOLLOW-GATE's own report (above) and taken up next, in order.

1. **DEFECT 1 — the bare-domain-URL guard (URL-BOILER, §"BARE-DOMAIN URL GUARD" above) was global, not
   slot-scoped, so it wrongly disqualified a genuine `operative_provision` FACT that merely mentions a
   bare domain.** [CONFIRMED, Supabase] real capture, item `20feed6b-8440-418a-8678-af301daadeda`, CELEX
   `32012D0706(01)`: "HAS DECIDED AS FOLLOWS: Sole Article The link http://www.pvt-tec.de under the
   sub-heading 'Reference information' ... shall be deleted." — a real Commission Decision whose entire
   operative act IS deleting a named (bare-domain) link; the domain is what the article is ABOUT, not a
   pointer standing in for the fact. The word-count-after-URL-removal fix HOLLOW-GATE tried and rejected
   was correctly rejected: rows `429c85d2`/`a980a0b9` (the two rows URL-BOILER's guard exists for) ALSO
   carry >4 words of prose around their bare URL, so the two cases are not lexically distinguishable — only
   semantically, by which SLOT the span is located for. `jurisdictional_scope` is a slot whose whole point
   is "where does the source point the reader for the applicable law" — a bare "see the website at
   `<domain>`" sentence there really is nothing but the pointer criterion 2 already refuses as
   `ungrounded_url`. `operative_provision`/`addressee`/`confirmed_measure` (EU_ACT_SLOT_KEYS) and
   `binding_position` instead locate a clause whose subject is a legal actor or duty; a URL inside one is
   incidental. Fix: `isProseSpan(span, { slotKey })` now runs the bare-domain guard ONLY for a slot in
   `URL_BEARING_SLOTS` (currently `{jurisdictional_scope}`) — a caller that passes no `slotKey` at all keeps
   the original, conservative, always-on behavior, so no pre-existing call site changed. `findSlotSpan`
   passes its own `slotKey` through automatically; `findBindingPositionMatch` passes the literal
   `"binding_position"` slotKey (a prose slot per this same analysis). `findDueDateMatch` was left on the
   conservative default (guard still always on) — `due_date` was not named in HOLLOW-GATE's report and no
   real capture was found or measured showing the same failure mode there; extending the scoping to it is
   additive and safe but unevidenced, left for a future lane. Verbatim-only, never edit-the-span:
   `validate_item_provenance` matches `source_span` byte-exact, so the only two honest outcomes for a
   URL-bearing span are accept it whole or refuse it to GAP — this module never rewrites a matched span to
   drop a URL. Proven against BOTH real captures: `32012D0706(01)`'s `operative_provision` now locates the
   real enacting clause (was GAP); `429c85d2`/`a980a0b9`'s `jurisdictional_scope` still refuses (still GAP)
   — see `record-facts.npmtest.mjs`'s new tests, both against real captured text.

2. **DEFECT 2 — `jurisdictional_scope`'s continuation window stopped at a numbered-list item's own "N."
   marker, reading it as a sentence-ending period.** [CONFIRMED, Supabase] real capture, CELEX `31976H0495`
   (Council Recommendation of 4 May 1976): "HEREBY RECOMMENDS TO THE MEMBER STATES: 1. that, with a view to
   ensuring rational use of both public transport and private vehicles, they encourage...". The `member
   states?` trigger's plain `[^.;\n]` continuation stopped one character after the match, at "1."'s own
   period, leaving the 2-word span "MEMBER STATES: 1" — `MIN_SPAN_WORDS` correctly rejected it, and every
   other `jurisdictional_scope` trigger also finds nothing in this document, so the honest scope statement
   fell all the way to GAP purely because the source happens to number its recommendation clauses (a shape
   endemic to CELEX 'H' recommendations, whose enacting formula — "HEREBY RECOMMENDS ... :" — is almost
   always followed immediately by a numbered list). Fix: the SAME URL-safe-continuation technique URL-GUIL
   introduced for a URL's own domain dots — a 1-2 digit list-item marker (`\(?\d{1,2}\)?\.`, matching "1.",
   "(1)." too) is consumed as ONE atomic alternative in `jurisdictional_scope`'s four trigger continuations,
   tried before the plain terminator-excluding class, so the window's repetition swallows the WHOLE marker
   in one step rather than ever landing mid-marker where a lone "." would stop it. A genuine end-of-sentence
   period elsewhere in the window still stops it exactly as before (`record-facts.npmtest.mjs`'s new test
   proves this directly). A "(a)" letter marker was named in the same defect report but needed no fix:
   parens and letters were never in the excluded `[^.;\n]` class, so a bracketed letter marker never stopped
   this window to begin with. Applied ONLY to `jurisdictional_scope`'s triggers, the specific slot HOLLOW-
   GATE evidenced — extending the same technique to every other slot's triggers is additive and safe but
   unevidenced, left for a future lane once a real capture shows the same failure mode elsewhere.

3. **DEFECT 3 — "Cellar garbled metadata captures".** [CONFIRMED, Supabase] two live rows minted from THIS
   pipeline's own exporter (`search_query = 'canonical:record-grade'`, `agent_run_id` null) carry NO
   substantive document text at all: CELEX `21976A0216(03)` (a 1976 Mediterranean-Sea pollution protocol,
   sector-2 'A' agreement, 368 chars) and CELEX `32006R1907` (REACH — a real, ordinarily huge Regulation,
   1,114 chars in this capture). Both bodies read, verbatim: the act's own title repeated, then this literal
   tail — "cdm:CDM_2.1.7 tdm:1523 xslt:3945 saxon:9.0.0.1J JVM:1.6.0_29 metaconvJar:1.1.9 builddate:
   21/01/2014 17:28:36 eng en 2025-01-13T16:35:16.890+01:00" (row 1; row 2 carries the identical shape with
   a different `metaconvJar`/`builddate` value). **What "garbled" concretely means**: `cdm:`/`tdm:` are the
   Publications Office's own Cellar RDF namespace prefixes (Common Data Model / Text Data Model);
   `xslt:`/`saxon:`/`JVM:`/`metaconvJar:`/`builddate:` are Cellar's OWN document-conversion-pipeline
   provenance fields — never a word a legal instrument's own text would contain. This is a CAPTURE-PATH
   defect (`resolveRowCapture`'s celex branch / `envelopeFromCaptureDocument`'s `usable` gate in
   `export-census-rows.mjs`), not an extractor defect — `record-facts.mjs` was handed exactly this garbage
   as `capturedText` and correctly found nothing worth a FACT in it (both minted `record_hollow`-shaped, not
   as a wrongly-confident extraction). [HYPOTHESIS, not directly confirmed] the likely mechanism is Cellar's
   content negotiation, for a manifestation with no HTML/XHTML representation at the exact redirect target
   this pipeline's `Accept` header reaches, falling back to serving its RDF resource description (whose
   literal property values ARE these tokens) instead of a 404 or the `DOC_1` act body — this sandbox's own
   network egress refuses `publications.europa.eu` (tested live: `curl -sSL https://publications.europa.eu/
   resource/celex/21976A0216(03)` → `CONNECT tunnel failed, response 403`), so the raw response these two
   keys actually got could not be inspected directly to confirm it. **The fix, entirely inside
   `export-census-rows.mjs` (NOT a mint-family `GOVERNING_FILES` entry — this file's own change does not
   move this hash):**
   - `detectCellarGarbledMetadata(capturedText)` — a new, structurally-anchored detector (same convention as
     `detectNotInForce`) matching the co-occurrence of `cdm:CDM_`, `metaconvJar:`, and `builddate:` in
     Cellar's own fingerprint order; a single common word could never trip it.
   - `envelopeFromCaptureDocument`'s `usable` gate now also requires the text NOT be garbled-metadata-shaped
     — a fresh Cellar capture that would otherwise have been accepted now falls through to the EUR-Lex
     clean-text fallback `resolveRowCapture`'s celex branch already tries whenever Cellar is unusable (the
     SAME retry path a too-short or bot-gated Cellar response already triggers; no new retry logic was
     added).
   - `buildExportRow` screens EVERY `captured_text` (fresh OR the `existingCaptureByUrl` DB cache, which
     bypasses `resolveRowCapture` entirely and therefore bypasses the `usable`-gate fix too) right after the
     pre-existing `capture_too_short` check, holding a garbled capture `capture_garbled_metadata` with the
     evidence span rather than letting it mint hollow with wrong evidence attached.
   - Proven against BOTH real garbled captures (`export-census-rows.test.mjs`'s new tests) plus a real clean
     act's text (no false positive).
   - **NOTE ON THE WRITE-SET PATH GIVEN FOR THIS FILE.** This lane's task named this file
     `fsi-app/scripts/turns/export-census-rows.mjs`; no such path exists in this repo — the only
     `export-census-rows.mjs` (and the only Cellar-resolver code anywhere in this repo; `src/lib/sources`
     carries none) is `fsi-app/scripts/mint/export-census-rows.mjs`, the file this fix and its tests
     actually live in, consistent with every other reference to it in this runbook and in HOLLOW-GATE's own
     report above.

**VERSION BUMP** — `RECORD_FACTS_VERSION` (`record-facts.mjs`) `rf1-2026-09-04.2` → `rf1-2026-09-04.3`.

## Keeping the kit in sync

`lib/gate-a-scan.mjs` and `lib/gate-a-match.mjs` are RE-EXPORTS of `src/lib/agent/gate-a-scan.mjs` /
`gate-a-match.mjs` (since 2026-09-04): there is one Gate-A implementation and the kit imports it. They
used to be hand-mirrored copies, and lane GATE-A-TOKENS' harvest fix landed in the copy only, leaving the
live path (`write-item.ts`'s `buildGateARow`, the heal, the pipeline) unchanged; that drift is why copies
are gone. F28 governs both the kit paths and the `src/` files, so a change to the real scanner moves the
mint family's harness hash. `GATE_A_VERSION` `"2026-09-04.1"` (five narrow non-assertion harvest skips:
metadata stamps, GAP-boilerplate templates, heading/list ordinals, instrument-citation numbers,
position-nested sub-spans; measured live 594 → 504 orphan tokens over the 87 quarantined-live items,
0 regressed) is therefore live for every consumer at once. `lib/canonicalize-citation-url.mjs` mirrors
migration 150's SQL function; if a later migration revises `canonicalize_citation_url`, update the port.
`item-type-required-slots.json` mirrors the live `item_type_required_slots` table; if the coordinator adds
a new item_type or changes a slot set, re-dump and update this file.
