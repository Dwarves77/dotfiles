-- 226 — gate_a_health(): live-data honesty assertions for the uptime probe.
--
-- The "Uptime and honesty probes" workflow cannot query the DB directly (it holds only APP_URL +
-- WORKER_SECRET); it curls /api/health/surfaces, which calls this STABLE read-only RPC. Write-time
-- enforcement already exists (the set_provenance_status trigger routes every insert/update through
-- validate_item_provenance — criteria 1-7; a direct status write is overridden by its recompute). This RPC
-- is the READ-side backstop that catches legacy drift (items verified under an OLDER validate, before a
-- criterion existed, never re-validated) and any future path that bypasses the trigger — the class this
-- session's incident traced back to.
--
-- ALARMS (the probe fails loudly, and fail-closed on an unreadable/null value, if any is > 0):
--   invariant_violations           — verified items with a non-empty brief carrying a literal Gate-A orphan.
--   briefless_verified             — verified items with an empty brief (vacuous verification, criterion-6 bypass).
--   no_gatestate_verified          — a verified brief that was NEVER Gate-A-scanned (the true bypass signal:
--                                    content present but no item_gate_a_state row).
--   verified_failing_revalidation  — COMPLETE detector: any verified item that would fail validate_item_provenance
--                                    right now (stale-under-old-rules or any trigger bypass). Only verified items
--                                    are re-validated, so it stays cheap.
-- INFO (reported, NOT alarmed):
--   verified_gen_ver_null_info     — legacy stamp gap: verified items with no regeneration_skill_version. These are
--                                    legitimately validated legacy items (current gate state, 0 orphans); the mint
--                                    runner does not stamp a generation version (mint != regeneration), so the count
--                                    clears naturally as items regenerate through the real pipeline. Not a bypass.
CREATE OR REPLACE FUNCTION public.gate_a_health()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT jsonb_build_object(
    'invariant_violations', (
      SELECT count(*)::int FROM public.intelligence_items i
        JOIN public.item_gate_a_state g ON g.intelligence_item_id = i.id
       WHERE i.provenance_status = 'verified'
         AND coalesce(i.full_brief, '') <> ''
         AND g.orphan_count > 0),
    'briefless_verified', (
      SELECT count(*)::int FROM public.intelligence_items
       WHERE provenance_status = 'verified'
         AND coalesce(full_brief, '') = ''),
    'no_gatestate_verified', (
      SELECT count(*)::int FROM public.intelligence_items i
       WHERE i.provenance_status = 'verified'
         AND coalesce(i.full_brief, '') <> ''
         AND NOT EXISTS (SELECT 1 FROM public.item_gate_a_state g WHERE g.intelligence_item_id = i.id)),
    'verified_failing_revalidation', (
      SELECT count(*)::int FROM public.intelligence_items i
       WHERE i.provenance_status = 'verified'
         AND NOT (public.validate_item_provenance(i.id)).valid),
    'verified_gen_ver_null_info', (
      SELECT count(*)::int FROM public.intelligence_items
       WHERE provenance_status = 'verified'
         AND regeneration_skill_version IS NULL)
  );
$$;

GRANT EXECUTE ON FUNCTION public.gate_a_health() TO service_role;
