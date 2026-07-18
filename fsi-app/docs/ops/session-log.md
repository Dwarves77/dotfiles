
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

## 2026-07-16 — 4ff5cf56 completion attempt (steps 1-2 done, step 3 surfaced a third defect class)

RESUME ORDER executed:
1. ID-STAMP DONE: set instrument_identifier=2026-03820 (FR doc number, present in the acquired FR primary) — target-match now MATCH via raw-id (id-confirmed, clearance-grade, not subject-overlap).
2. INJECT ATTRIBUTION FIXED: fact_span_not_in_source was caused by TWO pool rows sharing the FR URL — my full FR capture (span present) and 2 old 0-char FR stubs shadowing it; crossLink picked a stub. Removed the 2 stub rows (guarded), deleted the 3 this-session mis-attributed injects, re-injected → crit-3 CLEARED, the effective_date/primary_deadline/jurisdictional_scope FR FACTs attribute correctly. Lesson (af277afd + this): dedup shadowing stub pool rows before/at inject, specify source_url per claim.
3. RELABEL BLOCKED — THIRD DEFECT CLASS: 12 crit-4 failures, of which 10 are ORPHANED (claim_text appears in NO section content_md — mechanically verified across all sections) and 2 are in-prose. Orphaned analysis claims annotate no prose paragraph → nothing to label (relabel impossible) AND same-subject → the tightened two-condition gate correctly refuses to version them out. They fit NEITHER ruling condition. NOT auto-dispositioned (over-clear lesson: never infer a version-out condition the ruling did not name). SURFACED for operator ruling: version out as orphaned-defect (proof = claim_text absent from all brief prose; preserved in claim_versions) OR regenerate the brief prose to include them.

4ff5cf56 STATE: crit-3 clear, all required slots covered by FR-primary FACTs, blocked only on 12 crit-4 (10 orphaned + 2 in-prose). Correct FR 2026-03820 primary live + id-confirmed.

DOCTRINE ADDENDUM LOGGED (operator ruling — live-verification as permanent calibration; ADR-014 addendum owed):
- ADR-014 addendum (live-eyes-are-the-calibration-channel): wave-acceptance sampling is not only defect detection — it is the STANDING mechanism measuring the gap between stored belief and the live page. Every sampled item's live read records claim accuracy AND capture-vs-page divergence (page restructured, doc moved, format changed, content the capture missed). Divergence findings route as pipeline calibration input (as this drain's findings sharpened the tools).
- The parked steady-state monitoring machinery (diff-on-recapture, no-change-proof stamps, unarmed monitoring) is the MECHANICAL half (WHEN reality moved); ADR-014 sampling is the JUDGMENT half (WHAT it means). Both route to the same place; neither substitutes for the other.
- STANDING RULE for all future autonomous runs (cron, expansion waves, steady state): no run regime ships without its sampling rate. Autonomous collection without a live-verification quota is a build-phase-only allowance that EXPIRES when the drain ends. Operator sets N per regime; default = the ratified 10% floor 3. NO BUILD NOW.

SESSION DRAIN COUNT: 3 (782878c0, af277afd, 55f90df0). 4ff5cf56 pending the orphaned-claim disposition ruling. NEXT: operator ruling on orphaned claims → finish 4ff5cf56, then ad4cc6c6, o13, worklist.

## 2026-07-16 — 4ff5cf56 VERIFIED (drain 4) + third-exit taxonomy landed

4ff5cf56 VERIFIED — full completion: (1) id-stamped instrument_identifier=2026-03820 (present in FR primary) -> target-match raw-id/id-confirmed; (2) attribution fixed: removed 2 shadowing 0-char FR-URL stub pool rows + deleted the mis-attributed injects + re-injected -> crit-3 cleared; (3) 10 orphans versioned out under orphaned_no_prose_referent (slot-safe: their slots covered by the FR-primary FACTs); (4) 2 mis-stored ANALYSIS claims carried a [slot] prefix that broke criterion-4 (which matches the FULL claim_text incl. prefix against prose) — stripped the prefix so the labeled sentence matches -> VERIFIED.

THIRD SANCTIONED EXIT LANDED (operator ruling): migration 210 adds claim_versions.supersede_reason 'orphaned_no_prose_referent' (distinct from proven_inaccurate; proof now required for any non-'changed' exit). drain-clear.mjs now reports THREE exits (dry-run default): proven_inaccurate (cross-instrument, two-condition), orphaned_no_prose_referent (text absent from ALL prose AND slot-coverage-safe — a required slot's SOLE coverage is a GAP to FILL, never cleared), relabel-to-ANALYSIS (stays live). Golden drain-clear-two-condition.golden.mjs 13/13 (+4 orphan cases). Doctrine addendum on erase-only-on-proven-inaccuracy: exactly three exits, nothing else removes a claim. Committed ebcec9ea. Meta-gate green.

SESSION DRAIN COUNT: 4 (782878c0, af277afd, 55f90df0, 4ff5cf56). Total verified corpus-wide: 405.

NEXT (worklist): ad4cc6c6 — its primary (customs.go.jp/english/summary/advance5/01.pdf, 40000 ch) target-matches UNVERIFIED (below-threshold subject-overlap): VERIFY/RE-ACQUIRE the correct primary FIRST (4ff5cf56 lesson — no clearance against an unconfirmed primary), then drain-clear reports 21 orphans + 21 relabel-manual. o13 — synthesized effective_date FACT (span_not_in_source) + missing primary_deadline. Then the sub-floor/conflation items. eu_clean_trucking still held (re-acquire 32024R1610). Tooling now complete: drain-pull, drain-clear (three-exit), restore-overclear, acquire-<item> pattern.

## 2026-07-16 — PARALLEL-DRAIN infra + lane split (KEY FINDING: Lane B ~empty)

Built the parallel-drain infrastructure (operator ruling): migration 211 = drain_worklist (lane split) + mutation_leases (per-item H5 lease) + acquire/heartbeat/release fns (mirror funded_pass_runlock). scripts/lib/mutation-lease.mjs (withLease refuses on held item). Golden mutation-lease.golden.mjs 10/10 (refuse-on-held, incumbent-named, holder-only heartbeat/release, stale-takeover). Closes H5 residual (RD-38). Committed 6a1dd81b + pushed (pre-push green).

LANE SPLIT PUBLISHED to drain_worklist (scripts/_reground/lane-split.mjs). Lane B = target-match id-confirmed (instrument-id/raw-id, NOT subject-overlap) AND all validate failures mechanical (orphan/relabel/missing-slot). Result: 33 Lane A, 0 Lane B. Breakdown: 1 B-candidate (canada-clean-fuel — id-stamp to promote), 6 no-primary (re-acquire), 10 below-threshold subject-match (thin/wrong primary — verify), 14 not-id-confirmed w/ non-mechanical failures (sub-floor/conflation), 1 wrong-primary (eu_clean_trucking -> 32024R1610), 1 id-confirmed non-mechanical (eu-csrd sub-floor).

KEY FINDING (stop-and-surface): the parallel-drain premise — a mechanical Lane B Session B can chew through — does NOT hold. Only ~1 item is mechanical-ready. The quarantined corpus is overwhelmingly JUDGMENT work (wrong/no/unconfirmed primaries, sub-floor conflation). Session A (judgment) is the bottleneck; Session B would inherit ~1 item until Session A prepares items (re-acquire, id-stamp, resolve conflation), which trickle to Lane B. Surfaced for the operator's call on whether Session B / the parallel model buys enough here.

LEASE STATE: clean (no leases held). Session drain count: 4. Live corpus: 202 verified / 33 quarantined.

## 2026-07-16 — Session A judgment lane: leases wired + eu_clean_trucking primary re-acquired

Leases WIRED into drain-clear (acquire before version-outs, refuse-if-held-by-other, release in finally; --holder arg). scripts/_reground/acquire-primary.mjs = generic free primary re-acquisition under lease (clean capture, VERIFY id-confirmed BEFORE write, register host at codified tier, snapshot, stage, repoint, dedup shadow stubs).

eu_clean_trucking (Session A #1, the known wrong-primary): re-acquired the CORRECT primary — EUR-Lex CELEX 32024R1610 (Regulation (EU) 2024/1610, HDV CO2), fetched FREE from eur-lex.europa.eu (tier 1), 161160 ch full enacted text. target-match match/instrument-id -> id-CONFIRMED. Registered + snapshotted + staged + repointed off the wrong 2021 OJ:L:243 TOC, under a Session-A lease (released clean). FINDING: the item has a 48K full_brief + 14 sections but ZERO claims (never grounded) — so completion needs a FULL ledger across 14 sections, not 4 slot FACTs; that is a grounding pass (metered, or a Session-B mechanical pass now that it is id-confirmed), not a hand-drain. Primary judgment task DONE; grounding is the residual.

PARALLEL DRAIN LIVE: Session B is active (holds a lease on item 5b2c6655, lane B). Leases arbitrating correctly — Session A holds none, did not touch B's item. Mutual exclusion working in production.

Session A drain count this session: 4 verified (unchanged — eu_clean_trucking primary re-acquired but not yet grounded). Lease state (session A): clean.

## 2026-07-16 — CENSUS COMPLETE (655/655) + eu_clean_trucking primary re-acquired

METERED CENSUS (operator ruling a) — migration 212 corpus_census + scripts/_reground/census-run.mjs. Audit gate: 10 items hand-verified 10/10 accurate (9 archive_correct portals/orgs/error-pages, 1 review_valuable correctly flagged a dated Norway regulation archived as duplicate). Full run: 655/655 classified. Total spend ~$0.26 (audit $0.007 + runs; $15 ceiling never neared). Read-only, no item mutations. Fixes en route: logSpendRun per item (spend-guard ledger-drain), idempotent insert (skip duplicate pk).

CENSUS TABLE (the true corpus number + archive-endgame input):
- TOTAL 655 = LIVE 235 (verified 202, quarantined 33) + ARCHIVED 420.
- ARCHIVED Haiku verdict: archive_correct 364, review_valuable 56.
- REVIEW_VALUABLE 56 by archive_reason: reclassified_to_source 20, none/"-" 18, duplicate_instrument 12, portal_artifact 2, duplicate_of_verified 1, Repealed 1, Superseded 1, duplicate 1. These 56 are the archives Haiku flags as possibly VALUABLE unique items wrongly archived — the human-review input to the archive endgame (operator's NEXT ruling; NOT started here per instruction).

eu_clean_trucking primary re-acquired (Session A #1) — EUR-Lex 32024R1610 tier-1 161K ch, id-confirmed, repointed under lease; 0-claim brief needs a full grounding pass (residual).

FINDING: eu-csrd is TWO items — transport-provisions (9c5d1d17, no brief/0 claims) + transport-sector-implementation — BOTH canonical 32022L2464 = DUPLICATES (dedup judgment, not a drain). Surfaced.

STATUS: drain count 4 (unchanged), corpus 202 verified / 33 quarantined, census 655/655, spend ~$0.26, lease state (session A) clean. Census infra committed+pushed (629dea9e). Archive endgame NOT started (awaiting operator ruling).

## 2026-07-17 — Session B bank 4 (branch corpus-integrity/cc-grounding-executor-b, own worktree)

WORKTREE SEPARATION LIVE: Session B now runs in C:/Users/jason/dotfiles/.worktrees/wt-session-b on branch corpus-integrity/cc-grounding-executor-b (own worktree, node_modules junctioned to shared, .env.local copied). No more shared-tree push race. Bank 3 (870623cc, o13) confirmed on remote (carried forward under Session A's 558dcdf6).

NEW TOOLING (scripts/_reground): lease.mjs (standalone acquire/heartbeat/release CLI — id-stamp requires the lease already held, so caller acquires here) and reassign-to-a.mjs (annotate drain_worklist + release lease when an item is genuine judgment, no claim touched). SEQUENCING FIX: the mig-211 lease RPC treats same-holder re-acquire as HELD (acquired=false), so drain-clear (which self-leases) FAILS if the caller still holds the lease — correct order is acquire -> id-stamp --apply -> RELEASE -> drain-clear --apply (self-leases).

PROMOTION QUEUE (3 items):
- fabda0e7 (Oregon DEQ "Central Hub"): REASSIGN-TO-A. Portal/hub, source_url = DEQ index.aspx homepage, no canonical instrument; capture spans CFP+CPP+rule PDFs. Reclassify/portal-artifact judgment.
- la-eweo (LA EBEWE): PROMOTED. id-stamped Ordinance No. 184674 (enacting ordinance, raw-id match score=1) -> id-confirmed. Mechanical drain: 7 orphaned_no_prose_referent versioned out (v1, non-destructive). RESIDUAL Lane A: 8 relabel-manual (FACT->ANALYSIS judgment).
- nashville-building-energy-programs: REASSIGN-TO-A. Programs-hub, source_url = ADA page; only id is RS2022-1358 (non-binding GHG-goal resolution); benchmarking is Metro Govt's OWN 335 facilities (internal/voluntary), not a private-building regulation. item_type=regulation likely mis-set; reclassify/off-vertical judgment.

FINDING (reinforces the standing one): of 3, only 1 (la-eweo) had a single enacting instrument to id-stamp; the other 2 are programs-hubs / voluntary-goal items that need reclassify judgment, not promotion. The match/subject-overlap Lane A pool is largely portal/hub/voluntary shapes, not id-stampable instruments.

Lease state (session B): clean. Spend: $0 (all free/hand path). Live corpus counts unchanged (la-eweo still quarantined pending Lane A relabel).

## 2026-07-17 — Session B bank 5 (branch -b): match/subject-overlap queue complete

Processed the remaining 9 match/subject-overlap Lane A items (la-eweo was bank 4). FULL match/subject-overlap tally (12): 4 PROMOTED, 8 REASSIGNED.

PROMOTED (id-stamped -> id-confirmed clearance-grade):
- c8 (ISSB IFRS S2): id "IFRS S2" (raw-id score=1). 0 mechanical (34 claims); 30 relabel-manual -> Lane A.
- c5 (GLEC Framework v3): id "GLEC Framework v3" (raw-id score=1). 0 mechanical (53 claims); relabel-manual -> Lane A.
- 82f09535 (Norway World Heritage Fjords zero-emission): id FOR-2012-05-30-488 (Norwegian miljosikkerhetsforskriften, lovdata raw-id score=1). 0 mechanical (43 claims); only 5 relabel-manual (close to clearance) -> Lane A.
- (bank 4) la-eweo: Ordinance No. 184674; 7 orphaned versioned out; 8 relabel-manual -> Lane A.

REASSIGNED-TO-A (genuine judgment, no id-stampable single instrument):
- green-building: multi-standard SURVEY (LEED/BREEAM/NABERS/Green Mark/Estidama/EPBD/MEES) — no single instrument.
- uae-netzero: item_type=regulation MIS-SET; primary is UAE LT-LEDS (voluntary strategy), no legal instrument number.
- 87ed781c (Wisconsin 2023 State Freight Plan): planning framework, no formal designation (only federal cite 49 USC 70202).
- b6b7eb7d (Japan MLIT): generic 'Policy Document' title; Carbon Neutral Port INITIATIVE, no law number.
- g13 (Brazil Logistica Reversa): PORTAL SOURCE (MMA hub, no enacted primary); regime spans Lei 12.305/Decreto 10.936/portarias.
- japan-gx-freight: SCOPE MISMATCH (primary = economy-wide GX Basic Policy, titled 'Freight Transport Standards') + wrong class.
- (bank 4) fabda0e7 (Oregon DEQ hub), nashville (RS2022-1358 non-binding goal).

DISCRIMINATOR (now explicit): id-stamp promotes ONLY when a formal instrument designation is verbatim in the capture — a registry NUMBER (lovdata FOR-, FR doc-no, ordinance no) OR a formal STANDARD designation (IFRS S2, GLEC Framework v3). A descriptive document TITLE of a one-off plan/strategy/policy, a portal hub, a multi-instrument survey, or a scope/class mismatch => REASSIGN-TO-A (reclassify/rescope/re-acquire judgment). Confirms standing finding: the match/subject-overlap pool is dominated by portal/hub/policy shapes, not id-stampable instruments (4/12 promotable).

New tooling this session: lease.mjs, reassign-to-a.mjs (bank 4). Lease state (session B): clean. Spend: $0. Remaining Session B queue: 10 below-threshold subject-overlap (verify/re-acquire), 6 no-primary (re-acquire).

## 2026-07-17 — Session B bank 6 (branch -b): below-threshold queue, 2 of 10 processed

- 6a857887 (Brazil Lei 12.305/2010 PNRS): PROMOTED. id-stamped "12.305/2010" (planalto.gov.br enacted text, raw-id match score=1) -> id-confirmed clearance-grade. 0 mechanical exits (17 claims); relabel-manual residual -> Lane A. Contrast with g13 (bank 5): g13's source was the MMA portal hub with no enacted text; this item's source_url is the planalto.gov.br ENACTED LAW TEXT directly, so it promotes where g13 could not — same statute, different capture.
- c4 (ISO 14083): REASSIGN-TO-A. score=0 (below threshold). CONFLATION FOUND: pool contains EUR-Lex FuelEU Maritime text (CELEX 32023R1805 / OJ L_202302772) under an ISO-standard item — a different regulation's text pooled in error. Actual primary is a paywalled ISO catalog stub (ISO does not publish standard text free). Needs conflation-resolution (strip FuelEU Maritime rows) + thin-primary judgment.

NOTE: operator switched the Claude Code model this session; switching at this bank boundary (not mid-item), per operator instruction.

Remaining below-threshold queue (8): 0ea6a710 (NY truck/HHG), 0f46aabf (Slovenia NECP "prep initiated"), 45f85547 (WAC "navigation" hub), 576554b3 (UK Transport Decarb Plan / HGV CO2 mismatch), ad4cc6c6 (Japan Customs tariff, known needs-reacquire per prior session), bfb6a9fe (IMO air pollution overview, needs Annex VI text), g15 (Colombia MinTransporte portal), uk-secr (SI 2018/1155 likely, source is gov.uk guidance not legal text — check).

Lease state (session B): clean. Spend: $0.

## 2026-07-17 — Session B bank 7 (branch -b): below-threshold queue complete (9 items)

Finished the below-threshold queue (10 total; 6a857887 was bank 6). ALL 9 remaining REASSIGNED-TO-A -- none had a single id-stampable instrument. Several are genuine DATA-QUALITY DEFECTS worth flagging as priority (mechanical, not judgment about content):

- 0ea6a710 (NY Truck & Motor Carrier): SCOPE MISMATCH. Primary is 17 NYCRR Part 820 (household-goods movers only, verbatim-present) but title is a broad general-trucking "Framework"; pool spans DOT-number/49 CFR federal compliance far beyond Part 820. Stamping Part 820 would narrow the item.
- 0f46aabf (Slovenia NECP): STATUS CONFLICT. Title says "Preparation Initiated" but a pool row reports Slovenia ADOPTED the plan -- status may be stale. No enacted primary captured, source is the ministry portal.
- 45f85547 (Washington WAC): PURE PORTAL. Title says "Access and Navigation" -- this is the entire WAC index, not one regulation.
- 576554b3 (UK Transport Decarbonisation Plan): TITLE/PRIMARY MISMATCH + conflation. Title names the 2021 TDP policy document (present in pool) but declared primary is a DIFFERENT doc (new HGV CO2 regulatory framework PDF); pool also mixes in UK SAF mandate (aviation, separate instrument).
- ad4cc6c6 (Japan Customs FY2026): MULTI-DEFECT. jurisdiction=[AE,BD,JP] wrongly includes UAE+Bangladesh (cross-jurisdiction contamination, pool has a Bangladesh-Japan EPA article); declared primary is an Advance Ruling procedure summary, not a law; pool's full-text law block is the Customs Act at its STALE 2018-amended version, not FY2026; separate annual tariff-schedule pages are a different genre. No FY2026 amendment instrument actually present.
- bfb6a9fe (IMO Air Pollution): OVERVIEW HUB, jurisdiction=[] empty. No MARPOL Annex VI instrument text; pool is press/FAQ pages. POSSIBLE DUPLICATE of o13's IMO Net-Zero Framework subject (pool[2] same FAQ page) -- flagged for dedup check.
- g15 / 3e9c3ebe (Colombian Ministry of Transport): JURISDICTION DEFECT (mechanical). Tagged US-CO (Colorado, US state) but is unambiguously Colombia the country (ISO 3166-1 = CO). Declared primary is a 293-char near-empty portal page; generic institution title, no instrument.
- uk-secr (SECR Amendment): NO ENACTED-TEXT PRIMARY. Actual instrument SI 2018/1155 is only an unfetched stub; declared primary is a gov.uk guidance summary. STATUS QUESTION: pool dominated by ongoing Scope-3 consultations/calls-for-evidence -- the "Amendment" may be unenacted/proposed, not in force.
- c4 (ISO 14083, bank 6): conflation (EUR-Lex FuelEU Maritime text pooled under an ISO item) + paywalled thin primary.

PRIORITY FLAGS for Session A (mechanical, cheap fixes, not content judgment): g15 jurisdiction US-CO->CO, ad4cc6c6 jurisdiction strip AE/BD, bfb6a9fe possible o13 duplicate.

BELOW-THRESHOLD TALLY: 1 of 10 promoted (6a857887, bank 6), 9 reassigned. Combined with the 12 match/subject-overlap items (4 promoted, 8 reassigned): Session B promotion total across both pools = 5 of 22 (23%). The remaining 17 are genuine Lane A judgment, several surfacing NEW defects (jurisdiction mistagging, cross-jurisdiction conflation, stale document versions, title/primary mismatches) beyond the original "wrong/no/unconfirmed primary" framing.

Lease state (session B): clean. Spend: $0. NEXT: 6 no-primary re-acquisitions via the free-acquire pattern (acquire-primary.mjs).

## 2026-07-17 — Session B bank 8 (branch -b): no-primary queue complete + session close-out

All 6 no-primary re-acquisitions attempted via direct-HTTP fetch (free, curl, 20s bound, no retry on roadblock per remediation-discipline category 8). ZERO promotions this batch, but the bounded-search diligence surfaced several high-value defects beyond the original "no primary" framing:

- china-s-national-carbon-market: declared primary (mee.gov.cn) TIMED OUT. Bounded alternative search of 2 already-staged english.gov.cn Xinhua summaries: ZERO mentions of 'transport' in 59K ch. China's ETS covers power/steel/cement/aluminum only; 2027 target is 'all major industrial sectors' (no transport language). TITLE CLAIM ('Extension to Transportation Sector') NOT SUPPORTED by any sourced content.
- india-s-national-logistics-policy: declared primary 404 (confirmed dead). Real NLP launch speech (PIB, PM Modi 2022, 24.7K ch) has ZERO mentions of 'carbon intensity' -- title's entire premise appears unsupported. JURISDICTION BUG: tagged US-IN (Indiana) should be IN (India). URGENT COMPLIANCE FLAG: a CONFIDENTIAL NCAER report ("Logistics Cost in India", explicit disclosure-prohibited notice on its own cover page) was improperly staged in the pool -- unrelated to carbon intensity regardless, should never have been fetched/quoted.
- japan-s-green-transformation-gx-league: both meti.go.jp (DNS fail) and www.meti.go.jp (403 bot-block) roadblocked. Pool alternative real but thin (2 'transport' mentions/7 blocks). GX League is economy-wide voluntary pre-ETS, not transport-specific. POSSIBLE DUPLICATE of japan-green-transformation-gx-freight (bank 5).
- japan-s-updated-top-runner-program: www.meti.go.jp 403 bot-blocked. REPOINTED source_url (mechanical, KEPT) to the real freight-specific enecho.meti.go.jp 08_kamotsu.html page (30K ch, same registered METI source_id, tier 2) -- dead->working URL fix. Initial id-stamp "Energy Conservation Law" verified only against the pool-union, NOT the true single primary alone (drain-clear's strict re-check: unverified/below-threshold) -- REVERTED the stamp to null rather than leave a false clearance-adjacent state (self-correction, gate worked as designed). VALUABLE FINDING: the law was RENAMED via a 2022 amendment (省エネ法 -> 省エネ・非化石転換法) and contains SHIPPER-SPECIFIC (荷主) energy-efficiency provisions directly relevant to freight forwarding -- worth deliberate bilingual id-stamp work. 98 pre-existing claims warrant review given the primary was previously broken.
- uae-national-hydrogen-strategy-implementation-decree: u.ae timeout, uae.gov.ae 404. Pool (law-firm briefings) has ZERO mentions of 'decree'; no federal law/cabinet decree number anywhere. Same class as uae-netzero (bank 5): a voluntary strategy, title claims an unenacted implementing decree.
- uae-national-hydrogen-strategy-transport-sector: same roadblocks. LIKELY DUPLICATE of the decree item -- identical pool[0] source (nortonrosefulbright briefing) in both; only 3 'transport' mentions, no decree number either. Needs dedup judgment.

NEW TOOLING: repoint-url.mjs -- mechanical repoint of source_url to a MORE SPECIFIC url already staged in the item's own pool under the SAME registered source_id (no new source registration/tier judgment). Distinct from acquire-primary.mjs (new host + tier decision). Guards: refuses if the target pool row is <2000ch.

=== SESSION B FULL TALLY (banks 3-8) ===
- Promoted (id-stamped -> id-confirmed): 5 -- canada-clean-fuel (SOR/2022-140), bec305e1 (2024-06809), la-eweo (Ordinance 184674), c8 (IFRS S2), c5 (GLEC Framework v3), 82f09535 (FOR-2012-05-30-488), 6a857887 (12.305/2010). [7 total across full session incl. pre-compact banks 1-2]
- Mechanically drained (orphaned_no_prose_referent, non-destructive version-out): canada-clean-fuel (4), la-eweo (7). 11 claims versioned out this session's promotion lane.
- Reassigned to Lane A with a concrete finding on each: 23 items (o13, fabda0e7, nashville, green-building, uae-netzero, 87ed781c, b6b7eb7d, g13, japan-gx-freight, c4, 0ea6a710, 0f46aabf, 45f85547, 576554b3, ad4cc6c6, bfb6a9fe, g15/3e9c3ebe, china, india, japan-gx-league, japan-top-runner, uae-hydrogen-decree, uae-hydrogen-transport).
- DEFECT CLASS DISCOVERIES this session (beyond the original wrong/no/unconfirmed-primary framing): 2 jurisdiction mistaggings (US-CO/Colombia, US-IN/India -- both US-state-code collisions with country codes, likely a recurring classifier bug worth a corpus-wide sweep), 2 conflations (c4 FuelEU-Maritime-in-ISO-item, ad4cc6c6 cross-jurisdiction AE/BD-in-Japan-item), 3+ likely duplicate pairs (bfb6a9fe/o13, japan-gx-league/japan-gx-freight, uae-hydrogen-decree/uae-hydrogen-transport), 1 confidentiality violation (india's improperly-staged NCAER report), 2 title-fabrication flags (china transport-extension, india carbon-intensity) where the item's premise is unsupported by any sourced content, 1 self-corrected over-loose promotion (japan-top-runner).
- Worktree separation (operator ruling) executed cleanly: own git worktree, junctioned node_modules, copied .env.local, zero shared-tree push conflicts across 6 banks post-separation.
- Model switch (Opus->Sonnet) executed cleanly at a bank boundary per operator instruction, no mid-item interruption.
- Spend: $0 across the entire session (all free/hand/direct-HTTP path). Lease state (session B): clean at every bank.

Lane A now carries 23 items PLUS Session A's own queue, each with an evidence-based finding rather than a bare "not id-confirmed" classification -- meaningfully de-risks the next judgment pass. Chokepoint did not hold work at unusual rates post-switch; no anomaly to flag.

## 2026-07-17 — Session B CONTAINMENT BANK: NCAER confidentiality incident traced + contained

Operator dispatch (addition to the containment order): complete the trace on the confidentiality finding surfaced during bank-8 (india-s-national-logistics-policy-carbon-intensity-standards, pool[2]) and write a formal incident record.

TRACE RESULT (full detail: docs/compliance/confidentiality-incident-2026-07-17-ncaer.md, first entry in a new docs/compliance/ directory):
- Confirmed: dpiit.gov.in/static/uploads/2025/07/b6c9db15ce083fd10caa9787bf8a281f.pdf is a CONFIDENTIAL NCAER report ("Logistics Cost in India", explicit disclosure-prohibition on its own cover page), 35 pages, unrelated to the item's carbon-intensity subject.
- ORIGINAL pipeline fetch (2026-06-06) was CDN-BLOCKED (Akamai Access Denied) -- the corpus's own stored excerpt (269ch) is an error page, NOT document content. Zero confidential text was ever stored in the corpus at any point.
- Session-B's OWN investigative re-fetch (this session, browser user-agent) succeeded (HTTP 200, no auth, CDN-cached) -- confirming the host serves the document publicly with no access control. Local investigative copies (PDF + extracted text) were already deleted during routine bank-8 tmp cleanup, never committed, never written to any corpus table.
- GROUNDING EXPOSURE: zero claims ever grounded via this pool row (search_result_id match = 0); zero claims via the registered dpiit.gov.in source (which points to a DIFFERENT url, the logistics-division page, unaffected). Nothing reached a customer surface.

CONTAINMENT ACTIONS (guarded writes, cited, non-destructive -- row preserved for audit, only the extractable content redacted):
- agent_run_searches row a5299625 result_content_excerpt replaced with an explicit containment-hold marker (do-not-refetch, links the incident record).
- Grounding structurally blocked as a consequence: nothing extractable remains in the row; no source-level block needed since the confidential PDF was never itself a registered source.
- Incident record authored and committed this bank (docs/compliance/, new standing directory for legal/third-party-exposure incidents, distinct from this technical session log).

NOTE ON THE PARALLEL DISPATCH: operator also issued a DISPATCH for an operator_review_queue admin surface (migration + intake wiring + admin page + doctrine entry operator-escalations-have-one-door), explicitly scheduled for after the review lane, not built this bank. The incident record above notes it as the intended backfill target once that infrastructure lands.

Lease state (session B): clean (this item was not under an active lease during the trace -- read/trace + one guarded redaction, no drain-clear/id-stamp mutation). Spend: $0.

## 2026-07-17 — Session B RELAUNCH, intake-drain phase: review-lane restores + priority gap-table items

Pulled origin/corpus-integrity/cc-grounding-executor-b (no new commits since last bank) and origin/corpus-integrity/cc-grounding-executor (Session A's review-lane bank 1: restore-to-live tool + 7 named RESTOREs, archive endgame 198 removals, Session C's coverage_gap_candidates COMPLETE). Queue = 5 named quarantined RESTOREs (007f42b1 TxDOT, g27 UN SDGs, 120529b8 ITF 2019, t5 Carbon Pricing Dashboard, o12 Blue Visby) + watched for EEXI/CII and EU MRV per operator priority; both landed mid-pass (93c344a1, o6) and were pulled forward.

RESTORE QUEUE (5 items, 0 promoted, 5 reassigned -- all judgment/acquisition cases, no id-stampable formal designation reachable with a usable capture):
- 007f42b1 (TxDOT Freight Planning): same class as Wisconsin State Freight Plan (87ed781c) -- state DOT plan, no formal instrument designation.
- g27 (UN SDGs 9 & 13): SCOPE QUESTION not mechanical -- both 'SDG 9' and 'SDG 13' individually raw-id-confirm, but the item deliberately pairs both and the tool has no dual-identifier field; stamping one would misrepresent the item's declared dual scope. Same class as the EU 2019/880 scope-question the operator named.
- 120529b8 (ITF 2019 General Rules): both primary candidates Cloudflare bot-blocked (confirmed via direct retry); likely off-vertical (ITF's own founding/governance document, not freight-sustainability substance); jurisdiction=[] empty.
- t5 (World Bank Carbon Pricing Dashboard): ZERO staged pool (restored pre-capture-standard) -- per phase rule, reassigned WITHOUT acquiring; pre-researched and confirmed-fetchable acquisition candidate left for Session A (World Bank "State and Trends of Carbon Pricing 2025" report PDF, official documents1.worldbank.org, HTTP 200 confirmed, not yet fetched/registered).
- o12 (Blue Visby Solution): ZERO staged pool -- same phase rule, reassigned without acquiring; declared source_url confirmed reachable (HTTP 200), straightforward acquire-primary.mjs case for Session A.

PRIORITY ITEMS (EEXI/CII + EU MRV, both landed and drained same bank):
- 93c344a1 (EEXI and CII): self-corrected an over-loose id-stamp (MEPC.328(76) confirmed against the pool-union of 23 rows, NOT against the true single declared primary -- imo.org FAQ page has zero MEPC citations in its own text). Reverted per the japan-top-runner precedent. ROOT CAUSE FOUND: the pool row meant to carry the actual resolution PDF has a TRUNCATED URL (wwwcdn.imo.org/.../MEPC.328(76 -- missing closing paren + file extension) causing BlobNotFound. High-value, easy fix flagged for Session A: correct the URL, re-fetch, then id-stamp will hold.
- o6 (EU MRV Regulation): PROMOTED. Declared primary (mrv.emsa.europa.eu, EMSA THETIS-MRV portal) was dead (0ch); the real enacted primary (EUR-Lex Regulation (EU) 2015/757, tier 1) was already staged under a different URL, verified directly against the true block text (not pool-union) before acting. Registered a new per-document EUR-Lex source + repointed + id-stamped "2015/757" -> match/instrument-id score=1, CONFIRMED against the true single primary (drain-clear independently verified id-confirmed=true). 0 mechanical exits, 51 claims, only 4 relabel-manual residual -- close to full clearance.

BUG FOUND + WORKED AROUND (root cause NOT patched, flagged for proper fix): registerSource() in scripts/lib/db.mjs dedups new source registrations by institutionKey(url), which falls back to the BARE HOST for any host not listed in SHARED_PORTAL_KEYDEPTH. eur-lex.europa.eu is NOT in that map, so institutionKey() collapses every distinct EU regulation's EUR-Lex URL to the same key -- registerSource() silently returned an UNRELATED existing source_id (Regulation 2019/1242's row) when registering 2015/757. Caught before commit via the drain-clear independent re-verification (would have shown id-confirmed=false against a mismatched source), fixed for o6 with a direct guardedInsert bypassing the buggy dedup. THIS WILL RECUR on every future EU regulation registered via registerSource() or acquire-primary.mjs, including Session A's normal acquisition lane -- needs SHARED_PORTAL_KEYDEPTH updated for eur-lex.europa.eu (note: the CELEX-query URL style differs from the ELI-path style; a path-depth fix alone won't cover both, needs care) plus ideally a golden test. NOT fixed in this bank (shared codepath, deserves a deliberate fix, not a rushed mid-item patch).

METHODOLOGY LESSON (2nd + 3rd instance, now a standing habit): id-stamp.mjs verifies against the POOL-UNION (snapshot + all >200ch pool rows); drain-clear.mjs verifies against the TRUE SINGLE declared primary only. These can disagree (japan-top-runner, 93c344a1 both over-promoted on pool-union, self-corrected). From o6 onward: verify the designation directly against the SPECIFIC true-primary block's text BEFORE stamping, not just via id-stamp's looser pool-union check -- catches the mismatch before the write, not after.

Counts: provenance_status now {unverified:57, verified:253, quarantined:141, pending_human_verify:5} (total corpus grew since last check via Session A's restores + Session C's coverage work; quarantined count includes all restored-but-undrained items). Session B this pass: 1 promoted (o6), 6 reassigned (007f42b1, g27, 120529b8, t5, o12, 93c344a1). Lease state (session B): clean. Spend: $0 (direct HTTP + WebSearch only, no metered grounding).

## 2026-07-17 — Session B intake-drain (cont.): CORSIA promoted + 5 more reassigned

Operator relaunch update mid-pass: queue expanded to 23 restored items (56 quarantined total), priority list expanded to CORSIA + EU MRV + EEXI/CII (EU MRV + EEXI/CII already banked previous entry). Applied the verify-against-true-primary-block lesson from the start this pass (no more over-loose stamps).

PRIORITY — CORSIA (a1/cc0958fb): PROMOTED. id-stamped A42-22 (ICAO Assembly Resolution establishing/updating CORSIA), confirmed VERBATIM in the TRUE declared primary block (icao.int default.aspx) before stamping. match/raw-id score=1, drain-clear independently confirmed id-confirmed=true. 0 mechanical exits (36 claims); 17 relabel-manual residual. NOTE: initial lease.mjs key lookup on "a1" matched the WRONG item (uuid-prefix collision, a1fd9574 "Getting to Zero Coalition") -- caught before touching it, released, re-acquired by correct uuid. Same ambiguity class as the earlier c4/china-prc mismatch; resolving by exact uuid upfront now standard practice for short legacy_id keys.

5 more processed, all REASSIGNED with concrete findings (0 promoted this batch):
- g8 (EPA SmartWay): no id-stampable instrument -- voluntary EPA partnership program, no CFR number; item_type=standard likely mis-set; CONFLATION found (pool contains bec305e1's own already-promoted HD-vehicle GHG Federal Register stub + an unrelated freight-plan RFI stub).
- c6 (GHG Protocol): MULTI-STANDARD HUB, same class as green-building -- true primary is the umbrella homepage listing 5 distinct standards (Corporate/Scope 2/Scope 3/Land Sector/Product); stamping one would narrow the item's declared umbrella scope.
- c7 (SBTi): org homepage, item_type=regulation WRONG (SBTi is voluntary, no legal instrument); ACQUISITION OPPORTUNITY -- the real 'SBTi Corporate Net-Zero Standard' PDF is referenced but unfetched (44ch stub).
- g28 (IPCC Climate Reports): item_type=regulation WRONG (scientific assessment, research_finding format); declared primary (AR7) is explicitly IN-PROGRESS/unpublished (author calls, not a finished report); likely overlaps with 85a7a629.
- 85a7a629 (IPCC Special Report on Cities, second-order draft review): title itself confirms pre-publication status (targeted March 2027 release); item_type correctly research_finding but no finished instrument exists yet to ground.

METHODOLOGY CONFIRMED WORKING: the true-primary-block-first verification (applied to CORSIA and every item since) caught zero false starts this batch, versus 2 false starts (japan-top-runner, 93c344a1) before the lesson was codified.

Counts: provenance_status {unverified:57, verified:253, quarantined:141, pending_human_verify:5} (o6/CORSIA promotions not yet reflected in this snapshot pending Session A's downstream validate pass on the relabel-manual residuals -- both are id-confirmed clearance-grade but still carry a few claims pending relabel before full VERIFIED status). Session B this pass: 1 promoted (CORSIA/a1), 5 reassigned. Lease state (session B): clean. Spend: $0.

## 2026-07-17 — Session B intake-drain (cont.): queue fully drained (8 more reassigned, 0 promoted this batch)

Processed the remaining 8 items from the expanded 23-item restore queue. All REASSIGNED (0 promoted) -- this batch skewed toward org-homepage/voluntary-strategy/zero-primary shapes rather than id-stampable instruments, consistent with the standing finding.

- g20 (Singapore Green Plan 2030): national strategy, no instrument number (same class as uae-netzero/Slovenia NECP). CONFLATION: pool mixes in a DIFFERENT, narrower MPA maritime circular ("No. 12 of 2024", Green Ship Programme) that has its own real designation.
- g24 (ASEAN Transport Strategic Plan): CURRENCY/SUCCESSION judgment -- the named 2016-2025 plan (Kuala Lumpur Transport Strategic Plan) is EXPIRED; a 2026-2030 successor is in development, not yet published. jurisdiction=[ID,MY,PH,SG] covers only 4 of 10 ASEAN members, worth checking if deliberate.
- g16 (IDB Sustainable LatAm Transport): org topic page, item_type=regulation WRONG (IDB is a development bank, not a regulator); jurisdiction=GLOBAL questionable for a LatAm-specific institution.
- cea40062 (Brazil National Logistics Plan / PNL 2035): planning document, no decree number, same class as TxDOT/Wisconsin.
- db8577c6 (Georgia GDOT freight framework): same planning-doc class; true primary has no verbatim designation, but LEAD found -- "HB 617" (Georgia House Bill) appears in linked PDF filenames only, worth investigating as the real funding statute.
- g11 (CEC North American Env Policy): JURISDICTION BUG -- tagged [MX,US], MISSING CANADA (the CEC/Agreement on Environmental Cooperation is trilateral, confirmed by a staged canada.ca page naming all three governments). Also wrong primary (EPA's own description page, not the treaty text, which IS staged separately at cec.org and is a real repoint/promotion candidate).
- bcd84403 (ESMA MiCA crypto-asset deadline): zero staged primary (phase rule, reassigned without acquiring) PLUS a genuine relevance question -- MiCA governs crypto-asset service providers, no evident freight-sustainability nexus; flagged, not asserted (relevance calls are Session A's per the scope-is-broad ruling).
- 3 regional operations profiles (Australia climatechangeauthority.gov.au, Brazil antt.gov.br, China npc.gov.cn): all zero staged primary, item_type=regional_data correctly set in all three (unlike most of this session's mis-typed items), straightforward acquire-primary.mjs cases with a scoping decision each (esp. China's NPC, a broad legislature needing a freight/sustainability-specific scope, not the whole portal).

QUEUE STATUS: drain_worklist Lane A now 56 rows total; 54 touched by session-B across this relaunch (all of the 23 restores + the pre-existing pool from before relaunch), 2 untouched and confirmed NOT mine (eu_clean_trucking_2024_1610, eu-csrd survivor -- both pre-existing Session A judgment items, verified by id). Session B intake-drain queue is FULLY DRAINED as of this bank.

SESSION B RELAUNCH TOTAL (this intake-drain phase, both banks): 2 promoted (CORSIA/A42-22, EU MRV/2015-757, both verified against their TRUE single primary), 21 reassigned, 1 in-flight class bug found+worked-around (registerSource/eur-lex host-collision), 1 truncated-URL root cause found (EEXI/CII), multiple jurisdiction bugs found (g11 missing Canada; earlier g15/india also found this session). Lease state (session B): clean. Spend: $0.

Counts (live, concurrent with Session A): provenance_status {unverified:57, verified:241, quarantined:131, pending_human_verify:5}.

## 2026-07-17 — Session B relaunch check: queue confirmed still empty, no new restores

Operator re-issued the relaunch dispatch (same text: 56 quarantined total, 23+ restored items, CORSIA/EU MRV/EEXI+CII priority). Pulled worktree branch (already up to date, no rebase needed), re-queried `drain_worklist` fresh rather than assuming the repeat dispatch implied new work.

Result: 56 total rows, all lane A, 54 carry session-B REASSIGN/PROMOTE notes from the prior two banks, 2 confirmed pre-existing Session A items (`eu_clean_trucking_2024_1610`, `eu-corporate-sustainability-reporting-directive-csrd...`, both `assigned_by=lane-split.mjs`, not session-B). Zero rows are unclaimed Lane B work. Zero session-B leases held (`mutation_leases` query, 0 rows). No new RESTORE verdicts have landed from Session A's review lane since the last bank.

No items processed this check (nothing to process). No commit needed beyond this log entry (tmp probe scripts cleaned before this write, per protocol). Standing by for either new restores landing in `drain_worklist` or an explicit operator signal to start the deferred `operator_review_queue` build.
