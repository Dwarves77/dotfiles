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

**harness_version at write time:** `sha256:f50d5fd4ee2f925f` (train/wave16 final: the exemption above on top of
TANDEM's §8/§9 runbook text and HOLLOW-GATE's kit/extractor edits; each lane's own hash above is history)

**The planned run that supersedes THIS marker:** the next `population-turn` dispatch (dry, then apply)
under this landed code — its `mint-batch-report.json` should show a material drop in `record_hollow` holds
against the 379 EUR-Lex-hosted rows in the 551-hollow population (MINT-RUNBOOK.md §13's ≈92% estimate),
plus continued clean handling of the URL-BOILER-era rows (`429c85d2`/`a980a0b9`) already covered above. Per
F28's reverse-audit, this marker is deleted the moment that artifact lands and its `harness_version`
matches the hash above (or re-pinned to a new hash, per rule (c), if a governing file changes again before
that run lands).
