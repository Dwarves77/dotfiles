// profile-policy.mjs — pure policy for the self-service member profile route (spec 05 §2, §5 component
// 1; migration 293's community_member_profiles; docs/dispatches lane COMMUNITY-C). PURE — no database,
// no I/O.
//
// TWO RESPONSIBILITIES, both stated in migration 293's own header comment on
// community_member_profiles_update_own: "the application route that handles self-service profile edits
// MUST strip verified/verified_at/verification_method from a member-originated PATCH before writing...
// this table has no per-column RLS."
//
//   1. sanitizeMemberWrite(body) — the STRIP: takes a raw member-submitted PUT body and returns only the
//      four self-service fields (org_type, role, sector, region), validated against the same closed
//      vocabularies migration 293's own CHECK constraints enforce. verified/verified_at/
//      verification_method/organisation_key/user_id are REMOVED even if present on the body — this is
//      an ALLOWLIST projection (same posture as identity.mjs's projectAuthorIdentity: "pick the named
//      fields out", never "strip everything except these"), so a client that adds a fifth field to its
//      request body can never widen what gets written. See MEMBER_WRITE_FORBIDDEN_COLUMNS below for the
//      same list named explicitly, for a caller/test that wants to assert the strip by name.
//   2. projectOwnProfile(row) — the read-side shape for GET (own projection): the four self-service
//      fields plus verified/verified_at/verification_method. A member IS allowed to see their OWN
//      verification status (unlike identity.mjs's public projection of another member's profile, which
//      strips verified_at/verification_method — other members never see when or how someone verified).
//      organisation_key is never projected here either way — it stays internal-only regardless of whose
//      row it is (migration 293's REVOKE has no exception for "it's your own row").

import { ORG_TYPES } from "./identity.mjs";

/** Schema-identical to migration 293/294's `region` CHECK constraint. */
export const REGIONS = Object.freeze(["EU", "UK", "US", "LATAM", "APAC", "HK", "MEA", "GLOBAL"]);

const MAX_ROLE_LEN = 120;
const MAX_SECTOR_LEN = 80;

/** The verification/organisation_key columns a member write can NEVER set, regardless of what the
 * request body carries — named explicitly so a caller/test can assert the strip by name, matching
 * migration 293's own wording ("MUST strip verified/verified_at/verification_method"; organisation_key
 * and user_id are the same class of column for the same reason). */
export const MEMBER_WRITE_FORBIDDEN_COLUMNS = Object.freeze([
  "verified",
  "verified_at",
  "verification_method",
  "organisation_key",
  "user_id",
]);

function trimmedOrNull(v, maxLen) {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return maxLen ? t.slice(0, maxLen) : t;
}

/**
 * @param {unknown} body - raw parsed JSON from a member's PUT request.
 * @returns {
 *   { ok: true, data: { org_type: string, role: string|null, sector: string|null, region: string|null } }
 *   | { ok: false, error: string }
 * }
 */
export function sanitizeMemberWrite(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "request body must be a JSON object" };
  }
  const raw = /** @type {Record<string, unknown>} */ (body);

  const orgType = raw.org_type ?? raw.orgType;
  if (typeof orgType !== "string" || !ORG_TYPES.includes(orgType)) {
    return { ok: false, error: `org_type is required and must be one of: ${ORG_TYPES.join(", ")}` };
  }

  let region = null;
  const regionRaw = raw.region;
  if (regionRaw !== undefined && regionRaw !== null && regionRaw !== "") {
    if (typeof regionRaw !== "string" || !REGIONS.includes(regionRaw)) {
      return { ok: false, error: `region must be one of: ${REGIONS.join(", ")}` };
    }
    region = regionRaw;
  }

  return {
    ok: true,
    data: {
      org_type: orgType,
      role: trimmedOrNull(raw.role, MAX_ROLE_LEN),
      sector: trimmedOrNull(raw.sector, MAX_SECTOR_LEN),
      region,
    },
  };
}

/**
 * @param {{
 *   org_type?: string|null, role?: string|null, sector?: string|null, region?: string|null,
 *   verified?: boolean|null, verified_at?: string|null, verification_method?: string|null,
 * } | null | undefined} row
 * @returns {{
 *   orgType: string|null, role: string|null, sector: string|null, region: string|null,
 *   verified: boolean, verifiedAt: string|null, verificationMethod: string|null,
 * }}
 */
export function projectOwnProfile(row) {
  if (!row || typeof row !== "object") {
    return {
      orgType: null, role: null, sector: null, region: null,
      verified: false, verifiedAt: null, verificationMethod: null,
    };
  }
  return {
    orgType: typeof row.org_type === "string" ? row.org_type : null,
    role: typeof row.role === "string" ? row.role : null,
    sector: typeof row.sector === "string" ? row.sector : null,
    region: typeof row.region === "string" ? row.region : null,
    verified: row.verified === true,
    verifiedAt: typeof row.verified_at === "string" ? row.verified_at : null,
    verificationMethod: typeof row.verification_method === "string" ? row.verification_method : null,
  };
}
