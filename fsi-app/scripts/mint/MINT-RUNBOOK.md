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
- **MANDATORY, batch's last step — write the run artifact.** Every mint batch ends by writing its own
  `scripts/harness-runs/mint/mint-run-NNN.json` (per `scripts/harness-runs/CONVENTION.md`; `NNN` is the
  next unused number after the highest `mint-run-*.json` already in that directory) — this is not a
  step the coordinator remembers separately, it is part of THIS procedure, the same "emission is in the
  harness, not the operator" rule `screen-worklist.mjs` and the fetch-drain protocol follow (build plan
  §2). Since a mint batch is a manual, $0, in-session procedure with no single runner script, the writer
  invocation is this exact shape, run once per batch after step 6's handoff is assembled:

  ```js
  import { writeRunArtifact, hashHarnessVersion } from "./scripts/lib/run-artifact.mjs";

  const harness_version = hashHarnessVersion([
    "scripts/mint/MINT-RUNBOOK.md",
    "scripts/mint/validate-mint-payload.mjs",
    "scripts/mint/payload-schema.json",
    "scripts/mint/item-type-required-slots.json",
    "scripts/mint/lib/gate-a-scan.mjs",
    "scripts/mint/lib/gate-a-match.mjs",
    "scripts/mint/lib/canonicalize-citation-url.mjs",
  ]); // baseDir defaults to cwd — run from fsi-app/

  writeRunArtifact("scripts/harness-runs/mint", {
    harness_family: "mint",
    harness_version,
    run_id: "mint-run-NNN",              // next unused number, zero-padded 3 digits
    started_at: "<ISO 8601 UTC — this batch's own start time>",
    config: { /* vault, wave, candidate_pool_definition, batch_target_size, ... — see mint-run-001.json */ },
    inputs_ref: [ /* paths to the census/queue export this batch consumed */ ],
    per_item: [ /* one entry per attempted item — this batch is 40-80 items, well inside CONVENTION.md's
                    "every item" per_item-at-scale tier, so EVERY item gets an entry, not a subset */ ],
    metrics: {
      /* attempted, minted, source_not_registered, off_vertical_excluded_relevance_rescreen,
         validator_first_pass_rate, validator_final_pass_rate, live_verify_first_pass_rate,
         live_verify_final_rate — the mint family's standing metric, per PROPOSER-RUNBOOK.md §3 */
    },
    defects_found: [ /* anything this batch found wrong, root_cause, fix_ref (null if unfixed yet) */ ],
    full_trace_refs: [ /* every report/payload/source file this batch produced — never summarized */ ],
    proposer_notes: "",
  });
  ```

  A batch that skips this write is exactly the gap `F28` (harness-run-integrity, Wave MH-2) fails CI
  for: a harness family whose governing files changed (or whose batch ran) without a run artifact
  recording why.

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
