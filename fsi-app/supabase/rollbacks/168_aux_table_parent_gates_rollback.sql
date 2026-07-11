-- Rollback for migration 168 — restore the permissive USING(true) SELECT policies on the five aux tables.
-- NOTE: reversing re-opens the quarantined/archived-parent leak (P2 provenance). Reverse only to unblock a
-- legitimate broken read path, then forward-fix.

BEGIN;

DROP POLICY IF EXISTS item_timelines_read ON public.item_timelines;
CREATE POLICY item_timelines_read ON public.item_timelines FOR SELECT USING (true);

DROP POLICY IF EXISTS item_disputes_read ON public.item_disputes;
CREATE POLICY item_disputes_read ON public.item_disputes FOR SELECT USING (true);

DROP POLICY IF EXISTS item_changelog_read ON public.item_changelog;
CREATE POLICY item_changelog_read ON public.item_changelog FOR SELECT USING (true);

DROP POLICY IF EXISTS item_cross_references_read ON public.item_cross_references;
CREATE POLICY item_cross_references_read ON public.item_cross_references FOR SELECT USING (true);

DROP POLICY IF EXISTS item_supersessions_read ON public.item_supersessions;
CREATE POLICY item_supersessions_read ON public.item_supersessions FOR SELECT USING (true);

COMMIT;
