# Hardening build — resume handoff (2026-07-16)

Bank-and-resume under the operator's FINAL RULING BLOCK (standing authority for the whole remainder; zero new
approvals needed). Branch: `hardening/phase-a-mint-gates` (off master, pushed). Next session continues here.

## Standing rulings (in force)
- Mint-gate flip: DONE (live). S-CONFLATE hard hold, S-NUMERIC soft hold.
- Phase E hold-loop standing bound: **$100 gross**, tracked on authoritativeCumulative. Satisfies E4 arming.
- A2 excludes provisional sources (they resolve nothing until promoted). Stop-and-report if excluding them
  trips >20% of resolution on healthy grounds.
- Non-regression check mandatory on any gate change (before/after query; zero verified item wrongly un-verifies).
- Hard stops only: non-regression fail, spend approaching $100, dominance/RD-36 not preservable, meta-gate
  unfixable. Bank + report + name the resume point.

## DONE (committed on branch, meta-gate 89 invariants / 56 doctrines green)
- Phase A1 seams: H3 shared matcher `0f7fba9`, seam-1 resolver status-filter `a63921d` (RD-39), seam-3
  no-generic trend guard `057b0d0` (RD-40, baseline 205), evaluator+calibration `4c30b84` (RD-41), report-only
  wiring `a04f918e`.
- **Flip live `922825ec`**: migration 206 (`mint_hold_reason` + `validate_item_provenance` `fact_mint_hold`
  criterion, APPLIED), canonical-pipeline live wiring (S-CONFLATE marks mint_hold_reason, S-NUMERIC writes a
  data_quality integrity_flag `mint_gate_s_numeric`), golden `mint-gates-live-hold.golden.mjs` (12/12).
  Non-regression PROVEN (196 verified, 194 valid, 2 pre-existing drift). Hard-hold proven live-reversibly.

## Representative calibration (the flip-gating number, for the record)
All four gates clear the 20% stop on verified/healthy grounds: S-CONFLATE 0.2%, S-NUMERIC 5.4%,
authority-floor 1.7%, generic-source 6.3%; overall 13.2%. (Contaminated most-recent 29.6% authority-floor was
the sub-floor C3 re-ground sample.) Tool: `scripts/verify/mint-gate-calibration.mjs --representative`.

## NEXT (Build order, all ruled GO, no approvals)
1. **Build 2 = E3 hold-resolution loop** (per the E1 design below). New migration `hold_resolution_queue`
   table (entity_ref, hold_class, next_action, attempts jsonb, state, escalation_reason, deferred_until);
   enter/exit keyed off the provenance triggers so a hold cannot exist without a queue row. Resolution ladder:
   seek primary (existing discovery rung) -> capture free-first (Chrome adapter deferred) -> re-ground through
   the pipeline (mint gates included) -> exit on floor-clearing re-ground -> earth-exhaustion after N variants
   across M endpoints, escalate with the full search record. Spend governance: standing $100 bound, one-paid-
   pass per entity per mechanism, holdings-gate, no-gain tripwire, GROUNDING_ACQUIRE_ENABLED run-scoped/off at
   rest. Interactions: loop is a funded-pass caller (takes run-lock RD-38, polls emergencyPaused, passes
   dominance guard RD-36); a re-ground into a NEW hold records the finding, never cycles. Cycle safety: same
   mechanism fails twice -> hold for operator review. Goldens: entity enters -> resolves -> exits verified-
   eligible; twice-failed escalates; a run respects bound + lock. Doctrines: `holds-are-conveyor-not-parking`,
   `hold-resolution-under-standing-bound`. Commit per increment.
2. **Build 3**: configure the $100 bound, ARM the loop, run the first drain pass. Free rungs first; paid
   residual under the bound; S-NUMERIC soft holds live-verified (Chrome rung where available; fix citation if
   the figure confirms, correct content only if it does not). SPENDS — under the $100 bound, hard-stop near it.
3. **Build 4 = A2** (own PR): per-document source keying (registerSource key-depth for EUR-Lex / FederalRegister
   / planalto so each instrument is its own source at its true tier) + backfill, provisional excluded, scoped
   by the calibration data. Also resolves the host-collapse residual from seam 1.
4. **Build 5**: close report — three-state per finding, drain results itemized, spend actuals vs $100,
   non-regression proof, doctrine register delta, meta-gate green.

## E2 drain estimate (input to the $100 bound, already priced)
Queue (live): 39 quarantined items (38 reg-family), 538 null-source facts / 71 items (~280 hold-to-find).
Rough expected drain ~$25-100 gross, most resolving FREE (pool re-stamp / registration). Segments: hold-to-find
null-source ~$5-40; quarantined reg floor-holds ~$15-50; ISO 14083 ~$2-4; af277afd ~$0.5-2; hold #11 ~$0.5.

## Findings flagged (not blockers)
- EU 2023/959 (VERIFIED) fails `source_not_active` — a Task-3 source suspension hit a verified item's source_id
  (verified-item-on-suspended-source drift). Albuquerque (VERIFIED) fails `unlabeled_assertion`. Both pre-date
  the flip; corpus-hygiene, own disposition.
- 449 provisional sources resolve facts in the grounding resolver (active-only gap) — A2 excludes them (ruled).
- S-NUMERIC writes one integrity_flag per re-ground — flag lifecycle managed by the E3 loop.
