# Last proposer pass — forward-events

Per `PROPOSER-RUNBOOK.md` §2's attestation format. `forward-events` now has **two** artifacts
(`forward-events-run-001`, `forward-events-run-002`); F28's rule (d) requires this file to name the latest
verbatim: **forward-events-run-002**.

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
