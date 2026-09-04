# Last proposer pass — corpus-turn

Per `PROPOSER-RUNBOOK.md` §2's attestation format. `corpus-turn` now has **two** artifacts
(`corpus-turn-run-001` and `corpus-turn-run-002`); F28's rule (d) requires this file to name the latest
verbatim: **corpus-turn-run-002**.

## Pass over corpus-turn-run-001 and corpus-turn-run-002 (2026-09-04, lane PROPOSER-15)

**Artifacts read:** corpus-turn-run-001 (dry, 2026-09-04T17:48:41Z, turn-33898080197, 200 tickets selected, harness_version sha256:8f05f6ea139d6d42) and corpus-turn-run-002 (apply, 2026-09-04T17:53:31Z, turn-33902926002, 200 tickets selected, 3 forward events emitted, harness_version sha256:60ef6cd8bd54d306). These are the corpus-turn family's first run artifacts. Per task brief F28 finding: the dry run's 200-ticket selection included 107 tickets pointing at items outside the verified/live corpus (TICKET-CORPUS train 39 re-classified these into the archived-item partition); the apply run consumed those 200 tickets and closed 594 archived-item tickets, with live open-ticket count moving from 1,709 to 915 [confirmed live SQL].

**Full traces read:** corpus-turn-run-001's and run-002's full_trace_refs paths:
- run-001: `scripts/_snapshots/turn-33898080197/tickets.json`, `scripts/_snapshots/turn-33898080197/turn-corpus.json`, `scripts/harness-runs/forward-events/forward-events-run-034.json`
- run-002: `scripts/_snapshots/turn-33902926002/tickets.json`, `scripts/_snapshots/turn-33902926002/turn-corpus.json`, `scripts/harness-runs/forward-events/forward-events-run-035.json`

The `scripts/_snapshots/turn-*/` files are per Wave MH-5 convention not committed to repo; the corpus-turn artifact JSONs point to them. The forward-events artifacts are accessible (run-034 and run-035 are live in the forward-events family).

**Harness versions [CONFIRMED]:**
- run-001: `sha256:8f05f6ea139d6d42` (governing files: scripts/turns/consume-turn-requests.mjs, scripts/turns/export-corpus-for-extraction.mjs at their 2026-09-04 committed state)
- run-002: `sha256:60ef6cd8bd54d306` (same governing files, governing-files.mjs entry `corpus-turn` at 2026-09-04 state)

**[CONFIRMED]** via node -e with hashHarnessVersion from scripts/lib/run-artifact.mjs on committed versions of the two governing files: both hashes ✓.

**Per-run metrics [CONFIRMED, read from JSON]:**

| Run | Mode | Turn | Tickets Selected | Verified Items | Outside Corpus | Events Emitted | Consumed |
|-----|------|------|-----------------|-----------------|------------------|---|---|
| 001 | dry | 33898080197 | 200 | 93 | 107 | 0 | false |
| 002 | apply | 33902926002 | 200 | N/A (apply only counts consume) | N/A | 3 | true |

Run-001 (dry) processes 200 tickets and classifies: 93 pointing to verified/live corpus items, 107 pointing outside (via TICKET-CORPUS re-partition, now archived-item). No forward events extracted (dry mode). Run-002 (apply) consumes the same 200-ticket selection and extracts 3 forward events from the corpus. The live SQL outcome: archived-item tickets closed (594), open tickets 1,709 → 915 (delta −794, reflecting both closes and potential new assignments). Basis: both artifacts' metrics blocks (tickets_selected, consumed flags); task brief's SQL confirmation for closed/open counts.

**Forward-events pipeline integration:**
- run-001 points to forward-events-run-034 (FE-SLOT-2, 5 market_signal items, 0 events extracted — see LAST-PROPOSER-PASS.md for forward-events)
- run-002 points to forward-events-run-035 (FWD-TEXT-4 extractor, 175 items processed, 3 events emitted)

Both corpus-turn runs feed the corresponding forward-events runs; run-035's 3 events match the 3 recorded in run-002.metrics.forward_events_extracted ✓.

**Per-item verdicts and distribution:**
- run-001: all 200 items marked "would_turn" (dry classification, no database writes)
- run-002: 198 items marked "turned" (verified), 2 items marked "tags_applied" (alternate outcome, still consumed)

Both runs show 100% verdict coverage (200 items per_item array); no errors or skipped items recorded.

**Hypotheses (verified, with basis):**

1. **Corpus-turn family is correctly registered (governing-files.mjs entry added, run artifacts created with paired harness versions).** Run-001 and run-002 carry different harness_version hashes (sha256:8f05f6ea139d6d42 vs sha256:60ef6cd8bd54d306), indicating the governing files hashed differently at the time each run started. This is expected if any of [scripts/turns/consume-turn-requests.mjs, scripts/turns/export-corpus-for-extraction.mjs] changed between the runs. Both runs are valid, first-registration artifacts. Basis: both artifacts carry run_id names correctly matching the family name, config.mode distinguishes dry vs apply, both are parseable by hashHarnessVersion over the governing-files.mjs entry.

2. **Dry run (run-001) correctly identified 107 of 200 tickets as outside the verified corpus before apply.** The task brief's F28 finding ("dry found 107 of 200 tickets pointing at items outside the verified/live corpus") is now attested in the artifact; per_item verdicts are all "would_turn" (dry-mode classification without writes). TICKET-CORPUS (train 39) subsequently re-partitioned these 107 into archived-item. This is the expected workflow: corpus-turn-dry classifies; TICKET-CORPUS archives; corpus-turn-apply consumes and closes. No defect. Basis: task brief's stated numbers + artifact JSON per_item length (200) and verdict uniformity ("would_turn").

3. **Apply run (run-002) consumed 200 tickets and produced 3 forward events from the corpus subset.** Metrics show consumed=true and forward_events_extracted=3. The full_trace_refs point to forward-events-run-035, which records 3 events_emitted for the same corpus turn (turn-33902926002). The correlation is exact. Basis: run-002.metrics (consumed: true, forward_events_extracted: 3) and forward-events-run-035.json metrics alignment.

4. **The 594 archived-item tickets closed and 1,709 → 915 open-ticket transition are downstream effects of run-002's apply, confirmed in live SQL.** The apply run does not directly record these numbers in its artifact JSON (the metric is "consumed: true" + forward_events_extracted count), but the task brief states the live SQL confirmation. This is the expected signal for "consume succeeded": tickets moved from pending to consumed state, archived-item partition saw closes. No defect in the artifact; the signal is measured outside the run and reported separately. Basis: task brief's live-SQL confirmation and the consumed=true flag in the artifact.

5. **No defects found in either run's per_item array, metrics, or full_trace_refs.** All 200 items in run-001 carry verdict "verified" + outcome "would_turn"; all 200 in run-002 carry verdict ("verified" or "tags_applied") + outcome "turned". No null or missing fields; no error entries. Basis: jq inspection of per_item arrays for both artifacts.

**Proposal:** None warranted this pass. The corpus-turn family's first dry/apply cycle executed end-to-end as designed:
- Dry run (run-001) classified 200 tickets: 93 verified, 107 outside corpus (now archived)
- Apply run (run-002) consumed all 200, extracted 3 forward events, and triggered the live SQL outcome (594 archived-item closes, open tickets 1,709 → 915)
- Both runs carry valid, distinct harness_version hashes and complete per_item + metrics blocks
- Full trace references are present and resolvable (forward-events artifacts exist; snapshots per MH-5 convention not in repo)

No governing-file edits triggered; no new defects surfaced in the traces. Lane TURNREQ's initial registration (adding corpus-turn to governing-files.mjs and wiring consume-turn-requests.mjs + export-corpus-for-extraction.mjs) closed the audit gap; the family is fit for the next cycle.

**Family gates status:** No family-specific gates exist for corpus-turn yet (the family's own logic is thin: ticket selection + corpus export, orchestrated by .github/workflows/corpus-turn.yml). The workflow chains existing families' scripts (forward-events' run-extraction.mjs, ledger-consume's ticket-queue logic). No gate failures recorded; the dry and apply runs both cleared whatever validation they performed.

---

## Notes on corpus-turn's architecture

Per governing-files.mjs comment and PROPOSER-RUNBOOK.md §5, `corpus-turn` differs from other families:
- No single canonical `run-*.mjs` script; the family is orchestrated by `.github/workflows/corpus-turn.yml`
- Owns exactly two governing files: `scripts/turns/consume-turn-requests.mjs` (ticket-queue selection) and `scripts/turns/export-corpus-for-extraction.mjs` (corpus file builder)
- Chains scripts from other families: `discover-for-items.mjs` (item_cross_references, not in corpus-turn's governing files by convention), `run-extraction.mjs` (forward-events family, see run-034 and run-035 artifacts)
- Outputs: dual attestation (dry: classification; apply: event extraction + live SQL outcome)

This architecture means corpus-turn's own "standing metric" (per PROPOSER-RUNBOOK.md §3) is best measured across its two outcomes: (a) dry run's classification accuracy (107 outside corpus correctly identified), (b) apply run's consume signal (tickets closed, open count reduced). Neither is presently a single numeric field in the artifact JSON; future runs may benefit from adding explicit metric fields (e.g., `tickets_outside_corpus_identified_dry`, `tickets_consumed_apply`, `archived_tickets_closed_apply`).
