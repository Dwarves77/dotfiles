# Mint runbook — $0, in-session, one payload at a time (M0 kit)

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

## 7. Off-vertical disposition (relevance re-screen, task 3)

If an item fails the $0 rule-based relevance re-screen (see the M0 report), do not author a payload at
all. Report it back to the coordinator as a would_mint row that should be re-scoped or archived
(`archive_reason='off_domain'`, the same eligibility-gate path ADR-020 Amendment 1 used), never mint it and
never silently skip it without a record — the census row needs a disposition either way so the 3,661 queue
count stays honest.

## Keeping the kit in sync

`lib/gate-a-scan.mjs` and `lib/gate-a-match.mjs` are copies of `src/lib/agent/gate-a-scan.mjs` /
`gate-a-match.mjs`. If those change (a new `GATE_A_VERSION`, a matching-rule change), re-copy them here —
a stale copy would silently under- or over-gate criterion 7. `lib/canonicalize-citation-url.mjs` mirrors
migration 150's SQL function; if a later migration revises `canonicalize_citation_url`, update the port.
`item-type-required-slots.json` mirrors the live `item_type_required_slots` table; if the coordinator adds
a new item_type or changes a slot set, re-dump and update this file.
