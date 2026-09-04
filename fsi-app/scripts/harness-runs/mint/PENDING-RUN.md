# Pending run — mint

F28's staleness-coupling rule (rule (c), `.discipline/fitness/functions/F28-harness-run-integrity.mjs`)
fires when a family's governing files re-hash to something no valid artifact on record carries. This
marker is the honest acknowledgment that rule anticipates — written in the exact format
`parsePendingRunHash` reads (`harness_version at write time: `sha256:...``).

**What changed:** lane URL-BOILER (2026-09-04), diagnosing why row `a980a0b9` (UK "The Motor Fuel
(Composition and Content) (Amendment) Regulations 2012", legislation.gov.uk/uksi/2012/2567) and row
`429c85d2` (UK "The Renewable Transport Fuel Obligations (Amendment) Order 2013",
legislation.gov.uk/uksi/2013/816) both still failed criterion 2 `ungrounded_url` on population runs
#17/#18 (mint-run-020/021) — this time on the FULL, correctly-untruncated URL
`http://eur-lex.europa.eu` (lane URL-GUIL's postscript-18 fix had already landed the URL-safe trigger
continuation and migration 300's guillemet exclusion; both rows measured against
`census-rows.mint-batch-report.json` on branches `population/33823467586` /
`population/33821410389` confirmed only the ONE `ungrounded_url` failure remained, for each row).

Root cause [CONFIRMED, read + live]: both rows' captured `explanatory note` text carries the identical
UK-legislation boilerplate — "...may be viewed in the Official Journal of the European Union via the
EUR-Lex website at http://eur-lex.europa.eu ..." — a sentence that tells the reader WHERE to go look up
EU law in general, not a statement of this instrument's own jurisdictional scope. Its only URL is the
bare EUR-Lex root with no path. Investigated and ruled out as a criterion-2/canonicalizer defect: read
migration 150 in full and confirmed live via the Supabase MCP that the one registered EUR-Lex source is
`https://eur-lex.europa.eu/` (base_tier 1, active) — a DIFFERENT scheme than the cited `http://` form —
and `canonicalize_citation_url` never normalizes http vs https (only lowercase / `www.` / trailing-junk,
per its own header and MINT-RUNBOOK.md §3's "only forgives www./trailing-slash/markdown-emphasis
differences, nothing else"); widening it now would be a much broader, unrequested change to what every
citation on the live site grounds against, to fix a citation that carried no fact worth grounding in the
first place. `canonicalize-citation-url.mjs` and `url-canon.mjs` (the two other homes of this function)
are therefore UNCHANGED — no migration 301 is written, and none is needed.

One governing file moved:

- `src/lib/intake/record-facts.mjs` — new bare-domain-URL span guard, wired into the shared `isProseSpan`
  every slot/binding-position/due-date extractor already calls: a located span whose only `https?://` URL
  resolves (via the WHATWG `URL` parser) to an empty/`/` path with no query/hash is rejected the same way
  a page-chrome menu line already was — a "see the website at http://example.org" pointer is not a
  citation and states no fact the slot needs. `findSlotSpan` keeps walking every remaining trigger match
  (unchanged behavior), so a document with a genuine scope/deadline/etc. statement elsewhere still finds
  it; both named rows have no other `jurisdictional_scope` trigger match at all (measured against their
  real `captured_text`), so `jurisdictional_scope` now honestly resolves GAP for both, which clears
  criterion 2 (the URL never reaches any section's `content_md`). A span whose URL carries a real
  path/query (an actual document citation) is untouched. `RECORD_FACTS_VERSION` bumped
  `rf1-2026-09-03.1` → `rf1-2026-09-04.1`.

`scripts/mint/validate-mint-payload.mjs` itself was NOT changed (its criterion-2 URL_RE/canonicalize
logic is unmodified — the investigation confirmed it is already correct per its documented contract);
only its test file gained coverage pinning the http/https non-normalization finding, which is not a
governing-file change.

**harness_version at write time (superseded below — see "What changed (2)"):** `sha256:8712c28763b44ff2`

**The planned run that superseded THAT marker:** the next `population-turn` dispatch (dry, then apply)
under that landed code — its `mint-batch-report.json` would show rows `429c85d2` and `a980a0b9` (and any
sibling UK-SI row carrying the identical EUR-Lex-website boilerplate) clearing criterion 2, with
`jurisdictional_scope` recorded as GAP rather than a bare-domain-cited FACT. The coordinator's
`scripts/mint/reopen-validation-holds.mjs --reason-contains ungrounded_url` is the re-admission path for
the two rows already held from runs #17/#18, per MINT-RUNBOOK.md §11's "Validation-failed hold-back"
section. That run has not yet landed, so this marker is superseded (rule (c): a new governing-file edit
below moved the hash again) rather than deleted — the next `population-turn` run under the CURRENT hash
covers both this entry and the one below.

---

**What changed (2):** lane TANDEM (2026-09-04), closing THE DEFECT [CONFIRMED]:
`.github/workflows/population-turn.yml` used to end after `apply-mint-batch.mjs` plus an unconditional
`propose-tags.mjs --dry` preview — `MINT-RUNBOOK.md` §8 ("MANDATORY, post-apply — the flywheel":
discovery, forward-event extraction, recluster, IN ORDER before a batch is closed) and §9 (`--outcomes`
enrichment: `edges_discovered`, `forward_events_extracted`, `isolated_items` written back into
`mint-run-NNN.json`) were documented as a separate, hand-run coordinator pass that nothing in the runtime
ever triggered. Population runs #15-#20 (2026-09-03/04, ~650 items, mint-run-017..022) were applied with
no flywheel pass and no outcomes: every one of those items carries zero `item_cross_references`, zero
`item_forward_events`, no obligations, no tags, no signals. Operator ruling (2026-09-04), verbatim:
"there is no thing within this entire build that works on its own ever... Everything works together,
that's the purpose of the flywheel and the harness." A runtime that ends without triggering its
downstream is a defect in the runtime, not a note for a coordinator.

Only `scripts/mint/MINT-RUNBOOK.md` moved among this family's `GOVERNING_FILES` (§8/§9 rewritten to state
the flywheel is run by `.github/workflows/population-turn.yml` itself via the new
`scripts/turns/run-population-flywheel.mjs`, and that the coordinator's job on §8/§9 is now to read the
outcomes rather than hand-run discovery/extraction/tagging). `scripts/mint/validate-mint-payload.mjs`,
`payload-schema.json`, `item-type-required-slots.json`, and the three `scripts/mint/lib/*.mjs` files are
UNCHANGED by this lane — this lane's write set explicitly excluded touching any of them.
`run-population-flywheel.mjs` itself is a NEW file under `scripts/turns/`, not a mint `GOVERNING_FILES`
entry, so it does not affect this hash; it reuses (imports/invokes, never re-implements) the mint,
connections, forward-events, and maintenance families' own existing scripts and exported functions.
`run-mint-batch.mjs` was not modified either — its existing `--outcomes` path (§9) already had no
dry/preview mode (it always writes), so the new driver simply never calls it in dry mode; no new flag was
needed.

**harness_version at that write time (superseded below — see "What changed (3)"):** `sha256:bff28600696d162f`

**The planned run that superseded THAT marker:** the next `population-turn` dispatch (dry, then apply)
under this landed code — a `dry` dispatch exercises the full flywheel plan without writing (see
`run-population-flywheel.mjs --mode dry`'s own step list), and the following `apply` dispatch's
`mint-run-NNN.json` will carry a populated `metrics` block with all three §9 keys, closing THE DEFECT for
that batch. Per F28's reverse-audit, this marker is deleted the moment that artifact lands and its
`harness_version` matches the hash above (or re-pinned to a new hash, per rule (c), if a governing file
changes again before that run lands).

---

## Lane HOLLOW-GATE (2026-09-04) — three more governing files moved

**What changed (3):** lane HOLLOW-GATE (2026-09-04). The operator reported record-grade items shipping with no details ("this is
unacceptable"). [CONFIRMED, Supabase] Of 1,230 live verified record-grade items, 551 carried ONLY the
`[title]` FACT (350 with a real title FACT, 201 with none) and 115 carried exactly one substantive fact
beyond the title — traced example CELEX `31999D0823` (`8670d8bf-9847-4da6-8724-0d52308b008e`), 17,022 chars
of real EUR-Lex text, zero extracted facts. Root cause: 375 of the 551 EUR-Lex-sourced hollow items are
`item_type = "initiative"` (CELEX 'D'-letter decisions mapped to the market-signal required-slots shape),
for which `record-facts.mjs` had no `SLOT_TRIGGERS` at all — every required slot was always a templated GAP,
and criterion 5 never noticed because a GAP claim satisfies "required slot present" exactly as well as a
FACT. Full root-cause detail, the fix, and the measured yield are in MINT-RUNBOOK.md §13's new
"The hollow-record fix and the EU-act self-description slots" subsection (that edit is itself one of the
governing-file changes below).

Governing files moved (see MINT-RUNBOOK.md §13/§5 for the full narrative; this section only enumerates
what changed and why it is a real behavior change, not prose-only):

- **`src/lib/intake/record-facts.mjs`** — five new ADDITIVE, always-attempted EU-act self-description
  claims (`operative_provision`, `addressee`, `confirmed_measure`, `in_force_status`, `effective_date` —
  `EU_ACT_SLOT_KEYS`), gated on `isEurlexHost(sourceUrl)`, never on `item_type`; a new `HTML_TAG_FRAGMENT`
  guard in `isProseSpan` (protects the new triggers, and every existing one, from a raw-HTML capture
  embedding tag soup in a "verbatim" span — confirmed live shape, CELEX `32011L0015`); `RECORD_FACTS_VERSION`
  bumped `rf1-2026-09-04.1` → `rf1-2026-09-04.2`.
- **`scripts/mint/validate-mint-payload.mjs`** — new `criterion: 5, reason: "record_hollow"` kit-only check
  (a grade='record' payload whose only FACT is `[title]` now fails, independent of and additive to the
  pre-existing `missing_required_slot` check); new `VALIDATE_MINT_PAYLOAD_KIT_VERSION = "vmp-2026-09-04.1"`.
- **`scripts/mint/MINT-RUNBOOK.md`** — §5 documents `record_hollow` and `not_in_force`; §13 documents the
  EU-act extraction, the in-force screen, and the measured yield (11/12 = 92% of a fresh real-capture
  sample now clear the hollow gate; see §13 for the full number and the one known miss, a pre-existing
  `hasOnlyBareDomainUrls` false-negative, left unfixed and reported rather than risked).

(`scripts/mint/export-census-rows.mjs`'s new `detectNotInForce`/`buildExportRow` wiring — build
requirement 3, the in-force screen — is NOT a mint-family governing file per `GOVERNING_FILES` above, so it
does not move this hash; it is documented in MINT-RUNBOOK.md §13 alongside the rest of this lane's work.)

**harness_version at HOLLOW-GATE's own write time (its worktree lacked TANDEM's §8/§9 text):** `sha256:51d3ea4aca96c186`

**harness_version at the first train/wave16 assembly (superseded below):** `sha256:aa69a655c0264d6a`

**What changed (4):** the gate's first CI run (PR #563) failed three existing consumer tests of the kit:
the six oil-bulletin `market_signal` payloads (both the R-D batch builder and the `--propose-items`
draft) and the research record builder's all-GAP case. `validate-mint-payload.mjs` now exempts a
`market_signal` payload whose `instrument_identifier` is a registered implemented series key
(`src/lib/market/series-registry.mjs`): its substance is the `market_series` rows, not FACT claims.
`propose-series-items.mjs` now sets `instrumentIdentifier` to the series key like the batch builder
does. The research all-GAP case is now asserted REFUSED (operator ruling 2026-09-04).

**harness_version at train/wave16's landed write time (superseded below — see "What changed (5)"):** `sha256:f50d5fd4ee2f925f` (train/wave16 final: the exemption above on top of
TANDEM's §8/§9 runbook text and HOLLOW-GATE's kit/extractor edits; each lane's own hash above is history)

## Lane BOILER-2 (2026-09-04) — the three defects HOLLOW-GATE named and did not fix, closed

**What changed (5):** lane BOILER-2 (2026-09-04), closing all three defects HOLLOW-GATE's own report named
and explicitly left unfixed (its "Named residual" and "Two adjacent defects reported" — see this marker's
"What changed (3)" entry above and MINT-RUNBOOK.md §13's new subsection, which carries the full narrative;
this entry only enumerates what changed and why each is a real behavior change).

[CONFIRMED, Supabase, 2026-09-04] all three evidenced against real captured text, never invented shapes:

1. **The bare-domain-URL guard (`hasOnlyBareDomainUrls`, wired into `isProseSpan`) was global, not
   slot-scoped**, so it wrongly disqualified item `20feed6b`'s real CELEX `32012D0706(01)`
   `operative_provision` FACT ("HAS DECIDED AS FOLLOWS: Sole Article The link http://www.pvt-tec.de under
   the sub-heading ... shall be deleted") merely because that clause happens to mention a bare domain.
   `isProseSpan(span, { slotKey })` now runs the guard only for a slot in the new `URL_BEARING_SLOTS`
   (currently `{jurisdictional_scope}` — the one slot whose whole point is "where does the source point the
   reader", so a bare pointer really is disqualifying there); every pre-existing call to
   `isProseSpan(span)` with no `slotKey` keeps the original always-on behavior, so nothing regresses. Proven
   both ways against real captures: `32012D0706(01)`'s `operative_provision` now resolves FACT (was GAP);
   rows `429c85d2`/`a980a0b9`'s `jurisdictional_scope` still refuse to GAP (unchanged).
2. **`jurisdictional_scope`'s continuation window stopped at a numbered-list item's own "N." marker**,
   reading its period as a sentence end. Real capture, CELEX `31976H0495`: "HEREBY RECOMMENDS TO THE MEMBER
   STATES: 1. that, with a view to..." truncated to the 2-word, `MIN_SPAN_WORDS`-rejected span "MEMBER
   STATES: 1", falling to GAP. Fixed with the SAME URL-safe-continuation technique URL-GUIL introduced for a
   URL's own domain dots: a 1-2 digit list-item marker is now consumed as one atomic alternative in
   `jurisdictional_scope`'s four trigger continuations, applied ONLY to that slot (the one HOLLOW-GATE
   evidenced).
3. **"Cellar garbled metadata captures"** — two live rows (CELEX `21976A0216(03)`, `32006R1907`/REACH),
   both minted by THIS pipeline's own exporter, carry ONLY Cellar's own RDF/document-conversion-provenance
   fingerprint (`cdm:CDM_2.1.7 tdm:1523 xslt:3945 saxon:... metaconvJar:... builddate:...`) as their entire
   `captured_text` — never the act's own body. A capture-path defect (`export-census-rows.mjs`'s Cellar
   handling), not an extractor defect. Fixed with a new structurally-anchored detector,
   `detectCellarGarbledMetadata` (same convention as `detectNotInForce`): wired into
   `envelopeFromCaptureDocument`'s `usable` gate (a fresh garbled Cellar response now falls through to the
   pre-existing EUR-Lex fallback, the same retry path a too-short/bot-gated response already triggers) AND
   into `buildExportRow` right after the pre-existing `capture_too_short` check (catches an
   `existingCaptureByUrl` DB-cached garbled row too, which bypasses the `usable` gate entirely), holding
   `capture_garbled_metadata` with the evidence span rather than letting it mint hollow with wrong evidence.

Two governing files moved: `src/lib/intake/record-facts.mjs` (defects 1/2 — `RECORD_FACTS_VERSION`
`rf1-2026-09-04.2` → `rf1-2026-09-04.3`) and `scripts/mint/MINT-RUNBOOK.md` (this marker's own narrative,
§13's new subsection documenting all three). `scripts/mint/export-census-rows.mjs` (defect 3's fix) is NOT
a mint-family `GOVERNING_FILES` entry, so it does not move this hash. `scripts/mint/validate-mint-payload.mjs`
was investigated and found to carry NO duplicate of the bare-domain-URL guard or either other defect's
logic — UNCHANGED by this lane, per this lane's own task instruction to touch it only if the same guard
were duplicated there. `item-type-required-slots.json` and the three `scripts/mint/lib/*.mjs` files are
likewise UNCHANGED.

**harness_version at BOILER-2's own write time (its worktree predates the series-backed exemption):** `sha256:45f466a329448e44`

**harness_version at train/wave17's write time (superseded below):** `sha256:2885d372e53e4769` (train/wave17: BOILER-2 on top of the landed wave16 kit)

**The planned run that supersedes THAT marker:** the next `population-turn` dispatch (dry, then apply)
under that landed code — its `mint-batch-report.json` should show CELEX `32012D0706(01)`-shaped rows
(a genuine operative-provision clause mentioning a bare domain) now minting a substantive `operative_provision`
FACT instead of GAP; CELEX 'H'-recommendation rows (like `31976H0495`'s shape) now minting a substantive
`jurisdictional_scope` FACT where the source states one via a numbered clause; and any row whose Cellar
capture is this RDF-fingerprint shape now held `capture_garbled_metadata` (or re-minted with real EUR-Lex
fallback text) rather than shipping hollow. That run has not yet landed, so this marker is superseded (rule
(c): a new governing-file edit below moved the hash again) rather than deleted — the next `population-turn`
run under the CURRENT hash covers both this entry and the one below.

---

## Lane HEAL-7 (2026-09-04) — criterion 3's authority floor becomes a rating, not a refusal

**What changed (6):** lane HEAL-7 (2026-09-04), building THE RULING [CONFIRMED, operator, 2026-09-04,
verbatim]: "get the source. then rate the source. it's that simple. this isn't hard, find the source and
then publish the data on the site." `scripts/mint/validate-mint-payload.mjs` moved: its criterion-3
authority-floor check (`fact_below_authority_floor`) no longer pushes to `failures` (so it never affects
`valid`/`recommended_status`) — it accumulates into a new `warnings.claims` array instead (`warnings:
{below_floor_facts, claims}`), mirroring migration 302's own DB-side `v_result.warnings` byte-for-byte.
`fact_missing_source_span` / `fact_span_not_in_source` / `fact_mint_hold` are UNCHANGED — the ruling
overrules the refusal half of the floor, never the grounding requirement; an ungrounded claim still
quarantines. `VALIDATE_MINT_PAYLOAD_KIT_VERSION` bumped `vmp-2026-09-04.1` → `vmp-2026-09-04.2`.

Migration 302 (`fsi-app/supabase/migrations/302_criterion3_rating_not_refusal.sql`, written this lane, NOT
applied — no DB write credential in this lane, Supabase MCP is read-only here) is the DB-side twin: an
in-place patch of `validate_item_provenance` so the kit and the function agree on what blocks. No other
mint `GOVERNING_FILES` entry moved — `MINT-RUNBOOK.md`, `payload-schema.json`,
`item-type-required-slots.json`, and the three `scripts/mint/lib/*.mjs` files are UNCHANGED by this lane.

**harness_version at HEAL-7's write time (superseded below — see "What changed (7)"):** `sha256:02be5e03486540f3`

**The planned run that supersedes THIS marker:** the next `population-turn` dispatch (dry, then apply)
under this landed code, AFTER the coordinator applies migration 302 — its `mint-batch-report.json` should
show a below-floor-tier FACT (a genuinely span-grounded claim whose source tier exceeds its item-type
floor) recorded in `warnings.below_floor_facts` rather than in `failures`, clearing to `verified` on tier
alone when nothing else is wrong with it. Per F28's reverse-audit, this marker is deleted the moment that
artifact lands and its `harness_version` matches the hash above (or re-pinned to a new hash, per rule (c),
if a governing file changes again before that run lands).
**What changed (7):** lane TANDEM-2 (2026-09-04), closing two defects the coordinator found reading
BOILER-2's own landed code (never reported by any lane, never a hand-off) [CONFIRMED]:

1. **THE GATE (`checkPriorSliceConnected`, wired into `run-population-flywheel.mjs --check-gate`) read
   only the SINGLE newest mint-run artifact** (`readRunHistory(dir).runs.at(-1)`, sorted by
   `started_at`). mint-run-023 — the `rows_file` dry preview of the six-row EU Weekly Oil Bulletin batch,
   ruling R-D (`MINT-RUNBOOK.md`'s §11 addendum; `docs/runbooks/POPULATION-TURN-RUNBOOK.md`'s
   "Dispatching the oil-bulletin batch" section) — is a DRY artifact (`metrics.minted` absent; every
   `per_item` outcome is `apply_ready`, nothing minted) and landed newest by `started_at`
   (`2026-09-04T01:41:32.029Z`), so the gate read ONLY it, reported "nothing was minted by this slice,"
   and would have let a NEW apply through — while mint-run-017 through mint-run-022 (six apply artifacts;
   run ids `33804773824`, `33806554326`, `33817563729`, `33821410389`, `33823467586`, `33825867992`; read
   directly under `fsi-app/scripts/harness-runs/mint/`) still carried none of the three §9 outcome keys.
   **Measured directly from those six artifacts' own `metrics.minted` this session: 177+168+156+152+141+140
   = 934 minted items** (prior notes, including this marker's own earlier entries and
   `run-population-flywheel.mjs`'s original header, approximated this "~650" — 934 is the precise,
   re-measured count). Any dry run reset the gate to a false green; CLAUDE.md standing rule 17 ("a mint is
   closed only when the flywheel has connected it and the harness recorded the outcome") was silently
   unenforced for six consecutive apply batches. Fixed: new `checkAllSlicesConnected` scans EVERY artifact
   `readRunHistory` returns, reusing `checkPriorSliceConnected`'s own per-artifact verdict (a dry
   artifact — `metrics.minted` absent/0 — still never counts on its own; it just no longer masks a stale
   artifact elsewhere in the list); `--check-gate`'s CLI now calls it over `runs`, not `runs.at(-1)`.
2. **There was no dispatchable way to connect the six-artifact backlog THE GATE now correctly refuses.**
   `run-population-flywheel.mjs` only ever ran `--mint-run <artifact>` over ONE artifact's own
   newly-minted ids; `population-turn.yml` only ever called it for the run's own new batch. Fixed: new
   `--backlog --mode dry|apply [--max-artifacts N]` (default 2 — see that script's own header, "COST
   PROJECTION," for the [INFERRED] per-item cost reasoning) selects every stale mint-run artifact, oldest
   first, and — in `apply` mode — enriches each ONE AT A TIME through the SAME per-artifact step
   plan/executor a normal `--mint-run` apply already uses (`runFlywheelForOneArtifact`, extracted from the
   prior single-artifact `main()` so there is exactly one code path implementing "how a mint-run artifact
   gets connected," never two), writing each artifact's §9 outcomes back via the EXISTING, unmodified
   `run-mint-batch.mjs --outcomes` path — checkpointed to disk artifact-by-artifact, so a job timeout
   mid-backlog leaves everything processed so far connected and the gate correctly narrowed. A dry backlog
   run (`selectBacklogArtifacts` / `formatBacklogReport`, both pure) lists the stale artifacts and each
   one's item count and writes nothing, no DB creds needed. Wired into `.github/workflows/
   population-turn.yml` as the `flywheel_backlog` / `backlog_max_artifacts` workflow_dispatch inputs,
   which skip every export/mint/apply/reconcile step and THE GATE itself (that dispatch's whole purpose is
   clearing the gate — gating it would be circular) and run `--backlog` instead;
   `timeout-minutes` raised 30 → 60 for exactly this mode's headroom. `checkAllSlicesConnected`'s own
   refusal message now names the backlog dispatch as the preferred fix (the single-artifact
   `--mint-run ... --mode apply` command per stale artifact is still printed too, as an equivalent
   alternative).

`run-population-flywheel.mjs` is NOT itself a mint `GOVERNING_FILES` entry (confirmed again, unchanged
from lane TANDEM's own note above) — only the ONE governing file this lane moved,
`scripts/mint/MINT-RUNBOOK.md` (§8's new "THE GATE, WIDENED, and BACKLOG MODE" subsection and §9's
cross-reference to it — text only, per this lane's task instruction; no example payload, schema, or
extractor logic touched), moves the mint family's `harness_version`. `.github/workflows/
population-turn.yml` and `docs/runbooks/POPULATION-TURN-RUNBOOK.md` are neither of them governing files
either. `scripts/mint/validate-mint-payload.mjs`, `payload-schema.json`, `item-type-required-slots.json`,
the three `scripts/mint/lib/*.mjs` files, and `src/lib/intake/record-facts.mjs` are all UNCHANGED by this
lane.

**harness_version at TANDEM-2's write time (superseded below):** `sha256:0d22fb65d17b9343`

**harness_version at TANDEM-2's train-tip write time (superseded below — see "What changed (8)"):**
`sha256:0d22fb65d17b9343` (train tip: TANDEM-2 on top of the landed BOILER-2 tree — MINT-RUNBOOK.md §8/§9
text-only edit)

---

## Lane TANDEM-2, continued (2026-09-04) — the coordinator's OWN measured-against-the-code correction, plus a real gate/backlog correctness fix

**What changed (8):** lane TANDEM-2 (2026-09-04), same lane, further edit to `MINT-RUNBOOK.md` §8's "THE
GATE, WIDENED, and BACKLOG MODE" subsection (text only) — no code change to any governing file, but the
NARRATIVE that subsection tells needed correcting once actually measured, and two real correctness gaps
in `run-population-flywheel.mjs` (not a mint `GOVERNING_FILES` entry, so neither moves this hash) needed
closing before `--backlog` could be trusted:

1. **The "six artifacts / 934 items / three dispatches" framing undercounted the real backlog.**
   `checkAllSlicesConnected`, once actually run against every `mint-run-NNN.json` on this checkout (not
   only the six the coordinator's own defect description named), finds **15 of 23** artifacts minted
   items and were never connected, not six: mint-run-001, 004, 005, 006, 011, 012, 013, 014, 016, plus
   the six named (017-022). §8's subsection now states this measured [CONFIRMED] total and corrects the
   dispatch-count arithmetic (`ceil(13/2) = 7` at the default cap, not three).
2. **Of those 15, 2 (mint-run-001, mint-run-005) cannot be auto-connected by `--mint-run` OR
   `--backlog` at all** — both predate the `per_item.item_id` field entirely (their per_item entries
   carry a CELEX id and an outcome like `"minted"`/`"minted_validator_pass"`, never a real
   `intelligence_items.id`), so `extractMintedItemIds` has nothing to recover. Left unhandled, the OLD
   code would have let `--backlog` (or a direct `--mint-run` call) "connect" either one by writing
   `edges_discovered=0`/`isolated_items=0` — a FALSE record that these 6+5 items were ever discovered,
   when in truth their ids were simply never identified. Fixed in `run-population-flywheel.mjs` (this
   lane's own code, not re-opening BOILER-2 or HOLLOW-GATE's work): new `hasRecoverableMintedIds` pure
   predicate; `checkAllSlicesConnected` now reports such an artifact separately (still refuses — CLAUDE.md
   rule 17 carves out no exception for "the ids are gone" — but never hands out the standard
   `--mint-run ... --mode apply` fix command for it, since running that exact command against it now
   REFUSES rather than "fixing" anything); `selectBacklogArtifacts` never selects such an artifact (so it
   can never stall `--backlog`'s progress on the artifacts behind it, even though mint-run-001 is the
   OLDEST artifact on the checkout — proven by a dedicated test); `runFlywheelForOneArtifact` gained a
   pre-I/O guard that refuses before any child process or DB call for the direct `--mint-run` path, which
   `selectBacklogArtifacts`' exclusion does not protect. Also fixed in the same pass:
   `extractMintedItemIds` was missing the retired `"minted_verified_first_pass"` outcome label
   (mint-run-004/006's own shape, 9 items total, item_id present) — without this, both would have wrongly
   fallen into the "unrecoverable" bucket alongside mint-run-001/005 instead of being auto-connected. All
   of this is covered by new tests in `run-population-flywheel.test.mjs` (62 tests total, 0 failing).

**CONSEQUENCE the operator/coordinator must act on, not this lane:** even after every `--backlog`
dispatch this lane makes possible, THE GATE will keep refusing EVERY population-turn apply — the R-D
oil-bulletin batch included — until mint-run-001 and mint-run-005 are resolved by some OTHER means (e.g.
hand-matching their per_item CELEX ids against `intelligence_items.canonical_instrument_key` and
hand-writing their §9 outcomes via `run-mint-batch.mjs --outcomes`). This is out of this lane's write set
and not attempted here.

Only `scripts/mint/MINT-RUNBOOK.md` moved among `GOVERNING_FILES.mint` (§8's subsection rewritten with
the measured 15/13/2 split and the corrected dispatch-count math — text only, same scope as "What changed
(6)"). `run-population-flywheel.mjs`, its test file, `.github/workflows/population-turn.yml`, and
`docs/runbooks/POPULATION-TURN-RUNBOOK.md` are none of them `GOVERNING_FILES` entries.
`scripts/mint/validate-mint-payload.mjs`, `payload-schema.json`, `item-type-required-slots.json`, the
three `scripts/mint/lib/*.mjs` files, and `src/lib/intake/record-facts.mjs` are all UNCHANGED by this
continued edit, same as "What changed (7)" already stated.

**harness_version at TANDEM-2's final write time (superseded below):** `sha256:cffea59cb524f51a`

**The planned run that supersedes THIS marker:** the next `population-turn` dispatch under this landed
code. The correct FIRST dispatch is now the backlog (`flywheel_backlog: true`, `mode: dry` then `apply`,
`backlog_max_artifacts` left at default), repeated roughly `ceil(13/2) = 7` times to clear every
auto-connectable stale artifact — never the R-D six-row apply first, and never expected to fully clear
THE GATE on its own: mint-run-001/mint-run-005 need the separate manual resolution described above before
`--check-gate` can report zero stale artifacts. Once BOTH the backlog is clear AND mint-run-001/005 are
resolved, the R-D six-row `apply` dispatch (`docs/runbooks/POPULATION-TURN-RUNBOOK.md`'s "Dispatching the
oil-bulletin batch" section) is the next slice, and its own `mint-run-NNN.json` should carry all three §9
outcome keys once this lane's own normal (non-backlog) flywheel step runs over it — closing this marker
at that point, per F28's reverse-audit (or re-pinned to a new hash, per rule (c), if a governing file
changes again before either run lands).

**harness_version at write time (superseded below — see "What changed (9)"):** `sha256:79589ef978593250` (train/wave19: HEAL-7 kit mirror and TANDEM-2 runbook text on one tree)

---

## Lane GATE-A-TOKENS (2026-09-04) — Gate A harvest narrowed to five non-assertion syntactic-context skips (mint/lib copy only)

**What changed (9):** lane GATE-A-TOKENS (2026-09-04), addressing the 627-orphan-token / 87-quarantined-live-item
finding from Maintenance #34's dry heal (`_snapshots/heal34.json`) [CONFIRMED, live SQL + this snapshot,
2026-09-04]. MEASUREMENT classified every orphan by the syntactic context of its containing line. Two
candidate skip classes ("markdown heading", "table row") were REFUTED by measurement — real customer-facing
facts routinely live only in a table row (a China-ETS timeline cell, a GHG-Protocol CEO-appointment-date
row, an ESRS Scope-3 disclosure row) or a numbered heading ("### GX-Surcharge on Fossil Fuels — From
FY2028") — and are deliberately NOT skipped; skipping either wholesale would silently exempt real facts,
which ADR-016 / CLAUDE.md rule 18 forbid. Five classes the measurement DID support, each narrow, evidenced
against live `full_brief` text via read-only SQL, and never silent (every skip increments a new `counts`
field on `scanBrief`'s return, never dropped quietly): metadata stamps (document-level "As of:"/"Status:"
labels and document-type|date pipe headers — a closed enumerated label set, not a generic bold-line rule,
because 73 sampled bold-led lines were overwhelmingly genuine prose callouts), GAP-boilerplate templates
("No content for this section as of…", "…not available from primary sources as of…" — literal-prefix,
clause-scoped, found by repeat count 7x/24x in the corpus), heading/list-item ordinal numerals (strips ONLY
the leading "N." token, never the title/content after it — fixes a real defect, item `aea2e314-…`'s "## 2.
Tonne-Kilometre Activity Data Capture" misread as the false figure token "2. Tonne"), instrument-citation
numbers (a year slash-adjacent to another number in either order — "(EU) 2024/1735", "Federal Law No.
12,305/2010", the latter found live in item `8de055dc-…` and missed by the pre-existing `CITATION_LINE`
regex because comma-grouped digits break its `\d+` run), and position-anchored nested-token dedup (never a
bare substring test — a measured false-collision risk, "1 GW" vs "1.1 GW" as two genuinely distinct real
figures in the same sentence, is never collapsed). A sixth class discovered mid-implementation,
`citation_url`: a URL's own `%20` space-encoding can glue adjacent digits into a false figure (item
`aea2e314-…`'s download URL `.../Appendix%202.6%20-%20Draft%20standard%20-%20ESRS%20E1...` misread as
"202.6%") — position-anchored to the URL's own span, so a real figure in an adjacent table cell on the same
line is untouched.

**Scope boundary, stated plainly (per this lane's write-set):** the fix landed ONLY in
`scripts/mint/lib/gate-a-scan.mjs` (the copy `scripts/mint/validate-mint-payload.mjs`'s local $0 pre-flight
scoring imports) — `src/lib/agent/gate-a-scan.mjs`, the file `write-item.ts`'s `buildGateARow` actually
imports and `canonical-pipeline.ts`/`apply-mint-batch.mjs`/`heal-provenance.mjs` all resolve through, is
UNCHANGED (outside this lane's write set). This fix is therefore live for scoring NEW payloads before
mint; it is NOT yet live for `item_gate_a_state` / criterion 7 on the 87 already-quarantined items, or on
any already-minted item, until the identical five-helper fix is ported into the `src/` original (see
`MINT-RUNBOOK.md`'s new "KNOWN DIVERGENCE" note, added this lane). `gate-a-match.mjs` (the coverage-decision
matcher, `containsToken`/`norm`) was read in full and found to be the wrong layer for this fix (harvest, not
coverage) — left untouched, a true verbatim copy still.

**DB side [CONFIRMED, live `pg_get_functiondef`, 2026-09-04]:** `validate_item_provenance`'s criterion 7
purely reads the stored `item_gate_a_state` row (`orphan_count`/`gate_a_version` written exclusively by the
JS scanner via `buildGateARow`) — it does NOT re-implement token extraction in SQL. `gate_a_health_compute`
is a pure aggregate over that same table. No SQL-side token rule exists to mirror, so **no migration 304 is
written** — the write-set's conditional trigger for one never fired.

**Replay [CONFIRMED, live full_brief + FACT claims via read-only SQL, apples-to-apples on IDENTICAL current
live data, unmodified `src/` scanner vs the fixed `mint/lib` scanner]:** across the 87 quarantined-live
items, total orphan tokens 594 → 504 (a 15.2% reduction); 41 items improved, 0 items regressed; 2 items
that were non-zero under the unmodified scanner reach zero under the fix. (heal34.json's own recorded
baseline, 627, is a stale 2026-09-04-morning snapshot against data that has since drifted — comparing it
directly to a same-day re-scan understates the improvement for a few individual items and is not the number
above; the 594→504 comparison is the apples-to-apples one.) `GATE_A_VERSION` bumped `"2026-07-30.1"` →
`"2026-09-04.1"` (harvest-side semantics change, so every prior stored scan is honestly invalidated by the
existing stale-scan hash guard, exactly like every prior `GATE_A_VERSION` bump).

Governing files moved: `scripts/mint/lib/gate-a-scan.mjs` (the fix; +30 new tests in a new
`gate-a-scan.test.mjs`, full mint suite re-run clean: 767/767 pass, 0 failures) and
`scripts/mint/MINT-RUNBOOK.md` ("Keeping the kit in sync" gains a "KNOWN DIVERGENCE" note pointing at this
entry and naming the exact resolution — port the same fix into `src/` and re-verbatim this copy).
`scripts/mint/validate-mint-payload.mjs`, `payload-schema.json`, `item-type-required-slots.json`,
`scripts/mint/lib/gate-a-match.mjs`, `scripts/mint/lib/canonicalize-citation-url.mjs`, and
`src/lib/intake/record-facts.mjs` are all UNCHANGED by this lane.

**harness_version at write time (superseded below — see "What changed (10)"):** `sha256:fc79c635306857a1`

**What changed (10) — SINGLE SOURCE for Gate A (coordinator, 2026-09-04, same train as lane
GATE-A-TOKENS):** the lane's harvest fix had landed in `scripts/mint/lib/gate-a-scan.mjs`, a hand-mirrored
COPY of `src/lib/agent/gate-a-scan.mjs`, and the live path (`write-item.ts`'s `buildGateARow`, the heal,
the pipeline) imports the `src/` file, so the fix was not live for any minted item. The copy is the defect:
`src/lib/agent/gate-a-scan.mjs` now carries the fixed body (`GATE_A_VERSION` `"2026-09-04.1"`, createHash
md5 form), `scripts/mint/lib/gate-a-scan.mjs` and `scripts/mint/lib/gate-a-match.mjs` are `export *`
re-exports of the `src/` files, F28's mint `GOVERNING_FILES` (and CONVENTION.md's table) name the two
`src/` files alongside the kit paths, and MINT-RUNBOOK.md's "Keeping the kit in sync" section describes
the re-export instead of the copy. The 30 lane tests run through the re-export unchanged.

**harness_version at write time (superseded below — see "What changed (11)"):** `sha256:28c98ae2309a416a`

---

## Lane RD-M4 (2026-09-04) — M4 same-URL identity fix: a sibling series no longer blocks itself

**What changed (11):** lane RD-M4 (coordinator dispatch, 2026-09-04), fixing the defect population apply
#34 measured live: six EU Weekly Oil Bulletin `market_signal` series (one `source_url`, one
`canonical_instrument_key: null`, six distinct `instrument_identifier`s, ruling R-D's series case) minted
one item and blocked the other five `not_applied_url_holder` — `checkM4`'s same-URL branch compared URLs
only, so the first sibling minted became the single holder every later sibling's URL check matched, even
though each names a different document. `MINT-RUNBOOK.md`'s M4 paragraph (~line 397) now states the fixed
rule (`normalizeInstrumentIdentifier` + `sameInstrumentIdentity`, case-insensitive/trimmed identity
comparison, a labelled/labelled-different pair does not block, a null-vs-null or any-null pair still blocks,
fail-closed) — the only prose change to a mint governing file this lane made; `apply-mint-batch.mjs` itself
is NOT a mint `GOVERNING_FILES` entry, so its own `checkM4`/`buildItemsIndex` rewrite does not by itself move
this hash, but it is landing in the SAME commit as the runbook change, so the two are not out of step with
each other on disk. `buildItemsIndex.bySourceUrl` changed from a single-holder `Map` overwrite to a
per-URL array (every holder at a URL is now visible, not only the most-recently-indexed one), and
`applyOnePayload` pushes a newly-minted item into that array rather than overwriting the slot, so a sibling
minted earlier in the SAME batch is visible to a later payload's identity check exactly like a holder read
from the live DB at batch start.

**Live measurement before the change [CONFIRMED, Supabase project kwrsbpiseruzbfwjpvsp, 2026-09-04]:** the
bulletin's own `source_url` held exactly the one minted row (`eurosuper-95`,
`4fae403a-ced5-4c8f-82b7-af0fd6127061`, `verified`, `canonical_instrument_key: null`); across the WHOLE
live `intelligence_items` corpus, excluding the degenerate `source_url = ''` rows (562, never checked by
`checkM4` — an empty string is falsy), only six OTHER `source_url` values carry 2+ rows at all, and every
one of those six has at most ONE non-archived survivor today (the other member is `archive_reason`-stamped:
`duplicate_instrument`, `duplicate_of_verified`, or `reclassified_to_source`). So the "two simultaneously
LIVE items sharing one URL" case had never existed in the live corpus before this run — this narrowing has
no retroactive effect on anything already live; it unblocks exactly the bulletin's five siblings and any
future batch shaped the same way (a landing page fronting several named series).

**Tests (`scripts/mint/apply-mint-batch.test.mjs`, +10 net over the prior 767 full-suite total — one prior
test rewritten in place, nine new):** `buildItemsIndex` keeps every
holder at a URL, not just the last one indexed; `normalizeInstrumentIdentifier` / `sameInstrumentIdentity`
unit tests (trim/case, both-null, both-equal, both-different, both directions of the null-vs-labelled
asymmetry); `checkM4` true-duplicate (same identifier, case/whitespace-insensitive) blocks; null-vs-null
duplicate blocks; the null-holder asymmetry blocks; a labelled/different-labelled pair does NOT block
(sibling series); the canonical-key branch's existing wo26/holder-conflict tests are unchanged (regression);
an `applyOnePayload` six-series-batch integration test reproducing population apply #34's exact shape (one
`source_url`, six distinct `instrument_identifier`s, `canonical_instrument_key: null`) — all six now mint;
and a same-batch true-duplicate integration test (two payloads, same URL, same identifier, second is
blocked by the first). 777 mint tests total, node --test clean.

**harness_version at write time:** `sha256:2b8ff43291ad2f80`

**The planned run that supersedes THIS marker:** the next `population-turn` dispatch (or a direct
`validate-mint-payload.mjs` run) under this landed code — any NEW same-URL series batch's M4 pre-check
should now reflect the identity rule; a stale artifact whose `harness_version` still reads an earlier hash
above re-triggers F28's rule (c) staleness coupling until re-pinned. Per F28's reverse-audit, this marker is
deleted the moment a run artifact lands with `harness_version` matching the hash above (or re-pinned to a
new hash, per rule (c), if a governing file changes again before that run lands).
