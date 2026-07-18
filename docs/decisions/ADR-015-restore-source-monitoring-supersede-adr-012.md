---
id: ADR-015
title: Source-monitoring is the operating design (founding intent restored); ADR-012's manual-by-design reframe superseded
status: accepted
date: 2026-07-18
scope: fsi-app intake/discovery model, ADR-012 supersession, crawl-rebuild framing, /api/admin/run-intake owed surfaces
supersedes: ADR-012 (intake-cadence manual-by-design reframe) in full
related: ADR-012, ADR-013, RD-11 (F16 fetch-hold gate), RD-20 (staged-transit), doctrine register research-is-horizon-scan, docs/audits/dormant-systems-audit-2026-07-18.md, founding commit a8cd8d1a
---

# ADR-015 — Source-monitoring restored as the operating design

## Decision (operator ruling, Jason, 2026-07-18)

The founding design is the operating design. Caro's Ledge is a source-monitoring system that
discovers new regulatory instruments on a cadence and feeds them through the intake pipeline. Manual
entry is not the model. ADR-012's reframe of manual intake as permanent design intent is superseded
in full.

This ruling follows the dormant-systems audit
([dormant-systems-audit-2026-07-18](../audits/dormant-systems-audit-2026-07-18.md), Session E), which
established that the discovery layer was designed at founding, partly built, materially completed in
code (PRs #252/#253 landed real change-detection and portal deep-link discovery dormant), and then
frozen operationally during a spend crisis (commit `11c008c2`, 2026-07-12/13), after which ADR-012
relabeled the freeze as design intent.

## 1. The founding design is the operating design

The founding commit `a8cd8d1a` (2026-04-04) defines the product: "Not a regulation tracker, a source
monitoring system... The system monitors sources. Sources produce intelligence items. Manual entry is
not the model." That text is still in force verbatim in `fsi-app/.claude/CLAUDE.md`. It is the winner.
It stands unamended; ADR-012's contradicting text is what moves.

The audit's governance-divergence findings G-3 (the live doctrine-vs-doctrine contradiction between
ADR-012's "operating design, not a temporary safety posture" and the founding source-monitoring text)
and G-6 (the `research-is-horizon-scan` register entry describing an autonomous-intake feedstock that
cannot currently run) are resolved by this ruling in favor of the founding text. The
`research-is-horizon-scan` register entry gains a named feedstock-gap residual in the same change that
lands this ADR (the crawl rebuild's wave three discharges it; see the audit section 5.2 G-6 and the
crawl spec's coverage-honesty table).

## 2. ADR-012's manual-by-design reframe was a mislabeled freeze

ADR-012 (2026-07-11) stated: "The scrape/intake operating model is operator-fired manual runs... This
is the operating design, not a temporary safety posture." The audit established this sentence
describes a spend-crisis freeze, not a design decision: the freeze commit `11c008c2` took the one
scheduled discovery-adjacent job (the check-sources hourly tick) off cadence as part of the
snapshot-first spend-safety rebuild (PR #295), and every dated session-log entry from 2026-07-13
through 2026-07-18 reaffirms cadence OFF as a standing spend constraint, not a design terminus.
Manual-only intake was the interim safety posture during the spend crisis. It is not the model.

### R5 dispute, recorded as specified (asserting neither side)

ADR-012's header asserts "operator ruling, Jason, 2026-07-11, transmitted-as-written." The operator's
2026-07-18 conduct and the dispatch record (a dedicated forensic session was needed to answer "wasn't
this system designed to scan for regulations?") dispute that the permanent-manual sentence carried
operator intent. This ADR records the dispute and asserts neither side: unresolved as historical fact,
moot as doctrine because this ADR supersedes ADR-012 either way. Whether the reframe language was the
operator's intent in 2026-07-11 does not change the outcome here, and this ADR does not adjudicate it.

## 3. True restoration cost (correcting ADR-012's config-only claim)

ADR-012 section 1 claimed: "The saved-cadence / auto mechanism stays built and dormant. Flipping it on
later is config, not code." The audit's finding G-2 falsified this the day after ADR-012 landed: the
freeze commit `11c008c2` commented out the workflow `schedule:` blocks, so restoration is not
config-only. The true restoration cost has three parts:

- **Code**: uncomment the `schedule:` blocks in `.github/workflows/source-monitoring.yml` and
  `.github/workflows/spot-check-monthly.yml` (a committed change, not a config flip), or replace them
  with the two-tier awareness tick per the crawl spec.
- **Config**: set the DB cadence (`system_state.scrape_cadence`, `scrape_start_date`) off the
  dormant `off` state.
- **Env**: the deployed Vercel values (`SCRAPE_HOLD` lifted, `GROUNDING_ACQUIRE_ENABLED` armed per
  sanctioned run) are the operator's per-run controls; they are out-of-repo and are operator
  dashboard actions, not code.

ADR-012's config-only claim is corrected to this three-part cost.

## 4. The two owed invocation surfaces (G-1) are debts the crawl rebuild discharges

ADR-012 section 1 promised a first-class "run intake now" control: "an admin surface control + a
script path." The audit's finding G-1 established that only the API route (`/api/admin/run-intake`)
was built; the admin UI control and the script path were never built, and the route has zero
invocations in its entire history ("0 manual-intake-run agent_runs"). These two surfaces are standing
debts. The crawl rebuild discharges them: the intake handoff lands at `run-intake-cycle` through
`/api/admin/run-intake`, and the two owed surfaces (the admin "run intake now" control and the script
path) are built as part of that work. Until they exist, ADR-012's central mechanism is unexecutable
without a hand-crafted HTTP request.

## 5. Restoration proceeds on the two-tier model behind the existing gate stack

The founding design predated the current gate stack. Restoration does not revive the 2026-04 machinery
as components (it is evidence of intent, not parts); it proceeds on a two-tier model, specced
separately for operator pricing:

- a cheap **enumerated awareness tier** (universe enumeration, Haiku-classify, diff against holdings)
  homed at `/api/worker/check-sources`, and
- the existing expensive **grounded depth tier** behind `GROUNDING_ACQUIRE_ENABLED` + operator-go.

Both tiers sit behind the full gate stack the founding design lacked: `assertFetchAllowed`
(SCRAPE_HOLD), the cadence/pause switches, dedup-before-ground, the mint gates, the source-link mint
invariant, snapshot-first verify, and per-item leases. One intake path, no parallel front door. The
spec is drafted for operator review as a separate document; no crawl code is built under this ADR.

## Consequences

- ADR-012 status changes to `superseded` (by this ADR); its manual-by-design framing is retired. Its
  RD-11/F16 two-caller mechanism, RD-20 staged-transit, and the launch-exit-test clauses are not
  retired by this ADR (they are mechanism, not the manual-by-design framing) and carry forward.
- The `fsi-app/.claude/CLAUDE.md` founding source-monitoring text stands unamended; it won.
- `research-is-horizon-scan` gains a feedstock-gap residual (this change).
- The crawl-rebuild spec is drafted for operator pricing; no build proceeds until the operator prices
  wave-one sizing.

## Related

- [ADR-012-intake-cadence-and-launch-exit-test](./ADR-012-intake-cadence-and-launch-exit-test.md) — superseded by this ADR
- [ADR-013-phase3-closure-and-scope-doctrine-tightening](./ADR-013-phase3-closure-and-scope-doctrine-tightening.md) — the spend-crisis rebuild whose freeze ADR-012 relabeled
- [dormant-systems-audit-2026-07-18](../audits/dormant-systems-audit-2026-07-18.md) — the audit whose findings this ADR rules on
