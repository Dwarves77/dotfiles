-- subject: Migration 223 (scheduled-workflow spend diagnosis follow-on, 2026-07-25). Retroactive byte-matching migration for the live view `acquisition_backlog_v`, which existed in the DB with NO committed CREATE anywhere in `supabase/migrations/` — the schema-drift audit's (RD-49) first-run finding, allowlisted 2026-07-20 and routed to a retroactive-migration owner. Source captured via `pg_get_viewdef('public.acquisition_backlog_v', true)` on 2026-07-25 (introspected, not written from memory); the view ranks `coverage_gap_candidates` into acquisition-backlog sections (instrument/free=1, feed-or-tracker/free=2, licensed/mixed=3, parked-with-surface-test=3/4, declined=NULL) with `mode_priority_weight` (air/road/ocean) and `surface_order_weight` (Operations/Market/Research). `CREATE OR REPLACE VIEW` is idempotent and byte-identical to the live def, so applying is a no-op. **APPLIED 2026-07-25** via apply_migration (no-op, byte-match). The `acquisition_backlog_v` entry is removed from the schema-drift allowlist the same commit — its committed CREATE now exists, so the nightly data-audit `schema-drift` ERROR line clears on the next run. Reversible (`DROP VIEW public.acquisition_backlog_v`). [glyph:verbatim]
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
