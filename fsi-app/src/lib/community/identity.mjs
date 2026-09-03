// identity.mjs — verified-pseudonymous identity projection (spec 05 §2, required component 1).
// PURE. Takes a raw `community_member_profiles` row (or any object carrying the same fields) and
// returns ONLY the pseudonymity-safe subset: org type, role, sector, region, and verification status.
//
// "The platform knows exactly who you are. The room does not." (spec 05 §2). This function is the ONE
// place that decision is enforced in code: it is an ALLOWLIST projection (picks named fields out), never
// a denylist (strips named fields out) — a denylist silently leaks the next field someone adds to the
// profile row (name, email, company) the moment it lands, because "strip everything except these" fails
// open and "keep only these" fails closed. Any caller that wants to render an author's identity on the
// Community surface calls this, never selects raw profile columns directly.

/** Canonical org-type vocabulary community members self-declare against (spec 05 §2's own Gartner-model
 * fields: "job title, role, industry and company size"). Kept small and freight-domain-specific rather
 * than open text, so aggregation (dominance/k-anonymity by org TYPE, not identity) stays meaningful. */
export const ORG_TYPES = Object.freeze([
  "forwarder",
  "carrier",
  "shipper",
  "customs-broker",
  "3pl",
  "regulator",
  "ngo",
  "analyst",
  "other",
]);

/**
 * @param {{
 *   org_type?: string|null, orgType?: string|null,
 *   role?: string|null,
 *   sector?: string|null,
 *   region?: string|null,
 *   verified?: boolean|null,
 * } | null | undefined} profile
 * @returns {{ orgType: string|null, role: string|null, sector: string|null, region: string|null, verified: boolean }}
 */
export function projectAuthorIdentity(profile) {
  if (!profile || typeof profile !== "object") {
    return { orgType: null, role: null, sector: null, region: null, verified: false };
  }
  const orgTypeRaw = profile.orgType ?? profile.org_type ?? null;
  const orgType = typeof orgTypeRaw === "string" && ORG_TYPES.includes(orgTypeRaw) ? orgTypeRaw : null;
  const role = typeof profile.role === "string" && profile.role.trim() ? profile.role.trim() : null;
  const sector = typeof profile.sector === "string" && profile.sector.trim() ? profile.sector.trim() : null;
  const region = typeof profile.region === "string" && profile.region.trim() ? profile.region.trim() : null;
  const verified = profile.verified === true;
  return { orgType, role, sector, region, verified };
}
