-- Migration 324 (lane L32, 2026-09-17): drop drain_worklist.
-- The drain-first-fetch worker that read it was dissolved 2026-07-12 (mint-item.ts header, pause.ts);
-- verified live before this drop: 66 rows, 0 triggers, 0 foreign keys into it, 0 code references, 0 SQL
-- references beyond its own DDL (F47 db-object-reference). Nothing reads or writes it.
-- Applied 2026-09-17 through the Supabase management API before the dependent code merged (rule 3).
DROP TABLE IF EXISTS public.drain_worklist;
