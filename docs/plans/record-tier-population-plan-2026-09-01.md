# Record-tier population plan, 2026-09-01

Author: Lane POP (Claude Fable 5.1), executing `docs/audits/system-review-2026-09-01.md` §10's "Lane
POP" work order. This is the sequence to take the 3,661 `census_worklist` rows marked `would_mint` from
"blocked behind a synthesized brief" to "a labeled, live, record-grade catalogue item" — at $0, with no
LLM call and no code change beyond what this lane already landed. It names every prerequisite honestly,
including the one piece (a census-worklist exporter) this lane did not build because it falls outside
the write set it was given.

---

## 1. The number this plan is against

Live count, 2026-09-01, cited from `docs/audits/system-review-2026-09-01.md` §4 (re-verify before
executing — a live read is never trusted from a doc alone, per that audit's own discipline):

- `census_worklist`: 21,609 rows total — 16,717 `invariant_reject`, 3,661 `would_mint`, 1,225 `hold`, 5
  `dedup`. **This plan is about the 3,661.**
- `intelligence_items`: 322 verified live, 513 verified archived (491 of them the WO-26 unstamped wave —
  see §4 below), 97 quarantined live.
- Every one of the 3,661 currently requires a synthesized, grounded brief to become an item, and
  grounded briefs are frozen (`GROUNDING_ACQUIRE_ENABLED` off) or session-authored at 5-8 items per
  batch (`mint-run-005`/`006`) — roughly 500 batches to clear the backlog that way. This plan does not
  wait on that; it mints the same 3,661 rows as **record-grade** items instead, which needs neither.

---

## 2. What a record-grade item is, and why it is safe by construction

Migration 278 (`fsi-app/supabase/migrations/278_item_grade.sql`, **unapplied** — see §7) adds
`intelligence_items.item_grade text default 'brief' check in ('record','brief')`. A record-grade item
carries only deterministically extracted `FACT`/`GAP` claim spans (title/identity, effective date,
primary deadline, jurisdictional scope, penalty summary) built by
`fsi-app/src/lib/intake/record-facts.mjs`'s `buildRecordPayload` — no LLM, no fetch, no synthesized
prose. It clears `validate_item_provenance`'s live C1-C7 gate the same way a brief does, **and does so
by construction**:

- **C3** (claim-level FACT span-proof): every `FACT`'s `source_span` is checked verbatim
  (case-insensitive substring) against the captured text by `assertVerbatim` before it is ever emitted.
- **C4** (label-syntax discipline): `record-facts.mjs` never emits `ANALYSIS`/`LEGAL` claims — FACT/GAP
  only — so the interpretive-content checks C4 exists for simply have nothing to flag.
- **C5** (required slots per `item_type_required_slots`): one FACT-or-GAP claim per required slot,
  honestly `GAP` when the captured text does not state it (never invented). The slot list is
  **unchanged** across grades — `scripts/mint/item-type-required-slots.json`'s `_grade_note` explains
  why a smaller "record slots" list would be a validator-local fiction that fails the live DB gate.
- **C7 / Gate A** (prose-fact scan of `full_brief`): `buildRecordFullBrief` assembles `full_brief` by
  concatenating claims' own `claim_text` (which already embeds each FACT's verbatim `source_span`) plus
  digit-free boilerplate. Every figure/date token Gate A's `containsToken` scan can find is therefore
  already present in the same claims corpus it checks against — Gate A passes by construction, not
  through a parallel weaker rule.

This is proven empirically, not just asserted: `fsi-app/src/lib/intake/record-facts.npmtest.mjs` runs
the **real** `validateMintPayload` (imported, not mocked) over a `buildRecordPayload` output and asserts
zero failures. `scripts/mint/validate-mint-payload.mjs` also gained a record-purity check (rejects any
non-FACT/GAP claim, and any FACT `source_span` not literally present in `full_brief`, when
`item.grade === "record"`) as its own backstop, independent of which builder produced the payload.

**Coverage caveat, stated honestly.** `record-facts.mjs`'s `SLOT_TRIGGERS` currently has patterns for
the regulation-family slot keys only (`effective_date`, `primary_deadline`, `jurisdictional_scope`,
`penalty_summary` — the slots `item-type-required-slots.json` assigns to `regulation` / `directive` /
`standard` / `guidance` / `framework`). Those five item types are the great majority of the `would_mint`
backlog (EUR-Lex instruments) and will get real extracted spans where the source states them. The other
`item_type`s in that file (`market_signal`, `technology`, `research_finding`, `regional_data`, …) have
slot keys `record-facts.mjs` has no trigger patterns for yet — a census row of one of those types still
mints successfully (every slot resolves to an honest `GAP`), but its catalogue entry will be
identity-only with no extracted body facts. Extend `SLOT_TRIGGERS` per family before running those rows
at scale, or accept the thinner GAP-only record for a first pass; either is a call for whoever runs §6.

---

## 3. The missing piece: a census-worklist exporter (not in this lane's write set)

`census_worklist` (migration 221) is **identity-only**: `source_id`, `document_url`, `lane`,
`shape_class`, `enumeration_status`, `dryrun_disposition`, `surface_tags`, `instrument_identifier`. It
carries no `title`, no `item_type`, and no captured document text. `run-mint-batch.mjs --census-rows`
therefore does not take a raw `census_worklist` export — it takes an **enriched row** (its own
documented contract, `run-mint-batch.mjs`'s header comment above `loadCensusRows`):

```json
{
  "row_id": "<census_worklist.id, optional, for traceability>",
  "source_url": "https://…",
  "item_type": "directive",
  "title": "…",
  "instrument_identifier": "…",
  "canonical_instrument_key": "CELEX:…",
  "jurisdiction_iso": "EU",
  "priority": "MODERATE",
  "source": { "id": "…", "url": "…", "base_tier": 1, "tier_override": null, "status": "active" },
  "captured_text": "… the FULL fetched document text …",
  "fetched_length": 12345
}
```

Building this array from the live `census_worklist` + `sources` + `agent_run_searches` tables is a SQL
join a DB-connected caller runs (coordinator query, or Lane RT's `intake-turn.yml` once it lands — see
§6) — not a pure, DB-less script, and therefore out of `run-mint-batch.mjs`'s own scope and out of this
lane's write set (`scripts/mint/**` batch-authoring tooling only; no DB access). The join, concretely:

1. `census_worklist` rows where `dryrun_disposition = 'would_mint'` → `source_id`, `document_url`.
2. Join `sources` on `source_id` for `source.id/url/base_tier/tier_override/status` and (for `title`,
   absent from either table) the source's registered name as a fallback title when no better one exists.
3. Join `agent_run_searches` on a `result_url`/`document_url` match for `result_content` — the grounding
   source pool (`agent_run_searches.result_content`, per ADR-016 never capped) — as `captured_text`.
   **A row with no matching `agent_run_searches` capture cannot build** (`buildPayloadsFromCensusRows`
   records it as a `build_failed` per-item entry, never a crash — see `run-mint-batch.test.mjs`'s
   "agent_run_searches_id alone names the DB-access gap explicitly" test) and needs a deterministic
   fetch pass first (Lane RT's `discover-for-items`/screen path, or the existing capture-worker — $0,
   no LLM, out of this lane's write set).
4. `item_type` is not on either table today; it is the one field this join cannot supply mechanically.
   Two honest options, neither of which this lane may choose unilaterally: (a) derive it the same way
   `canonical-pipeline.ts`'s classification step does today (a deterministic rule, if one exists outside
   the LLM-gated path), or (b) default every WO26-in-scope EUR-Lex row to the CELEX-instrument-type
   mapping already used at mint time (`regulation`/`directive`/`decision`→`initiative`, etc.) and flag
   anything unclassifiable to `hold` rather than guessing. **This is an open item for whoever writes the
   exporter — record it, do not silently default.**

---

## 4. Dedup and the 456 WO-26-blocked rows

`run-mint-batch`'s coordinator-side apply step runs an "M4 pre-check" (`mint-run-006.json`'s own
per-item evidence, e.g. `"outcome": "not_applied_holder_conflict"`) that refuses to mint a row whose
`canonical_instrument_key` already has a **holder** — an existing `intelligence_items` row, live or
archived, at that key. `docs/audits/system-review-2026-09-01.md` §4: 456 of the 3,661 `would_mint` rows
are blocked by holders inside the 491-row WO-26 wave (Addendum 28, 2026-08-21) that archived 632
customs/transport-administration EUR-Lex items under the operator's ADR-020 scope ruling but never
stamped `archive_reason` — so the M4 check cannot tell "already excluded by a ruling" from "an
unexplained collision" and correctly refuses to guess.

This lane's `scripts/mint/stamp-wo26-archive-reason.mjs` closes that half: `--dry` by default,
`--apply` stamps `archive_reason = 'out_of_scope_wo26'` on the live-measured matching rows (491
expected — the script reports and proceeds on whatever it actually measures, never trusting the number
from a doc) via the guarded write path (`guardedUpdate`, cite + snapshot). **Run this before any
record-grade batch touches the 456 blocked rows** — it is descriptive metadata only (`archive_reason`
alone; never `is_archived` or `provenance_status`), so it is safe to run any time, independent of
migration 278 or the record-mint batches below.

**Decision recorded here** (per this lane's task instructions, echoing the audit's own framing):
records for the 456 out-of-scope-under-WO-26 instruments **stay archived unless scope changes**. WO-26
was a deliberate operator scope ruling ("Caro's Ledge is a freight-sustainability platform, first";
customs/transport-administration law is a parked future vertical), not a data-quality defect — minting
a record-grade duplicate over an already-ruled-on exclusion would re-litigate a decision this lane has
no standing to reopen. If the operator widens scope to include that vertical later, the correct action
is to **un-archive the existing holder** (reversing the WO-26 archive, per Addendum 28's own framing —
archived reversibly, never deleted), not to mint a second record-grade item alongside it.

That leaves **3,661 − 456 = 3,205** `would_mint` rows immediately eligible for record-grade minting once
the exporter in §3 exists and migration 278 is applied.

---

## 5. Batch sizing

`run-mint-batch.mjs --census-rows` has no built-in batch cap — it validates and reports every row in
one invocation. Recommended batch size, consistent with the mint family's existing batch-002 practice
(`mint-run-006.json`, 5-8 payloads per coordinator-apply pass) but scaled up because record-grade
payloads need no per-item authoring judgment (no brief to write, no LLM call to review):

- **50 rows per `--census-rows` file**, run with `--execute` to get a full apply-ready output + run
  artifact per batch. At 3,205 eligible rows that is **~65 batches**.
- Batch by `source_id` or CELEX prefix where practical (keeps a single coordinator-apply pass's SQL
  reviewing one registry/source family at a time, same discipline `mint-run-006`'s inline source
  registration already follows).
- Each batch's apply-ready output still goes through the SAME coordinator-apply step every mint batch
  does today (`MINT-RUNBOOK.md`'s "zero DB writes from a mint lane" rule — `run-mint-batch.mjs` never
  writes to Supabase itself, in either `--dry-run` or `--execute`) — record-grade does not skip the
  guarded-apply discipline, it only skips the brief-authoring cost.
- Re-run the M4 canonical-key holder pre-check per batch (coordinator-side, not in this script) — new
  holders can appear between batches if two lanes mint overlapping instruments concurrently.

---

## 6. Execution sequence

1. **Land migration 278** (`fsi-app/supabase/migrations/278_item_grade.sql`) via the two-track policy —
   schema DDL applies via Supabase CLI/coordinator BEFORE any record-grade row is inserted. No data
   migration needed: `DEFAULT 'brief'` stamps every pre-existing row in the same DDL.
2. **Run `stamp-wo26-archive-reason.mjs --apply`** (§4) — unblocks the 456 holder-conflicted rows'
   *status* (still excluded, but now legibly so) and lets dedup/M4 tell WO-26 exclusions apart from real
   collisions on every subsequent batch.
3. **Build the census-worklist exporter** (§3) — the one piece this lane could not build inside its
   write set (needs live DB access; `scripts/mint/**` batch tooling is DB-less by design). Natural home:
   Lane RT's `intake-turn.yml` (`docs/audits/system-review-2026-09-01.md` §10, "runs screen → validate
   for new census rows and emits apply-ready payloads as artifacts") extended with a `--grade record`
   branch that emits the enriched-row JSON this plan's §3 shape defines, instead of only screen/validate
   output. Until Lane RT's workflow lands, a coordinator can run the equivalent SQL join by hand and pipe
   the result into `--census-rows`.
4. **Batch the 3,205 eligible rows** per §5, running `run-mint-batch.mjs --census-rows <batch>.json
   --grade record --execute` for each — this produces the apply-ready payload set plus a CONVENTION.md
   run artifact per batch (harness family `mint`, unconditionally written even on a mid-batch throw, per
   the script's own `finally`-block discipline).
5. **Coordinator-apply each batch** exactly as `mint-run-005`/`006` did for brief-grade payloads: the
   guarded write path, canonical-key M4 pre-check first, live RPC re-verification after.
6. **Rule 16 runs automatically** on every successful record-grade insert (`mint-item.ts`'s post-insert
   connection-discovery + forward-event blocks are unconditional on grade — verified by this lane's
   `mint-item-grade.npmtest.mjs`), so record-grade items enter the flywheel and forward-obligations
   surface the same turn they mint, with no separate wiring step.
7. **Surfaces show the grade honestly**: `RecordGradeBadge` (this lane, `src/components/shell/`) renders
   "Catalogue record: extracted facts only, full brief pending." on the Regulations detail header and
   list row whenever `item_grade === 'record'`; `Resource.itemGrade` is wired dormant on the two
   RPC-backed list mappers (undefined until a migration widens `get_workspace_intelligence*`'s
   `RETURNS TABLE`) and **live** on the direct-select item-detail fetcher (`fetchIntelligenceItemUncached`
   uses `select("*", …)`, so `item_grade` is populated as soon as migration 278 applies — no RPC change
   needed for the detail page).
8. **Re-run `docs/audits/system-review-2026-09-01.md`'s population count** after each wave of batches to
   confirm live-verified item counts against this plan's projections — never trust the batch count alone
   as proof of what actually landed.

---

## 7. The record → brief upgrade path

A record-grade item is a floor, not a ceiling. When grounding is armed again
(`GROUNDING_ACQUIRE_ENABLED` on) or a session author picks it up:

1. Generate a full synthesized brief the normal way (`src/workflows/generate-brief.ts` /
   `canonical-pipeline.ts`'s sanctioned grounding entry — untouched by this lane, F21-governed).
2. Apply it through `apply-staged-update.ts` (the sanctioned UPDATE path for an existing item — also
   untouched by this lane) with the new `full_brief`, `whatIsIt`/`whyMatters`/`keyData` fields, and
   `item_grade` flipped from `'record'` to `'brief'` in the same guarded update.
3. `validate_item_provenance` re-runs C1-C7 against the new content on that UPDATE (the trigger fires on
   every write, not just INSERT), so an upgrade that fails to ground correctly re-quarantines rather than
   silently keeping stale record-grade content under a `'brief'` label.
4. No re-mint, no new row, no broken URL or lost cross-reference — the item's `id`/`legacy_id` and every
   `item_cross_references` edge discovered at record-mint time (rule 16, step 6 above) carry forward
   unchanged. This is the entire point of doing the cheap tier first: coverage now, quality later, on the
   same row.

---

## 8. What this plan does NOT cover

- **Building the exporter itself** (§3) — named, designed, explicitly out of this lane's write set.
- **Extending `SLOT_TRIGGERS` for non-regulation item-type families** (§2's coverage caveat) — a
  follow-up to `record-facts.mjs`, not blocking a first regulation-family pass.
- **Lane TAG's signature-tag derivation** — record-grade items mint without scenario/compliance/topic
  tags exactly as census-minted brief items do today (`docs/audits/system-review-2026-09-01.md` §4 point
  4: "census-minted items are invisible to the flywheel" until that tagging pass exists). Discovery
  still runs (rule 16, unconditional), but cluster/theme participation waits on Lane TAG regardless of
  grade.
- **`.github/workflows/intake-turn.yml`** itself (Lane RT's write set, not this lane's).

---

## Status — 2026-09-02 (Lane POP, system-completion train)

§3's missing piece — the census-worklist exporter, explicitly out of the earlier lane's write set — is
now built, along with the coordinator-apply step §5/§6 assumed a human would run by hand each batch, and
the workflow wiring that runs the whole §6 sequence on dispatch:

- **`fsi-app/scripts/mint/export-census-rows.mjs`** (+ `export-census-rows.test.mjs`) — the §3 join
  (`census_worklist` would_mint × `sources` × `agent_run_searches.result_content` by `result_url =
  document_url`, >200 chars), plus `--capture` (a polite $0 fetch for rows with no existing capture) and
  the §3 point 4 item_type decision, recorded rather than silently defaulted: CELEX sector-3 letter R →
  `regulation`, L → `directive`, D → `initiative` (not `decision` — not a legal `intelligence_items`
  item_type; `initiative` + `source.category = 'regulatory'` routes to the Regulations domain via
  `domains.ts`'s existing `domainForItemType`, matching what a decision instrument actually is). Both
  `item_type` derivation and `canonical_instrument_key` import `scripts/lib/canonical-key.mjs`'s
  `deriveKey` — the one canonical-key mirror this repo ships — never a second regex.
- **`fsi-app/scripts/mint/apply-mint-batch.mjs`** (+ `apply-mint-batch.test.mjs`) — the §5/§6 coordinator-
  apply step as code: the M4 canonical-key/source-url pre-check (§4's WO-26 disposition included), inline
  source registration, the write in `canonical-pipeline.ts`'s own table order through `scripts/lib/
  db.mjs`'s guarded path (NOT through `mintIntelligenceItem()` — `MintPlan` has no field for a payload's
  sections/claims/search_results; see that file's header for the full citation), the `validate_item_
  provenance` RPC verdict, and a `census_worklist.enumeration_status = 'reconciled'` stamp on a real mint
  only (a `not_applied_*` payload's row is left UNRECONCILED, matching `mint-run-006.json`'s own
  precedent). `--dry` (default) writes nothing; `--apply` performs the real guarded writes and enriches the
  batch's own `mint-run-NNN.json` in place, keeping `validateRunArtifact` green.
- **`.github/workflows/population-turn.yml`** — dispatch-only, `mode` dry/apply, `limit`/`source_id`/
  `celex_prefix`/`capture` inputs: `stamp-wo26-archive-reason.mjs` (§4, apply only in apply mode) →
  `export-census-rows.mjs` → `run-mint-batch.mjs --census-rows --grade record --execute` (this kit's own
  gate, unmodified) → `apply-mint-batch.mjs` (apply only in apply mode) → `propose-tags.mjs --dry` → commit
  + PR. Reuses the existing `mint` harness family (`scripts/harness-runs/mint/`) — no new family.
- **`fsi-app/scripts/mint/MINT-RUNBOOK.md` §11** documents both scripts and the workflow from the kit's own
  side, pointing back here for the plan-level "why."

**Not done by this pass** (named per this plan's own §8 discipline): migration 278 (`item_grade`)
landing and the first live dispatch of `population-turn.yml` are coordinator-side, after this lane's
branch merges — this status block records what now EXISTS to run, not a completed run. §2's coverage
caveat (`SLOT_TRIGGERS` covering only the regulation/directive/standard/guidance/framework family) and §8's
three named-out-of-scope items (Lane TAG's tag derivation, `intake-turn.yml` itself, `SLOT_TRIGGERS`
extension) are unchanged and still stand as written above.

---

## Status — 2026-09-02 (Lane POP2, first live dry run follow-up)

The first live `population-turn` dispatch (run `33639133429`, `limit=50`, `capture=true`) landed: eligible
3,661; excluded_held 650; **exported 0**; held 50 (`canonical_key_unresolved` 24, `capture_too_short` 24,
`item_type_unmapped` 2); captured 50, capture_failed 0. Root-caused against that run's own
`census-rows.held.json` and a browser read of the live pages to three census-wide source families the
original CELEX-only identity/capture path did not fit — see `MINT-RUNBOOK.md` §11's addendum for the full
per-family table. Fixed, all within `export-census-rows.mjs`'s existing write set (no change to
`apply-mint-batch.mjs`, `run-mint-batch.mjs`, or the mint kit's own validator):

- **EUR-Lex (24 of 50 held rows)** — the capture target was `legal-content/EN/TXT/?uri=CELEX:...`, which a
  plain fetch gets a 157-byte WAF/interstitial page for (the SAME url renders ~100k chars in a browser;
  browser-verified 2026-09-02). Capture now targets `legal-content/EN/TXT/HTML/?uri=CELEX:<key>` (the
  clean-text endpoint), browser-confirmed to render 96,777 chars of real act text. The CELEX key itself
  was never the problem — `deriveKey` already resolved it from the URL in every held row.
- **legislation.gov.uk (~15) and federalregister.gov (8)** — both held `canonical_key_unresolved` only
  because the sole identity path demanded a CELEX-shaped key. Neither host has a canonical-key scheme in
  this system, and this repo's own live `intelligence_items` corpus already carries
  `canonical_instrument_key = null` for every non-EU host — inventing one would be false precision. A new
  `resolveIdentity(censusRow, source)` (pure, per source family) now routes these two hosts to
  `canonicalKey: null` + item_type derived from the host's own shape (UK: the legislation-type path
  segment; FR: the Federal Register API's own `type` field, `RULE`/`PRORULE`/`NOTICE`/`PRESDOCU` corrected
  from the search-API's filter codes to the actual per-document field values "Rule"/"Proposed
  Rule"/"Notice"/"Presidential Document", WebFetch-verified 2026-09-02) — dedup for both stays the
  URL-holder check, which never needed a key.
- **`31978H0072` / `31978A0311` (2 of 50)** — held `item_type_unmapped` because the CELEX-letter map only
  had R/L/D. H (recommendation) → `guidance` and A (agreement) → `framework` added; every other letter
  (notably C, "other acts") still holds, explicitly.
- **`capture_blocked`** replaces a bare `capture_too_short` for any FRESH live fetch that comes back
  non-2xx or ≤200 chars: the hold now carries `http_status`, `bytes`, `head` (first 300 chars of whatever
  text came back), and the `endpoint` actually tried — never an unexplained hold.
- **`.github/workflows/population-turn.yml`** gains a `rows_file` input: when set, the
  `export-census-rows.mjs` step is skipped and `run-mint-batch.mjs`/`apply-mint-batch.mjs` run directly
  against that file — the first-class runtime path for MINT-RUNBOOK.md §1a's browser-capture escape hatch
  (a site whose automated capture is refused is read through the browser, never reported as a blocker; see
  §11's addendum for the full procedure).

**Expected outcome of the next dry run on the same first-50 slice**: the 24 EUR-Lex rows and the 2
H/A-letter rows should now EXPORT (assuming the clean-text endpoint is not itself rate-limited or
WAF-gated at population-turn's request volume — [UNCONFIRMED] until the next live run's own evidence). The
~15 legislation.gov.uk and 8 federalregister.gov rows should also export, contingent on two
[UNCONFIRMED] items this pass could not verify from this sandbox (this sandbox's own outbound network
policy blocks a direct byte-level check, so verification leaned on WebFetch's HTML→markdown→LLM-summary
pipeline instead): (1) legislation.gov.uk's `/data.htm` endpoint returns 200 with real text present
(WebFetch-confirmed) but was not confirmed to be meaningfully cleaner than the ordinary page; (2) the
federalregister.gov API's exact JSON shape was WebFetch-verified against one live document and one live
search, not against this specific 50-row slice's own documents. A `capture_blocked` hold's
`http_status`/`bytes`/`head` on the next live run is the actual confirmation either way — nothing here is
asserted beyond what this pass could verify.

**Not done by this pass**: the fix's live effect on the real corpus (the numbers above are the expected
outcome from the code + browser-verified endpoint shapes, not a re-run's own measurement — this lane has
no DB/network access to dispatch `population-turn.yml` itself). A second live dry run on the same
`limit=50` slice is the coordinator-side confirmation step.
