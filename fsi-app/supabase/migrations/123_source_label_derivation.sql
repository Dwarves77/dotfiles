-- Migration 123 — wire the source label as a LIVE derivation
--
-- Date: 2026-06-03
-- Workstream: Source-layer fix — coherent labeling.
--
-- THE PROBLEM: migration 084 encoded the canonical source_role -> category mapping, but as a
-- ONE-TIME UPDATE. It does not re-derive when source_role changes or when a source is onboarded,
-- and the onboarding routes (promote/decide) create sources with NO source_role + NO category +
-- a hardcoded intelligence_types=['GUIDE'] placeholder. Result: category drifts from role, and
-- new sources are unclassified.
--
-- THE FIX: make the label a LIVE function of what the source IS.
--   source_role (what it is)  -- classified at onboarding by classify-source-role.ts
--     -> category (what we pull)        -- derive_source_category() == migration 084 CASE, verbatim
--       -> intelligence_types (the content token)  -- derive_source_intelligence_types()
-- A BEFORE INSERT/UPDATE trigger sets category + intelligence_types from source_role + name on
-- every write. category/intelligence_types are no longer set independently — they DERIVE.
--
-- Additive + reversible: two functions + one trigger; no column added/dropped. Reverse = drop
-- the trigger + functions (category/intelligence_types keep their last-derived values).
-- Does NOT change source_role (the input/SSOT). Honors 084's name exceptions verbatim.

-- 1. category = f(source_role, name) — migration 084's CASE, ported verbatim.
CREATE OR REPLACE FUNCTION public.derive_source_category(p_role text, p_name text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    -- Name-based exceptions (apply first; precedence over role default) — from migration 084.
    WHEN lower(p_name) LIKE '%imo%' OR lower(p_name) LIKE '%icao%' THEN 'regulatory'
    WHEN lower(p_name) LIKE '%freightwaves%'
      OR lower(p_name) LIKE '%loadstar%'
      OR lower(p_name) LIKE '%greenbiz%'
      OR lower(p_name) LIKE '%environmental finance%'
      OR lower(p_name) LIKE '%splash247%'
      OR lower(p_name) LIKE '%supply chain digital%'
      OR lower(p_name) LIKE '%edie%'
      OR lower(p_name) LIKE '%reuters sustainable business%'
      OR lower(p_name) LIKE '%carbon trust%'
      OR lower(p_name) LIKE '%project drawdown%'
      THEN 'research'
    -- Role-based defaults — from migration 084.
    WHEN p_role IN ('primary_legal_authority', 'standards_body', 'government_press') THEN 'regulatory'
    WHEN p_role IN ('intergovernmental_body', 'academic_research') THEN 'research'
    WHEN p_role IN ('trade_press', 'industry_data_provider', 'vendor_corporate', 'industry_association') THEN 'market_news'
    WHEN p_role = 'statistical_data_agency' THEN 'operational_data'
    ELSE NULL
  END
$$;

-- 2. intelligence_types = f(category) — one canonical content token per category (kills the
--    ['GUIDE'] placeholder + the REG/RES/MKT/legislation/regulation vocab drift).
CREATE OR REPLACE FUNCTION public.derive_source_intelligence_types(p_category text)
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_category
    WHEN 'regulatory'       THEN ARRAY['regulation']
    WHEN 'research'         THEN ARRAY['research']
    WHEN 'market_news'      THEN ARRAY['market_intel']
    WHEN 'operational_data' THEN ARRAY['operational_data']
    ELSE ARRAY[]::text[]
  END
$$;

-- 3. Trigger: derive category + intelligence_types from source_role + name on every write.
CREATE OR REPLACE FUNCTION public.set_source_label()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.category := public.derive_source_category(NEW.source_role, NEW.name);
  NEW.intelligence_types := public.derive_source_intelligence_types(NEW.category);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_source_label_trg ON public.sources;
CREATE TRIGGER set_source_label_trg
  BEFORE INSERT OR UPDATE ON public.sources
  FOR EACH ROW
  EXECUTE FUNCTION public.set_source_label();

COMMENT ON FUNCTION public.set_source_label() IS
  'Migration 123: category + intelligence_types DERIVE from source_role + name on every write (derive_source_category == migration 084 CASE). The label is now a live function of what the source IS, not an independent field. source_role is classified at onboarding by classify-source-role.ts.';
