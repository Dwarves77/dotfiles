-- Rollback for migration 166 — drop the admin-scoped SELECT policy on provisional_sources.
-- (The code half — fetchProvisionalSources on the service client — is independent and stays; it does not
--  depend on this policy.)

BEGIN;

DROP POLICY IF EXISTS provisional_sources_admin_read ON public.provisional_sources;

COMMIT;
