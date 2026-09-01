-- 280 — theme_briefs: public SELECT policy so the customer surfaces can read theme briefs.
-- Coordinator (integration), 2026-09-01. Found by lane SURF while mounting ThemeStrip on /research.
--
-- WHY. Migration 266 enabled RLS on theme_briefs with NO policies ("deny-all to anon/authenticated; the
-- service role bypasses"), on the reasoning that only the admin themes route (service client) read it.
-- That stopped being true when research/[slug]/page.tsx started rendering the theme-brief card — it works
-- only because that block uses the service-role client, not because customers may read the table — and
-- it is false for src/components/research/ThemeStrip.tsx (request-scoped client), which today sees 0 of
-- 9 briefs. A theme brief is customer content (the editorial synthesis of a theme the customer already
-- sees via connection_themes, which IS public-read per migration 253). Same read posture as its parent:
-- public SELECT, service-role-only writes (unchanged: no INSERT/UPDATE/DELETE policy is added).
--
-- Mirrors migration 253's `connection_themes_read` policy exactly. Additive; reversible with
-- `DROP POLICY IF EXISTS theme_briefs_read ON public.theme_briefs;`.

BEGIN;

CREATE POLICY "theme_briefs_read" ON public.theme_briefs FOR SELECT USING (true);

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'theme_briefs' AND policyname = 'theme_briefs_read';
  IF n <> 1 THEN
    RAISE EXCEPTION 'ABORT: theme_briefs_read policy not created';
  END IF;
  RAISE NOTICE 'migration 280 OK: theme_briefs public SELECT policy created';
END $$;

COMMIT;
