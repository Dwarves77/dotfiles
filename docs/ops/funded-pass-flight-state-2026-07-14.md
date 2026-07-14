# Funded-pass sanctioned run — flight state (2026-07-14, pre-compaction handoff)

Durable resume anchor for the sanctioned machine-gated grounding run. Related:
[data-audit-dispositions](../data-audit-dispositions.md) ·
[reattribution-worklist-2026-07-14](./reattribution-worklist-2026-07-14.md) ·
[session-log](./session-log.md).

## Standing state
- **Lock OFF** (GROUNDING_ACQUIRE_ENABLED unset; process-scoped, never persisted). **Pass PAUSED.**
- Master at merge of **#328**. Spend so far: **~$7.4** ($3.97 RE-SYNTH + ~$3.47 ACQUIRE 4 items).
- Signed caller for the run = `unit3-remediation`. Worklist: `fsi-app/scripts/tmp/funded-pass-worklist.json` (25 items; **DERIVE FROM holdings_quality once built, not this stale sheet**).

## Merged this flight
- **#325** rails — acquire lock is the single clean master gate; verify-item requires a data-existence citation only (priced-line retired); `assertAcquireAllowed` at the ground spend site.
- **#326** funded-pass runner + core goldens (lock arm/disarm both paths, classifyFailure, hardDivergence, spendWatch).
- **#327** data-audit lane branch-(b) waiver (block `cfb1799a`, **until 2026-07-28**) + closed the runner's Layer-C block-gate bypass + timeout 300s→1200s. Diagnosis: 3 checks (one-tier-per-host, claims-tier 264, ledger-onepass/c4) all **pre-existing** (flight caused 0/264), surfaced by the 07-13 124-host tier-correction batch. Fix owed by the reattribution-relabel + tier-canonicalization unit.
- **#328** close the fetch-when-held failure class — `holdings-gate.mjs` fetch-seam guard (refuse fetch when real snapshot OR ≥2 pool rows; `forceRefresh` only escape), precondition posture on the spend ticket + precondition-gap alarm, runner **stored-first** + spending-without-effect tripwire, doctrine `no-execution-from-stale-state` (RD-33 + skill category 19).

## STEP 3 RE-SYNTH 8 — DONE (settled DB truth)
**3 verified:** l2, o5, uk-si (474ab4cd). **5 held** (quarantined, valid=false — re-ground from held pool didn't clear floor/slot): o13, sb261, sb253, l7, c8. $3.97. (Run-log said 1 verified — 300s timeout raced read-backs; settled truth = 3. Fixed in #328.)

## STEP 4 ACQUIRE — HALTED by operator (redundant-fetch finding), then re-scoped
- 4 items ran before halt (o9, china, canada, india) — all held on `fact_below_authority_floor` **near-misses** (o9 grounded 41 FACTs at T2 sdir.no; held on 2 residual sub-floor + 1 unlabeled_assertion — the reattribution-relabel debt, NOT a fetch failure). **o9 marked spent** (one-paid-pass).
- **Operator caught redundant re-fetching:** most ACQUIRE items already hold substantial content in Supabase (raw_fetches: ukrtfo 232KB, brazil 147KB, ukdecarb 97KB, o9 76KB, nydot 37KB, usepa 11KB; + pool rows). Only **4 genuinely thin** need a real fetch: **g19, imo377, zecorr, glec** (stub snapshot AND ≤1 pool row).
- The stored-first fix (#328) makes this structural going forward.

## Facts to carry
- **All 25 worklist items are `quarantined`** (verified count pre-run = 0). No verified customer brief is mutated by the run; they flip quarantined→verified via the sanctioned path only.
- `verticals`/`vertical_tags` arrays are **empty corpus-wide** for these items (why-lines derive from topic_tags/transport_modes/jurisdiction/severity).
- Manifest mislabel caught: CELEX 52023PC0445 (40c05a1e) = **Weights & Dimensions Directive**, not "ReFuelEU".
- Snapshot table = `raw_fetches` (html_bytes); pool = `agent_run_searches.result_content_excerpt` (>200ch = usable).

## PENDING — awaiting operator, in order
1. **HOLDINGS AUDIT (resume gate).** Proposed `holdings_quality` table (per-capture completeness NO-KNOWN-DEFECT/TRUNCATED/FURNITURE/STUB + evidence, publisher-shape rules for EUR-Lex/legislation.gov.uk/Federal Register/gazettes; sufficiency via free-pass core; verified-side stale-evidence check on 182 items; truncation-cause report on the 60KB cap). **AWAITING: table-shape approval + new-table-vs-columns + apply_migration.** This is the one metadata write; read-only otherwise.
2. **Amendment 2 — fetch-align-diff re-collection engine** (Wave-β B3): structural align per publisher shape + span-match unchanged + delta-extract changed → amendments to item timeline. The truncated-capture list runs through it. Strategic framing: the incomplete corpus is this engine's test set; each re-collection heals the corpus AND exercises the customer feature.
3. **Retro-apply audit** (ruling 4): mint/flip/register live-precondition inventory + gap closure (fetch done via RD-33). Prelim: mint = mint-item.ts::sourceLinkDecision (resolves source live); flip = set_provenance_status trigger re-runs validate on live claims; register = registerCitedSources live dedup — all appear to have live checks; confirm + close gaps as one unit.
4. **Protocol docs** (rulings 2+3): dispatch-discipline (effectful constraints name enforcement or are logged trust-the-executor with explicit "unenforced" disclosure) + run-structure (ascending cost/irreversibility tiers, halt-review between).
5. **RESUME the pass** against the corrected inventory, ascending tiers: stored re-grounds → the 4 genuine fetches → truncated re-collections priced by facts on the audit's numbers.
6. **STEP 5 CLOSE:** disarm lock (already off), certify T9 from per-gate evidence, register-step flip count vs the 2,460-span debt, Unit-3 exit distribution + quarantine count, actuals total, held-items-with-blockers, duplicate-captures list, board + /done + commit, reattribution-relabel post-run size.
