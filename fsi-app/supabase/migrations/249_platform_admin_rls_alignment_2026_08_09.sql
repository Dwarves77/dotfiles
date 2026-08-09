-- 249 — Platform-admin RLS alignment 2026-08-09 (audit P0 #3, de-conflated + verified). APPLIED
-- LIVE via Supabase MCP 2026-08-09 (audit record). The app's platform-admin gate is
-- profiles.is_platform_admin (mig 075), but integrity_flags + holdings_quality still gated their
-- admin_read/admin_update policies on org_memberships owner/admin-of-any-org. Combined with
-- create_org_for_self (any authenticated user -> org owner), that let any user READ platform flags
-- and UPDATE (tamper) them, and read the capture-quality audit. Aligned to is_platform_admin.
-- Verified safe: admin UI reads/writes via service-role API routes (service_role_write policy +
-- service-role RLS bypass); no browser client queries these tables directly.

DROP POLICY IF EXISTS integrity_flags_admin_read ON public.integrity_flags;
CREATE POLICY integrity_flags_admin_read ON public.integrity_flags FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_platform_admin = true));

DROP POLICY IF EXISTS integrity_flags_admin_update ON public.integrity_flags;
CREATE POLICY integrity_flags_admin_update ON public.integrity_flags FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_platform_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_platform_admin = true));

DROP POLICY IF EXISTS holdings_quality_admin_read ON public.holdings_quality;
CREATE POLICY holdings_quality_admin_read ON public.holdings_quality FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_platform_admin = true));
