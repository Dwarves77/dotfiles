# Pending run — forward-events

F28's staleness-coupling rule (rule (c), `.discipline/fitness/functions/F28-harness-run-integrity.mjs`)
fires when a family's governing files re-hash to something no valid artifact on record carries. This
marker is the honest acknowledgment that rule anticipates — written in the exact format
`parsePendingRunHash` reads (`harness_version at write time: `sha256:...``).

**What changed:** lane FWD-TEXT (2026-09-04), fixing THE DEFECT [CONFIRMED, live customer surface
https://carosledge.com/regulations "Upcoming obligations" strip, 2026-09-04 ~08:15 UTC]: of 8 events
shown, several `item_forward_events.obligation_text` values rendered garbled — starting mid-word
(`"re|venues generated from fines. By 25 September 2026..."`), a leaked source-URL tail plus a markdown
bold label (`"7/oj/eng **Primary headline compliance deadline — FACT:** \"It shall apply from
29 November 2026...\""`), and a markdown table pipe/cell fragment plus a label (`"hicles (M₂, M₃, N₂, N₃)
| MONITORING **FACT — deadline:** \"By 29 November 2026...\""`). One Euro 7 item carried the SAME date
`2026-11-29` five/six times, with at least one duplicate pair — the identical sentence once via a claim
(clean) and once via a section's rendered markdown (garbled).

Root cause [CONFIRMED, read `src/lib/forward-events/extract-forward-events.mjs` lines 262-271 pre-fix]:
`clauseAround`'s leading edge (`from = max(0, start - 60)`) was a fixed byte offset, never snapped to a
sentence/clause boundary, so a section-derived context window could start mid-word or
mid-markdown-artifact; `sentenceStart` existed already but was never used by `clauseAround`.

The ONE governing file this family names moved:

- **`src/lib/forward-events/extract-forward-events.mjs`** — `EXTRACTOR_VERSION` bumped
  `fe1-2026-09-03.1` → `fe1-2026-09-04.1`. New `clauseStart(text, idx, maxBefore)` snaps `clauseAround`'s
  leading edge to the nearest sentence/clause terminator (`.`/`;`, guarded against a decimal-style digit
  run) within `maxBefore` bytes of the match, falling back to a whitespace boundary ONLY when a genuine
  truncation occurred (`hardFloor <= 0` — i.e. the window was not actually clipped — returns the natural
  floor untouched, never trimming a leading word off a short, unclipped span); never returns a mid-word
  offset. New exported `normalizeObligationText(raw)` (display text only — `source_span` stays
  byte-verbatim; `assertVerbatim` is unmodified and still enforced on every existing test) strips a leaked
  trailing table-cell fragment, a leading markdown bold label, a leading URL tail, and a leading table
  pipe/cell, in that order, then collapses whitespace. New exported `sameObligationContent(aText, bText)`
  and `dedupeEvents(events)` collapse same-run `(event_date, event_kind)` hits under a CONTENT-similarity
  check (a shared-prefix/containment match on normalized, case-folded, subscript-digit-normalized text —
  never a blind date+kind collapse): when one side is claim-backed and the other section-backed, the
  claim-backed hit is kept; when both are the same kind, the first is kept; every drop is recorded in a
  new `counts: { dedupe_dropped, dedupe_dropped_detail }` field on `extractForwardEvents`'s return, never
  silently. Deliberately narrower than a blind `(event_date, event_kind)` collapse would have been — this
  session's own live corpus measurement found the NZIA item's `(2030-01-01, other)` group holds 4
  genuinely distinct section-sourced obligations plus 1 unrelated claim under that same date+kind pair; a
  blind collapse would have destroyed real content, the same "content loss, not deduplication" failure
  migration 275's own header already names for the DB-level dedupe key.

`scripts/harness-runs/forward-events/PROTOCOL.md` (this family's other governing file) is UNCHANGED by
this lane. `scripts/forward-events/run-extraction.mjs`'s own `FORWARD_EVENTS_GOVERNING_FILES` list (paths,
not content) is unchanged, so the cross-check `run-extraction.test.mjs` already enforces against this
file's own `GOVERNING_FILES` entry stays intact.

**What this fix does NOT touch, and why**: the `obligations` register (migration 290,
`scripts/obligations/derive-obligations.mjs`) — confirmed by reading that migration in full — has no
`obligation_text` column and no `source_span` column, so it needs no companion change here. No React
component (`UpcomingObligationsStrip*.tsx` etc.) was touched — the fix belongs at the producer, per
CLAUDE.md's own honest-state rule, and no render-side change was needed to close the visible defect. A
separate, narrower defect — the NZIA item's own claim `source_span` already starting mid-word ("venues"/
"revenues") upstream of this extractor, traced to a `[gate-a-backfill]`-tagged capture script outside this
lane's write set — is explicitly NOT fixed by this change (this extractor's own clause-boundary fix
happens to cure the visible symptom for that one case, but the upstream span itself is unchanged).

**The one-time catch-up for text already stored**: a new maintenance step,
`scripts/maintenance/forward-events-retext.mjs` (+ test), re-runs this SAME fixed, unmodified
`extractForwardEvents` over every item's current claims/sections and rewrites any existing
`item_forward_events.obligation_text` whose freshly-computed text differs, through the guarded `db.mjs`
path (see `docs/runbooks/MAINTENANCE-RUNBOOK.md` §12). It is not itself a `GOVERNING_FILES` entry for this
family (it is a consumer of the fixed extractor, not a producer of what a harness run measures), so it
does not move this hash on its own.

**harness_version at write time:** `sha256:cefcc8cae82aff7d`

**The planned run that will supersede this marker:** the next `scripts/forward-events/run-extraction.mjs`
dispatch under this landed code (or the coordinator's next `population-turn` flywheel pass, which calls
the same extractor) — its own `forward-events-run-NNN.json` artifact will record this hash as its
`harness_version`, discharging this marker per F28's reverse-audit (rule (c): the marker is deleted the
moment a valid artifact's recorded hash matches the one above, or re-pinned to a new hash if a governing
file moves again before that run lands).
