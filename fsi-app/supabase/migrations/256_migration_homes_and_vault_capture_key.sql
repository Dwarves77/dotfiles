-- 256 — migration homes for the last 5 out-of-repo DB objects + vault the capture JWT (2026-08-11).
--
-- The db-layer census (docs/audits/db-layer-census-2026-08-11.md) found 22 objects with no committed
-- migration; migration 254 dropped 17. These are the FIVE that are legitimate and live, written into the
-- migration tree verbatim from their live definitions (captured via pg_get_functiondef) so the repo can
-- finally read them. All CREATE OR REPLACE / IF NOT EXISTS — byte-for-byte no-ops against the live DB,
-- except capture_worker_fetch, whose ONE change is deliberate: the hardcoded anon-role JWT literal moves
-- to a Supabase Vault reference (secret name 'capture_worker_anon_key'), so a key rotation is one vault
-- update instead of a silent breakage inside a SECURITY DEFINER body no repo-side scan can see.
--
-- After this migration, F24's NO_MIGRATION_HOME allowlist is EMPTY.

-- 1. gate_a_health_cache — the single-row cache behind gate_a_health() (read by /api/health/surfaces).
CREATE TABLE IF NOT EXISTS public.gate_a_health_cache (
  singleton   boolean NOT NULL PRIMARY KEY CHECK (singleton),
  payload     jsonb NOT NULL,
  computed_at timestamptz NOT NULL
);

-- 2. gate_a_health_compute — computes the payload.
CREATE OR REPLACE FUNCTION public.gate_a_health_compute()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT jsonb_build_object(
    'invariant_violations', (
      SELECT count(*)::int FROM public.intelligence_items i
        JOIN public.item_gate_a_state g ON g.intelligence_item_id = i.id
       WHERE i.provenance_status='verified' AND coalesce(i.full_brief,'')<>'' AND g.orphan_count>0),
    'briefless_verified', (
      SELECT count(*)::int FROM public.intelligence_items
       WHERE provenance_status='verified' AND coalesce(full_brief,'')=''),
    'no_gatestate_verified', (
      SELECT count(*)::int FROM public.intelligence_items i
       WHERE i.provenance_status='verified' AND coalesce(i.full_brief,'')<>''
         AND NOT EXISTS (SELECT 1 FROM public.item_gate_a_state g WHERE g.intelligence_item_id=i.id)),
    'verified_failing_revalidation', (
      SELECT count(*)::int FROM public.intelligence_items i
       WHERE i.provenance_status='verified' AND NOT (public.validate_item_provenance(i.id)).valid),
    'verified_gen_ver_null_info', (
      SELECT count(*)::int FROM public.intelligence_items
       WHERE provenance_status='verified' AND regeneration_skill_version IS NULL)
  );
$function$;

-- 3. gate_a_health_refresh — the cache's only writer. Deliberately UNSCHEDULED (operator ruling
-- 2026-08-10); gate_a_health()'s 30-minute staleness gate makes the dormancy visible by design.
CREATE OR REPLACE FUNCTION public.gate_a_health_refresh()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO public.gate_a_health_cache AS c (singleton, payload, computed_at)
  VALUES (true, public.gate_a_health_compute(), now())
  ON CONFLICT (singleton)
  DO UPDATE SET payload = EXCLUDED.payload, computed_at = EXCLUDED.computed_at;
END;
$function$;

-- 4. gate_a_health — the read surface with the staleness gate.
CREATE OR REPLACE FUNCTION public.gate_a_health()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN c.computed_at IS NULL THEN
      jsonb_build_object('error', 'gate_a_health cache empty; refresh has never run')
    WHEN c.computed_at < now() - interval '30 minutes' THEN
      jsonb_build_object('error', 'gate_a_health cache stale since ' || c.computed_at::text)
    ELSE c.payload || jsonb_build_object('computed_at', c.computed_at)
  END
  FROM (SELECT payload, computed_at FROM public.gate_a_health_cache WHERE singleton) c
  RIGHT JOIN (SELECT 1) one ON true;
$function$;

-- 5. next_uncensused_portal_candidates — portal-census pagination RPC (dormant capability, kept).
CREATE OR REPLACE FUNCTION public.next_uncensused_portal_candidates(p_source_id uuid, p_limit integer, p_newest boolean DEFAULT false, p_after_first_seen timestamp with time zone DEFAULT NULL::timestamp with time zone, p_after_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, url text, anchor_text text, source_id uuid, first_seen_at timestamp with time zone, source_name text, source_category text, source_base_tier integer)
 LANGUAGE sql
 STABLE
AS $function$
  select plc.id, plc.url, plc.anchor_text, plc.source_id, plc.first_seen_at,
         s.name, s.category, s.base_tier
  from public.portal_link_candidates plc
  left join public.sources s on s.id = plc.source_id
  where plc.status = 'candidate'
    and (p_source_id is null or plc.source_id = p_source_id)
    and not exists (
      select 1 from public.census_worklist cw
      where cw.source_id = plc.source_id
        and cw.document_url = plc.url
        and cw.dryrun_disposition is not null
    )
    and (
      p_after_first_seen is null
      or case
           when p_newest then (plc.first_seen_at < p_after_first_seen
                               or (plc.first_seen_at = p_after_first_seen and plc.id < p_after_id))
           else (plc.first_seen_at > p_after_first_seen
                 or (plc.first_seen_at = p_after_first_seen and plc.id > p_after_id))
         end
    )
  order by
    case when p_newest then plc.first_seen_at end desc,
    case when not p_newest then plc.first_seen_at end asc,
    case when p_newest then plc.id end desc,
    case when not p_newest then plc.id end asc
  limit greatest(p_limit, 0);
$function$;

-- 6. capture_worker_fetch — the runbook-sanctioned, no-metered-spend document-capture path.
-- Vault the anon key first (idempotent: create only if absent). The anon key is PUBLIC by design; vaulting
-- it is about rotation visibility, not secrecy.
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'capture_worker_anon_key') THEN
    PERFORM vault.create_secret('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3cnNicGlzZXJ1emJmd2pwdnNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA4NTc5MzgsImV4cCI6MjA1NjQzMzkzOH0.jCvrb3SoIgSeMDDw-xeb2Vuw83bMD4HoSq3nHYAUkdA', 'capture_worker_anon_key',
      'Anon-role JWT used by capture_worker_fetch to invoke the capture-worker edge function. Public by design; vaulted so rotation is one update here instead of a silent break inside the function body.');
  END IF;
END $do$;

CREATE OR REPLACE FUNCTION public.capture_worker_fetch(queue_ids uuid[])
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  req_id bigint;
  v_key  text;
BEGIN
  IF queue_ids IS NULL OR array_length(queue_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'capture_worker_fetch: queue_ids must be a non-empty uuid array';
  END IF;
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'capture_worker_anon_key';
  IF v_key IS NULL THEN
    RAISE EXCEPTION 'capture_worker_fetch: vault secret capture_worker_anon_key is missing — restore it before invoking (migration 256)';
  END IF;
  SELECT net.http_post(
    url := 'https://kwrsbpiseruzbfwjpvsp.supabase.co/functions/v1/capture-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := jsonb_build_object('queue_ids', to_jsonb(queue_ids)),
    timeout_milliseconds := 90000
  ) INTO req_id;
  RETURN req_id;
END;
$function$;

-- Post-checks: every object exists; the function no longer embeds a JWT literal.
DO $do$
BEGIN
  IF to_regclass('public.gate_a_health_cache') IS NULL THEN RAISE EXCEPTION 'gate_a_health_cache missing'; END IF;
  IF pg_get_functiondef('public.capture_worker_fetch(uuid[])'::regprocedure) ~ 'eyJ' THEN
    RAISE EXCEPTION 'capture_worker_fetch still embeds a JWT literal';
  END IF;
END $do$;
