// identity.mjs, author identity projection (spec 05 section 2, required component 1; R8.7 amendment, spec 07
// Community section, 2026-09-25, migration 336). PURE. Takes a raw profile-shaped object and returns
// ONLY the allowlisted fields a room may show: org type, role, sector, region, verification status, and
// (identity-by-default, R8.7) NAME and COMPANY, unless the post or the member opted into anonymity.
//
// R8.7 SUPERSEDES this module's original framing ("The platform knows exactly who you are. The room
// does not", spec 05 section 2 item 1). Operator, 2026-09-25, verbatim: "a room can and should know who you
// are when you talking. unless you choose to be annonymous"; "people can be anonymous if they choose in
// a post or as a user." The new default is IDENTITY SHOWN; ANONYMITY is the opt-in, per-post
// (`community_posts.anonymous`) or per-user (`community_member_profiles.default_anonymous`, migration
// 336). This function is still the ONE place that decision is enforced in code: it is an ALLOWLIST
// projection (picks named fields out), never a denylist (strips named fields out), a denylist silently
// leaks the next field someone adds to the profile row the moment it lands, because "strip everything
// except these" fails open and "keep only these" fails closed. Any caller that wants to render an
// author's identity on the Community surface calls this, never selects raw profile/organisation columns
// directly.
//
// ANONYMOUS CARVE-OUT (R8.7, verbatim): "an anonymous post keeps the verified-member marker so the room
// can still trust the source without knowing who it is." So `anonymous: true` withholds ONLY name and
// company; `verified` (and the pseudonymous org type/role/sector/region) are unaffected, since spec 05
// section 2 items 2-6 (the antitrust guard, k-anonymity, etc.) never depended on withholding identity.

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
 *   name?: string|null,
 *   company?: string|null,
 *   anonymous?: boolean|null,
 * } | null | undefined} profile
 *   `anonymous` is the EFFECTIVE per-post flag the caller has already resolved (post-level
 *   `community_posts.anonymous` if explicitly set on the post, else the author's
 *   `community_member_profiles.default_anonymous`), this function does not itself apply that
 *   fallback, it only honours whatever boolean it is given.
 * @returns {{
 *   orgType: string|null, role: string|null, sector: string|null, region: string|null,
 *   verified: boolean, name: string|null, company: string|null, anonymous: boolean,
 * }}
 */
export function projectAuthorIdentity(profile) {
  if (!profile || typeof profile !== "object") {
    return {
      orgType: null, role: null, sector: null, region: null, verified: false,
      name: null, company: null, anonymous: false,
    };
  }
  const orgTypeRaw = profile.orgType ?? profile.org_type ?? null;
  const orgType = typeof orgTypeRaw === "string" && ORG_TYPES.includes(orgTypeRaw) ? orgTypeRaw : null;
  const role = typeof profile.role === "string" && profile.role.trim() ? profile.role.trim() : null;
  const sector = typeof profile.sector === "string" && profile.sector.trim() ? profile.sector.trim() : null;
  const region = typeof profile.region === "string" && profile.region.trim() ? profile.region.trim() : null;
  const verified = profile.verified === true;
  const anonymous = profile.anonymous === true;

  // R8.7: name/company are shown by default, withheld ONLY when anonymous. verified/orgType/role/
  // sector/region are unaffected by anonymity (the carve-out this module's header describes).
  const name = !anonymous && typeof profile.name === "string" && profile.name.trim()
    ? profile.name.trim()
    : null;
  const company = !anonymous && typeof profile.company === "string" && profile.company.trim()
    ? profile.company.trim()
    : null;

  return { orgType, role, sector, region, verified, name, company, anonymous };
}

/**
 * The R8.7 fallback rule (migration 336): a post's OWN `community_posts.anonymous` wins when it is
 * explicitly a boolean (the composer's per-post override); otherwise the author's account-wide
 * `community_member_profiles.default_anonymous` applies. Pure, so the route and any future caller
 * (e.g. a backfill) resolve the same effective value the same way, in one place.
 *
 * @param {{ postAnonymous?: boolean|null, profileDefaultAnonymous?: boolean|null }} args
 * @returns {boolean}
 */
export function resolveEffectiveAnonymous({ postAnonymous, profileDefaultAnonymous } = {}) {
  if (typeof postAnonymous === "boolean") return postAnonymous;
  return profileDefaultAnonymous === true;
}

/**
 * Composition helper for a route rendering ONE post's author identity: resolves the effective
 * anonymity (resolveEffectiveAnonymous) then projects it (projectAuthorIdentity) in one call, so a
 * route never has to remember to do both steps in order. Callers (GET/POST /api/community/posts) pass
 * whatever rows they already fetched; this function does not itself touch the database.
 *
 * @param {{
 *   memberProfile?: { org_type?: string|null, role?: string|null, sector?: string|null,
 *     region?: string|null, verified?: boolean|null, default_anonymous?: boolean|null } | null,
 *   name?: string|null,
 *   company?: string|null,
 *   postAnonymous?: boolean|null,
 * }} args
 * @returns {ReturnType<typeof projectAuthorIdentity>}
 */
export function buildAuthorIdentityForRender({ memberProfile, name, company, postAnonymous } = {}) {
  const anonymous = resolveEffectiveAnonymous({
    postAnonymous,
    profileDefaultAnonymous: memberProfile?.default_anonymous,
  });
  return projectAuthorIdentity({
    org_type: memberProfile?.org_type ?? null,
    role: memberProfile?.role ?? null,
    sector: memberProfile?.sector ?? null,
    region: memberProfile?.region ?? null,
    verified: memberProfile?.verified ?? false,
    name: name ?? null,
    company: company ?? null,
    anonymous,
  });
}

// ── SEC-5 (migration 372, 2026-10-08): who may read which profile columns ───────────────────────────────────
// After migration 372 a signed-in user can read the profile ROW of themselves and of members of an organisation
// they belong to, never email, and no one but the service role reads another organisation's row. Community has to
// show an author from ANY organisation, so every cross-organisation identity read goes through the SECURITY DEFINER
// RPC community_identity(p_ids, p_query), which applies the PER-USER half of R8.7 in SQL (default_anonymous withholds
// name, company and avatar; verified stays) and never returns email or is_platform_admin. The PER-POST half
// (community_posts.anonymous) is applied here, at the row, by the routes: one rule in each place, no third copy.
// An own-row read of the two columns the browser may no longer select (email) goes through my_profile().
// Both helpers take an injected client (anything with .rpc), so they are proven on fixtures with no database.

/**
 * One row of the community_identity RPC (migration 372). The per-user half of R8.7 is already applied: a
 * default-anonymous member arrives with display_name, company_name and avatar_url null and anonymous true;
 * verified is never withheld. Never carries email or is_platform_admin.
 * @typedef {{
 *   user_id: string,
 *   display_name: string|null,
 *   company_name: string|null,
 *   job_title: string|null,
 *   region: string|null,
 *   avatar_url: string|null,
 *   verified: boolean,
 *   anonymous: boolean,
 * }} CommunityIdentityRow
 */

export const COMMUNITY_IDENTITY_RPC = "community_identity";
export const MY_PROFILE_RPC = "my_profile";
/** The RPC returns at most this many rows per call (migration 372 slices p_ids to it); larger sets go in chunks. */
export const IDENTITY_IDS_PER_CALL = 200;

/**
 * Per-post OR per-user anonymity, resolved at the row. The RPC already withholds a default-anonymous user's name,
 * company and avatar and says so in `anonymous`; a post flagged anonymous withholds them too. Either one is enough.
 *
 * @param {{ postAnonymous?: boolean|null, identity?: { anonymous?: boolean|null } | null }} args
 * @returns {boolean}
 */
export function effectiveAnonymous({ postAnonymous, identity } = {}) {
  return postAnonymous === true || identity?.anonymous === true;
}

/**
 * The legacy `author` block of a post or reply ({ user_id, name, headshot_url }) built from a community_identity
 * row, with per-post anonymity applied. An anonymous author keeps the block (so the row still has an author) with
 * name and headshot null; the verified marker travels separately, in author_identity. Returns null when there is no
 * author or no identity row (a deleted author), never a stand-in.
 *
 * @param {{ authorUserId?: string|null, identity?: { user_id: string, display_name?: string|null, avatar_url?: string|null, anonymous?: boolean|null } | null, postAnonymous?: boolean|null }} args
 * @returns {{ user_id: string, name: string|null, headshot_url: string|null } | null}
 */
export function authorBlockForPost({ authorUserId, identity, postAnonymous } = {}) {
  if (!authorUserId || !identity) return null;
  const anonymous = effectiveAnonymous({ postAnonymous, identity });
  return {
    user_id: identity.user_id ?? authorUserId,
    name: anonymous ? null : identity.display_name ?? null,
    headshot_url: anonymous ? null : identity.avatar_url ?? null,
  };
}

/**
 * Cross-organisation identities through community_identity. Pass ids (a post page's authors, a roster) and/or a name
 * name query (search, invite candidates: the start of any token of the name). Never throws: an RPC error returns an empty map and the message, so a
 * feed degrades to "no author" rather than failing. Ids are deduplicated and sent in chunks of IDENTITY_IDS_PER_CALL.
 *
 * @param {any} supabase  a Supabase client (anything with .rpc)
 * @param {Array<string|null|undefined>|null} ids
 * @param {string|null} [query]
 * @returns {Promise<{ byId: Map<string, CommunityIdentityRow>, rows: CommunityIdentityRow[], error: string|null }>}
 */
export async function loadCommunityIdentities(supabase, ids, query = null) {
  /** @type {Map<string, CommunityIdentityRow>} */
  const byId = new Map();
  /** @type {CommunityIdentityRow[]} */
  const rows = [];
  const wanted = Array.isArray(ids) ? Array.from(new Set(ids.filter(Boolean))) : null;
  const hasQuery = typeof query === "string" && query.trim().length > 0;
  if ((!wanted || wanted.length === 0) && !hasQuery) return { byId, rows, error: null };

  const chunks = [];
  if (wanted && wanted.length > 0) {
    for (let i = 0; i < wanted.length; i += IDENTITY_IDS_PER_CALL) chunks.push(wanted.slice(i, i + IDENTITY_IDS_PER_CALL));
  } else {
    chunks.push(null);
  }
  for (const chunk of chunks) {
    const { data, error } = await supabase.rpc(COMMUNITY_IDENTITY_RPC, { p_ids: chunk, p_query: hasQuery ? query : null });
    if (error) return { byId: new Map(), rows: [], error: error.message };
    for (const r of Array.isArray(data) ? data : []) {
      rows.push(r);
      byId.set(r.user_id, r);
    }
  }
  return { byId, rows, error: null };
}

/**
 * The caller's own full profile row (email and is_platform_admin included) through my_profile(), the only own-row
 * path to the columns migration 372 removed from the direct column grant. Null when the RPC returns no row.
 *
 * @param {any} supabase  a Supabase client (anything with .rpc)
 * @returns {Promise<{ profile: any|null, error: string|null }>}
 */
export async function loadMyProfile(supabase) {
  const { data, error } = await supabase.rpc(MY_PROFILE_RPC);
  if (error) return { profile: null, error: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  return { profile: row ?? null, error: null };
}
