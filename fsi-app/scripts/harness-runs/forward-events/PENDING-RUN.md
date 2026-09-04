# Pending run — forward-events

F28's staleness-coupling rule (rule (c), `.discipline/fitness/functions/F28-harness-run-integrity.mjs`)
fires when a family's governing files re-hash to something no valid artifact on record carries. This
marker is the honest acknowledgment that rule anticipates — written in the exact format
`parsePendingRunHash` reads (`harness_version at write time: `sha256:...``). The previous forward-events
marker was discharged by forward-events-run-034 (train 37); this is a fresh one for a single change.

**What changed:** 
Lane FWD-TEXT-4 (2026-09-04), fixing the ONE `item_forward_events` row FWD-TEXT-3 left behind (FWD-TEXT-3's and FE-SLOT-2's
own markers were discharged by forward-events-run-033/034 in train 37; this is a fresh marker).

THE DEFECT and its fix are documented in full in `extract-forward-events.mjs`'s own header ("RECORD-FACTS
TEMPLATE UNWRAP, RESIDUE") — not repeated here in full to avoid a fourth copy of the same measurements.
Summary [CONFIRMED, live SQL this lane, project `kwrsbpiseruzbfwjpvsp`, 2026-09-04, plus the real
`extractForwardEvents` code reproduced offline over the row's own live `content_md`]: after FWD-TEXT-3's own
fix landed (Maintenance #44 APPLY), exactly ONE row still displayed the raw record-facts template instead
of an unwrapped passage — id `4ab41812-cfb2-433c-a1be-077fd128d381`, `extractor_version` fe1-2026-09-04.3,
section `c4aae646-…`, `[operative_provision]`'s own quoted passage running long enough (320 chars from
marker to date) that `clauseStart`'s `DEFAULT_MAX_BEFORE` (300) never reached the marker at all — no
sentence/paragraph/list/marker boundary existed in range, so the last-resort whitespace fallback landed
right after the marker, producing `"…The captured source states, verbatim: «…"` (marker text absent) and
defeating `unwrapRecordFactsTemplate`'s `SLOT_MARKER_AT_RE.test` at position 0. This confirms the
coordinator's first hypothesis exactly (the leading-edge snap chose a boundary AFTER the marker) — refined
by measurement: not a nearer competing boundary beating the marker, but the marker sitting entirely outside
the 300-char look-back. The second hypothesis (date outside the «…» quote, or a defensive skip) did not
occur — `unwrapRecordFactsTemplate` never reached its quote-containment check at all.

**The ONE governing file this family names moved:**

- **`src/lib/forward-events/extract-forward-events.mjs`** — `EXTRACTOR_VERSION` bumped
  `fe1-2026-09-04.4` → `fe1-2026-09-04.5`. New `MAX_BEFORE_FOR_MARKER` (3000, comfortably above the largest
  live `record_facts` section measured — 2478 chars) constant and a second, marker-only backward scan in
  `clauseStart`: when the normal `maxBefore`-bounded scan finds no sentence/paragraph/list/marker boundary,
  a marker is looked for again over this wider bound before falling to the weaker clause/whitespace
  fallbacks. Only the marker gets the wider reach — the sentence/paragraph/list boundary scan stays bounded
  at `maxBefore` exactly as FWD-TEXT-2 calibrated it (a genuine run-on paragraph still cannot pull unrelated
  prior obligation language into a non-record-facts window); a marker's own narrow, hand-written shape
  (`SLOT_MARKER_AT_RE`) carries no such risk. `source_span`/`assertVerbatim` are unaffected.

**Explicitly NOT this family's governing file, and why (same posture as the discharged markers)**:
`src/lib/intake/record-facts.mjs` is unchanged — this fix is entirely on the consumer side, the extractor
reaching a marker it already receives but previously could not see. `scripts/harness-runs/forward-events/
PROTOCOL.md` is unchanged by this lane.

**Regression + negative fixtures**: `src/lib/forward-events/extract-forward-events.test.mjs`'s "FWD-TEXT-4
residue fix" describe block — (1) the live row above, reproduced verbatim from its own `content_md` (cited
SQL in that block's own header), now unwraps and carries none of the template tokens; (2) `item_forward_events`
id `0023163f-b057-419a-a2bf-62fe6b8c4b03` (a GAP-labelled sentence using "captured source" as ordinary
prose, no `[slot_key]` marker anywhere in it) reproduces its exact live `obligation_text`, unchanged; (3)
`section_claim_provenance` id `3c32b28e-9fb9-4c6a-8c9e-091c41ee86f4` (a FACT-labelled brief sentence, also
using "captured source" as ordinary prose, no date anywhere in its span) still produces zero events; (4) a
synthetic marker beyond even `MAX_BEFORE_FOR_MARKER` still falls back to the pre-existing honest-fragment
behaviour, never a crash and never a false unwrap.

**harness_version at write time:** `sha256:33060af6a9eccf42`

**The planned run that will supersede this marker:** the next `scripts/forward-events/run-extraction.mjs`
dispatch under this landed code (or the coordinator's next `population-turn`/`forward-events-retext` APPLY
pass, which calls the same extractor) — its own `forward-events-run-NNN.json` artifact (or, for the retext
step, the next Maintenance run) will record this hash as its `harness_version`, discharging this marker per
F28's reverse-audit (rule (c)): the marker is deleted the moment a valid artifact's recorded hash matches
the one above, or re-pinned to a new hash if a governing file moves again before that run lands.
