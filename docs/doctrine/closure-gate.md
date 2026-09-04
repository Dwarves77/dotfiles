# Doctrine seed — Closure gate (nothing unwired can stay silent)

> **Doctrine-register SEED (machine-checkable), pending formal registration.** This entry follows the
> exact shape `worktree-isolation.md` used before its own migration into `doctrine-register.mjs` +
> `invariants.mjs` (Unit 0). Lane CLOSURE-GATE's write set does not include those two registry files, so
> this doctrine ships ENFORCED (a real CI gate exists and is green — see `enforced_by` below) but is NOT
> YET a formal `DOCTRINES[]` / `INVARIANTS[]` entry with an RD-number; a session with that write set
> should migrate it (add a `RD-N-closure-gate` invariant citing the mechanisms below, and a matching
> `DOCTRINES[]` entry with `enforcedBy: ['RD-N-closure-gate']`) rather than re-author the doctrine.

```yaml
id: closure-gate
status: enforced            # ships ENFORCED — a real CI gate, not a design note
enforcing_invariant: PENDING — no RD-number assigned yet (out of this lane's write set; see note above)
doctrine: >
  A component is never left "built, dormant." Nothing may claim closure by write-set alone: a
  maintenance step or dispatchable workflow that has never run, a docs/PROGRAM-BOARD.md row that stays
  NEXT across trains with no owning train, a table created by a recent migration with a writer and no
  reader (or the reverse), or a lane brief that lacks the plan's §0 done-conditions each fails CI. Every
  failure is RATCHET-ONLY: an allowlist entry may defer one, but only with a stated disposition and a
  numeric expiry train, and the allowlist audits itself (a stale or expired entry is itself a failure).
doctrine_seed: >
  Carried verbatim from docs/plans/complete-system-build-plan-2026-09-04.md §"Why the previous plans
  stopped short": "Nothing enforces closure. F28 fails CI when a harness family drifts; F25 fails CI when
  a module under src/** is orphaned; no gate fails when a board row stays NEXT across trains, when a
  maintenance step has never run, or when a table has a writer and no reader. Plans were tracked by prose
  that nothing reads back... Root cause in one sentence: completion was defined at the write set, and the
  parts that make a component real (wired, run, populated, visible, gated) had no owner and no gate."
scope: >
  Everything a train can land: .github/workflows/*.yml (maintenance.yml step-by-step; every other
  dispatchable workflow at the workflow level), docs/PROGRAM-BOARD.md's NEXT rows, every table created by
  fsi-app/supabase/migrations/26[6-9]*.sql and fsi-app/supabase/migrations/2[7-9]*.sql /
  3[0-9][0-9]*.sql (numbered >= 266), and docs/dispatches/lane-common-contract.md's own §0 text. Does NOT
  cover per-file code invariants (F1-F35 already do) — this is the CROSS-CUTTING "did the whole loop
  actually close" layer, one level up.
enforced_by:
  - mechanism: closure-gate CI step
    catches: a maintenance step / dispatchable workflow with no run evidence N=3 trains past its own
             introduction; a PROGRAM-BOARD.md NEXT row with no owning train, untouched N=3 trains;
             a migrations>=266 table with a writer and no reader (or the reverse); the lane-common-
             contract missing the plan's §0 marker verbatim
    action: FAIL (nonzero exit fails the "test-discipline-engine" job, a required check)
    fires_in: CI, every push/PR to master (discipline.yml, test-discipline-engine job — full-history
              checkout, since the gate needs git log/blame/merge-base for train numbering)
    source: fsi-app/.discipline/governance/closure-gate.mjs
  - mechanism: fixture proofs (red-then-green) + a LIVE run over the real tree
    catches: a regression in any of the four checks' own catching behaviour (fixture proofs), and any
             new real offender on this tree the moment it appears (the LIVE assertions run the actual
             checks against the real repo and assert ok===true)
    action: node --test fails (wired into run-test-suite.sh via the existing
             `.discipline/governance/*.test.mjs` glob — no new wiring needed, and F23's orphaned-proof
             ratchet (held at 0) would catch a future proof dropped outside that glob)
    fires_in: CI (test-discipline-engine job, "Run discipline test suite" step) and the pre-push hook
              (same script, per the parity-by-construction rule this repo already runs)
    source: fsi-app/.discipline/governance/closure-gate.test.mjs
reused_mechanism: >
  The WRITER-READER check does not reimplement table/writer/reader scanning — it imports scanSchema/
  scanCode/scanSql/buildOrphanReport from producer-consumer-orphan.mjs (F14's own pure core) and narrows
  the schema input to migrations >= 266, gating BOTH orphan classes that module already computes (F14
  itself gates write-orphans only; read-orphans there are informational). No copy of the regex/scan logic
  exists in closure-gate.mjs.
detection_signals:
  train numbering: a squash-merged commit whose subject matches `train/wave<N>` (verified 2026-09-04:
    every such commit on this tree is single-parent, not a merge commit) — N read directly from the
    subject; `git merge-base --is-ancestor` resolves "which train first carried commit X" exactly.
  dispatch evidence: any ONE of (a) a `scripts/harness-runs/<family>/*-run-*.json` artifact for the six
    workflows with a harness family, (b) a docs/runbooks/MAINTENANCE-RUNBOOK.md section (`## N. `step`)`)
    citing a run number / Actions run id / "landed live", (c) an entry in the NEW machine-readable
    docs/ops/dispatch-ledger.jsonl (shape: {date, workflow, step, mode, run_id, outcome}, appended by the
    coordinator per dispatch; see closure-gate.mjs's own header for the seeding rationale).
single_home: fsi-app/.discipline/governance/closure-gate.mjs (four pure cores + a git/fs live driver)
proof: fsi-app/.discipline/governance/closure-gate.test.mjs (red-then-green per check + a LIVE assertion
  the real tree is green, same pattern doctrine-contradiction.test.mjs and producer-consumer-orphan.mjs
  already use)
allowlists: NEVER_RUN_ALLOWLIST / STALE_NEXT_ALLOWLIST / WRITER_READER_ALLOWLIST in closure-gate.mjs —
  every entry names a disposition (the plan item that closes it) and a numeric expiryTrain; the allowlist
  audits itself (a stale or expired entry fails the gate, same shape as F14's TERMINAL_SINK_ALLOWLIST and
  F23's GAP_BASELINE).
residual: >
  STALE-NEXT's allowlist keys the exact row text (any edit re-opens the row for review, by design — a
  reworded row is not automatically re-approved). NEVER-RUN's evidence sources are FS/git-only: a real
  dispatch that left no harness artifact, no runbook citation, and no ledger entry (a hand-run outside
  every recorded surface) would still read as never-run — the same "best-supported reading of the
  evidence" caveat B1-modules.md's own audit named for several of its BUILT-NOT-WIRED verdicts. The
  formal invariants.mjs/doctrine-register.mjs registration named at the top of this file is itself a
  residual of this lane's own write-set boundary, not a defect in the mechanism.
```

## Incident this prevents

`docs/plans/complete-system-build-plan-2026-09-04.md` §"Why the previous plans stopped short": four
plans in the month before this one promised completion of the same components a fresh audit found
unfinished each time — 12 board rows stuck at NEXT, 19 "dispatch next" session-log lines, and the
2026-08-31 disposition register only half-executed (6 of 10 DELETEs, 3 of 8 WIREs) months after it was
authored. Every plan's own "done" bar was "tests green in its files" — the write set — never whether the
component was actually reachable, run, populated, visible, and gated (the plan's own §0). This gate is
the mechanical version of §0's first two conditions (Reachable/Run) plus the two failure classes that
generated the most repeat work (stale board rows, half-built data tables).

## Related

- Plan: `docs/plans/complete-system-build-plan-2026-09-04.md` §0 (definition of done), W7.5 (closure gate)
- Audit: `docs/audits/wiring-audit-2026-09-04/B1-modules.md` (method + Appendix A/B this check's
  reasoning about "wired" vs "run" is built on), A1-runtimes.md (per-workflow/per-step dispatch evidence
  seeded into `docs/ops/dispatch-ledger.jsonl`)
- Reused mechanism: `fsi-app/.discipline/governance/producer-consumer-orphan.mjs` (F14) — the writer/
  reader scanning core the WRITER-READER check calls, not copies
- Sibling ratchets: F14 (`TERMINAL_SINK_ALLOWLIST`), F23 (`GAP_BASELINE`), F30 (entity-spine baseline) —
  the same "allowlist fails both over AND under its committed value" shape
- Contract: `docs/dispatches/lane-common-contract.md` §0 (the LANE-CONTRACT check's own target)
