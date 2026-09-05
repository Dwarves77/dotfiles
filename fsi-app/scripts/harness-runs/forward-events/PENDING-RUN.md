# Pending run — forward-events

F28's staleness-coupling rule (rule (c), `.discipline/fitness/functions/F28-harness-run-integrity.mjs`)
fires when this family's governing files (`scripts/harness-runs/governing-files.mjs`'s
`GOVERNING_FILES['forward-events']` — `src/lib/forward-events/extract-forward-events.mjs`,
`scripts/harness-runs/forward-events/PROTOCOL.md`) re-hash to something no artifact on record carries. This
family has 35 valid artifacts (`forward-events-run-001` … `-035`), the latest recording `harness_version
sha256:33060af6a9eccf42`. This marker is the honest acknowledgment CONVENTION.md's `harness_version` design
anticipates — written in the exact format `parsePendingRunHash` reads (`harness_version at write time:
`sha256:...``).

**What changed (lane FE-DEDUP, 2026-09-04) [CONFIRMED by the coordinator, Supabase MCP 2026-09-04 23:22
UTC].** `public.obligations` had 1,149 rows for only 562 distinct `(intelligence_item_id, event_kind,
due_date)` — 359 duplicate `item_forward_events` groups, each a claim-backed row and a section-backed row
from the SAME extraction run with byte-identical `obligation_text` (example cited by the coordinator: item
`02470d94-abe6-4645-8f5e-6ae421f29393`, events `a4ad1ce7-…` (section) / `ca126684-…` (claim), both
"…entered into force on 14 April 1967…", 37 chars). Root cause, measured directly against the live corpus
this lane (1,152 `item_forward_events` rows, 292 items, read-only): running THIS module's own unmodified
`dedupeEvents`/`sameObligationContent` over every item's full existing row set (the identical semantic
dedupe every writer already runs at extraction time) drops only 206 of the 1,152 rows — 70 groups' member
texts, ALL under 40 characters, still survived. `DEDUPE_MIN_COMPARE_LEN` (the 40-char floor
`sameObligationContent` requires before treating a shared LEADING PREFIX as evidence of the same sentence —
the floor exists so a coincidental short shared opening phrase between two genuinely DIFFERENT sentences is
never mistaken for a duplicate) was applied unconditionally, including to an EXACT full-string match, which
carries no such coincidence risk at any length.

ONE governing file moved bytes in this diff (`src/lib/forward-events/extract-forward-events.mjs` — the sole
governing file this family's PROTOCOL.md-listed sibling, `scripts/harness-runs/forward-events/PROTOCOL.md`,
is UNCHANGED):

1. **`sameObligationContent(aText, bText)`** — an exact-equality check (`a === b`, both already
   comparison-normalized) now runs FIRST, before the length floor, short-circuiting to `true` at any
   length. Strictly ADDITIVE to what the function already caught: every pre-fix `true` stays `true`; it
   only turns some pre-fix `false` results — exact matches under 40 chars — into `true`. The length-gated
   fuzzy prefix/substring match is now reached only when the two comparison-normalized texts are NOT
   already identical, so the floor still guards exactly the coincidence risk it was built for (two
   DIFFERENT short texts under the floor still do not match — unit-tested).
2. **`EXTRACTOR_VERSION`** bumped `fe1-2026-09-04.5` → `fe1-2026-09-04.6`.

Re-measured with the fix applied, over the SAME live snapshot: 296 of 1,152 rows drop (was 206), 856
remain, and ZERO `(intelligence_item_id, event_date, event_kind, md5(obligation_text))` groups keep more
than one row — the exact invariant migration 307's new unique index requires. `obligations` (one row per
surviving forward event, migration 290) goes 1,149 → 853 once the corresponding forward events are removed
— not the naive 562 a bare `(item, event_kind, due_date)` group-count floor would suggest, since that floor
would ALSO collapse items whose schedule genuinely carries several DISTINCT obligations sharing one date
and kind (Euro 7's 40-event phase-out schedule, NZIA's four distinct 2030-01-01 targets — this file's own
"WITHIN-EXTRACTION DEDUPE" header note), which migration 274's own header explicitly rules is NOT a
duplicate.

`scripts/maintenance/forward-events-retext.mjs` (duplicate-group finding now auto-deletes, was report-only;
new `DUPLICATE_CITE`), `scripts/turns/apply-extraction-output.mjs` (`dedupeKey` narrowed to match migration
307), `supabase/migrations/307_item_forward_events_text_identity_dedupe.sql` (new DB-level guard, written
not applied), and both files' test suites also changed in this diff — none of the four is a `forward-events`
governing file (PROTOCOL.md, this family's other governing file, is unchanged), so none of them moves this
family's `harness_version` on their own — only item 1-2 above (both in `extract-forward-events.mjs`) do.

**harness_version at write time:** `sha256:99877b0fdd9a8adb` (was `sha256:33060af6a9eccf42`, the hash all
35 landed artifacts carry)

**The planned run that supersedes this marker:** the next `forward-events-run-036.json` (or whichever
number is next once this lane's PR merges), produced by the coordinator's next `run-extraction.mjs`
dispatch under this code. Per F28's reverse-audit (rule (c)): once that run lands recording `harness_version
sha256:99877b0fdd9a8adb`, this marker is discharged and should be deleted in the same proposer pass that
reads it.

**Coordinator's exact next dispatch for THIS lane's one-time cleanup** (not itself a `forward-events` family
run — it writes no `forward-events-run-*.json` artifact; it is a MAINT dispatch over already-persisted
rows, `docs/runbooks/MAINTENANCE-RUNBOOK.md` §12's own dedicated "lane FE-DEDUP" subsection):

1. `node scripts/maintenance/forward-events-retext.mjs --mode=dry` — confirm `counts.duplicate_group_total`
   / `counts.duplicate_delete_total` against the ~359 live groups before writing anything.
2. `node scripts/maintenance/forward-events-retext.mjs --mode=apply` — deletes the section-backed loser of
   each duplicate group (chunked, cited `DUPLICATE_CITE`, snapshotted, reversible via
   `--arg restore:<id,...>`); `obligations.forward_event_id`'s `ON DELETE CASCADE` (migration 290) removes
   the corresponding `obligations` row automatically.
3. Confirm `summary.duplicate_deletes.read_back.still_present_ids` is empty, and `obligations` count reads
   853 (was 1,149).
4. Apply migration 307 (`supabase/migrations/307_item_forward_events_text_identity_dedupe.sql`) via
   Supabase MCP — its own pre-check `DO` block re-verifies 0 duplicate groups remain and ABORTS otherwise.
