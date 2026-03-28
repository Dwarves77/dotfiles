import type { Resource } from "@/types/resource";
import rawResources from "./seed-resources.json";
import { SUB_JURISDICTION_TAGS, REGULATORY_CONFLICT_TAGS } from "./seed-subjurisdictions";

// Resources are pre-processed: REMAP applied, audit dates set
// 119 resources with modes, topic, jurisdiction already merged
// Then enriched with sub-jurisdiction and regulatory conflict data
export const SEED_RESOURCES: Resource[] = (rawResources as Resource[]).map((r) => {
  const subTag = SUB_JURISDICTION_TAGS[r.id];
  const conflictTag = REGULATORY_CONFLICT_TAGS[r.id];
  return {
    ...r,
    ...(subTag ? { subJurisdiction: subTag.subJurisdiction, subJurisdictionLabel: subTag.subJurisdictionLabel } : {}),
    ...(conflictTag ? { regulatoryConflict: conflictTag } : {}),
  };
});

export const AUDIT_DATE = "2026-03-01";
