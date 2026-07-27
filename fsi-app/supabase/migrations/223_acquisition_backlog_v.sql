-- 223_acquisition_backlog_v.sql
--
-- Retroactive migration for the LIVE view public.acquisition_backlog_v, which existed in the database with NO
-- committed CREATE anywhere in supabase/migrations/ (schema-drift audit RD-49 first-run finding, allowlisted as
-- genuine drift, routed to Session B — session log 2026-07-21). This lands the byte-matching source (captured via
-- pg_get_viewdef(..., true) on 2026-07-25) so the schema-drift ERROR line clears and the object is repo-sourced.
--
-- The view ranks coverage_gap_candidates into acquisition-backlog sections (instrument/free, feed/free, licensed)
-- with mode + surface ordering weights. CREATE OR REPLACE VIEW is idempotent and byte-identical to the live def.
--
-- READ-ONLY view over coverage_gap_candidates; adds no table, mutates no row.

create or replace view public.acquisition_backlog_v as
 SELECT c.id,
    c.rank,
    c.instrument,
    c.jurisdiction,
    c.primary_vertical,
    c.transport_mode,
    c.freight_relevance,
    c.estimated_priority,
    c.coverage_class,
    c.corpus_match_ref,
    c.sizing_class,
    c.entity_confirmed,
    c.authoritative_url,
    c.notes,
    c.created_by,
    c.created_at,
    c.data_class,
    c.discovery_class,
    c.disposition,
    c.surface_test,
    c.access_model,
        CASE
            WHEN c.disposition = 'declined'::text THEN NULL::integer
            WHEN c.disposition = 'parked'::text AND c.surface_test IS NOT NULL AND c.surface_test ? 'watch_condition'::text THEN 3
            WHEN c.disposition = 'parked'::text AND c.surface_test IS NOT NULL THEN 4
            WHEN c.data_class = 'instrument'::text AND c.access_model = 'free'::text THEN 1
            WHEN (c.data_class = ANY (ARRAY['data_feed'::text, 'tracker'::text])) AND c.access_model = 'free'::text THEN 2
            WHEN c.access_model = ANY (ARRAY['licensed'::text, 'mixed'::text]) THEN 3
            ELSE NULL::integer
        END AS backlog_section,
        CASE
            WHEN c.transport_mode ~~* '%air%'::text THEN 1
            WHEN c.transport_mode ~~* '%road%'::text THEN 2
            WHEN c.transport_mode ~~* '%ocean%'::text THEN 3
            ELSE 4
        END AS mode_priority_weight,
        CASE
            WHEN c.notes ~~* '%Operations=IN%'::text OR c.notes ~~* '%operations,verdict%IN%'::text THEN 1
            WHEN c.notes ~~* '%Market Intel=IN%'::text THEN 2
            WHEN c.notes ~~* '%Research=IN%'::text THEN 3
            ELSE 4
        END AS surface_order_weight
   FROM coverage_gap_candidates c
  WHERE c.disposition = 'parked'::text AND c.surface_test IS NOT NULL OR c.disposition IS DISTINCT FROM 'declined'::text AND c.disposition IS DISTINCT FROM 'parked'::text AND c.data_class = 'instrument'::text AND c.access_model = 'free'::text OR c.disposition IS DISTINCT FROM 'declined'::text AND c.disposition IS DISTINCT FROM 'parked'::text AND (c.data_class = ANY (ARRAY['data_feed'::text, 'tracker'::text])) AND c.access_model = 'free'::text OR c.disposition IS DISTINCT FROM 'declined'::text AND c.disposition IS DISTINCT FROM 'parked'::text AND (c.access_model = ANY (ARRAY['licensed'::text, 'mixed'::text]));
