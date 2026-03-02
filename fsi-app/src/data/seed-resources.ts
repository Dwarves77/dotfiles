import type { Resource } from "@/types/resource";
import rawResources from "./seed-resources.json";

// Resources are pre-processed: REMAP applied, audit dates set
// 119 resources with modes, topic, jurisdiction already merged
export const SEED_RESOURCES: Resource[] = rawResources as Resource[];

export const AUDIT_DATE = "2026-03-01";
