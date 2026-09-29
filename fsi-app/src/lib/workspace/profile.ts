// profile.ts, the workspace profile the read-time contextualization layer consumes (Option B, mig 251).
//
// Shared briefs stay role-generic; this profile is applied per-viewer at READ time (never at generation).
// Assembles the full profile from workspace_settings: sector_profile (cargo verticals) + jurisdiction_weights
// (already present) + the mig-251 `profile` jsonb (roles, transport modes, trade lanes, products, baseline).

import type { SupabaseClient } from "@supabase/supabase-js";
import { computeItemRelevance } from "@/lib/workspace/relevance.mjs";
import { ALL_SECTORS } from "@/lib/constants";
import { parseOrgProfile, DEFAULT_ORG_PROFILE } from "@/lib/profile/profile-contract.mjs";

export interface WorkspaceOrgSize {
  headcount_band: string | null;
  revenue_band: string | null;
  shipment_volume_band: string | null;
}

export interface WorkspaceProfile {
  roles: string[];
  transportModes: string[];
  tradeLanes: string[];
  products: string[];
  operationalBaseline: string[];
  officeFootprint: string;
  regulationScope: string;
  /** cargo verticals, sector ids from workspace_settings.sector_profile */
  verticals: string[];
  /** jurisdiction → weight, from workspace_settings.jurisdiction_weights */
  jurisdictions: Record<string, number>;
  /** ADR-034 controlled-vocabulary role ids (workstream 7, lane W2-E), from
   *  workspace_settings.profile.org_roles, NOT the free-text `roles` field above. */
  orgRoles: string[];
  /** ADR-034 organisation-size bands, from workspace_settings.profile.org_size. */
  orgSize: WorkspaceOrgSize;
}

/** A conservative default for a viewer with no configured profile: a general freight operator, worldwide.
 *  Never invents verticals, leaves them empty so the lens degrades to "general applicability". */
export const DEFAULT_WORKSPACE_PROFILE: WorkspaceProfile = {
  roles: ["freight operator"],
  transportModes: ["air", "ocean", "road"],
  tradeLanes: ["worldwide"],
  products: [],
  operationalBaseline: [],
  officeFootprint: "",
  regulationScope: "freight-forwarding, import/export, and freight-sustainability regulation",
  verticals: [],
  jurisdictions: { global: 1 },
  orgRoles: DEFAULT_ORG_PROFILE.orgRoles,
  orgSize: DEFAULT_ORG_PROFILE.orgSize,
};

type ProfileJson = Partial<{
  roles: string[]; transport_modes: string[]; trade_lanes: string[]; products: string[];
  operational_baseline: string[]; office_footprint: string; regulation_scope: string;
}>;

/** Read the viewer's workspace profile. Returns the default when orgId is null or the row is absent ,
 *  the read layer must never fail closed on a missing profile (a generic lens is still useful). */
export async function getWorkspaceProfile(
  supabase: SupabaseClient,
  orgId: string | null,
): Promise<WorkspaceProfile> {
  if (!orgId) return DEFAULT_WORKSPACE_PROFILE;
  const { data, error } = await supabase
    .from("workspace_settings")
    .select("sector_profile, jurisdiction_weights, profile")
    .eq("org_id", orgId)
    .maybeSingle();
  if (error || !data) return DEFAULT_WORKSPACE_PROFILE;

  const p = (data.profile ?? {}) as ProfileJson;
  const verticals = Array.isArray(data.sector_profile) ? (data.sector_profile as string[]) : [];
  const jurisdictions =
    data.jurisdiction_weights && typeof data.jurisdiction_weights === "object"
      ? (data.jurisdiction_weights as Record<string, number>)
      : DEFAULT_WORKSPACE_PROFILE.jurisdictions;
  // org_roles/org_size (ADR-034, lane W2-E): same `profile` jsonb this function already selects and
  // reads for `roles` above, parseOrgProfile reads the NEW org_roles/org_size keys, distinct from
  // the free-text `roles` key, and fails open to DEFAULT_ORG_PROFILE on malformed input.
  const orgProfile = parseOrgProfile(data.profile) as { orgRoles: string[]; orgSize: WorkspaceOrgSize };

  return {
    roles: p.roles ?? DEFAULT_WORKSPACE_PROFILE.roles,
    transportModes: p.transport_modes ?? DEFAULT_WORKSPACE_PROFILE.transportModes,
    tradeLanes: p.trade_lanes ?? DEFAULT_WORKSPACE_PROFILE.tradeLanes,
    products: p.products ?? [],
    operationalBaseline: p.operational_baseline ?? [],
    officeFootprint: p.office_footprint ?? "",
    regulationScope: p.regulation_scope ?? DEFAULT_WORKSPACE_PROFILE.regulationScope,
    verticals,
    jurisdictions,
    orgRoles: orgProfile.orgRoles,
    orgSize: orgProfile.orgSize,
  };
}

export interface ItemApplicability {
  status: "applies" | "does_not_apply" | "needs_profile_input";
  reasons: string[];
  missingDimensions: string[];
}

export interface ItemRelevance {
  band: "high" | "medium" | "low";
  matchedModes: string[];
  matchedVerticals: { id: string; label: string }[];
  matchedJurisdictions: string[];
  roleSignals: string[];
  summary: string;
  /** ADR-034 applicability gate (workstream 7, lane W2-E), computed from the item's own
   *  compliance_object_tags against the profile's org_roles/org_size. See relevance.mjs header. */
  applicability: ItemApplicability;
}

/** The read-time lens for one item against a profile. Wraps the pure core with the live sector list. */
export function relevanceForItem(
  item: Record<string, unknown>,
  profile: WorkspaceProfile,
): ItemRelevance {
  return computeItemRelevance(
    item,
    {
      transport_modes: profile.transportModes,
      jurisdictions: profile.jurisdictions,
      verticals: profile.verticals,
      roles: profile.roles,
      orgRoles: profile.orgRoles,
      orgSize: profile.orgSize,
    },
    ALL_SECTORS,
  ) as ItemRelevance;
}
