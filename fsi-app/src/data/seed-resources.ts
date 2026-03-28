import type { Resource } from "@/types/resource";
import rawResources from "./seed-resources.json";
import { SUB_JURISDICTION_TAGS, JURISDICTION_OVERRIDES, REGULATORY_CONFLICT_TAGS } from "./seed-subjurisdictions";

// Resources are pre-processed: REMAP applied, audit dates set
// 119 resources with modes, topic, jurisdiction already merged
// Then enriched with:
//   - Jurisdiction overrides (country-level corrections, e.g. "asia" → "singapore")
//   - Sub-jurisdiction tags (state/region within a country, e.g. "us-ca" for California)
//   - Regulatory conflict data
export const SEED_RESOURCES: Resource[] = (rawResources as Resource[]).map((r) => {
  const jurOverride = JURISDICTION_OVERRIDES[r.id];
  const subTag = SUB_JURISDICTION_TAGS[r.id];
  const conflictTag = REGULATORY_CONFLICT_TAGS[r.id];
  return {
    ...r,
    ...(jurOverride ? { jurisdiction: jurOverride.jurisdiction } : {}),
    ...(subTag ? { subJurisdiction: subTag.subJurisdiction, subJurisdictionLabel: subTag.subJurisdictionLabel } : {}),
    ...(conflictTag ? { regulatoryConflict: conflictTag } : {}),
  };
});

export const AUDIT_DATE = "2026-03-01";
