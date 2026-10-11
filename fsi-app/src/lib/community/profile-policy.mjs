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
 *   { ok: true, data: { org_type: string, role: string|null, sector: string|null, region: string|null, default_anonymous: boolean } }
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

  // default_anonymous (migration 336, R8.7): the member's per-user default for a new post's
  // community_posts.anonymous flag. Omitted/undefined defaults to false (identity shown), matching
  // the R8.7 amendment's new default; any non-boolean value is rejected rather than silently coerced.
  const defaultAnonymousRaw = raw.default_anonymous ?? raw.defaultAnonymous;
  let defaultAnonymous = false;
  if (defaultAnonymousRaw !== undefined && defaultAnonymousRaw !== null) {
    if (typeof defaultAnonymousRaw !== "boolean") {
      return { ok: false, error: "default_anonymous must be a boolean" };
    }
    defaultAnonymous = defaultAnonymousRaw;
  }

  return {
    ok: true,
    data: {
      org_type: orgType,
      role: trimmedOrNull(raw.role, MAX_ROLE_LEN),
      sector: trimmedOrNull(raw.sector, MAX_SECTOR_LEN),
      region,
      default_anonymous: defaultAnonymous,
    },
  };
}

/**
 * @param {{
 *   org_type?: string|null, role?: string|null, sector?: string|null, region?: string|null,
 *   verified?: boolean|null, verified_at?: string|null, verification_method?: string|null,
 *   default_anonymous?: boolean|null,
 * } | null | undefined} row
 * @returns {{
 *   orgType: string|null, role: string|null, sector: string|null, region: string|null,
 *   verified: boolean, verifiedAt: string|null, verificationMethod: string|null,
 *   defaultAnonymous: boolean,
 * }}
 */
export function projectOwnProfile(row) {
  if (!row || typeof row !== "object") {
    return {
      orgType: null, role: null, sector: null, region: null,
      verified: false, verifiedAt: null, verificationMethod: null,
      defaultAnonymous: false,
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
    defaultAnonymous: row.default_anonymous === true,
  };
}
