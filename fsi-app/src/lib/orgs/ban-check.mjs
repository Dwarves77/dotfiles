// src/lib/orgs/ban-check.mjs
//
// Shared org-scoped ban lookup — the app-side half of the ban re-join block
// (Wave-α Track D d2). Both the members-route add-by-email path and any future
// membership-add caller route through here so the check is written ONCE and is
// unit-testable in isolation. The DB-side backstop (migration 191 trigger +
// migration 156 accept_invitation guard) covers the paths that never reach
// this function; this is the friendly-error front door.
//
// Returns a discriminated result so the HTTP caller maps to a status without
// re-deriving the decision:
//   { status: "ok" }               — no ban row; the add may proceed
//   { status: "banned" }           — a ban row exists; caller returns 403
//   { status: "error", message }   — the lookup failed; caller returns 500 (fail-closed)

/**
 * @param {{ from: (t: string) => any }} service  service-role Supabase client
 * @param {string} orgId
 * @param {string} userId
 * @returns {Promise<{status:"ok"}|{status:"banned"}|{status:"error",message:string}>}
 */
export async function checkOrgBan(service, orgId, userId) {
  const { data, error } = await service
    .from("org_member_bans")
    .select("user_id")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return { status: "error", message: error.message };
  return data ? { status: "banned" } : { status: "ok" };
}
