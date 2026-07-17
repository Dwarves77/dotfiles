
## 2026-07-16 — THE PERSISTENCE CONTRACT (cc-executor drain, Step 0)

Locked from repo write paths (canonical-pipeline.ts groundBrief) + a healthy verified item's real rows (singapore-maritime-decarbonisation, item 007104ed). The executor NEVER writes section_claim_provenance directly; groundBrief writes it via the injectedLedger seam. The executor only PROPOSES candidates; the gates dispose.

CAPTURE (free, both persisted):
- raw_fetches (via snapshot-store.writeSnapshot): {source_id, content_hash(sha256), file_path(`${sid}/${yyyy-mm-dd}/${hash}.html.gz`), http_status, html_bytes, fetched_at, created_at}. Round-trip verified (getSnapshot re-read + char count + marker string).
- agent_run_searches POOL ROW (the capture made visible to the system — a snapshot alone is invisible to validate/groundBrief): {intelligence_item_id, agent_run_id(nullable), search_query, result_url, result_title, result_index, result_content_excerpt(the captured text), searched_at}. validate_item_provenance criterion 3 matches a claim's source_span against the result_content_excerpt of the pool row referenced by the claim's search_result_id.

SOURCE: registerSource({url:<specific document url>, name, base_tier:<codified tier>}) — idempotent by institution key, read-back active, returns source_id. Provisional-class → hold, never stamp.

MINT (written BY groundBrief through the seam, not by the executor):
- section_claim_provenance row: {section_row_id, intelligence_item_id, claim_text, claim_kind(FACT/ANALYSIS/GAP/LEGAL), source_span(verbatim), source_id(resolved from the span's pool row), search_result_id(the pool row id), source_tier_at_grounding(stamped from the source row), extracted_at, verified_by/at(null), mint_hold_reason(null or gate hold)}.
- The executor's injected ledger supplies only {section, claim_text, claim_kind, source_span, slot_key}; groundBrief resolves source_id + search_result_id + tier and runs kept-filter (verbatim .includes), mint gates, non-destructive applyLedgerDiff, validate.

SUBMISSION ADAPTER (the ONE authorized new mint-path code): the injectedLedger seam in groundBrief (canonical-pipeline.ts) + scripts/_reground/executor-ground.mjs. Skips the acquire-lock + metered model when a ledger is injected; runs every gate unchanged. Golden: scripts/verify/cc-executor-submit.golden.mjs.

Divergences from dispatch text: none — repo is authority; section_claim_provenance has no slot_key column (slot encoded in claim_text `[slot]` prefix).

## 2026-07-16 — CC-EXECUTOR DRAIN, first bank (resume handoff)
DRAIN COUNTER: 2 verified via the free executor loop (o9 14590299, w4_ca_sb261 2d2cd311). 198/235 live verified. $0 spend beyond the prior $0.56 (metered path untouched).
LOOP PROVEN on a fresh item (w4_ca_sb261): read staged capture -> propose verbatim candidates -> executor-ground.mjs (injectedLedger seam) -> gates dispose -> validate -> verified. Golden green (cc-executor-submit.golden.mjs 10/10).
FINDING (add to loop): officialness path-a confirms AN official instrument, not the item's CORRECT instrument. eu_clean_trucking captured the CSRD directive (OJ-TOC source_url) not HDV 32024R1610 -> HELD (flag). Some acquisition-batch captures may be wrong-instrument; ADD a target-match verify (subject/marker/entity match capture vs item) BEFORE grounding. Re-verify each staged capture's subject before extracting.
NEXT WORKLIST ITEM: 55f90df0 (IMO MEPC.338(76), staged) — but FIRST target-match-verify each of the 16 staged captures (grep for the item's subject markers) and re-hold any wrong-instrument ones like eu_clean_trucking. Persistence Contract: docs/ops/session-log.md (this file, 2026-07-16 entry). Adapter: scripts/_reground/executor-ground.mjs + the injectedLedger seam in canonical-pipeline.ts. Per-item: dump capture+slots (node pull), Read capture, build verbatim ledger (pre-verify spans present), executor-ground <uuid> <ledger.json>, read-back validate. HELD staged-but-wrong: eu_clean_trucking (needs 32024R1610).

## 2026-07-16 — DOCUMENT-BASELINE + EXECUTOR-AGNOSTIC ADDENDA (audit + build plan, chain handoff)

CONFIRMED NOW (gating item for the drain, rule 1 retention):
- raw_fetches is APPEND-ONLY by construction: UNIQUE(source_id, content_hash) (mig 052) + writeSnapshot content-addressed key `${sid}/${day}/${hash}.html.gz`. Changed re-capture (new hash) = new row + new blob, prior preserved; identical = idempotent. NO prune/delete path (grep clean; only FK ON DELETE SET NULL + source cascade). Enforcement is IN writeSnapshot (shared capture fn) so any caller (CC or groundBrief) gets it. NO migration needed.
- Golden: scripts/verify/primary-text-permanent.golden.mjs (7/7). Proves the content-addressing that the UNIQUE index + no-delete rest on.
- Doctrine: primary-text-is-permanent (document twin of grounding-is-non-destructive).

ENFORCEMENT-LOCATION AUDIT (addendum 2 rule 1):
(a) retention -> writeSnapshot (SHARED) — DONE.
(b) document-diff-on-recapture -> amendment-diff.mjs EXISTS (diffDocuments/alignSegments/segmentByShape) but NOT wired to the capture/re-capture path — BUILD.
(c) mint gates (verbatim + 4 gates + non-destructive) -> groundBrief + mint-gates.mjs, and the injectedLedger seam routes CC candidates through the IDENTICAL path (cc-executor-submit.golden 10/10) — SHARED; parity golden owed to prove byte-equivalence.
(d) portal-to-enacted-link-follow -> extractPortalLinks EXISTS but wired only to check-sources worker, NOT the generation fetch (fetchPrimaryDeep/generateCandidates) — BUILD (both paths).

BUILD PLAN (staged, next-in-chain, with locations):
1. Doctrine entries in .discipline/governance/doctrine-register.mjs: primary-text-is-permanent (enforcedBy new invariant -> selftest:primary-text-permanent.golden.mjs); doctrine-binds-to-pipeline-not-executor (enforcedBy new invariant -> selftest:the parity golden). Add invariants in invariants.mjs (+ skill anchor lines in remediation-discipline/source-credibility-model). Meta-gate green.
2. COVERAGE-LEDGER (addendum 2 rule 2): new table/columns for per-(item,capture) region coverage {char_range, region_label(article/annex), status(extracted|nothing-material), executor}. groundBrief: sequential-chunk the FULL capture (no keyword sampling/truncation), write a coverage-ledger row per region incl. explicit nothing-material for cleared regions. CC executor writes the SAME shape. Golden: large fixture -> complete char-range coverage.
3. DIFF-ON-RECAPTURE + TWO-LAYER: fire amendment-diff.diffDocuments from the capture path on a source that already has a prior snapshot; persist the diff linked to both snapshot versions (unchanged | changed+delta-regions). Layer1 doc-delta vs Layer2 ledger-delta: doc-delta in an UNEXTRACTED region (per the coverage ledger) -> coverage_gap integrity_flag routed to extraction; ledger-delta w/o doc-delta -> extraction-quality log. Golden: changed re-capture -> diff+deltas; doc-delta in unextracted region -> coverage-gap raised.
4. NO-CHANGE PROOF (rule 4): hash-identical re-capture stamps "primary verified unchanged as of <date>" on the item (cheap, customer-valuable). 
5. MONITORING MACHINERY (rule 3): invocable re-capture->snapshot->diff->route cycle, UNARMED + CADENCE-LESS (regime undefined until coverage-floor/Unit-5). Ship dormant, wake-proof only.
6. PORTAL-LINK-FOLLOW wiring: extractPortalLinks into fetchPrimaryDeep/generateCandidates so a portal capture yields the enacted deep-link candidates for BOTH executors. Golden: o9 pool fixture -> enacted-grounded-or-hold, never portal-stamped.
7. PARITY GOLDEN (addendum 2 rule 4): one fixture item end-to-end via executor-ground.mjs (CC) AND via groundBrief (metered) -> equivalent snapshot behavior, pool rows, gate outcomes on the same candidates, coverage-ledger form. This is the driver-interchange proof + the doctrine-binds-to-pipeline invariant.

DRAIN STATE (resume): 2 verified (o9 14590299, w4_ca_sb261 2d2cd311), $0 beyond the prior $0.56. 13 staged subject-matched (groundable next: 4ff5cf56,55f90df0,canada-clean-fuel,87ed781c,b6b7eb7d,la-eweo,uae-netzero,o13,nashville,eu-csrd,japan-gx-freight). HOLDS: eu_clean_trucking(wrong primary=CSRD not 32024R1610), 576554b3+ad4cc6c6(wrong-instrument), 0ea6a710(no real primary), +19 Chrome-needed. Target-match-verify EACH capture (subject markers) before grounding; tighten the 0.4 threshold (eu_clean_trucking slipped at 2/5).

## 2026-07-16/17 — EXECUTOR-AGNOSTIC INFRASTRUCTURE (increments 1-2 landed, meta-gate green)

Built the addenda infrastructure "confirmed-or-built before the drain proceeds," two committed increments on branch corpus-integrity/cc-grounding-executor.

INCREMENT 1 (commit 2066571f) — doctrines + parity golden:
- Doctrine primary-text-is-permanent -> RD-46 (primary-text-permanent.golden 7/7 + migration 052): raw_fetches append-only by content-addressing in shared writeSnapshot; changed re-capture = new versioned snapshot, never overwrite. Document-level twin of grounding-is-non-destructive.
- Doctrine doctrine-binds-to-pipeline-not-executor -> RD-47 (executor-parity.golden 13/13): STRUCTURAL proof over canonical-pipeline.ts that CC + metered drivers are interchangeable — driver-identity var read EXACTLY 4x (1 decl + 3 allowlisted skip-points: acquire-lock, extraction pivot, dominance-guard), drivers unify at `claims = injected ?? extractClaimLedgerLenient`, judgment core (kept-filter..applyLedgerDiff) is driver-blind. A 4th divergence or any core branch on driver identity is RED.
- Skill categories 27+28; marker baseline 38->39.

INCREMENT 2 (commit a456c755) — target-match verify gate (the drain-loop wrong-instrument finding):
- src/lib/sources/target-match.mjs (PURE, reuses identifier-variants.mjs): verifyTargetMatch/verifyPoolTargetMatch. Own-identifier presence (EU CELEX/pair-key or raw non-EU token like SB-261) = MATCH; else subject overlap over RAISED 0.6 threshold. HARD MISMATCH only when the pool bears a DIFFERENT instrument id and the item's own id is absent with no matching block (never over-holds; never false-holds an item that merely references others). UNVERIFIED = soft flag.
- WIRED at the SHARED groundBrief fetched-pool chokepoint BEFORE the extraction pivot (canonical-pipeline.ts), so BOTH executors inherit it (satisfies RD-47). MISMATCH -> held + data_integrity flag; UNVERIFIED -> coverage_gap flag, grounds under downstream gates.
- target-match.golden.mjs (18/18) incl. RED eu_clean_trucking (CSRD capture -> MISMATCH) + wiring proof. -> RD-48, doctrine capture-must-be-the-items-own-instrument.
- PROVEN ON REAL DATA (scripts/_reground/target-match-probe.mjs, read-only, 30 staged captures): eu_clean_trucking sole MISMATCH; 6 thin held UNVERIFIED; 23 MATCH (576554b3/canada correctly matched, not false-held). tsc clean.

FINDING (surfaced, not papered): many items lack canonical_instrument_key, so target-match falls to the weaker subject-overlap check for them — an A2 (per-document keying) data-completeness gap. Backfilling identifiers would strengthen the gate and let UNVERIFIED harden from soft to held.

BUILD-PLAN STATUS (the 7 addendum items): #1 doctrines DONE, #7 parity golden DONE, #6 portal-link-follow the DEFENSIVE half is now covered (target-match HOLDS a portal/wrong capture) — the OFFENSIVE half (auto-navigate portal->enacted via extractPortalLinks in fetchPrimaryWithFallback: a portal is NOT roadblocked, needs a new non-roadblock branch) REMAINS. #2 COVERAGE-LEDGER, #3 DIFF-ON-RECAPTURE+TWO-LAYER, #4 NO-CHANGE-PROOF (content-addressing already detects hash-identical; the "verified unchanged as of date" stamp is unwired), #5 MONITORING MACHINERY (unarmed) — the document-baseline change-detection subsystem, all steady-state (matter for re-capture over time, not the initial free drain), best built as one coherent block next.

DRAIN STATE (unchanged): 2 verified via free loop (o9 14590299, w4_ca_sb261 2d2cd311), $0 beyond prior $0.56. 30 staged captures now carry target-match verdicts (probe output). NEXT DRAIN ITEM: a MATCH-verdict staged item (e.g. 4ff5cf56, 55f90df0, b6b7eb7d — all subject-overlap MATCH) via executor-ground.mjs; the target-match gate now runs automatically inside groundBrief. eu_clean_trucking stays HELD (re-acquire 32024R1610). Persistence Contract: this file, 2026-07-16 entry. Adapter: scripts/_reground/executor-ground.mjs + the injectedLedger seam.

## 2026-07-16 — DRAIN (ratio-rule session): 3 items drained, DELETE-trigger root-gap fix

Per operator DRAIN-FIRST ruling. Items DRAINED to verified this session (all $0, free executor path):
- 782878c0 (UK SAF RTFO Order 2024) — crit-5 missing-slot: injected primary_deadline + penalty_summary FACTs (verbatim from legislation.gov.uk), slot-forcing filled effective_date. VERIFIED.
- af277afd (IEA Global EV Outlook 2024) — crit-5 missing methodology_limits: injected FACT (iea.org tier-3). LEARNING: set source_url on the claim so the span attributes to the correct pool block (else fact_span_not_in_source).
- 55f90df0 (IMO MEPC.338(76)) — CONFLATION: 10 cross-instrument claims (SEEMP Part III=MEPC.346(78), Z-factors=MEPC.400(83), Statement of Compliance) versioned out with proof to claim_versions (span absent from the MEPC.338(76) primary), 22 legitimate tier-2 facts kept + 3 injected. VERIFIED.

DRAIN MECHANISMS proven (all through the shared groundBrief chokepoint / DB layer, executor-agnostic):
1. Missing-slot inject: FACT/GAP for an uncovered slot (executor-ground.mjs injectedLedger). Nothing prior blocks.
2. Prior-junk version-out (operator ruling 2026-07-16): a claim whose span is ABSENT from the item's verified primary AND cross-instrument = proven inaccurate FOR THIS ITEM → version out (claim_versions + proof), never blanket-delete. scripts/_reground/drain-clear.mjs (span-absence proof, sub-floor/cross-instrument filter, dry-run default).

ROOT-GAP FIX (operator ruling): migration 209 — set_provenance_status trigger now fires AFTER DELETE on section_claim_provenance (was INSERT/UPDATE only), so a version-out recomputes status without a nudge hack. DB-layer → covers ALL writers by construction (executor-universality). APPLIED. The touch-extracted_at nudge was removed from drain-clear per the correction.

DOCTRINE EXTENSION logged (executor-universality, permanent): RD-47 doctrine text extended — every FUTURE collection/grounding driver MUST enter through the chokepoint or bind at the DB layer, and the RD-47 golden must be extended to cover each new driver (a driver reaching the ledger without the chokepoint = golden+CI fail). Meta-gate green.

JUDGMENT RECORD: eraseClaimWithProof (ledger-apply.mjs) could not run standalone (write client unexported; only the guarded functions are the write surface), so drain-clear replicated its fail-closed archive-then-delete via guardedInsert(claim_versions)+guardedDelete. Flagged for POST-DRAIN consolidation (docs/tech-debt-log.md) — one shared version-out long-term so the hold-loop + future erasers inherit identical logic.

WORKLIST STATE (per drain-triage): 6 items had all-floor prior ledgers; 2 were pure missing-slot (drained: 782878c0, af277afd). CRIT-4 (unlabeled/synthesized-FACT) items need per-claim relabel/version-out surgery: o13 (in progress — 1 cross-instrument claim versioned out; remains: a synthesized effective_date FACT with span_not_in_source + missing primary_deadline), 4ff5cf56 (15 span-absent), canada-clean-fuel, ad4cc6c6 (33 span-absent). 17 items have larger sub-floor/conflation junk. eu_clean_trucking still HELD (wrong instrument, re-acquire 32024R1610).

NEXT WORKLIST ITEM: o13 (finish: version out the synthesized effective_date FACT if span truly absent, inject a verbatim effective_date FACT + primary_deadline FACT from the IMO net-zero primary). Then 4ff5cf56 / canada / ad4cc6c6 via drain-clear + slot inject. Session drains = 3.

## 2026-07-16 — DRAIN (cont.): over-clear incident resolved + 4ff5cf56 correct-primary acquired

OVER-CLEAR INCIDENT + RESOLUTION (operator ruling): the batch drain-clear auto-versioned-out on span-absence ALONE (inferring cross-instrument), over-applying the ruling's AND condition on wrong-primary items — 48 claims on 4ff5cf56 (15) + ad4cc6c6 (33). ALL RESTORED from claim_versions via scripts/_reground/restore-overclear.mjs (guarded, incident-cited; archive rows removed). drain-clear TIGHTENED to two-condition proof-not-proxy: auto-version-out ONLY when (a) span absent from verified primary AND (b) claim names a FOREIGN instrument id, AND only on a primary target-match CONFIRMED via instrument-id (not subject-overlap); else re-attribute/manual-review/relabel. Golden drain-clear-two-condition.golden.mjs (9/9; 4ff5cf56 pattern must NOT clear, 55f90df0 must). target-match.mjs gained scanImoTokens/ownInstrumentTokens/foreignInstrumentTokens. Doctrine addendum to erase-only-on-proven-inaccuracy: proof = every condition evidenced per claim; a proxy for a judgment condition is not proof; automation EXECUTES a proven clearance, never INFERS it. Committed 9931fc63.

ROOT-GAP FIX committed 7db7cc41: migration 209 (set_provenance_status AFTER DELETE on section_claim_provenance) — version-out now recomputes status without a nudge, DB-layer covers all writers (executor-universality). RD-47 doctrine extended with the forward executor-universality ruling.

4ff5cf56 CORRECT-PRIMARY ACQUIRED (operator step 3): its declared primary was the WRONG doc (a 400k regulations.gov docket of Wyoming statutes). Acquired the real instrument — Federal Register final rule FR 2026-03820 "Wyoming: Approval of State CCR Permit Program" (federalregister.gov tier 1, 79623 ch), FREE via the FR raw-text API (no Browserless). Registered + snapshotted + staged in pool + repointed source_url (scripts/_reground/acquire-4ff5cf56.mjs). NOT yet drained: it carries 13 old news/EPA-grounded unlabeled-ANALYSIS claims (true-but-secondary) needing the 4c relabel path, + the injected effective_date/scope FACTs need attribution debugging (span present in the FR pool row but resolved fact_span_not_in_source — likely URL-canonicalization mismatch between the injected source_url and the staged pool row's result_url).

SESSION DRAIN COUNT: 3 verified (782878c0 UK SAF Order, af277afd IEA EV Outlook, 55f90df0 IMO MEPC.338(76)). Total verified corpus-wide: 404.

NEXT: (1) 4ff5cf56 — debug the injected-FACT attribution (canonicalize source_url to match the staged FR pool row), relabel the 13 true-but-secondary claims (4c), then verify. (2) ad4cc6c6 re-drain per-item (restored; needs relabel of its true-but-secondary claims + version-out only what names another instrument). (3) o13 — synthesized effective_date FACT (span_not_in_source) + missing primary_deadline. (4) continue worklist. POST-DRAIN debt: consolidate drain-clear's version-out into the shared ledger-apply eraseClaimWithProof (docs/tech-debt-log.md).
