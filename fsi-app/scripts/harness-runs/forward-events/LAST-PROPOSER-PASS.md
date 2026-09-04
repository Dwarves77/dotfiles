# Last proposer pass — forward-events

Per `PROPOSER-RUNBOOK.md` §2's attestation format. `forward-events` now has **five** artifacts
(`forward-events-run-001` … `forward-events-run-005`); F28's rule (d) requires this file to name the latest
verbatim: **forward-events-run-005**.

## Pass of 2026-09-03, evening (lane ARTIFACTS — forward-events-run-005: a governing-file change, a genuinely empty run)

**Artifact read:** forward-events-run-005 (corpus-turn run `33802504364`, apply, 2026-09-03T20:29:28Z,
since `2026-09-03T12:44:57Z`). Pushed to its own `turn/33802504364` branch (Actions PR-creation refused)
and landed here by cherry-pick; not previously on master. A sibling branch, `turn/33756943043`
(`forward-events-run-004`, since `1970-01-01`), was checked and found **already landed** — it is
`forward-events-run-004.json` in commit `f59b9a41` ("Flywheel turn: forward-events runs 003/004
landed…", already on `origin/master`); this pass does not re-land it.

**Governing-file change, confirmed, no `PENDING-RUN.md` needed:** run-005's `harness_version` is
`sha256:d47a10728a3cc799`, DIFFERENT from run-004's `sha256:0a36113e8e96ade5`. Re-hashing the family's
current governing files (`src/lib/forward-events/extract-forward-events.mjs`,
`scripts/harness-runs/forward-events/PROTOCOL.md`) against the live tree gives
`sha256:d47a10728a3cc799` — matches run-005 exactly, so F28 rule (c) is satisfied by the landed artifact
itself; no marker required. The change is `git log`-traceable to commit `82f70e2f` ("FE-SLOT: due_date
slot claims classified without kind assumption, slot_date_unclassified skip, by_skip_reason metrics"),
already on master before this lane started — this is the previous proposer pass's **proposal 1**
("Offer the slot FACT's span to the extractor") and part of **proposal 2** (`by_skip_reason` in metrics)
landing, read back here as the metric this pass exists to check moved.

**What the artifact shows [CONFIRMED, read from the JSON]:** `items_processed: 0, items_with_events: 0,
events_emitted: 0, skips: 0` — every count in `metrics` is zero, `per_item` is empty (0 entries),
`by_skip_reason: {}`. This is a genuinely empty run, not a truncated or lossy one: `full_trace_refs`
names three files under `scripts/_snapshots/turn-33802504364/` and all three exist in this landing
(`turn-corpus.json`, `.events.json`, `.skipped.json`). **Basis for "genuinely empty, not a defect":**
this turn's `since` marker is `2026-09-03T12:44:57Z` (the previous turn's own recorded timestamp) and
its own `started_at` is `20:29:28Z` — a roughly 7.75-hour window. The day's two population applies that
minted new record-grade items (`population-33804773824`, `population-33806554326`) both landed AFTER
this turn ran (21:02Z and 21:21Z respectively, per their own artifacts' `started_at`), so the corpus-turn
exporter's "verified items with no forward-event row, created since the marker" selection legitimately
found nothing: no new items existed in that window yet. Skip-reason histogram is `{}` for the same
reason — there was nothing to skip, not a broken histogram.

**Hypotheses (verified, with basis):**
1. **A zero-item run is the honest result of dispatch ordering, not a family defect.** See above; this
   pass does not treat `by_skip_reason: {}` as evidence proposal 2 failed to land — it landed (the key is
   present in the schema and would populate on the next non-empty run), it simply has nothing to report
   this run.
2. **`extractor_version` bumped to `fe1-2026-09-03.1`** (from `fe1-2026-09-01.1` in prior artifacts),
   confirming the extractor's code changed in a way the family's own versioning convention tracks, ahead
   of `harness_version` reflecting the same change — the two signals agree.
3. **The next corpus-turn dispatch (after the day's two population slices) is the actual measurement of
   whether FE-SLOT's due_date-span change moved the family's standing metric** (extraction precision /
   coverage, `CONVENTION.md`'s "forward-events's standing metric"). This run cannot show that — it had no
   items to extract from — so this pass records the metric as **not yet measurable at the new hash**,
   rather than defaulting it to zero or silently carrying forward run-004's pre-change numbers as if they
   still applied.

**Proposal:** none warranted from this pass alone — the FE-SLOT proposal from the prior pass is already
landed and this run's zero counts are explained, not concerning. The real next step is procedural, not
code: **dispatch corpus-turn again after (not interleaved with) the day's population applies**, so the
next `forward-events-run-006` actually exercises the FE-SLOT change against real record-grade items and
this family's standing metric becomes measurable at `sha256:d47a10728a3cc799`. That dispatch is outside
this lane's access (no live Actions dispatch here).

**`PENDING-RUN.md` discharged, per F28 rule (c):** lane FE-SLOT's own marker recorded
`harness_version at write time: sha256:d47a10728a3cc799`, naming "the next corpus-turn apply" as the
run that would supersede it. run-005 IS that run and its `harness_version` matches exactly — F28's
reverse-audit rule says the marker is deleted the moment a landed artifact's hash matches what it
anticipated, so `forward-events/PENDING-RUN.md` is deleted in this landing (confirmed by re-running
`node .discipline/fitness/runner.mjs`: F28 flagged it stale before the deletion, clean after).

**Family gates status:** this landing adds one run artifact, deletes the now-stale `PENDING-RUN.md`, and
adds this attestation; the governing-file change it records (`82f70e2f`, FE-SLOT) was already landed on
master before this lane started — this pass reads and attests to it, it does not author it.

## Pass of 2026-09-03, midday (forward-events-run-003 and -004 — the turn after the first limit-200 population slice)

**Artifacts read:** forward-events-run-003 (corpus-turn run 33658489880, apply, 2026-09-02T17:02Z,
since `2026-09-01T22:26:28Z`: 53 processed, 1 item with events, 2 events, 2 skips) and
forward-events-run-004 (corpus-turn run 33756943043, apply, 2026-09-03T12:45Z, since `1970-01-01`:
481 processed, 21 items with events, 70 events, 298 skips; by_kind compliance_deadline 52 /
entry_into_force 14 / review_or_report 4; by_confidence high 35 / medium 35; every event day-precise),
both at `harness_version sha256:0a36113e8e96ade5` (unchanged since run-002, so no PENDING-RUN marker
was owed). Run-003 sat unlanded on its `turn/` branch for a day (the repository refuses PR creation, so
each turn pushes a branch and nothing lands it until a coordinator does); run-004's numbering came from
the workflow's sibling-branch hydration guard, which is that guard doing its job. Both land here.

**Full traces read:** run-004's `turn-corpus.json`, `.events.json`, `.skipped.json` under
`scripts/_snapshots/turn-33756943043/` on the pushed branch (the fix from the previous pass held: the
traces survived the runner this time); the same corpus turn's discover step (5,460 edges across 506/619
targets, 5,455 rows written: 3,449 new, 2,006 refreshed, 5 skipped as entity/semantic-owned, 0 chunk
failures) and analyze step (18 themes, 19 gaps: 3 opened / 2 resolved / 16 unchanged; 7 anticipate
targets unchanged; 930 signal candidates: 694 flags opened / 147 resolved / 236 unchanged); the live
`item_forward_events` (903 → 973), `item_cross_references` (6,059 rows, 5,993 discovery-origin), and
`integrity_flags` (930 open signal flags, 2,416 open in total) tables; the same day's population
apply-ready payloads (`scripts/_snapshots/population-33749140151/census-rows.apply-ready.json`).

**Hypotheses (verified, with basis):**
1. **The yield on record-grade items is one tenth of the yield on brief-grade items, and that is the
   input, not the extractor.** 17 of run-004's 21 event-bearing items are the day's 177 record-grade
   mints (read back by id against `created_at`); 17/177 = 9.6%, against run-001's 137/322 = 43% on
   LLM-brief items. A record-grade payload carries 5–6 claims and 3 sections, and the applied batch's
   claims are 712 GAP to 416 FACT; the extractor reads `claim_text` and `content_md` only
   (`src/lib/forward-events/read-and-extract.mjs` lines 32–35), so an item whose facts are mostly
   "the source does not state" has little to extract. Not a defect; a ceiling set upstream.
2. **A grounded date the mint already holds is invisible to this family.** 48 of the 178 payloads carry
   `item.due_date` (16 day-precise, 2 month, 2 year, 28 with no precision recorded), located verbatim by
   `record-facts.mjs` (MINT-RUNBOOK §13). `read-and-extract.mjs`, `export-corpus-for-extraction.mjs` and
   `run-extraction.mjs` contain no reference to `due_date` or `date_precision` (grep, all three). So the
   same date is derived twice by two regexes, or once and then missed. The slot is deliberately untyped
   ("locates A date, not which of the four it is", MINT-RUNBOOK §13), so it cannot be written as a
   `compliance_deadline` event by assumption; but its grounding span can be offered to the extractor as
   input text, and the extractor's own kind classifier decides. Proposal 1.
3. **No new item is isolated after the turn.** All 177 mints carry at least one edge (4,222 edge rows
   touch them) despite empty connection-signature tags, because `shared_source` and jurisdiction bases
   still score. What they cannot score is `shared_scenario` / `shared_compliance_object` /
   `shared_jurisdiction_topic`, which is the tag pipeline's job (MAINT `tag-proposals`, landed today).
4. **Run-003's 53 / 1 / 2 is the previous pass's hypothesis 2 observed again**: the turn re-processes the
   no-event set every time, and a `since` marker only narrows it to items created after the marker.
   `by_skip_reason` (previous pass, proposal 1) is still not in the artifact's metrics; the 298 skip
   reasons of run-004 live only in the snapshot's `.skipped.json`.

**Proposal (scoped, NOT implemented in this landing):**
1. **Offer the slot FACT's span to the extractor.** In `read-and-extract.mjs`, when the item row carries
   `due_date`, append the `source_span` of the FACT claim whose `slot_key` is `due_date` to the text
   candidates (it is already a claim, so this may reduce to ensuring slot FACTs are not filtered out
   before extraction; read `readAndExtractForwardEvents`'s claim filter first). One derivation, the
   extractor's classifier decides the kind, `date_precision` from the slot is carried when the
   extractor's own precision is coarser. Governing-file change; PENDING-RUN re-stamp.
2. `by_skip_reason` in metrics (carried forward from the previous pass).
3. The turn branch has no landing path of its own; a coordinator lands it. Until the repository's
   PR-creation setting changes, the runbook should say so where it says "PR".

**Family gates status:** this landing adds two run artifacts and this attestation; no governing-file
change (`harness_version` of runs 003/004 matches the current tree).

## Pass of 2026-09-01 (forward-events-run-001, -002) — retained verbatim

**Artifacts read:** forward-events-run-001 (the external scratch-script run, 322 items, 902 events,
137 items with events) and forward-events-run-002 (the first run through the family's own versioned
runner, `scripts/forward-events/run-extraction.mjs`, driven by the corpus-turn GitHub Actions workflow,
run 33566259450, 2026-09-01T22:26:32Z, `harness_version sha256:0a36113e8e96ade5`).

**Full traces read:** run-002's `full_trace_refs` name `/tmp/turn-corpus.json`,
`/tmp/turn-corpus.events.json`, `/tmp/turn-corpus.skipped.json` on the Actions runner that produced them.
**Those files no longer exist** — the runner is ephemeral and the workflow only retained
`scripts/_snapshots/`. The 276 skip reasons run-002 recorded were therefore NOT readable from the repo.
This is defect 2 below; the workflow was changed in the same landing so no future run loses them.

**Hypotheses (verified, with basis):**
1. **Run-002's `0 events / 185 items / 276 skips` is the correct result, not a defect.** The corpus-turn
   exporter (`scripts/turns/export-corpus-for-extraction.mjs`) selects live verified items with NO
   `item_forward_events` row. Run-001 processed all 322 live items and 137 produced ≥1 event;
   322 − 137 = 185, exactly the set run-002 received. Those 185 produced 0 events in run-001 as well (their
   share of its 834 skips); the same pure extractor at the same `EXTRACTOR_VERSION` (`fe1-2026-09-01.1`)
   over the same text returns the same answer. Basis: read both artifacts' metrics and the exporter's
   selection query; the exporter's `{claim_id, kind, text, span}` / `{section_id, key, md}` mapping was
   checked field-for-field against `src/lib/forward-events/read-and-extract.mjs`, the live per-item reader.
   The coordinator first reported this as "a shape mismatch" to the operator before reading run-001; that
   was an inference presented as a finding and was corrected on the record (session-log Addendum 82).
2. **Every corpus turn re-processes the no-event set.** The exporter's "lacks any forward-event row"
   scope is by construction the set of items the extractor already found nothing in, plus any genuinely
   new items. At today's corpus that is 185 items at $0 and 0 seconds; it becomes a real cost only if the
   no-event set grows large, and it is the honest behavior (a text edited since the last turn can gain a
   date). No change proposed; recorded so the next pass does not "discover" it again.
3. **Defect (workflow, fixed this landing): full traces on `/tmp`.** `corpus-turn.yml` now writes the
   corpus file and run-extraction's events/skipped outputs under `scripts/_snapshots/turn-<run_id>/`,
   which the workflow's existing upload-artifact step retains for 90 days, so `full_trace_refs` of every
   future artifact resolve to a retained file.
4. **Defect (family artifact, fixed this landing): a raw NUL byte in `apply-extraction-output.mjs`'s
   `dedupeKey` separator** made `grep` treat the load-half script as binary. Replaced with the escape
   `"\u0000"` — same runtime value, text source. No key changed; run-002 loaded 0 rows so no row was ever
   keyed by it in production before the fix.

**Proposal (scoped, NOT implemented in this landing):**
1. **Skip-reason histogram in the artifact's metrics** (`by_skip_reason`, alongside `by_kind`): the
   extractor already returns a `reason` per skip, and run-001's 834 / run-002's 276 skips are the family's
   only signal about where the rule table under-reaches (e.g. "'as of' marks a data-unavailability note").
   A histogram in `metrics` makes the next proposer pass readable from the artifact alone, even if a
   trace file is lost again. One `runExtraction()` change plus a test; bumps no `EXTRACTOR_VERSION`.
2. **Reconcile the two runs' `per_item` shapes.** Run-001 carries a single per_item entry (the scratch
   script summarised the whole corpus as one row); run-002 carries one per item (185). CONVENTION.md's
   per_item contract is per unit of work; run-001 is grandfathered as the external-script run its own
   `proposer_notes` describe, and no rewrite of a landed artifact is proposed.

**Family gates status:** this landing deletes `forward-events/PENDING-RUN.md` (run-002's
`harness_version` matches the current tree, so F28's reverse-audit says the planned run happened) and
adds this attestation. No governing-file change; `EXTRACTOR_VERSION` unchanged.
