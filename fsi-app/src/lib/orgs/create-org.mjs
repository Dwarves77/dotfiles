// create-org.mjs: self-service organisation creation with the onboarding profile (lane AUTH-2, 2026-10-06).
//
// WHY. Signup collects only email and password. The specs need more per user and per organisation
// (spec 05: role, sector, region; Community component 9: sector_profile seeded at workspace creation;
// ADR-034: organisation size as a profile dimension), so the question is asked once, at organisation
// creation, on the no-workspace onboarding page (NoWorkspaceLanding), never before email confirmation
// (that would create organisations for addresses that never confirm).
//
// WHAT IT WRITES, every column already exists (no migration):
//   organisations + owner membership   create_org_for_self() RPC (migration 076), caller becomes owner
//   workspace_settings.sector_profile  chosen sector ids (the column OnboardingWizard writes too)
//   workspace_settings.profile.org_size.headcount_band   ADR-034 band (profile-contract.mjs), merged
//                                      into the existing profile jsonb, sibling keys kept
//   profiles.region                    spec 05 region codes (community/profile-policy.mjs REGIONS)
//   profiles.job_title                 the user's own job role, read by the spec 05 pseudonymous display
//
// WHAT IT NEVER TAKES FROM THE REQUEST: an organisation id, a user id, or a role. The only organisation
// touched is the id the RPC returns for the caller, the RPC takes no role (the creator is owner by
// construction), and joining an existing organisation is by invitation only (accept_invitation grants
// the role the inviter chose). parseCreateOrgInput builds its result from a fixed allowlist, so any other
// key in the body is dropped.
//
// DEPENDENCIES ARE INJECTED (supabase client, ensureProfile) so the tests run with no database.

import { findBand, parseOrgProfile, PROFILE_JSON_KEYS } from "../profile/profile-contract.mjs";
import { REGIONS } from "../community/profile-policy.mjs";

const MAX_ORG_NAME = 200;
const MAX_JOB_TITLE = 120;

/**
 * @param {unknown} body raw parsed JSON
 * @param {{ validSectorIds: Iterable<string> }} opts
 * @returns {{ ok: true, input: { name: string, sectors: string[], headcountBand: string|null, regions: string[], jobTitle: string|null } }
 *   | { ok: false, error: string }}
 */
export function parseCreateOrgInput(body, { validSectorIds }) {
  const b = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) return { ok: false, error: "Organisation name is required." };
  if (name.length > MAX_ORG_NAME) return { ok: false, error: `Organisation name must be ${MAX_ORG_NAME} characters or fewer.` };

  const sectorSet = new Set(validSectorIds);
  const sectorsRaw = Array.isArray(b.sectors) ? b.sectors : [];
  const unknownSector = sectorsRaw.find((s) => typeof s !== "string" || !sectorSet.has(s));
  if (unknownSector !== undefined) return { ok: false, error: "One of the selected sectors is not recognised." };
  const sectors = [...new Set(sectorsRaw)];

  let headcountBand = null;
  if (b.headcount_band != null && b.headcount_band !== "") {
    if (typeof b.headcount_band !== "string" || !findBand("headcount", b.headcount_band)) {
      return { ok: false, error: "The selected company size is not recognised." };
    }
    headcountBand = b.headcount_band;
  }

  const regionsRaw = Array.isArray(b.regions) ? b.regions : [];
  const regionSet = new Set(REGIONS);
  if (regionsRaw.some((r) => typeof r !== "string" || !regionSet.has(r))) {
    return { ok: false, error: "One of the selected regions is not recognised." };
  }
  const regions = [...new Set(regionsRaw)];

  let jobTitle = null;
  if (typeof b.job_title === "string" && b.job_title.trim()) {
    jobTitle = b.job_title.trim();
    if (jobTitle.length > MAX_JOB_TITLE) return { ok: false, error: `Job title must be ${MAX_JOB_TITLE} characters or fewer.` };
  }

  return { ok: true, input: { name, sectors, headcountBand, regions, jobTitle } };
}

/**
 * @param {{
 *   supabase: any,
 *   userId: string,
 *   email: string | null,
 *   input: { name: string, sectors: string[], headcountBand: string|null, regions: string[], jobTitle: string|null },
 *   ensureProfile: (userId: string, email: string|null) => Promise<{ exists: boolean }>,
 * }} args
 * @returns {Promise<{ ok: true, orgId: string, settingsSaved: boolean, profileSaved: boolean }
 *   | { ok: false, status: number, error: string }>}
 */
export async function createOrganisationForSelf({ supabase, userId, email, input, ensureProfile }) {
  // org_memberships.user_id references profiles.id and the RPC does not create the profile.
  const ensured = await ensureProfile(userId, email);
  if (!ensured || !ensured.exists) {
    return { ok: false, status: 500, error: "Your profile could not be prepared. Try again in a moment." };
  }

  const { data: orgId, error: rpcError } = await supabase.rpc("create_org_for_self", {
    p_org_name: input.name,
    p_org_slug: null,
  });
  if (rpcError || !orgId) {
    return { ok: false, status: 400, error: (rpcError && rpcError.message) || "The organisation could not be created." };
  }

  // workspace_settings: only the organisation the RPC just returned for this caller.
  let settingsSaved = true;
  const patch = {};
  if (input.sectors.length > 0) patch.sector_profile = input.sectors;
  if (input.headcountBand) {
    const { data: row, error: readError } = await supabase
      .from("workspace_settings")
      .select("profile")
      .eq("org_id", orgId)
      .maybeSingle();
    if (readError) {
      settingsSaved = false;
    } else {
      const current = row && row.profile && typeof row.profile === "object" ? row.profile : {};
      const size = { ...parseOrgProfile(current).orgSize, headcount_band: input.headcountBand };
      patch.profile = { ...current, [PROFILE_JSON_KEYS.orgSize]: size };
    }
  }
  if (Object.keys(patch).length > 0) {
    const { error } = await supabase.from("workspace_settings").update(patch).eq("org_id", orgId);
    if (error) settingsSaved = false;
  }

  // profiles: only the caller's own row, only the two fields this form collects.
  let profileSaved = true;
  const profilePatch = {};
  if (input.jobTitle) profilePatch.job_title = input.jobTitle;
  if (input.regions.length > 0) profilePatch.region = input.regions;
  if (Object.keys(profilePatch).length > 0) {
    const { error } = await supabase
      .from("profiles")
      .update({ ...profilePatch, updated_at: new Date().toISOString() })
      .eq("id", userId);
    if (error) profileSaved = false;
  }

  return { ok: true, orgId: String(orgId), settingsSaved, profileSaved };
}
