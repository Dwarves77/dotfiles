
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
