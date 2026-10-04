## 40. `timeline-backfill`

**New this runbook, task 6.1c, brief-chain build plan 2026-09-11, under ADR-030** ("Items need to be
resolved not quarantined... No item should be without some date in the timeline"). Written from
`scripts/maintenance/timeline-backfill.mjs`'s own header. **Updated for D17 family 12 (defect-fix-plan
2026-09-12, lane L11: step 7) and its 2026-09-13 addendum (lane L11b: step 8).**

**Purpose**: corpus backfill of steps 2 through 8 of ADR-030's ordered date-derivation waterfall, for
every live (`is_archived=false`) item that carries NO `item_timelines` row at all:

1. (not this step) the brief-body timeline-section harvest, a DIFFERENT tool
   (`scripts/backfill-item-timelines.mjs`, `extractRegulationSections` + `buildTimelineRows`), reused
   exactly as-is. Dispatch it first, separately, over the reg-family items carrying a full brief with a
   Confirmed Regulatory Timeline section; it writes ALL rows a brief's own section yields, not one.
2. title date: "of DD Month YYYY" / "of DD.MM.YYYY" / a bare "DD Month YYYY" (EU/UK/IMO title forms),
   verified against the item's own stored capture text (`agent_run_searches`) before it is trusted.
   Label "Adopted (from the instrument title)".
3. Federal Register URL date path (`/documents/YYYY/MM/DD/`). Label "Published in the Federal Register".
4. legislation.gov.uk: a "Made DDth Month YYYY" line (statutory instrument), a bracketed
   "[DDth Month YYYY]" Royal Assent line (an Act), or a year-only fallback from a UK-shaped identifier
   (precision "year").
5. the earliest `item_forward_events` row, labeled from its own `obligation_text`, prefixed by its kind.
6. a dateline in the capture text for non-legal hosts (a leading "Published DD Month YYYY", a bare
   "DD Month YYYY" in the first 400 characters, or a `<time datetime=...>` ISO date).
7. **(D17 family 12)** `captured`: when nothing above matches, but the item has a usable stored capture
   (`agent_run_searches`), a timeline row dated at that capture's own `searched_at` -- a real, dated event
   about the item (when it was retrieved), never presented as the instrument's own date. Label ends
   "not the instrument's own date"; ordered LAST via `CAPTURED_FALLBACK_SORT_ORDER` (999) so it never
   outranks a real derived milestone.
8. **(D17 family 12 addendum, 2026-09-13)** `recorded`: when steps 2-7 ALL miss (no derivable instrument
   date and no usable stored capture), a timeline row dated at the item's own
   `intelligence_items.created_at` -- when the item was recorded in the ledger, never presented as the
   instrument's own date. Label "Recorded in the ledger on this date; not the instrument's own date";
   ordered even later than step 7 via `RECORDED_FALLBACK_SORT_ORDER` (1000). Since `created_at` is
   populated on every live row, this step reduces the genuinely-undateable set to structurally near zero.
9. nothing found (no capture AND no parseable `created_at` -- a near-structurally-impossible residual):
   the item is reported in this run's own `summary.json`, never given an invented date and never given
   `added_date` (that is the ledger's date, not the instrument's).

First hit wins; every attempt is named so the row (or the report) is auditable. Precision honesty is
`timeline-harvest.mjs`'s existing rule, reused via `src/lib/agent/timeline-backfill-derive.mjs`: a
day-precise token maps to its exact date; any other precision keeps the original token in the label.

**What it does NOT do**: never touches an item that already has an `item_timelines` row; writes AT MOST
ONE row per undated item (the harvest's own multi-row case is step 1's job, a different script); never
invents a date the item's own captured text or `created_at` does not verbatim state; never re-derives from
a stale verdict silently -- a genuinely undateable item is reported again on every run until something
dates it.

**Ruling**: none by token, ADR-030 is the standing authorization; not gated behind a ruling `arg`.

**Dispatch**: `mode=dry` reports the per-step counts (`counts.by_step`) and a 20-item sample per step
(`sample_by_step`), writes nothing. `mode=apply` writes one `item_timelines` row per dateable item through
the guarded `db.mjs` path (cited, snapshotted). The undateable-set write is **informational, not an open
ask** (ADR-030 rider: no queue asks a person to act on something a later capture pass or a `created_at`
repair resolves mechanically): when any item in the run was still undateable after steps 2-8, ONE
`integrity_flags` row for the WHOLE run is written ALREADY `status='resolved'` (category `data_quality`,
subject_type `system`, subject_ref `timeline-backfill`, the full undateable id list carried in
`recommended_actions[0].ids`), rather than one open row per item. Any PRIOR open `timeline-backfill` flag
(written before D17 family 12 landed, back when the undateable set got an open "manual research" ask) is
also resolved on every apply run, its `resolution_note` naming how many of its ids now carry a timeline
row (steps 7/8 dating them) versus how many remain genuinely undateable. `arg`, if given, resumes past a
prior run via `--after-id` (this step's own resumability flag, the same idiom `backfill-format-type.mjs` /
`retype-eu-decisions.mjs` already use); the script also accepts a local `--limit N` for a by-hand bounded
run (not exposed through this workflow's own `arg`, which only ever carries one value).

**Artifact / read back**: `summary.json` under `$OUT_ROOT/timeline-backfill/` (`counts.undated_total`,
`counts.by_step`, `counts.written`, `counts.undateable`, `counts.prior_flags_resolved`, `sample_by_step`,
`undateable_items`, `flag_written`, `prior_flags_resolved`). Confirm against
`scripts/verify/population-report.mjs`'s own "timeline coverage" entry: items without a row, excluding the
reported/flagged undateable set, trending toward 0 (with steps 7-8 live, this should now read at or near
zero on a live corpus).

**First dispatch** (coordinator): `mode=dry`, `step=timeline-backfill`, no `arg`, only AFTER a first
dispatch of `scripts/backfill-item-timelines.mjs` (a different script, run by hand or via a future
dedicated step) over the reg-family briefs carrying a timeline section, so this step's own undated count
reflects what genuinely remains.
