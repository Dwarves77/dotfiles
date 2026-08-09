-- 248 — Security hardening 2026-08-09 (audit P0 #1,#2,#5). APPLIED LIVE via Supabase MCP
-- 2026-08-09 (data-durable-on-execution; this file is the audit record per code-vs-data doctrine).
-- Verify-before-fix confirmed: admin_set_pause_state (mig 201) and gate_a_health (mig 226) carried
-- anon+authenticated+PUBLIC EXECUTE grants; both are called ONLY from server routes via
-- getServiceSupabase() (service_role) — verified — so revoking PUBLIC/anon/authenticated closes the
-- anon-callable exposure with no legitimate-caller impact. Mirrors migration 238's complete pattern.
-- set_provenance_status (mig 209) lost the search_path pin mig 160 set; re-pinned.

REVOKE EXECUTE ON FUNCTION public.admin_set_pause_state(text, boolean, text, date, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.gate_a_health() FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.set_provenance_status() SET search_path = public, extensions, pg_temp;
