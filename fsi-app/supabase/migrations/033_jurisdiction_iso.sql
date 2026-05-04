-- 033_jurisdiction_iso.sql
-- Add jurisdiction_iso column (ISO 3166-1 alpha-2 + ISO 3166-2 + free-text fallback)
-- Coexists with legacy jurisdictions column for 60-day dual-write window.

ALTER TABLE intelligence_items
  ADD COLUMN IF NOT EXISTS jurisdiction_iso TEXT[] DEFAULT '{}'::TEXT[];

ALTER TABLE sources
  ADD COLUMN IF NOT EXISTS jurisdiction_iso TEXT[] DEFAULT '{}'::TEXT[];

ALTER TABLE staged_updates
  ADD COLUMN IF NOT EXISTS jurisdiction_iso TEXT[] DEFAULT '{}'::TEXT[];

-- GIN indexes for array containment queries (used by coverage matrix W2.D)
CREATE INDEX IF NOT EXISTS idx_intel_items_jurisdiction_iso
  ON intelligence_items USING GIN (jurisdiction_iso);
CREATE INDEX IF NOT EXISTS idx_sources_jurisdiction_iso
  ON sources USING GIN (jurisdiction_iso);

-- One-shot backfill from legacy jurisdictions strings.
-- Conservative: only maps common unambiguous cases. Leaves the rest empty
-- for W4 backfill agent to handle with content inference.
UPDATE intelligence_items SET jurisdiction_iso = ARRAY['US']
  WHERE 'us' = ANY(jurisdictions) AND (jurisdiction_iso IS NULL OR array_length(jurisdiction_iso, 1) IS NULL);
UPDATE intelligence_items SET jurisdiction_iso = ARRAY['EU']
  WHERE 'eu' = ANY(jurisdictions) AND (jurisdiction_iso IS NULL OR array_length(jurisdiction_iso, 1) IS NULL);
UPDATE intelligence_items SET jurisdiction_iso = ARRAY['GB']
  WHERE 'uk' = ANY(jurisdictions) AND (jurisdiction_iso IS NULL OR array_length(jurisdiction_iso, 1) IS NULL);
UPDATE intelligence_items SET jurisdiction_iso = ARRAY['GLOBAL']
  WHERE 'global' = ANY(jurisdictions) AND (jurisdiction_iso IS NULL OR array_length(jurisdiction_iso, 1) IS NULL);
UPDATE intelligence_items SET jurisdiction_iso = ARRAY['SG']
  WHERE 'singapore' = ANY(jurisdictions) AND (jurisdiction_iso IS NULL OR array_length(jurisdiction_iso, 1) IS NULL);
UPDATE intelligence_items SET jurisdiction_iso = ARRAY['HK']
  WHERE 'hong kong' = ANY(jurisdictions) AND (jurisdiction_iso IS NULL OR array_length(jurisdiction_iso, 1) IS NULL);
UPDATE intelligence_items SET jurisdiction_iso = ARRAY['JP']
  WHERE 'japan' = ANY(jurisdictions) AND (jurisdiction_iso IS NULL OR array_length(jurisdiction_iso, 1) IS NULL);
UPDATE intelligence_items SET jurisdiction_iso = ARRAY['KR']
  WHERE 'south korea' = ANY(jurisdictions) AND (jurisdiction_iso IS NULL OR array_length(jurisdiction_iso, 1) IS NULL);
UPDATE intelligence_items SET jurisdiction_iso = ARRAY['CN']
  WHERE 'china' = ANY(jurisdictions) AND (jurisdiction_iso IS NULL OR array_length(jurisdiction_iso, 1) IS NULL);
UPDATE intelligence_items SET jurisdiction_iso = ARRAY['CA']
  WHERE 'canada' = ANY(jurisdictions) AND (jurisdiction_iso IS NULL OR array_length(jurisdiction_iso, 1) IS NULL);
UPDATE intelligence_items SET jurisdiction_iso = ARRAY['AU']
  WHERE 'australia' = ANY(jurisdictions) AND (jurisdiction_iso IS NULL OR array_length(jurisdiction_iso, 1) IS NULL);
-- IMO / ICAO are not jurisdictions per se but the platform treats them as such; preserve.
UPDATE intelligence_items SET jurisdiction_iso = ARRAY['IMO']
  WHERE 'imo' = ANY(jurisdictions) AND (jurisdiction_iso IS NULL OR array_length(jurisdiction_iso, 1) IS NULL);
UPDATE intelligence_items SET jurisdiction_iso = ARRAY['ICAO']
  WHERE 'icao' = ANY(jurisdictions) AND (jurisdiction_iso IS NULL OR array_length(jurisdiction_iso, 1) IS NULL);

-- Same backfill for sources
UPDATE sources SET jurisdiction_iso = ARRAY['US'] WHERE 'us' = ANY(jurisdictions) AND (jurisdiction_iso IS NULL OR array_length(jurisdiction_iso, 1) IS NULL);
UPDATE sources SET jurisdiction_iso = ARRAY['EU'] WHERE 'eu' = ANY(jurisdictions) AND (jurisdiction_iso IS NULL OR array_length(jurisdiction_iso, 1) IS NULL);
UPDATE sources SET jurisdiction_iso = ARRAY['GB'] WHERE 'uk' = ANY(jurisdictions) AND (jurisdiction_iso IS NULL OR array_length(jurisdiction_iso, 1) IS NULL);
UPDATE sources SET jurisdiction_iso = ARRAY['GLOBAL'] WHERE 'global' = ANY(jurisdictions) AND (jurisdiction_iso IS NULL OR array_length(jurisdiction_iso, 1) IS NULL);
UPDATE sources SET jurisdiction_iso = ARRAY['SG'] WHERE 'singapore' = ANY(jurisdictions) AND (jurisdiction_iso IS NULL OR array_length(jurisdiction_iso, 1) IS NULL);
UPDATE sources SET jurisdiction_iso = ARRAY['HK'] WHERE 'hong kong' = ANY(jurisdictions) AND (jurisdiction_iso IS NULL OR array_length(jurisdiction_iso, 1) IS NULL);
UPDATE sources SET jurisdiction_iso = ARRAY['JP'] WHERE 'japan' = ANY(jurisdictions) AND (jurisdiction_iso IS NULL OR array_length(jurisdiction_iso, 1) IS NULL);
UPDATE sources SET jurisdiction_iso = ARRAY['KR'] WHERE 'south korea' = ANY(jurisdictions) AND (jurisdiction_iso IS NULL OR array_length(jurisdiction_iso, 1) IS NULL);
UPDATE sources SET jurisdiction_iso = ARRAY['CN'] WHERE 'china' = ANY(jurisdictions) AND (jurisdiction_iso IS NULL OR array_length(jurisdiction_iso, 1) IS NULL);
UPDATE sources SET jurisdiction_iso = ARRAY['CA'] WHERE 'canada' = ANY(jurisdictions) AND (jurisdiction_iso IS NULL OR array_length(jurisdiction_iso, 1) IS NULL);
UPDATE sources SET jurisdiction_iso = ARRAY['AU'] WHERE 'australia' = ANY(jurisdictions) AND (jurisdiction_iso IS NULL OR array_length(jurisdiction_iso, 1) IS NULL);
UPDATE sources SET jurisdiction_iso = ARRAY['IMO'] WHERE 'imo' = ANY(jurisdictions) AND (jurisdiction_iso IS NULL OR array_length(jurisdiction_iso, 1) IS NULL);
UPDATE sources SET jurisdiction_iso = ARRAY['ICAO'] WHERE 'icao' = ANY(jurisdictions) AND (jurisdiction_iso IS NULL OR array_length(jurisdiction_iso, 1) IS NULL);

COMMENT ON COLUMN intelligence_items.jurisdiction_iso IS
  'Sub-national-aware jurisdiction codes. ISO 3166-1 alpha-2, ISO 3166-2, or free-text supranational/IGO codes (EU, GLOBAL, IMO, ICAO). Coexists with legacy jurisdictions during 60-day transition window.';
COMMENT ON COLUMN sources.jurisdiction_iso IS
  'Sub-national-aware jurisdiction codes. ISO 3166-1 alpha-2, ISO 3166-2, or free-text supranational/IGO codes.';
