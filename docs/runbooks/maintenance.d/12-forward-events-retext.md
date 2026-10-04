## 12. `forward-events-retext`

**Purpose**: correct `item_forward_events.obligation_text` on rows that already render garbled - the
producer-side bug that made them, never the display - without touching `event_date`, `event_kind`,
`source_span`, `confidence`, or any FK column.

**The defect** [CONFIRMED, live customer surface https://carosledge.com/regulations "Upcoming
obligations" strip, 2026-09-04 ~08:15 UTC]: of 8 events shown, several rendered garbled
`obligation_text` - starting mid-word (`"re|venues generated from fines. By 25 September 2026..."`), a
leaked source-URL tail plus a markdown bold label (`"7/oj/eng **Primary headline compliance deadline -
FACT:** \"It shall apply from 29 November 2026...\""`), and a markdown table pipe/cell fragment plus a
label (`"hicles (M₂, M₃, N₂, N₃) | MONITORING **FACT - deadline:** \"By 29 November 2026...\""`). One
Euro 7 item carried the SAME date `2026-11-29` five/six times, with at least one duplicate pair - the
identical sentence once via a claim (clean) and once via a section's rendered markdown (garbled).

**Root cause** [CONFIRMED, read `src/lib/forward-events/extract-forward-events.mjs` lines 262-271
pre-fix]: `clauseAround`'s leading edge (`from = max(0, start - 60)`) was a fixed byte offset, never
snapped to a sentence/clause boundary, so a section-derived context window could start mid-word or
mid-markdown-artifact. Fixed in that module, lane FWD-TEXT (`EXTRACTOR_VERSION` `fe1-2026-09-04.1`): a new
`clauseStart` snapped the leading edge to the nearest sentence/clause terminator within `maxBefore` bytes
(whitespace fallback only when a hard truncation genuinely occurred; never mid-word), plus a
`normalizeObligationText` pass (display text only - `source_span` stays byte-verbatim, `assertVerbatim`
still enforced) that stripped a leaked URL tail, a markdown bold label, or a table pipe/cell fragment. A
new `dedupeEvents` collapses same-run (event_date, event_kind) hits whose text is the SAME obligation
under a content-similarity check (never a blind date+kind collapse - see that module's own header for
why: the NZIA item's `(2030-01-01, other)` group holds 4 genuinely distinct section-sourced obligations
plus 1 unrelated claim, so a blind collapse would have destroyed real content, the same "content loss,
not deduplication" failure migration 275's own header already names).

**Lane FWD-TEXT-2 (2026-09-04) rebuild - `obligation_text` as a readable, self-contained unit**
[CONFIRMED, measured over all 654 `retext_targets[]` in `scripts/_snapshots/retext32.json`, the dry-run
summary of Maintenance #32]: lane FWD-TEXT's own fix above still left residue in the `after` text it
produced - **316/654 lowercase-start, 149 non-letter-start, 65 star-residue (unstripped `**`/`*`), 11
bare (unbolded) label, 11 pipe/table-cell fragment, 1 URL-tail; 46 ending in `;`, 161 with no terminal
punctuation at all**. A 30-row live-Supabase sample additionally surfaced a genuine **non-idempotence
bug** - `normalizeObligationText(normalizeObligationText(x)) !== normalizeObligationText(x)` for at least
one stored row - caused by the leading URL-tail stripper matching only on a SECOND pass once an earlier
strip step had merged what were previously two separate whitespace-delimited runs into one.
`EXTRACTOR_VERSION` bumped `fe1-2026-09-04.1` → `fe1-2026-09-04.2`. `clauseStart` rewritten to require a
genuine SENTENCE start (`.`/`!`/`?` + whitespace + an uppercase letter/quote/digit - never a bare `;`/`:`),
a paragraph break, or a markdown list/heading-item start; `DEFAULT_MAX_BEFORE` raised `60` → `300` bytes
(measured: the true sentence start for this corpus routinely sits well past the old 60-byte cap). Past the
cap, falls back to the nearest `;` then a bare whitespace boundary and marks the result an **honest
fragment** - `normalizeObligationText` prefixes it with `"…"` rather than capitalizing or inventing
anything. The trailing edge no longer stops at `;`; any window still lacking a terminal `.`/`!`/`?`/quote
gets `"…"` appended instead. New exported `selectDateCell(text, dateSpan)` distinguishes a genuine
multi-column date table (short date-only cell → keep the cell AFTER it) from a single stray table-pipe
artifact (long, already-prose date-bearing cell → keep it, drop the rest). All strip rules now run as a
**fixed-point loop** (bounded at 6 passes) specifically to close the non-idempotence bug, verified
idempotent over all 654 corpus rows. Post-fix property sweep over all 654 `before` texts: **zero**
non-letter starts (other than quote/digit/`(`/`"…"`), **zero** `*`, **zero** `' | '`/leading-pipe, **zero**
bare `http`, **zero** missing-terminal-punctuation rows - the only remaining lowercase starts are the
honest `"…"`-prefixed fragments. `sentenceStart` (the separate deontic-window helper) and the
`source_span`/`assertVerbatim` verbatim law are both completely unchanged by this lane.

**This step is the one-time (and re-runnable) catch-up, forward-only otherwise**: the extractor fix
changes what a FUTURE extraction produces; migration 274/275's idempotency guarantee is about not
duplicating rows on a re-run, not about correcting text already stored. For every `intelligence_item`
that already carries `item_forward_events` rows, this step re-reads that item's CURRENT grounded
claims/sections (the same shape `src/lib/forward-events/read-and-extract.mjs` builds) and re-runs the
SAME pure, unmodified `extractForwardEvents` every writer already calls. Three findings, all read-only in
dry mode:
1. **Retext targets** - an existing row whose `(source_claim_id ?? source_section_id, event_date,
   event_kind)` identity still matches a freshly-extracted event, but whose `obligation_text` differs.
   The fresh text becomes the new `obligation_text`; every other column is untouched.
2. **Duplicate groups** - an existing row the fresh extraction's own within-run `dedupeEvents` would now
   drop as a content-duplicate of another existing row it keeps. `item_forward_events` (migration
   274/275, read in full) has **no `is_archived`/`superseded`/status column of any kind** - 13 columns
   total, none a lifecycle flag - so there is nowhere to mark a row superseded and no way for this script
   to make it stop rendering EXCEPT deleting it outright. **UPDATED, lane FE-DEDUP (2026-09-04): this
   finding NOW DELETES `would_drop_id` automatically in `apply` mode** - see the dedicated FE-DEDUP
   subsection below for why this was report-only before and what changed. It still reports every group
   (`would_drop_id`, `would_keep_id`, both `event_date`/`event_kind`, both obligation texts, the dedupe
   reason) in `duplicate_groups`. A row can be BOTH a retext target and half of a reported duplicate group
   at once; the duplicate finding never suppresses the retext finding for the SURVIVING side, but the
   deleted side is filtered out of the rewrite pass entirely (nothing to retext once it's gone).
3. **Collisions** [added lane RETEXT-COLLIDE, 2026-09-04] - see the dedicated subsection immediately
   below. Like (2) as of lane FE-DEDUP, this finding **is** applied automatically in `apply` mode: it is
   the live unique index's own requirement once text is honest, not an operator policy call.

**Lane RETEXT-COLLIDE (2026-09-04) - the retext rewrite collides with itself** [CONFIRMED, Maintenance #35,
run `33864089323`, `master` `e1a0287` = FWD-TEXT-2's normaliser, APPLY]: the step died 6 seconds in -
`db.mjs update failed: duplicate key value violates unique constraint uq_item_forward_events_dedupe`. The
live index [CONFIRMED, `pg_indexes`]: `CREATE UNIQUE INDEX uq_item_forward_events_dedupe ON
public.item_forward_events USING btree (intelligence_item_id, event_date, event_kind,
md5(obligation_text), COALESCE(source_claim_id, source_section_id))` (migration 275). Root cause: two
EXISTING rows can already share `(intelligence_item_id, event_date, event_kind, coalesce(source_claim_id,
source_section_id))` pre-fix - legitimately, since 275's own key also discriminates on `obligation_text`,
and their texts differ - but once BOTH are honestly retexted to the SAME fresh sentence (the section's
one date appears twice, so the extractor emitted two rows from the one section, pre-fix garbled two
different ways, post-fix identical), the second per-row `guardedUpdate` collides with the first. The dry
run #33's own `retext_targets` grouped by `(item, date, kind, after)` - no source column - over-counts
(≈154 groups / 324 rows), since that grouping cannot tell two-DIFFERENT-source rows that happen to share
text apart from a real collision; the real key (below) requires the SAME source object too, exactly the
column 275 itself added.

**The fix**: for **every** row of the table (target or not, per **DO** above - not only `retext_targets`),
this step computes the row's post-rewrite key exactly as Postgres computes the live index -
`(intelligence_item_id, event_date, event_kind, md5(after_text), coalesce(source_claim_id,
source_section_id))`, `md5` computed the way Postgres does (`node:crypto`, UTF-8 bytes, lowercase hex) -
where `after_text` is the freshly-extracted text for a retext target and the row's own current
`obligation_text` for every other row (so a row already retexted by a prior half-applied run, or never a
target at all, is still checked for collision against everything else). A group of more than one row under
that key is exactly what the live index would reject once written, so it cannot all survive: **one
survivor is kept** (a row already carrying its own after-text is preferred - nothing to rewrite for it;
otherwise earliest `created_at`, then lowest `id`, both deterministic), **the rest are `collide_delete`d**.
`item_forward_events` is DERIVED (regenerable from claims/sections by the extractor, never a primary
record - confirmed not in `scripts/lib/db.mjs`'s `DELETE_PROTECTED_TABLES`), so this delete is sanctioned,
but only ever through `guardedDelete` - chunked, cited (a dedicated `DELETE_CITE`), and snapshotted (the
snapshot captures the FULL prior row, `select("*")`, unlike the text-only `guardedUpdate` snapshot). Apply
order is delete-then-rewrite in the same pass: every `collide_delete` runs BEFORE any `guardedUpdate`, so
no rewrite can recreate the very key its own collision resolution just cleared a spot for. The rewrite
loop is tolerant of a target whose row no longer exists (this run's own delete, or a prior half-applied
run) or already carries its planned text - both count as `no_op`, never a failure. Live baseline
[CONFIRMED, read-only SQL against `kwrsbpiseruzbfwjpvsp`, 2026-09-04]: `item_forward_events` carries 1,017
rows across 160 items; 541 (535 strict-clean + 6 already `"…"`-fragment-marked, both by a SQL
approximation of `classifyAfterResidue`) already read as post-fix-normalized - the idempotence baseline a
re-run should reproduce. Grouping the live table by the collision key's non-text columns alone
(`intelligence_item_id, event_date, event_kind, coalesce(source_claim_id, source_section_id)`) - the
necessary precondition for any collision, since those columns are shared verbatim between
`forwardEventIdentityKey` and the collision key - finds 111 candidate groups / 235 rows already sharing
that identity pre-fix (0 of them already share identical text, confirming the live index is intact today);
this is an **upper bound** on real post-rewrite collisions (some groups hold genuinely distinct obligations
under different `source_span`s within one shared source, which migration 275's own key was built to
preserve - see that migration's NZIA precedent). The exact collision count requires running the actual
`extractForwardEvents` against each item's live claims/sections, which happens at MAINT dispatch time
(this environment has read-only DB access only); `planCollisions`/`postRewriteKey` are unit-tested against
fixtures shaped on this exact failure (two rows, one source, converging after-text; one retext target
colliding with an untouched row; a half-applied table where one side is already correct).

**Why the obligations register (migration 290) needs no companion run** [CONFIRMED, read
`supabase/migrations/290_obligations.sql` in full]: the `obligations` table has no `obligation_text`
column and no `source_span` column - the migration's own header states it explicitly, one home per fact,
reached via `forward_event_id`. A register row's own denormalized columns are unchanged by an
`obligation_text` edit, so `scripts/obligations/derive-obligations.mjs` is out of this step's scope and
out of this lane's write set.

**Lane FE-DEDUP (2026-09-04) - duplicate groups now delete; the exact-text-under-40-chars bug that let
them survive** [CONFIRMED by the coordinator, Supabase MCP 2026-09-04 23:22 UTC]: `public.obligations` had
1,149 rows but only 562 distinct `(intelligence_item_id, event_kind, due_date)` - 359 duplicate
`item_forward_events` groups, each a claim-backed row and a section-backed row from the SAME extraction run
(identical `created_at` 2026-09-04 13:09:42.772303+00, `extractor_version` fe1-2026-09-04.3), same
`obligation_text`. Example cited directly: item `02470d94-abe6-4645-8f5e-6ae421f29393`, events `a4ad1ce7-…`
(section) and `ca126684-…` (claim), both `obligation_text` `"…entered into force on 14 April 1967…"` (37
characters).

Root cause [CONFIRMED, read `src/lib/forward-events/extract-forward-events.mjs`'s `sameObligationContent`
in full]: `DEDUPE_MIN_COMPARE_LEN` (40 chars) - the floor that stops a coincidental SHORT SHARED PREFIX
between two DIFFERENT sentences from being mistaken for a duplicate - was applied even to an EXACT
full-string match, which carries no such coincidence risk at any length. Measured over the full live corpus
(1,152 rows, this lane, read-only): the pre-fix `dedupeEvents` (the real, unmodified function, run directly
against the live snapshot) drops only 206/1,152 rows; **70 of the 359 groups - every one under 40
characters - survive**, including the coordinator's own cited example. **The fix**, `EXTRACTOR_VERSION`
bumped `fe1-2026-09-04.5` → `fe1-2026-09-04.6`: `sameObligationContent` now short-circuits `a === b` (both
comparison-normalized) to `true` BEFORE the length floor is ever checked - strictly additive, every pre-fix
`true` stays `true`, only pre-fix `false` exact-matches-under-40-chars flip to `true`. Re-measured with the
fix: 296/1,152 rows drop (was 206), 856 remain, **zero** `(item, event_date, event_kind,
md5(obligation_text))` groups keep more than one row. All 296 dropped ids carry a live `obligations` row
(FK `forward_event_id`, migration 290, `ON DELETE CASCADE`), so `obligations` goes **1,149 → 853** once the
corresponding forward events are removed - NOT the naive 562 floor a bare `(item, event_kind, due_date)`
group-count would suggest, since that floor would ALSO collapse items whose schedule genuinely carries
several DISTINCT obligations sharing one date and kind (Euro 7's 40-event phase-out schedule, NZIA's four
distinct section-sourced 2030-01-01 "other" targets), which migration 274's own header explicitly rules is
NOT a duplicate. Unit tests live in `extract-forward-events.test.mjs`, including a fixture built from the
coordinator's own live pair.

**What changed in THIS step as a result**: (a) finding 2, "duplicate groups", above, now DELETES
`would_drop_id` automatically in `apply` mode via a SEPARATE guarded-delete path (`deleteDuplicateForwardEvents`
/ `DUPLICATE_CITE`, distinct from the collision delete's `DELETE_CITE` so the audit trail names the real
reason) - same mechanism as the collision delete (chunked, cited, snapshotted, reversible via
`--arg restore:<id,...>`), applied BEFORE collision planning (a row deleted as a duplicate is excluded from
`planCollisions`'s own input, so it is never double-counted as both a duplicate delete and a collision
delete) and before any retext rewrite. `obligations.forward_event_id`'s `ON DELETE CASCADE` removes the
corresponding `obligations` row automatically - no second writer, no re-derivation call. (b) migration 307
(`307_item_forward_events_text_identity_dedupe.sql`, written this lane, applied by the coordinator AFTER
this step's cleanup runs - see that migration's own header) replaces `uq_item_forward_events_dedupe`
(migration 275, keyed on `(intelligence_item_id, event_date, event_kind, md5(obligation_text),
coalesce(source_claim_id, source_section_id))`) with `uq_item_forward_events_text_identity` -
`(intelligence_item_id, event_kind, event_date, md5(obligation_text))`, dropping the source-object term
that was the actual loophole (a claim-backed and a section-backed row necessarily carry different source
object ids, so byte-identical text under the old key never collided). `postRewriteKey` (collision
resolution, above) is updated to match the new, narrower key, so a FUTURE retext run's own collision
prediction stays correct once migration 307 is live. `scripts/turns/apply-extraction-output.mjs`'s own
`dedupeKey` (its pre-insert idempotency check against already-live rows) is updated the same way.

**Dispatch, this cleanup specifically**: `node scripts/maintenance/forward-events-retext.mjs --mode=dry`
first (or the coordinator's own MAINT dispatch wrapper for step 12) to confirm
`counts.duplicate_group_total` and `counts.duplicate_delete_total` match the expected ~359 live groups
before writing anything; then `--mode=apply` to delete the section-backed loser of each. Once
`summary.duplicate_deletes.read_back.still_present_ids` is empty (0 remaining), migration 307 is safe to
apply - its own pre-check DO block re-verifies 0 duplicate groups remain and ABORTS otherwise, so applying
it out of order fails loudly rather than corrupting anything. Hand-dispatch only, no schedule (this is a
one-time catch-up over already-persisted rows, same as the FWD-TEXT-2/FWD-TEXT-3 cleanups above; a FUTURE
extraction run cannot reproduce this defect at all, since the extractor fix runs at extraction time for
every writer).

**Lane FWD-TEXT-3 (2026-09-04) - record-facts template unwrap** [CONFIRMED, live read-only SQL this lane,
project `kwrsbpiseruzbfwjpvsp`, 2026-09-04]: FWD-TEXT-2's rebuild (above) itself left behind a NEW residue
class, surfaced by a coordinator's evidence snapshot at 58 rows / 41 items; by the time this lane's own
measurement query ran - the backlog flywheel had minted more record-grade items in the interim
(`item_forward_events` grew 926/173 → 1071/228 over that window, measured) - the same class had grown to
**122 rows / 90 items**, all `source_section_id`-sourced, `extractor_version` `fe1-2026-09-04.2`, every one
drawn from an `intelligence_item_sections` row with `section_key = 'record_facts'`. Three verbatim examples
(re-identified live this lane):

- item `128b6a2e-cf78-4c9f-b03d-9256a3df5222` (2026-06-30, compliance_deadline): `"…source's own
  applicability language places this item at «direct_duty» (Your duty), from the passage: «the operator
  shall provide to the competent authority data on the biomass fraction of the carbon content of» [due_date]
  The captured source states a due date (date_precision: day), verbatim: «by 30 June 2026 on the practical
  application and levels of uncertainty of the method»"` - a *binding_position* FACT template swept forward
  into the *next* slot's `[due_date]` marker.
- item `025e6570-584f-4124-8b69-b69cc534e050` (2022-04-30, compliance_deadline): `"A full-brief regrounding
  will re-examine this gap when this item upgrades from record to brief. [primary_deadline] The captured
  source states, verbatim: «By 30 April 2022 and in each subsequent year, the Secretary of State must
  publish a li» [binding_position] No verbatim applicability language naming a duty-holder class was
  loc…"` - a generic-slot FACT template that swept the *preceding* slot's GAP sentence in on its leading
  edge, and ran past its own closing guillemet into the *next* slot's GAP marker on its trailing edge.
- item `10cf4da4-9363-4365-90df-a1dceace1b66` (2004-02-14, compliance_deadline, legacy straight-quote
  wrapper - one of 26/1333 `record_facts` sections still on the pre-guillemet-migration `"…"` delimiter,
  measured live): `"A full-brief regrounding will re-examine this gap when this item upgrades from record to
  brief. [primary_deadline] The captured source states, verbatim: \"No later than 14 February 2004, the
  Commission shall forward to the Member States a guidance document s\""`.

Root cause [CONFIRMED, read `src/lib/intake/record-facts.mjs` and `src/lib/forward-events/
extract-forward-events.mjs` in full]: `record-facts.mjs` (a consumer INPUT to this extractor, not a member
of this family - see below) grounds a record-grade item's required slots as claims whose `claim_text` is
one of four FIXED TEMPLATES - a generic slot FACT (`` `[${slotKey}] The captured source states, verbatim:
«${span}»` ``), a `due_date` FACT adding `(date_precision: X)`, a `binding_position` FACT (`` `[binding_position]
The captured source's own applicability language places this item at «code» (Label), from the passage:
«span»` ``), and a GAP variant per slot ending "A full-brief regrounding will re-examine this gap when this
item upgrades from record to brief." - and renders them VERBATIM, one `\n`-joined claim per line with no
blank-line separator, into the item's `record_facts` section `content_md`. FWD-TEXT-2's own `clauseStart`/
`clauseAround` never recognised a `[slot_key] ` marker as a sentence/clause boundary - it is not
uppercase/quote/digit (`SENTENCE_OPEN_RE`), and the templates end mid-guillemet with no trailing period -
so the leading-edge scan either swept the PRECEDING claim's own trailing GAP sentence in, or (via the
last-resort whitespace fallback) landed arbitrarily inside the marker/wrapper prose; the trailing-edge scan
had no reason to stop before the START of the next `[slot_key] ` marker either.

**The fix** - the one governing file this family names, `src/lib/forward-events/extract-forward-events.mjs`:
`EXTRACTOR_VERSION` bumped `fe1-2026-09-04.2` → `fe1-2026-09-04.3`. `clauseStart`'s backward boundary scan
now recognises a `[slot_key] ` marker start as a deliberate boundary - never a fallback, the same tier as a
genuine terminator/paragraph/list break - and `clauseAround`'s trailing search now also stops before the
START of the next marker, never sweeping into it. New exported `unwrapRecordFactsTemplate(windowed,
relDateStart, relDateEnd)`: when a marker-bounded window opens with a recognised record-facts FACT wrapper
(generic slot / due_date / binding_position), `obligation_text` becomes the passage inside the «…» pair (or,
for the legacy straight-quote sections, the `"…"` pair) that actually CONTAINS the event's own date - the
INNERMOST pair when the source text nests guillemets, and for `binding_position` always the "from the
passage" quote, never the leading «code» quote. FWD-TEXT-2's existing honest-fragment rules then run on THAT
passage via the same `normalizeObligationText` every other window already goes through - including, in item
`128b6a2e`'s case above, the lowercase-starting-passage leading-"…" rule, which fires here exactly as it
would for a non-template window (`…by 30 June 2026 on the practical application…`), because the due_date
quote's own captured text genuinely starts mid-sentence. A window that opens with a record-facts GAP wrapper
is skipped with a recorded reason (`record_facts_gap_boilerplate_no_quoted_date`) - never emitted as an
`obligation_text` or treated as a source window on its own; a FACT-shaped wrapper whose own date is somehow
not inside any quote is skipped too (`record_facts_template_date_not_in_quote`, defensive). `clauseAround`
now returns `{text}`/`{skip}` (was a bare string) - every call site in `scanText` routes a `skip` to
`skipped`, never `hits`. `source_span`/`assertVerbatim` are unaffected - the matched date substring
`tryParseDateAt` returns is unchanged, still checked against the ORIGINAL unmodified source text.

**Explicitly NOT this family's governing file, and why**: `src/lib/intake/record-facts.mjs` (the
record-grade mint's TEMPLATE PRODUCER) is a consumer input to this extractor, not a member of this family -
its template is a customer-visible section-format decision governed by the record-grade mint's own
lane/owner, and this fix is entirely on the CONSUMER side (the extractor learning to understand a shape it
already receives), never a change to what record-facts.mjs writes. `scripts/maintenance/
forward-events-retext.mjs` gained a new dry-report residue class (`classifyAfterResidue`'s
`contains_record_facts_wrapper`, parallel to and independent of the FWD-TEXT-2 classes above) - it is a
CONSUMER of the fixed extractor (imports `extractForwardEvents` itself, never reimplements its clause logic),
so this REWRITE step needed zero code change beyond that one reporting class to inherit the fix; a dry run
under the new extractor version should show `contains_record_facts_wrapper` at zero for every retext target.

**Idempotence + property test**: enforced against all 122 live residue rows (fetched via read-only SQL,
project `kwrsbpiseruzbfwjpvsp`, 2026-09-04 - see `src/lib/forward-events/extract-forward-events.test.mjs`'s
"RECORD-FACTS TEMPLATE UNWRAP" describe block header for the exact query) saved to
`scripts/_snapshots/fwdtext3-live-58.json` (gitignored scratch, named after the coordinator's earlier
41-item/58-row dispatch-evidence snapshot - a subset of, not a different defect from, the 90-item/122-row
population this lane actually measured and fixed): 0/122 fresh outputs still carry any record-facts wrapper
token (`captured source`, `verbatim:`, `date_precision`, `from the passage`, `full-brief regrounding`, or a
`[slot_key]` marker); 106/122 exactly match a pre-existing claim-sourced twin's `obligation_text` at the same
`(item, event_date, event_kind)` (the remaining 16 either have no claim twin, or a claim twin whose OWN
verbatim span genuinely differs - a different record-facts slot's own quote of overlapping source text, not
a bug in this fix); idempotent (`normalizeObligationText(text) === text` for every one of the 122 fresh
outputs). F28's marker for this lane: `fsi-app/scripts/harness-runs/forward-events/PENDING-RUN.md`
(`harness_version at write time: sha256:4187cd5f5f26d005`), discharged the moment the next
`forward-events-retext` APPLY (or `run-extraction.mjs` dispatch) under this code records that hash as its
own artifact's `harness_version`.

**Dispatch**: `mode=dry` reports `counts` (`items_scanned`, `retext_target_total`, `by_defect_class`,
`by_after_defect_class`, `duplicate_group_total`, `duplicate_delete_total` [lane FE-DEDUP], `collision_group_total`,
`collision_delete_total`), `retext_targets` (before/after/defect classes per row, each row's `after` also
classified by the new `classifyAfterResidue` - lane FWD-TEXT-2 - under `after_defect_classes`, so a dry run
proves the fixed-producer property test against itself: every non-empty class there is a residual case worth
looking at, and `classifyAfterResidue` returning only `["honest_fragment_marked"]` and/or `["clean"]` across
the sweep is the expected steady state), `duplicate_groups`, and `collisions` (`groups`, `survivors`,
`deletions` - full row JSON per `collide_delete`, plus a restore note); writes nothing. `mode=apply` (no
`--arg` required beyond an optional scope) first `guardedDelete`s every `duplicate_groups[].would_drop_id`
row (chunked at 200, cited `DUPLICATE_CITE` - lane FE-DEDUP, 2026-09-04), THEN `guardedDelete`s every
remaining `collisions.deletions` row (chunked at 200, cited `DELETE_CITE`, snapshotted), THEN rewrites
`obligation_text` on every remaining retext target through the guarded `db.mjs` path (cite + snapshot, one
single-row `guardedUpdate` per target - each carries a *different* new text, unlike
`canonical-key-dedup.mjs`/`record-hollow-sweep.mjs`'s one shared patch - tolerant of a target already gone
or already correct, counted `no_op`, never a failure), records `per_item[]` (before/after + `restore_sql`),
and reads back the duplicate deletes (`duplicate_deletes.read_back`), the collision deletes
(`collisions.read_back`), and the survivors (`read_back`). `--arg ids:<id,id,...>` scopes the sweep (and
collision detection) to named `intelligence_item` ids (dry or apply). As of lane FE-DEDUP (2026-09-04),
BOTH `duplicate_groups` and `collisions` are findings this step actually applies - neither is report-only
any more.

**Reversal**: two paths, same convention as record-hollow-sweep/canonical-key-dedup above:
- **Durable, artifact-based** (preferred): `summary.json`'s `per_item[].restore_sql` - one self-contained
  `UPDATE item_forward_events SET obligation_text = '...' WHERE id = '...'` per rewritten row, from THIS
  run's own "before" value. A `collide_delete`/duplicate-group delete has no `restore_sql` (a `DELETE` has
  no single-statement undo without the row's full prior state) - use the snapshot path below for those.
- **Best-effort, same-disk-only**: `mode=apply, arg=restore:<id,id,...>` (this same script) - scans
  `scripts/_snapshots/*.jsonl` for this step's own prior-state entries (cite-reason prefix `"MAINT
  forward-events-retext dispatch"`, which `CITE`/`DELETE_CITE`/`DUPLICATE_CITE` all carry - widened lane
  FE-DEDUP from the earlier `"...(Lane FWD-TEXT"`-only literal so a `DUPLICATE_CITE` snapshot is also found)
  and replays the LATEST one per id: a `guardedUpdate` snapshot (text-only) replays via `guardedUpdate`; a
  `guardedDelete` snapshot (always the FULL prior row, `select("*")`) replays via `guardedInsert` - same
  id, every column, verbatim. Refuses (never guesses) any id with no matching snapshot entry, listed in
  `missing_ids`.

**Artifact / read back**: `summary.json`'s `counts` (`items_scanned`, `retext_target_total`,
`by_defect_class`, `by_after_defect_class`, `duplicate_group_total`, `duplicate_delete_total`,
`collision_group_total`, `collision_delete_total`, `no_op_total`), `retext_targets`, `duplicate_groups`,
`duplicate_deletes` (`deleted`/`read_back`, apply only), `collisions` (`groups`, `survivors`, `deletions`,
and in apply mode `deleted`/`read_back`), `per_item` (before/after + `restore_sql` per rewritten row, apply
only), `no_op_ids`, and `read_back` (`retexted_total`, `not_confirmed_ids` - computed over every surviving
target, applied or `no_op`). Confirm against `SELECT id, obligation_text FROM item_forward_events WHERE id
= ANY(<retext target ids>)` (should equal the planned `after` text for every id), `SELECT id FROM
item_forward_events WHERE id = ANY(<would_drop_id list>)` (should return zero rows), and `SELECT id FROM
item_forward_events WHERE id = ANY(<collide_delete ids>)` (should return zero rows). Confirm
`obligations` count moved from 1,149 to the number `summary.duplicate_deletes.deleted` implies (1,149 minus
that count, since each deleted forward event cascades exactly one `obligations` row).

**Registration**: `docs/inventories/shared-dataset-ownership.md`'s `item_forward_events` section (this
step's file added to the enforced JSON allowlist and the narrative writer-path list as write path 4; that
entry's prose updated by lane RETEXT-COLLIDE to describe the DELETE path, and again by lane FE-DEDUP
(2026-09-04) to describe the second DELETE path (`DUPLICATE_CITE`) and the live dedupe key moving to
migration 307 - the JSON allowlist itself is unchanged both times, since it gates by file, not by write
verb, and this file was already listed there).

---

