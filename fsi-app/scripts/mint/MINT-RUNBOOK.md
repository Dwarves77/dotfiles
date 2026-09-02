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

Once the coordinator has applied a batch's `apply-ready.json` (new `intelligence_items` rows exist),
run these steps IN ORDER before the batch is considered closed. Skipping straight from "applied" to "next
batch" leaves newly-minted items with no graph edges and no forward-obligation events — invisible to
every consumer that reads `item_cross_references` or `item_forward_events` rather than the raw item
table — which is exactly the "populated, visible and wrong is worse than empty" failure mode §0 warns
against, one layer downstream of minting itself.

1. **Discovery** — run the connection-discovery pass (`src/lib/connections/discover.mjs` /
   `scripts/connections/backfill-edges.mjs`, migration 252's `basis`/`score` columns) over the newly
   minted items so they get real, grounded `item_cross_references` edges where a genuine connection
   exists. A minted item with zero edges after this step is not necessarily wrong (some items are
   genuinely novel/unconnected), but it must be COUNTED, not assumed — see `isolated_items` below.
2. **Forward-event extraction** — run `scripts/forward-events/run-extraction.mjs --input <corpus of the
   newly minted items' claims/sections> --execute` (Wave MH-5's canonical forward-events entry point;
   see that family's own PROTOCOL.md) so any dated obligation language the new items carry becomes
   queryable `item_forward_events` rows rather than dead prose in `full_brief`.
3. **Recluster** — re-run whatever community/topic clustering pass this vault's build plan currently
   names for `intelligence_items` (see the vault's own producer/cluster documentation — not owned by this
   runbook) so the newly minted items are grouped with their real neighbors rather than sitting
   unclustered until the next scheduled recluster.

## 9. Corpus-outcome enrichment (`--outcomes`)

Steps 1-2 above happen in a DIFFERENT turn than the mint batch itself — `run-mint-batch.mjs` has no live
DB credentials in this environment and cannot compute edge counts or extraction counts itself. Once the
coordinator's discovery + forward-event passes have run (§8 steps 1-2), feed their outcome BACK into the
mint run's own artifact with a follow-up enrichment invocation, so a proposer pass reading
`mint-run-NNN.json` later sees the full picture in one place instead of having to cross-reference a
separate discovery/extraction report:

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
   `priority`, `source{}`, `captured_text`, `fetched_length`) by hand, one row per captured document.
4. Commit the resulting array under `scripts/_snapshots/population-browser/<batch>.json`.
5. Dispatch `population-turn.yml` with `rows_file` set to that path — the `export-census-rows.mjs` step is
   skipped entirely and `run-mint-batch.mjs --census-rows <rows_file>` / `apply-mint-batch.mjs` run on it
   directly, exactly the same gate and the same guarded write path a live-exported batch goes through.
This is $0 and no LLM throughout (a human/browser capture, then the SAME deterministic kit) — it is not a
second, looser path into the corpus, only a different SOURCE for the identical enriched-row input.

## Keeping the kit in sync

`lib/gate-a-scan.mjs` and `lib/gate-a-match.mjs` are copies of `src/lib/agent/gate-a-scan.mjs` /
`gate-a-match.mjs`. If those change (a new `GATE_A_VERSION`, a matching-rule change), re-copy them here —
a stale copy would silently under- or over-gate criterion 7. `lib/canonicalize-citation-url.mjs` mirrors
migration 150's SQL function; if a later migration revises `canonicalize_citation_url`, update the port.
`item-type-required-slots.json` mirrors the live `item_type_required_slots` table; if the coordinator adds
a new item_type or changes a slot set, re-dump and update this file.
