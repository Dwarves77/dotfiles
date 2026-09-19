-- subject: Migration 248 (security grants hardening, 2026-08-09; full-code reading audit P0 #1/#2/#5). Revokes EXECUTE on `admin_set_pause_state(text, boolean, text, date, boolean)` and `gate_a_health()` FROM PUBLIC, anon, authenticated, and re-pins `set_provenance_status()` to `SET search_path = public, extensions, pg_temp`. Both RPCs carried anon+authenticated+PUBLIC EXECUTE grants while being called ONLY from server routes through `getServiceSupabase()` (service_role), verify-before-fix confirmed the caller set before revoking, so closing the anon-callable exposure has no legitimate-caller impact; mirrors migration 238's complete grant pattern. The `set_provenance_status` pin had been lost since the search_path hardening that migration 160 established, re-opening the mutable-search_path class on a SECURITY DEFINER-adjacent trigger function. Idempotent (REVOKE is a no-op when the grant is absent; ALTER FUNCTION ... SET is last-write-wins). **APPLIED LIVE 2026-08-09** via Supabase MCP ahead of this commit, this file is the audit record per the code-vs-data doctrine, NOT a pending apply; do not re-run as a state change. Verified in the live ledger as two entries, `20260809030555 security_hardening_2026_08_09_grants_and_searchpath` and `20260809030625 security_hardening_2026_08_09_revoke_public`. Filename uses underscore date separators (F6 enforces `NNN_snake_case.sql`; the prose date stays hyphenated). Reversible (re-GRANT EXECUTE; drop the search_path setting).
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
