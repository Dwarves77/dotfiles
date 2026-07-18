-- 238_coverage_gap_rank12_parked_with_watch.sql
-- Session C (coverage discovery lane), 2026-07-18. CORRECTION to migration 236's status-update
-- note: rank 12 (EU Green Claims Directive proposal) is NOT stale-dead. Operator-verified current
-- status: the Commission announced an intention to withdraw in June 2025 but has NOT formally
-- terminated the proposal; the trilogue was cancelled (not concluded); Parliament committee chairs
-- have signaled possible revival. This is an open regulatory-status question, not a closed one --
-- migration 236's notes-only update was accurate as far as it went (stalled, unclear formal status)
-- but did not go far enough: an unclear-but-live proposal needs a tracked disposition, not just a
-- note appended to an otherwise-undispositioned row.
--
-- Reclassified to disposition='parked' with a watch_condition key, the same MECHANISM used for TAC
-- Index (rank 84, migration 234) -- a parked row carrying an explicit revisit trigger rather than a
-- silent gap. The reason for parking differs from TAC's (TAC = an open spend/license decision;
-- rank 12 = an open regulatory-status question), which the surface_test.regulations reasoning
-- records explicitly so the distinction is not lost.
--
-- NOTE FOR THE OPERATOR (flagged, not silently resolved): the migration-237 view CASE routes ANY
-- parked row carrying a watch_condition key into backlog_section 3 ("OPERATOR SPEND/LICENSE
-- DECISIONS ... PLUS parked rows carrying a watch_condition"). Rank 12 is not a spend/license
-- decision -- it is a regulatory-status watch. Applying this ruling literally therefore places rank
-- 12 in a Section-3 view row whose label describes spend decisions, which will read as a category
-- mismatch to anyone reading Section 3 at face value. Not corrected here since the operator asked
-- for the parked-with-watch TREATMENT specifically ("same treatment as TAC"), not a view-routing
-- change; flagged in the same-day session-log entry and this migration's header for a future
-- decision on whether the view needs a third watch-flavor (regulatory-status vs spend-decision).
--
-- 2024/825 (EmpCo, rank 106, migration 236) remains the separate binding-instrument row and is
-- UNCHANGED by this migration -- rank 12 and rank 106 stay two distinct rows per migration 236's
-- original reasoning (different instruments, different mechanisms).

UPDATE public.coverage_gap_candidates SET
  disposition = 'parked',
  notes = notes || ' CORRECTION (2026-07-18): the 2026-07-18 SAF-check status-update note above is SUPERSEDED as a closure signal -- operator-verified the proposal remains formally open (trilogue cancelled, not concluded; Parliament committee chairs have signaled possible revival) and this row is now tracked as parked-with-watch, not closed.',
  surface_test = '{
    "regulations": {"verdict": "CONDITIONAL", "reason": "OPERATOR-VERIFIED (2026-07-18): the Commission announced an intention to withdraw this proposal in June 2025 but has NOT formally terminated it; the trilogue was cancelled, not concluded; European Parliament committee chairs have signaled possible revival. This is an open regulatory-status question, not a closed one -- parked with a watch condition rather than declined. Distinct from Directive (EU) 2024/825 (EmpCo, rank 106), the separate binding instrument already covering the same subject matter on its own terms; that row is unaffected by this one''s status."},
    "operations": {"verdict": "OUT", "reason": "Not a jurisdictional cost/feasibility surface."},
    "market_intel": {"verdict": "OUT", "reason": "Not a market-movement signal."},
    "research": {"verdict": "OUT", "reason": "Not horizon-scan content; this is a regulatory-instrument status question."},
    "community": {"verdict": "OUT", "reason": "Not peer-generated."},
    "watch_condition": {"trigger": "Revisit on formal withdrawal of the proposal, OR on trilogue re-scheduling.", "recorded": "2026-07-18"}
  }'::jsonb
WHERE rank = 12;
