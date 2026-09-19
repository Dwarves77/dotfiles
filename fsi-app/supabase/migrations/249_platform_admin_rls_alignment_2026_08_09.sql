-- subject: Migration 249 (platform-admin RLS alignment, 2026-08-09; full-code reading audit P0 #3, de-conflated and verified). Repoints `integrity_flags_admin_read`, `integrity_flags_admin_update`, and `holdings_quality_admin_read` from an `org_memberships` owner/admin-of-any-org predicate to `profiles.is_platform_admin` (the app's actual platform-admin gate, migration 075). The old predicate combined with `create_org_for_self` — which lets ANY authenticated user become an org owner — meant any signed-in user could READ platform integrity flags, UPDATE (tamper with) them, and read the capture-quality audit. Verified safe before applying: the admin UI reads and writes these tables via service-role API routes (`service_role_write` policy plus service-role RLS bypass), and no browser client queries them directly, so no legitimate caller loses access. Idempotent by construction (`DROP POLICY IF EXISTS` then `CREATE POLICY`). **APPLIED LIVE 2026-08-09** via Supabase MCP ahead of this commit — audit record, not a pending apply; do not re-run as a state change. Verified in the live ledger as `20260809031157 platform_admin_rls_alignment_2026_08_09`. Filename uses underscore date separators (F6). Reversible (restore the prior org_memberships-based policies). [glyph:verbatim]
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
