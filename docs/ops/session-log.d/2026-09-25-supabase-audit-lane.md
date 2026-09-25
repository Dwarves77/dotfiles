# 2026-09-25 - Supabase integrity-and-wiring audit lane (discovery phase)

Lane: `lane/supabase-audit-2026-09-25`, worktree `.claude/worktrees/supabase-audit-0925`. Executes
`docs/plans/build-plan-2026-09-25.md` section 3 (workstream 1, sequence lane 2). SELECT-only; no DB
writes issued.

## Accomplished

- Reused, in the order the lane spec names: `F14-producer-consumer-orphan.mjs` (ran direct, PASS),
  `F45-duplicate-code.mjs` (ran direct, PASS), `closure-gate.mjs` (ran direct, PASS),
  `invariant-coverage.mjs` (ran direct as `execution-wiring.mjs`'s consumer, PASS), the three
  `scripts/verify/*-audit.mjs` DB audits and `canonical-key-dedup.mjs` (reproduced as equivalent
  read-only SQL via Supabase MCP `execute_sql`, since this worktree has no `node_modules` to run them as
  CLIs), and read `run-data-audit-lane.mjs` to confirm the three audits are correctly registered members.
- Ran the six named coverage checks (reader/writer, duplicate tables, duplicate items, dead columns,
  unwired UI parts, unrun producers) at the depth a single SELECT-only discovery session supports; two
  (dead columns, the harness-family grain of unrun producers) are explicitly incomplete and staged as
  concrete follow-up scripts rather than left as bare flags (rule 13).
- Produced `docs/audits/supabase-integrity-and-wiring-audit-2026-09-25.md`: 17 findings, each with a
  rule-14 status token, across the six checks plus one bonus security finding. Verified against
  `scripts/verify/audit-finding-status.mjs --strict`: 0 unlabeled finding-shaped lines in the new file
  (the tool's pre-existing 609-line backlog is across 122 other, older audit files, unrelated to this
  lane, and the tool runs report-only by default in CI).
- CORRECTION (rule 14 self-correction, caught before push): the dispatch brief said to add the
  `docs/INDEX.md` line myself. Drafted it, then the pre-push discipline suite's "check 4 wired to the
  live tree" test failed hard: `docs/INDEX.md` is a coordinator-only file per `lane-common-contract.md`
  ("Never write docs/ops/session-log.md, docs/PROGRAM-BOARD.md, or docs/INDEX.md (coordinator only)"),
  enforced, not advisory. Reverted the edit rather than `--no-verify` past a real gate (hard constraint).
  The proposed INDEX line is below, for the coordinator to land: `- [supabase-integrity-and-wiring-audit-2026-09-25](audits/supabase-integrity-and-wiring-audit-2026-09-25.md) - workstream 1 discovery phase, SELECT-only: 17 findings across the six named coverage checks plus one bonus security finding (derivation_edges RLS disabled, P0, live anon/authenticated CRUD exposure). Confirms the quarantine DWELL invariant is violated (66/78 live-quarantined items past the 14-day bound, ENQUEUE holds), refutes the build plan's own workstream 4 claim that the Operations-matrix envelope-reader gap is still open (closed 2026-08-30 per PROGRAM-BOARD:1632 and live code), and finds state_cost_facts has readers and no producer anywhere in the repo. Reuses F14, F45, closure-gate, invariant-coverage directly; reproduces the three DB-side data-audit scripts and canonical-key-dedup as equivalent SQL via Supabase MCP (this worktree has no node_modules to run them as CLIs).`

## Key findings (see the register for full detail and evidence)

- RW-3 (P1, CONFIRMED): quarantine DWELL invariant violated - 66 of 78 live-quarantined
  `intelligence_items` rows exceed the 14-day bound with no recorded disposition; ENQUEUE holds fully.
- UI-1 (P1, REFUTED): the build plan's own workstream 4 and the PROGRAM-BOARD thread table both still
  cite the Operations-matrix envelope-reader gap as open; PROGRAM-BOARD's own later entry (line 1632) and
  live code (`supabase-server.ts:3376`) show it closed 2026-08-30. Flagged as a doc conflict, not edited
  (out of this lane's write set).
- RW-2/UI-3 (P1, CONFIRMED): `state_cost_facts` has two live readers and zero producers anywhere in the
  repo since migration 152.
- SEC-1 (P0, CONFIRMED, bonus finding outside the six named checks): `public.derivation_edges` has RLS
  disabled with full anon/authenticated CRUD grants live, 24 rows exposed.

## Decisions

None made by this lane - per the lane spec, remediation lanes open only after the coordinator reviews
the register. No allowlist-reason, check-design, or doc-conflict ambiguity was resolved unilaterally;
each is recorded as an open question in the register instead.

## Blockers

- No `node_modules` in this worktree (local Windows checkout, not the container the lane common contract
  assumes) blocked running four of the reuse-first scripts as CLIs. Worked around via Supabase MCP SQL
  reproduction of their documented invariants; one (`orphan-source-audit.mjs`) is only approximated, not
  exactly reproduced (RW-4, flagged `[HYPOTHESIS]`).

## Next steps

1. Coordinator reviews the register (required gate before any remediation lane opens, per section 3).
2. Five open questions recorded in the register's own "Open questions for the coordinator" section
   (script-existence drift, state_cost_facts ownership, the UI-1 doc conflict, SEC-1 urgency/sequencing,
   and whether a future pass should run with real node_modules for exact reproduction).
