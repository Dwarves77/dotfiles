# Build-phase spend regime — declaration, retro-sweep, actuals ledger (2026-07-15)

Operator ruling 2026-07-15. Declares the **BUILD-PHASE** spend regime explicitly, sweeps the steady-state
siblings to information-only, and stands up cost accuracy as a first-class input to the coverage-floor unit.
Config: `fsi-app/src/lib/llm/spend-regime.mjs`. Doctrine: `build-phase-spend-regime` (register). Related:
[operator-sets-cost / RD-31], [spend-watch disposition](spend-watch-disposition-2026-07-15.md).

## 1. The regime (declared)
**BUILD-PHASE.** No pace guards, daily/rate targets, floors, or standing dollar figures of any kind govern build
work. The three controls that remain — all already built:
- **AUTHORIZATION** — an operator go: a bound where the operator writes one, or an OPEN authorization where the
  work class is ruled (e.g. free URL-presence registrations, SC-13). Enforced by RD-31 (no paid row without an
  operator-priced line).
- **INTEGRITY** (waste, not speed) — holdings-gate, one-pass, dominance guard, no-gain tripwire, spend-ticket +
  drained-ledger invariant.
- **MEASUREMENT** — spend-watch as pure accounting: every paid row traceable (priced-line marker) +
  posture-carrying; actuals per item/class/model; cost-shape anomalies surfaced as FINDINGS, never blocks.

**STEADY-STATE** (pace policy, delegated-pricing) is DEFINED in the coverage-floor / Unit-5 work and switches on
at cadence-flip — deliberately, by ruling, never by default. `SPEND_REGIME` env can flip it; default build-phase.

## 2. Retro-check sweep — steady-state standing figures, and their status
The spend-control refactor (2026-07-13, `operator-sets-cost`) already retired most standing figures for the paid
pipeline. This sweep confirms each and names the residuals. **None gates build work today.**

| # | Standing figure / guard | Location | Governs build? | Status under build-phase |
|---|---|---|---|---|
| 1 | Monthly ceiling ($75→$130) | `spend-client.ts` `MONTHLY_TOTAL_DISPLAY_USD` | no | ✅ Already **information-only** (2026-07-13). |
| 2 | Standing `SPEND_CEILING` comparison | `spend-guard.mjs` `assertBudget` | no | ✅ Already **removed** — `standingCeilingUsd` param ignored; only a per-ticket operator cap gates. |
| 3 | Spend-watch %-of-ceiling / lock-master-gate | `spend-health.mjs` (the "pace guard") | monitor | ✅ **Reconciled 2026-07-15** to traceability-only (commit `4da0169`); lock informational. |
| 4 | `SPEND_CEILING_USD = 85` | `generation-config.ts` → used as a **default per-ticket cap** in `scripts/run-4c-relabel.mjs` (`budgetCapUsd`) | yes (one build runner) | ⚠️ **The one build-path residual.** Passed vestigially to `assertBudget` elsewhere (ignored there). CONVERT: `run-4c-relabel` should take an operator `--bound` (like `funded-pass`), not a standing $85. Flagged, not yet changed (4c-relabel isn't running). |
| 5 | `RUNAWAY_ITEM_USD = 3.0` | `funded-pass-core.mjs` `isRunaway` | no (finding) | ✅ Already **flag-only** (item flagged RUNAWAY, run continues; never halts). Reframe as a class-relative cost-shape FINDING (a $5 item in a $0.40 class) — enhancement, not a block. |
| 6 | `daily-cap` | `run-intake-cycle.ts` (autonomous RUNTIME path) | no (build bypasses) | 🔵 **STEADY-STATE** — governs the autonomous intake cycle, not build (`funded-pass` drives the pipeline directly). Defined/re-enabled at Unit-5, not now. |
| 7 | Per-item 1h cooldown; 4h scan/spot-check | `/api/agent/run`, `/api/admin/scan`, spot-check | no (build bypasses) | 🔵 **STEADY-STATE** — runtime pace guards; build runs direct. Defined at Unit-5. |

**Conclusion:** the build path is already clean except residual #4 (`run-4c-relabel`'s standing $85 cap) — convert
to an operator bound. #6/#7 are runtime steady-state controls (correctly dormant for build). #5 is already a
finding. Awaiting your nod to convert #4.

## 3. Actuals ledger (cost accuracy — coverage-floor input)
Measured `agent_runs` spend, month-to-date. **This is the measured reality the coverage-floor gets priced against.**

**Per class (fetch_method):**
| Class | Rows | Total $ | Mean $ | p95 $ | Max $ |
|---|---|---|---|---|---|
| `spend-call` (grounding chokepoint) | 906 | 97.01 | 0.107 | 0.574 | 1.023 |
| `stored-pool` (resynth full-ground) | 13 | 9.70 | 0.746 | 1.573 | 2.020 |
| `4c-judge-reconcile` | 1 | 0.41 | 0.414 | — | 0.414 |
| **MTD total** | | **≈107** | | | |

**Per-item cost (measured):** a full re-ground runs **~$0.3–$2.0/item** (multiple sub-calls; resynth mean $0.75/row).
Price the 78-item C3-floor re-attribution pass against this, not a guess.

**Cost-shape FINDINGS (surfaced, not blocked):**
1. **60% of MTD spend ($65 of $107) is on null-item rows** — a per-item attribution gap (mostly the pre-freeze
   early-July grounding). Go-forward attribution is improved by the priced-line markers + the bound's
   authoritative-cumulative fix (both landed this session).
2. **High-cost outliers:** uk-rtfo **$4.63** (17 rows, the Wave-3 null-excerpt item — retries), Brazil $3.09,
   NY-truck $3.26. Not blocks; flags for triage.
3. **No `model` column on `agent_runs`** → per-MODEL ledger (Sonnet vs Haiku) isn't cleanly available (only
   inferable from cost/class). Adding a `model` column would make per-model cost first-class — directly serves
   the model-tier rule. Recommended follow-up.

## 4. Steady-state (deferred, by design)
Pace policy and delegated-pricing rules are DEFINED in the coverage-floor / Unit-5 work and switch on at
cadence-flip, by ruling. Until then nothing evaluates a steady-state default against build work.
