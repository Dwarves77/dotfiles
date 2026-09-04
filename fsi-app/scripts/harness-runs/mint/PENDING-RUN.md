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

**harness_version at write time:** `sha256:bff28600696d162f`

**The planned run that supersedes this marker:** the next `population-turn` dispatch (dry, then apply)
under this landed code — a `dry` dispatch exercises the full flywheel plan without writing (see
`run-population-flywheel.mjs --mode dry`'s own step list), and the following `apply` dispatch's
`mint-run-NNN.json` will carry a populated `metrics` block with all three §9 keys, closing THE DEFECT for
that batch. Per F28's reverse-audit, this marker is deleted the moment that artifact lands and its
`harness_version` matches the hash above (or re-pinned to a new hash, per rule (c), if a governing file
changes again before that run lands).
