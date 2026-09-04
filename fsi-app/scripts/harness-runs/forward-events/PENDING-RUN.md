# Pending run — forward-events

F28's staleness-coupling rule (rule (c), `.discipline/fitness/functions/F28-harness-run-integrity.mjs`)
fires when a family's governing files re-hash to something no valid artifact on record carries. This
marker is the honest acknowledgment that rule anticipates — written in the exact format
`parsePendingRunHash` reads (`harness_version at write time: `sha256:...``).

## What changed (1)

Lane FWD-TEXT-3 (2026-09-04), fixing the residue lane FWD-TEXT-2 (`fe1-2026-09-04.2`) left behind: THE
DEFECT [CONFIRMED, live read-only SQL this lane, project `kwrsbpiseruzbfwjpvsp`, 2026-09-04] — after
Maintenance #38's `forward-events-retext` APPLY (921 targets, 173 collision deletes, 748 rewritten, all
748 read back), `item_forward_events` carried a NEW residue class the coordinator's own dispatch evidence
named at 58 rows / 41 items; by the time this lane queried (the backlog flywheel had minted more
record-grade items in between — `item_forward_events` grew 926/173 → 1071/228 over that window, measured),
the same class was **122 rows / 90 items**, all `source_section_id`-sourced, `extractor_version`
`fe1-2026-09-04.2`, every one drawn from an `intelligence_item_sections` row with `section_key =
'record_facts'`. Three verbatim examples (from the dispatch evidence, re-identified live this lane):

- item `128b6a2e-cf78-4c9f-b03d-9256a3df5222` (2026-06-30, compliance_deadline): `"…source's own
  applicability language places this item at «direct_duty» (Your duty), from the passage: «the operator
  shall provide to the competent authority data on the biomass fraction of the carbon content of» [due_date]
  The captured source states a due date (date_precision: day), verbatim: «by 30 June 2026 on the practical
  application and levels of uncertainty of the method»"`
- item `025e6570-584f-4124-8b69-b69cc534e050` (2022-04-30, compliance_deadline): `"A full-brief regrounding
  will re-examine this gap when this item upgrades from record to brief. [primary_deadline] The captured
  source states, verbatim: «By 30 April 2022 and in each subsequent year, the Secretary of State must
  publish a li» [binding_position] No verbatim applicability language naming a duty-holder class was
  loc…"`
- item `10cf4da4-9363-4365-90df-a1dceace1b66` (2004-02-14, compliance_deadline, legacy straight-quote
  wrapper): `"A full-brief regrounding will re-examine this gap when this item upgrades from record to
  brief. [primary_deadline] The captured source states, verbatim: \"No later than 14 February 2004, the
  Commission shall forward to the Member States a guidance document s\""`

Root cause [CONFIRMED, read `src/lib/intake/record-facts.mjs` + `src/lib/forward-events/
extract-forward-events.mjs` in full]: `record-facts.mjs` (a NON-governing consumer input, see below) grounds
a record-grade item's required slots as claims whose `claim_text` is one of a handful of FIXED TEMPLATES
(`[${slotKey}] The captured source states, verbatim: «${span}»`; the `due_date` variant adding
`(date_precision: X)`; the `binding_position` variant, `[binding_position] The captured source's own
applicability language places this item at «code» (Label), from the passage: «span»`; and an honest GAP
variant per slot ending "A full-brief regrounding will re-examine this gap when this item upgrades from
record to brief."), and those claims are rendered VERBATIM, one `\n`-joined line per claim, into the item's
`record_facts` section `content_md`. This module's own `clauseStart`/`clauseAround` (lane FWD-TEXT-2) never
recognised a `[slot_key] ` marker as a sentence/clause boundary — it is not uppercase/quote/digit
(`SENTENCE_OPEN_RE`), and the templates end mid-guillemet with no trailing period, so the leading-edge scan
either swept the PRECEDING claim's own trailing GAP sentence in, or (via the last-resort whitespace
fallback) landed arbitrarily inside the marker/wrapper prose.

The ONE governing file this family names moved:

- **`src/lib/forward-events/extract-forward-events.mjs`** — `EXTRACTOR_VERSION` bumped
  `fe1-2026-09-04.2` → `fe1-2026-09-04.3`. `clauseStart`'s backward boundary scan now recognises a
  `[slot_key] ` marker start as a deliberate boundary (never a fallback — same tier as a genuine
  terminator/paragraph/list break), for BOTH edges: `clauseAround`'s trailing search now also stops before
  the START of the next marker (never sweeps into it) and additionally accepts a closing record-facts
  guillemet `»` as a stop-and-include terminator. New exported `unwrapRecordFactsTemplate(windowed,
  relDateStart, relDateEnd)`: when a marker-bounded window opens with a recognised record-facts FACT wrapper
  (generic slot / due_date / binding_position), replaces `obligation_text` with the passage inside the «…»
  (or, for the ~2% of live `record_facts` sections still on the pre-guillemet-migration straight-quote
  delimiter — 26/1333, measured live — the `"…"` pair) that actually CONTAINS the event's own date — the
  INNERMOST pair when the source text itself nests guillemets, ordinarily the wrapper's only quote (for
  binding_position, always the "from the passage" quote, never the leading «code» quote). The existing
  FWD-TEXT-2 honest-fragment rules then run on THAT passage via the SAME `normalizeObligationText` every
  other window already goes through. A window that opens with a record-facts GAP wrapper instead is skipped
  with a recorded reason (`record_facts_gap_boilerplate_no_quoted_date`) — never emitted as an
  `obligation_text` or treated as a source window on its own; a FACT-shaped wrapper whose own date is
  somehow not inside any quote is skipped too (`record_facts_template_date_not_in_quote`, defensive). `
  clauseAround` now returns `{text}`/`{skip}` (was a bare string) — every call site in `scanText` routes a
  `skip` to `skipped`, never `hits`. `source_span`/`assertVerbatim` are unaffected — the matched date
  substring `tryParseDateAt` returns is unchanged, still checked against the ORIGINAL unmodified source
  text.

`scripts/harness-runs/forward-events/PROTOCOL.md` (this family's other governing file) is UNCHANGED by this
lane.

**Explicitly NOT this family's governing file, and why**: `src/lib/intake/record-facts.mjs` (the
record-grade mint's TEMPLATE PRODUCER) is a consumer input to this extractor, not a member of this family —
its template is a customer-visible section-format decision governed by the record-grade mint's own
lane/owner, and this fix is entirely on the CONSUMER side (the extractor learning to understand a shape it
already receives), never a change to what record-facts.mjs writes. `scripts/maintenance/
forward-events-retext.mjs` gained a new dry-report residue class (`classifyAfterResidue`'s
`contains_record_facts_wrapper`, independent of and parallel to the pre-existing FWD-TEXT-2 classes) — it is
a CONSUMER of the fixed extractor (imports `extractForwardEvents`, never reimplements its logic), so it does
not move this hash either, exactly as this file's own prior entries note for the same script.

**Idempotence + property test**: enforced against every one of 122 live residue rows (fetched via read-only
SQL, project `kwrsbpiseruzbfwjpvsp`, 2026-09-04 — see `src/lib/forward-events/extract-forward-events.test.mjs`'s
own "RECORD-FACTS TEMPLATE UNWRAP" describe block header for the exact query) saved to
`scripts/_snapshots/fwdtext3-live-58.json` (gitignored scratch, named after the coordinator's earlier
41-item/58-row dispatch-evidence snapshot — a subset of, not a different defect from, the 90-item/122-row
population this lane actually measured and fixed): **0/122 still carry any record-facts wrapper token**
(`captured source`, `verbatim:`, `date_precision`, `from the passage`, `full-brief regrounding`, or a
`[slot_key]` marker) after re-extraction; **106/122 exactly match a pre-existing claim-sourced twin**'s
`obligation_text` at the same `(item, event_date, event_kind)` (the remaining 16 either have no claim twin,
or a claim twin whose OWN verbatim span genuinely differs — a different record-facts slot's own quote of
overlapping source text, not a bug in this fix); idempotent (`normalizeObligationText(text) === text` for
every one of the 122 fresh outputs).

**harness_version at write time:** `sha256:4187cd5f5f26d005`

**The planned run that will supersede this marker:** the next `scripts/forward-events/run-extraction.mjs`
dispatch under this landed code (or the coordinator's next `population-turn`/`forward-events-retext` APPLY
pass, which calls the same extractor) — its own `forward-events-run-NNN.json` artifact (or, for the retext
step, the next Maintenance run) will record this hash as its `harness_version`, discharging this marker per
F28's reverse-audit (rule (c)): the marker is deleted the moment a valid artifact's recorded hash matches
the one above, or re-pinned to a new hash if a governing file moves again before that run lands.
