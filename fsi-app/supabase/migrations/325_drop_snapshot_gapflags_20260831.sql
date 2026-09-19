-- subject: System health audit section 3 (lane L32, 2026-09-17). Schema: drops `_snapshot_gapflags_20260831`, an ad hoc snapshot created live on 2026-08-31 with no migration (RD-49 class). Verified live before the drop: 3 rows, 0 triggers, 0 foreign keys in, 0 policies, 0 code references. APPLIED 2026-09-17 through the management API before the dependent code merged.
-- Migration 325 (lane L32, 2026-09-17): drop the ad hoc snapshot table _snapshot_gapflags_20260831.
-- It was created live on 2026-08-31 with no migration (the schema-drift class, RD-49). Verified live before
-- this drop: 3 rows, 0 triggers, 0 foreign keys into it, 0 policies, 0 code references. Machine evidence
-- belongs in gitignored scratch (rule 5), never in the production schema.
-- Applied 2026-09-17 through the Supabase management API before the dependent code merged (rule 3).
DROP TABLE IF EXISTS public._snapshot_gapflags_20260831;
