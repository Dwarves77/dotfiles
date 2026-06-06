/**
 * operations-matrix.ts — matrix eligibility gate for Operations Profile S3/S4.
 *
 * Per analysis-construction-spec SKILL.md §5:
 *   S1/S2 are single-region span facts that always render.
 *   S3 (Cost Comparison Against Alternatives) and S4 (Cross-Regional Strategic
 *   Implications) are MATRIX-gated:
 *     - The same dimension must be sourced across >=2 regions, AND
 *     - The item's OWN jurisdiction must be one of those sourced regions.
 *
 * The gate is a COVERAGE QUERY over the existing region_dimension_coverage
 * table (migration 109) which exists and is the authoritative coverage SSOT.
 * We do NOT count globally — that was the identified prior bug. The check is:
 *   "given this item's jurisdictions, does ANY dimension have >=2 sourced
 *    regions where one of those regions is this item's own jurisdiction?"
 *
 * Read-only helper (no DB writes). Called server-side by the Operations page
 * component. Returns a MatrixEligibility record per Operations dimension.
 *
 * Dimensions are the 6-value vocabulary from migration 106/109:
 *   regulatory_feasibility | regional_resources | labor_markets |
 *   materials_sourcing | infrastructure | operational_cost
 *
 * S3 eligibility: any dimension reaches >=2 sourced regions AND item's
 *   jurisdiction is one of those regions.
 * S4 eligibility: S3 is eligible (S4 is transitive over S3).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// ── Vocabulary ─────────────────────────────────────────────────────────────

export type OperationsDimension =
  | "regulatory_feasibility"
  | "regional_resources"
  | "labor_markets"
  | "materials_sourcing"
  | "infrastructure"
  | "operational_cost";

export const ALL_OPERATIONS_DIMENSIONS: OperationsDimension[] = [
  "regulatory_feasibility",
  "regional_resources",
  "labor_markets",
  "materials_sourcing",
  "infrastructure",
  "operational_cost",
];

// Human-readable dimension labels (for omit-note text).
const DIMENSION_LABELS: Record<OperationsDimension, string> = {
  regulatory_feasibility: "Regulatory Feasibility",
  regional_resources: "Regional Resources",
  labor_markets: "Labor Markets",
  materials_sourcing: "Materials Sourcing",
  infrastructure: "Infrastructure",
  operational_cost: "Operational Cost",
};

// ── Region coverage row shape from region_dimension_coverage ───────────────

interface CoverageRow {
  region_id: string;
  dimension: string;
  state: "populated" | "partial" | "pending" | "missing";
  fact_count: number;
}

// ── Region row shape from regions table ───────────────────────────────────

interface RegionRow {
  id: string;
  code: string;
  iso_codes: string[];
}

// ── Output shapes ──────────────────────────────────────────────────────────

export interface DimensionEligibility {
  dimension: OperationsDimension;
  /** True when >=2 sourced regions for this dimension AND item-jurisdiction
   *  membership confirmed. S3/S4 may render. */
  eligible: boolean;
  /** Count of sourced regions for this dimension (state = 'populated' or 'partial'). */
  sourcedRegionCount: number;
  /** Whether the item's own jurisdiction is among the sourced regions. */
  itemJurisdictionPresent: boolean;
  /** Honest omit-note to show when eligible=false. */
  omitNote: string;
}

export interface MatrixEligibility {
  /** True when ANY dimension is S3-eligible (same threshold for S4). */
  s3Eligible: boolean;
  /** True when S3 is eligible (S4 is transitive over S3). */
  s4Eligible: boolean;
  /** Per-dimension breakdown. */
  dimensions: DimensionEligibility[];
  /** Region codes resolved from the item's jurisdiction strings. */
  resolvedRegionCodes: string[];
}

// ── Item shape — minimal surface for the gate ──────────────────────────────

export interface OperationsItemForGate {
  /** jurisdictions column from intelligence_items — ISO/supranational codes. */
  jurisdictions?: string[] | null;
  /** Legacy jurisdiction string (single value). Fallback when jurisdictions is empty. */
  jurisdiction?: string | null;
}

// ── Resolve item jurisdictions → region codes ──────────────────────────────

/**
 * Resolve the item's jurisdiction strings to canonical region codes, using the
 * regions table (iso_codes column maps ISO codes → region).
 *
 * Returns the set of region codes (e.g. ["EU", "US"]) that contain any of the
 * item's jurisdiction codes.
 */
function resolveItemRegionCodes(
  item: OperationsItemForGate,
  allRegions: RegionRow[]
): string[] {
  // Collect all jurisdiction codes from the item.
  const itemJurisCodes: string[] = [];
  if (Array.isArray(item.jurisdictions) && item.jurisdictions.length > 0) {
    itemJurisCodes.push(...item.jurisdictions);
  } else if (item.jurisdiction) {
    // Legacy single-string: may be "EU", "US", "Singapore", etc.
    itemJurisCodes.push(item.jurisdiction);
  }
  if (itemJurisCodes.length === 0) return [];

  const codes = new Set<string>();
  for (const region of allRegions) {
    // Check if any of the item's jurisdiction codes overlap with the
    // region's iso_codes, or directly match the region code.
    const regionCodes = new Set([
      region.code.toUpperCase(),
      ...region.iso_codes.map((c) => c.toUpperCase()),
    ]);
    for (const ijc of itemJurisCodes) {
      if (regionCodes.has(ijc.toUpperCase())) {
        codes.add(region.code);
        break;
      }
    }
  }
  return Array.from(codes);
}

// ── Main eligibility check ────────────────────────────────────────────────

/**
 * checkMatrixEligibility — pure DB read, no writes.
 *
 * @param supabase  Service-role Supabase client (server-side only).
 * @param item      The regional_data item whose eligibility we are checking.
 * @returns         MatrixEligibility record describing S3/S4 eligibility per
 *                  dimension, with honest omit-notes for ineligible dimensions.
 */
export async function checkMatrixEligibility(
  supabase: SupabaseClient,
  item: OperationsItemForGate
): Promise<MatrixEligibility> {
  // Fetch all regions (needed to resolve item jurisdiction → region code).
  const { data: regionsData, error: regionsError } = await supabase
    .from("regions")
    .select("id, code, iso_codes");

  if (regionsError || !regionsData) {
    // Soft-fail: treat all dimensions as ineligible with a note.
    return buildIneligibleResult([], "Coverage data unavailable (regions query failed).");
  }

  const allRegions = regionsData as RegionRow[];

  // Resolve the item's jurisdiction to canonical region codes.
  const resolvedRegionCodes = resolveItemRegionCodes(item, allRegions);

  if (resolvedRegionCodes.length === 0) {
    // Cannot confirm item-jurisdiction membership: gate stays closed.
    return buildIneligibleResult(
      [],
      "Item jurisdiction not resolved to a canonical region — S3/S4 require jurisdiction membership in a sourced region."
    );
  }

  // Build region_id → code lookup.
  const regionIdToCode = new Map<string, string>(
    allRegions.map((r) => [r.id, r.code])
  );

  // Fetch all coverage rows (state = populated OR partial = "sourced").
  const { data: coverageData, error: coverageError } = await supabase
    .from("region_dimension_coverage")
    .select("region_id, dimension, state, fact_count")
    .in("state", ["populated", "partial"]);

  if (coverageError || !coverageData) {
    return buildIneligibleResult(
      resolvedRegionCodes,
      "Coverage data unavailable (coverage query failed)."
    );
  }

  const coverageRows = coverageData as CoverageRow[];

  // Build per-dimension analysis.
  const resolvedCodesSet = new Set(resolvedRegionCodes.map((c) => c.toUpperCase()));

  const dimensionResults: DimensionEligibility[] = ALL_OPERATIONS_DIMENSIONS.map(
    (dimension) => {
      const rows = coverageRows.filter((r) => r.dimension === dimension);
      const sourcedRegionCodes = rows
        .map((r) => regionIdToCode.get(r.region_id))
        .filter((code): code is string => !!code);

      const sourcedCount = sourcedRegionCodes.length;

      // The critical gate: is the item's OWN jurisdiction among the sourced regions?
      const itemJurisdictionPresent = sourcedRegionCodes.some((code) =>
        resolvedCodesSet.has(code.toUpperCase())
      );

      const eligible = sourcedCount >= 2 && itemJurisdictionPresent;

      const omitNote = buildOmitNote(
        dimension,
        sourcedCount,
        itemJurisdictionPresent,
        sourcedRegionCodes,
        resolvedRegionCodes
      );

      return {
        dimension,
        eligible,
        sourcedRegionCount: sourcedCount,
        itemJurisdictionPresent,
        omitNote,
      };
    }
  );

  const s3Eligible = dimensionResults.some((d) => d.eligible);
  const s4Eligible = s3Eligible; // S4 is transitive over S3.

  return {
    s3Eligible,
    s4Eligible,
    dimensions: dimensionResults,
    resolvedRegionCodes,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────

function buildIneligibleResult(
  resolvedRegionCodes: string[],
  globalNote: string
): MatrixEligibility {
  const dimensions: DimensionEligibility[] = ALL_OPERATIONS_DIMENSIONS.map((dimension) => ({
    dimension,
    eligible: false,
    sourcedRegionCount: 0,
    itemJurisdictionPresent: false,
    omitNote: globalNote,
  }));
  return {
    s3Eligible: false,
    s4Eligible: false,
    dimensions,
    resolvedRegionCodes,
  };
}

function buildOmitNote(
  dimension: OperationsDimension,
  sourcedCount: number,
  itemJurisdictionPresent: boolean,
  sourcedRegionCodes: string[],
  resolvedRegionCodes: string[]
): string {
  const label = DIMENSION_LABELS[dimension];
  if (sourcedCount === 0) {
    return `${label}: no regions have sourced data for this dimension yet — comparison not possible.`;
  }
  if (sourcedCount === 1) {
    const onlyRegion = sourcedRegionCodes[0] || "one region";
    return (
      `${label}: only ${onlyRegion} is sourced (need >=2 regions for comparison). ` +
      `Comparison will appear as coverage fills.`
    );
  }
  // sourcedCount >= 2 but item-jurisdiction not present.
  if (!itemJurisdictionPresent) {
    const itemRegions = resolvedRegionCodes.join(", ") || "this item's jurisdiction";
    const sourcedList = sourcedRegionCodes.slice(0, 3).join(", ");
    return (
      `${label}: ${sourcedCount} regions sourced (${sourcedList}${sourcedCount > 3 ? "…" : ""}), ` +
      `but ${itemRegions} is not among them — item-jurisdiction membership required for a ` +
      `valid comparison. Comparison not shown.`
    );
  }
  // Should not reach here (eligible=true), but be safe.
  return `${label}: eligible for comparison (${sourcedCount} regions sourced).`;
}
