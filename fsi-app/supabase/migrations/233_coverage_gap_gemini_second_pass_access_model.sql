-- 233_coverage_gap_gemini_second_pass_access_model.sql
-- Session C (coverage discovery lane), 2026-07-18. Companion to migration 232: the INSERT there
-- omitted access_model from the column list, leaving ranks 99-105 unclassified and therefore
-- invisible to acquisition_backlog_v (which requires access_model to route a row into a section).
-- Caught immediately after applying 232, before any report was drawn from a stale view. Sets
-- access_model per each row's own notes (free: 99 Bizot, 100 BAFTA Albert, 101 FIA, 103 FMC,
-- 104 CAAS, 105 Japan METI/MLIT SAF mandate; licensed: 102 EU UDB, per its registered-operator-
-- gated access as classified in migration 232's notes).

UPDATE public.coverage_gap_candidates SET access_model = 'free' WHERE rank IN (99, 100, 101, 103, 104, 105);
UPDATE public.coverage_gap_candidates SET access_model = 'licensed' WHERE rank = 102;
